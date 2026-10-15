# win-jar

Every step finished in any chat drops into a "shipped today" jar, with a toast per win and daily streaks.

- **Use:** `/wins` opens the jar pane.
- **Notes:** Shared across all sessions. Two chats finishing at the exact same instant can drop one win (no lock).
- **Version:** 0.1.1

<!-- screenshot: add mods/win-jar/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install win-jar@claude-setup
```

## Turn off

Add `"win-jar"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
