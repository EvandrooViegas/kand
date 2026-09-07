import sharp from 'sharp'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_BYTES = 2 * 1024 * 1024

/** Only public image URLs; redirects are checked before following them. */
async function publicUrl(value: string): Promise<URL> {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported logo URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => {
    // Conservatively decline IPv6, including IPv4-mapped private addresses.
    if (isIP(address) !== 4) return true
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  })) throw new Error('Non-public logo URL')
  return url
}

async function downloadLogo(src: string): Promise<Buffer> {
  let target = src
  const signal = AbortSignal.timeout(4000)
  for (let hop = 0; hop < 4; hop++) {
    const url = await publicUrl(target)
    const response = await fetch(url, { redirect: 'manual', signal })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      target = new URL(response.headers.get('location') || '', url).href
      continue
    }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || !response.body) {
      await response.body?.cancel()
      throw new Error('Invalid logo response')
    }
    const reader = response.body.getReader(), chunks: Buffer[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_BYTES) throw new Error('Logo too large')
        chunks.push(Buffer.from(value))
      }
    } finally { await reader.cancel() }
    return Buffer.concat(chunks)
  }
  throw new Error('Too many redirects')
}

export interface PreparedLogo { src: string; foreground: string; removed: boolean }

/** Remove only near-white, edge-connected backgrounds. Enclosed white details remain intact. */
export async function removeFlatLogoBackground(input: Buffer): Promise<PreparedLogo | null> {
  const { data, info } = await sharp(input, { limitInputPixels: 4000000 }).rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info, count = width * height
  if (width < 8 || height < 8) return null
  // Existing transparency needs no background removal.
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return null
  const white = (i: number) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 235 &&
    Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) <= 12
  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1)
  if (border.filter(white).length / border.length < .85) return null
  const seen = new Uint8Array(count), queue = new Int32Array(count)
  let head = 0, tail = 0
  const visit = (i: number) => { if (!seen[i] && white(i)) { seen[i] = 1; queue[tail++] = i } }
  border.forEach(visit)
  while (head < tail) {
    const i = queue[head++], x = i % width
    if (x) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (i >= width) visit(i - width)
    if (i < count - width) visit(i + width)
  }
  if (tail / count < .15 || tail / count > .95) return null
  let r = 0, g = 0, b = 0, ink = 0
  for (let i = 0; i < count; i++) {
    if (seen[i]) data[i * 4 + 3] = 0
    else if (!white(i)) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; ink++ }
  }
  if (!ink) return null
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
  return { src: `data:image/png;base64,${png.toString('base64')}`, foreground: '#' + [r,g,b].map(c => Math.round(c / ink).toString(16).padStart(2, '0')).join(''), removed: true }
}

/** Best effort, once per generation; failures never prevent canvas creation. */
export async function prepareLogo(src: string): Promise<PreparedLogo | null> {
  try { return await removeFlatLogoBackground(await downloadLogo(src)) }
  catch { return null }
}

export async function containPreparedLogo(logo: PreparedLogo, width: number, height: number): Promise<string> {
  const png = await sharp(Buffer.from(logo.src.split(',')[1], 'base64'))
    .resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), { fit: 'contain', background: '#00000000' }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}
