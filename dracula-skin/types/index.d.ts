export type IsLight = boolean

declare module 'claude-code' {
  interface PluginState {
    'dracula-skin': { isLight: IsLight }
  }
}
