import { createServer } from 'node:http'

import { chromium } from 'playwright'

import { baseUrl, createReport } from './lib/harness.mjs'

// The engine can only fall back to measuring a frame itself when it can read the
// frame's document, which is the same-origin case. The unit tests drive that path
// against a fake DOM, so this suite mounts the real library in a real browser and
// proves the three mechanics the fallback rests on: reading a same-origin frame's
// document height, observing that document from the parent, and leaving a frame
// whose own runtime reports its size alone.
const BASE = baseUrl()
const DIST = `${BASE}/dist`
const { check, finish } = createReport('same-origin measurement fallback')

// Every framed document has the same shape: no margins, one block of a known
// height, so the document's own measurement is exactly that number.
const content500 = (extra = '') => `<!DOCTYPE html>
<html><head><style>html,body{margin:0;padding:0}</style></head>
<body><div id="block" style="height:500px"></div>${extra}</body></html>`

const SILENT = content500()

// The child reports the document height plus its offsetHeight, so a frame that
// honours the report settles 20px past its content.
const REPORTING = content500(
  `<script type="module">
     import { createHugFrameChild } from '${DIST}/child.js'
     createHugFrameChild({ offsetHeight: 20 })
   </script>`,
)

const CONTENT = 500
const REPORTED = 520
const GROWN = 700
const CROSS_INITIAL = 300

// Same document on another port is another origin, so the host cannot read it.
const crossOriginServer = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(content500())
})
const crossOriginUrl = await new Promise((done) => {
  crossOriginServer.listen(0, '127.0.0.1', () =>
    done(`http://127.0.0.1:${crossOriginServer.address().port}/`),
  )
})

const browser = await chromium.launch()

// A crash mid-suite would otherwise swallow every result collected so far.
process.on('unhandledRejection', (error) => {
  console.log(`\nFAIL  the suite ran to completion\n        -> ${error?.message ?? error}`)
  finish()
  process.exit(1)
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 160))
})
page.on('pageerror', (error) => errors.push('pageerror: ' + error.message.slice(0, 160)))

await page.goto(BASE + '/', { waitUntil: 'load' })
await page.waitForTimeout(300)

// The fixture mounts the real library from the served dist. Frames are given a
// srcdoc document, which is same-origin with the page, so the case under test is
// the one exercised. Instances are parked on window so a later evaluate can reach
// the same one.
const mount = (name, options) =>
  page.evaluate(
    async ({ name, dist, options }) => {
      const { createHugFrame } = await import(`${dist}/index.js`)
      if (!document.querySelector('link[data-hug-css]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `${dist}/hugframe.css`
        link.setAttribute('data-hug-css', '')
        document.head.appendChild(link)
      }
      const host = document.createElement('div')
      document.body.appendChild(host)
      window.__hug ??= {}
      window.__hug[name] = createHugFrame({ container: host, ...options })
    },
    { name, dist: DIST, options },
  )

const read = (name) =>
  page.evaluate((name) => {
    const root = window.__hug?.[name]?.element
    const box = root?.querySelector('.hug-box')
    const frame = root?.querySelector('iframe')
    const de = frame?.contentDocument?.documentElement
    return {
      box: box ? +box.getBoundingClientRect().height.toFixed(1) : null,
      frame: frame ? +frame.getBoundingClientRect().height.toFixed(1) : null,
      content: de ? +de.getBoundingClientRect().height.toFixed(1) : null,
      phase: root?.getAttribute('data-phase') ?? null,
    }
  }, name)

const waitForBox = (name, expected, timeout = 8000) =>
  page
    .waitForFunction(
      ({ name, expected }) => {
        const box = window.__hug?.[name]?.element?.querySelector('.hug-box')
        return !!box && Math.abs(box.getBoundingClientRect().height - expected) <= 1
      },
      { name, expected },
      { timeout },
    )
    .then(() => true)
    .catch(() => false)

try {
  // 1. A silent same-origin frame is measured from its document. Without the
  // fallback the box would stay at its initial height, never reaching the content.
  await mount('silent', {
    src: 'about:blank',
    title: 'Silent same-origin frame',
    iframeProps: { srcdoc: SILENT },
  })
  const silentSettled = await waitForBox('silent', CONTENT)
  const silent = await read('silent')
  check(
    'a silent same-origin frame is measured from its document',
    silentSettled && Math.abs(silent.box - CONTENT) <= 1 && silent.content === CONTENT,
    JSON.stringify(silent),
  )

  // 2. The box follows a change made inside the frame. This is the assertion that
  // a cross-document ResizeObserver actually fires; a single read would not.
  await page.evaluate((name) => {
    const doc = window.__hug[name].element.querySelector('iframe').contentDocument
    doc.getElementById('block').style.height = '700px'
  }, 'silent')
  const grewSettled = await waitForBox('silent', GROWN)
  const grown = await read('silent')
  check(
    'the box follows a change made inside the frame',
    grewSettled && Math.abs(grown.box - GROWN) <= 1 && Math.abs(grown.content - GROWN) <= 1,
    `before=${silent.box} after=${grown.box} content=${grown.content}`,
  )

  // 3. A frame whose document reports its own size is left alone. The report adds
  // 20px to the same 500px content, so a box of 520 is only possible if the
  // child's message won; had the parent measured, the number would be 500.
  await mount('reporting', {
    src: 'about:blank',
    title: 'Reporting same-origin frame',
    iframeProps: { srcdoc: REPORTING },
  })
  const reportedSettled = await waitForBox('reporting', REPORTED)
  const reported = await read('reporting')
  check(
    'a frame whose document reports its own size keeps the report',
    reportedSettled &&
      Math.abs(reported.box - REPORTED) <= 1 &&
      Math.abs(reported.content - CONTENT) <= 1,
    JSON.stringify(reported),
  )

  // 4. A cross-origin frame cannot be read, so the fallback must not pretend to
  // measure it: the box stays at the configured initial height.
  await mount('cross', {
    src: crossOriginUrl,
    title: 'Cross-origin frame',
    initialHeight: CROSS_INITIAL,
  })
  await page.waitForTimeout(900)
  const cross = await read('cross')
  check(
    'a cross-origin frame cannot be measured and keeps its initial height',
    Math.abs(cross.box - CROSS_INITIAL) <= 1 && cross.content === null,
    JSON.stringify(cross),
  )

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' ; '))
} finally {
  await browser.close()
  crossOriginServer.close()
}

finish()
