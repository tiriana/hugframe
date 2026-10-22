import { chromium } from 'playwright'

import { baseUrl, createReport } from './lib/harness.mjs'

const BASE = baseUrl()
const { check, finish } = createReport('host-driven sizing, tokens, reduced motion')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200))
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)))

const snap = () =>
  page.evaluate(() => {
    const root = document.querySelector('.hug-root')
    const box = root?.querySelector('.hug-box')
    const frame = root?.querySelector('iframe')
    const d = frame?.contentDocument
    const de = d?.documentElement
    const win = d?.defaultView
    const boxRect = box?.getBoundingClientRect()
    const frameRect = frame?.getBoundingClientRect()
    return {
      phase: root?.getAttribute('data-phase') ?? null,
      mode: root?.getAttribute('data-mode') ?? null,
      sizing: root?.getAttribute('data-sizing') ?? null,
      boxH: boxRect ? +boxRect.height.toFixed(1) : null,
      frameH: frameRect ? +frameRect.height.toFixed(1) : null,
      frameW: frameRect ? +frameRect.width.toFixed(1) : null,
      childSizing: de?.getAttribute('data-hug-sizing') ?? null,
      childRect: de ? +de.getBoundingClientRect().height.toFixed(1) : null,
      childScrollH: de ? de.scrollHeight : null,
      childClientH: de ? de.clientHeight : null,
      childOverflowY: de ? win.getComputedStyle(de).overflowY : null,
      childArrangement: (() => {
        if (!d) return null
        const framePanel = d.querySelector('.panel--frame')
        const contentPanel = d.querySelector('.panel--content')
        if (!framePanel || !contentPanel) return 'no-split'
        return Math.abs(
          framePanel.getBoundingClientRect().top - contentPanel.getBoundingClientRect().top,
        ) < 4
          ? 'side-by-side'
          : 'stacked'
      })(),
      overflowPx: de ? de.scrollHeight - de.clientHeight : null,
      gutter: de ? win.innerWidth - de.clientWidth : null,
      boxZ: box ? getComputedStyle(box).zIndex : null,
      backdropZ: root ? getComputedStyle(root.querySelector('.hug-backdrop')).zIndex : null,
    }
  })

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(2500)

const btn = (re) => page.getByRole('button', { name: re }).first()
const click = async (re) => {
  await btn(re).click()
}

// ---- A. host layout change: 1 column -> 3 columns ----
await click(/^1 col/i)
await page.waitForTimeout(900)
const wide = await snap()
await click(/^3 col/i)
const switching = []
const t0 = Date.now()
for (let i = 0; i < 70; i++) {
  switching.push({ ...(await snap()), t: Date.now() - t0 })
  await page.waitForTimeout(16)
}
const narrow = await snap()
const phasesSeen = [...new Set(switching.map((s) => s.phase))]
const overflowFrames = switching.filter((s) => (s.overflowPx ?? 0) > 0)
const overflowWindow = overflowFrames.length
  ? overflowFrames[overflowFrames.length - 1].t - overflowFrames[0].t
  : 0
const unclipped = switching.filter((s) => s.childOverflowY !== 'hidden' || (s.gutter ?? 0) !== 0)
const morphPhases = switching.filter((s) => s.phase === 'expanding' || s.phase === 'collapsing')

check(
  'layout: spanning 3 columns widens the frame',
  narrow.frameW > wide.frameW + 100,
  `1col=${wide.frameW} 3col=${narrow.frameW}`,
)
check(
  'layout: a resize phase is announced',
  phasesSeen.includes('resizing'),
  `phases seen: ${phasesSeen.join(',')}`,
)
check(
  'layout: the resize never masquerades as a morph',
  morphPhases.length === 0,
  `${morphPhases.length} morph samples`,
)
check('layout: settles back to idle', narrow.phase === 'idle', `phase=${narrow.phase}`)
check(
  'layout: the wider frame needs less height',
  narrow.frameH < wide.frameH - 40,
  `1col=${wide.frameH} 3col=${narrow.frameH}`,
)
check(
  'layout: the framed app reflows with its container',
  wide.childArrangement === 'stacked' && narrow.childArrangement === 'side-by-side',
  `1col=${wide.childArrangement} 3col=${narrow.childArrangement}`,
)
check(
  'layout: no overflow window beyond two frames',
  overflowWindow <= 60,
  `window=${overflowWindow}ms over ${overflowFrames.length} samples`,
)
check(
  'layout: nothing can paint a scrollbar mid-switch',
  unclipped.length === 0,
  JSON.stringify(unclipped.slice(0, 2)),
)
check(
  'layout: flush with content once settled',
  Math.abs((narrow.frameH ?? 0) - (narrow.childRect ?? -1)) <= 0.5,
  JSON.stringify(narrow),
)

// ---- B. host-driven fixed height ----
await click(/hug content/i)
await page.waitForTimeout(800)
await click(/fixed height/i)
await page.waitForTimeout(900)
const fixed = await snap()
check('fixed: root reports fixed sizing', fixed.sizing === 'fixed', `data-sizing=${fixed.sizing}`)
check(
  'fixed: framed document is told to scroll',
  fixed.childSizing === 'fixed',
  `child attribute=${fixed.childSizing}`,
)
check(
  'fixed: framed document may scroll',
  fixed.childOverflowY !== 'hidden',
  `overflowY=${fixed.childOverflowY}`,
)
check(
  'fixed: box height resolves the clamp',
  (fixed.boxH ?? 0) >= 280 && (fixed.boxH ?? 0) <= 460,
  `boxH=${fixed.boxH}`,
)
check(
  'fixed: frame fills the box',
  Math.abs((fixed.frameH ?? 0) - (fixed.boxH ?? -1)) <= 1,
  `frameH=${fixed.frameH} boxH=${fixed.boxH}`,
)
check(
  'fixed: content overflows and scrolls instead of clipping',
  (fixed.childScrollH ?? 0) > (fixed.childClientH ?? 0),
  `scroll=${fixed.childScrollH} client=${fixed.childClientH}`,
)
await click(/grow the content/i)
await page.waitForTimeout(900)
const fixedAfterGrowth = await snap()
check(
  'fixed: content growth does not move the host box',
  Math.abs((fixedAfterGrowth.boxH ?? 0) - (fixed.boxH ?? -1)) <= 1,
  `before=${fixed.boxH} after=${fixedAfterGrowth.boxH}`,
)

// ---- C. expanded frame: the built-in handle and the stacking order ----
// The demo no longer offers a row to pick the collapse affordance: the library only
// renders the control while expanded, so the row could not be reached behind the
// overlay. The affordance variants are exercised through the playground's
// #pg-affordance instead (see verify-playground.mjs).
await click(/^expand$/i)
await page.waitForTimeout(900)
const defaultAffordance = await page.evaluate(() => {
  const b = document.querySelector('.hug-collapse')
  return b
    ? { exists: true, label: b.getAttribute('aria-label'), html: b.innerHTML.length }
    : { exists: false }
})
check(
  'affordance: default button is present and labelled',
  defaultAffordance.exists && defaultAffordance.label === 'Return to inline view',
  JSON.stringify(defaultAffordance),
)
const zi = await snap()
check(
  'z-index: the expanded box outranks ordinary page content',
  Number.isInteger(Number(zi.boxZ)) && Number(zi.boxZ) >= 1_000_000,
  `boxZ=${zi.boxZ}`,
)
check(
  'z-index: the backdrop sits exactly one below the box',
  zi.backdropZ === String(Number(zi.boxZ) - 1),
  `boxZ=${zi.boxZ} backdropZ=${zi.backdropZ}`,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(900)

// ---- D. token override ----
await page.addStyleTag({ content: '.hug-root { --hug-z-index: 4242; }' })
await click(/^expand$/i)
await page.waitForTimeout(900)
const overridden = await snap()
check(
  'z-index: a consumer token override is honoured',
  overridden.boxZ === '4242' && overridden.backdropZ === '4241',
  `boxZ=${overridden.boxZ} backdropZ=${overridden.backdropZ}`,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(900)

// ---- E. reduced motion ----
const rmContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
})
const rmPage = await rmContext.newPage()
await rmPage.goto(BASE, { waitUntil: 'load' })
await rmPage.waitForTimeout(2500)
const rmSnap = () =>
  rmPage.evaluate(() => {
    const root = document.querySelector('.hug-root')
    const frame = root?.querySelector('iframe')
    const de = frame?.contentDocument?.documentElement
    return {
      phase: root?.getAttribute('data-phase'),
      frameH: frame ? +frame.getBoundingClientRect().height.toFixed(1) : null,
      childRect: de ? +de.getBoundingClientRect().height.toFixed(1) : null,
    }
  })
await rmPage
  .getByRole('button', { name: /^1 col/i })
  .first()
  .click()
await rmPage.waitForTimeout(600)
await rmPage
  .getByRole('button', { name: /^3 col/i })
  .first()
  .click()
const rmPhases = new Set()
for (let i = 0; i < 25; i++) {
  rmPhases.add((await rmSnap()).phase)
  await rmPage.waitForTimeout(16)
}
const rmFinal = await rmSnap()
check(
  'reduced motion: no resizing phase is ever entered',
  !rmPhases.has('resizing'),
  `phases: ${[...rmPhases].join(',')}`,
)
check(
  'reduced motion: still settles flush with content',
  Math.abs((rmFinal.frameH ?? 0) - (rmFinal.childRect ?? -1)) <= 0.5,
  JSON.stringify(rmFinal),
)
await rmContext.close()

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' ; '))

await browser.close()
finish()
