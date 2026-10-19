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

    return {
      docScrollWidth: doc.scrollWidth,
      viewport: window.innerWidth,
      tables: tables.length,
      widest,
      headings: document.querySelectorAll('h2').length,
      codeBlocks: document.querySelectorAll('pre').length,
      icon: document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    }
  })

  await page.close()
  return { ...measured, errors }
}

const phone = await probe(375, 800)
const desktop = await probe(1280, 900)

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

await browser.close()
finish()
