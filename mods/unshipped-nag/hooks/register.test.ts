import { expect, test } from 'claude-code/testing'

import { message, parse } from './register'

test('parse reads ahead count and changed paths, renames once', () => {
  const out = [
    '# branch.head main',
    '# branch.ab +2 -0',
    '1 .M N... 100644 100644 100644 a b src/a b.ts',
    '2 R. N... 100644 100644 100644 c d R100 new.ts',
    'old.ts',
    '? notes.md',
    '',
  ].join('\0')
  expect(parse(out)).toEqual({ ahead: 2, paths: ['src/a b.ts', 'new.ts', 'notes.md'] })
})

test('message only nags for stale changes or unpushed commits', () => {
  expect(message(3, 10 * 60_000, 0)).toBe('')
  expect(message(3, 2 * 3600_000, 0)).toBe('Unshipped: 3 files uncommitted (oldest 2h)')
  expect(message(0, 0, 1)).toBe('Unshipped: 1 commit not pushed')
})
