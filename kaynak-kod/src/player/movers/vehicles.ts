// Pure data: what each rideable vehicle is like — handling (VehicleTuning), collision body, camera.
// The movement rules live in VehicleMover; the look in player/vehicles/*.

export type VehicleKind = 'bike' | 'scooter' | 'motorcycle' | 'van';

/** Dev cycle order (B key): on foot → bike → scooter → motorcycle → van → on foot. */
export const VEHICLE_KINDS: readonly VehicleKind[] = ['bike', 'scooter', 'motorcycle', 'van'];

export interface VehicleTuning {
  /** m/s with W / with Shift held (pedalling hard, full throttle) */
  cruiseSpeed: number;
  sprintSpeed: number;
  /** m/s² */
  acceleration: number;
  braking: number;
  /** Rolling resistance when no throttle input (m/s²). */
  drag: number;
  /** m/s, rolling backwards with S held from standstill */
  reverseSpeed: number;
  /** Tightest turn (m) at speed. */
  turnRadius: number;
  /** rad/s cap, so slow speeds still steer a bit and high speeds don't snap. */
  maxYawRate: number;
  /** How soft a hit is: the share (0..1) of the speed that went into the wall still left 0.05 s later. */
  bumpKeep: number;
  /** m/s: with the pedal or brake held, it steers as if going at least this fast (0 = needs real speed, the van). */
  minSteerSpeed: number;
}

/**
 * Collision body on the ground. `halfLength` 0 = a circle of `radius` (two-wheelers); > 0 = a capsule
 * along the heading (the van), which turns about its rear axle `pivotBack` metres behind the centre.
 */
export interface VehicleBody {
  radius: number;
  halfLength: number;
  pivotBack: number;
}

export interface VehicleSpec {
  kind: VehicleKind;
  tuning: VehicleTuning;
  body: VehicleBody;
  /** Extra camera distance (m) on top of the player's zoom. */
  cameraExtra: number;
  /** How much higher (m) the camera looks than at a rider's shoulders. */
  cameraLift: number;
}

export const BIKE_TUNING: VehicleTuning = {
  cruiseSpeed: 8,
  sprintSpeed: 11,
  acceleration: 4.5,
  braking: 9,
  drag: 1.5,
  reverseSpeed: 3,
  turnRadius: 3,
  maxYawRate: 2.4,
  bumpKeep: 0.6,
  minSteerSpeed: 2.5,
};
/** Narrower than the frame is long: a two-wheeler slips past things a walker (0.35) just clears. */
export const BIKE_RADIUS = 0.36;

export const VEHICLES: Record<VehicleKind, VehicleSpec> = {
  bike: {
    kind: 'bike',
    tuning: BIKE_TUNING,
    body: { radius: BIKE_RADIUS, halfLength: 0, pivotBack: 0 },
    cameraExtra: 0,
    cameraLift: 0,
  },
  // Electric kick scooter: snappy, nimble, cruises a bit faster than the bike.
  scooter: {
    kind: 'scooter',
    tuning: {
      cruiseSpeed: 10,
      sprintSpeed: 11,
      acceleration: 7,
      braking: 10,
      drag: 1.8,
      reverseSpeed: 3,
      turnRadius: 2.2,
      maxYawRate: 3.4,
      bumpKeep: 0.55,
      minSteerSpeed: 2.5,
    },
    body: { radius: 0.34, halfLength: 0, pivotBack: 0 },
    cameraExtra: 0,
    cameraLift: 0,
  },
  // Motorcycle: fastest, but needs room to turn.
  motorcycle: {
    kind: 'motorcycle',
    tuning: {
      cruiseSpeed: 12,
      sprintSpeed: 15,
      acceleration: 6,
      braking: 11,
      drag: 1.2,
      reverseSpeed: 2.5,
      turnRadius: 5,
      maxYawRate: 2,
      bumpKeep: 0.5,
      minSteerSpeed: 2.5,
    },
    body: { radius: 0.45, halfLength: 0, pivotBack: 0 },
    cameraExtra: 1,
    cameraLift: 0,
  },
  // Small cargo van: heavy — slow to get going, wide turning circle, loses more speed in a crash.
  van: {
    kind: 'van',
    tuning: {
      cruiseSpeed: 8,
      sprintSpeed: 9,
      acceleration: 2.5,
      braking: 7,
      drag: 1,
      reverseSpeed: 2.5,
      turnRadius: 6,
      maxYawRate: 1.1,
      bumpKeep: 0.35,
      minSteerSpeed: 0,
    },
    // 4.6 × 2 m footprint: 2 × (1.3 + 1) long, 2 × 1 wide; rear axle 1.4 m behind the centre.
    body: { radius: 1, halfLength: 1.3, pivotBack: 1.4 },
    cameraExtra: 4,
    cameraLift: 0.8,
  },
};

/** Next step of the dev cycle (null = on foot). */
export function nextVehicle(current: VehicleKind | null): VehicleKind | null {
  if (current === null) return VEHICLE_KINDS[0] ?? null;
  return VEHICLE_KINDS[VEHICLE_KINDS.indexOf(current) + 1] ?? null;
}
