/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { assetPacks } from './build/assetPacks.mjs';

// Build modes:
//  - `npm run build` (mode "zip", the course delivery): dist/ with index.html + one classic script + asset
//    packs (packs/<kit>.js). Opens by double-clicking index.html (file://): no ES modules, no fetch.
//  - `npm run build:single` (mode "single"): everything inlined into ONE dist-single/index.html (v1 style).
//  - `npm run build:web` (mode "web"): normal multi-file build into dist-web/ (hosting, Electron/Steam later).
export default defineConfig(({ mode }) => {
  const zip = mode === 'zip';
  const single = mode === 'single';
  const web = mode === 'web';
  return {
    base: './',
    plugins: zip ? [classicScript(), assetPacks()] : single ? [viteSingleFile()] : [],
    resolve: {
      alias: {
        // Where models/textures come from: script packs in the zip build, Vite URLs everywhere else.
        '@asset-source': zip ? '/src/assets/source.packs.ts' : '/src/assets/source.bundled.ts',
      },
    },
    assetsInclude: ['**/*.glb'],
    build: {
      outDir: web ? 'dist-web' : single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      // Single-file build: inline every asset (models included) as data URIs.
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      chunkSizeWarningLimit: 10_000,
      modulePreload: zip ? false : undefined,
      // Zip build: one classic (IIFE) script — file:// can't load ES modules.
      rollupOptions: zip ? { output: { format: 'iife' as const, inlineDynamicImports: true, entryFileNames: 'game.js', assetFileNames: '[name][extname]' } } : undefined,
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});

/** index.html: the bundle as a plain deferred script (no type="module", no crossorigin — both break file://). */
function classicScript(): Plugin {
  return {
    name: 'bd-classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ');
    },
  };
}
