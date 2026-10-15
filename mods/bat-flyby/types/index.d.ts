/** frame of the bat's flight, -1 while none is in the air */
export type BatFrame = number

declare module 'claude-code' {
  interface PluginState {
    'bat-flyby': { frame: BatFrame }
  }
}
