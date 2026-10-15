You are performing a critical self-review of the most recent work done in this session. Follow every step below without skipping.

---

## Step 1 — Understand what was changed

Run these commands to get a full picture of the work:

```sh
git diff HEAD~1 HEAD --stat
git diff HEAD~1 HEAD
git log --oneline -5
```

Also read any files that were modified but not yet committed (unstaged/staged changes):

```sh
git status
git diff
git diff --cached
```

Read every changed file in full — do not skim. Your review is only as good as your understanding of the actual code.

---

## Step 2 — Critical review checklist

For **every changed file**, work through this checklist. Be harsh. Assume something is wrong until you prove it isn't.

### Correctness
- [ ] Does the logic actually do what it was intended to do?
- [ ] Are there off-by-one errors, wrong comparisons, or inverted conditions?
- [ ] Are all code paths handled? (null/undefined, empty arrays, missing fields)
- [ ] Are there any race conditions or async mishandlings (missing await, unhandled Promise)?
- [ ] Are database queries correct — correct table, correct filters, no accidental full-table ops?

### Completeness
- [ ] Were all parts of the task actually implemented, or was anything silently skipped?
- [ ] Are there TODO/FIXME/placeholder comments left in?
- [ ] Does every new UI surface have demo data (check `apps/api/src/` for demo seed logic)?
- [ ] Were shared types updated in `packages/types/src/index.ts` if new shapes were introduced?
- [ ] Were Zod schemas added to `packages/types/src/schemas.ts` for any new POST/PATCH body?

### Style guide compliance (for frontend changes)
- [ ] All card surfaces use `<MagicCard>`, not plain `<div>` with border/bg
- [ ] All key monetary values use `<NumberTicker>`
- [ ] All percentages/progress use `<AnimatedCircularProgressBar>`
- [ ] `<BorderBeam>` only on the single hero card per page
- [ ] Brand gradient is `linear-gradient(135deg, #8be9fd, #50fa7b)` — cyan to green
- [ ] Button gradient is `linear-gradient(135deg, #00BCD4, #4CAF50)` — do not mix with brand gradient
- [ ] Monetary values use `formatCurrency()` and `tabular-nums`
- [ ] Positive = `text-[#50fa7b]`, negative = `text-[#ff5555]`, warning = `text-[#ffb86c]`
- [ ] Icons are Lucide React only
- [ ] All pages start with `<Header title="..." />` and wrap content in `<div className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-6">`

### Mobile responsiveness (for frontend changes)
- [ ] Padding is `p-4 sm:p-6`, never bare `p-6`
- [ ] Grids start at `grid-cols-1` and scale up
- [ ] Large text scales: `text-3xl sm:text-5xl`
- [ ] Tables wrapped in `<div className="overflow-x-auto">`
- [ ] Dropdowns/panels use `w-[calc(100vw-2rem)] sm:w-80`

### API / backend changes
- [ ] Routes use `authMiddleware` and `c.get("userId")` correctly
- [ ] Input is validated with `@hono/zod-validator`
- [ ] IDs are `nanoid()` strings, not integers
- [ ] New routes are mounted via `.route()` chaining on the `api` const in `index.ts` (not `api.route()`)
- [ ] The Vantage/homepage endpoints (`/api/vantage/ping`, `/api/homepage/stats`) are untouched

### Security
- [ ] No SQL injection vectors (parameterised queries only via Drizzle)
- [ ] No XSS vectors in rendered output
- [ ] No secrets or credentials hardcoded
- [ ] No user-controlled input used unsanitised in shell commands or file paths

---

## Step 3 — Fix everything found

For each issue found:
1. Fix it directly in the file — do not leave fixme notes
2. Run the repo's lint/format fix command, if it has one (check `package.json` scripts / CLAUDE.md)
3. Run the repo's typecheck command(s)
4. Run the repo's test and build command(s)
5. Fix any errors produced by the above before continuing
6. If any UI changed: re-check it against the `ui-ux-pro-max` skill, then verify it in the running app with the `browser-use` skill (screenshot as proof)

Do not stop until all of the above exit cleanly.

---

## Step 4 — Produce the review summary

Output a structured report in this exact format:

---

### Self-Review Summary

**Scope:** [list of files reviewed]

**Issues Found & Fixed**

| # | File | Old behaviour / problem | New behaviour / fix | Why it mattered |
|---|------|------------------------|---------------------|-----------------|
| 1 | ... | ... | ... | ... |

*(If no issues were found, write: "No issues found — all checklist items passed.")*

**Checklist items that could not be verified automatically** *(e.g. demo data requires running the app)*

- ...

**Build & lint status**
- `pnpm lint:fix`: ✅ / ❌
- `pnpm typecheck (api)`: ✅ / ❌
- `pnpm typecheck (web)`: ✅ / ❌
- `pnpm build (web)`: ✅ / ❌
- `pnpm build (api)`: ✅ / ❌

---

Do not declare the review complete until every build and typecheck passes cleanly.
