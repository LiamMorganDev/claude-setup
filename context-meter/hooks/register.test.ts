import { test, expect } from 'claude-code/testing'
import { modelName, pbColor } from './register'

test('modelName shortens model ids; pbColor follows the light', () => {
  expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelName('Sonnet')).toBe('Sonnet')
  expect([pbColor('PB ● in sync'), pbColor('PB ▲ drift: 2 differ'), pbColor('PB ✗ unreachable')]).toEqual(['green', '#FF8C00', 'red'])
})


