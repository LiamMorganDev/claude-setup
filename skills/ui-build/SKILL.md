---
name: ui-build
description: Full UI workflow (grill feature + UI requirements → design guidance → prototype — in-app when the repo has docs/PROTOTYPES.md, else an Artifact — with many options per design decision → agreement → a self-contained build plan + ready-to-paste prompt for a fresh agent, optionally spawned as a new session). Use whenever the user wants to build, add, redesign, rework, restyle, mock up or prototype any UI — a page, screen, tab, component, layout, form, dashboard, modal or flow — or says "ui build", "ui-build", "/ui", "build the UI", "design this", "make it look better", "new page", "mock it up". Use it even when they don't name the skill.
argument-hint: <what UI to change/build>
---

Task: $ARGUMENTS

If the task above is empty, take it from my latest message (or ask me with AskUserQuestion).

This skill designs and plans; it does **not** write component code. The build happens in another chat from the plan it produces.

Invoke each of these with the Skill tool, in this order, passing the task as `args`. Load each one fully and follow it; later steps build on earlier ones. If a skill is missing, say so in one line and carry on with the next.

1. `ponytail:ponytail` — keep the eventual code change minimal (this does NOT limit the number of design options below).
2. `grilling` — interview me (AskUserQuestion) about **both** the feature and the UI until both are clear. Don't move on until I say we're done. Cover:
   - **Feature requirements:** what it does, who uses it, data it reads/writes (collections, fields, new schema?), API/procedures needed, permissions/roles, edge cases, validation, states (loading/empty/error), what's out of scope.
   - **UI requirements:** where it lives / how it's reached, what's on screen, devices (mobile/desktop), interactions, copy.
   Read the relevant code and repo docs (`docs/`, style guide) first so you only ask what the code can't answer.
3. `ui-ux-pro-max` — style, palette, typography and UX guidance for what came out of the grilling.
4. `ui-styling` — shadcn/ui + Tailwind patterns to apply.
5. **Prototype** — pick the mode (next section), then build the options using all of the above.
   - **Artifact mode:** `ui-proto` — build the Artifact prototype (design decisions below). Follow its prototyping steps only; skip its "implement" and "compare mock vs app" steps — here they go into the build plan for the next agent. Do not write component code.
   - **In-app mode:** don't build an Artifact. Write a *prototype build plan* instead (see "In-app prototypes").

## Prototype mode: in-app first, Artifact fallback

If the repo has an in-app prototypes area — a `docs/PROTOTYPES.md` (read it fully; it is the source of truth for how prototypes are built there) — **always** use **in-app mode**, never an Artifact (not even a quick one "to start with"). Use **Artifact mode** only when the repo has no `docs/PROTOTYPES.md`.

### In-app prototypes

The options are built inside the real app, with real data and the app's own components, so I (or a client) see exactly how each option would look. Everything in "Design decisions" below still applies (many decisions, 4+ options each, recommendations, outlines, change strip, reveal scrolling, copy picks), with these differences:

- The option controls are an **in-app side panel** (sticky on desktop, bottom sheet on phones) in the prototype shell the repo provides.
- Picks live in the **URL query** (`?<decisionId>=<letter>&…`, as `docs/PROTOTYPES.md` defines). The panel updates the URL live; "Copy link" copies it. I or a client hand that URL back to you — parse it to get the picks.
- Prototypes never change live data (the repo's prototype mode blocks writes) and always show the "Prototype, live data unaffected" notice. Links to non-prototyped pages open the real page in a new tab.
- Because this needs code, the flow is: grill → write a **prototype build plan** (decisions, options, data states, files, per `docs/PROTOTYPES.md`) → start it in a new session (see "Optional: start it in a new session") → I review the prototype and send back the picks URL → the agreement gate → a **promotion build plan** that moves the picked options into the real pages and archives the prototype.
- In the agreement gate, the prototype URL with my picks replaces the "final mock" Artifact as the spec.
- **Always give me the link.** Every time you ask me about picks or the prototype (each AskUserQuestion, the agreement gate, the handback), include the clickable prototype page URL with the current/default picks in the query (e.g. `<app URL>/admin/prototypes/<slug>?layout=b&…`; the local dev URL while it isn't deployed, plus the live URL once it is), in the question text itself so I can open it from the dialog.

## Design decisions: lots of them, with 4+ options each

I want to make many of the design decisions myself, visually. So:

- Break the UI into **separate design decisions** (e.g. overall layout, navigation, card vs list vs table, density, hierarchy/emphasis, colour/accent use, typography, empty/loading/error states, mobile layout, key interactions, copy tone). Surface every decision that a reasonable designer could go more than one way on — more is better than fewer.
- For **each decision, show 4 or more clearly different options** where the decision allows it (minimum 2 only when there genuinely aren't more sensible ones). Name each option and give it a one-line trade-off. Mark your recommendation.
- Show them **in the prototype (in-app or Artifact)**, not in chat text: one section (or tab) per decision, options side by side / switchable, with realistic content matching the real app. Ideally let me mix and match (pick per decision) and see the combined result. **Controls never push the preview off-screen:** on desktop put the option controls in a sticky side panel (own scroll) next to the preview; on phones a collapsible bottom sheet; status/variant switchers sit right above the preview. Picking an option must show its effect without scrolling. An option that only shows in one state (e.g. a status, a guest view) switches the preview to that state when picked, and its label says so. **Every pick shows what it changed:** it puts the preview into the state that displays that decision (page/view, desktop/phone, data/fill state, wizard step, open dialog or row), outlines every area the decision affects with a labelled blue dashed box (e.g. "4. Progress position: B"), shows a one-line "decision → option · showing <state>" strip above the preview, and reveals the first affected area without jarring: scroll only the preview frame (never the outer page), only when the area is out of view, by the smallest distance that clears sticky bars and the label; jump instantly when the pick switched view/screen/step/state, scroll smoothly otherwise (instant under reduced motion); a single quick outline fade-in, no pulsing (tag preview elements with the decision ids they render). Include a "Copy my picks" button that copies decision → chosen option (letter + name) as plain text to paste into chat (clipboard, with select-text fallback).
- Then ask me with AskUserQuestion which option to take for each decision (up to 4 questions per call; repeat calls for more decisions). In in-app mode each question includes the prototype page link (see "In-app prototypes"). Rebuild/refine the prototype with my picks if I ask.

## Agreement gate

When every design decision has a pick and the feature requirements are settled:

1. In-app mode: the prototype URL with my picks is the spec (skip the Artifact). Artifact mode: republish the Artifact as the **final mock**: only the chosen options, combined, desktop + mobile, plus a short "Decisions" list (decision → pick). This URL is the spec.
2. Ask me (AskUserQuestion): "Design and requirements agreed — write the build plan?" Options: "Yes, write the plan" / "Change something first". Loop back on changes.

## Build plan for another agent

Once agreed, write a **self-contained** plan — the next agent has none of this conversation, so everything it needs goes in the plan. Read the code it will touch so file paths are real, not guessed. Sections:

1. **Goal** — one paragraph: what's being built and why.
2. **Spec** — the final mock Artifact URL, with: "The approved mock is the spec — build it exactly; any difference needs my approval (AskUserQuestion)." Then the decisions list (decision → chosen option, one line each, enough to rebuild it without the mock).
3. **Feature requirements** — behaviour, data, permissions, validation, edge cases, every UI state, out of scope.
4. **Files to touch** — real paths, what changes in each (new vs edited). Include schema/types/Zod, docs and `.env.example` if they're affected (per repo CLAUDE.md).
5. **Steps** — numbered, ordered, each a bounded action.
6. **Done when** — acceptance checks, the repo's quality gate (typecheck/lint/test/build), mock-vs-app comparison, and the UI handback (before/after screenshots Artifact) from the global CLAUDE.md. Before shots are taken before the first UI edit.
7. **Repo + branch** — repo path and the base branch to start from.

Save it as a Markdown file in the session's scratchpad directory (`ui-plan-<slug>.md`), then give it to me as **one ready-to-paste prompt** in a single fenced block — the full plan inline (not just a file path, since a new chat may not see this session's files), opening with a line like "Build this UI feature. Follow the plan exactly:".

## Optional: start it in a new session

Then ask me (AskUserQuestion): "Start the build now?" Options:
- "Spawn a new session" — call `mcp__ccd_session__start_session` (load it via ToolSearch first if it's deferred) with `initiation: "user_asked"`, `context: "fresh"`, a short title, the full plan as the prompt, and its own worktree. Give me the session link.
- "I'll paste it myself" — stop; the prompt above is the handoff.

If the session tool isn't available, say so in one line and leave the prompt for me to paste.
