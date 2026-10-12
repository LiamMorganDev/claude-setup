// SessionStart hook: every mod folder in local-mods gets listed in the
// marketplace, installed at user scope and enabled. Mods from other marketplaces
// in ALWAYS_ON get the same treatment. Silent when nothing changes.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = __dirname
const MARKET = path.join(ROOT, '.claude-plugin', 'marketplace.json')
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')
const INSTALLED = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }

const mods = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'))
  .map(d => ({ dir: d.name, manifest: readJson(path.join(ROOT, d.name, '.claude-plugin', 'plugin.json'), null) }))
  .filter(m => m.manifest?.name)

// third-party mods kept on everywhere, like the local ones
const ALWAYS_ON = ['glanceflow@claude-mods']
const ids = [...mods.map(m => `${m.manifest.name}@local-mods`), ...ALWAYS_ON]

// 1. marketplace lists exactly the mods on disk
const market = readJson(MARKET, { name: 'local-mods', owner: { name: 'Liam' }, plugins: [] })
const plugins = mods.map(m => ({ name: m.manifest.name, source: `./${m.dir}`, description: m.manifest.description ?? '' }))
if (JSON.stringify(market.plugins) !== JSON.stringify(plugins)) {
  fs.writeFileSync(MARKET, JSON.stringify({ ...market, plugins }, null, 2) + '\n')
}

// 2. install any not yet installed (newest claude binary available)
const installed = readJson(INSTALLED, { plugins: {} }).plugins
const missing = ids.filter(id => !installed[id])
// a local mod whose plugin.json version moved on gets updated, so edits reach every session
const stale = mods
  .filter(m => installed[`${m.manifest.name}@local-mods`]?.[0]?.version !== undefined
    && installed[`${m.manifest.name}@local-mods`][0].version !== m.manifest.version)
  .map(m => `${m.manifest.name}@local-mods`)
if (missing.length || stale.length) {
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
  if (stale.length) {
    try { execFileSync(claude, ['plugin', 'marketplace', 'update', 'local-mods'], { stdio: 'ignore', timeout: 60000 }) } catch {}
    for (const id of stale) {
      try { execFileSync(claude, ['plugin', 'update', id, '--scope', 'user'], { stdio: 'ignore', timeout: 60000 }) } catch {}
    }
  }
}

// 3. every local mod enabled, always
const settings = readJson(SETTINGS, null)
if (settings) {
  const enabled = settings.enabledPlugins ?? {}
  const off = ids.filter(id => enabled[id] !== true)
  if (off.length) {
    for (const id of off) enabled[id] = true
    fs.writeFileSync(SETTINGS, JSON.stringify({ ...settings, enabledPlugins: enabled }, null, 2) + '\n')
  }
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
