---
description: Read-only check of live PocketBase vs pb_schema.json (no pushes)
---
Compare the **live PocketBase** schema to the repo's `pb_schema.json`. **Read-only**: never PATCH/POST/DELETE anything, never edit `pb_schema.json`.

1. If there's no `pb_schema.json` at the repo root, say so and stop.
2. Read `POCKETBASE_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` from `.env`. Never print their values.
3. Use a scratch script (e.g. `.pb-drift.cjs`) to auth as superuser (`/api/collections/_superusers/auth-with-password`, falling back to `/api/admins/auth-with-password`), then fetch `/api/collections?perPage=200`. Delete the script after.
4. Compare **semantically, per collection by `name`**: fields keyed by field `name` (ignore field `id`s, key order and array order), plus `type`, rules (`listRule`/`viewRule`/`createRule`/`updateRule`/`deleteRule`), `indexes`, and options (`viewQuery` etc.). Only report differences that survive normalisation.
5. Report tersely, grouped:
   - **Repo ahead** (would be pushed by `/commit` on main): new collections/fields, changed rules/indexes/options.
   - **Live ahead** (repo drift — don't touch, ask me which side is right): fields/collections only on live.
   - **Destructive if pushed**: drops or type narrowing, with live record counts.
   - Or: "In sync."
6. Also check `shared/types/collections.ts` and `shared/schemas/` match `pb_schema.json`, and list any mismatches. Don't edit them.
