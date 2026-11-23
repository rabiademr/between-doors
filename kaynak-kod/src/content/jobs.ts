// Content: the Relay job board — where it hangs, which doors take parcels (map spots of kind `address`),
// and the rules that send E on them to the game. Job rules live in domain/jobs; wording in i18n (`jobs`).
import type { Address } from '../domain/jobs/jobs';
import { districtAt } from '../domain/world/worldData';
import type { GameRule } from './quests';
import { BELLWICK } from './world';

export const JOB_BOARD_ID = 'job_board';

const board = BELLWICK.spots.find((s) => s.id === JOB_BOARD_ID);
/** Where the board hangs (trips are measured from here). */
export const JOB_BOARD_AT = { x: board?.x ?? 0, z: board?.z ?? 0 };

const addressSpots = BELLWICK.spots.filter((s) => s.kind === 'address');

/** Every door a board job can go to. */
export const JOB_ADDRESSES: readonly Address[] = addressSpots.map((s) => ({
  id: s.id,
  x: s.x,
  z: s.z,
  district: districtAt(BELLWICK.districts, s.x, s.z)?.id ?? '',
}));

/** "12 Lock Street" — proper names, the same in every language. */
export function addressName(id: string): string {
  return addressSpots.find((s) => s.id === id)?.name ?? id;
}
/** "Canal Side" — the district an address is in. */
export function addressDistrict(id: string): string {
  const a = JOB_ADDRESSES.find((x) => x.id === id);
  return BELLWICK.districts.find((d) => d.id === a?.district)?.name ?? '';
}
export function addressAt(id: string): { x: number; z: number } | undefined {
  return JOB_ADDRESSES.find((a) => a.id === id);
}

/**
 * Board jobs are the same in every chapter and step, so their rules are fallbacks next to DEFAULT_RULES:
 * E on the board opens it; E on an address asks the job in hand whether this is the door.
 */
export const JOB_RULES: readonly GameRule[] = [
  { on: { interact: JOB_BOARD_ID }, do: [{ call: 'jobs.open' }] },
  ...JOB_ADDRESSES.map((a): GameRule => ({ on: { interact: a.id }, do: [{ call: 'job.checkTarget', id: a.id }] })),
];
