import type { EngineInterface, Register } from 'claude-code'

import { compare, parseEnv } from './drift'

const EVERY_MS = 10 * 60_000

type $ = EngineInterface
let last = ''

async function auth($: $, url: string, identity: string, password: string) {
  for (const path of ['/api/collections/_superusers/auth-with-password', '/api/admins/auth-with-password']) {
    const res = await $.http.fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity, password }),
    })
    if (res.ok) return String((JSON.parse(res.text) as { token: string }).token)
  }
  throw new Error('auth failed')
}

// Read-only: one auth and one GET, never a write to PocketBase or the repo.
async function check($: $): Promise<string | undefined> {
  const root = (await $.session.root()).replace(/\\/g, '/')
  if (!(await $.fs.exists(`${root}/pb_schema.json`))) return undefined
  const env = (await $.fs.exists(`${root}/.env`)) ? parseEnv(String(await $.fs.read(`${root}/.env`))) : {}
  const { POCKETBASE_URL: url, PB_ADMIN_EMAIL: email, PB_ADMIN_PASSWORD: pass } = env
  if (!url || !email || !pass) return 'PB ? no creds in .env'
  try {
    const base = url.replace(/\/+$/, '')
    const token = await auth($, base, email, pass)
    const res = await $.http.fetch(`${base}/api/collections?perPage=500`, { headers: { Authorization: token } })
    if (!res.ok) return `PB ✗ HTTP ${res.status}`
    const repo = JSON.parse(String(await $.fs.read(`${root}/pb_schema.json`)))
    const d = compare(Array.isArray(repo) ? repo : repo.collections, (JSON.parse(res.text) as { items: never[] }).items)
    if (!d.repoAhead.length && !d.liveAhead.length) return 'PB ● in sync'
    return `PB ▲ drift: ${[d.repoAhead.length && `${d.repoAhead.length} differ`, d.liveAhead.length && `${d.liveAhead.length} live-only`].filter(Boolean).join(', ')} · /pb-drift`
  } catch {
    return 'PB ✗ unreachable'
  }
}

async function refresh($: $) {
  const text = await check($)
  $.ui.status(text)
  if (text?.startsWith('PB ▲') && !last.startsWith('PB ▲')) $.ui.toast(`Live PocketBase drifted from pb_schema.json. Run /pb-drift for details.`)
  last = text ?? ''
  return text
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'pb-light', description: 'Recheck live PocketBase against pb_schema.json' })
    void refresh($)
    $.clock.every(EVERY_MS, () => void refresh($))
    return r
  })

  on('command.run', { command: 'pb-light' }, async $ => ({ text: (await refresh($)) ?? 'No pb_schema.json in this project.' }))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const path = (e as unknown as { file_path?: string }).file_path ?? ''
    if (/pb_schema\.json$/.test(path)) void refresh($)
    return r
  })
}
