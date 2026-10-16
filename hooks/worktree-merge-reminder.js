// PostToolUse(Bash) hook: after a `git push` that updates main,
// 1. if the repo has GitHub Actions workflows, tell Claude to run the ci-watch skill for the pushed SHA;
// 2. list linked worktrees whose branch is now fully merged into main, and remind Claude to follow the global
//    CLAUDE.md "Worktree merged into main" rule (align live PocketBase, then remove the worktree + branch).
// Reminder only: it changes nothing.
const { execFileSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const cmd = String(input.tool_input?.command ?? '');
    if (!/\bgit\b[^\n;&|]*\bpush\b/.test(cmd)) return;
    const cwd = input.cwd || process.cwd();
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

    // Only pushes that name main (`origin main`, `x:main`) or a bare push while on main.
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    // `git push <remote> <refspec…>` must name main; a bare `git push [remote]` counts only while on main.
    const refspecs = cmd
      .replace(/^.*?\bpush\b/, '')
      .split(/[\n;&|]/)[0]
      .trim()
      .split(/\s+/)
      .filter((a) => a && !a.startsWith('-'))
      .slice(1);
    if (refspecs.length ? !refspecs.some((r) => /(^|:)(refs\/heads\/)?main$/.test(r)) : branch !== 'main') return;

    const main = git('rev-parse', 'origin/main');
    const msgs = [];

    // Push landed: the remote-tracking main now equals local main (a rejected push leaves them apart).
    let hasWorkflows = false;
    try {
      hasWorkflows = readdirSync(join(git('rev-parse', '--show-toplevel'), '.github', 'workflows')).some((f) => /\.ya?ml$/.test(f));
    } catch {
      // no workflows dir
    }
    if (hasWorkflows && git('rev-parse', 'main') === main) {
      msgs.push(
        `Pushed ${main.slice(0, 7)} to main. Run the ci-watch skill now (Skill tool, args "${main}") to watch its GitHub CI run in the background and fix any failure.`,
      );
    }

    const merged = [];
    for (const block of git('worktree', 'list', '--porcelain').split(/\n\n+/).slice(1)) {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      const head = /^HEAD (\w+)$/m.exec(block)?.[1];
      const br = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '(detached)';
      if (!path || !head || br === 'main') continue;
      try {
        git('merge-base', '--is-ancestor', head, main);
        // A fresh worktree is also "merged" (no commits yet); skip any with uncommitted work in progress.
        if (git('-C', path, 'status', '--porcelain', '--untracked-files=no')) continue;
        merged.push(`${path} [${br}]`);
      } catch {
        // not merged yet: leave it alone
      }
    }
    if (merged.length)
      msgs.push(
        `Pushed to main. These worktrees are now fully merged into origin/main: ${merged.join(', ')}. ` +
          `Follow the global CLAUDE.md "Worktree merged into main" rule: align live PocketBase to main's pb_schema.json (if the repo has one), then remove each worktree (unlink any node_modules junction first) and its branch.`,
      );
    if (!msgs.length) return;
    const msg = msgs.join('\n\n');
    process.stdout.write(
      JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }),
    );
  } catch {
    // never break the tool call over a reminder
  }
});
