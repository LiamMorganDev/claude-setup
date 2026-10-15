import type { Layer } from '../types'

export const LAYERS: readonly Layer[] = ['schema', 'types', 'zod']

const norm = (path: string) => path.replace(/\\/g, '/')

// Which side of the schema/type/validation triangle a file belongs to.
export const classify = (path: string): Layer | undefined => {
  const p = norm(path)
  if (/(^|\/)(pb_schema\.json|schema\.prisma|schema\.sql)$/.test(p)) return 'schema'
  if (/\/db\/schema\.[cm]?[jt]s$/.test(p)) return 'schema'
  if (/\/schemas?\/[^/]+\.[cm]?[jt]s$/.test(p) || /\.schema\.[cm]?[jt]s$/.test(p)) return 'zod'
  if (/\/types\/[^/]+\.ts$/.test(p) || /\.types\.ts$/.test(p)) return 'types'
  return undefined
}

const ENV = /^(.*[\\/])?(\.env|\.env\.example)$/

// `.env` <-> `.env.example` beside it, or undefined for any other file.
export const envSibling = (path: string): { dir: string; self: string; other: string } | undefined => {
  const m = ENV.exec(path)
  if (!m) return undefined
  const dir = m[1] ?? ''
  return { dir, self: path, other: dir + (m[2] === '.env' ? '.env.example' : '.env') }
}

type Token = { kind: 'section' | 'key' | 'comment'; text: string }

const HEADER = /^#\s*─+\s*(.+?)\s*─+\s*$/
const KEY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/

// Structure of an env file: section headers, keys and standalone comments in
// order. Values are never kept.
export const envShape = (text: string): Token[] =>
  text.split(/\r?\n/).flatMap((line): Token[] => {
    const header = HEADER.exec(line)
    if (header) return [{ kind: 'section', text: header[1] }]
    const key = KEY.exec(line)
    if (key) return [{ kind: 'key', text: key[1] }]
    const t = line.trim()
    return t.startsWith('#') ? [{ kind: 'comment', text: t }] : []
  })

const label = (t: Token) =>
  t.kind === 'section' ? `section "${t.text}"` : t.kind === 'key' ? t.text : `comment "${t.text.slice(0, 50)}"`

// Problems that make two env files structurally different; empty when identical.
export const envDiff = (a: Token[], b: Token[], aName: string, bName: string): string[] => {
  const id = (t: Token) => `${t.kind}:${t.text}`
  const aIds = new Set(a.map(id))
  const bIds = new Set(b.map(id))
  const problems = [
    ...a.filter(t => !bIds.has(id(t))).map(t => `${label(t)} in ${aName}, missing from ${bName}`),
    ...b.filter(t => !aIds.has(id(t))).map(t => `${label(t)} in ${bName}, missing from ${aName}`),
  ]
  if (problems.length > 0) return problems
  if (a.length !== b.length) return [`${aName} has ${a.length} entries, ${bName} has ${b.length} (duplicates?)`]
  const firstOff = a.findIndex((t, i) => id(t) !== id(b[i]))
  return firstOff === -1 ? [] : [`order differs from ${label(a[firstOff])} onward`]
}
