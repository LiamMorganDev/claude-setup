# lockstep-guards

Watches edits and flags (1) `.env` and `.env.example` drifting apart (sections, order, comments) and (2) a DB schema, its types or its validation (Zod etc.) changing without the others.

- **Use:** Automatic on file edits.
- **Notes:** Enforces two rules from `global/CLAUDE.md`. It flags; it does not block or fix.
- **Version:** 0.2.0

<!-- screenshot: add mods/lockstep-guards/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install lockstep-guards@claude-setup
```

## Turn off

Add `"lockstep-guards"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
