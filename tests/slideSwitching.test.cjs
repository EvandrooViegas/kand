const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const manager = fs.readFileSync('app/carousel/[id]/page.js', 'utf8')
const editor = fs.readFileSync('app/editor/[id]/page.js', 'utf8')
const origin = 'https://kand.test'

function handlerFrom(source, start, context) {
  const offset = source.indexOf(start)
  const end = source.indexOf("    window.addEventListener('message', handler)", offset)
  return vm.runInNewContext(source.slice(offset, end) + '\nhandler', context)
}

function setup() {
  const toEditor = [], toParent = []
  const frame = { postMessage: message => toEditor.push(message) }
  const parentWindow = { postMessage: message => toParent.push(message) }
  const parent = {
    id: 'post', window: { location: { origin } },
    iframeRef: { current: { contentWindow: frame } },
    selectedPageRef: { current: 'a' },
    canvasRef: { current: { id: 'post', width: 1080, pages: [
      { id: 'a', name: 'First', nodes: [{ text: 'original' }] },
      { id: 'b', name: 'Second', nodes: [{ text: 'second' }] },
    ] } },
    slideSnapshots: { current: {} }, savedStr: { current: '' },
    setCanvas(value) { parent.state = value },
    setHasChanges(value) { parent.dirty = value },
    saveRef: { current() { throw Error('Switching must not wait for network saves') } },
  }
  const showStart = manager.indexOf('  const showSelectedSlide =')
  const showEnd = manager.indexOf('  const load =', showStart)
  parent.showSelectedSlide = vm.runInNewContext(manager.slice(showStart, showEnd) + '\nshowSelectedSlide', parent)
  const parentHandler = handlerFrom(manager, '    const handler = (event) => {', parent)
  const child = {
    id: 'post', window: { location: { origin }, parent: parentWindow },
    canvasRefObj: { current: null }, savedCanvasRef: { current: null },
    publishedCanvasRef: { current: null }, historyRef: { current: {} },
    hasInitializedRef: { current: false }, savedRangeRef: { current: null },
    setEditingId() {}, setSelectedIds() {}, setSelectedGroupId() {},
    setCropModeNodeId() {}, setSelectionRect() {},
    setCanvasState(value) { child.state = value },
    setHasChanges(value) { child.dirty = value },
  }
  const childHandler = handlerFrom(editor, '    const handler = (event) => {', child)
  const deliverParent = data => parentHandler({ origin, source: frame, data: { canvasId: 'post', ...data } })
  const deliverChild = data => childHandler({ origin, source: parentWindow, data: { canvasId: 'post', ...data } })
  return { parent, child, toEditor, toParent, deliverParent, deliverChild }
}

test('switching reuses the iframe without waiting for a save', () => {
  let selected
  const context = { setSelectedPage: id => { selected = id } }
  const start = manager.indexOf('  const selectPage =')
  const end = manager.indexOf('  // Keep a ref', start)
  const select = vm.runInNewContext(manager.slice(start, end) + '\nselectPage', context)
  assert.equal(select('b'), undefined)
  assert.equal(selected, 'b')
  assert.match(manager, /key=\{iframeKey\}/)
  assert.match(manager, /src=\{editorSrc.current\}/)
})

test('edits survive switching away and back before any save completes', () => {
  const s = setup()
  s.deliverParent({ type: 'kand:editor-ready' })
  s.deliverChild(s.toEditor.shift())
  s.child.canvasRefObj.current = { ...s.child.state, nodes: [{ text: 'unsaved edit' }] }
  s.parent.selectedPageRef.current = 'b'
  s.deliverChild({ type: 'kand:switch-page' })
  s.deliverParent(s.toParent.shift())
  s.deliverChild(s.toEditor.shift())
  assert.equal(s.child.state._carouselPageId, 'b')
  assert.equal(s.parent.canvasRef.current.pages[0].nodes[0].text, 'unsaved edit')
  assert.equal(s.parent.dirty, true)
  s.parent.selectedPageRef.current = 'a'
  s.deliverChild({ type: 'kand:switch-page' })
  s.deliverParent(s.toParent.shift())
  s.deliverChild(s.toEditor.shift())
  assert.equal(s.child.state.nodes[0].text, 'unsaved edit')
})

test('late save acknowledgements cannot mark a different slide saved', () => {
  const s = setup()
  s.deliverParent({ type: 'kand:editor-ready' })
  s.deliverChild(s.toEditor.shift())
  const before = s.child.savedCanvasRef.current
  s.deliverChild({ type: 'kand:page-persisted', pageId: 'b', snapshot: 'old' })
  assert.equal(s.child.savedCanvasRef.current, before)
})

test('switching to a newly added unsaved slide uses the parent draft', () => {
  const s = setup()
  s.parent.canvasRef.current.pages.push({ id: 'new', name: 'New slide' })
  s.parent.selectedPageRef.current = 'new'
  s.deliverParent({ type: 'kand:editor-ready' })
  s.deliverChild(s.toEditor.shift())
  assert.equal(s.child.state._carouselPageId, 'new')
  assert.equal(s.child.state.nodes.length, 0)
})
