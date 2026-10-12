import { expect, test } from 'claude-code/testing'
import { contextBar, describeCall } from './register'

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
      plugin: 'agent-monitor', surface, component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 44 } as never,
    })
    expect(await ui.find({ text: /Explore/ })).toBeDefined()
    expect(await ui.find({ text: /Searching "refreshToken"/ })).toBeDefined()
    expect(await ui.find({ text: /25%/ })).toBeDefined()
    // A claude-let per row where SVG draws; the terminal keeps its status dots.
    const sprites = await ui.findAll({ type: 'Svg' })
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
      plugin: 'agent-monitor', surface: 'desktop', component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 44 } as never,
    })
    const found = (await ui.findAll({ type: 'Svg' })).map(s => s.props.alt)
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

test('context bar fills to 500k, marks 300k and warns past it', async ($, on) => {
  const low = contextBar(100_000, 10)
  expect(low).toEqual({ runs: [{ kind: 'fill', text: '██' }, { kind: 'empty', text: '░░░░' }, { kind: 'mark', text: '│' }, { kind: 'empty', text: '░░░' }], pct: 20, isWarn: false })
  expect(contextBar(350_000, 10).isWarn).toBe(true)
  expect(contextBar(500_000, 10).pct).toBe(100)

  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.session.measure({ context: { tokens: 350_000, window: 1_000_000, percent: 35 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'agent-monitor', surface: 'desktop', component: 'Pane', requestId: 'agent-monitor',
    props: { bodyColumns: 44 } as never,
  })
  expect(await ui.find({ text: /70% 350\.0k\/500k ⚠/ })).toBeDefined()
  expect(await ui.find({ text: /go/ })).toBeDefined()
  await ui.unmount()
})

test('each row keeps a numbered recap of its last 5 actions', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (const f of ['a.ts', 'b.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']) {
    await $.tool.call({ tool: 'Read', file_path: f } as Parameters<typeof $.tool.call>[0])
  }
  const ui = await $.ui.mount({
    plugin: 'agent-monitor', surface: 'terminal', component: 'Pane', requestId: 'agent-monitor',
    props: { bodyColumns: 44 } as never,
  })
  expect(await ui.find({ text: /1\. Reading b\.ts/ })).toBeDefined()
  expect(await ui.find({ text: /5\. Reading f\.ts/ })).toBeDefined()
  expect(await ui.find({ text: /Reading a\.ts/ })).toBeUndefined()
  await ui.unmount()
})
