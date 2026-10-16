# claudelets-agent-monitor

Live pane for the request in progress: how far along it is (%), tokens used, and one row per agent and subagent saying what it is doing right now. Each agent gets a small pixel Claude dressed for its job.

- **Use:** `/monitor` opens the pane.
- **Notes:** Secrets in tool arguments (API keys, tokens) are masked before anything is shown.
- **Version:** 0.8.0

<!-- screenshot: add mods/claudelets-agent-monitor/screenshot.png and reference it here -->

## Install on its own

Part of [claude-setup](../../README.md) — the full install loads it via `sync.js`. To install just this mod:

```bash
claude plugin marketplace add LiamMorganDev/claude-setup
claude plugin install claudelets-agent-monitor@claude-setup
```

## Turn off

Add `"claudelets-agent-monitor"` to `skipMods` in `~/.claude/claude-setup.local.json`, then start a new session.

## Files

- `.claude-plugin/plugin.json` — manifest
- `hooks/hooks.json` — lists the hook module(s)
- `hooks/*.ts(x)` — the code; `*.test.*` are its tests
