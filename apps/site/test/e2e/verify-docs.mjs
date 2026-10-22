import { chromium } from 'playwright'

import { clickLastTocEntry, probePage } from './lib/docs-page.mjs'
import { createReport, docsUrl } from './lib/harness.mjs'

const URL = docsUrl()
const { check, finish } = createReport('reference page layout')

const browser = await chromium.launch()

const phone = await probePage(browser, URL, 375, 800)
const desktop = await probePage(browser, URL, 1280, 900)
const wide = await probePage(browser, URL, 1440, 900)

check(
  'the reference page renders its content',
  phone.tables >= 6 && phone.headings >= 8,
  JSON.stringify({ tables: phone.tables, headings: phone.headings, codeBlocks: phone.codeBlocks }),
)
check(
  'phone: the page itself never scrolls sideways',
  phone.docScrollWidth <= phone.viewport + 1,
  `doc=${phone.docScrollWidth} viewport=${phone.viewport}`,
)
check(
  'phone: a wide table scrolls inside its own panel',
  phone.widest.overflowX === 'auto' && phone.widest.scrollWidth > phone.widest.clientWidth,
  JSON.stringify(phone.widest),
)
check(
  'desktop: the page does not scroll sideways either',
  desktop.docScrollWidth <= desktop.viewport + 1,
  `doc=${desktop.docScrollWidth} viewport=${desktop.viewport}`,
)
check(
  'desktop: tables fit without needing to scroll',
  desktop.widest.scrollWidth <= desktop.widest.clientWidth,
  JSON.stringify(desktop.widest),
)
check(
  'the favicon is linked and base-relative',
  phone.icon === '../favicon.svg',
  `icon=${phone.icon}`,
)
check(
  'no console errors at either width',
  phone.errors.length === 0 && desktop.errors.length === 0,
  [...phone.errors, ...desktop.errors].slice(0, 2).join(' ; '),
)

check(
  'the contents list is one entry per section, every one resolving to a heading',
  phone.toc.sections === phone.headings && phone.toc.dangling === 0 && phone.toc.duplicateIds === 0,
  JSON.stringify({ ...phone.toc, headings: phone.headings }),
)

// Hand-written prose links can rot to a dead `#…` target that nothing else checks.
const proseLinks = phone.articleLinks.filter((href) => href?.startsWith('#') && href.length > 1)
const anchorPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await anchorPage.goto(URL, { waitUntil: 'load' })
await anchorPage.waitForTimeout(300)
const danglingAnchors = await anchorPage.evaluate(
  (hrefs) => hrefs.filter((href) => !document.getElementById(href.slice(1))),
  proseLinks,
)
await anchorPage.close()

check(
  'every in-page link in the prose resolves to a heading on the page',
  danglingAnchors.length === 0,
  JSON.stringify({ links: proseLinks.length, dangling: danglingAnchors }),
)

// The list is a sidebar when the viewport can hold one and a stacked disclosure when it cannot,
// so the assertion is on where it sits relative to the reading column, not on the breakpoint.
for (const [label, probeResult, beside] of [
  ['wide', wide, true],
  ['desktop', desktop, false],
  ['phone', phone, false],
]) {
  check(
    `${label}: the contents sit ${beside ? 'beside' : 'above'} the reading column`,
    beside ? probeResult.toc.beside : probeResult.toc.stacked,
    JSON.stringify(probeResult.toc),
  )
}

const followed = await clickLastTocEntry(browser, URL)
check(
  'clicking a contents entry scrolls to its heading and marks it',
  followed.marked === followed.entry && followed.onScreen,
  JSON.stringify(followed),
)

await browser.close()
finish()
