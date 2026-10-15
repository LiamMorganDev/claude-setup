# chat-blame

Remembers which chat (session) last edited each file, in `~/.claude/chat-blame.json`.

- **Use:** Nothing to run; it works in the background.
- **Notes:** Feeds [git-panel](../git-panel/), which shows the badge. On its own it has no UI.
- **Version:** 0.1.0

<!-- screenshot: add mods/chat-blame/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install chat-blame@claude-setup
```

## Turn off

Add `"chat-blame"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
