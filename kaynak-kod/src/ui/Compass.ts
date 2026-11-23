// View: compass upgrade (top right). The card — letters, ticks and the red north needle — turns with the
// view; the fixed mark at the top is where you are looking. It shows the facing direction only, never the
// target (CEO decision 2026-11-13).
import { STRINGS } from '../i18n';
import { windOf } from '../player/cameraMath';
import { svgEl } from './mapLayers';

const R = 40; // dial radius in SVG units (viewBox −50…50)
/** Skip DOM updates for turns smaller than this (degrees). */
const MIN_STEP = 0.4;

export class Compass {
  readonly element: HTMLElement;
  private readonly card: SVGGElement;
  private readonly letters: SVGTextElement[] = [];
  private bearing: number | null = null;
  private wind = '';

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'compass';
    this.element.setAttribute('role', 'img');
    this.element.hidden = true;

    const svg = svgEl('svg', { viewBox: '-50 -50 100 100', 'aria-hidden': 'true' });
    svg.append(svgEl('circle', { r: R + 6, class: 'compass-bezel' }));
    svg.append(svgEl('circle', { r: R, class: 'compass-face' }));

    this.card = svgEl('g', { class: 'compass-card' });
    for (let deg = 0; deg < 360; deg += 15) {
      const major = deg % 90 === 0;
      const minor = deg % 45 !== 0;
      if (major) continue; // letters stand there
      const len = minor ? 4 : 7;
      this.card.append(
        svgEl('line', { x1: 0, y1: -R + 1, x2: 0, y2: -R + 1 + len, transform: `rotate(${deg})`, class: minor ? 'compass-tick' : 'compass-tick major' }),
      );
    }
    for (const [i, deg] of [0, 90, 180, 270].entries()) {
      const t = svgEl('text', { x: 0, y: -R + 13, transform: `rotate(${deg})`, 'text-anchor': 'middle', class: i === 0 ? 'compass-letter north' : 'compass-letter' });
      this.letters.push(t);
      this.card.append(t);
    }
    // Needle: red half points north, pale half south.
    this.card.append(svgEl('path', { d: 'M 0 -24 L 5 0 L -5 0 Z', class: 'compass-needle-n' }));
    this.card.append(svgEl('path', { d: 'M 0 24 L 5 0 L -5 0 Z', class: 'compass-needle-s' }));
    svg.append(this.card);
    svg.append(svgEl('circle', { r: 3.2, class: 'compass-pin' }));
    // Lubber mark: the direction you face.
    svg.append(svgEl('path', { d: `M 0 ${-R - 1} L 4.5 ${-R - 8} L -4.5 ${-R - 8} Z`, class: 'compass-lubber' }));

    this.element.append(svg);
    this.refreshLanguage();
  }

  /** Letters follow the language (N/E/S/W ↔ K/D/G/B). */
  refreshLanguage(): void {
    const w = STRINGS.winds;
    [w.N, w.E, w.S, w.W].forEach((text, i) => {
      const letter = this.letters[i];
      if (letter) letter.textContent = text;
    });
    this.wind = '';
    if (this.bearing !== null) this.set(this.bearing, true);
  }

  /** @param bearing degrees the view faces (0 = north), or null to hide (upgrade not owned). */
  set(bearing: number | null, force = false): void {
    if (bearing === null) {
      this.element.hidden = true;
      this.bearing = null;
      return;
    }
    this.element.hidden = false;
    if (!force && this.bearing !== null && angleGap(bearing, this.bearing) < MIN_STEP) return;
    this.bearing = bearing;
    this.card.setAttribute('transform', `rotate(${(-bearing).toFixed(1)})`);
    const wind = STRINGS.winds[windOf(bearing)];
    if (wind !== this.wind) {
      this.wind = wind;
      this.element.setAttribute('aria-label', `${STRINGS.compassLabel} ${wind}`);
      this.element.title = `${STRINGS.compassLabel} ${wind}`;
    }
  }
}

function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
