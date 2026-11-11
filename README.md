# claude-setup

A live mirror of my [Claude Code](https://claude.com/claude-code) setup: my mods, agents, skills, slash commands, hooks, status line, global `CLAUDE.md` and `settings.json`, plus the list of third-party plugins and skills I run. It keeps itself in step across my devices; nothing here is edited by hand.

**New device:** give a Claude Code session this repo's link and say "install this". It follows [INSTALL.md](INSTALL.md).

```
Install my Claude setup from https://github.com/LiamMorganDev/claude-setup — follow its INSTALL.md.
```

---

## How it stays current

Two hooks in `settings.json` run [`autopush.js`](autopush.js) (only on devices with `~/.claude/.claude-setup-autopush`):

1. **SessionStart:** `git pull --rebase`, so changes from my other devices arrive.
2. **Every run (SessionStart + Stop):** [`mirror.js`](mirror.js) syncs the files below between `~/.claude` and this repo. Whichever side changed since the last sync wins; both changed → this machine wins. The previous live file is backed up to `~/.claude/backups/claude-setup-mirror/`.
3. Any change is committed and pushed.

| Live on the machine | Repo copy | Notes |
|---|---|---|
| `~/.claude/CLAUDE.md` | `global/CLAUDE.md` | |
| `~/.claude/settings.json` | `global/settings.json` | home path → `{{HOME}}`; `CLAUDE_CODE_PLUGIN_DIRS` stays per machine |
| `~/.claude/scripts/*` | `global/scripts/*` | e.g. `docker-up.ps1` |
| `~/.claude/skills/skin/SKILL.md` | `skins/windows/SKILL.md` | Windows `/skin` patch |
| third-party skills in `~/.claude/skills` | `global/skills.json` | name → source repo; missing ones are reported to Claude at session start |
| third-party mods in `mods/` (own `.git`) | `global/mods.json` | name → clone URL; missing ones are cloned |

Everything else is linked, so edits land in the repo directly. [`sync.js`](sync.js) (SessionStart) handles that:

- loads every folder in `mods/` from disk (`CLAUDE_CODE_PLUGIN_DIRS`, hot-reloaded) and keeps `.claude-plugin/marketplace.json` listing my own;
- installs any plugin enabled in `settings.json` that this machine is missing;
- links `agents/`, `commands/` and `skills/*` into `~/.claude` where absent;
- re-enables a mod a project switches off, and strips `disable-model-invocation: true` from global skills.

## What's in here

### Mods (mine)

| Mod | What it does |
|---|---|
| [claudelets-agent-monitor](mods/claudelets-agent-monitor/) | Live pane of the current request: % complete, tokens, what each agent/subagent is doing (`/monitor`) |
| [dracula-skin](mods/dracula-skin/) | Dracula look for Desktop + VS Code: turn dividers, tree-line tool rows with `[tags]`, session banner |
| [lockstep-guards](mods/lockstep-guards/) | Flags `.env`/`.env.example` drift and schema/types/Zod changes made out of lockstep |

Third-party mod (cloned, git-ignored): [filetree](https://github.com/data-goblin/claude-code-filetree).

### Agents

`agents/` → `~/.claude/agents`: principal-engineer (main session playbook), ux-designer, frontend-engineer, backend-engineer, code-reviewer, qa-tester, researcher, docs-keeper, devops. Each keeps private memory in `~/.claude/agent-memory/<agent>/` (not in this repo). Hooks: `hooks/agent-learning-capture.js` (UserPromptSubmit) flags corrections; `hooks/agent-handback-gate.js` (SubagentStop) bounces a handback missing required lines. Test: `node hooks/agent-hooks.test.js`.

### Skills and commands (mine)

| | What it does |
|---|---|
| [`ui-build`](skills/ui-build/SKILL.md) | Full UI flow: grill → design guidance → Artifact options → build plan |
| [`ci-watch`](skills/ci-watch/SKILL.md) | Watches GitHub Actions after a push to `main`; fixes failures (max 2 attempts) |
| [`/commit`](commands/commit.md) | Reviews diff, bumps patch version, writes message + `CHANGELOG.md`; never a Claude co-author |
| [`/self-review`](commands/self-review.md) | Harsh review of the latest work, fixes, runs the quality gate |
| [`/ui`](commands/ui.md), [`/ui-proto`](commands/ui-proto.md) | UI options Artifact before any component code |
| [`/pb-drift`](commands/pb-drift.md), [`/pb-align`](commands/pb-align.md) | PocketBase: read-only drift check / push `pb_schema.json` to live |

### Hooks and status line

- [`hooks/worktree-merge-reminder.js`](hooks/worktree-merge-reminder.js) (PostToolUse): after a push to `main`, start `ci-watch` and clean merged worktrees; after a push to `release` with `pb_schema.json`, run `/pb-align`.
- [`statusline/statusline.js`](statusline/statusline.js): model, branch + dirty count, context bar, coloured by the active skin.

### Third-party

Plugins (from `global/settings.json`): ponytail, i-have-adhd, hyperframes, rust-analyzer-lsp. Skills: see [`global/skills.json`](global/skills.json) (mostly [mattpocock/skills](https://github.com/mattpocock/skills), [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [browser-use](https://github.com/browser-use/browser-use), [hyperframes](https://github.com/heygen-com/hyperframes)). Skins: [basicScandal/claude-skins](https://github.com/basicScandal/claude-skins) + [`skins/windows/apply.sh`](skins/windows/apply.sh). None of these are copied here.

## Requirements

Claude Code 2.1.296+, `git`, Node.js 18+. Windows: Git Bash. `gh` for `ci-watch`.

## Licence

My code: [MIT](LICENSE). Third-party plugins and skills keep their own licences.
