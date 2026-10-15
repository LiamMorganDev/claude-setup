<!-- claude-setup: global CLAUDE.md template. INSTALL.md copies this to ~/.claude/CLAUDE.md
     (or appends it to an existing one). Blocks between `optional:` markers are only kept if the
     installer picked that component; the markers themselves are removed on install. -->

## Communication

- When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.
- When committing, never add Claude as co-author. Only use me as author.

## Cross-project defaults

These apply to any repo unless its own CLAUDE.md overrides them.

- **Docs are source of truth.** If a repo has a `docs/` dir, check it before making changes. If a change affects anything documented there (architecture, API contracts, setup, env vars, workflows), update the relevant doc in the same change.
- **`.env`/`.env.example` stay structurally identical.** New vars go under a `# ─── Section Name ───` header with an inline comment explaining what it is / where to get it. Same section, same order, same comments in both files — only real values differ.
- **Schema/type/validation stay in lockstep.** If a repo defines a DB schema, generated/hand-written types, and a validation layer (Zod, etc.) for the same data, a change to one means updating all of them in the same change — never partially.
- **Quality gate before "done."** Before reporting a task complete, run whatever the repo has of typecheck / lint / test / build, and fix failures in changed files. Don't claim success on unverified code.
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
<!-- optional:mods -->
- **Mods live in `~/.claude/claude-setup/mods/<mod>/`.** When a mod built via the plugin-authoring skill works (validate + tests pass), move it from the session's `dev-mods` folder into `~/.claude/claude-setup/mods/` and delete the dev copy. A SessionStart hook (`claude-setup/sync.js`) lists every mod there in `CLAUDE_CODE_PLUGIN_DIRS` (+ `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`) in `~/.claude/settings.json`'s `env`, so every session (Desktop, VS Code, terminal) loads them straight from disk and hot-reloads edits (no install, no version bump needed; a brand-new mod folder loads from the next session). Mods named in `~/.claude/claude-setup.local.json` `skipMods` are not loaded.
<!-- /optional:mods -->
<!-- optional:worktrees -->
- **"Commit" in a finished worktree = commit, merge into `main`, delete the worktree.** When I ask you to commit work done in a worktree, don't stop at the branch commit: commit on the branch, merge it into `main` (in the main checkout, resolving conflicts; re-run the quality gate on `main`), commit the merge, then clean up per the rule below. Only push `main` if I asked for a push.
- **Worktree merged into `main` → delete the worktree.** Once a worktree's branch is merged into `main` and pushed (a reminder hook fires on that push): leave the worktree session first (ExitWorktree), make sure it has no uncommitted/unpushed work, **remove any `node_modules` junction/symlink first** (Windows: `cmd /c rmdir node_modules`; macOS/Linux: `rm node_modules`, never a recursive delete, which would follow it into the main checkout) and copied `.env`, then `git worktree remove <path>` and `git branch -d <branch>`.
<!-- /optional:worktrees -->
- **Offer multiple options in artifacts/prototypes.** When building an Artifact or prototype, present 2+ alternative solutions/designs to pick from rather than a single option, unless the user has already specified exactly what they want.

## Always-on skills

Apply these in every project, every session, without being asked (each is installed by INSTALL.md):

<!-- optional:ponytail -->
- **ponytail** — always active (SessionStart hook). Smallest complete change; end replies with what was skipped/unchecked + risks. Use `ponytail:ponytail-review` for reviews and `ponytail:ponytail-audit` for whole-repo audits.
<!-- /optional:ponytail -->
<!-- optional:adhd -->
- **i-have-adhd** — always active (SessionStart hook). Lead with the next action, numbered steps, restate state, end with one concrete next step.
<!-- /optional:adhd -->
<!-- optional:ui-ux-pro-max -->
- **ui-ux-pro-max** — invoke via Skill before designing, building, reviewing or fixing ANY UI (pages, components, layouts, styling, colour, typography, a11y, charts, artifacts/prototypes). A repo's own style guide (e.g. `docs/STYLE_GUIDE.md`) and component library still win on conflicts.
<!-- /optional:ui-ux-pro-max -->
<!-- optional:browser-use -->
- **browser-use** — the default for any browser work: verifying UI changes in a running app, screenshots, scraping, form/flow testing, checking deployed sites. Use it (CLI `browser-use`) before reaching for Playwright scripts. Built-in browser pane tools remain fine for quick dev-server previews, and come first for UI-handback screenshots (see above).
<!-- /optional:browser-use -->
