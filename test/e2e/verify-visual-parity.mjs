// A diagnostic, not an assertion suite: it compares the frame's own computed
// styles between two deployments, so a refactor that is supposed to change only
// where values live cannot quietly change how they look. It is deliberately not
// wired into `npm run test:e2e` or CI — point it at two URLs by hand.
import { chromium } from 'playwright'

import { baseUrl } from './lib/harness.mjs'

const BEFORE = process.env.BEFORE ?? 'https://tiriana.github.io/hugframe/'
const AFTER = process.env.AFTER ?? `${baseUrl()}/`

const PROPS = {
  '.hug-box': [
    'borderRadius',
    'boxShadow',
    'backgroundColor',
    'zIndex',
    'transitionProperty',
    'transitionDuration',
    'transitionTimingFunction',
  ],
  '.hug-backdrop': [
    'backgroundColor',
    'backdropFilter',
    'opacity',
    'visibility',
    'zIndex',
    'transitionProperty',
  ],
  '.hug-collapse': [
    'width',
    'height',
    'borderRadius',
    'borderTopWidth',
    'borderTopColor',
    'backgroundColor',
    'color',
    'zIndex',
    'backdropFilter',
    'top',
    'right',
  ],
  '.hug-frame': [
    'borderTopWidth',
    'backgroundColor',
    'outlineWidth',
    'outlineColor',
    'outlineOffset',
  ],
}

const browser = await chromium.launch()

const snapshot = async (url) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(900)

  const collect = () =>
    page.evaluate((props) => {
      const read = (selector) => {
        const node = document.querySelector(selector)
        if (!node) return { missing: true }
        const style = getComputedStyle(node)
        return Object.fromEntries(props[selector].map((prop) => [prop, style[prop]]))
      }
      return Object.fromEntries(Object.keys(props).map((selector) => [selector, read(selector)]))
    }, PROPS)

  const inline = await collect()

  await page
    .getByRole('button', { name: /expand/i })
    .first()
    .click()
  await page.waitForTimeout(1200)
  const expanded = await collect()

  await page.close()
  return { inline, expanded }
}

const before = await snapshot(BEFORE)
const after = await snapshot(AFTER)
await browser.close()

const differences = []
for (const state of ['inline', 'expanded']) {
  for (const selector of Object.keys(PROPS)) {
    const a = before[state][selector]
    const b = after[state][selector]
    for (const prop of PROPS[selector]) {
      if (a?.[prop] !== b?.[prop]) {
        differences.push(`${state} ${selector} ${prop}: before=${a?.[prop]} after=${b?.[prop]}`)
      }
    }
  }
}

console.log(`before: ${BEFORE}`)
console.log(`after:  ${AFTER}`)
if (differences.length === 0) console.log('PASS  every compared computed style is identical')
else for (const line of differences) console.log('DIFF  ' + line)
console.log(
  `\n${Object.keys(PROPS).length * 2} elements compared, ${differences.length} differences`,
)
