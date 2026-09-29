// The test database: one SQLite table on the phone. Used by test builds (Expo Go
// and the TestFlight "B&P Test" app) instead of the real database, so a tester's
// orders, stamps and settings survive closing the app. Deliberately simple SQL —
// a key and a JSON value — so there is nothing to migrate and nothing to break.
//
// Pure: no Expo imports, so tests/local-db.test.mjs runs it on Node's own SQLite.

export type KV = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  clear(): void;
};

/** The three calls we need, as expo-sqlite (and a thin Node shim) provide them. */
export type SyncSql = {
  execSync(sql: string): void;
  getFirstSync<T>(sql: string, params: (string | number | null)[]): T | null;
  runSync(sql: string, params: (string | number | null)[]): unknown;
};

export const KV_SCHEMA =
  'create table if not exists kv (key text primary key not null, value text not null, updated_at text not null)';

export function sqliteKV(db: SyncSql): KV {
  db.execSync(KV_SCHEMA);
  return {
    get: (key) => db.getFirstSync<{ value: string }>('select value from kv where key = ?', [key])?.value ?? null,
    set: (key, value) => {
      db.runSync(
        'insert into kv (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at',
        [key, value, new Date().toISOString()],
      );
    },
    clear: () => db.execSync('delete from kv'),
  };
}

/** For the web preview and anywhere SQLite is not available. */
export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); }, clear: () => m.clear() };
}
