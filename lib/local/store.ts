// What the test database holds, and what a fresh one starts with. Each entry is
// one row in the kv table. Pure.
import type { Campaign, CampaignClaim } from '../campaigns';
import type { Order, TruckStatus } from '../types';
import type { IntakeState } from '../intake';
import type { KV } from './kv';

export type LocalFeedback = { id: string; rating: number | null; message: string | null; build: string | null; handled: boolean; createdAt: string };

export type LocalState = {
  truck: TruckStatus;
  /** item id -> the day it was switched off (YYYY-MM-DD); it comes back the next day. */
  soldOut: Record<string, string>;
  orders: LocalOrder[];
  claims: CampaignClaim[];
  stamps: Record<string, number>;
  campaigns: Campaign[];
  feedback: LocalFeedback[];
  profileName: string | null;
  /** Test mode only: intake forms "sent" with no database, by code. */
  intake: Record<string, IntakeState>;
};

/** An order as the test database keeps it: enough to rebuild the owner's reports. */
export type LocalOrder = Order & {
  lines: (Order['lines'][number] & { menuItemId?: string; listPrice?: number; campaignId?: string | null })[];
};

export type LocalStore = {
  read<K extends keyof LocalState>(key: K): LocalState[K];
  write<K extends keyof LocalState>(key: K, value: LocalState[K]): void;
  wipe(): void;
};

/** `fresh` is what an empty database answers with; nothing is written until changed. */
export function createLocalStore(kv: KV, fresh: () => LocalState): LocalStore {
  return {
    read(key) {
      const raw = kv.get(key);
      if (raw === null) return fresh()[key];
      try { return JSON.parse(raw); } catch { return fresh()[key]; }
    },
    write(key, value) { kv.set(key, JSON.stringify(value)); },
    wipe() { kv.clear(); },
  };
}
