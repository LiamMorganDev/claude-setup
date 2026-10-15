# dracula-skin

Dracula theme for the Desktop app and VS Code: turn dividers, tree-line tool rows with `[tags]`, a light/dark palette and a banner at session start.

- **Use:** Automatic.
- **Notes:** Separate from the terminal skins in [claude-skins](https://github.com/basicScandal/claude-skins); use both for one look everywhere.
- **Version:** 0.2.0

<!-- screenshot: add mods/dracula-skin/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install dracula-skin@claude-setup
```

## Turn off

Add `"dracula-skin"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
