import { expect, test } from 'claude-code/testing'
import { asksQuestion, dayKey, projectPath, shiftDay, contextGauge, describeCall, parseAccountUsage, forecastFull, formatDuration, gaugeRuns, limitGauge, modelBadge } from './register'

async function drain<R>(stream: AsyncGenerator<unknown, R> & { result: Promise<R> }): Promise<R> {
  for await (const _ of stream) { /* read to the end */ }

  return stream.result
}

const usage ={ input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 300, model: 'm' }

test('tracks steps, tokens and subagents, and draws them in the pane', async ($, on) => {
  const statuses: Array<string | undefined> = []
  on('ui.status', ($, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'sub-1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })

  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'a', status: 'completed', activeForm: 'A' },
      { content: 'b', status: 'in_progress', activeForm: 'B' },
      { content: 'c', status: 'pending', activeForm: 'C' },
      { content: 'd', status: 'pending', activeForm: 'D' },
    ],
  })
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 }))
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'look', description: 'Find refresh code', subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, background: false, fork: false,
  } as Parameters<typeof $.agent.spawn>[0])
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1, agentId: 'sub-1' }))
  await $.tool.call({ tool: 'Grep', pattern: 'refreshToken', agentId: 'sub-1' } as Parameters<typeof $.tool.call>[0])

  // 1000 + 200 + 300 per step, cache reads left out; two steps
  expect(statuses.at(-1)).toBe('▸ 25% · 3.0k tok · 1 agent')

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({
      plugin: 'claudelets-agent-monitor', surface, component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 44 } as never,
    })
    expect(await ui.find({ text: /Explore/ })).toBeDefined()
    expect(await ui.find({ text: /Searching "refreshToken"/ })).toBeDefined()
    expect(await ui.find({ text: /^1\/4 · / })).toBeDefined()
    // A claude-let per row where SVG draws; the terminal keeps its status dots.
    const sprites = (await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).includes('Claude'))
    if (surface === 'terminal') {
      expect(sprites).toHaveLength(0)
    } else {
      expect(sprites.map(s => s.props.alt)).toEqual([
        'main Claude thinking',
        'Explore Claude working with Grep',
      ])
      expect(String(sprites[1]!.props.source)).toContain('#CDB57E') // Explore's pith helmet
      expect(String(sprites[1]!.props.source)).toContain('#9AD1E8') // holding the magnifier
    }
    await ui.unmount()
  }

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'sub-1', reason: 'answer' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(statuses.at(-1)).toBe('✓ done · 3.0k tok · 1 agent')
})

test('claude-lets change pose as the agent thinks, finishes and errors', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'sub-1' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  const alts = async () => {
    const ui = await $.ui.mount({
      plugin: 'claudelets-agent-monitor', surface: 'desktop', component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 44 } as never,
    })
    const found = (await ui.findAll({ type: 'Svg' })).map(s => s.props.alt).filter(a => String(a).includes('Claude'))
    await ui.unmount()

    return found
  }

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'p', description: 'Plan it', subagentType: 'Plan',
    provider: { plugin: 'engine', tier: 'core' }, background: false, fork: false,
  } as Parameters<typeof $.agent.spawn>[0])
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1, agentId: 'sub-1' }))
  expect(await alts()).toEqual(['main Claude working', 'Plan Claude thinking'])

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'sub-1', reason: 'error' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(await alts()).toEqual(['main Claude done', 'Plan Claude stopped on an error'])
})

test('tool calls read as tiny plain-English lines', () => {
  expect(describeCall('Read', { file_path: 'C:\\a\\b\\register.tsx' })).toBe('Reading register.tsx')
  expect(describeCall('Bash', { command: 'npm test', description: 'Run the tests' })).toBe('Running: Run the tests')
  expect(describeCall('mcp__glanceflow__report_progress', {})).toBe('report progress')
  expect(describeCall('Bash', { command: 'x'.repeat(80) })).toHaveLength(40)
})

test('context gauge fills to 1M, marks 300k and warns past it', async ($, on) => {
  const low = contextGauge(200_000)
  expect(gaugeRuns(low, 10)).toEqual([{ kind: 'fill', text: '██' }, { kind: 'empty', text: '░' }, { kind: 'mark', text: '│' }, { kind: 'empty', text: '░░░░░░' }])
  expect(low.text).toBe('20% · 200.0k')
  expect(contextGauge(350_000).level).toBe('warning')
  expect(contextGauge(1_000_000).fill).toBe(1)

  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.session.measure({
    context: { tokens: 350_000, window: 1_000_000, percent: 35 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 42 }, { kind: 'seven_day', percentUsed: 91.5 }, { kind: 'spend_limit', percentUsed: 5 }],
    changed: ['context', 'rateLimits'],
  } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'claudelets-agent-monitor', surface, component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 44 } as never,
    })
    expect(await ui.find({ text: /35% · 350\.0k ⚠/ })).toBeDefined()
    expect(await ui.find({ text: /^42%$/ })).toBeDefined()
    expect(await ui.find({ text: /^91\.5%$/ })).toBeDefined()
    expect(await ui.find({ text: /spend_limit/ })).toBeUndefined()
    if (surface === 'desktop') {
      // ctx, 5h and 7d bars: three SVGs of one width, so they start and end at the same x
      const bars = (await ui.findAll({ type: 'Svg' })).filter(s => /^(ctx|5h|7d) /.test(String(s.props.alt)))
      expect(bars).toHaveLength(3)
      expect(new Set(bars.map(b => b.props.width)).size).toBe(1)
    }
    await ui.unmount()
  }
})

test('limit gauge shows pace, reset and a forecast when the burn rate fills it first', () => {
  const now = Date.parse('2026-10-15T10:00:00Z')
  // 5h window, 2h30m left: half gone, 40% used → under
  const under = limitGauge({ kind: 'five_hour', percentUsed: 40, resetsAt: '2026-10-15T12:30:00Z' }, now)
  expect(under).toMatchObject({ label: '5h', fill: 0.4, pace: 0.5, level: 'success', text: '40% · under · ↻2h30m' })
  const ahead = limitGauge({ kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-15T12:30:00Z' }, now)
  expect(ahead).toMatchObject({ level: 'warning', text: '64% · ahead · ↻2h30m' })
  expect(limitGauge({ kind: 'seven_day', percentUsed: 95, resetsAt: '2026-10-18T13:00:00Z' }, now)).toMatchObject({ level: 'error', text: '95% · ahead · ↻3d3h' })
  expect(gaugeRuns(limitGauge({ kind: 'seven_day', percentUsed: 120 }, now), 10)).toEqual([{ kind: 'fill', text: '██████████' }])

  // 20% in the last 20 min: the 36% left fills in 36 min, before the 2h30m reset
  const samples: Array<[number, number]> = [[now - 20 * 60_000, 44]]
  const l = { kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-15T12:30:00Z' }
  expect(forecastFull(samples, l, now)).toBe(36 * 60_000)
  expect(limitGauge(l, now, samples).text).toBe('64% · full in 36m00s · ↻2h30m')
  // too slow to fill before reset, or readings too close together → no forecast
  expect(forecastFull([[now - 20 * 60_000, 63]], l, now)).toBeUndefined()
  expect(forecastFull([[now - 60_000, 40]], l, now)).toBeUndefined()
})

test('toasts once per window when a limit crosses 90%', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const measure = (percentUsed: number, resetsAt: string) => $.session.measure({
    context: {}, rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt }], changed: ['rateLimits'],
  } as never)
  await measure(85, '2099-01-01T00:00:00Z')
  await measure(91, '2099-01-01T00:00:00Z')
  await measure(93, '2099-01-01T00:00:00Z')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/^5h usage at 91% · resets in /)
  await measure(92, '2099-01-01T05:00:00Z')
  expect(toasts).toHaveLength(2)
})

test('small helpers: durations and model badges', () => {
  expect(formatDuration(41_000)).toBe('41s')
  expect(formatDuration(192_000)).toBe('3m12s')
  expect(formatDuration(3_840_000)).toBe('1h4m')
  expect(modelBadge('claude-opus-5-5')).toBe('opus')
  expect(modelBadge('haiku')).toBe('haiku')
  expect(modelBadge('m')).toBeUndefined()
})

test('a claude-let raises its hand while a question or permission prompt is open', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const alts = async () => {
    const ui = await $.ui.mount({
      plugin: 'claudelets-agent-monitor', surface: 'desktop', component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 44 } as never,
    })
    const found = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt)).filter(a => a.includes('Claude'))
    await ui.unmount()

    return found
  }
  let seen: string[] = []
  on('tool.call', async () => {
    seen = await alts()

    return { result: {} }
  })
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  expect(seen).toEqual(['main Claude waiting on you'])
  expect(await alts()).toEqual(['main Claude working with AskUserQuestion'])
  await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 'tu9' } as never)
  expect(await alts()).toEqual(['main Claude waiting on you'])
})

test('each row folds its last 5 actions behind a toggle', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (const f of ['a.ts', 'b.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']) {
    await $.tool.call({ tool: 'Read', file_path: f } as Parameters<typeof $.tool.call>[0])
  }
  const ui = await $.ui.mount({
    plugin: 'claudelets-agent-monitor', surface: 'terminal', component: 'Pane', requestId: 'agent-monitor',
    props: { bodyColumns: 44 } as never,
  })
  expect(await ui.find({ text: /↳ Reading f.ts/ })).toBeDefined()
  expect(await ui.find({ text: /1. Reading b.ts/ })).toBeUndefined()
  await ui.press({ key: 'hist:main' })
  expect(await ui.find({ text: /1. Reading b.ts/ })).toBeDefined()
  expect(await ui.find({ text: /4. Reading e.ts/ })).toBeDefined()
  expect(await ui.find({ text: /Reading a.ts/ })).toBeUndefined()
  await ui.unmount()
})

test('account usage reads as 5h / 7d limits', () => {
  expect(parseAccountUsage(JSON.stringify({
    five_hour: { utilization: 63.4, resets_at: '2026-10-15T12:30:00Z' },
    seven_day: { utilization: 41, resets_at: null },
    seven_day_opus: { utilization: 3 },
  }))).toEqual([
    { kind: 'five_hour', percentUsed: 63.4, resetsAt: '2026-10-15T12:30:00Z' },
    { kind: 'seven_day', percentUsed: 41 },
  ])
  expect(parseAccountUsage('{"five_hour":null}')).toEqual([])
})

test('secrets in tool lines are masked', () => {
  expect(describeCall('Bash', { command: 'curl -H "x-api-key: sk-ant-abcdefghijklmnopqrstuvwx"' })).not.toMatch(/sk-ant-abc/)
  expect(describeCall('Bash', { command: 'export API_KEY=hunter2secret' })).toContain('••••')
  expect(describeCall('Read', { file_path: 'C:/x/notes.md' })).toBe('Reading notes.md')
})

test('a question at the end counts as asking', () => {
  expect(asksQuestion('Want me to commit it?**')).toBe(true)
  expect(asksQuestion('Done. Tests pass.')).toBe(false)
})

test('toasts silently when Claude needs you, gets stuck or finishes a long job', async ($, on) => {
  const toasts: string[] = []
  const sounds: string[] = []
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  on('audio.play', ($, e) => { sounds.push(String((e.clip as { asset?: string }).asset)); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  const end = (answer: string, extra: object = {}) =>
    $.turn.complete({ answer, durationMs: 5_000, isAborted: false, reason: 'answer', ...extra } as Parameters<typeof $.turn.complete>[0])

  await $.turn.start({ text: 'a', turnId: 't1' })
  await end('Ship it?')
  await settle()
  expect(toasts.at(-1)).toMatch(/^Claude needs you/)

  await $.turn.start({ text: 'b', turnId: 't2' })
  await end('', { reason: 'error' })
  await settle()
  expect(toasts.at(-1)).toMatch(/^Claude is stuck/)

  await $.turn.start({ text: 'c', turnId: 't3' })
  const before = toasts.length
  await end('All good.')
  await settle()
  // a 5s answer is quick: no toast
  expect(toasts.length).toBe(before)

  await $.turn.start({ text: 'd', turnId: 't4' })
  await end('All good.', { durationMs: 125_000 })
  await settle()
  expect(toasts.at(-1)).toBe('Done · 2m05s')
  expect(sounds).toHaveLength(0)
})

test('paths and days', () => {
  expect(projectPath(String.raw`C:\p\hooks\a.ts`, String.raw`C:\p`)).toBe('hooks/a.ts')
  expect(projectPath('/tmp/x.log', '/home/me/p')).toBe('x.log')
  expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  expect(dayKey(new Date(2026, 9, 16, 23, 59).getTime())).toBe('2026-10-16')
})

test('a finished request shows its summary and files, and lands in history', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.delete', ($, e) => { store.delete(e.key); return { value: undefined } })
  on('fs.exists', ($, e) => ({ value: !String(e.path).endsWith('new.ts') }))
  on('session.cwd', () => ({ value: String.raw`C:\proj` }))
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'port the bits', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: String.raw`C:\proj\hooks\new.ts`, content: 'x' } as Parameters<typeof $.tool.call>[0])
  await $.tool.call({ tool: 'Edit', file_path: String.raw`C:\proj\hooks\old.ts`, old_string: 'a', new_string: 'b' } as Parameters<typeof $.tool.call>[0])
  await $.turn.complete({ answer: 'Done.', durationMs: 5_000, isAborted: false, reason: 'answer' } as Parameters<typeof $.turn.complete>[0])

  const saved = store.get(`history:${dayKey(Date.now())}`) as Array<{ title: string; files: number; outcome: string }>
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ title: 'port the bits', files: 2, outcome: 'done' })

  const ui = await $.ui.mount({
    plugin: 'claudelets-agent-monitor', surface: 'terminal', component: 'Pane', requestId: 'agent-monitor',
    props: { bodyColumns: 44 } as never,
  })
  expect(await ui.find({ text: /▸ 2 files/ })).toBeDefined()
  expect(await ui.find({ text: /hooks\/new.ts/ })).toBeUndefined()
  await ui.press({ key: 'files' })
  expect(await ui.find({ text: /hooks\/new.ts/ })).toBeDefined()
  expect(await ui.find({ text: /hooks\/old.ts/ })).toBeDefined()

  expect(await ui.find({ text: /▸ history · 1 today/ })).toBeDefined()
  await ui.press({ key: 'history' })
  expect(await ui.find({ text: /port the bits/ })).toBeDefined()
  expect(await ui.find({ text: /^Today, / })).toBeDefined()
  await ui.press({ key: 'day-prev' })
  expect(await ui.find({ text: /No requests this day/ })).toBeDefined()
  await ui.unmount()
})
