// node hooks/agent-hooks.test.js — checks the agent-team hooks (no test framework needed)
const assert = require('assert')
const { execFileSync } = require('child_process')
const path = require('path')
const { isLesson } = require('./agent-learning-capture')
const { missing } = require('./agent-handback-gate')

for (const p of ["no, use the existing helper", "don't add a new dependency", "use cards instead of a table", "I prefer fewer options", "remember: light mode only", "from now on run lint first"]) {
  assert.ok(isLesson(p), p)
}
for (const p of ['build the basket page', 'yes', '/commit', 'what does this function do?']) {
  assert.ok(!isLesson(p), p)
}

assert.deepStrictEqual(missing('qa-tester', 'VERDICT: PASS\nLEARNINGS: none'), [])
assert.deepStrictEqual(missing('frontend-engineer', 'DONE: x\nLEARNINGS: none'), ['GATE:'])
assert.deepStrictEqual(missing('Explore', 'anything'), [])

const run = (file, input) => execFileSync('node', [path.join(__dirname, file)], { input: JSON.stringify(input) }).toString()
assert.ok(JSON.parse(run('agent-handback-gate.js', { agent_type: 'researcher', last_assistant_message: 'found it' })).decision === 'block')
assert.strictEqual(run('agent-handback-gate.js', { agent_type: 'researcher', last_assistant_message: 'found it', stop_hook_active: true }), '')
assert.ok(run('agent-learning-capture.js', { prompt: 'no, do it the other way' }).includes('additionalContext'))
assert.strictEqual(run('agent-learning-capture.js', { prompt: 'ship it' }), '')
console.log('agent hooks: ok')
