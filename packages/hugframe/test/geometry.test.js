import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_INITIAL_HEIGHT,
  DEFAULT_MAX_HEIGHT,
  clampInlineHeight,
  computeInlineHeight,
  lockDocumentScroll,
  readTokenMs,
  resolveFixedHeight,
  resolveSizing,
  unlockDocumentScroll,
} from '../src/geometry.ts'

// geometry.ts is pure and reaches for the DOM only through getComputedStyle, so it is
// covered at source; the suites that need a real document assert against the built output.
globalThis.getComputedStyle = (element) => ({
  getPropertyValue: (token) => element.computed?.[token] ?? '',
})

const read = (raw, fallback = 111) => readTokenMs({ computed: { '--x': raw } }, '--x', fallback)

test('readTokenMs reads the unit a duration token carries', () => {
  assert.equal(read('460ms'), 460)
  assert.equal(read('0.46s'), 460)
  assert.equal(read('1.5s'), 1500)
  assert.equal(read('300'), 300)
  assert.equal(read('0s'), 0)
})

test('readTokenMs falls back on a missing or unparseable token', () => {
  assert.equal(read(''), 111)
  assert.equal(read('   '), 111)
  assert.equal(read('auto'), 111)
  assert.equal(read('calc(1px + 1px)'), 111)
})

test('a height option resolves to a fixed box or to content sizing', () => {
  assert.equal(resolveFixedHeight(undefined), null)
  assert.equal(resolveFixedHeight('content'), null)
  assert.equal(resolveFixedHeight(320), '320px')
  assert.equal(resolveFixedHeight('60vh'), '60vh')
  assert.equal(resolveFixedHeight('clamp(280px, 45vh, 460px)'), 'clamp(280px, 45vh, 460px)')

  assert.equal(resolveSizing(undefined), 'content')
  assert.equal(resolveSizing('content'), 'content')
  assert.equal(resolveSizing(320), 'fixed')
  assert.equal(resolveSizing('60vh'), 'fixed')
})

test('the inline height is clamped into the configured bounds', () => {
  assert.equal(clampInlineHeight(400, {}), 400)
  assert.equal(clampInlineHeight(400, { maxHeight: 300 }), 300)
  assert.equal(clampInlineHeight(100, { minHeight: 200 }), 200)
  assert.equal(clampInlineHeight(4000, {}), DEFAULT_MAX_HEIGHT)
  assert.equal(clampInlineHeight(-10, {}), 0)
  assert.equal(clampInlineHeight(100, { minHeight: 200, maxHeight: 150 }), 150)
})

test('the inline height falls back to the initial height until content reports', () => {
  assert.equal(computeInlineHeight(null, {}), DEFAULT_INITIAL_HEIGHT)
  assert.equal(computeInlineHeight(null, { initialHeight: 300 }), 300)
  assert.equal(computeInlineHeight(500, {}), 500)
  assert.equal(computeInlineHeight(500, { maxHeight: 400 }), 400)
  assert.equal(computeInlineHeight(null, { initialHeight: 900, maxHeight: 720 }), 720)
})

test('the document scroll lock is ref-counted and restores the previous inline value', () => {
  const root = { style: { overflow: 'scroll' } }
  globalThis.document = { documentElement: root }

  lockDocumentScroll()
  lockDocumentScroll()
  assert.equal(root.style.overflow, 'hidden')

  unlockDocumentScroll()
  assert.equal(root.style.overflow, 'hidden', 'one release must not lift a lock two callers hold')

  unlockDocumentScroll()
  assert.equal(root.style.overflow, 'scroll')
})
