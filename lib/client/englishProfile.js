const requests = new Map()

// Coalesce duplicate mounts; a saved English profile never needs another translation.
export function loadEnglishProfile(flowId, brand) {
  if (brand?.profileLanguage === 'en' || !brand?.about) return Promise.resolve(brand)
  if (!requests.has(flowId)) {
    const request = fetch('/api/translate-business-profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flowId }),
    }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'Could not translate the business profile')
      return data.brandContext
    }).finally(() => requests.delete(flowId))
    requests.set(flowId, request)
  }
  return requests.get(flowId)
}
