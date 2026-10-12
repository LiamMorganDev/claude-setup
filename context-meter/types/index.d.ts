export type Tokens = number | null

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { tokens: Tokens }
  }
}
