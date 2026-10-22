import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHugFrame } from '../dist/index.js'

/* ------------------------------------------------------------------ *
 * A host document small enough to run in a node process: elements to
 * render into, a window to receive messages on, and an iframe whose
 * inner document the test can make readable or not.
 * ------------------------------------------------------------------ */

class FakeStyle {
  constructor() {
    this.props = new Map()
    this.cssText = ''
  }

  setProperty(name, value) {
    this.props.set(name, String(value))
  }

  getPropertyValue(name) {
    return this.props.get(name) ?? ''
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentNode = null
    this.attributes = new Map()
    this.style = new FakeStyle()
    this.dataset = {}
    this.className = ''
    this.textContent = ''
    this.listeners = new Map()
    this.rect = { top: 0, left: 0, width: 300, height: 0 }
    if (this.tagName === 'IFRAME') {
      this.src = ''
      this.title = ''
      this.contentDocument = null
      this.contentWindow = { postMessage() {} }
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentNode = null
    return child
  }

  remove() {
    this.parentNode?.removeChild(this)
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type)
    if (!list) return
    const index = list.indexOf(listener)
    if (index >= 0) list.splice(index, 1)
  }

  dispatchEvent(event) {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener.call(this, event)
    return true
  }

  getBoundingClientRect() {
    return { ...this.rect }
  }

  focus() {}

  find(part) {
    if (this.getAttribute('data-hug-part') === part) return this
    for (const child of this.children) {
      const found = child.find?.(part)
      if (found) return found
    }
    return null
  }
}

const HOST_ORIGIN = 'https://host.test'

const makeDocument = (height) => ({
  documentElement: {
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 320, height }),
  },
})

function installDom({ readable = 480 } = {}) {
  const windowListeners = new Map()
  const resizeObservers = []

  function addWindowListener(type, listener) {
    const list = windowListeners.get(type) ?? []
    list.push(listener)
    windowListeners.set(type, list)
  }

  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback
      this.observed = []
      this.disconnected = 0
      resizeObservers.push(this)
    }

    observe(target) {
      this.observed.push(target)
    }

    unobserve() {}

    disconnect() {
      this.disconnected += 1
      this.observed = []
    }
  }

  globalThis.window = {
    location: { origin: HOST_ORIGIN },
    innerHeight: 800,
    addEventListener: addWindowListener,
    removeEventListener(type, listener) {
      const list = windowListeners.get(type)
      if (!list) return
      const index = list.indexOf(listener)
      if (index >= 0) list.splice(index, 1)
    },
    setTimeout: (handler, timeout) => setTimeout(handler, timeout),
    clearTimeout: (handle) => clearTimeout(handle),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  }

  globalThis.document = {
    createElement(tagName) {
      const element = new FakeElement(tagName)
      if (element.tagName === 'IFRAME' && readable !== null)
        element.contentDocument = makeDocument(readable)
      return element
    },
  }

  globalThis.ResizeObserver = FakeResizeObserver
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })

  return {
    resizeObservers,
    makeDocument,
    emitLoad: (iframe) => iframe.dispatchEvent({ type: 'load' }),
    emitMessage(data, iframe) {
      for (const listener of [...(windowListeners.get('message') ?? [])])
        listener({ source: iframe.contentWindow, origin: HOST_ORIGIN, data })
    },
  }
}

const measureObservers = (dom) =>
  dom.resizeObservers.filter((observer) =>
    observer.observed.some((target) => !(target instanceof FakeElement)),
  )

const mount = (options = {}) =>
  createHugFrame({
    container: new FakeElement('div'),
    src: `${HOST_ORIGIN}/inner.html`,
    title: 'Inner',
    ...options,
  })

const boxHeight = (instance) => instance.element.find('box').style.height

test('a readable frame that never reports is measured by the parent', () => {
  const dom = installDom({ readable: 512 })
  const frame = mount({ maxHeight: 400 })
  const iframe = frame.getIframe()

  dom.emitLoad(iframe)

  assert.equal(boxHeight(frame), '400px', 'the measured height is clamped like a report')
  assert.equal(iframe.style.height, '400px')
  assert.ok(measureObservers(dom).length === 1, 'the inner document is observed')

  const reported = mount({ maxHeight: 400 })
  dom.emitMessage(
    { source: 'hugframe', type: 'size', height: 512, width: 320 },
    reported.getIframe(),
  )
  assert.equal(boxHeight(reported), '400px', 'a report of the same number lands identically')
})

test('the measured height is the child measurement, rounded up and floored at zero', () => {
  const dom = installDom({ readable: 300.5 })
  const frame = mount()
  dom.emitLoad(frame.getIframe())
  assert.equal(boxHeight(frame), '301px')
})

test('a frame that reports is never measured, even though it is readable', () => {
  const dom = installDom({ readable: 999 })
  const frame = mount({ maxHeight: 2000 })
  const iframe = frame.getIframe()

  dom.emitMessage({ source: 'hugframe', type: 'ready' }, iframe)
  dom.emitMessage({ source: 'hugframe', type: 'size', height: 300, width: 320 }, iframe)
  dom.emitLoad(iframe)

  assert.equal(boxHeight(frame), '300px', 'the reported height survives the load')
  assert.equal(measureObservers(dom).length, 0, 'the parent never attached a measurement')
})

test('a frame whose document is not readable falls back to initialHeight', () => {
  const dom = installDom({ readable: null })
  const frame = mount({ initialHeight: 260 })
  const iframe = frame.getIframe()

  assert.equal(iframe.contentDocument, null)
  dom.emitLoad(iframe)

  assert.equal(boxHeight(frame), '260px')
  assert.equal(measureObservers(dom).length, 0)
})

test('the measurement follows a same-origin document that grows', () => {
  const dom = installDom({ readable: 300 })
  const frame = mount()
  const iframe = frame.getIframe()

  dom.emitLoad(iframe)
  assert.equal(boxHeight(frame), '300px')

  iframe.contentDocument.documentElement.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 320,
    height: 500,
  })
  measureObservers(dom)[0].callback([])

  assert.equal(boxHeight(frame), '500px')
})

test('a ready arriving after the load stops the measurement and keeps the last height', () => {
  const dom = installDom({ readable: 300 })
  const frame = mount({ maxHeight: 2000 })
  const iframe = frame.getIframe()

  dom.emitLoad(iframe)
  assert.equal(boxHeight(frame), '300px')
  const observer = measureObservers(dom)[0]
  assert.ok(observer, 'the fallback measured and observed first')

  dom.emitMessage({ source: 'hugframe', type: 'ready' }, iframe)
  assert.equal(observer.disconnected, 1, 'the report stops the observation')

  iframe.contentDocument.documentElement.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 320,
    height: 700,
  })
  observer.callback([])

  assert.equal(boxHeight(frame), '300px', 'the measurement never overwrites the report')
})

test('a size arriving after the load beats every later measurement', () => {
  const dom = installDom({ readable: 300 })
  const frame = mount({ maxHeight: 2000 })
  const iframe = frame.getIframe()

  dom.emitLoad(iframe)
  const observer = measureObservers(dom)[0]
  assert.ok(observer)

  dom.emitMessage({ source: 'hugframe', type: 'size', height: 500, width: 320 }, iframe)
  assert.equal(observer.disconnected, 1, 'the report stops the observation')
  assert.equal(boxHeight(frame), '500px')

  iframe.contentDocument.documentElement.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 320,
    height: 700,
  })
  observer.callback([])

  assert.equal(boxHeight(frame), '500px', 'the measured value must not come back')
})

test('the measurement observer is disconnected on destroy and on src change', () => {
  const dom = installDom({ readable: 400 })
  const frame = mount()
  const iframe = frame.getIframe()

  dom.emitLoad(iframe)
  const first = measureObservers(dom)[0]
  assert.ok(first, 'a measurement observer is attached')
  assert.equal(first.disconnected, 0)

  frame.update({ src: `${HOST_ORIGIN}/other.html` })
  assert.equal(first.disconnected, 1, 'a src change disconnects the observer')

  iframe.contentDocument = dom.makeDocument(450)
  dom.emitLoad(iframe)
  const second = measureObservers(dom).at(-1)
  assert.notEqual(second, first, 'the new document gets a fresh observer')
  assert.equal(boxHeight(frame), '450px')

  frame.destroy()
  assert.equal(second.disconnected, 1, 'destroy disconnects the observer')
})

test('a fixed height measures nothing', () => {
  const dom = installDom({ readable: 999 })
  const frame = mount({ height: 300 })
  const iframe = frame.getIframe()

  dom.emitLoad(iframe)

  assert.equal(boxHeight(frame), '300px')
  assert.equal(iframe.style.height, '', 'a fixed height leaves the frame unstyled')
  assert.equal(measureObservers(dom).length, 0)
})
