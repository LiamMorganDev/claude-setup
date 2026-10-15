# bat-flyby

A Dracula bat flies across the band above the prompt whenever a `git push` succeeds.

- **Use:** Automatic.
- **Notes:** Pure fun. Pairs with [dracula-skin](../dracula-skin/) and the dracula skin.
- **Version:** 0.1.0

<!-- screenshot: add mods/bat-flyby/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install bat-flyby@claude-setup
```

## Turn off

Add `"bat-flyby"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
