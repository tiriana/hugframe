import { chromium } from 'playwright'

import { createReport, docsUrl } from './lib/harness.mjs'

const URL = docsUrl()
const { check, finish } = createReport('reference page layout')

const browser = await chromium.launch()

const probe = async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)))
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForTimeout(300)

  const measured = await page.evaluate(() => {
    const doc = document.documentElement
    const tables = [...document.querySelectorAll('table')]
    const widest = tables
      .map((table) => {
        const style = getComputedStyle(table)
        return {
          scrollWidth: table.scrollWidth,
          clientWidth: table.clientWidth,
          overflowX: style.overflowX,
          display: style.display,
          columns: table.querySelectorAll('thead th').length,
        }
      })
      .sort((a, b) => b.scrollWidth - a.scrollWidth)[0]

    const nav = document.querySelector('nav.toc')
    const article = document.querySelector('article.page')
    const navRect = nav?.getBoundingClientRect()
    const articleRect = article?.getBoundingClientRect()
    const links = [...document.querySelectorAll('.toc__list a')]
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)

    return {
      docScrollWidth: doc.scrollWidth,
      viewport: window.innerWidth,
      tables: tables.length,
      widest,
      headings: document.querySelectorAll('h2').length,
      codeBlocks: document.querySelectorAll('pre').length,
      icon: document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      toc: {
        sections: document.querySelectorAll('.toc__list > li').length,
        links: links.length,
        dangling: links.filter((a) => !document.querySelector(a.hash)).length,
        duplicateIds: ids.length - new Set(ids).size,
        beside: navRect && articleRect ? navRect.right <= articleRect.left + 1 : false,
        stacked: navRect && articleRect ? navRect.bottom <= articleRect.top + 1 : false,
      },
    }
  })

  await page.close()
  return { ...measured, errors }
}

const phone = await probe(375, 800)
const desktop = await probe(1280, 900)
const wide = await probe(1440, 900)

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

const tocPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await tocPage.goto(URL, { waitUntil: 'load' })
await tocPage.waitForTimeout(300)
// The page scrolls smoothly, so a long jump animates for seconds. What is under test is where the
// entry lands and what it marks, not the animation, so the jump is made instant for the assertion.
await tocPage.evaluate(() => {
  document.documentElement.style.scrollBehavior = 'auto'
})
const entry = await tocPage.evaluate(() => {
  const last = [...document.querySelectorAll('.toc__list a')].at(-1)
  last.click()
  return last.hash
})
await tocPage.waitForTimeout(300)
const followed = await tocPage.evaluate((hash) => {
  const heading = document.querySelector(hash)
  const rect = heading?.getBoundingClientRect()
  return {
    marked: document.querySelector('.toc__list a[aria-current]')?.getAttribute('href') ?? null,
    onScreen: rect ? rect.top >= -2 && rect.top < window.innerHeight : false,
  }
}, entry)
check(
  'clicking a contents entry scrolls to its heading and marks it',
  followed.marked === entry && followed.onScreen,
  JSON.stringify({ entry, ...followed }),
)
await tocPage.close()

await browser.close()
finish()
