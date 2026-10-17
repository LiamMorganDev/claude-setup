# git-panel

Git side pane built around worktrees: every worktree on top (changes, ahead/behind, PR + CI glyphs; hover for detail), the focused one below with its plain-English status, Changes/Stash tabs, capped inline diffs and hover actions per file. A pinned footer holds Commit with Claude (/commit), push/pull/fetch/sync-with-main/diff-vs-main, and a status line saying how fresh the data is.

- **Use:** `/git-panel` opens the pane.
- **Notes:** Discard and worktree removal ask in a dialog. A banner removes every clean, merged worktree in one go (node_modules junctions are unlinked first). New worktrees go in `.claude/worktrees/`. PR status needs `gh` logged in. Local status is live; fetch runs every 2 min, PR status every 60s. With [chat-blame](../chat-blame/) on, each change is badged with the chat that made it.
- **Version:** 1.0.0

<!-- screenshot: add mods/git-panel/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install git-panel@claude-setup
```

## Turn off

Add `"git-panel"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
