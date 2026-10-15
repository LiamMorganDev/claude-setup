/** the session's status: model, git branch and dirty count, pb-light's last check */
export type Info = { model: string; branch: string; dirty: number; pb: string }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { info: Info }
  }
}
