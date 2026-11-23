// Waypoint following is pure logic and lives in the model layer (domain/npc/waypoints.ts), where NPC
// routines use it. Re-exported here for the views and content that import it from its old place.
export * from '../domain/npc/waypoints';
