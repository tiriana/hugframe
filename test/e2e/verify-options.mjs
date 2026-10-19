import { chromium } from 'playwright'

import { baseUrl, createReport } from './lib/harness.mjs'

// The library exposes its internals as options. An option that is declared but
// not consumed, or consumed at the wrong place, is worse than no option at all,
// so each one is driven here and its effect is asserted. They are driven through
// a <hug-frame> element injected into the demo page, which is the layer where the
// attribute and property wiring can most easily go wrong.
const BASE = baseUrl()
const { check, finish } = createReport('options: the exposed knobs change behaviour')

const childSrc = new URL('child.html', BASE + '/').pathname

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 160))
})
page.on('pageerror', (error) => errors.push('pageerror: ' + error.message.slice(0, 160)))

await page.goto(BASE + '/', { waitUntil: 'load' })
await page.waitForTimeout(400)

check(
  'the demo page has the library loaded, so the element is registered',
  await page.evaluate(() => !!customElements.get('hug-frame')),
)

const mount = async (props) => {
  const handle = await page.evaluateHandle(
    ({ next, src }) => {
      const el = document.createElement('hug-frame')
      el.setAttribute('src', src)
      el.setAttribute('title', 'Probe frame')
      el.style.cssText = 'width: 520px; display: block;'
      Object.assign(el, next)
      document.body.append(el)
      return el
    },
    { next: props, src: childSrc },
  )

  // Readiness arrives as an attribute, and the engine dispatches its events
  // without bubbling, so poll the root rather than listening on the host element.
  await page
    .waitForFunction((el) => !!el.querySelector('[data-ready="true"]'), handle, { timeout: 3000 })
    .catch(() => {})

  return handle
}

const read = (handle, script, arg) =>
  page.evaluate(
    ({ el, source, value }) => {
      const root = el.querySelector('.hug-root') ?? el
      return new Function('el', 'root', 'value', source)(el, root, value)
    },
    { el: handle, source: script, value: arg },
  )

const act = (handle, script) => read(handle, script)
const unmount = async (handle) => {
  await page.evaluate((el) => el.remove(), handle)
  await page.waitForTimeout(400)
}

// Attributes map onto the options, and the booleans are property-only.
const wired = await mount({})
await act(
  wired,
  `el.setAttribute('resize-settle-ms', '5000');
   el.setAttribute('expanded-width', '50vw');
   el.setAttribute('expanded-height', '300px');`,
)
const reflected = await read(
  wired,
  `return { settle: el.resizeSettleMs, width: el.expandedWidth, height: el.expandedHeight }`,
)
check(
  'numeric and string options read back through the element',
  reflected.settle === 5000 && reflected.width === '50vw' && reflected.height === '300px',
  JSON.stringify(reflected),
)

const defaults = await read(
  wired,
  `return { lock: el.lockScroll, focus: el.manageFocus, escape: el.collapseOnEscape }`,
)
check(
  'the boolean switches report true when nothing sets them',
  defaults.lock === true && defaults.focus === true && defaults.escape === true,
  JSON.stringify(defaults),
)

await act(wired, `el.expand();`)
await page.waitForTimeout(900)
const geometry = await read(
  wired,
  `const style = getComputedStyle(root.querySelector('.hug-box'));
   return {
     width: Math.round(parseFloat(style.width)),
     height: Math.round(parseFloat(style.height)),
     mode: root.getAttribute('data-mode'),
   }`,
)
check(
  'the expanded box takes the configured size instead of the viewport',
  geometry.mode === 'expanded' &&
    Math.abs(geometry.width - 0.5 * 1280) <= 2 &&
    Math.abs(geometry.height - 300) <= 2,
  JSON.stringify({ ...geometry, halfViewport: 0.5 * 1280 }),
)
await unmount(wired)

// collapseOnEscape gates the host document's own Escape binding, so focus has to
// stay on the host to exercise it. `manageFocus: false` is asserted separately;
// it is used here only to keep focus out of the framed document.
const escapeProbe = await mount({ collapseOnEscape: false, manageFocus: false })
await act(escapeProbe, `el.expand();`)
await page.waitForTimeout(900)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const ignored = await read(escapeProbe, `return root.getAttribute('data-mode')`)
await act(escapeProbe, `el.collapseOnEscape = true;`)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
const collapsed = await read(escapeProbe, `return root.getAttribute('data-mode')`)
check(
  'collapseOnEscape=false ignores Escape, and turning it on restores it',
  ignored === 'expanded' && collapsed === 'inline',
  JSON.stringify({ whileDisabled: ignored, afterEnabling: collapsed }),
)
await unmount(escapeProbe)

// A framed document that handles Escape itself is making an explicit request, not
// pressing the host's shortcut, so it collapses the frame either way. The demo's
// framed app does exactly that.
const requestProbe = await mount({ collapseOnEscape: false })
await act(requestProbe, `el.expand();`)
await page.waitForTimeout(900)
await page.keyboard.press('Escape')
await page.waitForTimeout(900)
const viaRequest = await read(requestProbe, `return root.getAttribute('data-mode')`)
check(
  'a framed document that asks to collapse is honoured even with the shortcut off',
  viaRequest === 'inline',
  JSON.stringify({ afterFramedAppEscape: viaRequest }),
)
await unmount(requestProbe)

// lockScroll
const lockProbe = await mount({ lockScroll: false })
await act(lockProbe, `el.expand();`)
await page.waitForTimeout(900)
const unlocked = await page.evaluate(() => getComputedStyle(document.documentElement).overflow)
await act(lockProbe, `el.lockScroll = true;`)
await page.waitForTimeout(300)
const locked = await page.evaluate(() => getComputedStyle(document.documentElement).overflow)
check(
  'lockScroll=false leaves the page scrollable while expanded',
  unlocked !== 'hidden' && locked === 'hidden',
  JSON.stringify({ whileDisabled: unlocked, afterEnabling: locked }),
)
await unmount(lockProbe)

// manageFocus
const focusProbe = await mount({ manageFocus: false })
await act(focusProbe, `el.expand();`)
await page.waitForTimeout(900)
const untouched = await read(
  focusProbe,
  `const frame = el.querySelector('iframe');
   return !!frame && document.activeElement !== frame && !frame.contains(document.activeElement)`,
)
await act(focusProbe, `el.collapse();`)
await page.waitForTimeout(900)
await act(focusProbe, `el.manageFocus = true; el.expand();`)
await page.waitForTimeout(900)
const moved = await read(focusProbe, `return document.activeElement === el.querySelector('iframe')`)
check(
  'manageFocus=false leaves focus alone, and turning it on moves focus into the frame',
  untouched === true && moved === true,
  JSON.stringify({ whileDisabled: untouched, afterEnabling: moved }),
)
await unmount(focusProbe)

// The resize settle window, and the ceiling that outranks it.
const resizeProbe = await mount({ resizeSettleMs: 900, resizeSafetyMs: 5000 })
await act(resizeProbe, `el.style.width = '700px';`)
await page.waitForTimeout(420)
const during = await read(resizeProbe, `return root.getAttribute('data-phase')`)
await page.waitForTimeout(900)
const settled = await read(resizeProbe, `return root.getAttribute('data-phase')`)
check(
  'a raised resizeSettleMs holds the resizing phase, then settles',
  during === 'resizing' && settled === 'idle',
  JSON.stringify({ at420ms: during, at1320ms: settled }),
)

await act(
  resizeProbe,
  `el.resizeSettleMs = 5000; el.resizeSafetyMs = 300; el.style.width = '620px';`,
)
await page.waitForTimeout(700)
const capped = await read(resizeProbe, `return root.getAttribute('data-phase')`)
check(
  'resizeSafetyMs cuts the wait short regardless of the settle window',
  capped === 'idle',
  JSON.stringify({ at700ms: capped }),
)
await unmount(resizeProbe)

check(
  'no console errors while exercising the options',
  errors.length === 0,
  errors.slice(0, 2).join(' ; '),
)

await browser.close()
finish()
