import { chromium } from 'playwright'

import { clickLastTocEntry, probePage } from './lib/docs-page.mjs'
import { createReport, reactUrl } from './lib/harness.mjs'

const URL = reactUrl()
const { check, finish } = createReport('React page')

const browser = await chromium.launch()

const phone = await probePage(browser, URL, 375, 800)
const desktop = await probePage(browser, URL, 1280, 900)
const wide = await probePage(browser, URL, 1440, 900)

check(
  'the React page renders its content',
  phone.headings >= 5 && phone.codeBlocks >= 3,
  JSON.stringify({ headings: phone.headings, codeBlocks: phone.codeBlocks }),
)
check(
  'the page never scrolls sideways at any width',
  [phone, desktop, wide].every((probe) => probe.docScrollWidth <= probe.viewport + 1),
  JSON.stringify([phone, desktop, wide].map((probe) => [probe.viewport, probe.docScrollWidth])),
)
check(
  'the contents list is one entry per section, every one resolving to a heading',
  phone.toc.sections === phone.headings && phone.toc.dangling === 0 && phone.toc.duplicateIds === 0,
  JSON.stringify({ ...phone.toc, headings: phone.headings }),
)
check(
  'the masthead marks React current',
  phone.mastheadCurrent === 'React',
  `mastheadCurrent=${phone.mastheadCurrent}`,
)
check(
  'the favicon is linked and base-relative',
  phone.icon === '../favicon.svg',
  `icon=${phone.icon}`,
)
check(
  'no console errors at any width',
  [phone, desktop, wide].every((probe) => probe.errors.length === 0),
  [...phone.errors, ...desktop.errors, ...wide.errors].slice(0, 2).join(' ; '),
)

// The README links the reference absolutely for npm; on the site that link must stay on this
// deployment, so it is rewritten to the page's own relative prefix.
check(
  'absolute site links are rewritten to the page prefix',
  phone.articleLinks.includes('../api/') &&
    !phone.articleLinks.some((href) => href?.startsWith('https://tiriana.github.io/hugframe/')),
  JSON.stringify(phone.articleLinks),
)

const followed = await clickLastTocEntry(browser, URL)
check(
  'clicking a contents entry scrolls to its heading and marks it',
  followed.marked === followed.entry && followed.onScreen,
  JSON.stringify(followed),
)

await browser.close()
finish()
