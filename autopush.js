// Keeps this repo (LiamMorganDev/claude-setup) and this machine's setup in step.
// Run by the Stop and SessionStart hooks in ~/.claude/settings.json: on SessionStart it pulls
// what my other devices pushed; every run mirror.js syncs CLAUDE.md, settings, scripts and
// skill/mod lists both ways; then any change is committed and pushed.
// Only runs where ~/.claude/.claude-setup-autopush exists (my own devices).
const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = __dirname
const MODS = path.join(DIR, 'mods')
// public repo: commit as the GitHub noreply address, never the real email
const EMAIL = '23473849+LiamMorganDev@users.noreply.github.com'
if (!fs.existsSync(path.join(os.homedir(), '.claude', '.claude-setup-autopush'))) process.exit(0)
const git = (...args) => execFileSync('git', args, { cwd: DIR, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim()

let event
try { event = JSON.parse(fs.readFileSync(0, 'utf8')).hook_event_name } catch {}
if (event === 'SessionStart') {
  try { execFileSync('git', ['pull', '--rebase', '--autostash', '-q'], { cwd: DIR, stdio: 'ignore', windowsHide: true, timeout: 20000 }) }
  catch { try { git('rebase', '--abort') } catch {} }
}
try {
  const out = require('./mirror').sync()
  // SessionStart output reaches Claude, e.g. skills to install that another device added
  if (out.length) console.log(`claude-setup mirror:\n${out.map(l => `  ${l}`).join('\n')}`)
} catch {}

try {
  // a mod with its own .git is someone else's (e.g. filetree): keep it out
  const ignorePath = path.join(DIR, '.gitignore')
  const ignore = fs.readFileSync(ignorePath, 'utf8')
  const nested = fs.readdirSync(MODS, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(MODS, d.name, '.git')))
    .map(d => `/mods/${d.name}/`)
    .filter(line => !ignore.split(/\r?\n/).includes(line))
  if (nested.length) fs.writeFileSync(ignorePath, ignore.trimEnd() + '\n' + nested.join('\n') + '\n')

  const changed = git('status', '--porcelain')
  if (changed) {
    git('add', '-A')
    const files = git('diff', '--cached', '--name-only').split('\n').filter(Boolean)
    // name the mod (mods/<mod>/…) or top-level folder/file each change belongs to
    const parts = [...new Set(files.map(f => { const p = f.split('/'); return p[0] === 'mods' && p.length > 2 ? p[1] : p[0] }))]
    const subject = `Update ${parts.join(', ')}`
    const body = files.slice(0, 30).join('\n') + (files.length > 30 ? `\n…and ${files.length - 30} more` : '')
    git('-c', `user.email=${EMAIL}`, '-c', 'user.name=LiamMorganDev', 'commit', '-q', '-m', subject, '-m', body)
  }

  // push anything unpushed (also retries a push that failed last time), without blocking the hook.
  // Rebase on origin first: a commit made elsewhere would otherwise reject every push forever.
  if (git('rev-list', '--count', '@{u}..HEAD') !== '0') {
    const script = `const { execFileSync: x } = require('child_process'); const o = { cwd: ${JSON.stringify(DIR)}, stdio: 'ignore', windowsHide: true }
try { x('git', ['pull', '--rebase', '-q'], o) } catch { try { x('git', ['rebase', '--abort'], o) } catch {} ; process.exit(0) }
x('git', ['push', '-q'], o)`
    spawn(process.execPath, ['-e', script], { cwd: DIR, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
} catch {}
