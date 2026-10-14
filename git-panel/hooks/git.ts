// Pure parsers for git's machine output. No `$` here, so tests run them directly.
import type { Change, Head, Stash, Worktree } from '../types'

export const EMPTY_HEAD: Head = { branch: '', upstream: '', ahead: 0, behind: 0 }

// `git status --porcelain=v2 --branch -z`
export function parseStatus(out: string): { head: Head; changes: Change[] } {
  const head: Head = { ...EMPTY_HEAD }
  const changes: Change[] = []
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i] ?? ''
    if (!line) continue
    if (line.startsWith('# branch.head ')) head.branch = line.slice(14)
    else if (line.startsWith('# branch.upstream ')) head.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) [head.ahead, head.behind] = [Number(m[1]), Number(m[2])]
    } else if (line.startsWith('? ')) changes.push({ path: line.slice(2), code: '?', group: 'untracked', add: 0, del: 0 })
    else if (line[0] === '1' || line[0] === '2' || line[0] === 'u') {
      const skip = line[0] === '1' ? 8 : line[0] === '2' ? 9 : 10
      const fields = line.split(' ')
      const xy = fields[1] ?? '..'
      const path = fields.slice(skip).join(' ')
      if (line[0] === '2') i++ // rename: next NUL field is the original path
      if (line[0] === 'u') {
        changes.push({ path, code: 'U', group: 'unstaged', add: 0, del: 0 })
        continue
      }
      if (xy[0] !== '.') changes.push({ path, code: xy[0] ?? 'M', group: 'staged', add: 0, del: 0 })
      if (xy[1] !== '.') changes.push({ path, code: xy[1] ?? 'M', group: 'unstaged', add: 0, del: 0 })
    }
  }
  return { head, changes }
}

// `git diff [--cached] --numstat -z` → path → [add, del]; binary files count as 0/0
export function parseNumstat(out: string): Map<string, [number, number]> {
  const map = new Map<string, [number, number]>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(parts[i] ?? '')
    if (!m) continue
    let path = m[3] ?? ''
    if (path === '') {
      path = parts[i + 2] ?? '' // rename: old\0new follow
      i += 2
    }
    map.set(path, [m[1] === '-' ? 0 : Number(m[1]), m[2] === '-' ? 0 : Number(m[2])])
  }
  return map
}

// `git worktree list --porcelain`
export function parseWorktrees(out: string): Worktree[] {
  const list: Worktree[] = []
  for (const block of out.replace(/\r/g, '').split('\n\n')) {
    const lines = block.split('\n').filter(Boolean)
    const path = lines.find(l => l.startsWith('worktree '))?.slice(9)
    if (!path || lines.includes('bare')) continue
    const ref = lines.find(l => l.startsWith('branch '))?.slice(7) ?? ''
    list.push({
      path,
      branch: ref ? ref.replace(/^refs\/heads\//, '') : '(detached)',
      dirty: 0,
      ahead: 0,
      behind: 0,
    })
  }
  return list
}

// `git stash list --format=%gd%x00%s`
export function parseStash(out: string): Stash[] {
  return out
    .replace(/\r/g, '')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [ref, ...msg] = line.split('\0')
      return { ref: ref ?? '', message: msg.join(' ') }
    })
}

export const isBranchName = (name: string) =>
  /^[\w][\w./-]*$/.test(name) && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.lock')

export const slugOf = (branch: string) => branch.replace(/[/\\]+/g, '-')

export const samePath = (a: string, b: string) =>
  a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
export const dirName = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
