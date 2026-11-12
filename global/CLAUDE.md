- When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.
- When committing, never add Claude as co-author. Only use me as author.

## Cross-project defaults

These apply to any repo unless its own CLAUDE.md overrides them.

- **Docs are source of truth.** If a repo has a `docs/` dir, check it before making changes. If a change affects anything documented there (architecture, API contracts, setup, env vars, workflows), update the relevant doc in the same change.
- **`.env`/`.env.example` stay structurally identical.** New vars go under a `# ─── Section Name ───` header with an inline comment explaining what it is / where to get it. Same section, same order, same comments in both files — only real values differ.
- **Schema/type/validation stay in lockstep.** If a repo defines a DB schema, generated/hand-written types, and a validation layer (Zod, etc.) for the same data, a change to one means updating all of them in the same change — never partially.
- **Quality gate before "done."** Before reporting a task complete, run whatever the repo has of typecheck / lint / test / build, and fix failures in changed files. Don't claim success on unverified code.
- **Need Docker? Run `pwsh -File ~/.claude/scripts/docker-up.ps1`** (run it in the background, it can take ~1–3 min). Never launch `Docker Desktop.exe` and poll by hand. It's a no-op if the engine is up; otherwise it kills a crashed Docker Desktop, moves aside the dead socket folders that break every restart (`%LOCALAPPDATA%\Docker\run`, `%LOCALAPPDATA%\docker-secrets-engine` — the "remove …dockerInference / engine.sock: The file cannot be accessed by the system" crash dialog), runs `docker desktop start` and waits. Still failing → read `%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log` and tell me the error.
- **Always use AskUserQuestion for any question I need to answer** (decisions, clarifications, "want me to…?" offers) — never ask in plain text.
- **Prototype non-trivial UI/UX changes as an Artifact first.** For a new layout, a visual rework, or anything where "the look is the point," mock it up as an interactive Artifact and get explicit user approval before writing component code.
- **The approved mock is the spec — build it exactly.** Every element the mock shows (layout, cards vs plain lists, descriptions, extra rows, order of items, badges) must appear the same in the real component. Before calling UI work done, open the mock next to the running app, compare each element and list any difference. A difference is only allowed if I approved it first (AskUserQuestion), never as a silent "simpler" version.
- **UI changes only: every handback includes a UI-change summary + screenshots.** Applies when the work changes anything a user sees or interacts with: components, pages, layouts, styling/CSS, copy, responsive behaviour, UI states (loading/empty/error). Skip for backend-, test-, config- or docs-only changes. Before reporting UI work done:
  1. **Summarise** what changed on each screen/tab/component: new, moved, removed or restyled.
  2. **Run the app** with the repo's own dev command (check `package.json` scripts / README / `docs/`). Log in with seed/test credentials from the repo if needed.
  3. **Capture BEFORE shots first** — before the first UI edit, screenshot every area you're about to change on the unchanged code. Forgot? Capture them from the base branch in a temp `git worktree` (never bare `git stash` — the stash stack is shared across worktrees/sessions), never from memory or a mock.
  4. **Capture matching AFTER shots** of the same areas. Each before/after pair must match exactly: same URL/route, viewport, theme, data/record, UI state and scroll position, so the only difference is the change. Brand-new screens: say "before: n/a (new)" and show the spot it's reached from. Capture every shot of an area in one run with nothing else writing data (no QA/tests running), so rows/records are identical across shots.
     - **New state or control** (toggle, filter, switch, expanded/collapsed): besides before/after, show the new control **off and on** as its own pair (e.g. "switch off" / "switch on"), and make sure the effect is visible in frame (widen the viewport or pick a view where the affected column/badge shows). The caption says which state matches the old behaviour (e.g. "Before = switch on: archived always shown").
     - **Behaviour/interaction change** (what happens after a click or typing, e.g. a value moving rows): show it as a short step sequence (step 1 starting state → step 2 action → step 3 result), each step as a before/after pair, cropped to the affected component, with the changed value highlighted (a dashed blue outline, never red, labelled in the caption as added for the screenshot).
     - **Approved mock exists?** Also compare the AFTER shots against it and list any difference (see "approved mock is the spec").
  5. **Viewports:** **desktop (~1440px)** and **mobile (~390px)**, light mode only (no dark-mode shots) — each as a before/after pair. Capture with whatever is available, in this order: the built-in browser pane (`resize_window` presets + `computer screenshot`) → `browser-use` CLI → a one-off Playwright script (`npx playwright screenshot --viewport-size=390,844 <url> out.png`, or `page.setViewportSize` + `page.screenshot({ fullPage: true })`). Reset the pane to `desktop` preset when done. Name them `<area>-<viewport>-before.png` / `-after.png` and save to a scratch/temp folder, not the repo.
  6. **Show them to me via the Artifact** — never only file paths. Publish one private Artifact page (Artifact tool, images via its `files` map) with one section per area: BEFORE beside AFTER (stacked on phones), a Desktop / Mobile switch, a title per area and one line on what to look at, images opening full-screen in an in-page viewer (not new-tab links, which claude.ai blocks); off/on pairs use their own labels instead of before/after; give me the link. Don't also send the images into chat (no SendUserFile); the Artifact is enough. Only if the Artifact can't be published, link the file paths as a before/after table.
  7. **Can't run the app?** (missing env/DB/creds, build broken) Say so explicitly and say why. Never skip screenshots silently.
- **Mods live in `~/.claude/claude-setup/mods/<mod>/`.** When a mod built via the plugin-authoring skill works (validate + tests pass), move it from the session's `dev-mods` folder into `~/.claude/claude-setup/mods/` and delete the dev copy. A SessionStart hook (`claude-setup/sync.js`) lists every mod there in `CLAUDE_CODE_PLUGIN_DIRS` (+ `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`) in `~/.claude/settings.json`'s `env`, so every session (Desktop, VS Code, terminal) loads them straight from disk and hot-reloads edits (no install, no version bump needed; a brand-new mod folder loads from the next session). It uninstalls any `@claude-setup` installed copy to avoid double-loading, installs any plugin enabled in `settings.json` that isn't installed yet, links `agents/`, `commands/` and my own skills into `~/.claude`, and re-enables any a project turns off (via its `settings.local.json`). It also strips `disable-model-invocation: true` from every `~/.claude/skills/*/SKILL.md` so Claude can always see and call every global skill.
- **`~/.claude/claude-setup/` is the public repo `LiamMorganDev/claude-setup`.** `claude-setup/autopush.js` (Stop + SessionStart hooks, owner-only: needs `~/.claude/.claude-setup-autopush`) auto-commits any change with a generated message and pushes — don't commit/push it by hand. It is a mirror of my whole setup across my devices: on SessionStart it pulls, and every run `mirror.js` syncs `~/.claude/CLAUDE.md`, `settings.json` (home path → `{{HOME}}`), `scripts/`, the `/skin` skill, the third-party skill list (`global/skills.json`) and third-party mod list (`global/mods.json`) both ways (whichever side changed since the last sync wins; both changed → this machine wins). So edit the live files normally; never edit the repo copies under `global/` by hand. It is public: never put secrets, client names or private paths in it, and never add a Claude co-author. Only my own mods go in it: a third-party mod in `mods/` (own `.git`, e.g. `filetree`) is auto-added to `.gitignore`; one without a `.git` must be added there manually before it's pushed.
- **"Commit" in a finished worktree = commit, merge into `main`, delete the worktree.** When I ask you to commit work done in a worktree, don't stop at the branch commit: commit on the branch, merge it into `main` (in the main checkout, resolving conflicts; re-run the quality gate on `main`), commit the merge, then clean up per the rule below. Only push `main` if I asked for a push.
- **Worktree merged into `main` → delete the worktree.** Once a worktree's branch is merged into `main` and pushed (a reminder hook fires on that push): leave the worktree session first (ExitWorktree), make sure it has no uncommitted/unpushed work, **remove any `node_modules` junction/symlink first** (`cmd /c rmdir node_modules`, never a recursive delete, which would follow it into the main checkout) and copied `.env`, then `git worktree remove <path>` and `git branch -d <branch>`. Do NOT align live PocketBase on a `main` push.
- **`release` pushed → live DB is synced in the app, not by Claude.** Never align live PocketBase from a session. After a push to `release` (a reminder hook fires) in a repo with a `pb_schema.json`, tell me to sync it after the deploy from the app's own schema screen (e.g. Settings → System → Database schema).
- **Context getting high → write a handoff plan.** When I say context is high, or the conversation reaches **~500k tokens used while mid-task** (don't wait for the hard limit), stop at the next safe point and write `<TASK>_HANDOFF.md` in the session's folder (worktree root), marked "do not commit — delete before committing". It must let a fresh agent continue cold:
  1. **Where it stands**: what's built, what's verified (exact gate results), what's uncommitted, branch/worktree path, and the docs/mock/memory that are the spec (with links), plus every decision I already made.
  2. **Running environment**: containers/ports/volumes, temp launch configs, seed scripts, scratch scripts and screenshot folders (full paths), and how to restart them.
  3. **Remaining steps**: numbered, each concrete (files, commands, what "done" looks like), including open questions to ask me, cleanup, commit/merge, and post-release steps.
  4. **Not verified / risks**, and follow-ups worth proposing.
  Then end the turn with the next-step box offering to start a new session from the plan. Don't keep working past that point.
- **Offer multiple options in artifacts/prototypes.** When building an Artifact or prototype, present 2+ alternative solutions/designs to pick from rather than a single option, unless the user has already specified exactly what they want. Keep the option controls floating (sticky side panel on desktop, collapsible bottom sheet on phones) so every pick's effect is visible without scrolling. Options that only show in one state (a status, a guest view) switch the preview to that state when picked. **Every pick shows what it changed:** it first puts the preview into the state that displays that decision (page/view, desktop/phone, data/fill state, wizard step, open dialog or row), then outlines every area the decision affects with a labelled blue dashed box (e.g. "4. Progress position: B"), shows a one-line "decision → option · showing <state>" strip above the preview, and reveals the first affected area without jarring: scroll only the preview frame (never the outer page), only when the area is out of view, by the smallest distance that clears sticky bars and the label; jump instantly when the pick switched view/screen/step/state, scroll smoothly otherwise (instant under reduced motion); a single quick outline fade-in, no pulsing. Always include a "Copy my picks" button (decision → option letter + name, plain text to paste into chat).

## Agent team

For any non-trivial build (more than one area, or more than ~3 files), the main session is the **principal-engineer**: read `~/.claude/agents/principal-engineer.md` and its memory (`~/.claude/agent-memory/principal-engineer/MEMORY.md`) and follow it. It delegates to `researcher`, `ux-designer`, `frontend-engineer`, `backend-engineer`, `code-reviewer`, `qa-tester`, `docs-keeper` and `devops`, relays their questions to me (they can't ask me), loops QA/review feedback to the same agent (max 2 rounds, then me), hands agreed plans to fresh sessions (one per slice), and records what I correct into each agent's memory. Quick edits and questions stay in the main session.

## Always-on skills

Apply these in every project, every session, without being asked:

- **ponytail** — always active (SessionStart hook). Smallest complete change; end replies with what was skipped/unchecked + risks. Use `ponytail:ponytail-review` for reviews and `ponytail:ponytail-audit` for whole-repo audits.
- **i-have-adhd** — always active (SessionStart hook). Lead with the next action, numbered steps, restate state, end with one concrete next step.
- **ui-ux-pro-max** — invoke via Skill before designing, building, reviewing or fixing ANY UI (pages, components, layouts, styling, colour, typography, a11y, charts, artifacts/prototypes). A repo's own style guide (e.g. `docs/STYLE_GUIDE.md`) and component library still win on conflicts.
- **browser-use** — the default for any browser work: verifying UI changes in a running app, screenshots, scraping, form/flow testing, checking deployed sites. Use it (CLI `browser-use`) before reaching for Playwright scripts. Built-in browser pane tools remain fine for quick dev-server previews, and come first for UI-handback screenshots (see above).

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
