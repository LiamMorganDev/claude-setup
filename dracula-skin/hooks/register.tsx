import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import {
  CALL_PREFIX, RESULT_PREFIX, TAGS, divider, isLightTheme, paletteFor,
  tagForGroup, tagForResult, tagForToolUse,
} from './lib'
import type { Tag } from './lib'

const isLight = atom({ plugin: 'dracula-skin', key: 'isLight' } as const, false)

const palette = async ($: EngineInterface) => paletteFor(await read($, isLight))

async function syncTheme($: EngineInterface) {
  // A host without the config menu keeps the dark palette.
  const rows = await $.config.list().catch(() => [])
  const theme = rows.find(row => row.key === 'theme')?.value
  await update($, isLight, () => isLightTheme(theme))
}

/** `── [you] ────` above the engine's own row. */
async function withDivider($: EngineInterface, e: RenderInput, tag: Tag, row: RenderElement) {
  const { Box, Text } = $.ui.resolve(e)
  const p = await palette($)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={p[tag.color]} bold wrap="truncate-end">
        {divider(tag)}
      </Text>
      {row}
    </Box>
  )
}

/** `├─ [run] ` (or `│  ↳ [err] `) in front of the engine's own row. */
async function withBranch($: EngineInterface, e: RenderInput, prefix: string, tag: Tag | undefined, row: RenderElement) {
  const { Box, Text } = $.ui.resolve(e)
  const p = await palette($)

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>
        <Text color={p.dim}>{prefix}</Text>
        {tag && <Text color={p[tag.color]}>[{tag.label}] </Text>}
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        {row}
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await syncTheme($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    await syncTheme($)

    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) =>
    withDivider($, e, TAGS.you, await next(e)),
  )

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (e.props.isSummary) return withBranch($, e, CALL_PREFIX, TAGS.sum, row)

    return e.props.isFirstOfReply ? withDivider($, e, TAGS.claude, row) : row
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) =>
    withBranch($, e, CALL_PREFIX, tagForToolUse(e.props), await next(e)),
  )

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    withBranch($, e, RESULT_PREFIX, tagForResult(e.props), await next(e)),
  )

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const row = await next(e)

    // Expanded, each call is its own ToolUse row and gets its own branch.
    return e.props.isExpanded ? row : withBranch($, e, CALL_PREFIX, tagForGroup(e.props.calls), row)
  })
}
