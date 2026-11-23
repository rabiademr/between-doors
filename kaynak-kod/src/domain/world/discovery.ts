// Model: which districts may appear on the courier's map. Pure.
import { districtAt, type WorldData } from './worldData';

/**
 * A district whose mapped places are all still hidden by the story (Postmark Mews before chapter 3) is not
 * announced or named, even if the courier wanders across its ground: finding it is the story's job.
 */
export function districtOnMap(data: WorldData, districtId: string, completedChapterIds: readonly string[]): boolean {
  const gated = [...data.areas, ...data.buildings].filter(
    (f) => f.reveal !== undefined && districtAt(data.districts, (f.rect.x0 + f.rect.x1) / 2, (f.rect.z0 + f.rect.z1) / 2)?.id === districtId,
  );
  if (gated.length === 0) return true;
  return gated.some((f) => completedChapterIds.includes(f.reveal!));
}
