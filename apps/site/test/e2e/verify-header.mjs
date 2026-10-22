import { chromium } from 'playwright'

import { baseUrl, createReport } from './lib/harness.mjs'

const BASE = baseUrl()
const { check, finish } = createReport('demo header')

const browser = await chromium.launch()
const errors = []

const inspect = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)))
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(600)

  // Locate by role and accessible name rather than by markup, so a restyle of the
  // masthead does not silently retire this suite.
  const link = page.getByRole('link', { name: /github/i }).first()
  const count = await link.count()

  if (!count) {
    await page.close()
    return { found: false, width }
  }

  const box = await link.boundingBox()
  const data = await link.evaluate((node) => {
    const header = node.closest('header')
    const svg = node.querySelector('svg')
    const style = getComputedStyle(node)
    return {
      href: node.getAttribute('href'),
      target: node.getAttribute('target'),
      rel: node.getAttribute('rel'),
      label: node.getAttribute('aria-label') ?? node.textContent.trim(),
      svgHidden: svg?.getAttribute('aria-hidden') ?? null,
      svgFocusable: svg?.getAttribute('focusable') ?? null,
      display: style.display,
      visibility: style.visibility,
      inHeader: !!header,
      // The masthead groups the section nav with the utility links, so what
      // matters is that the link sits in the right-hand half of the header, not
      // that it is the last element in the row.
      rightHalf: node.getBoundingClientRect().left > window.innerWidth / 2,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })

  // reach it by keyboard, tabbing forward until it takes focus
  let focusable = false
  for (let i = 0; i < 40 && !focusable; i += 1) {
    await page.keyboard.press('Tab')
    focusable = await page.evaluate(
      () =>
        document.activeElement instanceof HTMLAnchorElement &&
        document.activeElement.href.includes('github.com/tiriana/hugframe'),
    )
  }

  await page.close()
  return { found: true, width, box, focusable, ...data }
}

const desktop = await inspect(1280)
const tablet = await inspect(768)
const phone = await inspect(375)

check(
  'the header links to the repository',
  desktop.found && desktop.href === 'https://github.com/tiriana/hugframe',
  JSON.stringify({ found: desktop.found, href: desktop.href }),
)
check(
  'the link sits in the masthead, on the right-hand side',
  desktop.inHeader && desktop.rightHalf,
  `inHeader=${desktop.inHeader} rightHalf=${desktop.rightHalf}`,
)
check(
  'it carries an accessible name',
  typeof desktop.label === 'string' && desktop.label.length > 3,
  `label=${desktop.label}`,
)
check(
  'the svg is hidden from assistive tech, so the name is not doubled',
  desktop.svgHidden === 'true' && desktop.svgFocusable === 'false',
  JSON.stringify({ ariaHidden: desktop.svgHidden, focusable: desktop.svgFocusable }),
)
check(
  'it opens in a new tab safely',
  desktop.target === '_blank' && /noopener/.test(desktop.rel ?? ''),
  JSON.stringify({ target: desktop.target, rel: desktop.rel }),
)
check('it is reachable by keyboard', desktop.focusable, `focusable=${desktop.focusable}`)
check(
  'it is present and rendered at every width',
  [desktop, tablet, phone].every(
    (r) => r.found && r.box && r.box.width > 0 && r.display !== 'none',
  ),
  JSON.stringify([desktop.display, tablet.display, phone.display]),
)
check(
  'the hit area stays tappable on a phone',
  phone.box && phone.box.width >= 32 && phone.box.height >= 32,
  JSON.stringify(phone.box),
)
check(
  'nothing overflows sideways at any width',
  [desktop, tablet, phone].every((r) => r.pageOverflow <= 0),
  JSON.stringify([desktop.pageOverflow, tablet.pageOverflow, phone.pageOverflow]),
)
check(
  'the utilities keep their right-hand position on a phone',
  phone.rightHalf,
  `rightHalf=${phone.rightHalf}`,
)
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' ; '))

const docs = await (async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } })
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  // The reference is the site's second section, labelled "API reference".
  const link = page.getByRole('link', { name: /api reference|docs/i }).first()
  if (!(await link.count())) {
    await page.close()
    return { found: false }
  }
  const href = await link.getAttribute('href')
  const box = await link.boundingBox()
  const label = await link.evaluate(
    (node) => node.getAttribute('aria-label') ?? node.textContent.trim(),
  )
  await page.close()

  // The role query finds the link by its accessible name; the href pattern keeps
  // the original guarantee that it points at the reference page, whose own href
  // is not a stable enough thing to select on.
  const found = /(^|\/)api\/?$/.test(href ?? '')
  const resolved = new URL(href, BASE + '/').href
  const status = await fetch(resolved, { redirect: 'follow' }).then((r) => r.status)
  return { found, href, resolved, status, box, label }
})()

const react = await (async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } })
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  // The React page is the site's third section; `exact` keeps the hero badge's longer
  // label out of the match.
  const link = page.getByRole('link', { name: 'React', exact: true }).first()
  if (!(await link.count())) {
    await page.close()
    return { found: false }
  }
  const href = await link.getAttribute('href')
  const box = await link.boundingBox()
  const label = await link.evaluate(
    (node) => node.getAttribute('aria-label') ?? node.textContent.trim(),
  )
  await page.close()

  const found = /(^|\/)react\/?$/.test(href ?? '')
  const resolved = new URL(href, BASE + '/').href
  const status = await fetch(resolved, { redirect: 'follow' }).then((r) => r.status)
  return { found, href, resolved, status, box, label }
})()

check('the header also links to the documentation', docs.found, JSON.stringify(docs))
check(
  'that link resolves to the live reference',
  docs.status === 200,
  `${docs.resolved} -> ${docs.status}`,
)
check(
  'it names itself, and stays tappable on a phone',
  typeof docs.label === 'string' &&
    docs.label.length > 3 &&
    docs.box &&
    docs.box.width >= 32 &&
    docs.box.height >= 32,
  JSON.stringify({ label: docs.label, box: docs.box }),
)

check('the header also links to the React page', react.found, JSON.stringify(react))
check(
  'that link resolves to the built React page',
  react.status === 200,
  `${react.resolved} -> ${react.status}`,
)
check(
  'the React link names itself, and stays tappable on a phone',
  typeof react.label === 'string' &&
    react.label.length > 3 &&
    react.box &&
    react.box.width >= 32 &&
    react.box.height >= 32,
  JSON.stringify({ label: react.label, box: react.box }),
)

await browser.close()
finish()
