import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// release-please tags every package it releases as `<component>-v<version>`.
const TAG_PATTERN = /^(?<component>.+)-v(?<version>\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/

const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))

const tag = process.argv[2] ?? ''
const match = TAG_PATTERN.exec(tag)

if (!match) {
  console.error(`release-target: ${JSON.stringify(tag)} is not a <component>-v<version> tag`)
  process.exit(1)
}

const config = await readJson('release-please-config.json')
const found = []

for (const [path, options] of Object.entries(config.packages ?? {})) {
  const manifest = await readJson(join(path, 'package.json'))
  if ((options.component ?? manifest.name) === match.groups.component) {
    found.push({ path, version: manifest.version })
  }
}

// Publishing the wrong package is worse than publishing none, so a tag that
// names no package or more than one is an error rather than a guess.
if (found.length !== 1) {
  console.error(
    `release-target: ${match.groups.component} matches ${found.length} packages, expected exactly one`,
  )
  process.exit(1)
}

const [{ path, version }] = found

if (version !== match.groups.version) {
  console.error(
    `release-target: ${path} carries version ${version}, but the tag names ${match.groups.version}`,
  )
  process.exit(1)
}

console.log(path)
