import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'src')
const target = resolve(root, 'dist')

await mkdir(target, { recursive: true })

const sheets = (await readdir(source)).filter((name) => name.endsWith('.css'))
await Promise.all(sheets.map((name) => copyFile(join(source, name), join(target, name))))
