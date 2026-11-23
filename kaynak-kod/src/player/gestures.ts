// Pure procedural gestures (no Babylon): small extra bone rotations layered on top of the clips, for
// moments the character pack has no animation for — talking with the hands, waving, nodding.
// Axes measured on the Quaternius UACP rig (bone-local, radians):
//   UpperArm.R  x: lift the arm out to the side (+), z: swing it forward/across (+)
//   UpperArm.L  same, mirrored (−x lifts)
//   Head        x: nod down (+), y: turn, z: tilt sideways
//   Neck        same as Head (smaller)

export type GestureKind = 'talk' | 'wave' | 'nod';

export interface BoneOffset {
  bone: string;
  x: number;
  y: number;
  z: number;
}

/** Seconds a gesture lasts; null = loops until stopped (talking). */
export function gestureDuration(kind: GestureKind): number | null {
  if (kind === 'wave') return 2.4;
  if (kind === 'nod') return 1.1;
  return null;
}

/** Ease 0→1→0 over a finite gesture so it starts and ends at rest (no snapping). */
function envelope(t: number, duration: number, edge = 0.25): number {
  if (t <= 0 || t >= duration) return 0;
  return Math.min(1, t / edge, (duration - t) / edge);
}

/** Bone offsets `t` seconds into a gesture. Empty once a finite gesture has ended. */
export function gestureOffsets(kind: GestureKind, t: number): BoneOffset[] {
  const s = (hz: number, phase = 0) => Math.sin(2 * Math.PI * hz * t + phase);
  switch (kind) {
    case 'talk': {
      // Speaking: easy head bobs and turns, the right hand lifting a little as if explaining.
      const k = Math.min(1, Math.max(0, t) / 0.3);
      return [
        { bone: 'Head', x: k * (0.08 + 0.07 * s(1.6)), y: k * 0.12 * s(0.45), z: k * 0.05 * s(0.8, 1) },
        { bone: 'UpperArm.R', x: k * (0.55 + 0.2 * s(1.1)), y: 0, z: k * (0.6 + 0.25 * s(0.9, 0.5)) },
        { bone: 'UpperArm.L', x: -k * (0.2 + 0.12 * s(0.7, 2)), y: 0, z: k * 0.25 * s(0.6, 1) },
      ];
    }
    case 'wave': {
      const d = gestureDuration('wave') ?? 0;
      const k = envelope(t, d, 0.35);
      if (k === 0) return [];
      // Arm up beside the head, swinging side to side.
      return [
        { bone: 'UpperArm.R', x: k * 2.5, y: 0, z: k * (0.25 * s(2.2)) },
        { bone: 'Head', x: 0, y: k * -0.12, z: k * 0.08 },
      ];
    }
    case 'nod': {
      const d = gestureDuration('nod') ?? 0;
      const k = envelope(t, d, 0.2);
      if (k === 0) return [];
      // Two nods.
      return [{ bone: 'Head', x: k * 0.32 * Math.max(0, s(1.8)), y: 0, z: 0 }];
    }
  }
}

/**
 * Held seated pose (Mews table): the last frame of 'sit-down' leaves the arms raised out to the sides, so
 * the upper arms are brought down with the hands in the lap (measured on the UACP rig in the finale view).
 */
export const SEATED_ARMS: readonly BoneOffset[] = [
  { bone: 'UpperArm.R', x: -0.8, y: 0, z: 1.1 },
  { bone: 'UpperArm.L', x: 0.5, y: 0, z: -0.9 },
];
