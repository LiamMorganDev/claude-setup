# git-panel

Git side pane for the current repo: a diff of every changed file, branch ahead/behind, and buttons to stage, commit, push, pull and stash. Lists and manages git worktrees.

- **Use:** `/git-panel` opens the pane.
- **Notes:** Destructive actions need two presses. With [chat-blame](../chat-blame/) on, each change is badged with the chat that made it. Polls rather than file-watches, fine for a handful of worktrees.
- **Version:** 0.6.0

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
