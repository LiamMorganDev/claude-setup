# context-meter

A status row above the prompt: model │ branch ●dirty-count, plus a PocketBase sync light when [pb-light](../pb-light/) is on.

- **Use:** Always visible; nothing to run.
- **Notes:** Reads the same data as `statusline/statusline.js`, so the two always agree.
- **Version:** 0.4.0

<!-- screenshot: add mods/context-meter/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install context-meter@claude-setup
```

## Turn off

Add `"context-meter"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
