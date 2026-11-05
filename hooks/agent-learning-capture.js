// UserPromptSubmit hook: when a prompt reads like a correction or a stated preference,
// add a one-line reminder so the principal saves it to the right agent's memory.
// The model decides whether it is really a lesson; this only makes sure it is asked.
const fs = require('fs')

// shortcut: English regexes only, misses subtle corrections; upgrade to a model check if it misses too many
const PATTERNS = [
  /^\s*(no|nope|wrong|not quite|not like that|stop)\b/i,
  /\b(don'?t|do not|never|always|stop) (do|use|add|make|put|ask|write|call|show|change)\b/i,
  /\binstead( of)?\b/i,
  /\b(i (prefer|want|like|hate|don'?t like)|i'?d rather)\b/i,
  /\b(that'?s|this is) (wrong|not what i|incorrect|too much|overkill)\b/i,
  /\bremember\b[:\s]/i,
  /\bfrom now on\b/i,
]

/** True when the prompt reads like a correction or preference worth remembering. */
const isLesson = prompt => {
  const p = String(prompt ?? '').trim()
  if (!p || p.length > 1500 || p.startsWith('/')) return false

  return PATTERNS.some(r => r.test(p))
}

if (require.main === module) {
  let input = {}
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) } catch {}
  if (isLesson(input.prompt)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'This prompt reads like a correction or a preference. If it is a lasting lesson about how the user wants work done, it belongs in memory: for work by the agent team, in the memory of the agent it concerns (~/.claude/agent-memory/<agent>/, per the principal-engineer playbook, Learning step 1); otherwise in the usual memory. A one-off instruction needs no memory.',
      },
    }))
  }
}

module.exports = { isLesson }
