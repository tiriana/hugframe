import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pushLostRace, stalePreviews } from './prune-previews.mjs'

const states = (entries) => new Map(entries)

test('keeps an open preview and removes a closed one', () => {
  const result = stalePreviews(
    ['pr-1', 'pr-2'],
    states([
      [1, 'open'],
      [2, 'closed'],
    ]),
  )

  assert.deepEqual(result, { remove: ['pr-2'], ignored: [] })
})

test('removes a preview whose pull request is missing', () => {
  assert.deepEqual(stalePreviews(['pr-9'], states([])), { remove: ['pr-9'], ignored: [] })
})

test('leaves a name that is not pr-<number> alone and reports it', () => {
  assert.deepEqual(stalePreviews(['pr-abc', 'latest'], states([])), {
    remove: [],
    ignored: ['pr-abc', 'latest'],
  })
})

test('returns only the stale directories from a mix', () => {
  const result = stalePreviews(
    ['pr-1', 'pr-2', 'pr-3', 'pr-abc'],
    states([
      [1, 'open'],
      [2, 'closed'],
      [3, 'open'],
    ]),
  )

  assert.deepEqual(result, { remove: ['pr-2'], ignored: ['pr-abc'] })
})

test('returns nothing for an empty list', () => {
  assert.deepEqual(stalePreviews([], states([])), { remove: [], ignored: [] })
})

test('treats a non-fast-forward push rejection as a lost race', () => {
  const error = new Error('Command failed: git push origin gh-pages')
  error.stderr =
    'To https://github.com/tiriana/hugframe.git\n ! [rejected]        gh-pages -> gh-pages (fetch first)\nerror: failed to push some refs'

  assert.equal(pushLostRace(error), true)
})

test('treats a lone fetch-first marker as a lost race', () => {
  const error = new Error('Command failed: git push origin gh-pages')
  error.stderr = 'remote: (fetch first)'

  assert.equal(pushLostRace(error), true)
})

test('does not treat other push failures as a lost race', () => {
  const error = new Error('Command failed: git push origin gh-pages')
  error.stderr = 'remote: Invalid username or password.\nfatal: Authentication failed'

  assert.equal(pushLostRace(error), false)
})

test('does not treat a missing branch as a lost race', () => {
  const error = new Error('Command failed: git push origin gh-pages')
  error.stderr = 'error: src refspec gh-pages does not match any'

  assert.equal(pushLostRace(error), false)
})
