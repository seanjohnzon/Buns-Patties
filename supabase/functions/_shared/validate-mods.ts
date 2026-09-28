// The menu's option rules, checked on the server. The app enforces the same
// rules as the customer taps (lib/modifiers.ts); this is the copy nobody can
// talk their way past with a hand-made request. Pure: no Deno, no database, so
// the test suite imports it directly (tests/server-mods.test.mjs).
//
//   - every option named must exist on this item
//   - a pick-one group gets one; nothing is picked twice unless it is counted
//     (sauce cups on seasoned fries)
//   - "No sauce" / "No cheese" stand alone
//   - limits follow the other picks (8 or 10 wings allow two sauces)
//   - required groups are filled

export type Option = { id: string; name: string; priceDelta: number };
export type Group = {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: Option[];
  exclusive?: string[];
  maxWhen?: { group: string; options: string[]; max: number }[];
  counted?: boolean;
};
export type Picked = { group: string; option: string; delta: number };

export function checkMods(groups: Group[], mods: string[]): { ok: true; picked: Picked[] } | { ok: false; error: string } {
  const picked: Picked[] = [];
  for (const name of mods) {
    const g = groups.find((x) => x.options.some((o) => o.name === name));
    if (!g) return { ok: false, error: `"${name}" is not an option on this item` };
    const o = g.options.find((x) => x.name === name)!;
    picked.push({ group: g.id, option: o.id, delta: Number(o.priceDelta) || 0 });
  }

  const inGroup = (id: string) => picked.filter((p) => p.group === id);
  const has = (groupId: string, optionIds: string[]) => inGroup(groupId).some((p) => optionIds.includes(p.option));

  for (const g of groups) {
    const mine = inGroup(g.id);
    let max = g.max;
    for (const rule of g.maxWhen ?? []) if (has(rule.group, rule.options)) { max = rule.max; break; }

    if (!g.counted && new Set(mine.map((p) => p.option)).size !== mine.length) {
      return { ok: false, error: `${g.name}: the same option twice` };
    }
    if (mine.length > max) return { ok: false, error: `${g.name}: at most ${max}` };
    if (g.required && mine.length < Math.max(1, g.min)) return { ok: false, error: `${g.name}: pick one` };
    const alone = mine.filter((p) => g.exclusive?.includes(p.option));
    if (alone.length && mine.length > 1) return { ok: false, error: `${g.name}: "${g.options.find((o) => o.id === alone[0].option)?.name}" goes on its own` };
  }
  return { ok: true, picked };
}
