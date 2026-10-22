import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const UMBRELLA = 'pr-preview'
const BRANCH = 'gh-pages'
const API = 'https://api.github.com'
const AUTHOR = 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>'
const ATTEMPTS = 3

export const stalePreviews = (directories, states) => {
  const remove = []
  const ignored = []

  for (const directory of directories) {
    const match = /^pr-(\d+)$/.exec(directory)

    if (match === null) {
      ignored.push(directory)
      continue
    }

    if (states.get(Number(match[1])) !== 'open') remove.push(directory)
  }

  return { remove, ignored }
}

export const pushLostRace = (error) => {
  const output = [error?.stdout, error?.stderr, error?.message].filter(Boolean).join('\n')
  return output.includes('[rejected]') || output.includes('fetch first')
}

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options })

const pullRequestState = async (repo, token, number) => {
  const response = await fetch(`${API}/repos/${repo}/pulls/${number}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  })

  if (response.status === 404) return undefined

  if (!response.ok)
    throw new Error(`the API answered ${response.status} for pull request ${number}`)

  const body = await response.json()
  return body.state
}

const listDirectories = async (checkout) => {
  try {
    const entries = await readdir(join(checkout, UMBRELLA), { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const repository = () => {
  const repoIndex = process.argv.indexOf('--repo')
  if (repoIndex !== -1) return process.argv[repoIndex + 1]

  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY

  try {
    const remote = git(['remote', 'get-url', 'origin']).trim()
    return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote)?.[1]
  } catch {
    return undefined
  }
}

const main = async () => {
  const token = process.env.GH_TOKEN
  if (token === undefined || token === '') {
    throw new Error('GH_TOKEN is not set; the sweep reads pull requests and pushes to gh-pages')
  }

  const repo = repository()
  if (repo === undefined || !/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error(
      'set GITHUB_REPOSITORY, pass --repo owner/name, or run inside a clone of the repository',
    )
  }
  const [owner, name] = repo.split('/')
  const dryRun = process.argv.includes('--dry-run')
  const remote = `https://x-access-token:${token}@github.com/${owner}/${name}.git`

  // gh-pages takes a push from every preview deploy, so losing the push race is
  // expected; each attempt re-clones and decides again from the branch as it is now.
  const attempt = async () => {
    const checkout = await mkdtemp(join(tmpdir(), 'prune-previews-'))

    try {
      git(['clone', '--depth', '1', '--branch', BRANCH, remote, checkout])

      const directories = await listDirectories(checkout)
      const numbers = [
        ...new Set(
          directories
            .map((directory) => /^pr-(\d+)$/.exec(directory)?.[1])
            .filter((n) => n !== undefined),
        ),
      ]

      const states = new Map()
      for (const number of numbers) {
        states.set(Number(number), await pullRequestState(repo, token, number))
      }

      const { remove, ignored } = stalePreviews(directories, states)

      for (const directory of ignored) {
        console.log(
          `prune-previews: ${UMBRELLA}/${directory} is not named pr-<number>, leaving it alone`,
        )
      }

      if (remove.length === 0) {
        console.log(
          `prune-previews: every preview under ${UMBRELLA}/ belongs to an open pull request`,
        )
        return false
      }

      const prNumbers = remove
        .map((directory) => Number(/^pr-(\d+)$/.exec(directory)[1]))
        .sort((a, b) => a - b)
      const summary = prNumbers.map((number) => `#${number}`).join(', ')

      if (dryRun) {
        for (const directory of remove) {
          console.log(`prune-previews: would remove ${UMBRELLA}/${directory}`)
        }
        console.log(`prune-previews: dry run, keeping ${summary} in place`)
        return false
      }

      for (const directory of remove) {
        git(['rm', '-r', '--quiet', '--ignore-unmatch', join(UMBRELLA, directory)], {
          cwd: checkout,
        })
      }

      git(
        [
          '-c',
          'user.name=github-actions[bot]',
          '-c',
          'user.email=41898282+github-actions[bot]@users.noreply.github.com',
          'commit',
          '--author',
          AUTHOR,
          '-m',
          `chore: prune stale previews for ${summary}`,
        ],
        { cwd: checkout },
      )

      git(['push', 'origin', BRANCH], { cwd: checkout })

      console.log(`prune-previews: removed ${summary}`)
      return true
    } finally {
      await rm(checkout, { recursive: true, force: true })
    }
  }

  for (let attemptNumber = 1; attemptNumber <= ATTEMPTS; attemptNumber++) {
    try {
      const pushed = await attempt()

      if (pushed && attemptNumber > 1) {
        console.log(`prune-previews: push lost a race, succeeded on attempt ${attemptNumber}`)
      }
      return
    } catch (error) {
      if (!pushLostRace(error)) throw error

      if (attemptNumber === ATTEMPTS) {
        throw new Error(
          `prune-previews: ${BRANCH} kept moving; the push lost the race on all ${ATTEMPTS} attempts, the next run will try again`,
          { cause: error },
        )
      }
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
