// Pure rule for SceneStreamer: when is a piece of far scenery shown?

/** Width of the band (metres) in which a node keeps its current state, so it does not flicker at the edge. */
export const STREAM_BAND = 12;

/**
 * @param distance from the player to the nearest part of the node (metres; negative = inside it)
 * @param wasOn the node's current state
 * @param radius nodes nearer than this are shown; they are hidden again beyond `radius + STREAM_BAND`
 */
export function streamVisible(distance: number, wasOn: boolean, radius: number): boolean {
  if (distance <= radius) return true;
  if (distance > radius + STREAM_BAND) return false;
  return wasOn;
}
