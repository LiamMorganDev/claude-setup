// Status line: [skin icon] model │ branch ●dirty │ context remaining
// Themed by the active claude-skins skin (~/.claude/skins/engine/current)
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Reads the `statusline:` section of the active skin's YAML; null when no skin is active
function loadSkin() {
  try {
    const skinsDir = path.join(os.homedir(), '.claude', 'skins')
    const name = fs.readFileSync(path.join(skinsDir, 'engine', 'current'), 'utf8').trim()
    if (!name || name === 'default') return null
    const lines = fs.readFileSync(path.join(skinsDir, `${name}.yaml`), 'utf8').split(/\r?\n/)
    const skin = {}
    let inSection = false
    for (const line of lines) {
      if (/^\S/.test(line)) inSection = line.startsWith('statusline:')
      else if (inSection) {
        const m = line.match(/^\s+(\w+):\s*"?([^"]*)"?/)
        if (m) skin[m[1]] = m[2]
      }
    }
    return skin
  } catch {
    return null
  }
}

const rgb = hex => {
  const h = (hex || '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return ''
  return `\x1b[38;2;${parseInt(h.slice(0, 2), 16)};${parseInt(h.slice(2, 4), 16)};${parseInt(h.slice(4, 6), 16)}m`
}
const R = '\x1b[0m'

let raw = ''
process.stdin.on('data', d => (raw += d))
process.stdin.on('end', () => {
  let input = {}
  try { input = JSON.parse(raw) } catch {}

  const skin = loadSkin()
  const accent = skin ? rgb(skin.accent) : ''
  const dim = skin ? rgb(skin.dim) : ''

  const parts = []
  if (input.model?.display_name) {
    const icon = skin?.icon ? `${accent}${skin.icon}${R} ` : ''
    parts.push(`${icon}${accent}${input.model.display_name}${accent && R}`)
  }

  const dir = input.workspace?.current_dir ?? input.cwd
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  if (dir) {
    try {
      const branch = git(['branch', '--show-current']).trim()
      if (branch) {
        const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean).length
        parts.push(dirty ? `${branch} \x1b[33m●${dirty}\x1b[0m` : branch)
      }
    } catch {}
    // pb-light mod's last live PocketBase vs pb_schema.json check for this repo
    try {
      const root = git(['rev-parse', '--show-toplevel']).trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      const pb = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'pb-light.json'), 'utf8'))[root]
      if (pb) parts.push(`\x1b[${pb.includes('●') ? 32 : pb.includes('▲') ? 33 : 31}m${pb.replace(/ · \/pb-drift$/, '')}\x1b[0m`)
    } catch {}
  }

  const remaining = input.context_window?.remaining_percentage
  if (remaining != null) {
    const pct = Math.round(remaining)
    const color = pct < 20 ? 31 : pct < 40 ? 33 : 32
    let bar = ''
    if (skin) {
      const filled = Math.round((100 - pct) / 10)
      bar = `${rgb(skin.bar_fill)}${'▓'.repeat(filled)}${rgb(skin.bar_empty)}${'░'.repeat(10 - filled)}${R} `
    }
    parts.push(`${bar}\x1b[${color}m${pct}% ctx\x1b[0m`)
  }

  process.stdout.write(parts.join(dim ? ` ${dim}│${R} ` : ' │ ') || 'Context: n/a')
})
