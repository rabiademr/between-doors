// Asset source for the dev server, the single-file build and the web build: every asset is a Vite
// `?url` import (a data: URL in the single-file build, a file URL otherwise).
// Selected by the `@asset-source` alias in vite.config.ts; the zip build uses source.packs.ts instead.
import { readBytes } from './bytes';

const URLS = import.meta.glob<string>(['./models/**/*.glb', './textures/**/*.png'], {
  eager: true,
  query: '?url',
  import: 'default',
});

function urlOf(id: string): string {
  const url = URLS[`./${id}`];
  if (!url) throw new Error(`Unknown asset: ${id}`);
  return url;
}

/** The asset's bytes. */
export function assetBytes(id: string): Promise<Uint8Array> {
  return Promise.resolve().then(() => readBytes(urlOf(id)));
}

/** A URL the browser can load directly (textures). */
export function assetUrl(id: string): Promise<string> {
  return Promise.resolve().then(() => urlOf(id));
}

/** Ids of all known assets (tests / debugging). */
export function assetIds(): string[] {
  return Object.keys(URLS).map((k) => k.slice(2));
}
