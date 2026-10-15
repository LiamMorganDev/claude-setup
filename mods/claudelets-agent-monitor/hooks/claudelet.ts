/**
 * Claude-lets: pixel Claudes drawn as SVG, one per agent row. The hat comes from the
 * agent's job (its subagent type), the prop in hand from the tool it is running now.
 * Animated with SMIL. Drawn as a plain image, not `isInteractive`: the interactive frame
 * reloads on every pane redraw, which made every sprite flash.
 */

/** `rest`: a subagent finished while the run goes on; `done`: the whole run finished, so it celebrates */
export type Pose = 'work' | 'think' | 'wait' | 'rest' | 'done' | 'error'

const CLAY = '#D97757'
const CLAY_DARK = '#B85F42'
const GREY = '#8F8783'
const GREY_DARK = '#6F6864'
const EYE = '#1D1B1F'

/** A rect, with child markup (an `<animate>`) when given. */
const px = (x: number, y: number, w: number, h: number, fill: string, child = ''): string =>
  child
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}">${child}</rect>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

const blink = (dur: string, values: string, begin: string): string =>
  `<animate attributeName="opacity" values="${values}" dur="${dur}" begin="${begin}" calcMode="discrete" repeatCount="indefinite"/>`

const bobble = (values: string, dur: string, begin: string, repeat = 'indefinite'): string =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}" begin="${begin}" calcMode="discrete" repeatCount="${repeat}"/>`

// Body sits at x 4..13, y 7..11; hats above it.
const HATS: Record<string, string> = {
  // crown
  main: px(5, 4, 8, 2, '#F2C14E') + px(5, 3, 1, 1, '#F2C14E') + px(8, 3, 2, 1, '#F2C14E') + px(12, 3, 1, 1, '#F2C14E') + px(8, 4, 2, 1, '#E04F5F'),
  // pith helmet
  Explore: px(6, 4, 6, 2, '#CDB57E') + px(7, 3, 4, 1, '#CDB57E') + px(4, 6, 10, 1, '#A8925E'),
  // drafting cap + pencil behind the ear
  Plan: px(5, 5, 8, 2, '#3E6FB0') + px(5, 4, 6, 1, '#3E6FB0') + px(12, 6, 3, 1, '#2C5288') + px(3, 5, 1, 2, '#F2C14E') + px(3, 4, 1, 1, '#E9A0A0'),
  // hard hat
  'general-purpose': px(5, 4, 8, 3, '#F4B83A') + px(4, 6, 10, 1, '#D99A1E') + px(8, 3, 2, 1, '#F4B83A'),
  // wizard hat
  'claude-code-guide': px(6, 5, 6, 2, '#6B4FA0') + px(7, 3, 4, 2, '#6B4FA0') + px(8, 1, 2, 2, '#6B4FA0') + px(4, 6, 10, 1, '#57408A') + px(8, 4, 1, 1, '#F2C14E'),
  // beret
  claude: px(5, 5, 8, 2, '#C0392B') + px(6, 4, 5, 1, '#C0392B') + px(11, 4, 1, 1, '#8E2A20'),
  // visor + headset
  'statusline-setup': px(5, 6, 8, 1, '#2BB3A3') + px(12, 6, 3, 1, '#1E8076') + px(4, 5, 1, 3, '#444') + px(13, 5, 1, 3, '#444'),
  // propeller beanie
  fork: px(5, 5, 8, 2, '#E04F5F') + px(7, 5, 2, 2, '#F2C14E') + px(11, 5, 1, 2, '#3E6FB0') + px(8, 4, 2, 1, '#888') + px(6, 3, 6, 1, '#3E6FB0'),
  // party hat
  teammate: px(7, 5, 4, 2, '#B594F5') + px(8, 3, 2, 2, '#B594F5') + px(8, 2, 2, 1, '#F2C14E'),
  // baseball cap, for any other agent type
  other: px(5, 5, 8, 2, '#4FA06B') + px(12, 6, 3, 1, '#3B7F53'),
}

type Prop = 'read' | 'edit' | 'bash' | 'grep' | 'web' | 'todo' | 'agent'

// Held at the right arm, x 14..19.
const PROPS: Record<Prop, (b: string) => string> = {
  read: () => px(14, 8, 5, 3, '#F3EEE6') + px(16, 8, 1, 3, '#C9BFB0') + px(14, 11, 5, 1, '#8B5A3C'),
  edit: () => px(15, 6, 1, 1, '#E9A0A0') + px(15, 7, 1, 3, '#F2C14E') + px(15, 10, 1, 1, '#E8D2A6') + px(15, 11, 1, 1, EYE),
  bash: b => px(14, 7, 6, 4, '#2A2730') + px(14, 11, 6, 1, '#5B5664') + px(15, 8, 1, 1, '#7BD88F') + px(16, 9, 2, 1, '#7BD88F', blink('0.8s', '1;0', b)),
  grep: () => px(14, 7, 3, 1, '#9AD1E8') + px(14, 8, 1, 2, '#9AD1E8') + px(16, 8, 1, 2, '#9AD1E8') + px(14, 10, 3, 1, '#9AD1E8') + px(15, 8, 1, 2, '#CFEAF5') + px(17, 11, 1, 1, '#8B5A3C') + px(18, 12, 1, 1, '#8B5A3C'),
  web: () => px(15, 7, 3, 1, '#4F9BD8') + px(14, 8, 5, 3, '#4F9BD8') + px(15, 11, 3, 1, '#4F9BD8') + px(15, 8, 2, 1, '#6CC17A') + px(16, 10, 2, 1, '#6CC17A'),
  todo: () => px(14, 7, 5, 5, '#C99A6B') + px(15, 6, 3, 1, '#9AA0A6') + px(15, 8, 3, 1, '#F3EEE6') + px(15, 10, 3, 1, '#F3EEE6'),
  agent: b => px(14, 8, 1, 2, '#E04F5F') + px(15, 7, 1, 4, '#E04F5F') + px(16, 6, 2, 6, '#F3EEE6') + px(18, 7, 1, 1, '#F2C14E', blink('0.6s', '1;0', b)) + px(18, 10, 1, 1, '#F2C14E', blink('0.6s', '0;1', b)),
}

const TOOL_PROPS: Record<string, Prop> = {
  Read: 'read', NotebookRead: 'read',
  Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Bash: 'bash', PowerShell: 'bash', BashOutput: 'bash',
  Grep: 'grep', Glob: 'grep', LSP: 'grep', ToolSearch: 'grep',
  WebSearch: 'web', WebFetch: 'web',
  TodoWrite: 'todo', TaskCreate: 'todo', TaskUpdate: 'todo',
  Agent: 'agent', Task: 'agent', SendMessage: 'agent',
}

/** What a role holds when its current tool has no prop of its own. */
/** A plugin's agent (`plugin:agent`): a beanie in a colour picked from the plugin's name, so each plugin keeps one. */
const BEANIES = ['#4FA06B', '#3E6FB0', '#C0392B', '#E08A2B', '#2BB3A3', '#8E5BC8', '#C94F8A']
const beanie = (plugin: string): string => {
  let n = 0
  for (const ch of plugin) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  const c = BEANIES[n % BEANIES.length]!

  return px(5, 5, 8, 2, c) + px(6, 4, 6, 1, c) + px(8, 3, 2, 1, '#F3EEE6')
}

export const hatFor = (role: string): string =>
  HATS[role] ?? (role.includes(':') ? beanie(role.split(':')[0]!) : HATS.other!)

const ROLE_PROPS: Record<string, Prop> = {
  main: 'todo', Explore: 'grep', Plan: 'edit', 'general-purpose': 'bash', 'claude-code-guide': 'read',
}

export const propFor = (role: string, tool: string | undefined): Prop | undefined => {
  if (tool) {
    if (TOOL_PROPS[tool]) return TOOL_PROPS[tool]
    if (tool.startsWith('mcp__') && /browser|chrome|fetch|web/i.test(tool)) return 'web'
  }

  return ROLE_PROPS[role]
}

export type ClaudeletArgs = { role: string; pose: Pose; tool?: string; phase?: number }

/** The SVG document of one claude-let, 20×15 pixels, scaled by the element drawing it. */
export function claudeletSvg({ role, pose, tool, phase = 0 }: ClaudeletArgs): string {
  const hat = hatFor(role)
  const body = pose === 'error' ? GREY : CLAY
  const shade = pose === 'error' ? GREY_DARK : CLAY_DARK
  const b = `${(phase % 8) * 0.13}s`
  const legsDown = px(5, 12, 1, 2, shade) + px(7, 12, 1, 2, shade) + px(10, 12, 1, 2, shade) + px(12, 12, 1, 2, shade)

  let eyes = ''
  let extra = ''
  let bob = ''
  let legs = legsDown
  let prop = ''

  if (pose === 'error') {
    // dazed: closed eyes, sweat drop, bandage, smoke
    eyes = px(5, 9, 2, 1, EYE) + px(11, 9, 2, 1, EYE) + px(13, 7, 1, 2, '#9AD1E8', blink('1.2s', '1;1;0', b))
    extra = px(5, 6, 5, 1, '#F3EEE6') + px(8, 5, 1, 3, '#F3EEE6')
      + px(15, 3, 1, 1, '#BBBBBB', blink('1.2s', '0;1;1;0', b)) + px(16, 2, 1, 1, '#999999', blink('1.2s', '0;0;1;1', b))
  } else if (pose === 'done') {
    // happy squint, three hops, sparkles
    eyes = px(6, 9, 2, 1, EYE) + px(10, 9, 2, 1, EYE)
    extra = px(2, 3, 1, 1, '#F2C14E', blink('0.8s', '1;0', b)) + px(16, 2, 1, 1, '#F2C14E', blink('0.8s', '0;1', b))
      + px(15, 5, 1, 1, '#7BD88F', blink('0.8s', '1;0', b)) + px(1, 6, 1, 1, '#7BD88F', blink('0.8s', '0;1', b))
    bob = bobble('0 0;0 -1;0 0;0 0', '0.8s', '0s', '3')
  } else if (pose === 'rest') {
    // content squint, standing still
    eyes = px(6, 9, 2, 1, EYE) + px(10, 9, 2, 1, EYE)
  } else {
    // open eyes that blink every few seconds
    const open = '1;1;1;1;1;1;1;0'
    const shut = '0;0;0;0;0;0;0;1'
    eyes = `<g>${px(6, 8, 1, 2, EYE) + px(11, 8, 1, 2, EYE)}${blink('3s', open, b)}</g>`
      + `<g opacity="0">${px(6, 9, 1, 1, EYE) + px(11, 9, 1, 1, EYE)}${blink('3s', shut, b)}</g>`
  }

  const arms = pose === 'done'
    ? px(3, 5, 1, 3, body) + px(14, 5, 1, 3, body)
    : pose === 'wait'
      // right hand raised
      ? px(2, 9, 2, 1, body) + px(14, 4, 1, 4, body) + px(14, 3, 2, 1, body)
      : px(2, 9, 2, 1, body) + px(14, 9, 2, 1, body)

  if (pose === 'work') {
    const legsUp = px(5, 12, 1, 1, shade) + px(7, 12, 1, 2, shade) + px(10, 12, 1, 1, shade) + px(12, 12, 1, 2, shade)
    legs = `<g>${legsDown}${blink('0.5s', '1;0', b)}</g><g>${legsUp}${blink('0.5s', '0;1', b)}</g>`
    bob = bobble('0 0;0 -0.5', '0.5s', b)
    const p = propFor(role, tool)
    if (p) prop = PROPS[p](b)
  } else if (pose === 'wait') {
    // a "!" bubble over the raised hand, pulsing
    prop = px(16, 0, 3, 5, '#F2C14E', blink('1s', '1;0.4', b)) + px(17, 1, 1, 2, EYE) + px(17, 4, 1, 1, EYE)
  } else if (pose === 'think') {
    prop = px(14, 6, 1, 1, '#E8E4EC') + px(15, 4, 2, 1, '#E8E4EC') + px(15, 0, 5, 3, '#E8E4EC')
      + px(16, 1, 1, 1, EYE, blink('1.2s', '1;0;0', b)) + px(17, 1, 1, 1, EYE, blink('1.2s', '0;1;0', b)) + px(18, 1, 1, 1, EYE, blink('1.2s', '0;0;1', b))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 15" shape-rendering="crispEdges">`
    + `<g>${bob}${px(4, 7, 10, 5, body)}${px(4, 11, 10, 1, shade)}${arms}${eyes}${legs}${hat}${extra}</g>${prop}</svg>`
}

/** Words for a reader that cannot see the drawing. */
export const claudeletAlt = ({ role, pose, tool }: ClaudeletArgs): string =>
  pose === 'work' ? `${role} Claude working${tool ? ` with ${tool}` : ''}`
    : pose === 'think' ? `${role} Claude thinking`
    : pose === 'wait' ? `${role} Claude waiting on you`
    : pose === 'rest' ? `${role} Claude finished`
    : pose === 'done' ? `${role} Claude done`
    : `${role} Claude stopped on an error`
