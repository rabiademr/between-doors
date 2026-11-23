// Content: story actors — characters the week's chapters place around town (quest effects `actor.place`,
// `actor.walk`, `actor.hide`; world/StoryCast draws them). Each carries its own talk spot `actor_<id>`;
// outside its chapter's rules, E on it gets the actor's idle line (content/quests DEFAULT_RULES).
// Chapters 1–2 keep their own Finn and street Arthur (GameApp); these are separate instances.
import type { LocalizedText } from '../i18n';
import type { Point2 } from '../domain/npc/waypoints';

export interface ActorDef {
  /** Shown in the prompt ("Talk to …") and as a scene speaker's title. */
  name: LocalizedText;
  /** Character model (src/assets/models/chars). */
  model: string;
  /** Walking speed, m/s. */
  speed: number;
  /** What they say to E when the story has nothing for them. */
  idle: LocalizedText;
  /** Clothes recoloured (material name → sRGB hex), e.g. a uniform. */
  outfit?: Readonly<Record<string, string>>;
}

const actors = {
  arthur: {
    name: { en: 'Arthur', tr: 'Arthur' },
    model: 'models/chars/arthur.glb',
    speed: 1.1,
    idle: { en: 'Arthur: “Forty years, and the canal still smells of the same mud.”', tr: 'Arthur: “Kırk yıl geçti, kanal hâlâ aynı çamur kokuyor.”' },
  },
  finn: {
    name: { en: 'Finn', tr: 'Finn' },
    model: 'models/chars/finn.glb',
    speed: 1.5,
    idle: { en: 'Finn: “Busy day? Same.”', tr: 'Finn: “Yoğun gün mü? Benimki de.”' },
  },
  june: {
    name: { en: 'June', tr: 'June' },
    model: 'models/chars/june.glb',
    speed: 1.3,
    idle: { en: 'June: “Still got the chilli plants. Still got the blue door.”', tr: 'June: “Biber saksıları yerinde. Mavi kapı da.”' },
  },
  // The rival courier's manager, in Swift Parcel orange.
  swift_manager: {
    name: { en: 'Mr Crane', tr: 'Mr Crane' },
    model: 'models/chars/suit_m.glb',
    speed: 1.3,
    idle: { en: 'Mr Crane: “Swift Parcel. Faster than Relay, every time.”', tr: 'Mr Crane: “Swift Parcel. Her seferinde Relay’den hızlı.”' },
    outfit: { Black: '#d9702a', Shirt: '#f4efe6', Details: '#1f3b45' }, // suit_m: Black = jacket + trousers
  },
} satisfies Record<string, ActorDef>;
export type ActorId = keyof typeof actors;
export const STORY_ACTORS: Record<ActorId, ActorDef> = actors;
export const ACTOR_IDS = Object.keys(actors) as ActorId[];

/** The talk spot that follows an actor around. */
export const actorSpotId = (id: ActorId): string => `actor_${id}`;

/** Where actors stand (feet; heading 0 = facing north/+z). */
const marks = {
  // Chapter 5, Canal Side: Arthur waits on the south pavement of Lock Street.
  arthur_lock_street: { x: 54.5, z: 1.2, heading: -Math.PI / 2 },
  // Chapter 6: Finn at the top of Yard Road (west paving), June outside her blue door in Indigo Row.
  finn_yard_road: { x: -4, z: -33, heading: Math.PI / 2 },
  june_door: { x: 3.3, z: 6, heading: -Math.PI / 2 }, // between her chilli pots, a step out from the door
  // Chapter 7: the neighbourhood at the Market Cross (the cross is x −1.5..1.5, z 78.5..81.5).
  arthur_cross: { x: 0, z: 77.2, heading: Math.PI },
  june_cross: { x: -2.4, z: 77.6, heading: Math.PI * 0.85 },
  finn_cross: { x: 2.4, z: 77.6, heading: -Math.PI * 0.85 },
  crane_cross: { x: 3.2, z: 80.4, heading: -Math.PI / 2 },
} satisfies Record<string, { x: number; z: number; heading: number }>;
export type MarkId = keyof typeof marks;
export const MARKS: Record<MarkId, { x: number; z: number; heading: number }> = marks;

/** Walks (waypoints from where the actor stands). */
const routes = {
  // Along Lock Street to the canal, then up the west quay.
  arthur_lock_to_quay: [
    { x: 60, z: 4 },
    { x: 81, z: 4 },
    { x: 81, z: 20 },
  ],
  // Chapter 7: Mr Crane leaves the market down Market Street.
  crane_leaves: [
    { x: 2.6, z: 76 },
    { x: 1.8, z: 56 },
    { x: 1.8, z: 44 },
  ],
} satisfies Record<string, readonly Point2[]>;
export type RouteId = keyof typeof routes;
export const ROUTES: Record<RouteId, readonly Point2[]> = routes;
