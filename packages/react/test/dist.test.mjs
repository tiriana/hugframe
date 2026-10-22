import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')

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
    manifest.module,
    ...Object.values(manifest.exports).flatMap(conditions),
  ].filter(Boolean)

  for (const target of targets) await access(join(root, target))
})

// A bundled copy of react or the engine would be a second module instance, so the
// context or element a consumer sets up would not be the one the library reads.
// The build keeps both external, which the entry's import specifiers show.
test('the built entry keeps react and hugframe external', async () => {
  const entry = await read('dist/index.js')

  for (const specifier of ['react', 'hugframe', 'react/jsx-runtime']) {
    assert.match(
      entry,
      new RegExp(`from\\s+["']${specifier}["']`),
      `the built entry should import ${specifier} rather than inline it`,
    )
  }
})
