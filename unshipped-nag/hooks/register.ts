import type { EngineInterface, Register } from 'claude-code'

const STALE_MS = 30 * 60_000
const QUIET_MS = 30 * 60_000

type $ = EngineInterface
let lastNag = 0

const ago = (ms: number) => (ms >= 3600_000 ? `${Math.floor(ms / 3600_000)}h` : `${Math.floor(ms / 60_000)}m`)

// `git status --porcelain=v2 --branch -z` → changed paths and commits ahead of upstream.
export function parse(out: string) {
  let ahead = 0
  const paths: string[] = []
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i] ?? ''
    const ab = /^# branch\.ab \+(\d+)/.exec(line)
    if (ab) ahead = Number(ab[1])
    else if (line.startsWith('? ')) paths.push(line.slice(2))
    else if (line[0] === '1') paths.push(line.split(' ').slice(8).join(' '))
    else if (line[0] === '2') {
      paths.push(line.split(' ').slice(9).join(' '))
      i++ // rename: next field is the old path
    }
  }
  return { ahead, paths }
}

export function message(dirty: number, oldestMs: number, ahead: number) {
  const bits: string[] = []
  if (dirty && oldestMs >= STALE_MS) bits.push(`${dirty} file${dirty > 1 ? 's' : ''} uncommitted (oldest ${ago(oldestMs)})`)
  if (ahead) bits.push(`${ahead} commit${ahead > 1 ? 's' : ''} not pushed`)
  return bits.length ? `Unshipped: ${bits.join(', ')}` : ''
}

async function nag($: $) {
  const now = await $.clock.now()
  if (now - lastNag < QUIET_MS) return
  const cwd = await $.session.cwd()
  const res = await $.process.run(['git', '-C', cwd, '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z'], {
    timeoutMs: 10_000,
    env: { GIT_OPTIONAL_LOCKS: '0' },
  })
  if (res.exitCode !== 0) return
  const { ahead, paths } = parse(res.stdout)
  let oldest = 0
  // shortcut: stats at most 50 files; a huge dirty tree still nags, just from a sample.
  for (const p of paths.slice(0, 50)) {
    const st = await $.fs.stat(`${cwd}/${p}`).catch(() => undefined)
    if (st && st.kind === 'file') oldest = Math.max(oldest, now - st.mtimeMs)
  }
  const text = message(paths.length, oldest, ahead)
  if (!text) return
  lastNag = now
  $.ui.toast(`${text}. /commit?`)
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await nag($).catch(() => undefined)
    return r
  })
}
