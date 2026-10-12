export type Layer = 'schema' | 'types' | 'zod'
export type Lockstep = { touched: Layer[]; files: string[] }
export type EnvDrift = { dir: string; problems: string[] } | null

declare module 'claude-code' {
  interface PluginState {
    'lockstep-guards': { lockstep: Lockstep; envDrift: EnvDrift }
  }
}
