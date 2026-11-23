// Asset source for the zip build (opened by double-clicking index.html, file://): assets live in
// packs/<kit>.js files next to index.html. A pack is a classic script that calls
// window.__BD_PACK__(kit, { id: base64 }) — <script src> works on file:// where fetch does not.
// Selected by the `@asset-source` alias in vite.config.ts (mode "zip").
import { base64ToBytes, mimeOf } from './bytes';
import { PACK_CALLBACK, kitOf, packFileName } from './packKit';

type Pack = Record<string, string>;

const packs = new Map<string, Promise<Pack>>();
const waiting = new Map<string, (pack: Pack) => void>();
const blobUrls = new Map<string, Promise<string>>();

(window as unknown as Record<string, unknown>)[PACK_CALLBACK] = (kit: string, pack: Pack): void => {
  waiting.get(kit)?.(pack);
  waiting.delete(kit);
};

function loadPack(kit: string): Promise<Pack> {
  let p = packs.get(kit);
  if (!p) {
    p = new Promise<Pack>((resolve, reject) => {
      waiting.set(kit, resolve);
      const script = document.createElement('script');
      script.src = packFileName(kit);
      script.async = true;
      script.onerror = () => {
        waiting.delete(kit);
        packs.delete(kit); // a later call may retry (e.g. "Try again")
        reject(new Error(`Asset pack missing or unreadable: ${packFileName(kit)}`));
      };
      document.head.append(script);
    });
    packs.set(kit, p);
  }
  return p;
}

/** The asset's bytes. */
export async function assetBytes(id: string): Promise<Uint8Array> {
  const pack = await loadPack(kitOf(id));
  const data = pack[id];
  if (data === undefined) throw new Error(`Unknown asset: ${id}`);
  return base64ToBytes(data);
}

/** A URL the browser can load directly (textures): a blob: URL made once per asset. */
export function assetUrl(id: string): Promise<string> {
  let u = blobUrls.get(id);
  if (!u) {
    u = assetBytes(id).then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(id) })));
    blobUrls.set(id, u);
  }
  return u;
}

/** Ids of the packs loaded so far (debugging). */
export function assetIds(): string[] {
  return [];
}
