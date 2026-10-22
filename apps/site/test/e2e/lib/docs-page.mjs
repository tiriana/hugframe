// Shared measurement for the generated reading pages. The reference and the React page wear the
// same shell, so they are probed the same way and each suite keeps its own assertions on top.
export const probePage = async (browser, url, width, height) => {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)))
  await page.goto(url, { waitUntil: 'load' })
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
    const current = document.querySelector('.masthead__nav a[aria-current="page"]')

    return {
      docScrollWidth: doc.scrollWidth,
      viewport: window.innerWidth,
      tables: tables.length,
      widest,
      headings: document.querySelectorAll('h2').length,
      codeBlocks: document.querySelectorAll('pre').length,
      icon: document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mastheadCurrent: current ? current.textContent.trim() : null,
      articleLinks: [...document.querySelectorAll('article.page a')].map((a) =>
        a.getAttribute('href'),
      ),
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

// Clicks the last contents entry and reports where it landed and what it marked. The page
// scrolls smoothly, so the jump is made instant first: the assertion is about the target, not
// the animation.
export const clickLastTocEntry = async (browser, url) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
  })
  const entry = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.toc__list a')].at(-1)
    last.click()
    return last.hash
  })
  await page.waitForTimeout(300)
  const followed = await page.evaluate((hash) => {
    const heading = document.querySelector(hash)
    const rect = heading?.getBoundingClientRect()
    return {
      marked: document.querySelector('.toc__list a[aria-current]')?.getAttribute('href') ?? null,
      onScreen: rect ? rect.top >= -2 && rect.top < window.innerHeight : false,
    }
  }, entry)
  await page.close()
  return { entry, ...followed }
}
