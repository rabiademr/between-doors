// Model: the visible window of the sketch map (M) — fitting, zooming and panning a frame over the map.
// World metres (x = east, z = north). Pure: no DOM.
import type { Rect } from './worldData';

export interface FrameLimits {
  /** The frame never leaves this rectangle (the whole town, already fitted to the aspect ratio). */
  outer: Rect;
  /** Narrowest allowed frame, metres. */
  minWidth: number;
}

const width = (r: Rect): number => r.x1 - r.x0;
const height = (r: Rect): number => r.z1 - r.z0;

/** The smallest frame with `aspect` (width / height) around `rect` plus `margin` on every side, centred on it. */
export function fitFrame(rect: Rect, aspect: number, margin = 0): Rect {
  const w0 = width(rect) + 2 * margin;
  const h0 = height(rect) + 2 * margin;
  const w = Math.max(w0, h0 * aspect);
  const h = w / aspect;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - h / 2, z1: cz + h / 2 };
}

/** Keeps the frame's aspect, limits its size and slides it back inside `limits.outer`. */
export function clampFrame(f: Rect, limits: FrameLimits): Rect {
  const aspect = width(f) / height(f);
  const maxW = Math.min(width(limits.outer), height(limits.outer) * aspect);
  const w = Math.min(maxW, Math.max(Math.min(limits.minWidth, maxW), width(f)));
  const h = w / aspect;
  const slide = (centre: number, half: number, lo: number, hi: number): number =>
    hi - lo <= 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, centre));
  const cx = slide((f.x0 + f.x1) / 2, w / 2, limits.outer.x0, limits.outer.x1);
  const cz = slide((f.z0 + f.z1) / 2, h / 2, limits.outer.z0, limits.outer.z1);
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - h / 2, z1: cz + h / 2 };
}

/**
 * Scales the frame by `factor` (< 1 zooms in) keeping `pivot` at the same place on screen
 * (default: the frame's centre).
 */
export function zoomFrame(f: Rect, factor: number, limits: FrameLimits, pivot?: { x: number; z: number }): Rect {
  const p = pivot ?? { x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2 };
  // Clamp the size first, so the pivot stays put even when the zoom stops at a limit.
  const sized = clampFrame({ x0: p.x - (p.x - f.x0) * factor, x1: p.x + (f.x1 - p.x) * factor, z0: p.z - (p.z - f.z0) * factor, z1: p.z + (f.z1 - p.z) * factor }, limits);
  const k = width(sized) / width(f);
  return clampFrame({ x0: p.x - (p.x - f.x0) * k, x1: p.x + (f.x1 - p.x) * k, z0: p.z - (p.z - f.z0) * k, z1: p.z + (f.z1 - p.z) * k }, limits);
}

/** Moves the frame by (dx, dz) metres, stopping at the edge of the map. */
export function panFrame(f: Rect, dx: number, dz: number, limits: FrameLimits): Rect {
  return clampFrame({ x0: f.x0 + dx, x1: f.x1 + dx, z0: f.z0 + dz, z1: f.z1 + dz }, limits);
}

/** SVG viewBox for a frame (SVG y = −z, so north is up). */
export function viewBoxOf(f: Rect): string {
  return `${f.x0.toFixed(2)} ${(-f.z1).toFixed(2)} ${width(f).toFixed(2)} ${height(f).toFixed(2)}`;
}
