# claude-setup

My complete [Claude Code](https://claude.com/claude-code) setup: my own mods, skills, slash commands, hooks, status line and global `CLAUDE.md`, plus links to every third-party plugin and skill I run.

**To install it, give any Claude Code session this repo's link and say "install this".** It follows [INSTALL.md](INSTALL.md): asks which parts you want, backs up your config, then installs and verifies everything. Works on Windows, macOS and Linux.

```
Install my Claude setup from https://github.com/LiamMorganDev/claude-setup — follow its INSTALL.md.
```

---

## What's in here

| Part | Where | What it is |
|---|---|---|
| [Mods](#mods-mine) | `mods/` | 10 Claude Code plugins I wrote: side panes, status rows, toasts and guard hooks |
| [Skill](#skills) | `skills/ui-build/` | My `/ui-build` skill, chaining the UI skills below into one flow |
| [Commands](#slash-commands) | `commands/` | `/commit`, `/self-review`, `/ui-proto`, `/pb-drift` |
| [Global CLAUDE.md](#global-claudemd) | `global/CLAUDE.md` | My cross-project rules, generalised (no personal or project-specific bits) |
| [Settings](#settings) | `global/settings.template.json` | Hooks, plugins, marketplaces and preferences, merged into yours on install |
| [Status line](#status-line) | `statusline/statusline.js` | `🦇 model │ branch ●dirty │ ▓▓░░ 80% ctx`, themed by the active skin |
| [Worktree hook](#worktree-merge-reminder) | `hooks/worktree-merge-reminder.js` | Reminds Claude to clean up merged git worktrees after a push to `main` |
| [Skins patch](#skins) | `skins/windows/` | Windows fixes for [claude-skins](https://github.com/basicScandal/claude-skins) |
| Plumbing | `sync.js`, `.claude-plugin/marketplace.json` | Loads every mod from disk each session; also lets you install mods one by one |
| Owner-only | `autopush.js` | Auto-commits and pushes this repo for me. **Never installed for anyone else.** |

## How it fits together

```
~/.claude/
├── claude-setup/            ← this repo (git clone)
│   ├── mods/<mod>/          ← loaded straight from disk by sync.js (no plugin install)
│   ├── skills/ui-build/     ← linked into ~/.claude/skills/ui-build
│   ├── commands/*.md        ← linked into ~/.claude/commands/
│   ├── statusline/          ← settings.json statusLine points here
│   ├── hooks/               ← settings.json PostToolUse points here
│   └── sync.js              ← SessionStart hook
├── settings.json            ← template merged in (your own keys kept)
├── CLAUDE.md                ← global/CLAUDE.md copied or appended
└── claude-setup.local.json  ← per-machine opt-outs: { "skipMods": ["pb-light"] }
```

Every session, the `SessionStart` hook runs `sync.js`, which:

1. writes every folder in `mods/` (minus `skipMods`) into `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json`, with `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, so Desktop, VS Code and terminal sessions all load the mods from disk and hot-reload edits;
2. keeps `.claude-plugin/marketplace.json` listing exactly the mods in `mods/`;
3. installs + enables the `ALWAYS_ON` third-party plugin (glanceflow) and removes duplicate installed copies of local mods;
4. re-enables any mod that a project's settings switch off.

Because skills and commands are links into the clone, `git pull` updates everything.

---

## Mods (mine)

Each folder has its own README with details.

| Mod | What it does | Command |
|---|---|---|
| [claudelets-agent-monitor](mods/claudelets-agent-monitor/) | Live pane of the current request: % complete, tokens, and what each agent/subagent is doing, with a pixel Claude per agent dressed for its job | `/monitor` |
| [git-panel](mods/git-panel/) | Git side pane: diffs of every changed file, ahead/behind, stage/commit/push/pull/stash, worktree management | `/git-panel` |
| [chat-blame](mods/chat-blame/) | Records which chat last edited each file, so git-panel badges every change with its chat | – |
| [win-jar](mods/win-jar/) | Every finished step from every chat goes in a "shipped today" jar: pane, streaks, a toast per win | `/wins` |
| [unshipped-nag](mods/unshipped-nag/) | Toast when changes sit uncommitted 30+ min or commits are unpushed (max every 30 min) | – |
| [lockstep-guards](mods/lockstep-guards/) | Flags `.env`/`.env.example` drift and schema/types/Zod changes made out of lockstep | – |
| [bat-flyby](mods/bat-flyby/) | A Dracula bat flies across the band above the prompt when a `git push` succeeds | – |
| [dracula-skin](mods/dracula-skin/) | Dracula look for Desktop + VS Code: turn dividers, tree-line tool rows with `[tags]`, session banner | – |
| [pb-light](mods/pb-light/) | *Optional, off by default.* Status light: is live PocketBase in sync with the repo's `pb_schema.json` (read-only) | `/pb-light` |

## Third-party plugins (installed by INSTALL.md, not copied here)

| Plugin | Source | Why I use it |
|---|---|---|
| ponytail | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | Always-on "lazy senior dev": smallest complete change; `ponytail-review` / `ponytail-audit` |
| i-have-adhd | [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) | Always-on output shaping: next action first, numbered steps, one concrete next step |
| glanceflow | [Antreas-Strb/glanceflow](https://github.com/Antreas-Strb/glanceflow) | Plan/progress tracking tools |
| filetree | [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) | IDE-style file tree showing where Claude is working |
| ui-ux-pro-max | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Ships 7 design skills (below) as one plugin |

## Skills

### Mine

| Skill | What it does |
|---|---|
| [`/ui-build`](skills/ui-build/SKILL.md) | Runs the full UI stack in order: `ponytail` → `grill-me` → `ui-ux-pro-max` → `ui-styling` → `/ui-proto`. Use: `/ui-build <what UI to change>` |

### Third-party (installed by INSTALL.md from their source repos)

| Skill | Source | What it does |
|---|---|---|
| `grilling` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) | Relentless interview, in rounds, until a plan is fully decided |
| `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) | The `/grill-me` entry point to grilling |
| `wayfinder` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/wayfinder) | Plans work too big for one session as decision tickets |
| `research` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/research) | Researches primary sources into a Markdown file |
| `prototype` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) | Throwaway prototype to answer a design question |
| `tdd` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) | Red-green-refactor |
| `diagnosing-bugs` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs) | Diagnosis loop for hard bugs and perf regressions |
| `code-review` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review) | Standards + spec review of a branch |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | UI/UX design intelligence: styles, palettes, fonts, UX rules |
| `ui-styling`, `design`, `design-system`, `brand`, `banner-design`, `slides` | same plugin | shadcn/Tailwind styling, logos/CIP, tokens, brand voice, banners, HTML decks |
| `browser-use` | [browser-use/browser-use](https://github.com/browser-use/browser-use/tree/main/skills/browser-use) | Browser automation CLI: verify UI, screenshots, flows |
| `skin` | [basicScandal/claude-skins](https://github.com/basicScandal/claude-skins) | `/skin <name>`: themes, banners, personalities (+ my Windows patch) |

### Most used (from my transcripts)

1. `/commit` — by far the most used
2. `grilling` / `/grill-me`
3. `ui-ux-pro-max`
4. `/ui-proto`
5. `wayfinder`, `research`, `ponytail-review` / `ponytail-audit`, `/pb-drift`

## Slash commands

| Command | What it does |
|---|---|
| [`/commit [and push]`](commands/commit.md) | Reviews the diff, bumps the patch version in `package.json`, writes a `vX.Y.Z — intent` message, updates `CHANGELOG.md` (Keep a Changelog, plain language) and collapses the entry from 30 commits ago. Pushes only if asked. Never adds a Claude co-author. If on `main` with a `pb_schema.json`, first aligns live PocketBase to it (does nothing in other repos). |
| [`/self-review`](commands/self-review.md) | Harsh review of the latest work against correctness, completeness, the repo's own conventions and security; fixes what it finds, runs lint/typecheck/test/build, reports a table |
| [`/ui-proto <change>`](commands/ui-proto.md) | Builds an Artifact with 2–3 switchable design options before any component code; implements the chosen one exactly |
| [`/pb-drift`](commands/pb-drift.md) | *PocketBase only.* Read-only diff of live PocketBase vs `pb_schema.json` |

## Global CLAUDE.md

[`global/CLAUDE.md`](global/CLAUDE.md) is the rule set every session gets. Highlights:

- Terse reporting; never add Claude as commit co-author.
- `docs/` is the source of truth and is updated in the same change.
- `.env` / `.env.example` stay structurally identical; schema, types and validation change together.
- Quality gate (typecheck / lint / test / build) before "done".
- Every question goes through `AskUserQuestion`.
- UI work: prototype as an Artifact first, the approved mock is the spec, and every handback includes before/after screenshots (desktop + mobile) in an Artifact.
- Optional blocks (mods, worktree cleanup, each always-on skill) are kept only if you install that part.

## Settings

[`global/settings.template.json`](global/settings.template.json) is merged into `~/.claude/settings.json`; your existing keys win unless you agree to change them. It sets:

- **`permissions.defaultMode: bypassPermissions`** — ⚠️ Claude runs tools without asking. This is how I work. INSTALL.md asks before applying it.
- `effortLevel: medium`, `tui: fullscreen`, workflows on, push notifications on.
- The `sync.js` SessionStart hook and the plugin marketplaces above.
- Optional: status line, worktree hook, skin hooks, and (Windows) `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`.

## Status line

[`statusline/statusline.js`](statusline/statusline.js): model, git branch with dirty-file count, and a context-remaining bar, all coloured by the active skin. Shows the pb-light result too when that mod is on.

## Worktree merge reminder

[`hooks/worktree-merge-reminder.js`](hooks/worktree-merge-reminder.js) — `PostToolUse` on Bash/PowerShell. After a `git push` that updates `main`, it lists linked worktrees now fully merged and reminds Claude to remove them (see the worktree rules in `global/CLAUDE.md`). Reminder only; it changes nothing.

## Skins

Installed from [basicScandal/claude-skins](https://github.com/basicScandal/claude-skins) (11 themes, default `dracula`). On Windows, [`skins/windows/apply.sh`](skins/windows/apply.sh) then:

1. deletes skin output styles as plain files (Windows has no symlinks by default), and
2. swaps in a `/skin` skill that runs the engine through `bash`.

I don't use the upstream tool-sound hook or its status line; INSTALL.md removes them and keeps mine.

---

## Requirements

- Claude Code 2.1.296 or newer (tested on 2.1.296; mods need plugin hook modules and `CLAUDE_CODE_PLUGIN_DIRS`)
- `git`, Node.js 18+ (`node` on PATH)
- Windows: Git Bash (the skins engine and scripts are bash)
- Optional: `uv` (for the `browser-use` CLI), `npx` (for third-party skills)

## Update / uninstall

```bash
node ~/.claude/claude-setup/update.js
```

Pulls the latest and cleans up anything removed upstream (deleted mods, dead links, stale hooks). Start a new session after. More in [INSTALL.md → Update](INSTALL.md#update) and [INSTALL.md → Uninstall](INSTALL.md#uninstall).

## Licence

My code: [MIT](LICENSE). Third-party plugins and skills are not in this repo; each keeps its own licence.
