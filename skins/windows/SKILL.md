---
name: skin
description: Switch Claude Code visual themes (skins). List available skins, activate a skin, reset to defaults, or set a permanent default. USE WHEN user says '/skin', 'change skin', 'switch theme', 'activate skin', or wants to change Claude's visual appearance.
---

# Skin — Claude Code Visual Themes

Switch between visual skins (from github.com/basicScandal/claude-skins) that change terminal colors, ASCII banner, status line theme, and Claude's personality/voice. Windows install: run scripts through Git Bash via the Bash tool.

## `/skin` (no arguments) — List available skins

```bash
cur=$(cat ~/.claude/skins/engine/current); for f in ~/.claude/skins/*.yaml; do n=$(basename "$f" .yaml); [ "$n" = default ] && continue; d=$(grep -m1 '^description:' "$f" | cut -d'"' -f2); [ "$n" = "$cur" ] && echo "→ $n — $d" || echo "  $n — $d"; done
```

Show the list to the user.

## `/skin <name>` — Activate a skin

```bash
bash ~/.claude/skins/engine/activate.sh <name>
```

Tell the user it's active (status line updates on next refresh) and mention `/skin default` to make it permanent.

If `~/.claude/skins/personalities/<name>.md` exists, read it and adopt that voice for the rest of the session.

## `/skin reset` — Deactivate and restore

```bash
bash ~/.claude/skins/engine/deactivate.sh
```

Drop any adopted skin voice. Tell the user the defaults are restored.

## `/skin default` — Set current as permanent default

Read `~/.claude/skins/engine/current`, then write `default_skin: <that value>` to `~/.claude/skins/engine/config.yaml`. Tell the user which skin was set as default.
