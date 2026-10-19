import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pages = resolve(root, '.pages')

await rm(pages, { recursive: true, force: true })
await mkdir(pages, { recursive: true })

await cp(resolve(root, '.demo-dist'), pages, { recursive: true })
await cp(resolve(root, '.api-docs'), resolve(pages, 'api'), { recursive: true })

// without this, Pages runs Jekyll over the branch and drops files it does not understand
await writeFile(resolve(pages, '.nojekyll'), '')
