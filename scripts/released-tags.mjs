import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))

// The release workflow passes the paths release-please reported on its output;
// each one's tag is derived the same way the action derives it, so a package
// whose component is not its package name still resolves.
const paths = JSON.parse(process.env.PATHS_RELEASED ?? '[]')
const config = await readJson('release-please-config.json')

for (const path of paths) {
  const manifest = await readJson(join(path, 'package.json'))
  const component = config.packages?.[path]?.component ?? manifest.name
  console.log(`${component}-v${manifest.version}`)
}
