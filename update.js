// Update an installed claude-setup: pull the latest repo, then tidy what the pull
// left behind on this machine (deleted mods, skills, commands, hooks, status line).
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
const lf = s => s.replace(/\r\n/g, '\n')
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
const changed = before === after ? [] : git('diff', '--name-status', before, after).split('\n').filter(Boolean).map(l => l.split('\t'))
// untrimmed, so it compares equal to an untouched copy
const show = (rev, file) => { try { return lf(execFileSync('git', ['-C', CS, 'show', `${rev}:${file}`], { encoding: 'utf8' })) } catch { return null } }

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

// 4. commands copied in (Windows installs copy rather than link): follow the repo
// only where the copy is still the untouched old version; new commands are copied in
const CMDS = path.join(CLAUDE, 'commands')
if (fs.existsSync(CMDS) && !isLink(CMDS)) {
  for (const [status, file, renamed] of changed) {
    const rel = renamed ?? file
    if (!/^commands\/[^/]+\.md$/.test(file) && !/^commands\/[^/]+\.md$/.test(rel)) continue
    const dest = path.join(CMDS, path.basename(file))
    if (isLink(dest)) continue
    const mine = fs.existsSync(dest) ? lf(fs.readFileSync(dest, 'utf8')) : null
    const old = show(before, file)
    if (status === 'A') {
      if (mine === null) { fs.copyFileSync(path.join(CS, file), dest); done.push(`added command /${path.basename(file, '.md')}`) }
    } else if (mine === null) {
      continue
    } else if (mine !== old) {
      done.push(`kept your edited ~/.claude/commands/${path.basename(file)} (repo version changed: check by hand)`)
    } else if (status === 'D' || status.startsWith('R')) {
      fs.unlinkSync(dest)
      done.push(`removed command /${path.basename(file, '.md')}`)
      if (status.startsWith('R')) fs.copyFileSync(path.join(CS, rel), path.join(CMDS, path.basename(rel)))
    } else {
      fs.copyFileSync(path.join(CS, file), dest)
      done.push(`updated command /${path.basename(file, '.md')}`)
    }
  }
}

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
const merge = changed.map(c => c.at(-1)).filter(f => f.startsWith('global/'))
if (merge.length) console.log(`\nChanged, not applied (you merged these at install): ${merge.join(', ')}\n  Ask Claude: "re-merge the claude-setup global/ changes since ${before.slice(0, 7)}"`)
console.log('\nThird-party plugins/skills/skins update separately: see INSTALL.md → Update.')
console.log('Start a new session to load the changes.')
