import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Every visual value in the stylesheet has to be reachable through a --hug-*
// custom property, so a wrapper can expose the appearance as props. This guards
// that: with the token declarations removed, no visual literal should remain
// except the ones listed below.
//
// Limit worth knowing: unitless numbers (z-index levels, opacity states) are
// deliberately not matched, because zero and one are structural.
const ALLOWED = new Map([
  [
    '240px',
    'the first-paint fallback in var(--hug-initial-height, ...), which must equal the JS default',
  ],
  ['0s', 'a zero-length transition delay is structural'],
])

const PATTERNS = [
  [/#[\da-f]{3,8}\b/gi, 'a colour literal'],
  [/rgba?\(/gi, 'a colour function'],
  [/hsla?\(/gi, 'a colour function'],
  [/[\d.]+(?:px|rem|em)\b/gi, 'a length literal'],
  [/[\d.]+m?s\b/gi, 'a time literal'],
  [/(?:saturate|blur|scale|opacity)\(\s*[\d.]+/gi, 'a numeric argument to a visual function'],
]

test('every visual value is a token or a documented structural exception', async () => {
  const css = await readFile(join(root, 'dist', 'hugframe.css'), 'utf8')
  const outsideTokens = css.replace(/--hug-[\w-]+\s*:[^;]+;/g, '')

  const hardcoded = new Set()
  for (const [pattern, label] of PATTERNS) {
    for (const match of outsideTokens.matchAll(pattern)) {
      if (!ALLOWED.has(match[0])) hardcoded.add(`${label}: ${match[0]}`)
    }
  }

  assert.deepEqual(
    [...hardcoded],
    [],
    'these values cannot be overridden by a consumer; make them --hug-* tokens, or add them to ALLOWED with a reason',
  )
})

// The other half of the same property: a token nothing reads is a knob that does
// nothing, and would become a prop that does nothing in a wrapper.
test('every declared token is read somewhere in the stylesheet', async () => {
  const css = await readFile(join(root, 'dist', 'hugframe.css'), 'utf8')

  const declared = new Set([...css.matchAll(/--hug-([\w-]+)\s*:/g)].map((match) => match[1]))
  const read = new Set([...css.matchAll(/var\(\s*--hug-([\w-]+)/g)].map((match) => match[1]))

  assert.deepEqual(
    [...declared].filter((name) => !read.has(name)),
    [],
    'these tokens are declared but never read; remove them or use them',
  )
})
