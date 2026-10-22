import assert from 'node:assert/strict'
import { test } from 'node:test'

import { missingVersions } from './verify-published.mjs'

const published = (versions) =>
  new Map(Object.entries(versions).map(([name, list]) => [name, new Set(list)]))

test('reports nothing when every released version is on the registry', () => {
  const entries = [
    { name: 'hugframe', version: '2.0.1' },
    { name: '@hugframe/react', version: '0.1.0' },
  ]

  const versions = published({ hugframe: ['2.0.1'], '@hugframe/react': ['0.1.0'] })

  assert.deepEqual(missingVersions(entries, versions), [])
})

test('reports exactly the released version the registry lacks', () => {
  const entries = [
    { name: 'hugframe', version: '2.0.1' },
    { name: '@hugframe/react', version: '0.1.0' },
  ]

  const versions = published({ hugframe: ['2.0.1'], '@hugframe/react': [] })

  assert.deepEqual(missingVersions(entries, versions), [
    { name: '@hugframe/react', version: '0.1.0' },
  ])
})

test('treats a package with no releases as complete', () => {
  assert.deepEqual(missingVersions([], new Map()), [])
})
