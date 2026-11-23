// View: the sketch map of Bellwick (M). Without GPS it is a drawing with no live position, no route and
// no door markers (design doc FR-09). Drawn from the same map layers as the 3D scene and the minimap
// (content/world/*.geo.json; metres, +Z = north). Features with `reveal` appear only after that chapter
// ("Postmark Mews added to your map"); districts the courier has not walked into yet are left blank.
// The M map opens on the district you are in and zooms out to the whole town: drag to move, wheel (towards the
// cursor) or + / − to zoom, arrows to move.
import { BELLWICK, CORE_DISTRICTS, coreRect } from '../content/world';
import { clampFrame, fitFrame, panFrame, viewBoxOf, zoomFrame, type FrameLimits } from '../domain/world/mapFrame';
import { districtOnMap } from '../domain/world/discovery';
import { districtAt, type Rect, type WorldData } from '../domain/world/worldData';
import { STRINGS } from '../i18n';
import { drawWorldLayers, isShown, placeMarker, playerMarker, svgEl, targetMarker } from './mapLayers';

/** Live position for the map (GPS skill only). */
export interface MapPosition {
  x: number;
  z: number;
  /** Compass bearing the player faces, degrees (0 = north). */
  bearing: number;
}

/** The core's frame, widened to take in anything revealed just outside it (Postmark Mews). */
function coreFrame(data: WorldData, completedChapterIds: readonly string[]): Rect {
  const core = coreRect(data);
  const revealed = [...data.areas, ...data.buildings].filter((f) => f.reveal && completedChapterIds.includes(f.reveal));
  return { ...core, x0: Math.min(core.x0, ...revealed.map((f) => f.rect.x0)) };
}

function northArrow(svg: SVGElement, frame: Rect, k = 1): SVGGElement {
  const g = svgEl('g', { class: 'map-north-mark' });
  g.append(svgEl('path', { d: 'M 0 0 l 1.4 3.6 l -1.4 -1 l -1.4 1 z', class: 'map-north' }));
  const n = svgEl('text', { x: 0, y: 5.6, class: 'map-north-letter', 'text-anchor': 'middle', 'font-size': 2 });
  n.textContent = 'N';
  g.append(n);
  placeNorth(g, frame, k);
  svg.append(g);
  return g;
}
function placeNorth(g: SVGGElement, frame: Rect, k: number): void {
  g.setAttribute('transform', `translate(${(frame.x1 - 3.5 * k).toFixed(2)} ${(-frame.z1 + 1.5 * k).toFixed(2)}) scale(${k.toFixed(3)})`);
}

/**
 * The fixed sketch of the old neighbourhood (finale note): Indigo Row, Dial Square and what has been revealed.
 * @param completedChapterIds chapters the player has finished (unlocks `reveal` features).
 */
export function buildMap(completedChapterIds: readonly string[], data: WorldData = BELLWICK): HTMLElement {
  const core = coreFrame(data, completedChapterIds);
  const frame = { x0: core.x0 - 1, x1: core.x1 + 1, z0: core.z0 - 1, z1: core.z1 + 1 };
  const svg = svgEl('svg', { viewBox: viewBoxOf(frame), role: 'img', 'aria-label': STRINGS.mapTitle, class: 'sketch-map' });
  drawWorldLayers(svg, data, completedChapterIds);
  northArrow(svg, frame);
  const wrap = document.createElement('div');
  wrap.className = 'map-wrap';
  wrap.append(svg);
  return wrap;
}

export interface SketchMapOptions {
  completedChapterIds: readonly string[];
  /** Districts the courier has walked into: only these are drawn in detail. */
  discoveredDistrictIds: readonly string[];
  /** Where the courier stands: picks the district the map opens on (not drawn). */
  at: { x: number; z: number };
  /** GPS: draws "you are here". */
  you?: MapPosition;
  /** GPS: where the parcel in hand is going. */
  goal?: { x: number; z: number };
  data?: WorldData;
}
export interface SketchMap {
  element: HTMLElement;
  /** Removes the zoom listeners. */
  dispose(): void;
}

const ASPECT = 4 / 3;
/** Label sizes are tuned for a frame about this wide (the core); wider frames scale them up. */
const REFERENCE_WIDTH = 86;
/** Wider than this, street-level labels give way to district names. */
const FAR_WIDTH = 190;
const MIN_WIDTH = 44;
const ZOOM_STEP = 1.3;
/** District name plates: tallest letter size (m) and the average letter width as a share of it. */
const DISTRICT_NAME_MAX = 16;
const GLYPH_WIDTH = 0.6;
const ZOOM_IN = new Set(['Equal', 'NumpadAdd']);
const ZOOM_OUT = new Set(['Minus', 'NumpadSubtract']);
const PAN: Record<string, readonly [number, number]> = {
  ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

/** The M map: opens on the courier's district, zooms out to the whole town. */
export function openSketchMap(options: SketchMapOptions): SketchMap {
  const data = options.data ?? BELLWICK;
  const { completedChapterIds, you, at } = options;
  const active = data.districts.filter((d) => d.status === 'active');
  // A place revealed by the story is on the map even if an old save never recorded walking into it.
  const known = new Set(options.discoveredDistrictIds);
  for (const f of [...data.areas, ...data.buildings]) {
    if (!f.reveal || !isShown(f.reveal, completedChapterIds)) continue;
    const d = districtAt(data.districts, (f.rect.x0 + f.rect.x1) / 2, (f.rect.z0 + f.rect.z1) / 2);
    if (d) known.add(d.id);
  }

  const { bounds } = data;
  const limits: FrameLimits = {
    outer: fitFrame({ x0: bounds.minX, x1: bounds.maxX, z0: bounds.minZ, z1: bounds.maxZ }, ASPECT, 4),
    minWidth: MIN_WIDTH,
  };
  // Home: the old neighbourhood as one sheet (as in the first chapters), otherwise the district you stand in.
  const core = coreFrame(data, completedChapterIds);
  const here = districtAt(data.districts, at.x, at.z);
  const inCore = !here || (at.x >= core.x0 && at.x <= core.x1 && at.z >= core.z0 && at.z <= core.z1) || (CORE_DISTRICTS as readonly string[]).includes(here.id);
  const home = clampFrame(fitFrame(inCore ? core : here.rect, ASPECT, 2), limits);
  let frame = home;

  const svg = svgEl('svg', { role: 'img', 'aria-label': STRINGS.mapTitle, class: 'sketch-map' });
  drawWorldLayers(svg, data, completedChapterIds, known);
  for (const d of active) {
    const r = d.rect;
    const isKnown = known.has(d.id) && districtOnMap(data, d.id, completedChapterIds);
    if (!isKnown) svg.append(svgEl('rect', { x: r.x0, y: -r.z1, width: r.x1 - r.x0, height: r.z1 - r.z0, class: 'map-unknown' }));
    svg.append(svgEl('rect', { x: r.x0, y: -r.z1, width: r.x1 - r.x0, height: r.z1 - r.z0, class: 'map-district' }));
    // District names are data (proper names, English in every language); an unvisited district is a question mark.
    const text = isKnown ? d.name : '?';
    const cx = (r.x0 + r.x1) / 2;
    const cy = -(r.z0 + r.z1) / 2;
    // The name fills the district's longer side (a tall, narrow district reads bottom to top).
    const upright = r.z1 - r.z0 > 2 * (r.x1 - r.x0);
    const room = upright ? r.z1 - r.z0 : r.x1 - r.x0;
    const size = Math.min(DISTRICT_NAME_MAX, (room * 0.86) / (text.length * GLYPH_WIDTH));
    const name = svgEl('text', {
      x: cx,
      y: cy,
      class: `map-label map-district-name${isKnown ? '' : ' map-unknown-name'}`,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    name.style.fontSize = `${size.toFixed(2)}px`; // inline: the label classes set their own size
    if (upright) name.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    name.textContent = text;
    svg.append(name);
  }
  const north = northArrow(svg, frame);
  let goalMark: SVGGElement | null = null;
  if (you && options.goal) {
    goalMark = targetMarker(3.6);
    svg.append(goalMark);
  }
  let marker: SVGGElement | null = null;
  if (you) {
    marker = playerMarker(3);
    svg.append(marker);
  }

  const apply = (): void => {
    const k = Math.max(1, (frame.x1 - frame.x0) / REFERENCE_WIDTH);
    svg.setAttribute('viewBox', viewBoxOf(frame));
    svg.style.setProperty('--map-k', k.toFixed(3));
    svg.classList.toggle('map-far', frame.x1 - frame.x0 > FAR_WIDTH);
    placeNorth(north, frame, k);
    if (goalMark && options.goal) {
      goalMark.setAttribute('transform', `translate(${options.goal.x.toFixed(2)} ${(-options.goal.z).toFixed(2)}) scale(${k.toFixed(3)})`);
    }
    if (marker && you) {
      placeMarker(marker, you.x, you.z, you.bearing);
      marker.setAttribute('transform', `${marker.getAttribute('transform') ?? ''} scale(${k.toFixed(3)})`);
    }
  };
  apply();

  const zoom = (factor: number, pivot?: { x: number; z: number }): void => {
    frame = zoomFrame(frame, factor, limits, pivot);
    apply();
  };
  /** The map point under a screen position (the SVG's own transform, so letterboxing is accounted for). */
  const mapPointAt = (clientX: number, clientY: number): { x: number; z: number } | undefined => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return undefined;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, z: -p.y };
  };
  const onWheel = (e: WheelEvent): void => {
    e.stopPropagation(); // the wheel belongs to the map while it is open (not to the game camera's zoom)
    if (e.deltaY === 0 || e.ctrlKey) return;
    // Over the map: the spot under the cursor stays put; elsewhere: around the centre.
    const over = e.target instanceof Node && svg.contains(e.target);
    zoom(e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, over ? mapPointAt(e.clientX, e.clientY) : undefined);
  };

  // Drag to move the map (left button, or a finger).
  let drag: { id: number; x: number; y: number } | null = null;
  svg.classList.add('map-draggable');
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('is-dragging');
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const ctm = svg.getScreenCTM();
    const metresPerPx = ctm && ctm.a > 0 ? 1 / ctm.a : (frame.x1 - frame.x0) / Math.max(1, svg.clientWidth);
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    // The map follows the hand: dragging right shows what is west, dragging down what is north.
    frame = panFrame(frame, -dx * metresPerPx, dy * metresPerPx, limits);
    apply();
  });
  const endDrag = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    svg.classList.remove('is-dragging');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('lostpointercapture', endDrag);
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser shortcuts (Ctrl +/−/0) stay the browser's
    if (ZOOM_IN.has(e.code)) zoom(1 / ZOOM_STEP);
    else if (ZOOM_OUT.has(e.code)) zoom(ZOOM_STEP);
    else if (e.code === 'Digit0' || e.code === 'Numpad0') {
      frame = home;
      apply();
    } else {
      const step = PAN[e.code];
      if (!step) return;
      const by = (frame.x1 - frame.x0) * 0.12;
      frame = panFrame(frame, step[0] * by, step[1] * by, limits);
      apply();
    }
  };
  window.addEventListener('wheel', onWheel, { passive: true, capture: true });
  window.addEventListener('keydown', onKey);

  const wrap = document.createElement('div');
  wrap.className = 'map-wrap map-zoom';
  wrap.append(svg);
  return {
    element: wrap,
    dispose: (): void => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKey);
    },
  };
}
