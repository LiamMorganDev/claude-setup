# unshipped-nag

After a turn, shows a toast if changes have sat uncommitted for 30+ minutes or commits are not pushed.

- **Use:** Automatic; at most one nag every 30 minutes.
- **Notes:** Reads `git status`; never commits or pushes anything itself.
- **Version:** 0.1.0

<!-- screenshot: add mods/unshipped-nag/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install unshipped-nag@claude-setup
```

## Turn off

Add `"unshipped-nag"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
