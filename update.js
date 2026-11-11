// Update an installed claude-setup: pull the latest repo, then tidy what the pull
// left behind on this machine (deleted mods, dead links, hooks, status line), then mirror.js.
//   node ~/.claude/claude-setup/update.js
// Never touches anything that isn't from this repo. Settings are backed up before any edit.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const CS = __dirname
const CLAUDE = path.join(os.homedir(), '.claude')
const SETTINGS = path.join(CLAUDE, 'settings.json')
const git = (...args) => execFileSync('git', ['-C', CS, ...args], { encoding: 'utf8' }).trim()
const inRepo = p => path.resolve(p).toLowerCase().startsWith(path.resolve(CS).toLowerCase() + path.sep)
const isLink = p => { try { return fs.lstatSync(p).isSymbolicLink() } catch { return false } }
const done = []

// 1. pull (fast-forward only: local edits are never merged or thrown away)
const before = git('rev-parse', 'HEAD')
try {
  execFileSync('git', ['-C', CS, 'pull', '--ff-only'], { stdio: 'inherit' })
} catch {
  console.error('\ngit pull failed (local changes or diverged history). Nothing else was changed.')
  process.exit(1)
}
const after = git('rev-parse', 'HEAD')

// 2. leftover mod folders: git removes tracked files, but untracked ones (caches, node_modules) keep the folder
const MODS = path.join(CS, 'mods')
for (const d of fs.readdirSync(MODS, { withFileTypes: true })) {
  const dir = path.join(MODS, d.name)
  if (!d.isDirectory() || d.name.startsWith('.') || fs.existsSync(path.join(dir, '.git'))) continue
  if (fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json')) || git('ls-files', '--', `mods/${d.name}`)) continue
  fs.rmSync(dir, { recursive: true, force: true })
  done.push(`removed leftover mod folder mods/${d.name}`)
}

// 3. links into the repo whose target is gone (skills/commands linked at install)
for (const parent of ['skills', 'commands']) {
  const base = path.join(CLAUDE, parent)
  const entries = isLink(base) ? [] : (() => { try { return fs.readdirSync(base) } catch { return [] } })()
  for (const name of entries) {
    const p = path.join(base, name)
    if (!isLink(p)) continue
    let target
    try { target = path.resolve(base, fs.readlinkSync(p)) } catch { continue }
    if (!inRepo(target) || fs.existsSync(target)) continue
    // a directory junction/symlink on Windows needs rmdir; unlink never follows the link
    try { fs.unlinkSync(p) } catch { fs.rmdirSync(p) }
    done.push(`removed dead link ~/.claude/${parent}/${name}`)
  }
}

// 4. CLAUDE.md, settings, scripts, skill/mod lists: repo → this machine where the pull changed them
let mirrored = []
try { mirrored = require('./mirror').sync() } catch (e) { done.push(`mirror.js failed: ${e.message}`) }

// 5. settings: drop hooks / status line that run a claude-setup file that no longer exists
const deadFile = cmd => {
  const m = typeof cmd === 'string' && cmd.match(/[^\s"']*claude-setup[\\/][^\s"']+/)
  if (!m) return false
  const p = m[0].replace(/^~/, os.homedir())
  return inRepo(p) && !fs.existsSync(p)
}
let settings = null
try { settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) } catch {}
if (settings) {
  const text = JSON.stringify(settings)
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    for (const g of groups) g.hooks = (g.hooks ?? []).filter(h => !(deadFile(h.command) && done.push(`removed ${event} hook: ${h.command}`)))
    settings.hooks[event] = groups.filter(g => g.hooks.length)
    if (!settings.hooks[event].length) delete settings.hooks[event]
  }
  if (deadFile(settings.statusLine?.command)) { done.push(`removed status line: ${settings.statusLine.command}`); delete settings.statusLine }
  if (JSON.stringify(settings) !== text) {
    const backup = `${SETTINGS}.bak-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
    fs.copyFileSync(SETTINGS, backup)
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n')
    done.push(`settings.json backed up to ${backup}`)
  }
}

// 6. mods: rewrite the plugin-dir list from what's on disk now
try {
  execFileSync(process.execPath, [path.join(CS, 'sync.js')], { input: '', stdio: ['pipe', 'inherit', 'inherit'] })
} catch { done.push('sync.js failed: run `node ~/.claude/claude-setup/sync.js` and check the error') }

// 7. report
const log = before === after ? [] : git('log', '--format=  %s', `${before}..${after}`).split('\n')
console.log(before === after ? '\nAlready up to date.' : `\nPulled ${log.length} commit(s):\n${log.join('\n')}`)
if (done.length) console.log(`\nCleaned up:\n${done.map(d => `  ${d}`).join('\n')}`)
if (mirrored.length) console.log(`\nMirrored:\n${mirrored.map(d => `  ${d}`).join('\n')}`)
console.log('\nThird-party plugins/skills/skins update separately: see INSTALL.md → Update.')
console.log('Start a new session to load the changes.')
