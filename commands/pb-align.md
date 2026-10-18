---
description: Align live PocketBase to the repo's pb_schema.json (repo → live). Run after a push to `release`.
---
Run after a push to the `release` branch (i.e. a production release), never on a commit or a push to `main`. If there's no `pb_schema.json` at the repo root, say so and stop.

Align the **live PocketBase to the `release` branch's `pb_schema.json`** (repo → live; `git show origin/release:pb_schema.json` if the checkout isn't on `release`). `pb_schema.json` is the source of truth; NEVER overwrite it from live.
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
