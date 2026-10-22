import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))

export const missingVersions = (entries, published) =>
  entries.filter(({ name, version }) => !published.get(name)?.has(version))

const registryVersions = async (name) => {
  const response = await fetch(`https://registry.npmjs.org/${name.replace(/\//g, '%2f')}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })

  if (response.status === 404) return new Set()

  if (!response.ok) throw new Error(`the registry answered ${response.status} for ${name}`)

  const body = await response.json()
  return new Set(Object.keys(body.versions ?? {}))
}

const releasedEntries = async () => {
  const config = await readJson('release-please-config.json')
  const released = await readJson('.release-please-manifest.json')

  return Promise.all(
    Object.keys(config.packages ?? {})
      .filter((path) => released[path] !== undefined)
      .map(async (path) => {
        const manifest = await readJson(join(path, 'package.json'))
        return { name: manifest.name, version: released[path] }
      }),
  )
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const main = async () => {
  const waitIndex = process.argv.indexOf('--wait')
  const requested = waitIndex === -1 ? 0 : Number(process.argv[waitIndex + 1])
  const waitSeconds = Number.isFinite(requested) && requested > 0 ? requested : 0

  const entries = await releasedEntries()
  const deadline = Date.now() + waitSeconds * 1000

  for (;;) {
    const published = new Map()
    for (const { name } of entries) published.set(name, await registryVersions(name))

    const missing = missingVersions(entries, published)

    if (missing.length === 0) {
      console.log(`verify-published: all ${entries.length} released versions are on the registry`)
      return
    }

    if (Date.now() >= deadline) {
      for (const { name, version } of missing) {
        console.error(`verify-published: ${name}@${version} is missing from the registry`)
      }
      process.exitCode = 1
      return
    }

    console.log(`verify-published: ${missing.length} released version(s) not yet on the registry`)
    await sleep(15000)
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
