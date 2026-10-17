---
name: ui-build
description: Full UI workflow (grill → design guidance → Artifact prototype with many options per design decision → approval → build). Use whenever the user wants to build, add, redesign, rework, restyle, mock up or prototype any UI — a page, screen, tab, component, layout, form, dashboard, modal or flow — or says "ui build", "ui-build", "/ui", "build the UI", "design this", "make it look better", "new page", "mock it up". Use it even when they don't name the skill.
argument-hint: <what UI to change/build>
---

Task: $ARGUMENTS

If the task above is empty, take it from my latest message (or ask me with AskUserQuestion).

Invoke each of these with the Skill tool, in this order, passing the task as `args`. Load each one fully and follow it; later steps build on earlier ones. If a skill is missing, say so in one line and carry on with the next.

1. `ponytail:ponytail` — keep the code change minimal for the rest of this task (this does NOT limit the number of design options below).
2. `grilling` — interview me about the task until the design is clear (use AskUserQuestion). Don't move on until I say we're done.
3. `ui-ux-pro-max` — style, palette, typography and UX guidance for what came out of the grilling.
4. `ui-styling` — shadcn/ui + Tailwind patterns to apply.
5. `ui-proto` — build the Artifact prototype using all of the above, and get my approval before any component code.

## Design decisions: lots of them, in Artifacts, with 4+ options each

I want to make many of the design decisions myself, visually. So:

- Break the UI into **separate design decisions** (e.g. overall layout, navigation, card vs list vs table, density, hierarchy/emphasis, colour/accent use, typography, empty/loading/error states, mobile layout, key interactions, copy tone). Surface every decision that a reasonable designer could go more than one way on — more is better than fewer.
- For **each decision, show 4 or more clearly different options** where the decision allows it (minimum 2 only when there genuinely aren't more sensible ones). Name each option and give it a one-line trade-off. Mark your recommendation.
- Show them **in the Artifact**, not in chat text: one section (or tab) per decision, options side by side / switchable, with realistic content matching the real app. Ideally let me mix and match (pick per decision) and see the combined result.
- Then ask me with AskUserQuestion which option to take for each decision (up to 4 questions per call; repeat calls for more decisions). Rebuild/refine the Artifact with my picks if I ask, before any component code.
