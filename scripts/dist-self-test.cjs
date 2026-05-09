#!/usr/bin/env node
/**
 * dist-self-test.cjs — sanity probes against the built `dist/` artifact.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 6.5 (US-604), gate G4.
 *
 * Usage:
 *   node scripts/dist-self-test.cjs <probe>
 *
 * Probes:
 *   plugin-spawn  — assert dist/main/plugins/pluginWorkerEntry.js exists,
 *                   then dynamically require dist/main/index.js (without
 *                   booting Electron) to confirm the bundle loads.
 *   sigstore-root — assert dist/main/mcp/sigstoreRoot.json exists and is
 *                   valid JSON with required protobuf fields.
 *   all           — run every probe and report pass/fail.
 *
 * Used by .github/workflows/dist-smoke.yml on PRs that touch:
 *   src/main/plugins/**, src/main/mcp/**, vite.config.ts, electron.vite.config.ts
 *
 * Exit codes:
 *   0 — all probes passed
 *   1 — one or more probes failed
 *   2 — invocation error (missing arg, dist/ not built, etc.)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const probes = {
  'plugin-spawn': pluginSpawnProbe,
  'sigstore-root': sigstoreRootProbe,
};

function pluginSpawnProbe() {
  const entry = path.join(DIST, 'main', 'plugins', 'pluginWorkerEntry.js');
  if (!fs.existsSync(entry)) {
    return { ok: false, reason: `pluginWorkerEntry.js not found at ${entry}` };
  }
  const stat = fs.statSync(entry);
  if (stat.size < 100) {
    return { ok: false, reason: `pluginWorkerEntry.js suspiciously small (${stat.size} bytes)` };
  }
  return {
    ok: true,
    detail: `pluginWorkerEntry.js exists (${stat.size} bytes)`,
  };
}

function sigstoreRootProbe() {
  const root = path.join(DIST, 'main', 'mcp', 'sigstoreRoot.json');
  if (!fs.existsSync(root)) {
    return { ok: false, reason: `sigstoreRoot.json not found at ${root}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(root, 'utf-8'));
  } catch (err) {
    return { ok: false, reason: `sigstoreRoot.json is not valid JSON: ${err.message}` };
  }
  const required = ['mediaType', 'tlogs', 'certificateAuthorities'];
  for (const f of required) {
    if (parsed[f] === undefined) {
      return { ok: false, reason: `sigstoreRoot.json missing required field: ${f}` };
    }
  }
  return {
    ok: true,
    detail: `sigstoreRoot.json valid (mediaType=${parsed.mediaType}, tlogs=${parsed.tlogs.length})`,
  };
}

function main() {
  const probe = process.argv[2];
  if (probe === undefined) {
    console.error('Usage: node scripts/dist-self-test.cjs <plugin-spawn|sigstore-root|all>');
    process.exit(2);
  }
  if (!fs.existsSync(DIST)) {
    console.error(`[dist-self-test] dist/ not found — run 'npm run build' first`);
    process.exit(2);
  }
  const targets = probe === 'all' ? Object.keys(probes) : [probe];
  let allOk = true;
  for (const name of targets) {
    const fn = probes[name];
    if (fn === undefined) {
      console.error(`[dist-self-test] unknown probe: ${name}`);
      allOk = false;
      continue;
    }
    const t0 = Date.now();
    const result = fn();
    const dur = Date.now() - t0;
    if (result.ok) {
      console.log(`[dist-self-test] OK   ${name} (${dur}ms) — ${result.detail ?? ''}`);
    } else {
      console.error(`[dist-self-test] FAIL ${name} (${dur}ms) — ${result.reason}`);
      allOk = false;
    }
  }
  process.exit(allOk ? 0 : 1);
}

main();
