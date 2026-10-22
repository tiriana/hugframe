import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHugFrameChild } from '../dist/child.js'

/* ------------------------------------------------------------------ *
 * A framed document small enough to run in a node process: a parent
 * window to post to, a root element to measure, and a way to hand the
 * runtime a message event.
 * ------------------------------------------------------------------ */

function installDom({ frameHeight = 800, contentHeight = () => 400 } = {}) {
  const listeners = new Map()
  const posted = []

  const parent = {
    postMessage(message, targetOrigin) {
      posted.push({ message, targetOrigin })
    },
  }

  const documentElement = {
    dataset: {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 320, height: contentHeight() }),
  }

  globalThis.window = {
    parent,
    innerHeight: frameHeight,
    location: { origin: 'https://child.test' },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type) {
      listeners.delete(type)
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  }
  globalThis.document = { documentElement, querySelector: () => null }

  return {
    posted,
    emit(type, event) {
      listeners.get(type)?.(event)
    },
  }
}

const customMessage = (payload) => ({ source: 'hugframe', type: 'custom', payload })

const captureWarnings = (run) => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    run()
  } finally {
    console.warn = original
  }
  return warnings
}

// A wildcard targetOrigin means "any origin", not "any window": accepting another
// window's message would let any framed or opened page drive the host's frame.
test('a wildcard targetOrigin still requires the parent window', () => {
  const dom = installDom()
  const payloads = []
  createHugFrameChild({ onMessage: (payload) => payloads.push(payload) })

  const data = customMessage('from the parent')

  dom.emit('message', { origin: 'https://anywhere.test', source: {}, data })
  assert.deepEqual(payloads, [], 'a message from another window must be ignored')

  dom.emit('message', { origin: 'https://anywhere.test', source: globalThis.window.parent, data })
  assert.deepEqual(payloads, ['from the parent'])
})

test('a named targetOrigin rejects a parent message from another origin', () => {
  const dom = installDom()
  const payloads = []
  createHugFrameChild({ targetOrigin: 'https://host.test', onMessage: (p) => payloads.push(p) })

  const data = customMessage('from the parent')
  const source = globalThis.window.parent

  dom.emit('message', { origin: 'https://elsewhere.test', source, data })
  assert.deepEqual(payloads, [])

  dom.emit('message', { origin: 'https://host.test', source, data })
  assert.deepEqual(payloads, ['from the parent'])
})

test('a document that reports the frame height twice in a row warns once', () => {
  const dom = installDom({ frameHeight: 800, contentHeight: () => 800 })

  const warnings = captureWarnings(() => {
    const child = createHugFrameChild()
    child.resize()
    child.resize()
  })

  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /content/)
  assert.ok(dom.posted.length >= 2, 'the runtime keeps reporting while it warns')
})

test('a content-sized document never warns', () => {
  let height = 420
  const dom = installDom({ frameHeight: 800, contentHeight: () => height })

  const warnings = captureWarnings(() => {
    const child = createHugFrameChild()
    child.resize()
    height = 800
    child.resize()
    height = 420
    child.resize()
  })

  assert.deepEqual(warnings, [], 'a height that only touches the frame height once is not pinned')
  assert.ok(dom.posted.length > 0)
})

test('outside a frame the runtime stays silent', () => {
  const dom = installDom({ frameHeight: 800, contentHeight: () => 800 })
  globalThis.window.parent = globalThis.window

  const warnings = captureWarnings(() => {
    const child = createHugFrameChild()
    assert.equal(child.isFramed, false)
    child.resize()
  })

  assert.deepEqual(warnings, [])
  assert.deepEqual(dom.posted, [], 'nothing is posted when the document is not framed')
})
