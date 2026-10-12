import { test, expect } from 'claude-code/testing'
import { meter } from './register'

test('green under 300k, split at marker', () => {
  const m = meter(150_000)
  expect(m.color).toBe('green')
  expect(m.before).toEqual({ full: '███', empty: '░░░' })
  expect(m.after).toEqual({ full: '', empty: '░'.repeat(14) })
  expect(m.label).toBe('150k/1M')
})

test('orange from 300k, fills past marker', () => {
  const m = meter(400_000)
  expect(m.color).toBe('#FF8C00')
  expect(m.before.full).toBe('██████')
  expect(m.after).toEqual({ full: '██', empty: '░'.repeat(12) })
})

test('caps at 1M', () => {
  expect(meter(2_000_000).after.empty).toBe('')
})

test('band draws orange bar with marker on every surface', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 412_000, window: 1_000_000, percent: 41 },
    rateLimits: [],
    changed: ['context'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'context-meter',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 },
    })
    expect(await ui.find({ type: 'Text', text: /412k\/1M/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '│' })).toBeDefined()
    await ui.unmount()
  }
})
