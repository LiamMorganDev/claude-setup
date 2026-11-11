// Two-way mirror between this machine's ~/.claude and the repo, so the repo always matches
// what I use and every device picks up changes made on the others. Run by autopush.js
// (after it pulls) and update.js. Per item: whichever side changed since the last sync wins;
// both changed → this machine wins; first sync on a machine → the repo wins. `--prefer-repo`:
// the repo wins wherever they differ. Old live files are backed up. Silent when in sync.
//   node ~/.claude/claude-setup/mirror.js [--prefer-repo]
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const CS = __dirname
const CLAUDE = path.join(os.homedir(), '.claude')
const STATE = path.join(CLAUDE, 'claude-setup.sync-state.json')
const HOME = os.homedir()
const HOME_FWD = HOME.replace(/\\/g, '/')
const read = p => { try { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') } catch { return null } }
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s) }
const hash = s => s == null ? null : crypto.createHash('sha1').update(s).digest('hex')
const isLink = p => { try { return fs.lstatSync(p).isSymbolicLink() } catch { return false } }
const backup = p => {
  if (!fs.existsSync(p)) return
  const dir = path.join(CLAUDE, 'backups', 'claude-setup-mirror')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(p, path.join(dir, `${path.basename(p)}.${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`))
}

// settings.json: the home path becomes {{HOME}}; the mod list is per machine (sync.js writes it)
const mapStrings = (v, f) => typeof v === 'string' ? f(v) : Array.isArray(v) ? v.map(x => mapStrings(x, f))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f)])) : v
const settingsToRepo = text => {
  const s = JSON.parse(text)
  if (s.env) delete s.env.CLAUDE_CODE_PLUGIN_DIRS
  return JSON.stringify(mapStrings(s, x => x.split(HOME).join('{{HOME}}').split(HOME_FWD).join('{{HOME}}')), null, 2) + '\n'
}
const settingsToLive = (text, liveText) => {
  const s = mapStrings(JSON.parse(text), x => x.replace(/\{\{HOME\}\}(?=\/)/g, HOME_FWD).split('{{HOME}}').join(HOME))
  const dirs = readJsonText(liveText)?.env?.CLAUDE_CODE_PLUGIN_DIRS
  if (dirs) s.env = { ...s.env, CLAUDE_CODE_PLUGIN_DIRS: dirs }
  return JSON.stringify(s, null, 2) + '\n'
}
const readJsonText = t => { try { return JSON.parse(t) } catch { return null } }

// third-party skills in ~/.claude/skills (not my linked ones, not the patched /skin) → { name: source }
const SKILLS = path.join(CLAUDE, 'skills')
const skillList = repoText => {
  const known = readJsonText(repoText) ?? {}
  const lock = readJson(path.join(os.homedir(), '.agents', '.skill-lock.json'), {}).skills ?? {}
  const names = (fs.existsSync(SKILLS) ? fs.readdirSync(SKILLS) : [])
    .filter(n => !n.startsWith('.') && n !== 'skin' && n !== 'synced' && !isLink(path.join(SKILLS, n)) && fs.existsSync(path.join(SKILLS, n, 'SKILL.md')))
    .sort()
  return JSON.stringify(Object.fromEntries(names.map(n => [n, lock[n]?.source ?? known[n] ?? null])), null, 2) + '\n'
}
// third-party mods (own .git) in mods/ → { name: clone url }
const MODS = path.join(CS, 'mods')
const modList = () => {
  const out = {}
  for (const d of fs.readdirSync(MODS, { withFileTypes: true })) {
    if (!d.isDirectory() || !fs.existsSync(path.join(MODS, d.name, '.git'))) continue
    try { out[d.name] = execFileSync('git', ['-C', path.join(MODS, d.name), 'remote', 'get-url', 'origin'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
  }
  return JSON.stringify(out, null, 2) + '\n'
}

function items() {
  const files = [
    ['global/CLAUDE.md', 'CLAUDE.md'],
    ['skins/windows/SKILL.md', 'skills/skin/SKILL.md'],
  ]
  // shortcut: a script deleted on one side is copied back from the other, delete it on both by hand
  const scripts = new Set([...readdir(path.join(CLAUDE, 'scripts')), ...readdir(path.join(CS, 'global', 'scripts'))])
  for (const s of scripts) files.push([`global/scripts/${s}`, `scripts/${s}`])
  const list = files.map(([repo, live]) => ({
    key: repo,
    repo: path.join(CS, repo),
    live: () => read(path.join(CLAUDE, live)),
    toRepo: t => t,
    apply: t => { const p = path.join(CLAUDE, live); backup(p); write(p, t) },
  }))
  const settingsPath = path.join(CLAUDE, 'settings.json')
  list.push({
    key: 'global/settings.json',
    repo: path.join(CS, 'global', 'settings.json'),
    live: () => {
      const t = read(settingsPath)
      if (t && !readJsonText(t)) throw new Error('settings.json is not valid JSON, skipped')
      return t && settingsToRepo(t)
    },
    toRepo: t => t,
    apply: t => { const live = read(settingsPath); backup(settingsPath); write(settingsPath, settingsToLive(t, live)) },
  })
  list.push({
    key: 'global/skills.json',
    repo: path.join(CS, 'global', 'skills.json'),
    live: () => skillList(read(path.join(CS, 'global', 'skills.json'))),
    toRepo: t => t,
    apply: t => {
      const want = readJsonText(t) ?? {}
      const have = readJsonText(skillList(t)) ?? {}
      const missing = Object.keys(want).filter(n => !(n in have))
      if (missing.length) say(`Skills used on another device are missing here — install them into ~/.claude/skills: ${missing.map(n => `${n} (${want[n] ?? 'source unknown'})`).join(', ')}`)
    },
  })
  list.push({
    key: 'global/mods.json',
    repo: path.join(CS, 'global', 'mods.json'),
    live: modList,
    toRepo: t => t,
    apply: t => {
      for (const [name, url] of Object.entries(readJsonText(t) ?? {})) {
        if (fs.existsSync(path.join(MODS, name))) continue
        try { execFileSync('git', ['clone', '-q', '--depth', '1', url, path.join(MODS, name)], { stdio: 'ignore', windowsHide: true, timeout: 60000 }); say(`cloned mod ${name} (loads next session)`) }
        catch { say(`could not clone mod ${name} from ${url}`) }
      }
    },
  })
  return list
}
const readdir = d => { try { return fs.readdirSync(d).filter(n => fs.statSync(path.join(d, n)).isFile()) } catch { return [] } }
const said = []
const say = m => said.push(m)

function sync({ preferRepo = false } = {}) {
  const state = readJson(STATE, {})
  for (const it of items()) {
    let live, repo
    try { live = it.live(); repo = read(it.repo) } catch (e) { say(`${it.key}: ${e.message}`); continue }
    const prev = state[it.key]
    const liveChanged = hash(live) !== prev?.live
    const repoChanged = hash(repo) !== prev?.repo
    let toLive = false
    if (live === repo || (!liveChanged && !repoChanged)) { /* in sync */ }
    else if (repo == null || (!preferRepo && live != null && liveChanged && (!repoChanged || prev))) {
      write(it.repo, it.toRepo(live)); say(`${it.key} ← this machine`)
    } else if (repo != null) { toLive = true }
    if (toLive) {
      try { it.apply(repo); say(`${it.key} → this machine`) } catch (e) { say(`${it.key}: apply failed: ${e.message}`) }
    }
    state[it.key] = { live: hash(it.live()), repo: hash(read(it.repo)) }
  }
  write(STATE, JSON.stringify(state, null, 2) + '\n')
  return said
}

module.exports = { sync, settingsToRepo, settingsToLive }
if (require.main === module) {
  const out = sync({ preferRepo: process.argv.includes('--prefer-repo') })
  if (out.length) console.log(`claude-setup mirror:\n${out.map(l => `  ${l}`).join('\n')}`)
}
