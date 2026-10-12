export type BannerShown = boolean
export type IsLight = boolean

declare module 'claude-code' {
  interface PluginState {
    'dracula-skin': { isBannerShown: BannerShown; isLight: IsLight }
  }
}
