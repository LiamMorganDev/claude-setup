// Commits and pushes any change in local-mods to the private GitHub repo
// (LiamMorganDev/claude-mods). Run by the Stop and SessionStart hooks in
// ~/.claude/settings.json, so edits by Claude or by hand both get pushed.
const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const DIR = __dirname
const git = (...args) => execFileSync('git', args, { cwd: DIR, encoding: 'utf8', windowsHide: true }).trim()

try {
  // a mod with its own .git is someone else's (e.g. filetree): keep it out
  const ignorePath = path.join(DIR, '.gitignore')
  const ignore = fs.readFileSync(ignorePath, 'utf8')
  const nested = fs.readdirSync(DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, '.git')))
    .map(d => `/${d.name}/`)
    .filter(line => !ignore.split(/\r?\n/).includes(line))
  if (nested.length) fs.writeFileSync(ignorePath, ignore.trimEnd() + '\n' + nested.join('\n') + '\n')

  const changed = git('status', '--porcelain')
  if (changed) {
    git('add', '-A')
    const files = git('diff', '--cached', '--name-only').split('\n').filter(Boolean)
    const mods = [...new Set(files.map(f => (f.includes('/') ? f.split('/')[0] : f)))]
    const subject = `Update ${mods.join(', ')}`
    const body = files.slice(0, 30).join('\n') + (files.length > 30 ? `\n…and ${files.length - 30} more` : '')
    git('commit', '-q', '-m', subject, '-m', body)
  }

  // push anything unpushed (also retries a push that failed last time), without blocking the hook
  if (git('rev-list', '--count', '@{u}..HEAD') !== '0') {
    spawn('git', ['push', '-q'], { cwd: DIR, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
} catch {}
