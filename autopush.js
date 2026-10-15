// Commits and pushes any change in this repo to GitHub (LiamMorganDev/claude-setup).
// Run by the Stop and SessionStart hooks in ~/.claude/settings.json, so edits by Claude
// or by hand both get pushed. Owner-only: does nothing unless ~/.claude/.claude-setup-autopush
// exists (INSTALL.md never creates it, so installs never auto-commit or push).
const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DIR = __dirname
const MODS = path.join(DIR, 'mods')
if (!fs.existsSync(path.join(os.homedir(), '.claude', '.claude-setup-autopush'))) process.exit(0)
const git = (...args) => execFileSync('git', args, { cwd: DIR, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim()

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
    git('commit', '-q', '-m', subject, '-m', body)
  }

  // push anything unpushed (also retries a push that failed last time), without blocking the hook
  if (git('rev-list', '--count', '@{u}..HEAD') !== '0') {
    spawn('git', ['push', '-q'], { cwd: DIR, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
} catch {}
