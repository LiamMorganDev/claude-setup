# INSTALL.md — instructions for Claude

You are setting up the owner's Claude Code setup on another of their devices. After this, `autopush.js` + `mirror.js` keep the device in step automatically (see [README.md](README.md#how-it-stays-current)). Say what you're doing in one line per step; if a step fails, say why, carry on, and list it at the end. On Windows run shell steps in Git Bash.

## 1. Requirements

```bash
claude --version   # 2.1.296+
git --version
node --version     # 18+
gh auth status     # needed to push this repo and for ci-watch
```

## 2. Back up and clone

```bash
B=~/.claude/backups/pre-claude-setup-$(date +%Y%m%d-%H%M%S); mkdir -p "$B"
for f in settings.json CLAUDE.md; do [ -e ~/.claude/$f ] && cp ~/.claude/$f "$B/"; done; echo "$B"
git clone https://github.com/LiamMorganDev/claude-setup.git ~/.claude/claude-setup
```

If `~/.claude/claude-setup` already exists, run step 5 (Update) instead.

## 3. Apply the setup

```bash
touch ~/.claude/.claude-setup-autopush            # this device syncs + pushes from now on
[ -e ~/.claude/settings.json ] || echo '{}' > ~/.claude/settings.json
node ~/.claude/claude-setup/mirror.js --prefer-repo   # CLAUDE.md, settings.json, scripts, /skin → this machine
node ~/.claude/claude-setup/sync.js < /dev/null       # mods, missing plugins, agents/commands/skills links
```

If a real `~/.claude/agents` or `~/.claude/commands` folder already exists, `sync.js` leaves it alone: ask the owner whether to move it aside (`<name>.bak-<date>`) and re-run `sync.js`.

## 4. Third-party parts

1. **Plugins:** `sync.js` installed every plugin enabled in `global/settings.json`. Check with `claude plugin list`; install any that failed with `claude plugin install <id>`.
2. **Skills:** for each entry in `global/skills.json` missing from `~/.claude/skills`, install it from its source repo (`npx -y skills@latest add <source> -g -a claude-code -y --skill <name>`, or copy the skill folder from a shallow clone). `null` source: ask the owner.
3. **Skins:** `T=$(mktemp -d) && git clone -q --depth 1 https://github.com/basicScandal/claude-skins.git "$T/cs" && bash "$T/cs/install.sh"`, then on Windows `bash ~/.claude/claude-setup/skins/windows/apply.sh`. Upstream adds its own hooks and status line: re-run `node ~/.claude/claude-setup/mirror.js --prefer-repo` afterwards to restore `settings.json`. Activate: `bash ~/.claude/skins/engine/activate.sh dracula`.
4. **browser-use CLI:** needs [`uv`](https://docs.astral.sh/uv/); follow the upstream README.

## 5. Verify

1. `node -e "JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude/settings.json','utf8'))"`
2. `node ~/.claude/claude-setup/mirror.js` prints nothing (in sync).
3. `ls ~/.claude/agents ~/.claude/commands ~/.claude/skills`
4. Tell the owner to start a new session (hooks, mods and plugins load at session start).

---

## Update

Automatic on every session start (pull + mirror). Manual, e.g. after a long time offline:

```bash
node ~/.claude/claude-setup/update.js
```

It pulls (fast-forward only), removes leftovers of deleted mods, dead links and hooks pointing at deleted files, re-runs `sync.js` and `mirror.js`. Third-party parts update separately: `claude plugin marketplace update` then `claude plugin update <id>`; re-run step 4.2–4.3 for skills/skins.

## Remove from a device

1. `rm ~/.claude/.claude-setup-autopush` (stops syncing).
2. Restore `settings.json` / `CLAUDE.md` from the step 2 backup.
3. Remove links `~/.claude/agents`, `~/.claude/commands`, `~/.claude/skills/ui-build`, `~/.claude/skills/ci-watch` (Windows: `cmd //c rmdir <path>`, never a recursive delete).
4. Delete `~/.claude/claude-setup`.
