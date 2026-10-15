import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Win } from '../types'
import { addWin, summary } from './jar'

const PANE = 'win-jar'
const C = { bg: '#282a36', line: '#44475a', fg: '#f8f8f2', muted: '#a3a8c8', purple: '#bd93f9', pink: '#ff79c6', green: '#50fa7b', yellow: '#f1fa8c', orange: '#ffb86c' }
const wins = atom({ plugin: 'win-jar', key: 'wins' } as const, [] as Win[])

type $ = EngineInterface
// The module runs without Intl's zone data guarantees, so the offset comes from the host's Date.
const offset = () => new Date().getTimezoneOffset() * -1

// $.store is shared by every session; reread before each write so other chats' wins are kept.
// shortcut: no lock, two chats finishing a step in the same instant can drop one win.
async function load($: $) {
  const list = ((await $.store.get('wins')) as Win[] | undefined) ?? []
  await update($, wins, () => list)
  return list
}

const time = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'wins', description: "Open the win jar: everything you shipped today, across all chats" })
    await load($)
    return r
  })

  // glanceflow answers its own report_progress without calling next, so a tool.call hook
  // beneath it never runs. The model's tool_use row is appended whatever the hook order.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const r = await next(e)
    for (const b of e.message.content as readonly { type: string; name?: string; input?: unknown }[]) {
      if (b.type !== 'tool_use' || b.name !== 'mcp__glanceflow__report_progress') continue
      const input = (b.input ?? {}) as { percent?: unknown; summary?: string; task?: string }
      if (Number(input.percent) !== 100) continue
      const root = (await $.session.root()).replace(/\\/g, '/')
      const win: Win = { t: await $.clock.now(), text: input.summary || input.task || 'a step', project: root.slice(root.lastIndexOf('/') + 1) }
      const list = addWin(await load($), win, offset())
      await $.store.set('wins', list)
      await update($, wins, () => list)
      const s = summary(list, win.t, offset())
      $.ui.toast(`🏆 Win #${s.today} today${s.streak > 1 ? ` · ${s.streak}-day streak` : ''}`)
    }
    return r
  })

  on('command.run', { command: 'wins' }, async $ => {
    const s = summary(await load($), await $.clock.now(), offset())
    await $.ui.open({ id: PANE, title: 'Win jar' })
    return { text: `${s.today} wins today, ${s.week} this week, ${s.streak}-day streak.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface === 'mobile') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const s = summary(await read($, wins), await $.clock.now(), offset())
    const jar = Math.min(10, s.today)
    return (
      <Box flexDirection="column" backgroundColor={C.bg} paddingX={1} paddingY={1} minHeight={Math.max(1, e.props.scroll?.bodyRows ?? 1)}>
        <Text bold>
          <Text color={C.yellow}>🏆 {s.today}</Text>
          <Text color={C.fg}> today</Text>
          <Text color={C.muted}> · {s.week} this week · </Text>
          <Text color={s.streak > 1 ? C.orange : C.muted}>🔥 {s.streak}-day streak</Text>
        </Text>
        <Text color={C.purple}>
          {'['}
          <Text color={C.yellow}>{'●'.repeat(jar)}</Text>
          <Text color={C.line}>{'○'.repeat(10 - jar)}</Text>
          {']'}
          <Text color={C.muted}>{s.today >= 10 ? ' jar full, go outside 🦇' : ` ${10 - jar} to fill the jar`}</Text>
        </Text>
        {s.today ? null : <Text color={C.muted}>{'\n'}Nothing yet today. Finish one step and it lands here.</Text>}
        {Object.entries(s.byProject).map(([project, list]) => (
          <Box key={`p-${project}`} flexDirection="column" marginTop={1}>
            <Box backgroundColor={C.line} paddingX={1}>
              <Text color={C.purple} bold>
                {project.toUpperCase()} <Text color={C.fg}>{list.length}</Text>
              </Text>
            </Box>
            {[...list].reverse().map(w => (
              <Text key={`w-${w.t}`} color={C.fg}>
                <Text color={C.green}> ✓ </Text>
                {w.text}
                <Text color={C.muted}> {time(w.t)}</Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
