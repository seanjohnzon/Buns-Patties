# Tests

```bash
npm run verify     # typecheck + the whole suite — this is Gate 0
npm test           # tests only
npm run typecheck  # types only
```

All pure — no simulator, no network, no backend:

- **pricing.test.mjs** — the money. Line totals with modifiers, the demo cart at
  $24.50, tax and tip, and reward lines: the free burger covers a double patty,
  a triple pays the difference, paid toppings are always paid.
- **campaigns.test.mjs** — the giveaways. One per account, caps, end dates, dead
  links, and the stamp card: $15 minimum, fries at 5, burger at 10.
- **modifiers.test.mjs** — how options behave when tapped: burgers open built,
  "No sauce" clears the rest, two wing flavors only at 8 or 10, fry sauce cups.
- **menu.test.mjs** — locks `data/menu.seed.json` to the printed board. Every
  burger at single, double and triple; wings at all four sizes; the three $1.50
  toppings; plus structural checks (no orphan modifier groups, no duplicate ids,
  burgers never sell back what they come with).

## When these fail

They are the gate, not a formality. A red suite means a customer would be charged
the wrong amount, or the rewards could be farmed. Fix the code, not the test —
unless the printed menu genuinely changed, in which case update `BOARD` in
`menu.test.mjs` *and* the seed together.

Hands-on checks that a machine cannot make live in the QA checklist:
https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE
