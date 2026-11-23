// Shared helpers for the asset sources (no Babylon).

/** Bytes from a data: URL (single-file build) or a normal URL (dev server, web build). */
export async function readBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith('data:')) return base64ToBytes(url.slice(url.indexOf(',') + 1));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Decode base64 (works on file://, no fetch). */
export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** MIME type by file extension (for blob URLs of textures). */
export function mimeOf(id: string): string {
  if (id.endsWith('.png')) return 'image/png';
  if (id.endsWith('.jpg') || id.endsWith('.jpeg')) return 'image/jpeg';
  if (id.endsWith('.webp')) return 'image/webp';
  if (id.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}
