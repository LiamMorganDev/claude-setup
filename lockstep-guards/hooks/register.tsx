import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EnvDrift, Layer, Lockstep } from '../types'
import { LAYERS, classify, envDiff, envShape, envSibling } from './lib'

const EMPTY: Lockstep = { touched: [], files: [] }
const lockstep = atom({ plugin: 'lockstep-guards', key: 'lockstep' } as const, EMPTY)
const envDrift = atom({ plugin: 'lockstep-guards', key: 'envDrift' } as const, null as EnvDrift)

const EDITORS = new Set(['Edit', 'Write', 'MultiEdit'])
const baseName = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const path = (e as { file_path?: unknown }).file_path
    const command = (e as { command?: unknown }).command
    const isEdit = EDITORS.has(String(e.tool)) && typeof path === 'string'
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    // A commit closes the change window.
    if (typeof command === 'string' && /\bgit\s+commit\b/.test(command)) {
      await update($, lockstep, () => EMPTY)
    }
    if (!isEdit) return ran

    const notes: string[] = []

    const env = envSibling(path)
    if (env) {
      const drift = await checkEnv($, env.self, env.other)
      await update($, envDrift, () => (drift.length ? { dir: env.dir || '.', problems: drift } : null))
      if (drift.length) {
        notes.push(
          `lockstep-guards: ${baseName(env.self)} and ${baseName(env.other)} are no longer structurally identical ` +
            `(user rule: same sections, order and comments; only values differ):\n- ${drift.join('\n- ')}`,
        )
      }
    }

    const layer = classify(path)
    if (layer) {
      const before = await read($, lockstep)
      const touched: Layer[] = before.touched.includes(layer) ? before.touched : [...before.touched, layer]
      const isComplete = LAYERS.every(l => touched.includes(l))
      await update($, lockstep, () =>
        isComplete ? EMPTY : { touched, files: [...new Set([...before.files, baseName(path)])] },
      )
      if (!isComplete && before.touched.length === 0) {
        const missing = LAYERS.filter(l => !touched.includes(l)).join(' + ')
        notes.push(
          `lockstep-guards: ${layer} layer changed (${baseName(path)}). User rule: DB schema, types and Zod ` +
            `validation change together. Update ${missing} in this same change, or say why not.`,
        )
      }
    }

    return notes.length ? { ...ran, context: [...(ran.context ?? []), ...notes] } : ran
  }).catch(($, e, next) => next(e)) // advisory only: never block a tool on our failure

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, lockstep)
    const drift = await read($, envDrift)
    if (e.props.hasSurvey || (state.touched.length === 0 && drift === null)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const missing = LAYERS.filter(l => !state.touched.includes(l))

    return (
      <Box flexDirection="column">
        {state.touched.length > 0 && (
          <Box>
            <Text color="yellow">lockstep </Text>
            {LAYERS.map(l => (
              <Text color={state.touched.includes(l) ? 'green' : 'red'}>
                {state.touched.includes(l) ? '✓' : '✗'} {l}{'  '}
              </Text>
            ))}
            <Text dimColor>needs {missing.join(', ')} </Text>
            <Button key="lockstep-ok" label="Dismiss" onPress={() => update($, lockstep, () => EMPTY)} />
          </Box>
        )}
        {drift !== null && (
          <Box>
            <Text color="yellow">env drift </Text>
            <Text dimColor>
              {drift.dir}: {drift.problems.length} issue{drift.problems.length === 1 ? '' : 's'}, e.g.{' '}
              {drift.problems[0]}{' '}
            </Text>
            <Button key="env-ok" label="Dismiss" onPress={() => update($, envDrift, () => null)} />
          </Box>
        )}
      </Box>
    )
  })
}

type Fs = { fs: { read: (p: string) => Promise<string>; exists: (p: string) => Promise<boolean> } }

const checkEnv = async ($: Fs, self: string, other: string): Promise<string[]> => {
  if (!(await $.fs.exists(other))) {
    // A repo with only .env.example (no local .env yet) is fine.
    return baseName(other) === '.env' ? [] : [`${baseName(other)} does not exist beside ${baseName(self)}`]
  }
  const [a, b] = await Promise.all([$.fs.read(self), $.fs.read(other)])
  return envDiff(envShape(a), envShape(b), baseName(self), baseName(other))
}
