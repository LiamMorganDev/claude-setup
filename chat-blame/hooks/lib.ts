// Shared with git-panel, which reads the same file: { [normPath]: Blame }.
export type Blame = { s: string; l: string; t: number }

const KEEP_MS = 14 * 24 * 3600_000
const MAX = 3000

export const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const blameFile = (home: string) => `${home.replace(/\\/g, '/')}/.claude/chat-blame.json`

// First prompt the person typed, as a short label; skips command/hook wrappers.
export function labelOf(texts: readonly string[]) {
  const first = texts.map(t => t.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim()).find(Boolean) ?? ''
  const one = first.replace(/\s+/g, ' ')
  return one.length > 40 ? `${one.slice(0, 39)}…` : one || 'untitled chat'
}

export function stamp(map: Record<string, Blame>, path: string, b: Blame) {
  const out: Record<string, Blame> = {}
  for (const [k, v] of Object.entries(map)) if (b.t - v.t < KEEP_MS) out[k] = v
  delete out[normPath(path)]
  out[normPath(path)] = b
  const keys = Object.keys(out)
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete out[k]
  return out
}
