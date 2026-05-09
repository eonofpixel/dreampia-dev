#!/usr/bin/env node
/**
 * refresh-sigstore-root.cjs — fetch the current Sigstore TUF root and write
 * it to src/main/mcp/sigstoreRoot.json.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 2.3 (US-202), gate G2.
 *
 * Usage:
 *   node scripts/refresh-sigstore-root.cjs
 *
 * Run before each release and whenever Sigstore rotates the TUF root
 * (~yearly). The release-checklist warns if `now - lastTufRefresh > 6mo`
 * (AC-6.7).
 *
 * Network: contacts https://tuf-repo-cdn.sigstore.dev. Air-gapped users
 * cannot run this; they obtain the JSON via app auto-update channel only.
 *
 * The runtime app NEVER calls this — verify-time loads the bundled JSON.
 * This is a build-time / release-prep tool only.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGET = path.resolve(__dirname, '..', 'src', 'main', 'mcp', 'sigstoreRoot.json');
const META_TARGET = path.resolve(__dirname, '..', 'src', 'main', 'mcp', 'sigstoreRoot.meta.json');

async function main() {
  const tuf = require('@sigstore/tuf');
  console.log('[refresh-sigstore-root] fetching current TUF root from', tuf.DEFAULT_MIRROR_URL);
  const root = await tuf.getTrustedRoot({ force: true });

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(root, null, 2) + '\n', 'utf-8');

  const meta = {
    generated_at: new Date().toISOString(),
    media_type: root.mediaType,
    tlog_count: root.tlogs.length,
    cert_authorities_count: root.certificateAuthorities.length,
    ctlog_count: root.ctlogs.length,
    timestamp_authorities_count: root.timestampAuthorities.length,
    mirror_url: tuf.DEFAULT_MIRROR_URL,
    package_version: require('@sigstore/tuf/package.json').version,
    note:
      'Refreshed by scripts/refresh-sigstore-root.cjs. ' +
      'Release checklist warns if generated_at is older than 6 months (AC-6.7).',
  };
  fs.writeFileSync(META_TARGET, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  console.log('[refresh-sigstore-root] wrote', TARGET);
  console.log('[refresh-sigstore-root] wrote', META_TARGET);
  console.log('  media_type:', meta.media_type);
  console.log('  tlogs:', meta.tlog_count);
  console.log('  cert_authorities:', meta.cert_authorities_count);
}

main().catch((err) => {
  console.error('[refresh-sigstore-root] FAIL:', err);
  process.exit(1);
});
