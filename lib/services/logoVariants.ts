import sharp from 'sharp'
import { downloadLogo } from './logoBackground'

export async function generateLogoVariants(source: string) {
  let input: Buffer
  if (source.startsWith('data:image/')) {
    if (source.length > 8 * 1024 * 1024) throw new Error('Logo image is too large')
    const comma = source.indexOf(',')
    if (comma < 0) throw new Error('Invalid logo data URL')
    input = /;base64/i.test(source.slice(0,comma)) ? Buffer.from(source.slice(comma+1),'base64') : Buffer.from(decodeURIComponent(source.slice(comma+1)),'utf8')
  } else input = await downloadLogo(source)
  return { source, ...await createLogoVariants(input) }
}

/** Decode ICO containers before passing their pixels to Sharp. */
async function normalizeLogo(input: Buffer): Promise<Buffer> {
  if (input.length < 6 || input.readUInt32LE(0) !== 0x10000) return input
  const count = input.readUInt16LE(4)
  if (!count || count > 256 || input.length < 6+count*16) throw new Error('Invalid ICO logo')
  const entries = Array.from({length:count},(_,i)=>{
    const at=6+i*16
    return {width:input[at]||256,height:input[at+1]||256,size:input.readUInt32LE(at+8),offset:input.readUInt32LE(at+12)}
  }).sort((a,b)=>b.width*b.height-a.width*a.height)
  for (const entry of entries) {
    if (entry.offset < 6+count*16 || entry.offset+entry.size > input.length) continue
    const data=input.subarray(entry.offset,entry.offset+entry.size)
    if (data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return data
    if (data.length<40 || data.readUInt32LE(0)!==40 || data.readUInt16LE(14)!==32 || data.readUInt32LE(16)!==0) continue
    const w=data.readInt32LE(4),h=data.readInt32LE(8)/2
    if(w!==entry.width || h!==entry.height || 40+w*h*4>data.length) continue
    const pixels=Buffer.alloc(w*h*4)
    let hasAlpha=false
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const from=40+((h-1-y)*w+x)*4,to=(y*w+x)*4
      pixels[to]=data[from+2];pixels[to+1]=data[from+1];pixels[to+2]=data[from];pixels[to+3]=data[from+3]
      if(data[from+3])hasAlpha=true
    }
    const mask=40+w*h*4,stride=Math.ceil(w/32)*4
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const at=mask+(h-1-y)*stride+(x>>3),to=(y*w+x)*4+3
      if(!hasAlpha)pixels[to]=255
      if(at<data.length && (data[at] & (128>>(x%8))))pixels[to]=0
    }
    return sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer()
  }
  throw new Error('This favicon encoding is unsupported. Use a PNG, SVG or WebP brand logo.')
}

/** Flood-fill a uniform border, preserving enclosed details and existing alpha. */
export async function createLogoVariants(input: Buffer) {
  const { data, info } = await sharp(await normalizeLogo(input), { limitInputPixels: 4000000 }).rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info, count = width * height
  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1)
  const opaqueCoverage=Array.from({length:count},(_,i)=>data[i*4+3]>=250?1:0).reduce((a,b)=>a+b,0)/count
  // A few transparent corner pixels do not make an otherwise solid logo transparent.
  if (!border.some(i => data[i * 4 + 3] < 250) || opaqueCoverage>.94) {
    const distance = (i: number, j: number) => Math.max(...[0, 1, 2].map(c => Math.abs(data[i * 4 + c] - data[j * 4 + c])))
    const seed = border.find(i => data[i*4+3]>=250 && border.filter(j => data[j*4+3]>=250&&distance(i, j) < 24).length / border.length >= .55)
    if (seed === undefined) throw new Error('Use a logo with transparency or a uniform background to generate variants.')
    const seen = new Uint8Array(count), queue = new Int32Array(count)
    let head = 0, tail = 0
    const visit = (i: number) => { if (!seen[i] && distance(seed, i) < 32) { seen[i] = 1; queue[tail++] = i } }
    border.forEach(visit)
    while (head < tail) {
      const i = queue[head++], x = i % width
      if (x) visit(i - 1)
      if (x < width - 1) visit(i + 1)
      if (i >= width) visit(i - width)
      if (i < count - width) visit(i + width)
    }
    for (let i = 0; i < count; i++) if (seen[i]) data[i * 4 + 3] = 0
  }
  if (!data.some((v, i) => i % 4 === 3 && v > 0)) throw new Error('No visible logo found.')
  // Variants are cropped to the visible mark: padding inside a logo file would make it look small and misaligned.
  let crop: { left: number; top: number; width: number; height: number } | null = null
  const encode = async (pixels: Buffer, background?: string) => {
    let image = sharp(pixels, { raw: { width, height, channels: 4 } })
    if (crop) image = sharp(await image.extract(crop).png().toBuffer())
    if (background) image = image.flatten({ background })
    return 'data:image/png;base64,' + (await image.png().toBuffer()).toString('base64')
  }
  const black = Buffer.from(data), white = Buffer.from(data)
  // A dark/light badge with contrasting lettering must not become one solid silhouette.
  // Keep the original artwork; extract its contrasting ink only for monochrome variants.
  let dark = 0, light = 0, opaque = 0
  for (let i=0;i<data.length;i+=4) {
    if (data[i+3]<220) continue
    opaque++
    const lo=Math.min(data[i],data[i+1],data[i+2]), hi=Math.max(data[i],data[i+1],data[i+2])
    if(hi-lo>35) continue
    if(hi<65) dark++
    if(lo>190) light++
  }
  const darkBadge = opaque/count>.45 && dark/opaque>.65 && light/opaque>.02 && light/opaque<.3
  const lightBadge = opaque/count>.45 && light/opaque>.65 && dark/opaque>.02 && dark/opaque<.3
  if(darkBadge || lightBadge) {
    for(let i=0;i<data.length;i+=4) {
      const luminance=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255
      const ink=darkBadge?luminance:1-luminance
      black[i+3]=white[i+3]=Math.round(data[i+3]*ink)
    }
  }
  // Validate the extracted mark, not the badge before its background is removed.
  const markCoverage=Array.from({length:count},(_,i)=>black[i*4+3]>220?1:0).reduce((a,b)=>a+b,0)/count
  if(markCoverage>.94)throw new Error('Logo artwork could not be separated from its background.')
  // Relative luminance of the original artwork's ink, so a layout can tell whether it reads on a given surface.
  let inkSum = 0, inkCount = 0
  // The visible mark's box. Variants are cropped to it, so `bounds` (where the mark sits in the stored file) is the
  // whole image and `imageAspect` is the mark's own proportion.
  let left = width, top = height, right = -1, bottom = -1
  for (let i = 0; i < count; i++) if (data[i * 4 + 3] > 12) {
    const x = i % width, y = Math.floor(i / width)
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y
  }
  const round = (v: number) => Math.round(v * 10000) / 10000
  if (right >= 0) crop = { left, top, width: right - left + 1, height: bottom - top + 1 }
  const bounds = { x: 0, y: 0, width: 1, height: 1 }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const [r, g, b] = [0, 1, 2].map(c => { const v = data[i + c] / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 })
    inkSum += r * .2126 + g * .7152 + b * .0722; inkCount++
  }
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) { black[i + c] = 0; white[i + c] = 255 }
  return {
    inkLightness: inkCount ? Math.round(inkSum / inkCount * 1000) / 1000 : null, imageAspect: round(crop ? crop.width / crop.height : width / height), bounds,
    originalTransparent: await encode(data), blackTransparent: await encode(black), whiteTransparent: await encode(white),
    blackOnWhite: await encode(black, '#ffffff'), whiteOnBlack: await encode(white, '#000000'),
    originalOnWhite: await encode(data, '#ffffff'), originalOnBlack: await encode(data, '#000000'),
  }
}
