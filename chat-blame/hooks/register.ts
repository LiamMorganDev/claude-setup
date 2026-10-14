import type { EngineInterface, Register } from 'claude-code'

import { blameFile, labelOf, stamp, type Blame } from './lib'

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

let label = ''

async function record($: EngineInterface, path: string) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return
  if (!label) {
    const msgs = await $.session.messages()
    label = labelOf(msgs.filter(m => m.role === 'user').map(m => m.text))
  }
  const file = blameFile(home)
  // shortcut: read-modify-write without a lock; two chats saving in the same instant can drop one stamp.
  let map: Record<string, Blame> = {}
  try {
    if (await $.fs.exists(file)) map = JSON.parse(String(await $.fs.read(file))) as Record<string, Blame>
  } catch {
    map = {}
  }
  await $.fs.write(file, JSON.stringify(stamp(map, path, { s: await $.session.id(), l: label, t: await $.clock.now() })))
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!FILE_TOOLS.has(String(e.tool)) || r.deny !== undefined || r.isError) return r
    const input = e as unknown as { file_path?: string; notebook_path?: string }
    const path = input.file_path ?? input.notebook_path
    if (path) await record($, path).catch(() => undefined)
    return r
  })
}
