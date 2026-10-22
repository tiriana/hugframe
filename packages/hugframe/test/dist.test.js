import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { transform } from 'lightningcss'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')

const declaredZIndex = (css) => {
  const match = /--hug-z-index:\s*([^;}]+)/.exec(css)
  assert.ok(match, 'the stylesheet should declare --hug-z-index')
  return Number(match[1].trim())
}

// The stacking level lives in two places, and a CSS minifier sits between them.
// Lightning CSS, which Vite builds with, reduces the precision of long numeric
// literals, so a value with too many significant digits reaches consumers as a
// different number than the one the code exports. Nothing else would notice.
test('the stylesheet and the exported constant agree, minified or not', async () => {
  const [{ HUGFRAME_Z_INDEX }, stylesheet] = await Promise.all([
    import('../dist/index.js'),
    read('dist/hugframe-core.css'),
  ])

  assert.equal(declaredZIndex(stylesheet), HUGFRAME_Z_INDEX)

  const minified = transform({
    filename: 'hugframe-core.css',
    code: Buffer.from(stylesheet),
    minify: true,
  }).code.toString()

  assert.equal(declaredZIndex(minified), HUGFRAME_Z_INDEX)
})

// npm shows its TypeScript indicator only when the manifest carries a top-level
// `types`, and legacy resolution ignores `exports` entirely, so every target the
// manifest names has to exist in the published output.
test('every entry point the manifest promises exists in the built output', async () => {
  const manifest = JSON.parse(await read('package.json'))

  assert.equal(
    typeof manifest.types,
    'string',
    'the manifest needs a top-level types field for npm and for legacy resolution',
  )

  const conditions = (entry) =>
    typeof entry === 'string' ? [entry] : Object.values(entry).flatMap(conditions)

  const targets = [
    manifest.types,
    manifest.main,
    ...Object.values(manifest.exports).flatMap(conditions),
  ].filter(Boolean)

  for (const target of targets) await access(join(root, target))
})

// Importing the package registers the <hug-frame> element. A consumer who writes
// it in HTML may never reference the class, so a bundler that believes the module
// is side-effect free would drop the registration and the element would silently
// never upgrade.
test('importing the package registers the element', async () => {
  const [entry, manifest] = await Promise.all([
    read('dist/index.js'),
    read('package.json').then(JSON.parse),
  ])

  assert.match(
    entry,
    /customElements\.define\(\s*["']hug-frame["']/,
    'the built entry should register the element',
  )
  assert.notEqual(
    manifest.sideEffects,
    false,
    'claiming to be side-effect free would let a bundler drop the registration',
  )
})
