export const DESIGN_TYPE_LABELS = { cutout: 'AI cutout', background: 'Background photo', none: 'No images' }
export function variantsForImagery(family: any, imagery: string) {
  return family.identityVersion === 1 ? family.variants.filter((v: any) => v.imagery === imagery) : getDesignType(family) === imagery ? family.variants : []
}
export function designTypeLabel(family: any) {
  return family.identityVersion === 1 ? 'AI cutout · Background photo · No images' : DESIGN_TYPE_LABELS[getDesignType(family)]
}
export function getDesignType(family: any): 'cutout' | 'background' | 'none' {
  if (['cutout', 'background', 'none'].includes(family?.designType)) return family.designType
  const images = (family?.variants || []).flatMap((v: any) => v.nodes || []).filter((n: any) => n.type === 'image' && n.src === '{{image.primary}}')
  if (!images.length) return 'none'
  if (images.some((n: any) => n.imageType === 'cutout')) return 'cutout'
  if (images.some((n: any) => n.imageType === 'background' || (n.width >= family.width * .9 && n.height >= family.height * .9))) return 'background'
  return images.some((n: any) => n.objectFit === 'contain') ? 'cutout' : 'background'
}
export function normalizeImagery(value: any): 'cutout' | 'background' | 'none' {
  return value === 'framed' || value === 'background' ? 'background' : value === 'none' ? 'none' : 'cutout'
}
