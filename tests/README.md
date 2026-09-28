# Tests

```bash
npm run verify     # typecheck + the whole suite — this is Gate 0
npm test           # tests only
npm run typecheck  # types only
```

Three files, all pure — no simulator, no network, no backend:

- **pricing.test.mjs** — the money. Line totals with modifiers, the demo cart at
  $24.50, points coming off the bill, and the rules that stop a bill going
  negative or a tip going backwards.
- **points.test.mjs** — the rewards rules. The important ones are structural:
  anything we cannot verify (an Instagram follow) *must* be capped at once per
  account and *must* be worth less than buying the cheapest burger. This caught a
  real mistake on its first run — a follow was paying 150 points while a $9
  burger paid 90.
- **menu.test.mjs** — locks `data/menu.seed.json` to the printed board. Every
  burger at single, double and triple; wings at all four sizes; the three $1.50
  toppings; plus structural checks (no orphan modifier groups, no duplicate ids,
  every reward points at a real item).

## When these fail

They are the gate, not a formality. A red suite means a customer would be charged
the wrong amount, or the rewards could be farmed. Fix the code, not the test —
unless the printed menu genuinely changed, in which case update `BOARD` in
`menu.test.mjs` *and* the seed together.

Hands-on checks that a machine cannot make live in the QA checklist:
https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE
