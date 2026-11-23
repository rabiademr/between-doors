// View: round minimap (GPS skill — live position). North is up, like the sketch map, so the street names
// stay readable; the arrow in the middle turns with the player. Drawn from the same map layers as the
// 3D scene and the sketch map (M).
import { BELLWICK } from '../content/world';
import type { WorldData } from '../domain/world/worldData';
import { STRINGS } from '../i18n';
import { drawWorldLayers, placeMarker, playerMarker, svgEl, targetMarker } from './mapLayers';

/** Half-width of the visible square, metres. */
const VIEW_RADIUS = 20;
/** Skip DOM updates for smaller moves (metres / degrees). */
const MIN_MOVE = 0.05;
const MIN_TURN = 1;

export class Minimap {
  readonly element: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly marker: SVGGElement;
  private readonly target: SVGGElement;
  private lastTarget = '';
  private readonly northEl: HTMLElement;
  private drawnFor: string | null = null;
  private last = { x: Number.NaN, z: Number.NaN, bearing: Number.NaN };
  private readonly data: WorldData;

  constructor(data: WorldData = BELLWICK) {
    this.data = data;
    this.element = document.createElement('div');
    this.element.className = 'minimap';
    this.element.setAttribute('role', 'img');
    this.element.hidden = true;

    this.svg = svgEl('svg', { class: 'sketch-map minimap-map', 'aria-hidden': 'true' });
    this.svg.append(svgEl('rect', { x: -1e4, y: -1e4, width: 2e4, height: 2e4, class: 'minimap-outside' }));
    this.world = svgEl('g');
    this.marker = playerMarker(3.2);
    this.target = targetMarker(3.4);
    this.target.setAttribute('display', 'none');
    this.svg.append(this.world, this.target, this.marker);

    this.northEl = document.createElement('span');
    this.northEl.className = 'minimap-north';
    this.northEl.setAttribute('aria-hidden', 'true');
    this.element.append(this.svg, this.northEl);
    this.refreshLanguage();
  }

  refreshLanguage(): void {
    this.element.setAttribute('aria-label', STRINGS.minimapLabel);
    this.northEl.textContent = STRINGS.winds.N;
  }

  /** Redraw the map layers when the set of completed chapters changes (revealed places). */
  setCompleted(completedChapterIds: readonly string[]): void {
    const key = completedChapterIds.join(',');
    if (key === this.drawnFor) return;
    this.drawnFor = key;
    this.world.replaceChildren();
    drawWorldLayers(this.world, this.data, completedChapterIds);
  }

  /**
   * @param you player position and facing bearing (0 = north), or null to hide (no GPS).
   * @param goal where the parcel in hand is going; off the edge of the view it sits on the rim, towards it.
   */
  update(you: { x: number; z: number; bearing: number } | null, goal: { x: number; z: number } | null = null): void {
    if (you === null) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    const { x, z, bearing } = you;
    if (goal === null) {
      if (this.lastTarget !== '') this.target.setAttribute('display', 'none');
      this.lastTarget = '';
    } else {
      const dx = goal.x - x;
      const dz = goal.z - z;
      const d = Math.hypot(dx, dz);
      const k = d > VIEW_RADIUS - 2 ? (VIEW_RADIUS - 2) / d : 1;
      const at = `translate(${(x + dx * k).toFixed(1)} ${(-(z + dz * k)).toFixed(1)})`;
      if (at !== this.lastTarget) {
        this.target.setAttribute('transform', at);
        this.target.setAttribute('display', 'inline');
        this.target.classList.toggle('map-target-far', k < 1);
        this.lastTarget = at;
      }
    }
    const moved = !(Math.abs(x - this.last.x) < MIN_MOVE && Math.abs(z - this.last.z) < MIN_MOVE);
    const turned = !(Math.abs(bearing - this.last.bearing) < MIN_TURN);
    if (!moved && !turned) return;
    if (moved) {
      const r = VIEW_RADIUS;
      this.svg.setAttribute('viewBox', `${(x - r).toFixed(2)} ${(-z - r).toFixed(2)} ${2 * r} ${2 * r}`);
    }
    placeMarker(this.marker, x, z, bearing);
    this.last = { x, z, bearing };
  }
}
