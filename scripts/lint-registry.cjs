#!/usr/bin/env node
/**
 * lint-registry.cjs — validate marketplace registry artifacts.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 3.4 (US-303).
 * Schema doc: docs/marketplace/SCHEMA.md.
 *
 * Validates:
 *   - docs/marketplace/registry.json
 *   - docs/marketplace/trusted_identities.json
 *
 * Exits 0 on success, 1 on any violation.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs', 'marketplace', 'registry.json');
const TRUSTED = path.join(ROOT, 'docs', 'marketplace', 'trusted_identities.json');

const PACKAGE_ID_RE = /^(@[a-zA-Z0-9][a-zA-Z0-9_-]*\/)?[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const CATEGORY_RE = /^[a-z0-9_-]+$/;
const errors = [];

function loadJson(file) {
  if (!fs.existsSync(file)) {
    errors.push(`missing file: ${path.relative(ROOT, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    errors.push(`invalid JSON in ${path.relative(ROOT, file)}: ${err.message}`);
    return null;
  }
}

function isIso8601(s) {
  return typeof s === 'string' && Number.isFinite(Date.parse(s));
}

function isHttpsUrl(s) {
  return typeof s === 'string' && /^https:\/\//.test(s);
}

function lintRegistry(reg) {
  if (reg === null) return;
  if (reg.schema_version !== 1) errors.push('registry.schema_version must be 1');
  if (!isIso8601(reg.generated_at)) errors.push('registry.generated_at must be ISO 8601');
  if (!Array.isArray(reg.entries)) {
    errors.push('registry.entries must be an array');
    return;
  }
  const seenPkg = new Set();
  for (let i = 0; i < reg.entries.length; i += 1) {
    const e = reg.entries[i];
    const tag = `registry.entries[${i}]`;
    if (!e || typeof e !== 'object') {
      errors.push(`${tag}: not an object`);
      continue;
    }
    if (!PACKAGE_ID_RE.test(e.package_id || '')) errors.push(`${tag}.package_id invalid: ${e.package_id}`);
    if (typeof e.name !== 'string' || e.name.length === 0 || e.name.length > 128) errors.push(`${tag}.name invalid`);
    if (typeof e.description !== 'string' || e.description.length > 1024) errors.push(`${tag}.description invalid`);
    if (!isHttpsUrl(e.manifest_url)) errors.push(`${tag}.manifest_url must be https URL`);
    if (!isHttpsUrl(e.homepage)) errors.push(`${tag}.homepage must be https URL`);
    if (typeof e.publisher_id !== 'string' || e.publisher_id.length === 0) errors.push(`${tag}.publisher_id missing`);
    if (!Array.isArray(e.categories) || e.categories.length > 16) {
      errors.push(`${tag}.categories invalid (max 16)`);
    } else {
      for (const c of e.categories) {
        if (typeof c !== 'string' || c.length > 32 || !CATEGORY_RE.test(c)) {
          errors.push(`${tag}.categories has invalid entry: ${c}`);
        }
      }
    }
    if (!isIso8601(e.added_at)) errors.push(`${tag}.added_at must be ISO 8601`);
    if (seenPkg.has(e.package_id)) errors.push(`${tag} duplicate package_id: ${e.package_id}`);
    seenPkg.add(e.package_id);
  }
}

function lintTrusted(tr) {
  if (tr === null) return;
  if (tr.schema_version !== 1) errors.push('trusted_identities.schema_version must be 1');
  if (!isIso8601(tr.generated_at)) errors.push('trusted_identities.generated_at must be ISO 8601');
  if (!Array.isArray(tr.publishers)) {
    errors.push('trusted_identities.publishers must be an array');
    return;
  }
  const seenPub = new Set();
  for (let i = 0; i < tr.publishers.length; i += 1) {
    const p = tr.publishers[i];
    const tag = `trusted_identities.publishers[${i}]`;
    if (!p || typeof p !== 'object') {
      errors.push(`${tag}: not an object`);
      continue;
    }
    if (typeof p.publisher_id !== 'string' || p.publisher_id.length === 0) errors.push(`${tag}.publisher_id missing`);
    if (typeof p.display_name !== 'string' || p.display_name.length === 0) errors.push(`${tag}.display_name missing`);
    if (!Array.isArray(p.trusted_identities) || p.trusted_identities.length === 0) {
      errors.push(`${tag}.trusted_identities must be non-empty array`);
    } else {
      for (let j = 0; j < p.trusted_identities.length; j += 1) {
        const id = p.trusted_identities[j];
        const idTag = `${tag}.trusted_identities[${j}]`;
        if (!id || typeof id !== 'object') {
          errors.push(`${idTag}: not an object`);
          continue;
        }
        if (!isHttpsUrl(id.issuer)) errors.push(`${idTag}.issuer must be https URL`);
        if (typeof id.subject_pattern !== 'string' || id.subject_pattern.length === 0 || id.subject_pattern.length > 512) {
          errors.push(`${idTag}.subject_pattern invalid (1..512 chars)`);
        }
      }
    }
    if (!isIso8601(p.added_at)) errors.push(`${tag}.added_at must be ISO 8601`);
    if (seenPub.has(p.publisher_id)) errors.push(`${tag} duplicate publisher_id: ${p.publisher_id}`);
    seenPub.add(p.publisher_id);
  }
}

function crossCheck(reg, tr) {
  if (reg === null || tr === null) return;
  if (!Array.isArray(reg.entries) || !Array.isArray(tr.publishers)) return;
  const knownPubs = new Set(tr.publishers.map((p) => p.publisher_id));
  for (let i = 0; i < reg.entries.length; i += 1) {
    const e = reg.entries[i];
    if (!knownPubs.has(e.publisher_id)) {
      errors.push(
        `registry.entries[${i}].publisher_id "${e.publisher_id}" not present in trusted_identities.publishers[]`,
      );
    }
  }
}

function main() {
  const reg = loadJson(REGISTRY);
  const tr = loadJson(TRUSTED);
  lintRegistry(reg);
  lintTrusted(tr);
  crossCheck(reg, tr);

  if (errors.length === 0) {
    console.log('[lint-registry] OK — registry + trusted_identities valid.');
    process.exit(0);
  }
  console.error(`[lint-registry] FAIL — ${errors.length} violation(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

main();
