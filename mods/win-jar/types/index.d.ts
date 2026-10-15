export type Win = { t: number; text: string; project: string }

declare module 'claude-code' {
  interface PluginState {
    'win-jar': { wins: Win[] }
  }
}
