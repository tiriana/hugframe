import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Serves a built site under the same /hugframe prefix the Pages deployment
// resolves, so a local run exercises identical absolute URLs. Pass 0 as the port
// to let the kernel pick a free one; the chosen port is printed on stdout.
const root = resolve(process.argv[2] ?? resolve(here, '../../.pages'))
const port = Number(process.argv[3] ?? 5199)
const prefix = '/hugframe'

// The built site bundles the library into its own pages, so dist is never part of
// the output. A fixture that mounts the real engine instead of a fake needs it, so
// it is served here under its own path, with the CORS header that lets a page from
// another origin import the module.
const distPrefix = `${prefix}/dist/`
const distRoot = resolve(here, '../../../../packages/hugframe/dist')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
  const pathname = decodeURIComponent(url.pathname)

  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end('outside the deployment prefix')
    return
  }
  if (pathname === prefix) {
    response.writeHead(301, { location: `${prefix}/` }).end()
    return
  }

  let relative = normalize(pathname.slice(prefix.length)).replace(/^\/+/, '')
  if (relative === '' || relative.endsWith('/')) relative = join(relative, 'index.html')

  const isDist = pathname.startsWith(distPrefix)
  const base = isDist ? distRoot : root
  if (isDist) relative = relative.slice('dist/'.length)

  const file = join(base, relative)
  if (!file.startsWith(base)) {
    response.writeHead(403).end('forbidden')
    return
  }

  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    const headers = {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
    }
    if (isDist) headers['access-control-allow-origin'] = '*'
    response.writeHead(200, headers)
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${pathname}`)
  }
})

server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  console.log(`serving ${root} at http://127.0.0.1:${address.port}${prefix}/`)
})
