import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createHugFrame } from '../dist/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readDist = (name) => readFile(join(root, 'dist', name), 'utf8')

// The documented selector contract. Every value is asserted against this list,
// both in the DOM the engine builds and in the selectors the stylesheet uses.
const PART_VALUES = ['root', 'backdrop', 'box', 'frame', 'collapse', 'collapse-icon']

function declaredTokens(css) {
  return new Set([...css.matchAll(/--hug-([\w-]+)\s*:/g)].map((match) => match[1]))
}

function readTokens(css) {
  return new Set([...css.matchAll(/var\(\s*--hug-([\w-]+)/g)].map((match) => match[1]))
}

// A token nothing reads is a knob that does nothing, and would become a prop that
// does nothing in a wrapper.
test('every declared token is read somewhere in the stylesheet', async () => {
  const css = await readDist('hugframe.css')

  assert.deepEqual(
    [...declaredTokens(css)].filter((name) => !readTokens(css).has(name)),
    [],
    'these tokens are declared but never read; remove them or use them',
  )
})

// The engine reads --hug-z-index and --hug-duration, writes --hug-initial-height,
// and the stylesheet has to agree with all three. The height has no declaration of
// its own: its agreement is the box fallback matching the value the engine writes.
test('the engine-coupled tokens are declared and read, with the height fallback in agreement', async () => {
  const css = await readDist('hugframe.css')
  const declared = declaredTokens(css)
  const read = readTokens(css)

  for (const token of ['z-index', 'duration']) {
    assert.ok(declared.has(token), `--hug-${token} should be declared`)
    assert.ok(read.has(token), `--hug-${token} should be read by the stylesheet`)
  }

  const box = mountFrame().element
  const written = box.style.getPropertyValue('--hug-initial-height')
  const fallback = /var\(--hug-initial-height,\s*([^)]+)\)/.exec(css)
  assert.ok(fallback, 'the box height should fall back on --hug-initial-height')
  assert.equal(
    fallback[1].trim(),
    written,
    'the height fallback must equal the value the engine writes before the first report',
  )
})

// Every element the engine generates has to carry its documented part, through both
// collapse paths and through the hidden one.
test('every generated element carries its documented data-hug-part', () => {
  const defaultParts = collectParts(mountFrame().element)
  assert.deepEqual(
    sorted(defaultParts),
    sorted(PART_VALUES),
    'the default collapse path should carry every documented part',
  )

  const custom = mountFrame({
    renderCollapse: () => {
      const node = document.createElement('button')
      node.setAttribute('data-probe', 'custom')
      return node
    },
  }).element
  assert.deepEqual(
    sorted(collectParts(custom)),
    sorted(PART_VALUES.filter((part) => part !== 'collapse-icon')),
    'a renderCollapse node still gets the slot, but no built-in icon part',
  )

  const hidden = mountFrame({ renderCollapse: null }).element
  assert.deepEqual(
    sorted(collectParts(hidden)),
    sorted(['root', 'backdrop', 'box', 'frame']),
    'renderCollapse: null should render no slot at all',
  )
})

// The classes the library shipped stay on the same nodes, so document selectors
// written before the parts existed keep working.
test('the structural classes survive alongside the parts', () => {
  const frame = mountFrame().element
  const findByPart = (part) => find(frame, (node) => node.getAttribute('data-hug-part') === part)

  assert.match(frame.className, /\bhug-root\b/)
  assert.match(findByPart('backdrop').className, /\bhug-backdrop\b/)
  assert.match(findByPart('box').className, /\bhug-box\b/)
  assert.match(findByPart('frame').className, /\bhug-frame\b/)

  const slot = findByPart('collapse')
  assert.equal(slot._children.length, 1, 'the slot should hold exactly one node')
  assert.match(slot._children[0].className, /\bhug-collapse\b/)
})

// A part the stylesheet keys off that the code does not document is a selector with
// nothing behind it, so the two lists have to match.
test('every part selector in the stylesheet is a documented part', async () => {
  const css = await readDist('hugframe.css')
  const used = new Set(
    [...css.matchAll(/\[data-hug-part=(['"])([^'"]+)\1\]/g)].map((match) => match[2]),
  )

  assert.deepEqual(
    [...used].filter((value) => !PART_VALUES.includes(value)),
    [],
    'the stylesheet references a part that is not part of the documented contract',
  )
  assert.ok(used.has('collapse') && used.has('collapse-icon'))
})

/* ------------------------------------------------------------------ *
 * A DOM small enough to mount the frame in a node process, so the parts
 * are asserted against the same built code a browser loads.
 * ------------------------------------------------------------------ */

function makeStyle() {
  const custom = new Map()
  return {
    setProperty(name, value) {
      custom.set(name, String(value))
    },
    getPropertyValue(name) {
      return custom.get(name) ?? ''
    },
  }
}

function makeElement(tag) {
  const attrs = new Map()
  return {
    tagName: tag.toUpperCase(),
    style: makeStyle(),
    dataset: {},
    className: '',
    textContent: '',
    src: '',
    title: '',
    contentWindow: null,
    parentNode: null,
    _attrs: attrs,
    _children: [],
    setAttribute(name, value) {
      attrs.set(name, String(value))
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null
    },
    hasAttribute(name) {
      return attrs.has(name)
    },
    removeAttribute(name) {
      attrs.delete(name)
    },
    appendChild(node) {
      if (node.parentNode) node.parentNode.removeChild(node)
      node.parentNode = this
      this._children.push(node)
      return node
    },
    removeChild(node) {
      const index = this._children.indexOf(node)
      if (index !== -1) this._children.splice(index, 1)
      node.parentNode = null
      return node
    },
    remove() {
      this.parentNode?.removeChild(this)
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
    },
    focus() {},
  }
}

function installDom() {
  globalThis.HTMLElement = class {}
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })
  globalThis.requestAnimationFrame = () => 0
  globalThis.cancelAnimationFrame = () => {}
  globalThis.document = {
    createElement: (tag) => makeElement(tag),
    createElementNS: (_namespace, tag) => makeElement(tag),
    documentElement: makeElement('html'),
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.window = {
    location: { origin: 'http://localhost' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
  }
}

// The engine feature-detects matchMedia, so a DOM without it needs no stub, and the stub
// frame never runs, which leaves the morph un-settled and the tree as it was built.
function mountFrame(options = {}) {
  installDom()
  return createHugFrame({
    container: globalThis.document.createElement('div'),
    src: 'about:blank',
    title: 'Probe frame',
    initialMode: 'expanded',
    manageFocus: false,
    lockScroll: false,
    ...options,
  })
}

function find(node, predicate) {
  if (predicate(node)) return node
  for (const child of node._children) {
    const match = find(child, predicate)
    if (match) return match
  }
  return null
}

function collectParts(node, out = []) {
  const part = node.getAttribute('data-hug-part')
  if (part) out.push(part)
  for (const child of node._children) collectParts(child, out)
  return out
}

const sorted = (values) => [...values].sort()
