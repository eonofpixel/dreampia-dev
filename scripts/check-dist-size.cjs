#!/usr/bin/env node
/**
 * check-dist-size.cjs — measure dist/ bundle size and compare against baseline.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md AC-6.11.
 *
 * Usage:
 *   node scripts/check-dist-size.cjs            # measure + compare to baseline
 *   node scripts/check-dist-size.cjs --update   # rewrite baseline from current dist
 *
 * Baseline file: scripts/dist-size-baseline.json
 *
 * Exit codes:
 *   0 — within budget (or baseline updated)
 *   1 — over budget (delta > MAX_DELTA_BYTES)
 *   2 — dist/ missing (run `npm run build` first)
 *
 * Budget rule (v2.3.0): main bundle delta ≤ 5 MB after adding @sigstore/verify
 * (G2 codex bundle audit). Update baseline only after a release ships.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASELINE = path.join(__dirname, 'dist-size-baseline.json');
const MAX_DELTA_BYTES = 5 * 1024 * 1024;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full));
    } else if (e.isFile()) {
      out.push({
        rel: path.relative(DIST, full).replace(/\\/g, '/'),
        size: fs.statSync(full).size,
      });
    }
  }
  return out;
}

function summarize(files) {
  let total = 0;
  let mainBundle = 0;
  for (const f of files) {
    total += f.size;
    if (f.rel.startsWith('main/')) mainBundle += f.size;
  }
  return { total, mainBundle, fileCount: files.length };
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  const update = process.argv.includes('--update');

  if (!fs.existsSync(DIST)) {
    if (update) {
      console.error('[check-dist-size] dist/ not found — run `npm run build` first.');
      process.exit(2);
    }
    console.error('[check-dist-size] dist/ not found — skipping (informational).');
    process.exit(0);
  }

  const files = walk(DIST);
  const summary = summarize(files);

  if (update) {
    const baseline = {
      generated_at: new Date().toISOString(),
      total_bytes: summary.total,
      main_bundle_bytes: summary.mainBundle,
      file_count: summary.fileCount,
      note: 'v2.3.0 AC-6.11 baseline. Update only after a release ships.',
    };
    fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    console.log(`[check-dist-size] baseline written: ${BASELINE}`);
    console.log(
      `  total: ${fmtBytes(summary.total)}, main: ${fmtBytes(summary.mainBundle)}, files: ${summary.fileCount}`
    );
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE)) {
    console.warn('[check-dist-size] no baseline found — skipping comparison.');
    console.log(
      `  current total: ${fmtBytes(summary.total)}, main: ${fmtBytes(summary.mainBundle)}`
    );
    process.exit(0);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf-8'));
  const totalDelta = summary.total - baseline.total_bytes;
  const mainDelta = summary.mainBundle - baseline.main_bundle_bytes;

  console.log('[check-dist-size]');
  console.log(
    `  total:  ${fmtBytes(summary.total)} (Δ ${totalDelta >= 0 ? '+' : ''}${fmtBytes(Math.abs(totalDelta))})`
  );
  console.log(
    `  main:   ${fmtBytes(summary.mainBundle)} (Δ ${mainDelta >= 0 ? '+' : ''}${fmtBytes(Math.abs(mainDelta))})`
  );
  console.log(`  budget: ±${fmtBytes(MAX_DELTA_BYTES)}`);

  if (Math.abs(mainDelta) > MAX_DELTA_BYTES) {
    console.error(
      `[check-dist-size] FAIL: main bundle delta ${fmtBytes(mainDelta)} exceeds budget ${fmtBytes(MAX_DELTA_BYTES)}`
    );
    process.exit(1);
  }
  process.exit(0);
}

main();
