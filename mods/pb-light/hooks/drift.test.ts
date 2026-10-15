import { expect, test } from 'claude-code/testing'

import { compare, mainCheckout, parseEnv } from './drift'

const posts = (extra: object = {}) => ({
  id: 'abc',
  name: 'posts',
  listRule: '',
  created: '2020',
  fields: [
    { id: 'f1', name: 'title', type: 'text', required: true },
    { id: 'f2', name: 'body', type: 'editor', required: false },
  ],
  indexes: ['CREATE INDEX  a ON posts (title)'],
  ...extra,
})

test('same schema with different ids, key order and index spacing is in sync', () => {
  const live = { ...posts({ id: 'zzz', created: '2024', indexes: ['CREATE INDEX a ON posts (title)'] }) }
  live.fields = [{ required: false, type: 'editor', name: 'body', id: 'x' } as never, { id: 'y', name: 'title', type: 'text', required: true }]
  expect(compare([posts()], [live])).toEqual({ repoAhead: [], liveAhead: [] })
})

test('reports repo-only fields, changed rules and live-only collections', () => {
  const repo = posts({ listRule: '@request.auth.id != ""' })
  repo.fields.push({ id: 'f3', name: 'slug', type: 'text', required: false })
  const d = compare([repo], [posts(), { name: 'extra', fields: [] }, { name: '_superusers', fields: [] }])
  expect(d.repoAhead).toEqual(['+ posts.slug', '~ posts rules/options'])
  expect(d.liveAhead).toEqual(['collection extra'])
})

test('parseEnv reads quoted values and strips comments', () => {
  expect(parseEnv('A=1\nPB_ADMIN_EMAIL="me@x.io"  # admin\n# c\nexport B=\'two\'')).toEqual({ A: '1', PB_ADMIN_EMAIL: 'me@x.io', B: 'two' })
})

test('mainCheckout finds the main repo from a worktree .git file', () => {
  expect(mainCheckout('gitdir: D:/code/app/.git/worktrees/wt-1\n')).toBe('D:/code/app')
  expect(mainCheckout('gitdir: D:\\code\\app\\.git\\worktrees\\wt-1')).toBe('D:/code/app')
  expect(mainCheckout('gitdir: /repo/.git/modules/sub')).toBeUndefined()
})
