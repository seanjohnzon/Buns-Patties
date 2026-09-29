// The phone's test database file. Native builds (Expo Go, TestFlight).
import { openDatabaseSync } from 'expo-sqlite';
import { sqliteKV, type KV } from './kv';

let kv: KV | null = null;
export function deviceKV(): KV {
  if (!kv) {
    const db = openDatabaseSync('bp-test.db');
    kv = sqliteKV({
      execSync: (sql) => db.execSync(sql),
      getFirstSync: (sql, params) => db.getFirstSync(sql, params),
      runSync: (sql, params) => db.runSync(sql, params),
    });
  }
  return kv;
}
