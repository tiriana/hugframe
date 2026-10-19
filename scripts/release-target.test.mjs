import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const script = join(here, 'release-target.mjs')

const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))

// The expected tags are read from the same two files the publish workflow reads,
// so a version bump does not invalidate the test.
const config = await readJson('release-please-config.json')
const packages = await Promise.all(
  Object.entries(config.packages ?? {}).map(async ([path, options]) => {
    const manifest = await readJson(join(path, 'package.json'))
    return { path, component: options.component ?? manifest.name, version: manifest.version }
  }),
)

const rejects = async (tag, pattern) => {
  await assert.rejects(
    () => run(process.execPath, [script, tag]),
    (error) => {
      assert.match(String(error.stderr), pattern)
      return true
    },
  )
}

test('resolves every configured package from its own tag', async () => {
  assert.ok(packages.length > 0, 'the release config should name at least one package')

  for (const { path, component, version } of packages) {
    const { stdout } = await run(process.execPath, [script, `${component}-v${version}`])
    assert.equal(stdout.trim(), path)
  }
})

test('refuses a tag whose version the manifest does not carry', async () => {
  await rejects(`${packages[0].component}-v999.0.0`, /carries version/)
})

test('refuses a tag that names no configured package', async () => {
  await rejects('not-a-package-v1.0.0', /matches 0 packages/)
})

test('refuses a tag that is not <component>-v<version>', async () => {
  await rejects('v1.0.0', /is not a <component>-v<version> tag/)
})
