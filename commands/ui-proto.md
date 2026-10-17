---
description: Prototype a UI/UX change as an Artifact — every design decision with 4+ options — before touching component code
argument-hint: <what UI to change/build>
---
Prototype this UI change: $ARGUMENTS

1. Get oriented first: if in a repo, skim the relevant existing components, styles/tokens and `docs/` so the mock matches the real app (colors, spacing, fonts, components). Then invoke the `ui-ux-pro-max` skill for style/palette/typography/UX guidance on each option.
2. Build **one interactive Artifact**. Split the UI into its separate design decisions (layout, navigation, card vs list vs table, density, emphasis, colour, typography, states, mobile layout, interactions…) — surface as many as are genuinely open — and give **each decision 4+ clearly different options** where possible (2 minimum), switchable via tabs/toggles, ideally mix-and-match with a combined preview. Name each option, give a one-line tradeoff, mark your pick. Use realistic content, not lorem ipsum. Make it work at phone width and in dark mode.
3. **Write no component code yet.** End with the Artifact link and an AskUserQuestion asking which option (or which mix) to go with.
4. Implement only after I explicitly approve, following the chosen option **exactly**: the mock is the spec. Rebuild every element it shows (dropdown layout, cards, descriptions, extra rows, item order) with the real components. No silent simplifications.
5. Before reporting done, put the mock and the running app side by side (screenshot both), check each element, and list any difference. Fix it, or ask me (AskUserQuestion) before keeping it.
