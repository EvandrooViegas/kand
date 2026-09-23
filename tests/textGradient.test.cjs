const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const { buildTextGradientCss, textGradientStyle } = vm.runInNewContext(read('lib/textGradient.js').replace(/export /g, '') + '\n({buildTextGradientCss,textGradientStyle})')
const { parseStyledText, buildSatoriTextLines } = vm.runInNewContext(read('lib/styleParser.js').replace(/export /g, '') + '\n({parseStyledText,buildSatoriTextLines})')

test('normalizes stops without mutating them and preserves transparency', () => {
  const stops = [{ color: '#fff', position: 100, alpha: 0 }, { color: '#f00', position: 0, alpha: 50 }]
  const css = buildTextGradientCss({ stops, angle: 180, spread: 50 })
  assert.equal(css, 'linear-gradient(180deg, rgba(255,0,0,0.5) 0%, rgba(255,255,255,0) 50%)')
  assert.equal(stops[0].position, 100)
  assert.equal(Object.keys(textGradientStyle({ color: '#123456' })).length, 0)
})

test('repeat and reflect produce distinct cycles', () => {
  const options = { spread: 50, stops: [{ color: '#f00', position: 0 }, { color: '#00f', position: 100 }] }
  assert.match(buildTextGradientCss({ ...options, spreadMethod: 'repeat' }), /rgba\(0,0,255,1\) 50%, rgba\(255,0,0,1\) 50%/)
  assert.match(buildTextGradientCss({ ...options, spreadMethod: 'reflect' }), /rgba\(0,0,255,1\) 50%, rgba\(0,0,255,1\) 50%/)
})

test('PNG export preserves word spacing on both sides of highlighted text', async () => {
  const satori = require('satori').default, { Resvg } = require('@resvg/resvg-js'), sharp = require('sharp')
  const fonts = [{ name: 'Inter', data: fs.readFileSync(path.join(__dirname, '../public/fonts/Inter-Regular.ttf')), weight: 400 }]
  const lastInkColumn = async text => {
    const classes = { highlight: { color: '#123456' } }
    const svg = await satori({ type: 'div', props: { style: { width: 700, height: 100, display: 'flex', fontFamily: 'Inter', fontSize: 60 }, children: buildSatoriTextLines(parseStyledText(text, classes), classes) } }, { width: 700, height: 100, fonts })
    const pixels = await sharp(new Resvg(svg).render().asPng()).ensureAlpha().raw().toBuffer()
    let last = 0
    for (let y = 0; y < 100; y++) for (let x = 0; x < 700; x++) if (pixels[(y * 700 + x) * 4 + 3]) last = Math.max(last, x)
    return last
  }
  const joined = await lastInkColumn('One<%kind:highlight:clear%>step')
  const spaced = await lastInkColumn('One <%kind:highlight:clear%> step')
  assert.ok(spaced - joined >= 24, `Expected two visible spaces; observed only ${spaced - joined}px`)
})

test('exports multiline gradient glyphs with transparent surroundings in every spread mode', async () => {
  const satori = require('satori').default
  const { Resvg } = require('@resvg/resvg-js')
  const sharp = require('sharp')
  const fonts = [{ name: 'Inter', data: fs.readFileSync(path.join(__dirname, '../public/fonts/Inter-Regular.ttf')), weight: 400 }]
  for (const gradientType of ['linear', 'radial']) {
    for (const spreadMethod of ['pad', 'repeat', 'reflect']) {
      const svg = await satori({ type: 'div', props: {
        style: { width: 400, height: 180, display: 'flex', flexDirection: 'column', fontSize: 55, ...textGradientStyle({ fillType: 'gradient', textGradient: { gradientType, spreadMethod, spread: 30 } }, false) },
        children: buildSatoriTextLines(parseStyledText('Gradient\ntext'), {}, {}),
      } }, { width: 400, height: 180, fonts })
      const pixels = await sharp(new Resvg(svg).render().asPng()).ensureAlpha().raw().toBuffer()
      let visible = 0
      const colors = new Set()
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 0) visible++
        if (pixels[i + 3] === 255) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`)
      }
      assert.ok(visible > 500 && visible < 20000, `${gradientType}/${spreadMethod} must paint glyphs only`)
      assert.ok(colors.size > 10, `${gradientType}/${spreadMethod} must contain a gradient`)
    }
  }
})
