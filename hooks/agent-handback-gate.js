// SubagentStop hook: a team agent can't finish without the handback lines its definition
// asks for, so the principal always gets a verdict, the gate result and learnings.
// Blocks once; if the agent stops again without them, it is let through (no loops).
const fs = require('fs')

const REQUIRED = {
  'frontend-engineer': ['DONE:', 'GATE:', 'LEARNINGS:'],
  'backend-engineer': ['DONE:', 'GATE:', 'LEARNINGS:'],
  'qa-tester': ['VERDICT:', 'LEARNINGS:'],
  'code-reviewer': ['VERDICT:', 'LEARNINGS:'],
  'ux-designer': ['ARTIFACT:', 'LEARNINGS:'],
  researcher: ['ANSWER:', 'LEARNINGS:'],
  'docs-keeper': ['UPDATED:', 'LEARNINGS:'],
  devops: ['DONE:', 'LEARNINGS:'],
}

/** The handback lines `type` still owes in `text`; empty when complete or not a team agent. */
const missing = (type, text) => (REQUIRED[type] ?? []).filter(k => !String(text ?? '').includes(k))

if (require.main === module) {
  let input = {}
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) } catch {}
  const gaps = input.stop_hook_active ? [] : missing(input.agent_type, input.last_assistant_message)
  if (gaps.length) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: `Your handback is missing: ${gaps.join(', ')}. End with the full handback block from your agent definition (use "none" where nothing applies).`,
    }))
  }
}

module.exports = { missing }
