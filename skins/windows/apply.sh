#!/usr/bin/env bash
# Windows patch for basicScandal/claude-skins (run in Git Bash AFTER the upstream install.sh).
# 1. Windows has no symlinks by default, so skin output styles are copies: delete them without `-type l`.
# 2. Swap in a /skin SKILL.md that calls the engine scripts through `bash` and lists skins inline.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
engine="$HOME/.claude/skins/engine"
for f in activate.sh deactivate.sh; do
  sed -i 's/-name "skin-\*\.md" -type l -delete/-name "skin-*.md" -delete/' "$engine/$f"
done
mkdir -p "$HOME/.claude/skills/skin"
cp "$here/SKILL.md" "$HOME/.claude/skills/skin/SKILL.md"
echo "claude-skins Windows patch applied"
