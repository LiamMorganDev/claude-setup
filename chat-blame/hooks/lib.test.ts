import { expect, test } from 'claude-code/testing'

import { labelOf, normPath, stamp } from './lib'

test('labelOf skips wrapper tags and trims long prompts', () => {
  expect(labelOf(['<command-name>/x</command-name>', 'fix the navbar spacing on mobile please, it overlaps the header'])).toBe(
    'fix the navbar spacing on mobile please…',
  )
  expect(labelOf([])).toBe('untitled chat')
})

test('stamp replaces, normalises and prunes old entries', () => {
  const now = 100 * 24 * 3600_000
  const map = { 'd:/old.ts': { s: 'a', l: 'x', t: 0 }, 'd:/keep.ts': { s: 'a', l: 'x', t: now - 1000 } }
  const out = stamp(map, 'D:\\Code\\A.ts', { s: 'b', l: 'y', t: now })
  expect(Object.keys(out).sort()).toEqual(['d:/code/a.ts', 'd:/keep.ts'])
  expect(normPath('C:\\X\\')).toBe('c:/x')
})
