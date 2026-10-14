import { expect, mock, test } from 'claude-code/testing'

import { isPush, xOf } from './register'

test('isPush spots git push in shell commands only', () => {
  expect(isPush('git push')).toBe(true)
  expect(isPush('git -C D:/code/app push -u origin HEAD')).toBe(true)
  expect(isPush('git commit -m "push it" && npm test')).toBe(false)
  expect(isPush('echo push')).toBe(false)
})

test('xOf flies from the left edge to the right edge', () => {
  expect(xOf(0, 80)).toBe(0)
  expect(xOf(35, 80)).toBe(80 - 8)
})

test('a successful push launches a bat across the band, then it leaves', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  await $.tool.call({ tool: 'Bash', command: 'git push' } as never)
  await clock.advance(70 * 5)
  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({
      plugin: 'bat-flyby',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /\(ºvº\)/ })).toBeDefined()
    await ui.unmount()
  }
  await clock.advance(70 * 40)
  const ui = await $.ui.mount({
    plugin: 'bat-flyby',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never,
  })
  expect(await ui.find({ type: 'Text', text: /\(ºvº\)/ })).toBeUndefined()
  await ui.unmount()
})
