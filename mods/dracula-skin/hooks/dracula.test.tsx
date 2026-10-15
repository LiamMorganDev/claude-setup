import { expect, test } from 'claude-code/testing'

import { DARK, LIGHT, TAGS, divider, isLightTheme, kindOfTool, paletteFor, tagForGroup, tagForResult, tagForToolUse } from './lib'

const call = (tool: string, s: Partial<{ isErrored: boolean; isInterrupted: boolean }> = {}) =>
  ({ tool, isErrored: false, isInterrupted: false, ...s })

test('tools map to kinds', () => {
  expect(kindOfTool('Bash')).toBe('run')
  expect(kindOfTool('PowerShell')).toBe('run')
  expect(kindOfTool('Read')).toBe('read')
  expect(kindOfTool('Grep')).toBe('read')
  expect(kindOfTool('Edit')).toBe('edit')
  expect(kindOfTool('Write')).toBe('edit')
  expect(kindOfTool('Agent')).toBe('agent')
  expect(kindOfTool('mcp__ccd_session__start_session')).toBe('agent')
  expect(kindOfTool('Skill')).toBe('tool')
})

test('row state wins over tool kind', () => {
  expect(tagForToolUse(call('Bash'))).toBe(TAGS.run)
  expect(tagForToolUse(call('Edit', { isErrored: true }))).toBe(TAGS.err)
  expect(tagForToolUse(call('Bash', { isInterrupted: true, isErrored: true }))).toBe(TAGS.stop)
  expect(tagForResult({ isErrored: false })).toBe(undefined)
  expect(tagForResult({ isErrored: true })).toBe(TAGS.err)
})

test('folded groups are tagged by their contents', () => {
  expect(tagForGroup([call('Read'), call('Grep')])).toBe(TAGS.read)
  expect(tagForGroup([call('Bash'), call('Bash')])).toBe(TAGS.run)
  expect(tagForGroup([call('Read'), call('Bash')])).toBe(TAGS.tools)
  expect(tagForGroup([call('Read'), call('Grep', { isErrored: true })])).toBe(TAGS.err)
})

test('light themes get the Alucard palette', () => {
  expect(isLightTheme('light')).toBe(true)
  expect(isLightTheme('light-daltonized')).toBe(true)
  expect(isLightTheme('dark')).toBe(false)
  expect(isLightTheme(undefined)).toBe(false)
  expect(paletteFor(true)).toBe(LIGHT)
  expect(paletteFor(false)).toBe(DARK)
})

test('rows draw tree branches, tags and turn dividers', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })

  for (const surface of ['desktop', 'vscode'] as const) {
    const mount = (component: string, props: unknown) =>
      $.ui.mount({ plugin: 'dracula-skin', surface, component, props } as never)

    const tool = await mount('ToolUse', { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false })
    expect(await tool.find({ text: /├─/ })).toBeDefined()
    expect(await tool.find({ text: /\[run\]/ })).toBeDefined()
    await tool.unmount()

    const ok = await mount('ToolResult', { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: false })
    expect(await ok.find({ text: /↳/ })).toBeDefined()
    expect(await ok.find({ text: /\[/ })).toBe(undefined)
    await ok.unmount()

    const bad = await mount('ToolResult', { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: true })
    expect(await bad.find({ text: /\[err\]/ })).toBeDefined()
    await bad.unmount()

    const user = await mount('UserMessage', { text: 'hi', origin: { kind: 'composer' }, isExpanded: true })
    expect(await user.find({ text: divider(TAGS.you) })).toBeDefined()
    await user.unmount()

    const reply = await mount('AssistantMessage', { text: 'hello', isFirstOfReply: true })
    expect(await reply.find({ text: divider(TAGS.claude) })).toBeDefined()
    await reply.unmount()

    const later = await mount('AssistantMessage', { text: 'more', isFirstOfReply: false })
    expect(await later.find({ text: /──/ })).toBe(undefined)
    await later.unmount()

    const group = await mount('ToolGroup', { calls: [{ tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }], isActive: false, isExpanded: false })
    expect(await group.find({ text: /\[read\]/ })).toBeDefined()
    await group.unmount()
  }
})
