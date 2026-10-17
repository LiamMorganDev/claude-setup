// SessionStart hook: every mod folder in mods/ is loaded straight from disk in
// every session (CLAUDE_CODE_PLUGIN_DIRS, watched, so edits hot-reload everywhere) and
// listed in the marketplace for others. Mods from other marketplaces in ALWAYS_ON are
// installed at user scope and enabled. Silent when nothing changes.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, 'mods')
const MARKET = path.join(__dirname, '.claude-plugin', 'marketplace.json')
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')
const INSTALLED = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }

// per-machine opt-outs, e.g. { "skipMods": ["pb-light"] } (written by INSTALL.md, never committed)
const skip = readJson(path.join(os.homedir(), '.claude', 'claude-setup.local.json'), {}).skipMods ?? []
const all = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'))
  .map(d => ({ dir: d.name, manifest: readJson(path.join(ROOT, d.name, '.claude-plugin', 'plugin.json'), null) }))
  .filter(m => m.manifest?.name)
const mods = all.filter(m => !skip.includes(m.dir))
// a mod with its own .git is someone else's (e.g. filetree): loaded, but not listed in this marketplace
const own = all.filter(m => !fs.existsSync(path.join(ROOT, m.dir, '.git')))

// third-party mods kept on everywhere, like the local ones
const ALWAYS_ON = []
// plugin-dir mods are named <name>@inline; a project's enabledPlugins could still switch one off
const ids = [...mods.map(m => `${m.manifest.name}@inline`), ...ALWAYS_ON]
const localIds = mods.map(m => `${m.manifest.name}@claude-setup`)

// 1. marketplace lists exactly the mods on disk
const market = readJson(MARKET, { name: 'claude-setup', owner: { name: 'LiamMorganDev' }, plugins: [] })
const plugins = own.map(m => ({ name: m.manifest.name, source: `./mods/${m.dir}`, description: m.manifest.description ?? '' }))
if (JSON.stringify(market.plugins) !== JSON.stringify(plugins)) {
  fs.writeFileSync(MARKET, JSON.stringify({ ...market, plugins }, null, 2) + '\n')
}

// 2. install ALWAYS_ON mods; uninstall installed copies of local mods, which load from disk instead
const installed = readJson(INSTALLED, { plugins: {} }).plugins
const missing = ALWAYS_ON.filter(id => !installed[id])
const doubled = localIds.filter(id => installed[id])
if (missing.length || doubled.length) {
  const appDir = path.join(process.env.APPDATA ?? '', 'Claude', 'claude-code')
  const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true })
  // Desktop's bundled binary, else the native install, else whatever is on PATH (VS Code, terminal)
  let claude = 'claude'
  const local = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')
  if (fs.existsSync(local)) claude = local
  try {
    const ver = fs.readdirSync(appDir).sort(cmp).pop()
    const build = fs.readdirSync(path.join(appDir, ver))[0]
    const exe = path.join(appDir, ver, build, 'claude.exe')
    if (fs.existsSync(exe)) claude = exe
  } catch {}
  for (const id of missing) {
    try { execFileSync(claude, ['plugin', 'install', id, '--scope', 'user'], { stdio: 'ignore', timeout: 60000 }) } catch {}
  }
  for (const id of doubled) {
    try { execFileSync(claude, ['plugin', 'uninstall', id, '--scope', 'user'], { stdio: 'ignore', timeout: 60000 }) } catch {}
  }
}

// 3. ALWAYS_ON enabled, and every local mod folder named in the env block, file-watched
// (desktop and VS Code sessions need the WATCH flag; a terminal watches anyway)
const settings = readJson(SETTINGS, null)
if (settings) {
  const before = JSON.stringify(settings)
  const enabled = settings.enabledPlugins ?? {}
  for (const id of ALWAYS_ON) enabled[id] = true
  for (const id of Object.keys(enabled)) if (id.endsWith('@claude-setup') || id.endsWith('@local-mods') || id.endsWith('@inline')) delete enabled[id]
  const env = settings.env ?? {}
  // keep plugin dirs from outside this repo; ours are rewritten from disk
  const others = (env.CLAUDE_CODE_PLUGIN_DIRS ?? '').split(path.delimiter).filter(d => d && !path.resolve(d).startsWith(ROOT))
  env.CLAUDE_CODE_PLUGIN_DIRS = [...mods.map(m => path.join(ROOT, m.dir)), ...others].join(path.delimiter)
  env.CLAUDE_CODE_PLUGIN_DIR_WATCH = '1'
  const next = { ...settings, env, enabledPlugins: enabled }
  if (JSON.stringify(next) !== before) fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2) + '\n')
}

// 4. a project can't switch one off: settings.local.json outranks the project's
// settings.json, so any mod set false in either gets re-enabled there
let cwd
try { cwd = JSON.parse(fs.readFileSync(0, 'utf8')).cwd } catch {}
const projDir = cwd && path.join(cwd, '.claude')
if (projDir && path.resolve(projDir) !== path.resolve(os.homedir(), '.claude')) {
  const LOCAL = path.join(projDir, 'settings.local.json')
  const project = readJson(path.join(projDir, 'settings.json'), {}).enabledPlugins ?? {}
  const localSettings = readJson(LOCAL, {})
  const localEnabled = localSettings.enabledPlugins ?? {}
  const blocked = ids.filter(id => localEnabled[id] === false || (project[id] === false && localEnabled[id] !== true))
  if (blocked.length) {
    for (const id of blocked) localEnabled[id] = true
    fs.writeFileSync(LOCAL, JSON.stringify({ ...localSettings, enabledPlugins: localEnabled }, null, 2) + '\n')
  }
}

// 5. every global skill stays visible to Claude: drop disable-model-invocation, which
// third-party skill updates can bring back (it hides a skill and blocks skill-to-skill calls)
const SKILLS = path.join(os.homedir(), '.claude', 'skills')
for (const d of fs.existsSync(SKILLS) ? fs.readdirSync(SKILLS) : []) {
  const f = path.join(SKILLS, d, 'SKILL.md')
  let text
  try { text = fs.readFileSync(f, 'utf8') } catch { continue }
  const next = text.replace(/^disable-model-invocation:\s*true\s*\r?\n/m, '')
  if (next !== text) fs.writeFileSync(f, next)
}
