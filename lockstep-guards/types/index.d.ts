export type Layer = 'schema' | 'types' | 'zod'
export type Lockstep = { touched: Layer[]; files: string[] }

declare module 'claude-code' {
  interface PluginState {
    'lockstep-guards': { lockstep: Lockstep }
  }
}
