import './style.css';
import { GameApp } from './app/GameApp';
import { STRINGS, detectLanguage, setLanguage } from './i18n';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element missing');

try {
  const app = new GameApp(root);
  // Dev-only debug handle for browser tests; stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: GameApp }).__game = app;
  }
} catch (err) {
  // Typically: no WebGL (disabled, blocked or unsupported). Show why instead of a blank page (NFR-08).
  console.error('Between Doors could not start.', err);
  setLanguage(detectLanguage(navigator.languages ?? [navigator.language]));
  const box = document.createElement('div');
  box.className = 'panel start-error';
  box.setAttribute('role', 'alert');
  const h = document.createElement('h2');
  h.textContent = STRINGS.webglErrorTitle;
  const p = document.createElement('p');
  p.textContent = STRINGS.webglErrorBody;
  box.append(h, p);
  root.replaceChildren(box);
}
