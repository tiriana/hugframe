import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')

const SUITES = [
  'verify.mjs',
  'verify-sizing.mjs',
  'verify-header.mjs',
  'verify-docs.mjs',
  'verify-options.mjs',
  'verify-playground.mjs',
]

const run = (command, args, env) =>
  new Promise((done) => {
    const child = spawn(command, args, {
      cwd: repo,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    })
    child.on('close', (code) => done(code ?? 1))
  })

// Ask the kernel for a free port and read it back off the server's own stdout,
// so concurrent runs never collide on a fixed number.
const startServer = async () => {
  const child = spawn(
    process.execPath,
    [resolve(here, 'serve-pages.mjs'), resolve(repo, '.pages'), '0'],
    {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )

  const port = await new Promise((done, fail) => {
    let output = ''
    const timer = setTimeout(
      () => fail(new Error('the static server did not start in time')),
      10_000,
    )
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\/hugframe\//)
      if (match) {
        clearTimeout(timer)
        done(Number(match[1]))
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      fail(new Error(`the static server exited early with code ${code}`))
    })
  })

  return { child, port }
}

const requested = process.argv.slice(2)
const suites = requested.length ? SUITES.filter((suite) => requested.includes(suite)) : SUITES
if (suites.length === 0) {
  console.error(
    `no known suite in ${JSON.stringify(requested)}; expected one of ${SUITES.join(', ')}`,
  )
  process.exit(1)
}

console.log('e2e: building the Pages output')
if ((await run('npm', ['run', 'build:pages'])) !== 0) {
  console.error('e2e: the build failed, so no suite was run')
  process.exit(1)
}

const { child: server, port } = await startServer()
const base = `http://127.0.0.1:${port}/hugframe`
console.log(`e2e: serving the build at ${base}`)

const failed = []
try {
  for (const suite of suites) {
    if ((await run(process.execPath, [resolve(here, suite)], { GF_BASE: base })) !== 0)
      failed.push(suite)
  }
} finally {
  server.kill('SIGTERM')
  await once(server, 'close')
}

if (failed.length > 0) {
  console.error(`\ne2e: ${failed.length} of ${suites.length} suites failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`\ne2e: ${suites.length} suites passed`)
