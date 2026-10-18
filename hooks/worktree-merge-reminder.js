// PostToolUse(Bash) hook:
// - after a `git push` that updates `release` in a repo with a pb_schema.json, remind Claude to run /pb-align
//   (align live PocketBase to the release schema);
// - after a `git push` that updates main,
//   1. if the repo has GitHub Actions workflows, tell Claude to run the ci-watch skill for the pushed SHA;
//   2. list linked worktrees whose branch is now fully merged into main, and remind Claude to follow the global
//      CLAUDE.md "Worktree merged into main" rule (remove the worktree + branch).
// Reminder only: it changes nothing.
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
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

    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    // `git push <remote> <refspec…>` must name the branch (`origin main`, `x:main`); a bare `git push [remote]`
    // counts only while on it. Every `git … push` segment counts (`git push origin main; git push origin main:release`).
    const pushes = cmd
      .split(/[\n;&|]/)
      .filter((seg) => /\bgit\b.*\bpush\b/.test(seg))
      .map((seg) => seg.replace(/^.*?\bpush\b/, '').trim().split(/\s+/).filter((a) => a && !a.startsWith('-')).slice(1));
    const names = (b) =>
      pushes.some((refs) => (refs.length ? refs.some((r) => new RegExp(`(^|:)(refs/heads/)?${b}$`).test(r)) : branch === b));
    const emit = (msgs) => {
      if (!msgs.length) return;
      const msg = msgs.join('\n\n');
      process.stdout.write(
        JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }),
      );
    };

    const msgs = [];
    // Live PocketBase follows production: align it on a release push, never on a main push.
    if (names('release') && existsSync(join(git('rev-parse', '--show-toplevel'), 'pb_schema.json')))
      msgs.push(
        "Pushed to release. Run /pb-align now: align live PocketBase to the release branch's pb_schema.json (repo → live; confirm destructive changes first).",
      );
    if (!names('main')) return emit(msgs);

    const main = git('rev-parse', 'origin/main');

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
          `Follow the global CLAUDE.md "Worktree merged into main" rule: remove each worktree (unlink any node_modules junction first) and its branch. Don't align live PocketBase now; that happens on a release push (/pb-align).`,
      );
    emit(msgs);
  } catch {
    // never break the tool call over a reminder
  }
});
