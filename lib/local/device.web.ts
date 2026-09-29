// Web preview: the browser's own storage stands in for the phone's SQLite file.
// Never used by the live site — test mode is off there (DEMO_ALLOWED).
import { memoryKV, type KV } from './kv';

let kv: KV | null = null;
export function deviceKV(): KV {
  if (kv) return kv;
  try {
    const ls = globalThis.localStorage;
    const P = 'bp-test:';
    ls.getItem('probe');
    kv = {
      get: (k) => ls.getItem(P + k),
      set: (k, v) => ls.setItem(P + k, v),
      clear: () => { for (const k of Object.keys(ls)) if (k.startsWith(P)) ls.removeItem(k); },
    };
  } catch { kv = memoryKV(); }
  return kv;
}
