import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isHugFrameChildMessage,
  isHugFrameParentMessage,
  postHugFrameMessage,
} from '../dist/index.js'

function child(message) {
  return { source: 'hugframe', ...message }
}

function parent(message) {
  return { source: 'hugframe', ...message }
}

test('accepts every child message shape', () => {
  assert.equal(isHugFrameChildMessage(child({ type: 'ready' })), true)
  assert.equal(isHugFrameChildMessage(child({ type: 'size', height: 320, width: 640 })), true)
  assert.equal(isHugFrameChildMessage(child({ type: 'size', height: 0, width: 0 })), true)
  for (const action of ['expand', 'collapse', 'close']) {
    assert.equal(isHugFrameChildMessage(child({ type: 'request', action })), true)
  }
  assert.equal(isHugFrameChildMessage(child({ type: 'custom', payload: { id: 1 } })), true)
  assert.equal(isHugFrameChildMessage(child({ type: 'custom', payload: undefined })), true)
})

test('rejects a foreign or missing source', () => {
  assert.equal(isHugFrameChildMessage({ source: 'other-app', type: 'ready' }), false)
  assert.equal(isHugFrameChildMessage({ type: 'ready' }), false)
  assert.equal(isHugFrameParentMessage({ source: 'other-app', type: 'custom', payload: 1 }), false)
  assert.equal(isHugFrameParentMessage({ type: 'custom', payload: 1 }), false)
})

test('rejects an unknown child type', () => {
  assert.equal(isHugFrameChildMessage(child({ type: 'morph' })), false)
  assert.equal(isHugFrameChildMessage(child({})), false)
})

test('rejects non-finite or non-numeric size fields', () => {
  const bad = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '320',
    null,
    undefined,
  ]
  for (const height of bad) {
    assert.equal(
      isHugFrameChildMessage(child({ type: 'size', height, width: 640 })),
      false,
      `height ${String(height)}`,
    )
  }
  assert.equal(isHugFrameChildMessage(child({ type: 'size', height: 320 })), false)
  assert.equal(
    isHugFrameChildMessage(child({ type: 'size', height: 320, width: Number.NaN })),
    false,
  )
})

test('rejects an unknown or missing request action', () => {
  assert.equal(isHugFrameChildMessage(child({ type: 'request', action: 'reload' })), false)
  assert.equal(isHugFrameChildMessage(child({ type: 'request', action: 42 })), false)
  assert.equal(isHugFrameChildMessage(child({ type: 'request' })), false)
})

test('accepts every parent message shape', () => {
  assert.equal(isHugFrameParentMessage(parent({ type: 'mode', mode: 'inline' })), true)
  assert.equal(isHugFrameParentMessage(parent({ type: 'mode', mode: 'expanded' })), true)
  assert.equal(isHugFrameParentMessage(parent({ type: 'sizing', sizing: 'content' })), true)
  assert.equal(isHugFrameParentMessage(parent({ type: 'sizing', sizing: 'fixed' })), true)
  assert.equal(isHugFrameParentMessage(parent({ type: 'custom', payload: [1, 2] })), true)
})

test('rejects an unknown or missing mode and sizing', () => {
  assert.equal(isHugFrameParentMessage(parent({ type: 'mode', mode: 'floating' })), false)
  assert.equal(isHugFrameParentMessage(parent({ type: 'mode' })), false)
  assert.equal(isHugFrameParentMessage(parent({ type: 'sizing', sizing: 'auto' })), false)
  assert.equal(isHugFrameParentMessage(parent({ type: 'sizing', sizing: true })), false)
  assert.equal(isHugFrameParentMessage(parent({ type: 'sizing' })), false)
})

test('keeps the two directions disjoint', () => {
  assert.equal(isHugFrameChildMessage(parent({ type: 'mode', mode: 'inline' })), false)
  assert.equal(isHugFrameChildMessage(parent({ type: 'sizing', sizing: 'fixed' })), false)
  assert.equal(isHugFrameParentMessage(child({ type: 'ready' })), false)
  assert.equal(isHugFrameParentMessage(child({ type: 'size', height: 1, width: 1 })), false)
  assert.equal(isHugFrameParentMessage(child({ type: 'request', action: 'close' })), false)
})

test('rejects values that are not plain objects', () => {
  for (const value of [null, undefined, 0, 'hugframe', true, []]) {
    assert.equal(isHugFrameChildMessage(value), false, String(value))
    assert.equal(isHugFrameParentMessage(value), false, String(value))
  }
})

test('postHugFrameMessage forwards the message and origin', () => {
  const seen = []
  const target = { postMessage: (message, origin) => seen.push({ message, origin }) }
  postHugFrameMessage(target, child({ type: 'ready' }), 'https://example.test')
  assert.deepEqual(seen, [
    { message: { source: 'hugframe', type: 'ready' }, origin: 'https://example.test' },
  ])
})

test('postHugFrameMessage swallows postMessage failures', () => {
  const target = {
    postMessage() {
      throw new Error('DataCloneError')
    },
  }
  assert.doesNotThrow(() =>
    postHugFrameMessage(target, child({ type: 'custom', payload: () => {} }), '*'),
  )
})
