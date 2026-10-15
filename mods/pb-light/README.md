# pb-light

**Optional, off by default.** A status light showing whether live PocketBase matches the repo's `pb_schema.json`: green ● in sync, amber ▲ drift (with a toast when it first drifts), red when the check fails.

- **Use:** `/pb-light` rechecks now. Turn it on by removing `pb-light` from `skipMods` in `~/.claude/claude-setup.local.json`.
- **Notes:** Read-only: one auth and one GET, never a write. Needs `POCKETBASE_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` in the repo `.env`. Result is cached in `~/.claude/pb-light.json` for the status line and context-meter. `/pb-drift` gives the full diff.
- **Version:** 0.2.0

<!-- screenshot: add mods/pb-light/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install pb-light@claude-setup
```

## Turn off

Add `"pb-light"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
