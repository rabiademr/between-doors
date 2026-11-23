// View helpers shared by the sketch map (M) and the minimap: draw Bellwick's map layers into an SVG.
// Coordinates stay in world metres; SVG y = −Z so north (+Z) is up. Features with `reveal` appear only
// after that chapter is completed (Postmark Mews).
import { districtAt, type Rect, type WorldData } from '../domain/world/worldData';

export const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_CLASS = { road: 'map-road', paving: 'map-paving', gravel: 'map-gravel', grass: 'map-grass', water: 'map-canal', bridge: 'map-bridge' } as const;
const LABEL_CLASS = { normal: 'map-label', small: 'map-label map-small', street: 'map-label map-street' } as const;

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function isShown(reveal: string | undefined, completedChapterIds: readonly string[]): boolean {
  return reveal === undefined || completedChapterIds.includes(reveal);
}

/**
 * Ground, surfaces, blocks, buildings, water and labels, in drawing order.
 * @param known districts whose contents are drawn (omitted = all); a feature belongs to the district its centre is in.
 */
export function drawWorldLayers(parent: SVGElement, data: WorldData, completedChapterIds: readonly string[], known?: ReadonlySet<string>): void {
  const shown = (reveal?: string): boolean => isShown(reveal, completedChapterIds);
  const inKnown = (x: number, z: number): boolean => known === undefined || known.has(districtAt(data.districts, x, z)?.id ?? '');
  const rectKnown = (r: Rect): boolean => inKnown((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  const isNew = (reveal?: string): string => (reveal === undefined ? '' : ' map-new');
  const rect = ({ x0, x1, z0, z1 }: Rect, cls: string): void => {
    parent.append(svgEl('rect', { x: x0, y: -z1, width: x1 - x0, height: z1 - z0, class: cls }));
  };
  const { bounds } = data;
  const areas = data.areas.filter((a) => shown(a.reveal) && rectKnown(a.rect));
  const buildings = data.buildings.filter((b) => shown(b.reveal) && rectKnown(b.rect));

  rect({ x0: bounds.minX, x1: bounds.maxX, z0: bounds.minZ, z1: bounds.maxZ }, 'map-ground');
  // Roads last among the surfaces, so they read as continuous strips.
  const surfaces = [...areas].sort((a, b) => Number(a.surface === 'road') - Number(b.surface === 'road'));
  for (const a of surfaces) rect(a.rect, MAP_CLASS[a.surface] + isNew(a.reveal));
  for (const s of data.solids) if (s.kind === 'block' && rectKnown(s.rect)) rect(s.rect, 'map-block');
  // Plain houses first, landmarks (Relay, Ember Bakery) on top.
  const ordered = [...buildings].sort((a, b) => Number(a.mapStyle !== 'house') - Number(b.mapStyle !== 'house'));
  for (const b of ordered) rect(b.rect, `map-${b.mapStyle}` + isNew(b.reveal));

  for (const p of data.pois) {
    if (!inKnown(p.x, p.z)) continue;
    if (p.kind === 'stall') parent.append(svgEl('rect', { x: p.x - 1.3, y: -p.z - 0.6, width: 2.6, height: 1.2, class: 'map-stall' }));
    if (p.kind !== 'fountain') continue;
    parent.append(svgEl('circle', { cx: p.x, cy: -p.z, r: p.radius ?? 2.5, class: 'map-water' }));
  }

  // Proper names stay in English in every language (they are data, not UI strings).
  for (const l of data.labels) {
    if (!shown(l.reveal) || !inKnown(l.x, l.z)) continue;
    const t = svgEl('text', { x: l.x, y: -l.z, class: LABEL_CLASS[l.style] + (l.reveal ? ' map-new-label' : ''), 'text-anchor': 'middle' });
    if (l.rotate) t.setAttribute('transform', `rotate(${l.rotate} ${l.x} ${-l.z})`);
    t.textContent = l.text;
    parent.append(t);
  }
}

/**
 * "You are here" arrow at the origin, pointing north; place it with
 * `translate(x −z) rotate(bearing)`. `size` is the arrow length in metres.
 */
export function playerMarker(size: number): SVGGElement {
  const g = svgEl('g', { class: 'map-player' });
  const s = size / 2;
  g.append(svgEl('circle', { r: s * 1.15, class: 'map-player-halo' }));
  g.append(svgEl('path', { d: `M 0 ${-s} L ${s * 0.75} ${s * 0.8} L 0 ${s * 0.35} L ${-s * 0.75} ${s * 0.8} Z`, class: 'map-player-arrow' }));
  return g;
}

/** Where a parcel is going (GPS only): a ringed dot at the origin; place it with `translate(x −z)`. */
export function targetMarker(size: number): SVGGElement {
  const g = svgEl('g', { class: 'map-target' });
  g.append(svgEl('circle', { r: size / 2, class: 'map-target-ring' }));
  g.append(svgEl('circle', { r: size / 5, class: 'map-target-dot' }));
  return g;
}

export function placeMarker(marker: SVGGElement, x: number, z: number, bearingDeg: number): void {
  marker.setAttribute('transform', `translate(${x.toFixed(2)} ${(-z).toFixed(2)}) rotate(${bearingDeg.toFixed(1)})`);
}
