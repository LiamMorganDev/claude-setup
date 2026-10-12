import { expect, test } from 'claude-code/testing'

import { classify, envDiff, envShape } from './lib'

const FILES: Record<string, string> = {
  '/repo/.env': '# ─── Database ───\n# where PB lives\nPOCKETBASE_URL=http://x\nPB_ADMIN_EMAIL=a@b\n',
  '/repo/.env.example': '# ─── Database ───\n# where PB lives\nPOCKETBASE_URL=\n',
}

test('classifies schema, types and zod files', () => {
  expect(classify('C:\\repo\\pb_schema.json')).toBe('schema')
  expect(classify('/repo/shared/types/collections.ts')).toBe('types')
  expect(classify('/repo/shared/schemas/user.ts')).toBe('zod')
  expect(classify('/repo/src/db/schema.ts')).toBe('schema')
  expect(classify('/repo/src/app.tsx')).toBe(undefined)
})

test('env diff ignores values, catches missing keys and order', () => {
  const a = envShape('A=1\n# ─── S ───\nB=2')
  expect(envDiff(a, envShape('A=\n# ─── S ───\nB='), 'x', 'y')).toEqual([])
  expect(envDiff(a, envShape('A=\n# ─── S ───'), 'x', 'y')).toEqual(['B in x, missing from y'])
  expect(envDiff(a, envShape('# ─── S ───\nA=\nB='), 'x', 'y')).toEqual(['order differs from A onward'])
})

test('editing .env with drift tells the model and shows the band', async ($, on) => {
  const at = (path: string) => '/repo/' + path.replace(/\\/g, '/').split('/').pop()
  on('fs.exists', ($, e) => ({ value: at(e.path) in FILES }))
  on('fs.read', ($, e) => ({ value: FILES[at(e.path)] }))
  on('tool.call', () => ({ result: {} as never }))

  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/.env', old_string: 'a', new_string: 'b' } as never)
  expect(ran.context?.join('\n')).toMatch(/PB_ADMIN_EMAIL in \.env, missing from \.env\.example/)

  const ui = await $.ui.mount({
    plugin: 'lockstep-guards', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, bodyColumns: 100 } as never,
  })
  expect(await ui.find({ text: /env drift/ })).toBeDefined()
  await ui.unmount()
})

test('schema edit nudges once and the band tracks layers until complete', async ($, on) => {
  on('tool.call', () => ({ result: {} as never }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const edit = (file_path: string) =>
    $.tool.call({ tool: 'Write', file_path, content: '' } as never)

  const first = await edit('/repo/pb_schema.json')
  expect(first.context?.join('\n')).toMatch(/Update types \+ zod/)
  const second = await edit('/repo/shared/types/collections.ts')
  expect(second.context).toBe(undefined)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'lockstep-guards', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, bodyColumns: 100 } as never,
    })
    expect(await ui.find({ text: /needs zod/ })).toBeDefined()
    await ui.unmount()
  }

  await edit('/repo/shared/schemas/collections.ts')
  const ui = await $.ui.mount({
    plugin: 'lockstep-guards', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, bodyColumns: 100 } as never,
  })
  expect(await ui.find({ text: /lockstep/ })).toBe(undefined)
  await ui.unmount()
})
