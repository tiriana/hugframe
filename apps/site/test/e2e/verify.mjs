import { chromium } from 'playwright'

import { baseUrl, createReport, shotsDir } from './lib/harness.mjs'

const BASE = baseUrl()
const shots = shotsDir()
const { check, finish } = createReport('frame behaviour')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const snap = (index = 0) =>
  page.evaluate((i) => {
    const root = document.querySelectorAll('.hug-root')[i]
    const box = root?.querySelector('.hug-box')
    const frame = root?.querySelector('iframe')
    const d = frame?.contentDocument
    const de = d?.documentElement
    const win = d?.defaultView
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        t: +r.top.toFixed(1),
        l: +r.left.toFixed(1),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      }
    }
    const boxStyle = box ? getComputedStyle(box) : null
    return {
      mode: root?.getAttribute('data-mode') ?? null,
      phase: root?.getAttribute('data-phase') ?? null,
      boxRect: rect(box),
      boxPosition: boxStyle?.position ?? null,
      boxRadius: boxStyle?.borderRadius ?? null,
      boxOverflow: boxStyle?.overflow ?? null,
      frameH: frame ? +frame.getBoundingClientRect().height.toFixed(1) : null,
      childRect: de ? +de.getBoundingClientRect().height.toFixed(1) : null,
      childScrollH: de ? de.scrollHeight : null,
      childClientH: de ? de.clientHeight : null,
      overflowPx: de ? de.scrollHeight - de.clientHeight : null,
      childOverflowY: de ? win.getComputedStyle(de).overflowY : null,
      gutter: de ? win.innerWidth - de.clientWidth : null,
      docOverflow: document.documentElement.style.overflow,
      dialog: box?.getAttribute('role') ?? null,
      vw: window.innerWidth,
      vh: window.innerHeight,
      activeIsFrame: document.activeElement === frame,
    }
  }, index)

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(2500)

// 1. inline steady state
const inline = await snap()
check(
  'inline: frame height equals child content height',
  Math.abs((inline.frameH ?? 0) - (inline.childRect ?? -1)) <= 0.5,
  JSON.stringify(inline),
)
check(
  'inline: child document does not overflow',
  (inline.overflowPx ?? 1) <= 0,
  `overflowPx=${inline.overflowPx} childRect=${inline.childRect} childClientH=${inline.childClientH}`,
)
check(
  'inline: box is not fixed',
  inline.boxPosition === 'relative',
  `position=${inline.boxPosition}`,
)
check(
  'inline: child root clips overflow',
  inline.childOverflowY === 'hidden',
  `overflowY=${inline.childOverflowY}`,
)
await page.screenshot({ path: `${shots}/01-inline.png`, fullPage: false })

// 2. growth: the frame must take the new height immediately while the box animates,
//    so any content overflow is clipped and lasts only the report round-trip
const growthSamples = []
const startedAt = Date.now()
await page.getByRole('button', { name: 'Grow the content' }).click()
for (let i = 0; i < 30; i++) {
  growthSamples.push({ ...(await snap()), t: Date.now() - startedAt })
  await page.waitForTimeout(16)
}
const overflowing = growthSamples.filter((s) => (s.overflowPx ?? 0) > 0)
const overflowWindowMs = overflowing.length
  ? overflowing[overflowing.length - 1].t - overflowing[0].t
  : 0
const unclipped = growthSamples.filter(
  (s) => s.childOverflowY !== 'hidden' || (s.gutter ?? 0) !== 0,
)
const grew = Math.max(...growthSamples.map((s) => s.frameH ?? 0)) - (inline.frameH ?? 0)
const frameJumpedEarly = growthSamples.findIndex(
  (s) => (s.frameH ?? 0) >= (inline.frameH ?? 0) + grew - 0.5,
)
const boxFinishedLate = growthSamples.findIndex(
  (s) => (s.boxRect?.h ?? 0) >= (inline.frameH ?? 0) + grew - 0.5,
)
const settled = await snap()
check(
  'growth: any overflow lasts at most two frames',
  overflowWindowMs <= 60,
  `window=${overflowWindowMs}ms over ${overflowing.length} samples`,
)
check(
  'growth: framed document clips, so no scrollbar can paint',
  unclipped.length === 0,
  JSON.stringify(unclipped.slice(0, 2)),
)
check(
  'growth: the frame takes the new height before the box finishes',
  frameJumpedEarly !== -1 && frameJumpedEarly < boxFinishedLate,
  `frame at sample ${frameJumpedEarly}, box at sample ${boxFinishedLate}`,
)
check('growth: size reports still arrive (frame grew)', grew > 60, `grew by ${grew.toFixed(1)}px`)
check(
  'growth: settles flush with content',
  Math.abs((settled.frameH ?? 0) - (settled.childRect ?? -1)) <= 0.5,
  JSON.stringify(settled),
)

// 3. the framed document states what it is, carries typed state, and grows again.
//    The retired composer drove growth from inside the frame; the framed document no
//    longer sends, so the state field replaces the message and the host drive button
//    replaces the composer as the second growth source.
const frame = page.frameLocator('iframe[title="Framed document"]')
const statement = (await frame.locator('.doc__say').innerText()).trim()
check(
  'document: the primary view states that it is in an iframe',
  statement === 'This is in an iframe',
  `statement=${JSON.stringify(statement)}`,
)
const framedShell = await frame.locator('.child-shell').evaluate((node) => ({
  framed: node.getAttribute('data-framed'),
  view: node.getAttribute('data-view'),
}))
check(
  'document: the child shell reports the doc view and that it is framed',
  framedShell.framed === 'true' && framedShell.view === 'doc',
  JSON.stringify(framedShell),
)
await frame.locator('#doc-state').click()
await page.keyboard.type('Rolling the fix to staging now')
const typed = await frame.locator('#doc-state').inputValue()
check(
  'state: the framed document accepts typed state',
  typed === 'Rolling the fix to staging now',
  `value=${JSON.stringify(typed)}`,
)
await page.getByRole('button', { name: 'Grow the content' }).click()
await page.waitForTimeout(600)
const afterSecondGrow = await snap()
check(
  'growth: a second block grows the frame further',
  afterSecondGrow.frameH > grew + (inline.frameH ?? 0) - 1,
  `frameH=${afterSecondGrow.frameH} overflowPx=${afterSecondGrow.overflowPx}`,
)
check(
  'growth: no overflow after a second growth',
  (afterSecondGrow.overflowPx ?? 1) <= 0,
  `overflowPx=${afterSecondGrow.overflowPx}`,
)
await page.screenshot({ path: `${shots}/02-inline-after-grow.png` })

// 4. expand from inside the framed document
await frame.locator('button[aria-label="Expand to the full window"]').click()
await page.waitForTimeout(120)
// Read the phase before the diagnostic screenshot: a screenshot can take longer than
// the morph itself under load, which would let the frame settle to idle first.
const midExpand = await snap()
await page.screenshot({ path: `${shots}/03-mid-expand.png` })
check('morph: reports a transitional phase', midExpand.phase !== 'idle', `phase=${midExpand.phase}`)
check(
  'morph: box is pulled out of flow while morphing',
  midExpand.boxPosition === 'fixed',
  `position=${midExpand.boxPosition}`,
)
check(
  'morph: host page scroll is locked',
  midExpand.docOverflow === 'hidden',
  `overflow=${midExpand.docOverflow}`,
)
await page.waitForTimeout(900)
const expanded = await snap()
check('expanded: phase settles to idle', expanded.phase === 'idle', `phase=${expanded.phase}`)
check(
  'expanded: box fills the viewport',
  Math.abs((expanded.boxRect?.w ?? 0) - expanded.vw) <= 1 &&
    Math.abs((expanded.boxRect?.h ?? 0) - expanded.vh) <= 1,
  JSON.stringify(expanded.boxRect) + ` vw=${expanded.vw} vh=${expanded.vh}`,
)
check(
  'expanded: box is pinned to the corner',
  (expanded.boxRect?.t ?? 9) <= 1 && (expanded.boxRect?.l ?? 9) <= 1,
  JSON.stringify(expanded.boxRect),
)
check(
  'expanded: radius collapses to a chromeless edge',
  expanded.boxRadius === '0px',
  `radius=${expanded.boxRadius}`,
)
check(
  'expanded: box exposes a modal dialog role',
  expanded.dialog === 'dialog',
  `role=${expanded.dialog}`,
)
check(
  'expanded: focus moved into the framed document',
  expanded.activeIsFrame,
  `activeIsFrame=${expanded.activeIsFrame}`,
)
await page.screenshot({ path: `${shots}/04-expanded.png` })

// 5. Escape returns to the inline slot
await page.keyboard.press('Escape')
await page.waitForTimeout(120)
await page.screenshot({ path: `${shots}/05-mid-collapse.png` })
await page.waitForTimeout(900)
const collapsed = await snap()
check('collapse: phase settles to idle', collapsed.phase === 'idle', `phase=${collapsed.phase}`)
check(
  'collapse: box returns to flow',
  collapsed.boxPosition === 'relative',
  `position=${collapsed.boxPosition}`,
)
check(
  'collapse: host scroll is released',
  collapsed.docOverflow === '',
  `overflow=${collapsed.docOverflow}`,
)
check(
  'collapse: frame is flush with content again',
  Math.abs((collapsed.frameH ?? 0) - (collapsed.childRect ?? -1)) <= 0.5,
  JSON.stringify(collapsed),
)
const survivedValue = await frame.locator('#doc-state').inputValue()
check(
  'collapse: framed document kept its typed state across the morph',
  survivedValue === 'Rolling the fix to staging now',
  `value=${JSON.stringify(survivedValue)}`,
)

// 6. host-driven expand + single-frame exclusivity
await page.getByRole('button', { name: 'Expand', exact: true }).nth(1).click()
await page.waitForTimeout(1100)
const second = await snap(1)
const firstWhileSecondExpanded = await snap(0)
check(
  'second frame: expands from the host',
  second.phase === 'idle' && Math.abs((second.boxRect?.h ?? 0) - second.vh) <= 1,
  JSON.stringify(second.boxRect),
)
const secondStatement = (
  await page.frameLocator('iframe[title="Second framed document"]').locator('.doc__say').innerText()
).trim()
check(
  'document: the second view states that it is in an iframe too',
  secondStatement === 'This is in an iframe too',
  `statement=${JSON.stringify(secondStatement)}`,
)
check(
  'exclusivity: the other frame collapsed itself',
  firstWhileSecondExpanded.mode === 'inline' && firstWhileSecondExpanded.phase === 'idle',
  `mode=${firstWhileSecondExpanded.mode} phase=${firstWhileSecondExpanded.phase}`,
)
await page.screenshot({ path: `${shots}/06-second-expanded.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(900)

// 7. the demo must never scroll sideways, at rest or while a width change is in
//    flight: the width transition is the one moment a rounding error could overflow.
const sidewaysGap = () =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

const gapAtRest = async (width) => {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(700)
  return await sidewaysGap()
}

const worstGapDuringWidthChange = async (width) => {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /^1\/3/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^full/i }).click()
  const samples = []
  for (let i = 0; i < 40; i += 1) {
    samples.push(await sidewaysGap())
    await page.waitForTimeout(16)
  }
  samples.push(await sidewaysGap())
  return Math.max(...samples)
}

for (const width of [1440, 1024, 420]) {
  const gap = await gapAtRest(width)
  check(`sideways: no horizontal overflow at ${width}`, gap <= 0, `scrollWidth-innerWidth=${gap}`)
}

for (const width of [1440, 1024, 420]) {
  const worst = await worstGapDuringWidthChange(width)
  check(`sideways: none mid-glide at ${width}`, worst <= 0, `worst scrollWidth-innerWidth=${worst}`)
}

// 8. narrow viewport
await page.setViewportSize({ width: 420, height: 820 })
await page.waitForTimeout(700)
const narrow = await snap()
check(
  'narrow: still flush with content',
  Math.abs((narrow.frameH ?? 0) - (narrow.childRect ?? -1)) <= 0.5,
  JSON.stringify(narrow),
)
check(
  'narrow: no horizontal overflow on the host',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  'host scrollWidth vs innerWidth',
)
await page.screenshot({ path: `${shots}/07-narrow-inline.png` })
await page.getByRole('button', { name: 'Expand', exact: true }).nth(0).click()
await page.waitForTimeout(1100)
const narrowExpanded = await snap()
check(
  'narrow: expanded fills the narrow viewport',
  Math.abs((narrowExpanded.boxRect?.w ?? 0) - narrowExpanded.vw) <= 1,
  JSON.stringify(narrowExpanded.boxRect) + ` vw=${narrowExpanded.vw}`,
)
check(
  'narrow: expanded has no horizontal overflow',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  'host scrollWidth vs innerWidth',
)
await page.screenshot({ path: `${shots}/08-narrow-expanded.png` })

// 9. standalone child document
const standalone = await browser.newPage({
  viewport: { width: 900, height: 800 },
  deviceScaleFactor: 2,
})
const standaloneErrors = []
standalone.on('pageerror', (e) => standaloneErrors.push(e.message))
await standalone.goto(`${BASE}/child.html`, { waitUntil: 'load' })
await standalone.waitForTimeout(1200)
check(
  'standalone: renders without a host',
  await standalone.locator('.doc').isVisible(),
  'document view visible',
)
const standaloneShell = await standalone.locator('.child-shell').evaluate((node) => ({
  framed: node.getAttribute('data-framed'),
  view: node.getAttribute('data-view'),
  mode: node.getAttribute('data-mode'),
}))
check(
  'standalone: the child shell reports the doc view and that it is unframed',
  standaloneShell.framed === 'false' &&
    standaloneShell.view === 'doc' &&
    standaloneShell.mode === 'inline',
  JSON.stringify(standaloneShell),
)
check(
  'standalone: shows the preview note',
  await standalone.locator('.standalone-note').isVisible(),
  'note visible',
)
check(
  'standalone: hides the expand control',
  (await standalone.locator('button[aria-label="Expand to the full window"]').count()) === 0,
  'no expand button',
)
check('standalone: no page errors', standaloneErrors.length === 0, standaloneErrors.join('; '))
await standalone.screenshot({ path: `${shots}/09-standalone.png` })

check('no console errors on the host page', errors.length === 0, errors.slice(0, 4).join(' ; '))

await browser.close()
finish()
