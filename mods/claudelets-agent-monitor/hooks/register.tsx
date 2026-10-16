import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, HistoryEntry, HistoryView, RateLimit, Run, Sample, StepStatus, TouchedFile } from '../types'
import { claudeletAlt, claudeletSvg, type Pose } from './claudelet'
import { maskPrivate } from './privacy'

const PANE = 'agent-monitor'
const MAIN = 'main'
const EMPTY: Run = { order: [], agents: {} }

const RUN = { plugin: 'claudelets-agent-monitor', key: 'run' } as const
const HIDDEN = { plugin: 'claudelets-agent-monitor', key: 'isHidden' } as const
const CONTEXT = { plugin: 'claudelets-agent-monitor', key: 'contextTokens' } as const
const LIMITS = { plugin: 'claudelets-agent-monitor', key: 'rateLimits' } as const
const SAMPLES = { plugin: 'claudelets-agent-monitor', key: 'limitSamples' } as const
const ALERTED = { plugin: 'claudelets-agent-monitor', key: 'alerted' } as const
const EXPANDED = { plugin: 'claudelets-agent-monitor', key: 'expanded' } as const
const TICK = { plugin: 'claudelets-agent-monitor', key: 'tick' } as const
const FILES_OPEN = { plugin: 'claudelets-agent-monitor', key: 'filesOpen' } as const
const HISTORY = { plugin: 'claudelets-agent-monitor', key: 'history' } as const

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
  isThinking: false, isError: false, startedAt: Date.now(),
})

export const percentOf = (a: AgentRow): number | undefined => {
  if (a.steps.length === 0) return a.isDone ? 100 : undefined
  const done = a.steps.filter(s => s.status === 'completed').length

  return Math.round((done / a.steps.length) * 100)
}

/** `runDone`: every row has finished, so the finished ones celebrate instead of resting. */
export const poseOf = (a: AgentRow, runDone = a.isDone): Pose =>
  a.isWaiting ? 'wait'
    : a.isDone ? (a.isError ? 'error' : runDone ? 'done' : 'rest')
    : a.isThinking ? 'think' : 'work'

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

export const formatDuration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)

  return h < 24 ? `${h}h${m % 60}m` : `${Math.floor(h / 24)}d${h % 24}h`
}

/** opus / sonnet / haiku / fable from a model id or alias; undefined for anything else. */
export const modelBadge = (model: string | undefined): string | undefined =>
  model?.toLowerCase().match(/opus|sonnet|haiku|fable/)?.[0]

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
/** How many recent actions the recap under each row keeps */
const RECAP = 5

// Masked before clipping, so a cut can't leave half a key showing.
const clip = (raw: string): string => {
  const s = maskPrivate(raw)

  return s.length > DOING_MAX ? `${s.slice(0, DOING_MAX - 1)}…` : s
}

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

/** Tools that always wait on the person, whatever the permission mode. */
const ASKS_PERSON = new Set(['AskUserQuestion', 'ExitPlanMode'])

export const CONTEXT_FULL = 1_000_000
export const CONTEXT_WARN = 300_000

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 }
/** How far back the forecast looks for the burn rate */
const FORECAST_SPAN = 30 * 60_000
const ALERT_AT = 90

type Level = 'success' | 'warning' | 'error' | 'suggestion'

/**
 * One gauge row, the same shape for context and the usage limits, so all three draw in one grid:
 * `fill` 0..1, `mark` the context warning line, `pace` how much of the limit's window has passed.
 */
export type Gauge = { label: string; fill: number; mark?: number; pace?: number; level: Level; text: string }

export const contextGauge = (tokens: number): Gauge => {
  const isWarn = tokens > CONTEXT_WARN

  return {
    label: 'ctx',
    fill: Math.min(tokens, CONTEXT_FULL) / CONTEXT_FULL,
    mark: CONTEXT_WARN / CONTEXT_FULL,
    level: isWarn ? 'warning' : 'suggestion',
    text: `${Math.round((tokens / CONTEXT_FULL) * 100)}% · ${formatTokens(tokens)}${isWarn ? ' ⚠' : ''}`,
  }
}

/**
 * When the recent burn rate fills the window before it resets: ms until full, else undefined.
 * Needs readings at least 5 minutes apart within the last 30.
 */
export const forecastFull = (samples: Sample[], l: RateLimit, now: number): number | undefined => {
  const recent = samples.filter(([t]) => t >= now - FORECAST_SPAN)
  const first = recent[0]
  if (!first || !l.resetsAt || now - first[0] < 5 * 60_000) return undefined
  const rate = (l.percentUsed - first[1]) / (now - first[0])
  if (!(rate > 0)) return undefined
  const msToFull = (100 - l.percentUsed) / rate

  return now + msToFull < Date.parse(l.resetsAt) ? msToFull : undefined
}

export const limitGauge = (l: RateLimit, now: number, samples: Sample[] = []): Gauge => {
  const left = l.resetsAt ? Date.parse(l.resetsAt) - now : NaN
  const window = WINDOW_MS[l.kind]
  const pace = window && left > 0 ? Math.min(1, Math.max(0, 1 - left / window)) : undefined
  const fill = Math.min(100, Math.max(0, l.percentUsed)) / 100
  const isAhead = pace !== undefined && fill > pace
  const full = forecastFull(samples, l, now)
  const parts = [`${l.percentUsed}%`]
  if (full !== undefined) parts.push(`full in ${formatDuration(full)}`)
  else if (pace !== undefined) parts.push(isAhead ? 'ahead' : 'under')
  if (left > 0) parts.push(`↻${formatDuration(left).replace(/\d+s$/, '')}`)

  return {
    label: LIMIT_LABELS[l.kind] ?? l.kind,
    fill,
    pace,
    level: l.percentUsed >= ALERT_AT ? 'error' : isAhead || full !== undefined ? 'warning' : 'success',
    text: parts.join(' · '),
  }
}

/** A gauge as terminal runs: filled, empty, and one marker cell for the warn line or the pace. */
export const gaugeRuns = (g: Gauge, width: number) => {
  const filled = Math.round(g.fill * width)
  const at = g.mark ?? g.pace
  const mark = at === undefined ? -1 : Math.min(width - 1, Math.round(at * width))
  const runs: Array<{ kind: 'fill' | 'empty' | 'mark'; text: string }> = []
  for (let i = 0; i < width; i++) {
    const kind = i === mark ? 'mark' : i < filled ? 'fill' : 'empty'
    const last = runs.at(-1)
    const ch = kind === 'mark' ? (g.mark === undefined ? '┊' : '│') : kind === 'fill' ? '█' : '░'
    if (last?.kind === kind) last.text += ch
    else runs.push({ kind, text: ch })
  }

  return runs
}

const HEX: Record<Level | 'accent', string> = {
  success: '#4FB06D', warning: '#E0A030', error: '#E5534B', suggestion: '#6CA0E8', accent: '#9A7BE0',
}

/** A gauge as an SVG bar, `w` px wide: track, fill, the warn line and a ▼ at the pace. */
export const gaugeSvg = (g: Pick<Gauge, 'fill' | 'mark' | 'pace' | 'level'> & { color?: string }, w: number, h = 12): string => {
  const y = h - 7
  const fill = Math.round(g.fill * w)
  const at = (f: number) => Math.min(w - 1, Math.max(1, Math.round(f * w)))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
    + `<rect x="0" y="${y}" width="${w}" height="6" rx="1.5" fill="#888888" fill-opacity="0.28"/>`
    + (fill > 0 ? `<rect x="0" y="${y}" width="${fill}" height="6" rx="1.5" fill="${g.color ?? HEX[g.level]}"/>` : '')
    + (g.mark === undefined ? '' : `<rect x="${at(g.mark) - 1}" y="${y - 2}" width="2" height="10" fill="${HEX.warning}"/>`)
    + (g.pace === undefined ? '' : `<path d="M${at(g.pace) - 4} 0 h8 l-4 ${y - 1} z" fill="#9A949F"/>`)
    + '</svg>'
}

/** Writes a change to one agent's row (skipped for loops we don't track) and refreshes the status line. */
async function change($: EngineInterface, id: string, fn: (a: AgentRow) => AgentRow) {
  const latest = await updateRun($, r => {
    const row = r.agents[id]
    if (!row) return r
    const next = fn(row)

    return next === row ? r : { ...r, agents: { ...r.agents, [id]: next } }
  })
  if (latest.agents[id]) $.ui.status(summary(latest))
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Agents', columns: 46 })
}

/** Stores new limit readings: the gauges, the forecast's history, and a toast past 90% once per window. */
async function applyLimits($: EngineInterface, all: RateLimit[]) {
  const limits = all.filter(l => l.kind in LIMIT_LABELS)
  const { value: before = [] } = await $.state.get(LIMITS)
  if (JSON.stringify(before) !== JSON.stringify(limits)) await $.state.set(LIMITS, limits)
  const now = Date.now()
  const { value: samples = {} } = await $.state.get(SAMPLES)
  const { value: alerted = {} } = await $.state.get(ALERTED)
  const nextSamples: Record<string, Sample[]> = {}
  for (const l of limits) {
    // A drop means the window reset: start the history over.
    const prev = (samples[l.kind] ?? []).filter(([t, p]) => t >= now - FORECAST_SPAN && p <= l.percentUsed)
    // One reading a minute is plenty for a 30-minute rate, so 10 s polls don't crowd the window out.
    const last = prev.at(-1)
    nextSamples[l.kind] = last && now - last[0] < 60_000 && last[1] === l.percentUsed ? prev : [...prev, [now, l.percentUsed] as Sample].slice(-60)
    const window = l.resetsAt ?? 'none'
    if (l.percentUsed >= ALERT_AT && alerted[l.kind] !== window) {
      const left = l.resetsAt ? Date.parse(l.resetsAt) - now : NaN
      $.ui.toast(`${LIMIT_LABELS[l.kind]} usage at ${l.percentUsed}%${left > 0 ? ` · resets in ${formatDuration(left)}` : ''}`)
      await $.state.set(ALERTED, { ...alerted, [l.kind]: window })
    }
  }
  if (JSON.stringify(samples) !== JSON.stringify(nextSamples)) await $.state.set(SAMPLES, nextSamples)
}

/** The account-wide usage windows, as claude.ai's usage page reads them: every session's use, not just this one's. */
const ACCOUNT_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
/** How long an account reading outranks the session's own figures */
const ACCOUNT_FRESH = 60_000
/** After a failed account read (no login, 401, 429), use the session's figures this long before trying again */
const ACCOUNT_BACKOFF = 5 * 60_000

/** The account usage body, `{ five_hour: { utilization, resets_at }, seven_day: ... }`, as limit readings. */
export const parseAccountUsage = (text: string): RateLimit[] => {
  const body = JSON.parse(text) as Record<string, { utilization?: number | null; resets_at?: string | null } | null>
  const out: RateLimit[] = []
  for (const kind of Object.keys(LIMIT_LABELS)) {
    const w = body[kind]
    if (w && typeof w.utilization === 'number') {
      out.push({ kind, percentUsed: Math.round(w.utilization * 10) / 10, ...(w.resets_at ? { resetsAt: w.resets_at } : {}) })
    }
  }

  return out
}

let accountReadAt = 0
let accountRetryAt = 0
let poller: { cancel: () => void } | undefined

/** One refresh: this session's context fill, and the account's 5h / 7d (the session's last response as fallback). */
async function poll($: EngineInterface) {
  const usage = await $.session.usage()
  const tokens = usage.context.tokens
  if (tokens !== undefined) {
    const { value: before } = await $.state.get(CONTEXT)
    if (before !== tokens) await $.state.set(CONTEXT, tokens)
  }
  const now = Date.now()
  if (now >= accountRetryAt) {
    try {
      const auth = await $.session.authorize()
      if (auth?.kind !== 'bearer') throw new Error('no claude.ai login')
      const res = await $.http.fetch(ACCOUNT_USAGE_URL, { headers: { 'anthropic-beta': 'oauth-2025-04-20' }, auth: auth.handle })
      if (!res.ok) throw new Error(`usage ${res.status}`)
      const limits = parseAccountUsage(res.text)
      if (limits.length) {
        accountReadAt = now
        await applyLimits($, limits)

        return
      }
    } catch {
      accountRetryAt = now + ACCOUNT_BACKOFF
    }
  }
  if (now - accountReadAt > ACCOUNT_FRESH) await applyLimits($, usage.rateLimits)
}

function startPoller($: EngineInterface, seconds: number) {
  poller?.cancel()
  poller = undefined
  if (!(seconds > 0)) return
  void poll($).catch(() => undefined)
  poller = $.clock.every(Math.max(2, seconds) * 1000, () => void poll($).catch(() => undefined))
}

// shortcut: one ticker per module load; a reload drops it and the next turn or spawn restarts it.
let ticker: { cancel: () => void } | undefined

/** Redraws the pane every second while any agent runs, so elapsed timers count. */
function startTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(1000, async () => {
    const { value: r = EMPTY } = await $.state.get(RUN)
    if (Object.values(r.agents).every(a => a.isDone)) {
      ticker?.cancel()
      ticker = undefined
    } else if (!isStalled && inFlight === 0 && Date.now() - lastSignAt > STALL_MS && !Object.values(r.agents).some(a => a.isWaiting)) {
      isStalled = true
      void alert($, 'stuck', `nothing for ${formatDuration(Date.now() - lastSignAt)}`)
    }
    await $.state.set(TICK, Date.now())
  })
}

type Alert = 'needsYou' | 'stuck' | 'done'

const ALERTS: Record<Alert, string> = {
  needsYou: 'Claude needs you',
  stuck: 'Claude is stuck',
  done: 'Done',
}
/** A quicker finish needs no toast */
export const LONG_JOB_MS = 60_000
/** No step or tool call from a running request this long counts as stuck */
export const STALL_MS = 3 * 60_000

/** Claude's last message ends by asking something (trailing markup and quotes ignored). */
export const asksQuestion = (answer: string): boolean =>
  /[?？]$/.test(answer.trimEnd().replace(/[*_"'”»)\s]+$/g, ''))

/** A silent toast: no sound. */
async function alert($: EngineInterface, kind: Alert, detail?: string) {
  $.ui.toast(detail ? `${ALERTS[kind]} · ${detail}` : ALERTS[kind])
}

// shortcut: module vars, so a hot reload forgets the last sign of life until the next step or call.
let lastSignAt = Date.now()
let isStalled = false
/** Tool calls running now; a long command is not a stall */
let inFlight = 0

/** Claude did something: a stall, if flagged, is over. */
const sign = () => {
  lastSignAt = Date.now()
  isStalled = false
}

/** Local day as YYYY-MM-DD */
export const dayKey = (at: number): string => {
  const d = new Date(at)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const shiftDay = (day: string, by: number): string => {
  const [y, m, d] = day.split('-').map(Number)

  return dayKey(new Date(y!, m! - 1, d! + by).getTime())
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today, 16 Oct" / "Wed, 15 Oct" */
export const dayLabel = (day: string, today: string): string => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)

  return `${day === today ? 'Today' : WEEKDAYS[date.getDay()]}, ${d} ${MONTHS[m! - 1]}`
}

export const clockTime = (at: number): string => {
  const d = new Date(at)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const HISTORY_PREFIX = 'history:'
const HISTORY_DAYS = 30

const readDay = async ($: EngineInterface, day: string): Promise<HistoryEntry[]> => {
  const v = await $.store.get(HISTORY_PREFIX + day)

  return Array.isArray(v) ? (v as HistoryEntry[]) : []
}

/** Puts `day`'s requests in the fold-out, keeping it open or shut as it was. */
async function showDay($: EngineInterface, day: string, isOpen?: boolean) {
  const { value: was } = await $.state.get(HISTORY)
  await $.state.set(HISTORY, { day, entries: await readDay($, day), isOpen: isOpen ?? was?.isOpen ?? false })
}

/** Saves a finished request under today and drops days past 30. */
async function recordRequest($: EngineInterface, entry: HistoryEntry) {
  const day = dayKey(entry.at)
  await $.store.set(HISTORY_PREFIX + day, [...(await readDay($, day)), entry])
  const oldest = shiftDay(dayKey(Date.now()), -HISTORY_DAYS)
  for (const key of await $.store.keys()) {
    if (key.startsWith(HISTORY_PREFIX) && key.slice(HISTORY_PREFIX.length) < oldest) await $.store.delete(key)
  }
  const { value: view } = await $.state.get(HISTORY)
  if (!view || view.day === day) await showDay($, day)
}

/** A written file's path within the project, or just its name outside it. */
export const projectPath = (file: string, cwd: string): string => {
  const norm = (p: string) => p.replace(/\\/g, '/')
  const f = norm(file)
  const root = norm(cwd).replace(/\/$/, '') + '/'

  return f.toLowerCase().startsWith(root.toLowerCase()) ? f.slice(root.length) : baseName(f)
}

const WRITES = new Set(['Write', 'Edit', 'NotebookEdit'])
/** How many files the unfolded list shows before "+N more" */
const FILES_SHOWN = 4

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    startPoller($, Number(options.pollSeconds ?? 10))
    await showDay($, dayKey(Date.now()))
    await $.command.register({
      name: 'monitor',
      description: 'Show the live agent monitor pane (/monitor off hides it)',
      argumentHint: '[off]',
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && e.context.tokens !== undefined) await $.state.set(CONTEXT, e.context.tokens)
    // With the account poll running, its figures (every session's use) outrank this session's last response.
    if (e.changed.includes('rateLimits') && Date.now() - accountReadAt > ACCOUNT_FRESH) await applyLimits($, e.rateLimits)

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
      const agents: Record<string, AgentRow> = { [MAIN]: newRow(MAIN, 'main', maskPrivate(e.text).slice(0, 80)) }
      for (const id of carried) agents[id] = r.agents[id]!

      return { order: [MAIN, ...carried], agents }
    })
    $.ui.status(summary(latest))
    sign()
    await $.state.set(EXPANDED, [])
    await $.state.set(FILES_OPEN, false)
    startTicker($)
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
        agents: { ...r.agents, [id]: { ...newRow(id, e.subagentType, maskPrivate(e.description), parentId), model: spawned.model } },
      }
    })
    if (latest.agents[id]) $.ui.status(summary(latest))
    startTicker($)

    return spawned
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId ?? MAIN
    sign()
    await change($, id, a => ({ ...a, doing: 'thinking…', isThinking: true, model: a.model ?? e.model }))
    const result = yield* next(e)
    sign()
    const u = result.usage
    if (u) {
      const used = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
      await change($, id, a => ({ ...a, tokens: a.tokens + used }))
    }

    return result
  })

  // A call the mode puts to the person shows the claude-let raising its hand until it is answered.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id) {
      await change($, e.agentId ?? MAIN, a => ({ ...a, isWaiting: true, isThinking: false }))
      void alert($, 'needsYou', 'approve a tool call')
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const input = e as unknown as Record<string, unknown>
    const doing = describeCall(String(e.tool), input)
    await change($, id, a => ({
      ...a, doing, tool: String(e.tool), isThinking: false, isWaiting: ASKS_PERSON.has(String(e.tool)) || undefined,
      history: (a.history ?? []).at(-1) === doing ? a.history : [...(a.history ?? []), doing].slice(-RECAP),
    }))
    sign()
    if (ASKS_PERSON.has(String(e.tool))) void alert($, 'needsYou', doing)
    const written = WRITES.has(String(e.tool)) ? String(input.file_path ?? input.notebook_path ?? '') : ''
    // Checked before the write lands: a Write to a missing file creates it.
    const isNew = written !== '' && e.tool === 'Write' && !(await $.fs.exists(written).catch(() => true))
    inFlight++
    const ran = await next(e).finally(() => { inFlight--; sign() })
    await change($, id, a => (a.isWaiting ? { ...a, isWaiting: undefined } : a))
    if (ran.deny !== undefined || ran.isError) return ran

    if (written) {
      const path = projectPath(written, await $.session.cwd())
      await updateRun($, r => (r.files ?? []).some(f => f.path === path)
        ? r
        : { ...r, files: [...(r.files ?? []), { path, isNew } satisfies TouchedFile] })
    }

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
    await change($, id, a => ({
      ...a, isDone: true, doing: label, isThinking: false, isWaiting: undefined,
      isError: e.reason === 'error' && !e.isAborted, endedAt: Date.now(),
    }))
    if (id === MAIN && !e.isAborted) {
      if (e.reason === 'error' || e.reason === 'refusal') void alert($, 'stuck', e.reason === 'error' ? 'stopped on an error' : 'refused')
      else if (asksQuestion(e.answer)) void alert($, 'needsYou', 'answer the question in chat')
      else if (e.durationMs >= LONG_JOB_MS) void alert($, 'done', formatDuration(e.durationMs))
    }
    if (id === MAIN) {
      const { value: r = EMPTY } = await $.state.get(RUN)
      const main = r.agents[MAIN]
      if (main) {
        // History is a nice-to-have: a store failure must not stop the turn ending.
        await recordRequest($, {
          at: main.startedAt ?? Date.now() - e.durationMs,
          title: main.description,
          outcome: e.isAborted ? 'interrupted' : e.reason === 'error' || e.reason === 'refusal' ? 'stuck' : 'done',
          ms: e.durationMs,
          tokens: totalTokens(r),
          files: (r.files ?? []).length,
        }).catch(() => undefined)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Surfaces that draw SVG get claude-lets and smooth bars; the terminal keeps text.
    const Svg = 'Svg' in els ? els.Svg : undefined
    const { value: r = EMPTY } = await $.state.get(RUN)
    const { value: ctxTokens } = await $.state.get(CONTEXT)
    const { value: limits = [] } = await $.state.get(LIMITS)
    const { value: samples = {} } = await $.state.get(SAMPLES)
    const { value: expanded = [] } = await $.state.get(EXPANDED)
    const { value: filesOpen = false } = await $.state.get(FILES_OPEN)
    const { value: history } = await $.state.get(HISTORY)
    await $.state.get(TICK)
    const now = Date.now()
    const cols = Math.max(24, e.props.bodyColumns)

    if (!r.agents[MAIN]) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Waiting for your next request…</Text>
        </Box>
      )
    }

    const gauges: Gauge[] = [
      ...(ctxTokens === undefined ? [] : [contextGauge(ctxTokens)]),
      ...limits.map(l => limitGauge(l, now, samples[l.kind])),
    ]
    // Label, bar and value are three fixed columns, so every bar starts and ends at the same x.
    const barCells = Math.max(8, Math.min(24, cols - 30))
    const barPx = barCells * 7
    const gaugeRow = (g: Gauge) => (
      <Box key={g.label} flexDirection="row" alignItems="center" gap={1}>
        <Box width={3} flexShrink={0}><Text dimColor>{g.label}</Text></Box>
        {Svg
          ? <Svg source={gaugeSvg(g, barPx)} alt={`${g.label} ${Math.round(g.fill * 100)}%`} width={barPx} height={12} />
          : (
            <Text>
              {gaugeRuns(g, barCells).map((run, i) => run.kind === 'empty'
                ? <Text key={String(i)} dimColor>{run.text}</Text>
                : <Text key={String(i)} color={run.kind === 'mark' ? 'warning' : g.level}>{run.text}</Text>)}
            </Text>
          )}
        <Text wrap="truncate-end" color={g.level === 'warning' || g.level === 'error' ? g.level : undefined}>
          {g.text}
        </Text>
      </Box>
    )

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
    const runDone = ordered.every(a => a.isDone)
    const toggle = (id: string) => () => void $.state.set(
      EXPANDED, expanded.includes(id) ? expanded.filter(x => x !== id) : [...expanded, id],
    )

    const files = r.files ?? []
    // Summary B: one line on the finished main row, the files behind a toggle.
    const finishLine = (gutter: string, elapsed: string | undefined) => (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="success" wrap="truncate-end">{`${gutter}✓ ${[elapsed, `${formatTokens(totalTokens(r))} tok`].filter(Boolean).join(' · ')}`}</Text>
          {files.length
            ? <Button key="files" plain dimColor onPress={() => void $.state.set(FILES_OPEN, !filesOpen)}>{filesOpen ? '▾ hide files' : `▸ ${files.length} file${files.length === 1 ? '' : 's'}`}</Button>
            : null}
        </Box>
        {filesOpen ? files.slice(0, FILES_SHOWN).map((f, n) => (
          <Text key={f.path} wrap="truncate-end">
            {gutter}
            <Text color={f.isNew ? 'success' : 'warning'}>{f.isNew ? '+ ' : '~ '}</Text>
            {f.path}
            {n === FILES_SHOWN - 1 && files.length > FILES_SHOWN ? <Text dimColor>{` +${files.length - FILES_SHOWN} more`}</Text> : null}
          </Text>
        )) : null}
      </Box>
    )

    // History A: a fold-out under the rows, a day at a time.
    const today = dayKey(now)
    const view: HistoryView = history ?? { day: today, entries: [], isOpen: false }
    const isToday = view.day === today
    const dayMs = view.entries.reduce((sum, q) => sum + q.ms, 0)
    const dayTok = view.entries.reduce((sum, q) => sum + q.tokens, 0)
    const historyBlock = (
      <Box flexDirection="column">
        <Text dimColor>{'─'.repeat(Math.min(cols, 48))}</Text>
        <Button key="history" plain dimColor onPress={() => void $.state.set(HISTORY, { ...view, isOpen: !view.isOpen })}>
          {view.isOpen ? '▾ hide history' : `▸ history · ${view.entries.length} ${isToday ? 'today' : dayLabel(view.day, today)}`}
        </Button>
        {view.isOpen
          ? (
            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
              <Box flexDirection="row" gap={1}>
                <Button key="day-prev" plain dimColor onPress={() => void showDay($, shiftDay(view.day, -1))}>‹</Button>
                <Text bold>{dayLabel(view.day, today)}</Text>
                {isToday ? null : <Button key="day-next" plain dimColor onPress={() => void showDay($, shiftDay(view.day, 1))}>›</Button>}
                <Text dimColor wrap="truncate-end">{` ${view.entries.length} · ${formatDuration(dayMs).replace(/\d+s$/, '') || '0m'} · ${formatTokens(dayTok)}`}</Text>
              </Box>
              {view.entries.length === 0 ? <Text dimColor>No requests this day.</Text> : null}
              {view.entries.map((q, n) => (
                <Box key={`h${n}`} flexDirection="column">
                  <Text wrap="truncate-end">
                    <Text dimColor>{clockTime(q.at)}</Text>
                    <Text color={q.outcome === 'done' ? 'success' : 'warning'}>{q.outcome === 'done' ? ' ✓ ' : q.outcome === 'stuck' ? ' ⚠ ' : ' ■ '}</Text>
                    {q.title}
                  </Text>
                  <Text dimColor wrap="truncate-end">{`        ${formatDuration(q.ms)} · ${formatTokens(q.tokens)} tok${q.files ? ` · ${q.files} file${q.files === 1 ? '' : 's'}` : ''}`}</Text>
                </Box>
              ))}
            </Box>
          )
          : null}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>Agent monitor</Text>
          <Text dimColor>{`  Σ ${formatTokens(totalTokens(r))} tok`}</Text>
        </Text>
        {gauges.map(gaugeRow)}
        <Text dimColor>{'─'.repeat(Math.min(cols, 48))}</Text>
        {ordered.map((a, i) => {
          const depth = depthOf(a)
          // With a sprite the Box margin indents the row, so the text carries no indent of its own.
          const indent = Svg ? '' : '  '.repeat(depth)
          const gutter = Svg ? '' : `${indent}  `
          const pct = percentOf(a)
          const badge = modelBadge(a.model)
          const elapsed = a.startedAt === undefined ? undefined : formatDuration((a.endedAt ?? now) - a.startedAt)
          const done = a.steps.filter(s => s.status === 'completed').length
          // A finished subagent folds to two dim lines while the rest of the run goes on.
          const isFolded = a.isDone && a.id !== MAIN && !runDone
          const stats = [
            ...(a.steps.length && !isFolded ? [`${done}/${a.steps.length}`] : []),
            `${a.isDone ? '✓ ' : ''}${formatTokens(a.tokens)}`,
            ...(elapsed ? [elapsed] : []),
          ]
          const waiting = runningChildren(a.id)
          const doing = a.isWaiting ? 'waiting on you'
            : a.isDone && waiting > 0 ? `waiting on ${waiting} agent${waiting > 1 ? 's' : ''}` : a.doing
          const earlier = (a.history ?? []).slice(0, -1)
          const isOpen = expanded.includes(a.id)
          const width = Math.max(6, Math.min(20, cols - indent.length - 16 - (Svg ? 2 * depth + 7 : 0)))
          const color: Level = a.isDone ? 'success' : 'suggestion'

          const head = (
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Text wrap="truncate-end" dimColor={isFolded}>
                {indent}
                {Svg ? null : <Text color={a.isWaiting ? 'warning' : color}>{a.isDone ? '✓ ' : a.isWaiting ? '✋ ' : '● '}</Text>}
                <Text bold>{a.name}</Text>
                {badge ? <Text dimColor>{` ${badge}`}</Text> : null}
              </Text>
              <Text dimColor>{stats.join(' · ')}</Text>
            </Box>
          )
          const lines = isFolded
            ? (
              <Box flexDirection="column" flexShrink={1} flexGrow={1}>
                {head}
                <Text dimColor wrap="truncate-end">{`${gutter}${a.isError ? 'stopped' : 'done'} · ${a.description}`}</Text>
              </Box>
            )
            : (
              <Box flexDirection="column" flexShrink={1} flexGrow={1}>
                {head}
                {Svg
                  ? <Svg source={gaugeSvg({ fill: (pct ?? 0) / 100, level: color, color: a.isDone ? undefined : HEX.accent }, width * 7, 10)} alt={`${pct ?? 0}% of steps done`} width={width * 7} height={10} />
                  : (
                    <Text wrap="truncate-end">
                      {gutter}
                      <Text color={color}>{'█'.repeat(pct === undefined ? 0 : Math.round((pct / 100) * width))}</Text>
                      <Text dimColor>{'░'.repeat(width - (pct === undefined ? 0 : Math.round((pct / 100) * width)))}</Text>
                    </Text>
                  )}
                <Box flexDirection="row" gap={1}>
                  <Text dimColor={!a.isWaiting} color={a.isWaiting ? 'warning' : undefined} wrap="truncate-end">{`${gutter}↳ ${doing}`}</Text>
                  {earlier.length
                    ? <Button key={`hist:${a.id}`} plain dimColor onPress={toggle(a.id)}>{isOpen ? '▾ hide' : `▸ ${earlier.length} earlier`}</Button>
                    : null}
                </Box>
                {isOpen ? earlier.map((act, n) => (
                  <Text key={String(n)} dimColor wrap="truncate-end">{`${gutter}  ${n + 1}. ${act}`}</Text>
                )) : null}
                {a.id === MAIN && runDone ? finishLine(gutter, elapsed) : null}
              </Box>
            )
          if (!Svg) return <Box key={a.id}>{lines}</Box>
          const sprite = { role: a.name, pose: poseOf(a, runDone), tool: a.tool, phase: i }

          return (
            <Box key={a.id} flexDirection="row" alignItems="center" gap={1} marginLeft={2 * depth} marginBottom={1}>
              <Svg source={claudeletSvg(sprite)} alt={claudeletAlt(sprite)} width={44} height={33} />
              {lines}
            </Box>
          )
        })}
        {historyBlock}
      </Box>
    )
  })
}
