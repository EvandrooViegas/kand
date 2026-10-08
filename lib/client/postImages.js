// Photos the user attaches to a post idea, from the browser side.

export const MAX_POST_IMAGES = 4
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIDE = 2048
const MAX_FILE_BYTES = 30 * 1024 * 1024

/** Images among dropped or pasted files. */
export function imageFiles(list) {
  return Array.from(list || []).filter(file => file && file.type?.startsWith('image/'))
}

/**
 * Downscales a photo in the browser so phone photos upload quickly, applying its EXIF rotation.
 * PNGs stay PNG to keep transparency; everything else becomes JPEG.
 */
export async function preparePhoto(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(`${file.name}: use a JPEG, PNG or WebP photo`)
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is too large (max 30 MB)`)
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88)
}

/** Uploads one photo; the server reads it and returns the stored asset with its description. */
export async function uploadPostImage(file, brandId) {
  const data = await preparePhoto(file)
  const res = await fetch('/api/post-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, filename: file.name, brand_id: brandId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Upload failed')
  return json
}

/** Deletes a photo that was removed before any post used it. Best effort. */
export function discardPostImage(id, brandId) {
  return fetch(`/api/post-images/${encodeURIComponent(id)}?brand_id=${encodeURIComponent(brandId)}`, { method: 'DELETE' }).catch(() => {})
}
