// node mirror.test.js — runs mirror.js against a throwaway home + repo copy
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'))
const home = path.join(tmp, 'home'), cs = path.join(tmp, 'cs'), claude = path.join(home, '.claude')
for (const d of [path.join(cs, 'mods'), path.join(cs, 'global'), path.join(claude, 'skills', 'grill-me'), path.join(claude, 'scripts')]) fs.mkdirSync(d, { recursive: true })
fs.copyFileSync(path.join(__dirname, 'mirror.js'), path.join(cs, 'mirror.js'))
const env = { ...process.env, USERPROFILE: home, HOME: home }
const run = (...a) => execFileSync(process.execPath, [path.join(cs, 'mirror.js'), ...a], { env, encoding: 'utf8' })
const w = (p, s) => fs.writeFileSync(p, s)
const r = p => fs.readFileSync(p, 'utf8')

// 1. first sync, repo empty: live is captured, home path → {{HOME}}, plugin dirs dropped
w(path.join(claude, 'CLAUDE.md'), 'rules v1\n')
w(path.join(claude, 'scripts', 'x.ps1'), 'x\n')
w(path.join(claude, 'skills', 'grill-me', 'SKILL.md'), 's')
w(path.join(claude, 'settings.json'), JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: 'mine', A: '1' }, statusLine: { command: `node ${home.replace(/\\/g, '/')}/.claude/s.js` } }))
run()
assert.strictEqual(r(path.join(cs, 'global', 'CLAUDE.md')), 'rules v1\n')
assert.strictEqual(r(path.join(cs, 'global', 'scripts', 'x.ps1')), 'x\n')
const repoSettings = JSON.parse(r(path.join(cs, 'global', 'settings.json')))
assert.strictEqual(repoSettings.statusLine.command, 'node {{HOME}}/.claude/s.js')
assert.strictEqual(repoSettings.env.CLAUDE_CODE_PLUGIN_DIRS, undefined)
assert.deepStrictEqual(JSON.parse(r(path.join(cs, 'global', 'skills.json'))), { 'grill-me': null })

// 2. in sync: nothing printed
assert.strictEqual(run(), '')

// 3. live edit → repo
w(path.join(claude, 'CLAUDE.md'), 'rules v2\n')
run()
assert.strictEqual(r(path.join(cs, 'global', 'CLAUDE.md')), 'rules v2\n')

// 4. repo edit (a pull) → live, keeping this machine's plugin dirs
w(path.join(cs, 'global', 'CLAUDE.md'), 'rules v3\n')
w(path.join(cs, 'global', 'settings.json'), JSON.stringify({ ...repoSettings, env: { A: '2' } }))
run()
assert.strictEqual(r(path.join(claude, 'CLAUDE.md')), 'rules v3\n')
const live = JSON.parse(r(path.join(claude, 'settings.json')))
assert.strictEqual(live.env.A, '2')
assert.strictEqual(live.env.CLAUDE_CODE_PLUGIN_DIRS, 'mine')
assert.strictEqual(live.statusLine.command, `node ${home.replace(/\\/g, '/')}/.claude/s.js`)

// 5. both changed → this machine wins
w(path.join(claude, 'CLAUDE.md'), 'live v4\n')
w(path.join(cs, 'global', 'CLAUDE.md'), 'repo v4\n')
run()
assert.strictEqual(r(path.join(cs, 'global', 'CLAUDE.md')), 'live v4\n')

// 6. skill added on another device: reported, not dropped from the list on later runs
w(path.join(cs, 'global', 'skills.json'), JSON.stringify({ 'grill-me': null, tdd: 'mattpocock/skills' }, null, 2) + '\n')
assert.match(run(), /tdd \(mattpocock\/skills\)/)
run()
assert.ok('tdd' in JSON.parse(r(path.join(cs, 'global', 'skills.json'))))

// 7. --prefer-repo: a live-only change is overwritten by the repo
w(path.join(claude, 'CLAUDE.md'), 'stray edit\n')
run('--prefer-repo')
assert.strictEqual(r(path.join(claude, 'CLAUDE.md')), 'live v4\n')

// 8. broken live settings: skipped, repo untouched
const before = r(path.join(cs, 'global', 'settings.json'))
w(path.join(claude, 'settings.json'), '{ broken')
run()
assert.strictEqual(r(path.join(cs, 'global', 'settings.json')), before)

fs.rmSync(tmp, { recursive: true, force: true })
console.log('mirror tests passed')
