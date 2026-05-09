/**
 * installedPluginRecordStore — file-based persistence for InstalledPluginRecord.
 *
 * Spec: v2.4.0 marketplace integration follow-up to v2.3.0 PRD.
 *
 * Storage layout: `<storageDir>/<package_id>.json` with one record per file.
 * `storageDir` defaults to `~/.dreampia/installed-plugin-records/` (Electron
 * `app.getPath('userData')` rooted in production).
 *
 * Forgiving load: corrupt JSON / schema-mismatch entries are silently skipped.
 * `package_id` is encoded in the filename via URL-safe base64 to avoid path
 * traversal and to support npm-scoped names like `@org/pkg`.
 *
 * No lockfile / atomic-rename — single-writer assumption (main process is the
 * only caller). v2.4.0+ may add lockfile if multiple writers emerge.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  InstalledPluginRecordSchema,
  type InstalledPluginRecord,
} from '../../types/installedPluginRecord';

export interface InstalledPluginRecordStoreOptions {
  /** Directory that holds `<package_id-encoded>.json` files. */
  storageDir: string;
}

function encodePackageId(package_id: string): string {
  // URL-safe base64 — no `/` or `+`, no padding. Reverses cleanly via
  // decodePackageId for full round-trip.
  return Buffer.from(package_id, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodePackageId(filename: string): string {
  const base = filename.replace(/\.json$/, '');
  const padded = base.replace(/-/g, '+').replace(/_/g, '/');
  // Re-pad to multiple of 4
  const pad = padded.length % 4;
  const fullyPadded = pad === 0 ? padded : padded + '='.repeat(4 - pad);
  return Buffer.from(fullyPadded, 'base64').toString('utf-8');
}

export class InstalledPluginRecordStore {
  private readonly storageDir: string;

  constructor(options: InstalledPluginRecordStoreOptions) {
    this.storageDir = options.storageDir;
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /** Persist (or overwrite) one record. */
  put(record: InstalledPluginRecord): void {
    const parsed = InstalledPluginRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new Error(`InstalledPluginRecordStore.put: invalid record: ${parsed.error.message}`);
    }
    const file = join(this.storageDir, `${encodePackageId(record.package_id)}.json`);
    writeFileSync(file, JSON.stringify(parsed.data, null, 2), 'utf-8');
  }

  /** Read one record by package_id. Returns null if not found or corrupt. */
  get(package_id: string): InstalledPluginRecord | null {
    const file = join(this.storageDir, `${encodePackageId(package_id)}.json`);
    if (!existsSync(file)) return null;
    try {
      const raw = readFileSync(file, 'utf-8');
      const parsed = InstalledPluginRecordSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** List every valid record. Corrupt entries silently skipped. */
  listAll(): InstalledPluginRecord[] {
    if (!existsSync(this.storageDir)) return [];
    let entries: string[];
    try {
      entries = readdirSync(this.storageDir);
    } catch {
      return [];
    }
    const out: InstalledPluginRecord[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = readFileSync(join(this.storageDir, name), 'utf-8');
        const parsed = InstalledPluginRecordSchema.safeParse(JSON.parse(raw));
        if (parsed.success) out.push(parsed.data);
      } catch {
        // skip corrupt
      }
    }
    return out;
  }

  /** Remove one record. No-op if not present. */
  remove(package_id: string): void {
    const file = join(this.storageDir, `${encodePackageId(package_id)}.json`);
    if (!existsSync(file)) return;
    try {
      unlinkSync(file);
    } catch {
      // best effort
    }
  }

  /** Test inspection — count of records on disk. */
  count(): number {
    return this.listAll().length;
  }
}

// ────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────

export const __testing = { encodePackageId, decodePackageId };
