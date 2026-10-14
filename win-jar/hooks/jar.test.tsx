import { expect, mock, test } from 'claude-code/testing'

import { addWin, summary } from './jar'

const DAY = 24 * 3600_000
const now = 1000 * DAY + 12 * 3600_000

test('summary counts today, the week, the streak, and groups by project', () => {
  const wins = [
    { t: now - 3 * DAY, text: 'old', project: 'a' },
    { t: now - 2 * DAY, text: 'b1', project: 'a' },
    { t: now - DAY, text: 'c1', project: 'a' },
    { t: now - 60_000, text: 'd1', project: 'a' },
    { t: now, text: 'd2', project: 'b' },
  ]
  const s = summary(wins, now, 0)
  expect([s.today, s.week, s.streak]).toEqual([2, 5, 4])
  expect(Object.keys(s.byProject)).toEqual(['a', 'b'])
})

test('streak survives a day with no win yet; addWin drops wins past 60 days', () => {
  expect(summary([{ t: now - DAY, text: 'y', project: 'a' }], now, 0).streak).toBe(1)
  const kept = addWin([{ t: now - 61 * DAY, text: 'x', project: 'a' }], { t: now, text: 'n', project: 'a' }, 0)
  expect(kept.map(w => w.text)).toEqual(['n'])
})

test('a finished glanceflow step lands in the jar and the pane draws it', async ($, on) => {
  mock.clock(on, { now })
  mock.store(on)
  on('session.root', () => ({ value: 'D:\\code\\app' }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: 'mcp__glanceflow__report_progress', task: 'Build x', percent: 100, summary: 'Built the thing' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'win-jar', surface, component: 'Pane', requestId: 'win-jar', props: {} as never })
    expect(await ui.find({ type: 'Text', text: /Built the thing/ })).toBeDefined()
    await ui.unmount()
  }
})
