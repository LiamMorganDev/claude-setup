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
- [ ] If the repo seeds demo data, does every new UI surface have some?
- [ ] Were shared types and validation schemas (Zod etc.) updated for any new data shapes or request bodies?

### Repo conventions
- [ ] Read the repo's own rules first (`CLAUDE.md`, `docs/`, style guide, `CONTRIBUTING.md`) and check every changed file against each one: components, colours, icons, layout, naming, API patterns, auth, ID format, routing.
- [ ] Frontend: works at phone width (no fixed widths that overflow, tables scroll, grids start at one column).
- [ ] Backend: routes use the repo's auth and input validation; nothing documented as untouchable was changed.

### Security
- [ ] No SQL injection vectors (parameterised queries / the repo's query builder only)
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

**Build & lint status** (one line per command the repo has)
- `<lint command>`: ✅ / ❌
- `<typecheck command>`: ✅ / ❌
- `<test command>`: ✅ / ❌
- `<build command>`: ✅ / ❌

---

Do not declare the review complete until every build and typecheck passes cleanly.
