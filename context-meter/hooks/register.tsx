import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Info } from '../types'

const GREEN = 'green'
const ORANGE = '#FF8C00'
const POLL_MS = 15_000

const info = atom({ plugin: 'context-meter', key: 'info' } as const, { model: '', branch: '', dirty: 0, pb: '' } as Info)

// "Opus 5.5" from "claude-opus-5-5[1m]"; a name /model already spells nicely passes through.
export const modelName = (id: string) => {
  const m = /claude-(\w+)-(\d+)-(\d+)/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}` : id
}

export const pbColor = (pb: string) => (pb.includes('●') ? GREEN : pb.includes('▲') ? ORANGE : 'red')

// Same reads as statusline.js: git for branch/dirty, pb-light's file for the PB check.
async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  const git = (args: string[]) =>
    $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 10_000, env: { GIT_OPTIONAL_LOCKS: '0' } }).then(r => (r.exitCode === 0 ? r.stdout : ''))
  const [branch, status, top] = await Promise.all([git(['branch', '--show-current']), git(['status', '--porcelain']), git(['rev-parse', '--show-toplevel'])])
  let pb = ''
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
    const file = `${home.replace(/\\/g, '/')}/.claude/pb-light.json`
    const key = top.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    if (key && (await $.fs.exists(file))) pb = (JSON.parse(String(await $.fs.read(file))) as Record<string, string>)[key] ?? ''
  } catch {}
  const next: Info = {
    model: modelName(await $.session.model()),
    branch: branch.trim(),
    dirty: status.split('\n').filter(Boolean).length,
    pb: pb.replace(/ · \/pb-drift$/, ''),
  }
  const cur = await read($, info)
  if (JSON.stringify(cur) !== JSON.stringify(next)) await update($, info, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    void refresh($).catch(() => undefined)
    $.clock.every(POLL_MS, () => void refresh($).catch(() => undefined))
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void refresh($).catch(() => undefined)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const i = await read($, info)
    if (e.props.hasSurvey || !i.model) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const sep = <Text dimColor> │ </Text>
    // other mods' band rows (bat-flyby) draw beneath this one instead of being dropped
    const below = await next(e)
    return (
      <Box flexDirection="column">
      <Box>
        {i.model ? <Text color="#bd93f9">{i.model}</Text> : null}
        {i.branch ? sep : null}
        {i.branch ? (
          <Text>
            {i.branch}
            {i.dirty ? <Text color="yellow"> ●{i.dirty}</Text> : null}
          </Text>
        ) : null}
        {i.pb ? sep : null}
        {i.pb ? <Text color={pbColor(i.pb)}>{i.pb}</Text> : null}
      </Box>
      {below ?? null}
      </Box>
    )
  })
}
