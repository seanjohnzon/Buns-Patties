// The test database, as the rest of the app sees it. Test builds only (Expo Go,
// and the TestFlight "B&P Test" app): lib/api.ts calls these whenever there is no
// real database configured. A fresh one starts with the real menu, the two
// campaigns the app ships with, and nothing else.
import seed from '../../data/menu.seed.json';
import { DEFAULT_CAMPAIGNS } from '../campaigns';
import type { Testimonial, TruckStatus } from '../types';
import { deviceKV } from './device';
import { createLocalStore, type LocalState, type LocalStore } from './store';

/** Labelled SAMPLE on screen until the owner adds his own on the truck page. */
export const SAMPLE_TESTIMONIALS: Testimonial[] = [
  { name: 'Sample', quote: 'The owner’s favourite Google reviews go here. Pick them in Owner → The truck page.', stars: 5, sample: true },
  { name: 'Sample', quote: 'Three to five short ones read best.', stars: 5, sample: true },
];

export function freshState(): LocalState {
  return {
    truck: { ...(seed.truck as TruckStatus), testimonials: SAMPLE_TESTIMONIALS },
    soldOut: {}, orders: [], claims: [], stamps: {},
    campaigns: DEFAULT_CAMPAIGNS, feedback: [], profileName: null,
  };
}

let store: LocalStore | null = null;
export function localStore(): LocalStore {
  if (!store) store = createLocalStore(deviceKV(), freshState);
  return store;
}
