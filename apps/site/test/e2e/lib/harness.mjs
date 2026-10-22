import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Every suite targets the locally built Pages output by default, never the live
// site. `run.mjs` starts the static server on an ephemeral port and passes the
// real URL through GF_BASE. Set GF_BASE yourself to point a suite elsewhere.
export const baseUrl = () => process.env.GF_BASE ?? 'http://127.0.0.1:5199/hugframe'

// The reference page lives under the deployment prefix; API_URL still overrides
// it for the rare case of comparing against a remote deployment by hand.
export const docsUrl = () => process.env.API_URL ?? `${baseUrl()}/api/`

// The React page sits beside the reference under the same deployment prefix; REACT_URL
// overrides it the same way API_URL does.
export const reactUrl = () => process.env.REACT_URL ?? `${baseUrl()}/react/`

// Screenshots are diagnostics, not assertions. They land in an ignored directory
// so a failed run leaves something to look at without dirtying the worktree.
export const shotsDir = () => {
  const dir = process.env.GF_SHOTS ?? resolve(here, '../.artifacts')
  mkdirSync(dir, { recursive: true })
  return dir
}

// Collects pass/fail results and turns any failure into a non-zero exit code, so
// the same script is useful interactively and as a CI gate.
export const createReport = (title) => {
  const results = []
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail })

  const finish = () => {
    const failed = results.filter((result) => !result.ok)
    console.log(`\n== ${title} ==`)
    for (const result of results) {
      const detail = result.ok ? '' : `\n        -> ${result.detail}`
      console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${detail}`)
    }
    console.log(`\n${results.length - failed.length}/${results.length} passed`)
    process.exitCode = failed.length === 0 ? 0 : 1
  }

  return { check, finish }
}
