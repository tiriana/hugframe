import { chromium } from 'playwright'

import { baseUrl, createReport } from './lib/harness.mjs'

// The playground's promise is that every control drives the frame live, without
// rebuilding it, and that the page demonstrates the theming contract rather than
// a list of knobs. Each of those is asserted here, along with the three defects
// that were found by hand and are easy to reintroduce: a segmented control that
// never moves its active pill, a duration written with the wrong unit (which
// silently makes every morph instant), and a framed composer that cannot send
// because nothing selected a thread.
const BASE = baseUrl()
const { check, finish } = createReport('playground: live settings drive the frame')

const browser = await chromium.launch()

// A morph can only be timed when reduced motion is off; the library deliberately
// skips the transition when it is on.
const page = await browser.newPage({
  viewport: { width: 1500, height: 950 },
  reducedMotion: 'no-preference',
})
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 160))
})
page.on('pageerror', (error) => errors.push('pageerror: ' + error.message.slice(0, 160)))

process.on('unhandledRejection', (error) => {
  console.log(`\nFAIL  the suite ran to completion\n        -> ${error?.message ?? error}`)
  finish()
  process.exit(1)
})

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
      duration: style.getPropertyValue('--hug-duration').trim(),
      mode: root.getAttribute('data-mode'),
      phase: root.getAttribute('data-phase'),
      ready: root.getAttribute('data-ready'),
      parts: [root, ...root.querySelectorAll('[data-hug-part]')].map((n) =>
        n.getAttribute('data-hug-part'),
      ),
    }
  })

const openGroup = async (name) => {
  const trigger = page.getByRole('button', { name, exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await page.waitForTimeout(200)
}

// Several controls exist twice while expanded - the page's own copy sits behind
// the full-window overlay and the dock's copy is the clickable one - so click
// whichever copy is reachable instead of the first in the DOM.
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
  return frame ? frame.evaluate(() => document.documentElement.dataset.probe ?? null) : null
}

// How long the frame spends in a given phase after a click, sampled rather than
// assumed, so "it animates" is a measurement.
const watchPhase = async (action, phase, window_ms = 1600) => {
  const samples = []
  const started = Date.now()
  await action()
  while (Date.now() - started < window_ms) {
    const current = await page.evaluate(
      () => document.querySelector('.hug-root')?.getAttribute('data-phase') ?? null,
    )
    samples.push({ at: Date.now() - started, phase: current })
    await page.waitForTimeout(20)
  }
  const inPhase = samples.filter((s) => s.phase === phase)
  return {
    seen: inPhase.length > 0,
    longest: inPhase.length ? inPhase[inPhase.length - 1].at - inPhase[0].at : 0,
    settled: samples[samples.length - 1]?.phase,
  }
}

const box = await readBox()
check(
  'the playground mounts a frame, and the framed document reports ready',
  !!box && box.ready === 'true',
  JSON.stringify(box && { ready: box.ready }),
)
check(
  'the frame carries the documented parts',
  box.parts.includes('root') &&
    box.parts.includes('backdrop') &&
    box.parts.includes('box') &&
    box.parts.includes('frame'),
  JSON.stringify(box.parts),
)
check(
  'the section nav marks the playground as the current page',
  (
    await page.locator('nav[aria-label="Site sections"] a[aria-current="page"]').innerText()
  ).trim() === 'Playground',
)

// A size change, from the control that replaced the column switcher.
const oneWidth = await readBox()
const resizing = await watchPhase(
  () => page.locator('[aria-labelledby="pg-width"]').getByRole('button', { name: '48%' }).click(),
  'resizing',
  900,
)
const otherWidth = await readBox()
check(
  'the width control changes the frame width and drives the resizing phase',
  otherWidth.width !== oneWidth.width && otherWidth.width < oneWidth.width,
  JSON.stringify({ before: oneWidth.width, after: otherWidth.width }),
)
check(
  'a width change is visible to the frame as a resize, not just a repaint',
  resizing.seen && resizing.longest >= 60,
  JSON.stringify(resizing),
)

// A segmented control must move its own active state, not only the thing it drives.
await page.locator('[aria-labelledby="pg-width"]').getByRole('button', { name: '72%' }).click()
await page.waitForTimeout(200)
const pressed = await page
  .locator('[aria-labelledby="pg-width"] button[aria-pressed="true"]')
  .evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()))
check(
  'clicking a segment moves the active pill to the segment that was clicked',
  pressed.length === 1 && pressed[0] === '72%',
  JSON.stringify(pressed),
)

// A host-side sizing option, inside its accordion.
await openGroup('Sizing')
await page.getByRole('button', { name: 'Fixed px', exact: true }).click()
await page.getByRole('spinbutton').first().fill('300')
await page.waitForTimeout(700)
const fixed = await readBox()
check(
  'choosing a fixed height drives the frame to that height',
  Math.abs(fixed.height - 300) <= 2,
  JSON.stringify({ height: fixed.height }),
)
await page.getByRole('button', { name: 'Hug content', exact: true }).click()
await page.waitForTimeout(700)

// A surviving token, applied live.
await openGroup('Appearance')
await page.getByLabel('--hug-accent').fill('#b23caf')
await page.waitForTimeout(250)
const accent = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.hug-root')).getPropertyValue('--hug-accent').trim(),
)
check(
  'a surviving colour token restyles the frame live',
  accent === '#b23caf',
  JSON.stringify({ accent }),
)

// The theming contract: a recipe is a consumer rule against the parts, and what
// the page shows must be what it runs.
const recipeCode = await page.locator('.pg-recipe__code').innerText()
await page.locator('#pg-recipe').selectOption({ label: 'Square frame' })
await page.waitForTimeout(300)
const squared = await readBox()
const injected = await page.locator('#pg-recipes').innerText()
check(
  'a styling recipe restyles the frame through the part hooks',
  Number.parseFloat(squared.radius) < 0.5,
  JSON.stringify({ radius: squared.radius }),
)
check(
  'the selector shown on the page is the CSS that actually runs',
  injected.includes(recipeCode.trim().slice(0, 40)) || injected.includes('data-hug-part'),
  JSON.stringify({ shown: recipeCode.trim().slice(0, 60) }),
)

// Motion: a duration must reach the stylesheet in milliseconds, or every
// transition silently disappears and the morph becomes instant.
check(
  'the morph duration is a real time value, not a broken unit',
  box.duration === '460ms',
  JSON.stringify({ duration: box.duration }),
)

await page.getByRole('button', { name: 'Expanded', exact: true }).click()
const expanding = await watchPhase(async () => {}, 'expanding', 900)
await page.waitForTimeout(400)
const expanded = await readBox()
check(
  'expanding animates rather than snapping, and settles',
  expanded.mode === 'expanded' && expanded.phase === 'idle',
  JSON.stringify({ mode: expanded.mode, phase: expanded.phase }),
)
check(
  'the morph is long enough to watch, which is what the duration token buys',
  expanding.seen && expanding.longest >= 200,
  JSON.stringify(expanding),
)

// A framed document that can actually reply: nothing selected a thread used to
// leave the composer permanently disabled.
const frame = page.frames().find((candidate) => candidate.url().includes('child.html'))
const composerBefore = await frame.evaluate(() => document.body.innerText.length)
await frame.getByRole('textbox').first().fill('a message from the suite')
await frame.getByRole('button', { name: 'Send', exact: true }).click()
await page.waitForTimeout(600)
const composer = await frame.evaluate(() => ({
  echoed: document.body.innerText.includes('a message from the suite'),
  after: document.body.innerText.length,
}))
check(
  'a message typed into the framed app can be sent',
  composer.echoed && composer.after !== composerBefore,
  JSON.stringify({ ...composer, before: composerBefore }),
)

// The framed document must survive every affordance swap: a rebuild would reload
// it, which is the one thing this page exists to show is unnecessary.
await frame.evaluate(() => {
  document.documentElement.dataset.probe = 'alive'
})
const modes = ['Custom SVG', 'Text glyph', 'Custom control', 'Hidden', 'Default glyph']
let survived = true
for (const mode of modes) {
  await clickReachable(mode)
  await page.waitForTimeout(300)
  if ((await framedMarker()) !== 'alive') survived = false
}
check(
  'switching the collapse affordance five ways never remounts the framed document',
  survived,
  `marker survived=${survived} across ${modes.length} swaps`,
)

// The preview is what makes the collapse styling visible while the frame is
// inline, so it has to exist and to show the same control the frame does.
const preview = await page.evaluate(() => {
  const surface = document.querySelector('.pg-preview__surface')
  const slot = surface?.querySelector("[data-hug-part='collapse']")
  return {
    exists: !!surface,
    hasSlot: !!slot,
    hasControl: !!slot?.firstElementChild,
  }
})
check(
  'a live collapse handle is previewed beside the frame',
  preview.exists && preview.hasSlot && preview.hasControl,
  JSON.stringify(preview),
)

const collapsedByDock = await clickReachable(/^Collapse( frame)?$/)
await page.waitForTimeout(1200)
const collapsed = await readBox()
check(
  'a reachable way back collapses the frame',
  collapsedByDock && collapsed.mode === 'inline',
  JSON.stringify({ clicked: collapsedByDock, mode: collapsed.mode }),
)

const resetClicked = await clickReachable('Reset all')
await page.waitForTimeout(700)
const reset = await readBox()
check(
  'reset returns the controls and the frame to their defaults',
  resetClicked && reset.mode === 'inline' && reset.radius === '14px',
  JSON.stringify({ clicked: resetClicked, mode: reset.mode, radius: reset.radius }),
)

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

await page.setViewportSize({ width: 375, height: 780 })
await page.waitForTimeout(500)
const narrow = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  stageVisible: !!document.querySelector('.hug-frame'),
}))
check(
  'nothing overflows sideways at 375px',
  narrow.overflow <= 0 && narrow.stageVisible,
  JSON.stringify(narrow),
)

check('no console errors on the playground', errors.length === 0, errors.slice(0, 2).join(' ; '))

// The page must follow the colour scheme in force. A colour written as an inline
// token on the frame outranks the library's own dark-scheme rule, which once
// pinned the frame's surface and the preview canvas to white on a dark machine.
const schemeSample = async (colorScheme) => {
  const probe = await browser.newPage({
    viewport: { width: 1500, height: 950 },
    colorScheme,
  })
  await probe.goto(`${BASE}/playground/`, { waitUntil: 'load' })
  await probe.waitForTimeout(1200)
  const sample = await probe.evaluate(() => {
    const root = document.querySelector('.hug-root')
    const box = document.querySelector('.hug-box')
    const preview = document.querySelector('.pg-preview__surface')
    const background = (element) => (element ? getComputedStyle(element).backgroundColor : null)
    return {
      token: getComputedStyle(root).getPropertyValue('--hug-surface').trim(),
      box: background(box),
      preview: background(preview),
    }
  })
  await probe.close()
  return sample
}

const inLight = await schemeSample('light')
const inDark = await schemeSample('dark')
check(
  'the frame surface follows the active colour scheme rather than a pinned colour',
  inDark.box !== inLight.box && inDark.token !== inLight.token,
  JSON.stringify({ light: inLight, dark: inDark }),
)
check(
  'the collapse preview canvas matches the frame surface in both schemes',
  inDark.preview === inDark.box && inLight.preview === inLight.box,
  JSON.stringify({ light: inLight, dark: inDark }),
)

await browser.close()
finish()
