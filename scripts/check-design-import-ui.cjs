// Local browser regression: every design API response is mocked; no vision requests are sent.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')

async function main() {
  const source = fs.readFileSync('lib/designs/global/seeds.ts', 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
  const seeds = new Function(stripTypeScriptTypes(source, { mode: 'transform' }) + '; return INITIAL_GLOBAL_FAMILIES')()
  const family = { ...seeds[0], id: 'mock-import', name: 'Copper Diamond Rhythm', referenceStyle: { primary: '#ed5125', secondary: '#101327', accent: '#ffe05b', background: '#ffffff', textPrimary: '#101327' } }
  const record = { id: family.id, draft: family, revision: 1, status: 'draft' }
  const puppeteer = (await import('puppeteer')).default
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.DESIGN_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  try {
    const page = await browser.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    const base = process.env.DESIGN_TEST_URL || 'http://localhost:3100'
    let uploads = 0, analyses = 0, saved = false
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.origin !== base) return request.abort()
      if (!url.pathname.startsWith('/api/global-designs')) return request.continue()
      let data
      if (url.pathname.endsWith('/session')) data = { admin: true, configured: true }
      else if (url.pathname.endsWith('/references')) data = family.referenceImages[uploads++ % 2]
      else if (url.pathname.endsWith('/analyze')) {
        const body = JSON.parse(request.postData())
        assert.equal(body.name, undefined)
        assert.equal(body.referenceImages.length, 2)
        analyses++; data = family
      } else if (request.method() === 'POST') { saved = true; data = record }
      else if (url.searchParams.has('admin')) data = saved ? [record] : []
      else data = seeds
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const click = async label => {
      await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.textContent === label && !b.disabled), {}, label)
      await page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent === label).click(), label)
    }
    await page.setViewport({ width: 1440, height: 1100 })
    await page.goto(base + '/design-library', { waitUntil: 'networkidle2', timeout: 120000 })
    await click('Add design')
    assert.equal(await page.$('[aria-label="New design family name"]'), null)
    const input = await page.$('input[type=file]')
    await input.uploadFile(path.resolve('public/design-references/1.png'), path.resolve('public/design-references/2.png'))
    await click('Analyze and create draft')
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(el => el.value === 'Copper Diamond Rhythm'))
    assert.equal(analyses, 1)
    await click('Rebuild from references')
    await page.waitForFunction(() => document.body.innerText.includes('Reconstructed with the improved importer'))
    assert.equal(analyses, 2)
    assert.deepEqual(errors, [])
    if (process.env.DESIGN_TEST_OUTPUT) await page.screenshot({ path: path.join(process.env.DESIGN_TEST_OUTPUT, 'automatic-design-import.png'), fullPage: true })
    console.log('PASS: upload without a name, automatic draft naming, reference rebuild, and editable pattern preview (mocked API; no vision transmission)')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
