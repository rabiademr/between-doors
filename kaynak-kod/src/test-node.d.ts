// The one Node API the unit tests use (Vitest runs on Node; @types/node is not a dependency).
// Game code must never import it — the browser build has no file system.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
