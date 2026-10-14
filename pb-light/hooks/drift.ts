// Pure semantic compare of PocketBase collection lists. No `$` here, so tests run it directly.
type Coll = Record<string, unknown> & { name: string; fields?: Field[]; schema?: Field[]; indexes?: string[] }
type Field = Record<string, unknown> & { name: string }

export type Drift = { repoAhead: string[]; liveAhead: string[] }

const SKIP_KEYS = new Set(['id', 'created', 'updated', 'fields', 'schema', 'indexes'])

// Keys sorted at every depth, so key order never counts as a difference.
const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v as object)
          .sort()
          .map(k => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v ?? null)

const fieldsOf = (c: Coll) => new Map((c.fields ?? c.schema ?? []).map(f => [f.name, canon({ ...f, id: undefined })]))
const indexesOf = (c: Coll) => canon([...(c.indexes ?? [])].map(i => i.replace(/\s+/g, ' ').trim()).sort())
const restOf = (c: Coll) => canon(Object.fromEntries(Object.entries(c).filter(([k]) => !SKIP_KEYS.has(k))))

export function compare(repo: Coll[], live: Coll[]): Drift {
  const d: Drift = { repoAhead: [], liveAhead: [] }
  const liveBy = new Map(live.map(c => [c.name, c]))
  const repoBy = new Map(repo.map(c => [c.name, c]))
  for (const r of repo) {
    const l = liveBy.get(r.name)
    if (!l) {
      d.repoAhead.push(`+ collection ${r.name}`)
      continue
    }
    const [rf, lf] = [fieldsOf(r), fieldsOf(l)]
    for (const [name, def] of rf) {
      if (!lf.has(name)) d.repoAhead.push(`+ ${r.name}.${name}`)
      else if (lf.get(name) !== def) d.repoAhead.push(`~ ${r.name}.${name}`)
    }
    for (const name of lf.keys()) if (!rf.has(name)) d.liveAhead.push(`${r.name}.${name}`)
    if (indexesOf(r) !== indexesOf(l)) d.repoAhead.push(`~ ${r.name} indexes`)
    if (restOf(r) !== restOf(l)) d.repoAhead.push(`~ ${r.name} rules/options`)
  }
  for (const l of live) if (!repoBy.has(l.name) && !l.name.startsWith('_')) d.liveAhead.push(`collection ${l.name}`)
  return d
}

// A worktree's `.git` is a file "gitdir: <main>/.git/worktrees/<name>"; returns <main>, or undefined.
export function mainCheckout(gitFile: string): string | undefined {
  const m = /^gitdir:\s*(.+?)[\\/]\.git[\\/]worktrees[\\/][^\\/]+\s*$/m.exec(gitFile)
  return m?.[1]!.replace(/\\/g, '/')
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line)
    if (m) out[m[1]!] = m[2]!.replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2').trim()
  }
  return out
}
