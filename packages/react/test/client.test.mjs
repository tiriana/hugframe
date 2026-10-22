import assert from 'node:assert/strict'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
const { window } = dom

// The engine and react-dom both read these off the global object, so they have to be in
// place before either of them is imported.
const define = (key, value) => {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    // A global Node owns and will not hand over; the tests below do not need it.
  }
}

define('window', window)
define('document', window.document)
define('navigator', window.navigator)
define('HTMLElement', window.HTMLElement)
define('HTMLIFrameElement', window.HTMLIFrameElement)
define('CustomEvent', window.CustomEvent)
define('getComputedStyle', window.getComputedStyle.bind(window))
define('requestAnimationFrame', window.requestAnimationFrame.bind(window))
define('cancelAnimationFrame', window.cancelAnimationFrame.bind(window))
define('IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { HugFrame, useHugFrameMode } = await import('../dist/index.js')

const { act, createElement, createRef, StrictMode } = React

const EMBED = { src: '/embedded.html', title: 'Embedded app' }

const render = async (element) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(element))

  return {
    container,
    rerender: (next) => act(async () => root.render(next)),
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

const framesIn = (container) => container.querySelectorAll('[data-hug-part="root"]').length

test('mounts a frame into the container and hands it back through the ref', async () => {
  const ref = createRef()
  const view = await render(createElement(HugFrame, { ref, ...EMBED }))

  assert.equal(framesIn(view.container), 1)
  assert.ok(ref.current, 'the handle should be set once the frame has mounted')
  assert.equal(ref.current.getMode(), 'inline')
  assert.equal(ref.current.getSizing(), 'content')
  assert.ok(ref.current.getIframe() instanceof window.HTMLIFrameElement)

  await view.unmount()
  assert.equal(framesIn(view.container), 0, 'unmounting should take the frame back out of the DOM')
  assert.equal(ref.current, null)
})

test('StrictMode mounts, unmounts and mounts again without leaving two frames', async () => {
  const view = await render(createElement(StrictMode, null, createElement(HugFrame, EMBED)))

  assert.equal(framesIn(view.container), 1)
  await view.unmount()
})

test('re-rendering with the same props leaves the framed document alone', async () => {
  const ref = createRef()
  const view = await render(createElement(HugFrame, { ref, ...EMBED }))

  // Assigning `src` again is what would reload the framed document, so the setter is
  // watched rather than the attribute.
  let assignments = 0
  Object.defineProperty(ref.current.getIframe(), 'src', {
    get: () => EMBED.src,
    set: () => {
      assignments += 1
    },
    configurable: true,
  })

  await view.rerender(createElement(HugFrame, { ref, ...EMBED }))
  assert.equal(assignments, 0)

  await view.rerender(createElement(HugFrame, { ref, ...EMBED, src: '/other.html' }))
  assert.equal(assignments, 1, 'a changed src should reach the engine')

  await view.unmount()
})

test('a changed prop reaches the engine', async () => {
  const ref = createRef()
  const view = await render(createElement(HugFrame, { ref, ...EMBED }))

  assert.equal(ref.current.getSizing(), 'content')
  await view.rerender(createElement(HugFrame, { ref, ...EMBED, height: 320 }))
  assert.equal(ref.current.getSizing(), 'fixed')

  await view.unmount()
})

test('an inline callback is replaced without re-creating the frame', async () => {
  const ref = createRef()
  const seen = []

  const view = await render(
    createElement(HugFrame, { ref, ...EMBED, onModeChange: () => seen.push('first') }),
  )
  const iframe = ref.current.getIframe()

  await view.rerender(
    createElement(HugFrame, { ref, ...EMBED, onModeChange: () => seen.push('second') }),
  )
  assert.equal(ref.current.getIframe(), iframe, 'a new handler must not rebuild the frame')

  await act(async () => ref.current.expand())
  assert.deepEqual(seen, ['second'], 'the latest handler should be the one that runs')

  await view.unmount()
})

test('useHugFrameMode re-renders the reader when the frame changes mode', async () => {
  const ref = createRef()
  const modes = []

  function Probe() {
    modes.push(useHugFrameMode())
    return null
  }

  const view = await render(createElement(HugFrame, { ref, ...EMBED }, createElement(Probe)))

  assert.equal(modes.at(-1), 'inline')

  await act(async () => ref.current.expand())
  assert.equal(modes.at(-1), 'expanded')

  await act(async () => ref.current.collapse())
  assert.equal(modes.at(-1), 'inline')

  await view.unmount()
})
