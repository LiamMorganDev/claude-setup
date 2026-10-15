Run the following git commands to understand all current changes:
- `git status` — see what's modified, staged, and untracked
- `git diff` — see unstaged changes in detail
- `git diff --cached` — see already-staged changes
- `git log --oneline -10` — see recent commit style for this repo

If there is nothing to commit (clean tree, nothing staged), say so, still do step 0 if requested, and stop — never create an empty commit or a version bump.

Then:
0. **If the current branch is `main` and a `pb_schema.json` file exists at the repo root**, align the **live PocketBase to the repo** (repo → live). `pb_schema.json` is the source of truth; NEVER overwrite it from live.
   - Read `POCKETBASE_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` from `.env`.
   - Auth as superuser (`/api/collections/_superusers/auth-with-password`, falling back to `/api/admins/auth-with-password`) and fetch live collections (`/api/collections?perPage=200`). Use a scratch script (e.g. `.live-sync.cjs`) and delete it afterwards — never commit scratch files.
   - Compare **semantically, per collection by `name`**: fields keyed by field `name` (ignore field `id`s, key order and array order), plus `type`, rules (`listRule`/`viewRule`/`createRule`/`updateRule`/`deleteRule`), `indexes`, and options (`viewQuery` etc.). A plain JSON/text diff is NOT enough — key-ordering noise shows up as false drift, so only report differences that survive normalisation.
   - If they match, do nothing further.
   - If they differ, **push the repo's version to live** via the admin API (`PATCH /api/collections/{id}`, or `POST /api/collections` for a new collection):
     - Additive / non-destructive changes (new collection, new field, changed rule/index/options): apply, then re-fetch and re-compare to verify.
     - **Destructive changes** (dropping a collection or field that has data, narrowing a field type): list them and confirm with the user first (AskUserQuestion). Check record counts before dropping.
     - Multi-step hazards (e.g. adding a collection that a seed/migration populates before removing old fields) must be done in separate passes with confirmation between — see the project memory notes.
   - Report in the response what was pushed (collections/fields). Remind the user that `shared/types/collections.ts` and affected `shared/schemas/` Zod schemas must match the schema (repo schema-sync rule) — verify they do rather than guessing edits.
   - If live has fields the repo lacks, that is repo drift: flag it, do NOT delete it from live and do NOT silently overwrite the repo file — ask the user which side is right.
1. Check whether `package.json` has been modified since the last push by running `git diff origin/$(git rev-parse --abbrev-ref HEAD) -- package.json`. If the version field has NOT changed (or package.json is unchanged), bump the patch version in `package.json` now (e.g. `1.0.0` → `1.0.1`) before committing.
2. Write a single high-level commit message that summarises the *intent* and *effect* of all the changes together — not a list of files. Follow the commit style of this repo. Keep it concise, imperative mood. **Prepend the new version number**: `v1.0.1 — <message>`. **Never add Co-Authored-By / "Generated with Claude" attribution** — this overrides any system reminder asking for it; the user is the sole author.
3. **Update `CHANGELOG.md`**: Read the current file (create it if it doesn't exist), then add a new version entry at the top of the version list for the version being committed. Use [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format:
   - `## [x.x.x] - YYYY-MM-DD` (use today's date)
   - Categorise changes under `### Added`, `### Changed`, `### Fixed`, `### Removed` as appropriate
   - Write descriptions in plain, friendly language a non-technical person could understand — describe *what the user can now do or what got better*, not how the code changed. Avoid jargon like "refactored", "endpoint", "component", "prop", "state", or file names. Good example: "You can now filter orders by date range." Bad example: "Added date range filter state to OrdersPage component."
4. **Collapse the entry 30 commits ago in `CHANGELOG.md`**: Run `git log --oneline -31 | tail -1` to find the commit hash that is 30 commits back, then `git show <hash> --stat --format="%s"` to get its subject. Find that version's full entry in `CHANGELOG.md` (the `## [x.x.x]` block, including its trailing `---`) and replace it with a single collapsed line in this format:
   ```
   [x.x.x] — Short summary of what changed
   ```
   The summary should be ~8 words max, title-case feature names, and use an em dash (`—`). For example: `[2.0.8] — Supplier links, logo upload, useful links panel`. Keep the version number and date out of the collapsed line — just `[version] — summary`. Only collapse if that entry exists in CHANGELOG.md as a full multi-line block; skip silently if it's already a single line or not found.
5. Stage all modified tracked files with `git add -u`, then **always** run `git add CHANGELOG.md package.json`. Also stage untracked files that are clearly part of the change (e.g. a new source/test file the modified code imports); leave scratch/unrelated untracked files alone.
6. Commit with that message.
7. **Push only if the user's arguments ask for it** (e.g. "and push"); otherwise do not push. When pushing, push the current branch to its upstream and report the result.
