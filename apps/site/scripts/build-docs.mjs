import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Marked } from 'marked'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const read = (path) => readFile(join(root, path), 'utf8')

const [layout, tokens, shell, styles, chrome] = await Promise.all([
  read('docs/layout.html'),
  read('src/demo/theme.css'),
  read('src/site/site.css'),
  read('docs/docs.css'),
  read('src/site/chrome.html'),
])

// The header and footer share one source with the demo, so the build splits the partial
// at its marker rather than keeping a second copy of the markup here.
const [header, footer] = chrome.split('<!-- site:footer -->')

const fill = (markup, values) =>
  Object.entries(values).reduce(
    (next, [key, value]) => next.replaceAll(`{{${key}}}`, () => value),
    markup,
  )

const SITE_ORIGIN = 'https://tiriana.github.io/hugframe/'

// The README is written for npm, where the site is absolute. A generated page lives one
// level under the deployment root, so an absolute site link is rewritten to that page's
// own relative prefix and a preview never leaves for production.
const toRelative = (href, rewrites) => {
  const bare = SITE_ORIGIN.slice(0, -1)
  if (href !== SITE_ORIGIN && href !== bare && !href.startsWith(SITE_ORIGIN)) return href
  const next = href === bare ? '../' : `../${href.slice(SITE_ORIGIN.length)}`
  rewrites.push(`${href} -> ${next}`)
  return next
}

// Both pages share the shell, the styles and the chrome and differ only in these fields;
// the route drives the chrome hrefs and which nav item marks itself current.
const pages = [
  {
    source: 'docs/api.md',
    out: '.api-docs',
    route: 'api',
    title: 'hugframe API reference',
    description:
      'API reference for hugframe: an iframe that hugs its content, then morphs into a chromeless full-window view.',
  },
  {
    source: '../../packages/react/README.md',
    out: '.react-docs',
    route: 'react',
    title: '@hugframe/react',
    description: 'Install, usage and API for @hugframe/react, the React wrapper around hugframe.',
  },
]

const build = async (page) => {
  const markdown = await read(page.source)

  // `marked` leaves headings id-less, and the page's own contents list needs anchors. Slugs
  // come from the heading text with its inline markup stripped, de-duplicated with a numeric
  // suffix so repeated headings stay addressable. The state is per page, or the second page
  // would inherit the first's headings and numbering.
  const seen = new Map()
  const headings = []
  const slug = (text) => {
    const base =
      text
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section'
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count ? `${base}-${count}` : base
  }

  const rewrites = []
  const parser = new Marked()
  parser.use({
    renderer: {
      heading({ tokens: headingTokens, depth }) {
        const inner = this.parser.parseInline(headingTokens)
        const id = slug(inner.replace(/<[^>]+>/g, '').replace(/&(?:#\d+|[a-z]\w*);/gi, ''))
        if (depth <= 3) headings.push({ depth, id, inner })
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`
      },
    },
    walkTokens(token) {
      if (token.href) token.href = toRelative(token.href, rewrites)
    },
  })

  const content = parser.parse(markdown, { gfm: true })

  // The contents list: every `##` section, each carrying its `###` children.
  const link = ({ id, inner }) => `<a href="#${id}">${inner}</a>`
  const toc = `<ol class="toc__list">${headings
    .reduce((sections, heading) => {
      if (heading.depth === 2) sections.push({ ...heading, children: [] })
      else sections.at(-1)?.children.push(heading)
      return sections
    }, [])
    .map(
      (section) =>
        `<li>${link(section)}${
          section.children.length
            ? `<ol class="toc__sub">${section.children.map((child) => `<li>${link(child)}</li>`).join('')}</ol>`
            : ''
        }</li>`,
    )
    .join('')}</ol>`

  // Each generated page has no build step of its own and must ship as one self-contained
  // file with no runtime fetch, so the token sheet, the shared shell, the reading styles and
  // the chrome are all inlined. It is one level deep, so home is `../` and the two reading
  // pages point at each other with `../api/` and `../react/`.
  const current = (route) => (page.route === route ? ' aria-current="page"' : '')
  const chromeValues = {
    home: '../',
    api: page.route === 'api' ? './' : '../api/',
    react: page.route === 'react' ? './' : '../react/',
    'demo-current': '',
    'api-current': current('api'),
    'react-current': current('react'),
  }

  const document = layout
    .replaceAll('{{title}}', () => page.title)
    .replaceAll('{{description}}', () => page.description)
    .replaceAll('{{styles}}', () => `${tokens}\n${shell}\n${styles}`)
    .replaceAll('{{header}}', () => fill(header, chromeValues).trim())
    .replaceAll('{{footer}}', () => fill(footer, chromeValues).trim())
    .replaceAll('{{toc}}', () => toc)
    .replaceAll('{{content}}', () => content)

  const out = join(root, page.out)
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'index.html'), document)

  console.log(`docs: wrote ${page.out}/index.html`)
  for (const rewrite of rewrites) console.log(`docs: ${page.route}: rewrote ${rewrite}`)
}

for (const page of pages) await build(page)
