const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const puppeteer = (await import('puppeteer')).default
  const browser = await puppeteer.launch({ headless: true, ...(process.env.DESIGN_TEST_BROWSER ? { executablePath: process.env.DESIGN_TEST_BROWSER } : {}) })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message) })
  page.on('requestfailed', request => console.error('Request failed:', request.url().slice(0, 160), request.failure()?.errorText))
  const base = process.env.DESIGN_TEST_URL || 'http://localhost:3100'
  const output = process.env.DESIGN_TEST_OUTPUT || process.cwd()
  const call = (url, method = 'GET', body) => page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    return { status: response.status, data: await response.json() }
  }, { url: '/api' + url, method, body })
  let flowId, draftId, editorId, postId, renderId
  try {
    await page.setViewport({ width: 1440, height: 1100 })
    await page.goto(base + '/design-library', { waitUntil: 'networkidle2', timeout: 120000 })
    console.log('Page opened')
    await page.waitForFunction(() => document.body.innerText.includes('Momentum Timeline'), { timeout: 45000 })
    console.log('Library loaded')
    assert.equal((await call('/global-designs?admin=1')).status, 401)
    const list = await call('/global-designs')
    assert.equal(list.status, 200)
    const seeds = list.data.filter(f => ['momentum-timeline', 'highlight-editorial', 'serif-escape'].includes(f.id))
    assert.equal(seeds.length, 3)
    await page.screenshot({ path: path.join(output, 'global-library-desktop.png'), fullPage: true })
    await page.setViewport({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(output, 'global-library-mobile.png'), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))

    const login = await call('/global-designs/session', 'POST', { key: process.env.DESIGN_TEST_ADMIN_KEY || 'local-design-review' })
    assert.equal(login.status, 200)
    const id = 'review-' + Date.now()
    const draft = { ...seeds.find(f => f.id === 'highlight-editorial'), id, name: 'Temporary design QA' }
    const saved = await call('/global-designs', 'POST', draft)
    assert.equal(saved.status, 200, JSON.stringify(saved.data)); draftId = id
    const editing = await call(`/global-designs/${id}/editor`, 'POST', { variantId: 'cover' })
    assert.equal(editing.status, 200); editorId = editing.data.id
    const original = editing.data.nodes.find(n => n.id === 'headline')
    original.x += 8
    assert.equal((await call('/canvases/' + editorId, 'PUT', editing.data)).status, 200)
    const applied = await call(`/global-designs/${id}/apply-editor`, 'POST', { canvasId: editorId })
    assert.equal(applied.status, 200, JSON.stringify(applied.data))
    assert.equal(applied.data.draft.variants[0].nodes.find(n => n.id === 'headline').x, original.x)
    assert.equal(applied.data.draft.variants[0].nodes.find(n => n.id === 'headline').text, '{{headline}}')
    const stale = await call(`/global-designs/${id}/apply-editor`, 'POST', { canvasId: editorId })
    assert.equal(stale.status, 409)
    const published = await call(`/global-designs/${id}/publish`, 'POST', { revision: applied.data.revision })
    assert.equal(published.status, 200)

    const flow = await call('/flows', 'POST', { name: 'Temporary Global Design QA', brandContext: { name: 'QA Brand', colors: ['#18284a', '#ffffff', '#f3cb4a'], fonts: ['Inter'], profileLanguage: 'en' } })
    assert.equal(flow.status, 200); flowId = flow.data.id
    const selected = await call('/brand-designs', 'POST', { flowId, familyIds: seeds.map(f => f.id) })
    assert.equal(selected.status, 200)
    assert.equal((await call('/brand-designs', 'POST', { flowId, familyIds: [seeds[0].id] })).status, 400)
    const copy = { format: 'carousel', slides: [{ headline: 'Build better habits' }, { headline: 'One clear step', body: 'Choose one action you can take today.', purpose: 'content' }, { headline: 'Start today', body: 'Progress starts with a clear decision.', cta: 'Explore more' }] }
    const layout = await call('/plan-assets', 'POST', { phase: 'canvas', brandContext: { id: flowId }, copy, idea: { id: 'qa' }, designId: 'global-highlight-editorial' })
    assert.equal(layout.status, 200, JSON.stringify(layout.data)); assert.equal(layout.data.height, 1350)
    const canvas = await call('/design-canvas', 'POST', { brandContext: { id: flowId }, copy, resolvedPlan: { format: 'carousel', designId: layout.data.designId, layoutPlan: layout.data, slots: layout.data.slots.map(s => ({ slot_id: s.slot_id, needs_visual: false, resolvedAsset: null })) } })
    assert.equal(canvas.status, 200, JSON.stringify(canvas.data)); postId = canvas.data.id
    assert.deepEqual(canvas.data.pages.map(p => p.globalVariantId), ['cover', 'content', 'cta'])
    const rendered = await call('/render', 'POST', { canvas_id: postId })
    assert.equal(rendered.status, 200, JSON.stringify(rendered.data)); renderId = rendered.data.render_id
    assert.ok(rendered.data.pages.every(p => !p.error), JSON.stringify(rendered.data.pages))
    const archive = await fetch(base + '/api/rendered/' + renderId + '.zip')
    assert.equal(archive.status, 200)
    const zip = await require('jszip').loadAsync(Buffer.from(await archive.arrayBuffer()))
    let pageNumber = 0
    for (const entry of Object.values(zip.files)) if (!entry.dir) require('node:fs').writeFileSync(path.join(output, `global-carousel-${pageNumber++}.png`), await entry.async('nodebuffer'))
    await page.setViewport({ width: 1440, height: 1100 })
    await page.goto(base + `/flow/${flowId}/brand-information`, { waitUntil: 'networkidle2', timeout: 120000 })
    await page.waitForSelector('[role="tab"]', { timeout: 120000 })
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find(e => e.textContent === 'Post design').click())
    await page.waitForFunction(() => document.body.innerText.includes('3 selected'), { timeout: 120000 })
    await page.evaluate(() => [...document.querySelectorAll('h3')].find(e => e.textContent === 'Your brand designs').scrollIntoView({ block: 'start' }))
    await new Promise(resolve => setTimeout(resolve, 700))
    await page.screenshot({ path: path.join(output, 'brand-global-designs.png'), fullPage: true })
    await page.goto(base + `/editor/${editorId}`, { waitUntil: 'networkidle2', timeout: 120000 })
    await page.waitForFunction(() => document.body.innerText.includes('Editing a Global Design draft'), { timeout: 120000 })
    await page.screenshot({ path: path.join(output, 'global-template-editor.png'), fullPage: true })
    assert.equal(errors.length, 0, errors.join('\n'))
    console.log('PASS: library desktop/mobile, admin authorization, draft/editor/publish, 3-design selection, editable carousel generation and PNG exports')
  } catch (error) {
    console.error('Page text:', await page.evaluate(() => (document.body?.innerText || '').slice(0, 2000)).catch(() => 'Unavailable'))
    await page.screenshot({ path: path.join(output, 'global-library-failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally {
    if (flowId) await call('/flows/' + flowId, 'DELETE')
    if (postId) await call('/canvases/' + postId, 'DELETE')
    if (renderId) await call('/renders/' + renderId, 'DELETE')
    if (editorId) await call('/canvases/' + editorId, 'DELETE')
    if (draftId) { const record = await call('/global-designs/' + draftId); if (record.status === 200) await call('/global-designs/' + draftId, 'DELETE', { revision: record.data.revision }) }
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
