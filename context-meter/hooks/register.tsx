import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const MAX = 1_000_000
const WARN = 300_000
const CELLS = 20 // 50k per cell
const WARN_CELL = WARN / (MAX / CELLS) // marker after cell 6
const GREEN = 'green'
const ORANGE = '#FF8C00'

const tokens = atom({ plugin: 'context-meter', key: 'tokens' } as const, null)

const compact = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

// Bar as [filled, empty] strings for the parts before and after the 300k marker.
export const meter = (t: number) => {
  const filled = Math.min(CELLS, Math.round((t / MAX) * CELLS))
  const cell = (i: number) => (i < filled ? '█' : '░')
  const part = (from: number, to: number) => {
    let s = ''
    for (let i = from; i < to; i++) s += cell(i)
    return { full: s.replace(/░/g, ''), empty: s.replace(/█/g, '') }
  }
  return {
    before: part(0, WARN_CELL),
    after: part(WARN_CELL, CELLS),
    color: t >= WARN ? ORANGE : GREEN,
    label: `${compact(t)}/${compact(MAX)}`,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const { context } = await $.session.usage()
    await update($, tokens, () => context.tokens ?? null)
    return r
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await update($, tokens, () => e.context.tokens ?? null)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const t = await read($, tokens)
    if (e.props.hasSurvey || t === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const m = meter(t)
    return (
      <Box>
        <Text dimColor>ctx </Text>
        <Text color={m.color}>{m.before.full}</Text>
        <Text dimColor>{m.before.empty}</Text>
        <Text color="warning">│</Text>
        <Text color={m.color}>{m.after.full}</Text>
        <Text dimColor>{m.after.empty}</Text>
        <Text color={m.color}> {m.label}</Text>
      </Box>
    )
  })
}
