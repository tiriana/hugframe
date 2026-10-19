import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { marked } from 'marked'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.api-docs')

const read = (path) => readFile(join(root, path), 'utf8')

const [markdown, layout, tokens, shell, styles, chrome] = await Promise.all([
  read('docs/api.md'),
  read('docs/layout.html'),
  read('src/demo/theme.css'),
  read('src/site/site.css'),
  read('docs/docs.css'),
  read('src/site/chrome.html'),
])

// The header and footer share one source with the demo, so the build splits the partial
// at its marker rather than keeping a second copy of the markup here.
const [header, footer] = chrome.split('<!-- site:footer -->')

// The API page has no build step of its own and must ship as one self-contained file with
// no runtime fetch, so the token sheet, the shared shell, the reading styles and the chrome
// are all inlined. The reference lives at /api/, so it links home with `../` and marks its
// own section current.
const fill = (markup, values) =>
  Object.entries(values).reduce(
    (next, [key, value]) => next.replaceAll(`{{${key}}}`, () => value),
    markup,
  )

const chromeValues = {
  home: '../',
  api: './',
  'demo-current': '',
  'api-current': ' aria-current="page"',
}

const page = layout
  .replaceAll('{{title}}', () => 'hugframe API reference')
  .replaceAll('{{styles}}', () => `${tokens}\n${shell}\n${styles}`)
  .replaceAll('{{header}}', () => fill(header, chromeValues).trim())
  .replaceAll('{{footer}}', () => fill(footer, chromeValues).trim())
  .replaceAll('{{content}}', () => marked.parse(markdown, { gfm: true }))

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await writeFile(join(out, 'index.html'), page)

console.log('docs: wrote .api-docs/index.html')
