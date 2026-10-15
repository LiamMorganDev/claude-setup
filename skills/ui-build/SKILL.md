---
name: ui-build
description: Run the full UI stack in one go — ponytail, grill-me, ui-ux-pro-max, ui-styling, then ui-proto.
argument-hint: <what UI to change/build>
disable-model-invocation: true
---

Task: $ARGUMENTS

Invoke each of these with the Skill tool, in this order, passing the task above as `args`. Load each one fully and follow it; later steps build on earlier ones.

1. `ponytail:ponytail` — keep the change minimal for the rest of this task.
2. `grill-me` — interview me about the task until the design is clear (use AskUserQuestion). Don't move on until I say we're done.
3. `ui-ux-pro-max` — style, palette, typography and UX guidance for what came out of the grilling.
4. `ui-styling` — shadcn/ui + Tailwind patterns to apply.
5. `ui-proto` — build the Artifact prototype with 2+ options using all of the above, and get my approval before any component code.
