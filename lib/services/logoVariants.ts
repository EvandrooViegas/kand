import sharp from 'sharp'
import { downloadLogo } from './logoBackground'

export async function generateLogoVariants(source: string) {
  const input = source.startsWith('data:image/') && source.length < 8 * 1024 * 1024
    ? Buffer.from(source.split(',')[1], 'base64') : await downloadLogo(source)
  return { source, ...await createLogoVariants(input) }
}

/** Flood-fill a uniform border, preserving enclosed details and existing alpha. */
export async function createLogoVariants(input: Buffer) {
  const { data, info } = await sharp(input, { limitInputPixels: 4000000 }).rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info, count = width * height
  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1)
  if (!border.some(i => data[i * 4 + 3] < 250)) {
    const distance = (i: number, j: number) => Math.max(...[0, 1, 2].map(c => Math.abs(data[i * 4 + c] - data[j * 4 + c])))
    const seed = [0, width - 1, (height - 1) * width, count - 1].find(i => border.filter(j => distance(i, j) < 24).length / border.length >= .85)
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
  const encode = async (pixels: Buffer, background?: string) => {
    let image = sharp(pixels, { raw: { width, height, channels: 4 } })
    if (background) image = image.flatten({ background })
    return 'data:image/png;base64,' + (await image.png().toBuffer()).toString('base64')
  }
  const black = Buffer.from(data), white = Buffer.from(data)
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) { black[i + c] = 0; white[i + c] = 255 }
  return {
    originalTransparent: await encode(data), blackTransparent: await encode(black), whiteTransparent: await encode(white),
    blackOnWhite: await encode(black, '#ffffff'), whiteOnBlack: await encode(white, '#000000'),
    originalOnWhite: await encode(data, '#ffffff'), originalOnBlack: await encode(data, '#000000'),
  }
}
