#!/usr/bin/env node
/**
 * copy-build-assets.cjs — copy non-import asset files from src/ → dist/
 * after vite build.
 *
 * Spec: v2.3.0 release prep (hotfix wiring).
 *
 * vite-plugin-electron only emits modules referenced via `import`. Asset
 * files that are read at runtime via `fs.readFileSync` (e.g. the bundled
 * Sigstore TUF root) are NOT copied automatically. This script bridges
 * that gap.
 *
 * Files copied:
 *   src/main/mcp/sigstoreRoot.json      → dist/main/mcp/sigstoreRoot.json
 *   src/main/mcp/sigstoreRoot.meta.json → dist/main/mcp/sigstoreRoot.meta.json
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'main', 'mcp');

// vite bundles `src/main/mcp/loadVerifier.ts` into a flat `dist/main/loadVerifier-<hash>.js`.
// At runtime loadVerifier resolves `import.meta.url` -> `dist/main/`, so the trusted root
// must sit beside it. We also keep a copy at `dist/main/mcp/` to mirror the source tree
// for any tooling (release-checklist scripts, sigstore audit) that walks the original path.
const DEST_FLAT = path.join(ROOT, 'dist', 'main');
const DEST_NESTED = path.join(ROOT, 'dist', 'main', 'mcp');

const ASSETS = ['sigstoreRoot.json', 'sigstoreRoot.meta.json'];

function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist'))) {
    console.error("[copy-build-assets] dist/ not found — run 'npm run build' first.");
    process.exit(2);
  }
  fs.mkdirSync(DEST_FLAT, { recursive: true });
  fs.mkdirSync(DEST_NESTED, { recursive: true });
  let copied = 0;
  for (const name of ASSETS) {
    const src = path.join(SRC, name);
    if (!fs.existsSync(src)) {
      console.warn(`[copy-build-assets] source missing, skip: ${src}`);
      continue;
    }
    for (const dest of [DEST_FLAT, DEST_NESTED]) {
      const dst = path.join(dest, name);
      fs.copyFileSync(src, dst);
      const size = fs.statSync(dst).size;
      console.log(`[copy-build-assets] copied ${name} (${size} bytes) → ${dst}`);
      copied += 1;
    }
  }
  console.log(`[copy-build-assets] OK — ${copied} file(s) copied.`);
}

main();
