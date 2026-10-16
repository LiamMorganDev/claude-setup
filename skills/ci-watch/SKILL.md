---
name: ci-watch
description: Watch the GitHub Actions run for a commit pushed to main; on failure, fix it, commit, push and watch again (max 2 fix attempts). Triggered automatically by the post-push hook.
argument-hint: <commit sha> [attempt n]
---

Commit: $ARGUMENTS (no SHA given → `git rev-parse origin/main`). Attempt 1 unless the arguments say otherwise.

1. **Find the run.** `gh run list --commit <sha> --json databaseId,status,conclusion,workflowName,url`. Nothing yet → wait about 15s (Monitor with an until-loop, never foreground `sleep`) and retry up to 4 times. Still nothing → the repo has no workflow for this push: say so in one line and stop. Several workflows → watch each one.
2. **Watch it in the background.** `gh run watch <id> --exit-status --interval 30` with Bash `run_in_background: true`. Don't poll: you are re-invoked when it exits. Meanwhile carry on with whatever else the user asked, or end the turn with one line saying CI is being watched (run URL).
3. **Passed** → one line: `CI green: <workflow> (<duration>) <url>`. Done.
4. **Cancelled** → a newer push superseded it. Stop; that push's own ci-watch covers it.
5. **Failed** → `gh run view <id> --log-failed` (big output: `| tail -200` per failed job) and find the root cause.
   - **Infra/flake** (runner lost, network, registry rate limit, timeout with no code cause): `gh run rerun <id> --failed` once, then back to step 2. A second infra failure → stop and report.
   - **Code/config failure:** fix the root cause on `main` in the main checkout (not a stale worktree). Before committing, run the same check locally (the repo's typecheck/lint/test/build, or whichever one failed), then commit with the repo's commit flow (`/commit` if it has one) and push main. That push fires the hook again → ci-watch for the new SHA, as attempt n+1.
6. **Limits.** After **2 failed fix attempts** for the same original push, stop: report what failed, what you tried and the run URLs, and ask the user (AskUserQuestion). Never:
   - push with `--no-verify`, force-push, or rewrite main's history
   - weaken a check to make it pass: deleting or skipping tests, loosening lint/type rules, `continue-on-error`, lower thresholds
   - touch secrets or repo/Actions settings

Report each attempt in one line: run → cause → fix commit.
