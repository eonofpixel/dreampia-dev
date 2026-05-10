#!/usr/bin/env node
/**
 * gen-mcp-fixtures.cjs — recompute MCP install fixture digest + size.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.5 (US-204).
 * Test: e2e/mcp-install-signed.spec.ts
 *
 * What this does:
 *   1. Reads e2e/fixtures/mcp/sample-fs-mcp/index.js
 *   2. Recomputes sha256 + byte size
 *   3. Patches manifest.json entrypoint.artifact_digest + artifact_size_bytes
 *
 * What this does NOT do:
 *   - Generate a Sigstore bundle. That requires a GitHub Actions OIDC token
 *     (`id-token: write`) and `gh attestation build`. Bundle regeneration is
 *     a release-time CI step. See e2e/fixtures/mcp/sample-fs-mcp/README.md.
 *
 * Usage:
 *   node scripts/gen-mcp-fixtures.cjs
 *
 * The runtime app NEVER calls this — fixture-time / build-time only.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FIXTURE_DIR = path.resolve(__dirname, '..', 'e2e', 'fixtures', 'mcp', 'sample-fs-mcp');
const ENTRY = path.join(FIXTURE_DIR, 'index.js');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

function fail(msg) {
  console.error(`[gen-mcp-fixtures] ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(ENTRY)) fail(`missing entry: ${ENTRY}`);
  if (!fs.existsSync(MANIFEST)) fail(`missing manifest: ${MANIFEST}`);

  const buf = fs.readFileSync(ENTRY);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  const size = buf.length;

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  manifest.entrypoint = {
    ...manifest.entrypoint,
    artifact_digest: digest,
    artifact_size_bytes: size,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  console.log('[gen-mcp-fixtures] updated', path.relative(process.cwd(), MANIFEST));
  console.log('  artifact_digest:', digest);
  console.log('  artifact_size_bytes:', size);
  console.log();
  console.log('[gen-mcp-fixtures] note: bundle.sigstore must be regenerated separately');
  console.log('  via `gh attestation build` — see e2e/fixtures/mcp/sample-fs-mcp/README.md');
}

try {
  main();
} catch (err) {
  fail(err && err.stack ? err.stack : String(err));
}
