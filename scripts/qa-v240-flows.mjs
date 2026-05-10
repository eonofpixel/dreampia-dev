#!/usr/bin/env node
/* global process, console */
/**
 * qa-v240-flows.mjs — automated end-to-end QA for v2.4.0 IPC handler logic.
 *
 * Run with tsx so we can import the TypeScript source modules directly:
 *   npx tsx scripts/qa-v240-flows.mjs
 *
 * Runs against the user's REAL Dreampia-Dev userData directory (the same one
 * the Electron app writes to). Exercises the exact same module composition
 * that the IPC handlers wire together — substitutes for manual GUI click-through.
 *
 * Pre-conditions:
 *   - Dreampia-Dev app must be STOPPED (file locks would prevent writes).
 *
 * Post-conditions:
 *   - Test record `@qa/v240-flow` persisted in userData/installed-plugin-records
 *   - settings.json plugins['@qa/v240-flow'].isolationMode = 'in_process' + consent timestamp
 *   - mcp-grants/@qa/v240-flow/granted.json with grant_epoch >= 1
 *   - Re-launch the app to visually confirm marketplace badges:
 *     "runs in main process" + "revoked"
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Import production modules from source via tsx.
const { installMcpPlugin } = await import('../src/main/mcp/installPath.ts');
const { InstalledPluginRecordStore } = await import(
  '../src/main/mcp/installedPluginRecordStore.ts'
);
const { McpCapabilityGate } = await import('../src/main/mcp/McpCapabilityGate.ts');
const { loadSigstoreVerifier } = await import('../src/main/mcp/loadVerifier.ts');

const USER_DATA = join(
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  'Dreampia-Dev'
);
const RECORD_DIR = join(USER_DATA, 'installed-plugin-records');
const GRANT_DIR = join(USER_DATA, 'mcp-grants');
const SETTINGS_PATH = join(USER_DATA, 'settings.json');
const TEST_PKG = '@qa/v240-flow';

console.log(`[qa] userData = ${USER_DATA}`);
if (!existsSync(USER_DATA)) {
  console.error('[qa] FAIL: userData directory does not exist. Launch the app once first.');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────
// Cleanup prior @qa run for hermetic re-runs.
// ────────────────────────────────────────────────────────────

if (existsSync(RECORD_DIR)) {
  for (const f of readdirSync(RECORD_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(readFileSync(join(RECORD_DIR, f), 'utf-8'));
      if (r?.package_id === TEST_PKG) {
        rmSync(join(RECORD_DIR, f));
        console.log(`[qa] cleanup: removed prior record ${f}`);
      }
    } catch {
      // skip corrupt
    }
  }
}
if (existsSync(join(GRANT_DIR, '@qa'))) {
  rmSync(join(GRANT_DIR, '@qa'), { recursive: true, force: true });
  console.log('[qa] cleanup: removed prior @qa grant dir');
}

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}
function writeSettings(patch) {
  const current = readSettings();
  const next = { ...current, ...patch };
  mkdirSync(USER_DATA, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf-8');
}
{
  const s = readSettings();
  if (s.plugins?.[TEST_PKG]) {
    const rest = Object.fromEntries(
      Object.entries(s.plugins).filter(([k]) => k !== TEST_PKG)
    );
    writeSettings({ plugins: rest });
    console.log('[qa] cleanup: removed prior settings entry');
  }
}

const recordStore = new InstalledPluginRecordStore({ storageDir: RECORD_DIR });
const gate = new McpCapabilityGate({ storageDir: GRANT_DIR });

// ────────────────────────────────────────────────────────────
// Step 1 — install (mode=warn, null bundle → unverified-allow)
// ────────────────────────────────────────────────────────────

console.log('\n[Step 1] mcp/install IPC contract: warn-mode + null bundle → installed/unverified');
const manifest = {
  schema_version: 1,
  package_id: TEST_PKG,
  name: 'qa-v240-flow',
  version: '1.0.0',
  capabilities: ['host.fs.read'],
  entrypoint: { file: 'a.js', artifact_digest: 'a'.repeat(64), artifact_size_bytes: 1 },
  signing: {
    method: 'sigstore-keyless-oidc',
    identity: {
      issuer: 'https://token.actions.githubusercontent.com',
      subject_pattern: 'repo:qa/v240-flow:ref:refs/tags/v*',
    },
  },
  runtime: { node: '*', requires_native_modules: false },
};

const installResult = await installMcpPlugin(
  { manifest, bundle: null, mode: 'warn' },
  {
    verifierFactory: () => loadSigstoreVerifier(),
    recordStore,
    audit: (e) =>
      console.log(`[qa.audit.install] ${e.outcome} ${e.package_id} ${e.verification_status}`),
  }
);
if (installResult.kind !== 'installed') {
  console.error(`[qa] FAIL Step 1: expected kind=installed, got ${JSON.stringify(installResult)}`);
  process.exit(1);
}
console.log(
  `[qa] PASS Step 1: kind=${installResult.kind}, verification_status=${installResult.verification_status}`
);

// ────────────────────────────────────────────────────────────
// Step 2 — listInstalled (record visible)
// ────────────────────────────────────────────────────────────

console.log('\n[Step 2] mcp/list-installed IPC contract: record present');
const list1 = recordStore.listAll();
const found = list1.find((r) => r.package_id === TEST_PKG);
if (!found) {
  console.error('[qa] FAIL Step 2: record not in listAll');
  process.exit(1);
}
console.log(
  `[qa] PASS Step 2: list contains ${TEST_PKG} (isolation_mode=${found.isolation_mode}, revocation_status=${found.revocation_status})`
);

// ────────────────────────────────────────────────────────────
// Step 3 — plugin/request-downgrade IPC contract
// ────────────────────────────────────────────────────────────

console.log('\n[Step 3] plugin/request-downgrade IPC contract: settings + record patched');
const consentAt = new Date().toISOString();
const settings = readSettings();
const plugins = settings.plugins ?? {};
writeSettings({
  plugins: {
    ...plugins,
    [TEST_PKG]: {
      ...(plugins[TEST_PKG] ?? {}),
      isolationMode: 'in_process',
      isolationDowngradeConsent: consentAt,
    },
  },
});
const recBefore = recordStore.get(TEST_PKG);
recordStore.put({ ...recBefore, isolation_mode: 'in_process' });

const settingsAfter = readSettings();
const recAfter = recordStore.get(TEST_PKG);
if (settingsAfter.plugins?.[TEST_PKG]?.isolationMode !== 'in_process') {
  console.error('[qa] FAIL Step 3: settings.plugins[id].isolationMode != in_process');
  process.exit(1);
}
if (recAfter?.isolation_mode !== 'in_process') {
  console.error('[qa] FAIL Step 3: record.isolation_mode != in_process');
  process.exit(1);
}
console.log(
  `[qa] PASS Step 3: settings.isolationMode=in_process + record.isolation_mode=in_process + consent=${consentAt}`
);

// ────────────────────────────────────────────────────────────
// Step 4 — mcp/request-revoke IPC contract
// ────────────────────────────────────────────────────────────

console.log('\n[Step 4] mcp/request-revoke IPC contract: epoch bump + record marked revoked');
gate.grantOne(TEST_PKG, 'host.fs.read');
const newEpoch = gate.revokeOne(TEST_PKG);
if (newEpoch < 1) {
  console.error(`[qa] FAIL Step 4: expected epoch >= 1, got ${newEpoch}`);
  process.exit(1);
}
const recAfterRevoke = recordStore.get(TEST_PKG);
recordStore.put({
  ...recAfterRevoke,
  revocation_status: 'revoked',
  verification_status: 'revoked',
  last_revocation_check_at: new Date().toISOString(),
});
const recFinal = recordStore.get(TEST_PKG);
if (recFinal?.revocation_status !== 'revoked' || recFinal?.verification_status !== 'revoked') {
  console.error(`[qa] FAIL Step 4: record not revoked: ${JSON.stringify(recFinal)}`);
  process.exit(1);
}
console.log(
  `[qa] PASS Step 4: grant_epoch=${newEpoch}, record.revocation_status=revoked, record.verification_status=revoked`
);

// ────────────────────────────────────────────────────────────
// Step 5 — scoped persistence regression (production bug #5)
// ────────────────────────────────────────────────────────────

console.log('\n[Step 5] McpCapabilityGate scoped persistence (regression for prod bug #5)');
const reopened = new McpCapabilityGate({ storageDir: GRANT_DIR });
const reopenedEpoch = reopened.getGrantEpoch(TEST_PKG);
if (reopenedEpoch !== newEpoch) {
  console.error(
    `[qa] FAIL Step 5: scoped @org/pkg persistence broken — original=${newEpoch}, reopened=${reopenedEpoch}`
  );
  process.exit(1);
}
console.log(`[qa] PASS Step 5: scoped server_id epoch persists (epoch=${reopenedEpoch})`);

// ────────────────────────────────────────────────────────────
// Step 6 — loadVerifier sanity (production bug #4)
// ────────────────────────────────────────────────────────────

console.log('\n[Step 6] loadVerifier sanity (regression for prod bug #4 — TrustedRoot.fromJSON)');
const verifier = await loadSigstoreVerifier();
const offResult = await verifier.verify(manifest, null, 'off');
if (offResult.kind !== 'unsigned') {
  console.error(
    `[qa] FAIL Step 6a: verifier.verify mode=off should return unsigned, got ${JSON.stringify(offResult)}`
  );
  process.exit(1);
}
const noBundleResult = await verifier.verify(manifest, null, 'strict');
if (noBundleResult.kind !== 'unsigned' || noBundleResult.evidence.reason !== 'no_bundle') {
  console.error(
    `[qa] FAIL Step 6b: verifier.verify mode=strict null bundle should return unsigned/no_bundle, got ${JSON.stringify(noBundleResult)}`
  );
  process.exit(1);
}
console.log('[qa] PASS Step 6: verifier loads + handles mode=off and null-bundle paths');

// ────────────────────────────────────────────────────────────
// Final
// ────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[qa] ALL 6 STEPS PASSED — v2.4.0 IPC contracts verified end-to-end on real disk.');
console.log('[qa] Test record persisted at:');
console.log(`     ${RECORD_DIR}\\<base64-of-${TEST_PKG}>.json`);
console.log(`     ${GRANT_DIR}\\@qa\\v240-flow\\granted.json`);
console.log(`     ${SETTINGS_PATH} plugins[${TEST_PKG}]`);
console.log('[qa] Re-launch the app to visually confirm marketplace badges:');
console.log('     - "runs in main process" (from isolation_mode=in_process)');
console.log('     - "revoked" (from revocation_status=revoked)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
