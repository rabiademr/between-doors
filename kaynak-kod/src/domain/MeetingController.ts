// Model (pure): the chapter-2 meeting with Finn (design doc p.6, FR-08, T-06).
// - two meeting points; exactly ONE confirmation (a second press changes nothing)
// - Finn waits indefinitely once he arrives; no re-planning after confirmation
// - delivery needs a confirmed meeting and Finn standing still (he never walks during handover)
// - arriving early: the wait at the agreed spot is not counted as active time,
//   leaving the area counts again.

export type MeetingPointId = 'mp_fountain' | 'mp_yard';
export const MEETING_POINTS: readonly MeetingPointId[] = ['mp_fountain', 'mp_yard'];
/** Radius (m) around the agreed point that counts as "waiting at the spot". */
export const MEETING_ZONE_RADIUS = 4;

export class MeetingController {
  private accepted: MeetingPointId | null = null;
  private arrived = false;

  get acceptedPointId(): MeetingPointId | null {
    return this.accepted;
  }

  get finnArrived(): boolean {
    return this.arrived;
  }

  /** @returns true only for the first, valid confirmation. */
  confirm(pointId: string): boolean {
    if (this.accepted !== null) return false;
    if (!(MEETING_POINTS as readonly string[]).includes(pointId)) return false;
    this.accepted = pointId as MeetingPointId;
    return true;
  }

  /** Called by the NPC when it reaches the end of its route to the agreed point. */
  markArrived(): void {
    if (this.accepted !== null) this.arrived = true;
  }

  /** Handover is possible once a spot is agreed (Finn stops walking for it). */
  canDeliver(): boolean {
    return this.accepted !== null;
  }

  /** Should the 'meeting_wait' pause be active? Only at the right spot, before Finn gets there. */
  isWaitExempt(playerDistanceToPoint: number | null): boolean {
    if (this.accepted === null || this.arrived || playerDistanceToPoint === null) return false;
    return playerDistanceToPoint <= MEETING_ZONE_RADIUS;
  }
}
