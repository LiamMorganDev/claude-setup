# INSTALL.md — instructions for Claude

You are a Claude Code agent installing this setup (`https://github.com/LiamMorganDev/claude-setup`) for the person you are talking to. Follow these steps in order. Read [README.md](README.md) first for what each part is.

**Ground rules**

- Never overwrite the user's config. Back up first, then **merge**. If one of their keys conflicts with this setup, ask before changing it.
- Ask every question with `AskUserQuestion` (multi-select where noted), recommended option first.
- Use `~` / `$HOME` paths. On Windows, run shell steps in **Git Bash** (the Bash tool), and use `cmd //c mklink /J` for directory links.
- **Never** install or wire up `autopush.js` and never create `~/.claude/.claude-setup-autopush`. Those are for the repo owner only; for anyone else they would auto-commit and try to push.
- If a step fails, say which step and why, skip only that part, carry on, and list it in the final report.
- Say what you're doing in one line per step.

Below, `$CS` means `~/.claude/claude-setup` and `$HOME_FWD` means the home directory with forward slashes (e.g. `C:/Users/alex` or `/Users/alex`).

---

## 1. Check requirements

Run and report versions:

```bash
claude --version   # need 2.1.296+ for mods
git --version
node --version     # need 18+; 22.20+ for `npx skills`
```

On Windows also confirm Git Bash is what the Bash tool runs. If `claude --version` is older, tell the user mods may not load and ask whether to continue without mods.

## 2. Ask what to install

One `AskUserQuestion` call, **multi-select**, all ticked by default (put "(Recommended)" on every item except PocketBase and bypass):

| Component | Installs |
|---|---|
| Mods | `mods/*` loaded via `sync.js` (step 5) |
| Own skill + commands | `/ui-build`, `/commit`, `/self-review`, `/ui-proto` |
| Third-party plugins | ponytail, i-have-adhd, glanceflow, filetree, ui-ux-pro-max (step 7) |
| Third-party skills | Matt Pocock skills + browser-use (step 8) |
| Skins | claude-skins + Windows patch (step 9) |
| Status line | `statusline/statusline.js` |
| Worktree hook | `hooks/worktree-merge-reminder.js` |
| Global CLAUDE.md | `global/CLAUDE.md` (step 10) |

A second call (single-select each):

1. **Permissions**: "Run tools without asking (`bypassPermissions`)? ⚠️ Claude will edit files and run commands without prompting." Options: *Keep my current mode (Recommended)* / *Bypass like the author*.
2. **PocketBase extras**: "Do you use PocketBase with a `pb_schema.json` in your repos?" Options: *No — leave pb-light off (Recommended)* / *Yes — enable pb-light + /pb-drift*.
3. **Preferences**: "Apply the author's preferences (effort medium, fullscreen TUI, workflows, push notifications)?" Options: *Yes (Recommended)* / *No, keep mine*.

If they untick some mods-level parts, a follow-up multi-select may list the 9 non-PocketBase mods (from README) so they can drop individual ones.

## 3. Back up

```bash
B=~/.claude/backups/claude-setup-$(date +%Y%m%d-%H%M%S); mkdir -p "$B"
for f in settings.json CLAUDE.md statusline.js; do [ -e ~/.claude/$f ] && cp ~/.claude/$f "$B/"; done
[ -d ~/.claude/commands ] && cp -r ~/.claude/commands "$B/commands"
echo "$B"
```

Tell the user the backup path. Uninstall uses it.

## 4. Clone

```bash
git clone https://github.com/LiamMorganDev/claude-setup.git ~/.claude/claude-setup
```

If `$CS` already exists and is this repo, `git -C ~/.claude/claude-setup pull` instead. If it exists and is something else, stop and ask.

## 5. Mods

Skip if Mods not picked.

1. Write the per-machine opt-out file `~/.claude/claude-setup.local.json` (never in the repo):
   - PocketBase = No → `{ "skipMods": ["pb-light"] }`
   - plus any mods they dropped in step 2, by folder name.
   - If nothing to skip, `{ "skipMods": [] }`.
2. Merge the `sync.js` SessionStart hook into settings (step 6 does this).
3. Run it once now so the env block is written: `node ~/.claude/claude-setup/sync.js < /dev/null`
4. Check `settings.json` → `env.CLAUDE_CODE_PLUGIN_DIRS` lists every chosen mod folder and `CLAUDE_CODE_PLUGIN_DIR_WATCH` is `"1"`.

The status line only shows a PocketBase light when pb-light is on; nothing else to do for it.

## 6. Merge settings

Read `$CS/global/settings.template.json`. Replace every `{{HOME}}` with `$HOME_FWD`. Then merge into `~/.claude/settings.json` (create `{}` if missing):

- **Objects** (`env`, `enabledPlugins`, `extraKnownMarketplaces`, `permissions`): add missing keys; for an existing key with a different value, keep theirs unless they agreed in step 2.
- **`hooks`**: per event, append each hook entry whose `command` isn't already present. Never remove their hooks.
- **Scalars** (`effortLevel`, `tui`, `enableWorkflows`, `agentPushNotifEnabled`): only if Preferences = Yes.
- **`permissions.defaultMode` + `skipDangerousModePermissionPrompt`**: only if Permissions = Bypass.
- **`_optional`**: merge each block only if picked — `statusline` (Status line; if they already have a `statusLine`, ask), `worktree-hook`, `skins` (handled in step 9), `windows-powershell` (Windows only, ask). Never write the `_optional` or `//` keys.
- Drop `enabledPlugins` / `extraKnownMarketplaces` entries for third-party plugins they didn't pick.
- Never add anything that runs `autopush.js`.

Validate the result parses as JSON before writing. Show the user a short summary of keys added/changed.

## 7. Third-party plugins

Skip any not picked. Run each pair (terminal CLI form; inside a session `/plugin marketplace add …` / `/plugin install …` is the same):

```bash
claude plugin marketplace add DietrichGebert/ponytail      && claude plugin install ponytail@ponytail
claude plugin marketplace add ayghri/i-have-adhd           && claude plugin install i-have-adhd@i-have-adhd
claude plugin marketplace add Antreas-Strb/glanceflow      && claude plugin install glanceflow@claude-mods
claude plugin marketplace add data-goblin/claude-code-filetree && claude plugin install filetree@claude-code-filetree
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill && claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

The ui-ux-pro-max plugin provides `ui-ux-pro-max`, `ui-styling`, `design`, `design-system`, `brand`, `banner-design`, `slides`. If the user already has standalone copies of these in `~/.claude/skills/`, tell them they'll load twice and ask whether to remove the standalone copies.

`/ui-build` needs ponytail, grill-me (step 8), ui-ux-pro-max and ui-styling. If any of those were skipped, warn that `/ui-build` will be missing steps.

## 8. Third-party skills

Skip if not picked. These are copied into `~/.claude/skills/` from their upstream repos (never from this repo).

**Matt Pocock skills** ([mattpocock/skills](https://github.com/mattpocock/skills), MIT) — only these:
`grilling grill-me wayfinder research prototype tdd diagnosing-bugs code-review setup-matt-pocock-skills`

With Node 22.20+ (check flag syntax with `npx skills@latest add --help` first):

```bash
npx -y skills@latest add mattpocock/skills -g -a claude-code -y --skill grilling grill-me wayfinder research prototype tdd diagnosing-bugs code-review setup-matt-pocock-skills
```

Fallback (any Node, any OS):

```bash
T=$(mktemp -d) && git clone -q --depth 1 https://github.com/mattpocock/skills.git "$T/mp"
for s in grilling grill-me wayfinder research prototype tdd diagnosing-bugs code-review setup-matt-pocock-skills; do
  src=$(find "$T/mp/skills" -mindepth 2 -maxdepth 2 -type d -name "$s" | head -1)
  [ -n "$src" ] && rm -rf ~/.claude/skills/$s && cp -r "$src" ~/.claude/skills/$s || echo "MISSING $s"
done
```

Report any `MISSING` (upstream may have renamed it; search the repo and tell the user).

**browser-use** ([browser-use/browser-use](https://github.com/browser-use/browser-use), MIT) — needs [`uv`](https://docs.astral.sh/uv/). Follow the repo's current README for the CLI install, then `browser-use skill install`. If `uv` is missing, ask whether to install it or skip browser-use.

## 9. Skins

Skip if not picked.

```bash
T=$(mktemp -d) && git clone -q --depth 1 https://github.com/basicScandal/claude-skins.git "$T/cs" && bash "$T/cs/install.sh"
```

Then make it match this setup:

1. **Windows only:** `bash ~/.claude/claude-setup/skins/windows/apply.sh`
2. In `settings.json`, upstream added hooks without a `bash` prefix, a `PostToolUse` `skin-tool-hook.sh` entry and its own `statusLine`. Replace its `SessionStart`/`SessionEnd` skin hooks with the `_optional.skins` entries from the template, remove the `skin-tool-hook.sh` entry, and if Status line was picked set `statusLine` back to `statusline/statusline.js`.
3. If `install.sh` fails at its Python step (no `python3`, common on Windows), do step 2's edits yourself — the files are already copied.
4. Ask which skin to default to (recommend `dracula`, which matches the dracula-skin mod), then `bash ~/.claude/skins/engine/activate.sh <name>` and set `default_skin: <name>` in `~/.claude/skins/engine/config.yaml`.

## 10. Own skill, commands, CLAUDE.md

**Skill + commands** (if picked). Link, so `git pull` updates them:

- macOS/Linux: `ln -s ~/.claude/claude-setup/skills/ui-build ~/.claude/skills/ui-build`
- Windows: `cmd //c "mklink /J %USERPROFILE%\.claude\skills\ui-build %USERPROFILE%\.claude\claude-setup\skills\ui-build"`
- Commands: if `~/.claude/commands` doesn't exist, link the whole folder the same way. If it exists, link (macOS/Linux) or copy (Windows) each `commands/*.md` file in, asking before replacing a file with the same name.
- If PocketBase = No, still install `/commit` (its PocketBase step only runs when a repo has `pb_schema.json`), but skip `pb-drift.md`.
- `/commit` writes `CHANGELOG.md`, bumps `package.json` and never adds a Claude co-author. Mention this so they're not surprised.

**Global CLAUDE.md** (if picked):

1. Take `$CS/global/CLAUDE.md`. Remove the leading `<!-- claude-setup … -->` comment.
2. For each `<!-- optional:X -->…<!-- /optional:X -->` block: keep the content if X was installed (`mods` → Mods, `worktrees` → Worktree hook, `ponytail`/`adhd`/`ui-ux-pro-max` → that plugin, `browser-use` → that skill), else delete the block. Remove the marker lines either way.
3. If `~/.claude/CLAUDE.md` doesn't exist, write it. If it does, show the user the sections that would be added and ask: *Append (Recommended)* / *Replace* / *Skip*.

## 11. Verify

1. `node -e "JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude/settings.json','utf8'))"` — settings parse.
2. `node ~/.claude/claude-setup/sync.js < /dev/null` exits 0.
3. Status line: `echo '{"model":{"display_name":"Test"},"cwd":"'$HOME_FWD'/.claude/claude-setup","context_window":{"remaining_percentage":80}}' | node ~/.claude/claude-setup/statusline/statusline.js` prints a line.
4. `ls ~/.claude/skills` shows the installed skills; `ls ~/.claude/commands` shows the commands.
5. `claude plugin list` shows the third-party plugins enabled.

Then tell the user to **start a new session** (mods, hooks and plugins load at session start) and try: `/monitor`, `/git-panel`, `/wins`, `/skin`, `/ui-build`, `/commit`.

## 12. Report

Short list: what was installed, what was skipped and why, anything that failed, the backup path, and the one next step (start a new session).

---

## Update

```bash
node ~/.claude/claude-setup/update.js
```

It pulls (fast-forward only; stops if you have local changes) and tidies what the pull left behind: leftover folders of deleted mods, dead skill/command links, copied commands (updated only where you haven't edited them; new ones added, deleted ones removed), and settings hooks / status line pointing at files that no longer exist (`settings.json` backed up first). It re-runs `sync.js` and lists anything in `global/` that changed. Start a new session after. Then refresh third-party parts:

```bash
claude plugin marketplace update
for p in ponytail@ponytail i-have-adhd@i-have-adhd glanceflow@claude-mods filetree@claude-code-filetree ui-ux-pro-max@ui-ux-pro-max-skill; do claude plugin update "$p"; done
```

Re-run step 8 for Matt Pocock skills and step 9 for skins (re-apply the Windows patch after). If `global/CLAUDE.md` or the settings template changed (`git log -p -- global/`), offer to re-merge those changes.

## Uninstall

1. Restore `settings.json` and `CLAUDE.md` from the backup folder made in step 3 (ask first — they may have changed things since; offer to remove only this setup's keys instead).
2. Remove links: `~/.claude/skills/ui-build`, `~/.claude/commands` (or the individual linked files). On Windows remove a junction with `cmd //c rmdir <path>` — **never** a recursive delete, which would follow the link into the repo.
3. `claude plugin uninstall` each third-party plugin they no longer want.
4. Remove the skill folders copied in step 8. Skins: run the upstream `uninstall.sh`.
5. Delete `~/.claude/claude-setup.local.json` and the `~/.claude/claude-setup` clone.
