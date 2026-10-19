import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { marked } from 'marked'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.api-docs')

const read = (path) => readFile(join(root, path), 'utf8')

const [markdown, layout, styles] = await Promise.all([
  read('docs/api.md'),
  read('docs/layout.html'),
  read('docs/docs.css'),
])

// The layout is a full document with three placeholders; nothing else is templated,
// so the page ships as a single self-contained file with no external requests.
const page = layout
  .replaceAll('{{title}}', () => 'hugframe API reference')
  .replaceAll('{{styles}}', () => styles)
  .replaceAll('{{content}}', () => marked.parse(markdown, { gfm: true }))

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await writeFile(join(out, 'index.html'), page)

console.log('docs: wrote .api-docs/index.html')
