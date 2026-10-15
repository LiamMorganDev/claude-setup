import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const FRAMES = 36
const FRAME_MS = 70
const WINGS = ['︶(ºvº)︶', '︵(ºvº)︵']
const PURPLE = '#bd93f9'
const PINK = '#ff79c6'

// -1 while no bat is in the air.
const frame = atom({ plugin: 'bat-flyby', key: 'frame' } as const, -1)

type $ = EngineInterface
let flight: { cancel: () => void } | null = null

export const isPush = (command: string) => /\bgit\b[^\n|;&]*?\spush\b/.test(command)

// x offset for a frame: an arc across the band, wobbling up and down via the wing flap.
export const xOf = (f: number, columns: number) => Math.round((f / (FRAMES - 1)) * Math.max(0, columns - WINGS[0]!.length - 1))

async function launch($: $) {
  flight?.cancel()
  await update($, frame, () => 0)
  flight = $.clock.every(FRAME_MS, () =>
    void update($, frame, f => {
      if (f + 1 < FRAMES) return f + 1
      flight?.cancel()
      return -1
    }),
  )
}

export const register: Register = on => {
  // Pushes the model runs in a shell.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const tool = String(e.tool)
    if ((tool === 'Bash' || tool === 'PowerShell') && r.deny === undefined && !r.isError) {
      if (isPush(String((e as unknown as { command?: string }).command ?? ''))) await launch($)
    }
    return r
  })

  // Pushes other mods run (git-panel's push chip).
  on('process.run', async ($, e, next) => {
    const r = await next(e)
    const [cmd, ...args] = e.argv
    if (/(^|[\\/])git(\.exe)?$/i.test(cmd ?? '') && args.includes('push') && 'value' in r && r.value?.exitCode === 0) void launch($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, frame)
    if (f < 0 || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)
    const x = xOf(f, e.props.bodyColumns ?? 60)
    return (
      <Box flexDirection="column">
        <Text>
          {' '.repeat(Math.max(0, x - 6))}
          <Text color={PINK} dimColor>
            {x >= 6 ? '˚ · ✦ ' : ''}
          </Text>
          <Text color={PURPLE} bold>
            {WINGS[f % 2]}
          </Text>
          {f > FRAMES - 10 ? <Text color={PINK}> pushed!</Text> : null}
        </Text>
        {below ?? null}
      </Box>
    )
  })
}
