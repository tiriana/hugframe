import { chromium } from 'playwright'

import { baseUrl, createReport } from './lib/harness.mjs'

// The playground's whole promise is that changing a control changes the frame
// live, without rebuilding it. That is exactly the kind of promise that rots, so
// it is checked here: options, tokens, the layout around the frame, the five
// collapse affordances, and the fact that the framed document is never remounted.
const BASE = baseUrl()
const { check, finish } = createReport('playground: live settings drive the frame')

const browser = await chromium.launch()

// A crash mid-suite would otherwise swallow every result collected so far, which
// makes a CI failure impossible to read.
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

await page.goto(`${BASE}/playground/`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

const readBox = () =>
  page.evaluate(() => {
    const box = document.querySelector('.hug-box')
    const root = document.querySelector('.hug-root')
    if (!box || !root) return null
    const style = getComputedStyle(box)
    return {
      width: Math.round(parseFloat(style.width)),
      height: Math.round(parseFloat(style.height)),
      radius: style.borderRadius,
      mode: root.getAttribute('data-mode'),
      phase: root.getAttribute('data-phase'),
      ready: root.getAttribute('data-ready'),
    }
  })

const setRange = (name, value) =>
  page
    .getByRole('slider', { name, exact: true })
    .first()
    .evaluate((element, next) => {
      element.value = String(next)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)

// Several controls exist twice while expanded - the page's own copy sits behind
// the full-window overlay, and the relocated dock's copy is the clickable one -
// so click whichever copy is actually reachable rather than the first in the DOM.
const clickReachable = async (name) => {
  const candidates = page.getByRole('button', { name })
  const count = await candidates.count()
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index)
    if (!(await candidate.isVisible())) continue
    try {
      await candidate.click({ timeout: 2500 })
      return true
    } catch {
      // covered by the overlay, so try the next copy
    }
  }
  return false
}

const framedMarker = async () => {
  const frame = page.frames().find((candidate) => candidate.url().includes('child.html'))
  if (!frame) return null
  return frame.evaluate(() => document.documentElement.dataset.probe ?? null)
}

const box = await readBox()
check(
  'the playground mounts a frame and the framed document reports ready',
  !!box && box.ready === 'true',
  JSON.stringify(box),
)
check(
  'the section nav marks the playground as the current page',
  (
    await page.locator('nav[aria-label="Site sections"] a[aria-current="page"]').innerText()
  ).trim() === 'Playground',
)

// A size change from the surrounding layout, which is how the frame is meant to
// be driven rather than by dragging the frame itself.
await page.getByRole('button', { name: '1 col', exact: true }).click()
await page.waitForTimeout(700)
const oneColumn = await readBox()
await page.getByRole('button', { name: '3 col', exact: true }).click()
await page.waitForTimeout(700)
const threeColumns = await readBox()
check(
  'the layout switcher changes the frame width',
  oneColumn.width !== threeColumns.width && threeColumns.width > oneColumn.width,
  JSON.stringify({ oneColumn: oneColumn.width, threeColumns: threeColumns.width }),
)

// A host-side sizing option.
await page.getByRole('button', { name: 'Fixed px', exact: true }).click()
await page
  .getByRole('spinbutton', { name: /height/i })
  .first()
  .fill('300')
await page.waitForTimeout(700)
const fixed = await readBox()
check(
  'choosing a fixed height drives the frame to that height',
  Math.abs(fixed.height - 300) <= 2,
  JSON.stringify({ height: fixed.height }),
)
await page.getByRole('button', { name: 'Hug content', exact: true }).click()
await page.waitForTimeout(700)

// A token, applied live.
await setRange('--hug-radius', 30)
await page.waitForTimeout(300)
const rounded = await readBox()
check(
  'a token control restyles the frame live',
  rounded.radius === '30px',
  JSON.stringify({ radius: rounded.radius }),
)

// Expanding and collapsing from the page.
await page.getByRole('button', { name: 'Expand', exact: true }).click()
await page.waitForTimeout(1200)
const expanded = await readBox()
check(
  'expanding fills the viewport and settles',
  expanded.mode === 'expanded' && expanded.phase === 'idle',
  JSON.stringify({ mode: expanded.mode, phase: expanded.phase }),
)

// The framed document must survive every affordance swap: a rebuild would reload
// it, which is the one thing this page exists to show is unnecessary.
const frame = page.frames().find((candidate) => candidate.url().includes('child.html'))
await frame.evaluate(() => {
  document.documentElement.dataset.probe = 'alive'
})

const modes = ['Custom SVG', 'Text glyph', 'Custom control', 'Hidden', 'Default glyph']
let survived = true
for (const mode of modes) {
  await page.getByRole('button', { name: mode, exact: true }).click()
  await page.waitForTimeout(350)
  if ((await framedMarker()) !== 'alive') survived = false
}
check(
  'switching the collapse affordance five ways never remounts the framed document',
  survived,
  `marker survived=${survived} across ${modes.length} swaps`,
)

const collapsedByDock = await clickReachable(/^Collapse( frame)?$/)
await page.waitForTimeout(1200)
const collapsed = await readBox()
check(
  'a reachable way back collapses the frame',
  collapsedByDock && collapsed.mode === 'inline',
  JSON.stringify({ clicked: collapsedByDock, mode: collapsed.mode }),
)

// Reset.
const resetClicked = await clickReachable('Reset all')
await page.waitForTimeout(700)
const reset = await readBox()
check(
  'reset returns the controls and the frame to their defaults',
  resetClicked && reset.mode === 'inline' && reset.radius === '14px',
  JSON.stringify({ clicked: resetClicked, mode: reset.mode, radius: reset.radius }),
)

// Every control must carry a name; a switch without one is announced as an
// unnamed checkbox, which is how this was caught in the first place.
const unnamed = await page.evaluate(() => {
  const controls = [...document.querySelectorAll('input, select')]
  return controls
    .filter((node) => {
      const labelled =
        node.labels?.length ||
        node.getAttribute('aria-label') ||
        node.getAttribute('aria-labelledby') ||
        node.closest('label')
      return !labelled
    })
    .map((node) => node.className || node.type)
})
check(
  'every control on the page has an accessible name',
  unnamed.length === 0,
  JSON.stringify(unnamed),
)

const switchNames = await page
  .locator('[role="switch"]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-labelledby')))
check(
  'the switches point their accessible name at their visible label',
  switchNames.length === 3 && switchNames.every(Boolean),
  JSON.stringify(switchNames),
)

// Narrow viewport.
await page.setViewportSize({ width: 375, height: 780 })
await page.waitForTimeout(500)
const narrow = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  expandVisible: !!document.querySelector('button'),
}))
check(
  'nothing overflows sideways at 375px',
  narrow.overflow <= 0 && narrow.expandVisible,
  JSON.stringify(narrow),
)

check('no console errors on the playground', errors.length === 0, errors.slice(0, 2).join(' ; '))

await browser.close()
finish()
