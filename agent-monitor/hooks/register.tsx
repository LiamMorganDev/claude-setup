import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Run, StepStatus } from '../types'
import { claudeletAlt, claudeletSvg, type Pose } from './claudelet'

const PANE = 'agent-monitor'
const MAIN = 'main'
const EMPTY: Run = { order: [], agents: {} }

const RUN = { plugin: 'agent-monitor', key: 'run' } as const
const HIDDEN = { plugin: 'agent-monitor', key: 'isHidden' } as const
const CONTEXT = { plugin: 'agent-monitor', key: 'contextTokens' } as const

/** Read-modify-write of the run with compare-and-set, retried when another write landed first. */
async function updateRun($: EngineInterface, fn: (r: Run) => Run): Promise<Run> {
  for (let attempt = 0; ; attempt++) {
    const { value = EMPTY, version } = await $.state.get(RUN)
    const next = fn(value)
    if (next === value) return value
    const res = await $.state.set(RUN, next, { ifVersion: version })
    if (res.isSet || attempt >= 20) return next
  }
}

async function setHidden($: EngineInterface, hidden: boolean) {
  await $.state.set(HIDDEN, hidden)
}

const newRow = (id: string, name: string, description: string, parentId?: string): AgentRow => ({
  id, name, description, parentId, isDone: false, tokens: 0, doing: 'starting…', steps: [],
  isThinking: false, isError: false,
})

export const percentOf = (a: AgentRow): number | undefined => {
  if (a.steps.length === 0) return a.isDone ? 100 : undefined
  const done = a.steps.filter(s => s.status === 'completed').length

  return Math.round((done / a.steps.length) * 100)
}

export const poseOf = (a: AgentRow): Pose =>
  a.isDone ? (a.isError ? 'error' : 'done') : a.isThinking ? 'think' : 'work'

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

const totalTokens = (r: Run) => Object.values(r.agents).reduce((sum, a) => sum + a.tokens, 0)

const summary = (r: Run): string | undefined => {
  const main = r.agents[MAIN]
  if (!main) return undefined
  const pct = percentOf(main)
  const running = Object.values(r.agents).filter(a => a.id !== MAIN && !a.isDone).length
  const head = main.isDone && running === 0 ? '✓ done' : `▸ ${pct === undefined ? '…' : `${pct}%`}`
  const agents = r.order.length - 1

  return `${head} · ${formatTokens(totalTokens(r))} tok · ${agents} agent${agents === 1 ? '' : 's'}`
}

const DOING_MAX = 40

const clip = (s: string): string => (s.length > DOING_MAX ? `${s.slice(0, DOING_MAX - 1)}…` : s)

const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** A tiny plain-English line for a tool call: what it does and to what. */
export const describeCall = (tool: string, input: Record<string, unknown>): string => {
  const str = (k: string): string => {
    const v = input[k]

    return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  }
  const file = baseName(str('file_path') || str('notebook_path') || str('path'))
  switch (tool) {
    case 'Read': return clip(`Reading ${file}`)
    case 'Edit': case 'NotebookEdit': return clip(`Editing ${file}`)
    case 'Write': return clip(`Writing ${file}`)
    case 'Bash': case 'PowerShell': return clip(`Running: ${str('description') || str('command')}`)
    case 'Grep': return clip(`Searching "${str('pattern')}"`)
    case 'Glob': return clip(`Finding ${str('pattern')}`)
    case 'WebSearch': return clip(`Searching web: ${str('query')}`)
    case 'WebFetch': return clip(`Fetching ${str('url').replace(/^https?:\/\/([^/]+).*$/, '$1')}`)
    case 'Agent': return clip(`Starting agent: ${str('description')}`)
    case 'Skill': return clip(`Loading skill ${str('skill')}`)
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return 'Updating the plan'
    case 'AskUserQuestion': return 'Asking you a question'
  }
  // mcp__server__do_thing → "do thing"
  const name = tool.startsWith('mcp__') ? tool.split('__').pop()!.replace(/_/g, ' ') : tool
  const arg = str('description') || str('query') || str('url') || file

  return clip(arg ? `${name}: ${arg}` : name)
}

export const CONTEXT_FULL = 500_000
export const CONTEXT_WARN = 300_000

/** The context bar as runs: filled, empty, and a break mark at the warning line. */
export const contextBar = (tokens: number, width: number) => {
  const filled = Math.round((Math.min(tokens, CONTEXT_FULL) / CONTEXT_FULL) * width)
  const mark = Math.round((CONTEXT_WARN / CONTEXT_FULL) * width)
  const runs: Array<{ kind: 'fill' | 'empty' | 'mark'; text: string }> = []
  for (let i = 0; i < width; i++) {
    const kind = i === mark ? 'mark' : i < filled ? 'fill' : 'empty'
    const last = runs.at(-1)
    const ch = kind === 'mark' ? '│' : kind === 'fill' ? '█' : '░'
    if (last?.kind === kind) last.text += ch
    else runs.push({ kind, text: ch })
  }

  return { runs, pct: Math.round((tokens / CONTEXT_FULL) * 100), isWarn: tokens > CONTEXT_WARN }
}

/** Writes a change to one agent's row (skipped for loops we don't track) and refreshes the status line. */
async function change($: EngineInterface, id: string, fn: (a: AgentRow) => AgentRow) {
  const latest = await updateRun($, r => {
    const row = r.agents[id]

    return row ? { ...r, agents: { ...r.agents, [id]: fn(row) } } : r
  })
  if (latest.agents[id]) $.ui.status(summary(latest))
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Agents', columns: 46 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monitor',
      description: 'Show the live agent monitor pane (/monitor off hides it)',
      argumentHint: '[off]',
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && e.context.tokens !== undefined) await $.state.set(CONTEXT, e.context.tokens)

    return next(e)
  })

  on('command.run', { command: 'monitor' }, async ($, e) => {
    if (e.args.trim() === 'off') {
      await setHidden($, true)
      await $.ui.close({ id: PANE })

      return { text: 'Agent monitor hidden. /monitor brings it back.' }
    }
    await setHidden($, false)
    await openPane($)

    return { text: 'Agent monitor opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await setHidden($, true)

    return next(e)
  })

  // A new request: fresh main row; background agents still running carry over.
  on('turn.start', async ($, e, next) => {
    const latest = await updateRun($, r => {
      const carried = r.order.filter(id => id !== MAIN && r.agents[id] && !r.agents[id].isDone)
      const agents: Record<string, AgentRow> = { [MAIN]: newRow(MAIN, 'main', e.text.slice(0, 80)) }
      for (const id of carried) agents[id] = r.agents[id]!

      return { order: [MAIN, ...carried], agents }
    })
    $.ui.status(summary(latest))
    const { value: hidden = false } = await $.state.get(HIDDEN)
    if (!hidden) void openPane($)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = spawned.agentId
    if (id === undefined) return spawned
    const latest = await updateRun($, r => {
      if (!r.agents[MAIN]) return r
      const parentId = e.parentAgentId && r.agents[e.parentAgentId] ? e.parentAgentId : MAIN

      return {
        order: [...r.order, id],
        agents: { ...r.agents, [id]: newRow(id, e.subagentType, e.description, parentId) },
      }
    })
    if (latest.agents[id]) $.ui.status(summary(latest))

    return spawned
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId ?? MAIN
    await change($, id, a => ({ ...a, doing: 'thinking…', isThinking: true }))
    const result = yield* next(e)
    const u = result.usage
    if (u) {
      const used = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
      await change($, id, a => ({ ...a, tokens: a.tokens + used }))
    }

    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const input = e as unknown as Record<string, unknown>
    await change($, id, a => ({ ...a, doing: describeCall(String(e.tool), input), tool: String(e.tool), isThinking: false }))
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    if (e.tool === 'TodoWrite') {
      const steps = e.todos.map((t, i) => ({ key: `${i}:${t.content}`, status: t.status }))
      await change($, id, a => ({ ...a, steps }))
    } else if (e.tool === 'TaskCreate') {
      const created = (ran.result as { task?: { id?: string } } | undefined)?.task?.id
      if (created) {
        await change($, id, a => ({ ...a, steps: [...a.steps, { key: created, status: 'pending' }] }))
      }
    } else if (e.tool === 'TaskUpdate' && e.status) {
      const status = e.status
      await change($, id, a => ({
        ...a,
        steps: status === 'deleted'
          ? a.steps.filter(s => s.key !== e.taskId)
          : a.steps.map(s => (s.key === e.taskId ? { ...s, status: status as StepStatus } : s)),
      }))
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const label = e.isAborted ? 'interrupted' : e.reason === 'error' ? 'stopped on an error' : 'done'
    await change($, id, a => ({ ...a, isDone: true, doing: label, isThinking: false, isError: e.reason === 'error' && !e.isAborted }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    // Surfaces that draw SVG get a claude-let per row; the terminal keeps the status dot.
    const Svg = 'Svg' in els ? els.Svg : undefined
    const { value: r = EMPTY } = await $.state.get(RUN)
    const { value: ctxTokens } = await $.state.get(CONTEXT)
    const cols = Math.max(24, e.props.bodyColumns)

    if (!r.agents[MAIN]) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Waiting for your next request…</Text>
        </Box>
      )
    }

    const depthOf = (a: AgentRow): number => {
      let d = 0
      let p = a.parentId
      while (p && d < 8) { d++; p = r.agents[p]?.parentId }

      return d
    }
    // Depth-first from main, so each subagent sits under its parent.
    const ordered: AgentRow[] = []
    const visit = (id: string) => {
      const a = r.agents[id]
      if (!a) return
      ordered.push(a)
      for (const child of r.order) if (r.agents[child]?.parentId === id) visit(child)
    }
    visit(MAIN)
    for (const id of r.order) if (!ordered.some(a => a.id === id) && r.agents[id]) ordered.push(r.agents[id]!)

    const runningChildren = (id: string) =>
      ordered.filter(a => a.parentId === id && !a.isDone).length

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>Agent monitor</Text>
          <Text dimColor>{`  Σ ${formatTokens(totalTokens(r))} tok`}</Text>
        </Text>
        {ctxTokens === undefined ? null : (() => {
          const ctx = contextBar(ctxTokens, Math.max(10, Math.min(30, cols - 22)))
          const fill = ctx.isWarn ? 'warning' : 'suggestion'

          return (
            <Text wrap="truncate-end">
              <Text dimColor>ctx </Text>
              {ctx.runs.map((run, i) => run.kind === 'empty'
                ? <Text key={i} dimColor>{run.text}</Text>
                : <Text key={i} color={run.kind === 'mark' ? 'warning' : fill}>{run.text}</Text>)}
              <Text color={ctx.isWarn ? 'warning' : undefined}>
                {` ${ctx.pct}% ${formatTokens(ctxTokens)}/500k${ctx.isWarn ? ' ⚠' : ''}`}
              </Text>
            </Text>
          )
        })()}
        <Text dimColor>{'─'.repeat(Math.min(cols, 48))}</Text>
        {ordered.map((a, i) => {
          const depth = depthOf(a)
          // With a sprite the Box margin indents the row, so the text carries no indent of its own.
          const indent = Svg ? '' : '  '.repeat(depth)
          const gutter = Svg ? '' : `${indent}  `
          const pct = percentOf(a)
          const width = Math.max(6, Math.min(20, cols - indent.length - 16 - (Svg ? 2 * depth + 7 : 0)))
          const filled = pct === undefined ? 0 : Math.round((pct / 100) * width)
          const color = a.isDone ? 'success' : 'suggestion'
          const waiting = runningChildren(a.id)
          const doing = a.isDone && waiting > 0 ? `waiting on ${waiting} agent${waiting > 1 ? 's' : ''}` : a.doing
          const done = a.steps.filter(s => s.status === 'completed').length

          const lines = (
            <Box flexDirection="column" flexShrink={1}>
              <Text wrap="truncate-end">
                {indent}
                {Svg ? null : <Text color={color}>{a.isDone ? '✓ ' : '● '}</Text>}
                <Text bold>{a.name}</Text>
                <Text dimColor>{a.id === MAIN
                  ? `${a.steps.length ? `  ${done}/${a.steps.length} steps ·` : ''}  ${a.description}`
                  : `  ${a.description}`}</Text>
              </Text>
              <Text wrap="truncate-end">
                {gutter}
                <Text color={color}>{'█'.repeat(filled)}</Text>
                <Text dimColor>{'░'.repeat(width - filled)}</Text>
                {` ${pct === undefined ? '  …' : `${String(pct).padStart(3)}%`} ${formatTokens(a.tokens).padStart(6)}`}
              </Text>
              <Text dimColor wrap="truncate-end">{`${gutter}↳ ${doing}`}</Text>
            </Box>
          )
          if (!Svg) return <Box key={a.id}>{lines}</Box>
          const sprite = { role: a.name, pose: poseOf(a), tool: a.tool, phase: i }

          return (
            <Box key={a.id} flexDirection="row" alignItems="center" gap={1} marginLeft={2 * depth} marginBottom={1}>
              <Svg source={claudeletSvg(sprite)} alt={claudeletAlt(sprite)} width={44} height={33} />
              {lines}
            </Box>
          )
        })}
      </Box>
    )
  })
}
