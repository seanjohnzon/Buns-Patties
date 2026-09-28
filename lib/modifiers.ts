// How an item's options behave when a customer taps them. Pure, so the rules the
// item screen follows are the same ones the tests prove.
//
// The menu's rules, as the owner put them:
//   - A burger opens with its own sauce and its cheese already picked. What comes
//     on it is listed, not removable; you can only add.
//   - "No sauce" and "No cheese" are real choices, not removals.
//   - Wings: 4 or 6 pieces get one flavor, 8 or 10 get two.
//   - Sauce cups on seasoned fries are counted, 25 cents each, any mix.
import type { MenuItem, ModifierGroup, ModifierOption } from './types';

export type Choice = Record<string, ModifierOption[]>;

/** What is already picked when the item opens. */
export function initialChoice(item: MenuItem): Choice {
  const out: Choice = {};
  for (const g of item.modifierGroups) {
    const ids = item.defaults?.[g.id] ?? [];
    out[g.id] = g.options.filter((o) => ids.includes(o.id));
  }
  return out;
}

/** This group's limit right now — it can depend on what another group has picked. */
export function groupMax(g: ModifierGroup, choice: Choice) {
  for (const rule of g.maxWhen ?? []) {
    if ((choice[rule.group] ?? []).some((o) => rule.options.includes(o.id))) return rule.max;
  }
  return g.max;
}

export function countOf(choice: Choice, groupId: string, optionId: string) {
  return (choice[groupId] ?? []).filter((o) => o.id === optionId).length;
}

/** A tap on an option. Returns the new choice; never mutates. */
export function tap(g: ModifierGroup, opt: ModifierOption, choice: Choice): Choice {
  const cur = choice[g.id] ?? [];
  const max = groupMax(g, choice);
  const has = cur.some((o) => o.id === opt.id);
  let next: ModifierOption[];

  if (max === 1) {
    // A required single choice cannot be emptied by tapping it again.
    next = has ? (g.required ? cur : []) : [opt];
  } else if (has) {
    next = cur.filter((o) => o.id !== opt.id);
  } else if (g.exclusive?.includes(opt.id)) {
    next = [opt];
  } else {
    const rest = cur.filter((o) => !g.exclusive?.includes(o.id));
    // Full: the oldest pick makes room, so a tap always does something visible.
    next = rest.length >= max ? [...rest.slice(1), opt] : [...rest, opt];
  }
  return { ...choice, [g.id]: next };
}

/** Counted groups: one more or one fewer of this option. */
export function bump(g: ModifierGroup, opt: ModifierOption, by: 1 | -1, choice: Choice): Choice {
  const cur = choice[g.id] ?? [];
  if (by > 0) {
    if (cur.length >= groupMax(g, choice)) return choice;
    return { ...choice, [g.id]: [...cur, opt] };
  }
  const i = cur.map((o) => o.id).lastIndexOf(opt.id);
  if (i < 0) return choice;
  return { ...choice, [g.id]: [...cur.slice(0, i), ...cur.slice(i + 1)] };
}

/** When one group changes another's limit (10 wings down to 4), trim what no longer fits. */
export function trimToLimits(item: MenuItem, choice: Choice): Choice {
  const out = { ...choice };
  for (const g of item.modifierGroups) {
    const max = groupMax(g, out);
    if ((out[g.id]?.length ?? 0) > max) out[g.id] = out[g.id].slice(0, max);
  }
  return out;
}

/** Groups that still need a pick before it can go in the order. */
export function missing(item: MenuItem, choice: Choice): ModifierGroup[] {
  return item.modifierGroups.filter((g) => g.required && (choice[g.id]?.length ?? 0) < g.min);
}

/** How a group describes itself under its title. */
export function groupHint(g: ModifierGroup, choice: Choice) {
  const max = groupMax(g, choice);
  if (g.counted) return g.options[0]?.priceDelta ? `${Math.round(g.options[0].priceDelta * 100)}¢ each` : 'Add as many as you like';
  if (g.required) return max === 1 ? 'Pick one' : `Pick up to ${max}`;
  return 'Optional';
}

/**
 * A kitchen ticket line from the option names on an order. Repeats are counted
 * ("Ketchup ×2") and the "No …" choices are pulled out so the board can shout
 * them — a burger that goes out with cheese after "No cheese" is a remake.
 */
export function ticket(mods: string[]) {
  const no = mods.filter((m) => /^No /.test(m));
  const rest = mods.filter((m) => !/^No /.test(m));
  return { no: [...new Set(no)], rest: summariseNames(rest) };
}

function summariseNames(names: string[]) {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}

/** Kitchen-friendly summary: "Ketchup ×2, BBQ". */
export function summarise(chosen: ModifierOption[]) {
  const counts = new Map<string, number>();
  for (const o of chosen) counts.set(o.name, (counts.get(o.name) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}
