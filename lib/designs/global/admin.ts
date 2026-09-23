import { createHmac, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE = 'kand-design-admin'
const equal = (a: string, b: string) => { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb) }
export function adminConfigured() { return Boolean(process.env.GLOBAL_DESIGN_ADMIN_KEY) }
export function validAdminKey(key: unknown) { return typeof key === 'string' && !!process.env.GLOBAL_DESIGN_ADMIN_KEY && equal(key, process.env.GLOBAL_DESIGN_ADMIN_KEY) }
export function adminSession() {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000)
  return `${expires}.${createHmac('sha256', process.env.GLOBAL_DESIGN_ADMIN_KEY!).update(expires).digest('hex')}`
}
export function isDesignAdmin(request: Request) {
  const key = process.env.GLOBAL_DESIGN_ADMIN_KEY
  if (!key) return false
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(ADMIN_COOKIE + '='))?.slice(ADMIN_COOKIE.length + 1)
  const [expires, signature] = (token || '').split('.')
  return !!expires && Number(expires) > Date.now() && !!signature && equal(signature, createHmac('sha256', key).update(expires).digest('hex'))
}
export function requireDesignAdmin(request: Request) {
  if (!isDesignAdmin(request)) throw Object.assign(new Error('Admin sign-in is required.'), { status: 401 })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) throw Object.assign(new Error('Invalid request origin.'), { status: 403 })
}
