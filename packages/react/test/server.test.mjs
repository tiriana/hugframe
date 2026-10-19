import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { HugFrame, useHugFrameMode } from '../dist/index.js'

const frame = (props = {}) =>
  createElement(HugFrame, { src: '/embedded.html', title: 'Embedded app', ...props })

const captureErrors = (run) => {
  const reported = []
  const original = console.error
  console.error = (...args) => reported.push(args.join(' '))
  try {
    run()
  } finally {
    console.error = original
  }
  return reported
}

test('renders the container without touching the DOM', () => {
  assert.equal(renderToString(frame()), '<div></div>')
})

test('renders children beside the frame, not inside it', () => {
  const html = renderToString(frame({ children: createElement('span', null, 'toolbar') }))
  assert.equal(html, '<div></div><span>toolbar</span>')
})

// A bare useLayoutEffect warns on the server, which is the mistake this guards against.
test('says nothing while rendering on the server', () => {
  const reported = captureErrors(() => renderToString(frame()))
  assert.deepEqual(reported, [])
})

test('a hook used outside a frame explains itself', () => {
  assert.throws(() => renderToString(createElement(useHugFrameMode)), /needs a <HugFrame> above it/)
})
