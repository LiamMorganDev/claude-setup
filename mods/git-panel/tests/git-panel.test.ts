import { expect, test } from 'claude-code/testing'

import { age, hunks, isBranchName, parseNumstat, parsePrs, parseStash, parseStatus, parseWorktrees, samePath, shortName, slugOf } from '../hooks/git'

test('parseStatus splits staged, unstaged and untracked, and reads ahead/behind', () => {
  const out = [
    '# branch.oid abc',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -3',
    '1 MM N... 100644 100644 100644 aaa bbb src/a file.ts',
    '1 A. N... 000000 100644 100644 000 ccc src/new.ts',
    '2 R. N... 100644 100644 100644 ddd eee R100 src/renamed.ts',
    'src/old.ts',
    '? notes.md',
    '',
  ].join('\0')
  const { head, changes } = parseStatus(out)
  expect(head).toEqual({ branch: 'main', upstream: 'origin/main', ahead: 2, behind: 3 })
  expect(changes.map(c => `${c.group}:${c.code}:${c.path}`)).toEqual([
    'staged:M:src/a file.ts',
    'unstaged:M:src/a file.ts',
    'staged:A:src/new.ts',
    'staged:R:src/renamed.ts',
    'untracked:?:notes.md',
  ])
})

test('parseNumstat reads counts, renames and binary files', () => {
  const out = ['3\t1\tsrc/a.ts', '-\t-\timg.png', '5\t0\t', 'old.ts', 'new.ts', ''].join('\0')
  const map = parseNumstat(out)
  expect(map.get('src/a.ts')).toEqual([3, 1])
  expect(map.get('img.png')).toEqual([0, 0])
  expect(map.get('new.ts')).toEqual([5, 0])
})

test('parseWorktrees lists branches and skips bare and deleted worktrees', () => {
  const out =
    'worktree D:/code/app\nHEAD 111\nbranch refs/heads/main\n\n' +
    'worktree D:/code/app/.worktrees/feat-x\nHEAD 222\nbranch refs/heads/feat/x\n\n' +
    'worktree D:/code/app/.worktrees/tmp\nHEAD 333\ndetached\n\nworktree D:/bare\nbare\n\n' +
    'worktree D:/code/app/.worktrees/gone\nHEAD 444\nbranch refs/heads/gone\nprunable gitdir file points to non-existent location\n'
  expect(parseWorktrees(out).map(w => `${w.branch}@${w.path}`)).toEqual([
    'main@D:/code/app',
    'feat/x@D:/code/app/.worktrees/feat-x',
    '(detached)@D:/code/app/.worktrees/tmp',
  ])
})

test('parseStash, branch names, slugs and path compare', () => {
  expect(parseStash('stash@{0}\0WIP on main\nstash@{1}\0git-panel: feat\n')).toEqual([
    { ref: 'stash@{0}', message: 'WIP on main' },
    { ref: 'stash@{1}', message: 'git-panel: feat' },
  ])
  expect(isBranchName('feat/order-labels')).toBe(true)
  expect(isBranchName('bad..name')).toBe(false)
  expect(isBranchName('-x')).toBe(false)
  expect(isBranchName('a b')).toBe(false)
  expect(slugOf('feat/order-labels')).toBe('feat-order-labels')
  expect(samePath('D:\\code\\app\\', 'd:/code/app')).toBe(true)
})

test('parsePrs keeps the newest PR per branch and reads CI and review', () => {
  const json = JSON.stringify([
    { number: 321, state: 'OPEN', isDraft: false, headRefName: 'claude/sweep', url: 'u321', reviewDecision: 'CHANGES_REQUESTED', statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'typecheck', status: 'COMPLETED', conclusion: 'FAILURE' }] },
    { number: 300, state: 'CLOSED', isDraft: false, headRefName: 'claude/sweep', url: 'u300', statusCheckRollup: [] },
    { number: 320, state: 'OPEN', isDraft: true, headRefName: 'claude/qr', url: 'u320', statusCheckRollup: [{ name: 'ci', status: 'IN_PROGRESS', conclusion: '' }] },
    { number: 318, state: 'MERGED', isDraft: false, headRefName: 'claude/rel', url: 'u318', reviewDecision: 'APPROVED', statusCheckRollup: [{ context: 'legacy', state: 'SUCCESS' }] },
  ])
  const prs = parsePrs(json)
  expect(prs['claude/sweep']).toEqual({ number: 321, url: 'u321', state: 'open', ci: 'fail', failed: 'typecheck', review: 'changes' })
  expect(prs['claude/qr']?.state).toBe('draft')
  expect(prs['claude/qr']?.ci).toBe('running')
  expect(prs['claude/rel']).toEqual({ number: 318, url: 'u318', state: 'merged', ci: 'pass', failed: '', review: 'approved' })
  expect(parsePrs('not json')).toEqual({})
})

test('shortName, age and hunks', () => {
  expect(shortName('claude/ralawise-stock-sweep-a91c2e')).toBe('ralawise-stock-sweep')
  expect(shortName('feat/bundle-image-crop')).toBe('feat/bundle-image-crop')
  expect(age(0, 5000)).toBe('')
  expect(age(1000, 13_000)).toBe('12s')
  expect(age(0 + 1, 1 + 3 * 60_000)).toBe('3m')
  expect(hunks('diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n')).toEqual(['@@ -1 +1 @@', '-a', '+b'])
})

const PROPS = { title: 'Git', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

for (const surface of ['desktop', 'terminal', 'vscode'] as const) {
  test(`pane draws worktrees, tabs and the pinned footer on ${surface}`, async ($, on) => {
    on('clock.now', async () => ({ value: 0 }))
    const drawn = await $.ui.mount({ plugin: 'git-panel', surface, component: 'Pane', requestId: 'git-panel', props: PROPS })
    expect(await drawn.find({ key: 'tab-changes' })).toBeDefined()
    expect(await drawn.find({ key: 'tab-stash' })).toBeDefined()
    expect(await drawn.find({ key: 'a-push' })).toBeDefined()
    expect(await drawn.find({ key: 'refresh' })).toBeDefined()
    await drawn.press({ key: 'new-wt' })
    expect(await drawn.find({ key: 'newwt' })).toBeDefined()
    await drawn.press({ key: 'a-more' })
    expect(await drawn.find({ key: 'm-stash' })).toBeDefined()
    await drawn.press({ key: 'tab-stash' })
    expect(await drawn.find({ key: 'stash-push' })).toBeDefined()
  })
}

// Fake git: one repo at D:/repo with one modified file; gh answers one PR.
const GIT: Record<string, string> = {
  'rev-parse': 'D:/repo\n',
  worktree: 'worktree D:/repo\nHEAD 1\nbranch refs/heads/main\n\nworktree D:/repo/.claude/worktrees/x\nHEAD 2\nbranch refs/heads/claude/x-abc123\n\n',
  status: ['# branch.head main', '# branch.ab +0 -0', '1 .M N... 100644 100644 100644 a b src/a.ts', ''].join('\0'),
  diff: '2\t1\tsrc/a.ts\0',
  'rev-list': '0\n',
  branch: 'main\nclaude/x-abc123\n',
}
const UNIFIED = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,3 @@', ' a', '-b', '+c', '+d', ''].join('\n')
const GH = JSON.stringify([{ number: 7, state: 'MERGED', isDraft: false, headRefName: 'claude/x-abc123', url: 'u7', statusCheckRollup: [] }])

for (const surface of ['desktop', 'terminal', 'vscode'] as const) {
  test(`files open diffs, discard asks first, merged worktrees get a banner on ${surface}`, async ($, on) => {
    const ran: string[][] = []
    on('process.run', async (_$, e) => {
      ran.push([...e.argv])
      if (e.argv[0] === 'gh') return { value: { exitCode: 0, stdout: GH, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      const sub = e.argv.slice(3).find(a => !a.startsWith('-')) ?? ''
      // the second worktree is clean, so it counts as removable once merged
      if (sub === 'status' && e.argv[2]?.includes('worktrees')) return { value: { exitCode: 0, stdout: '# branch.head claude/x-abc123\0', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      const out = sub === 'diff' && e.argv.includes('--cached') ? '' : sub === 'diff' && !e.argv.includes('--numstat') ? UNIFIED : sub === 'symbolic-ref' ? 'origin/main\n' : GIT[sub] ?? ''
      return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('session.cwd', async () => ({ value: 'D:/repo' }))
    on('command.register', async (_$, e) => ({ value: { command: e.name } }))
    on('session.start', async () => ({ cwd: 'D:/repo' }))
    on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
    on('clock.every', async () => ({ value: undefined }) as never)
    on('clock.after', async () => ({ value: undefined }) as never)
    on('clock.now', async () => ({ value: 0 }))
    await $.session.start({ cwd: 'D:/repo', surface, isInteractive: true })
    const drawn = await $.ui.mount({ plugin: 'git-panel', surface, component: 'Pane', requestId: 'git-panel', props: PROPS })
    const k = 'unstaged:src/a.ts'
    for (let i = 0; i < 20 && !(await drawn.find({ key: `stage-${k}` })); i++) await drawn.redraw()
    expect(await drawn.find({ key: `diff-${k}` })).toBeUndefined()
    await drawn.press({ key: `name-${k}` })
    expect(await drawn.find({ key: `diff-${k}` })).toBeDefined()
    await drawn.press({ key: `discard-${k}` })
    expect(await drawn.find({ key: 'dlg-discard' })).toBeDefined()
    await drawn.press({ key: 'dlg-cancel' })
    expect(await drawn.find({ key: 'dlg-discard' })).toBeUndefined()
    expect(ran.some(a => a.includes('restore'))).toBe(false)
    for (let i = 0; i < 20 && !(await drawn.find({ key: 'merged-ask' })); i++) await drawn.redraw()
    expect(await drawn.find({ key: 'merged-ask' })).toBeDefined()
    await drawn.press({ key: 'merged-ask' })
    expect(await drawn.find({ key: 'merged-go' })).toBeDefined()
  })
}
