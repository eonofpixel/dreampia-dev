/**
 * McpCapabilityGate — manifest-level capability grants for installed MCP servers.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 1.2 (US-102), gate G5.
 *
 * Mirrors `PluginCapabilityGate`'s persistence shape (`<dir>/<id>/granted.json`)
 * but operates per-MCP-server-id rather than per-plugin-name. Distinct module
 * because MCP servers and plugins have different identity models (server_id is
 * user-provided slug; plugin_name is package-derived).
 *
 * v2.3.0-specific addition: **grant_epoch monotonic counter** per server.
 *   - Incremented synchronously on every revoke (single-cap or all).
 *   - Read by hostBridge dispatcher (US-403) on each in-flight RPC to detect
 *     "grant invalidated mid-call" race. This closes G5 codex re-emphasis:
 *     "already-posted parentPort messages cannot be recalled, so revoke must
 *     synchronously invalidate dispatcher grants".
 *
 * What this module does NOT do (deferred to Phase 2/3):
 *   - User consent UX (relies on `conflictResolver` + caller-driven prompt flow).
 *   - Sigstore verify (Phase 2.2 / US-201).
 *   - InstalledPluginRecord materialization (caller composes manifest+verify result).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GRANTED_FILENAME = 'granted.json';

export interface McpGrantedFileShape {
  /** Persisted capabilities for this server. Sorted on write. */
  capabilities: string[];
  /** Monotonic counter persisted across restarts. Bumped on every revoke. */
  grant_epoch: number;
}

export interface McpCapabilityAuditEvent {
  timestamp: string;
  event: 'mcp.cap_granted' | 'mcp.cap_revoked' | 'mcp.cap_revoked_all';
  server_id: string;
  capability?: string;
  grant_epoch: number;
}

export interface McpCapabilityGateOptions {
  /**
   * Directory for `<server_id>/granted.json`. Production wires
   * `path.join(app.getPath('userData'), 'mcp-grants')` (or
   * `~/.dreampia/mcp-grants/`). Undefined = in-memory only.
   */
  storageDir?: string;
  /** Audit hook. Default: console.warn on revoke events. */
  auditSink?: (event: McpCapabilityAuditEvent) => void;
}

interface ServerState {
  capabilities: Set<string>;
  grant_epoch: number;
}

export class McpCapabilityGate {
  private readonly storageDir: string | undefined;
  private readonly auditSink: (event: McpCapabilityAuditEvent) => void;
  private readonly state = new Map<string, ServerState>();

  constructor(options: McpCapabilityGateOptions = {}) {
    this.storageDir = options.storageDir;
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event !== 'mcp.cap_granted') {
          console.warn(
            `[McpCapabilityGate] ${e.event} ${e.server_id}/${e.capability ?? '*'} epoch=${e.grant_epoch}`
          );
        }
      });
    if (this.storageDir !== undefined) {
      this.loadAllPersisted(this.storageDir);
    }
  }

  /**
   * Load every `<storageDir>/<server_id>/granted.json` into in-memory state.
   * Corrupt JSON / missing capabilities array / non-numeric epoch are silently
   * skipped (treated as "no grant"). Same forgiving policy as PluginCapabilityGate
   * — fresh state recovers on next legitimate grant.
   *
   * Supports two layouts:
   *   - Flat:   <storageDir>/<server_id>/granted.json           (e.g. server-a)
   *   - Scoped: <storageDir>/@scope/<name>/granted.json         (npm scoped packages)
   * The scoped layout is needed because mcp/request-revoke IPC passes the
   * `package_id` (which may be `@org/pkg`) as `server_id`, and grantOne writes
   * via mkdirSync(...{recursive:true}) creating the nested dirs naturally.
   * Without recursive load, the in-memory state silently loses scoped grants
   * on every process restart (closes a real production bug exposed by the
   * v2.4.0 install→revoke roundtrip integration test).
   */
  private loadAllPersisted(dir: string): void {
    if (!existsSync(dir)) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const candidate = join(dir, entry);
      try {
        if (!statSync(candidate).isDirectory()) continue;
      } catch {
        continue;
      }
      // Scoped layout: entry starts with '@' — recurse one level so that
      // <storageDir>/@scope/<name>/granted.json is discovered. Server id is
      // reconstructed as `@scope/<name>` to match the in-memory key.
      if (entry.startsWith('@')) {
        let inner: string[];
        try {
          inner = readdirSync(candidate);
        } catch {
          continue;
        }
        for (const sub of inner) {
          const subDir = join(candidate, sub);
          try {
            if (!statSync(subDir).isDirectory()) continue;
          } catch {
            continue;
          }
          this.loadOnePersisted(`${entry}/${sub}`, join(subDir, GRANTED_FILENAME));
        }
        continue;
      }
      // Flat layout.
      this.loadOnePersisted(entry, join(candidate, GRANTED_FILENAME));
    }
  }

  private loadOnePersisted(server_id: string, file: string): void {
    if (!existsSync(file)) return;
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'));
      if (parsed === null || typeof parsed !== 'object') return;
      const obj = parsed as Record<string, unknown>;
      if (!Array.isArray(obj['capabilities'])) return;
      if (typeof obj['grant_epoch'] !== 'number' || !Number.isFinite(obj['grant_epoch'])) return;
      const caps = obj['capabilities'].filter(
        (x): x is string => typeof x === 'string' && x.length > 0
      );
      this.state.set(server_id, {
        capabilities: new Set(caps),
        grant_epoch: obj['grant_epoch'],
      });
    } catch {
      // corrupt → skip
    }
  }

  private getOrInitState(server_id: string): ServerState {
    let s = this.state.get(server_id);
    if (s === undefined) {
      s = { capabilities: new Set(), grant_epoch: 0 };
      this.state.set(server_id, s);
    }
    return s;
  }

  private writePersisted(server_id: string, s: ServerState): void {
    if (this.storageDir === undefined) return;
    const serverDir = join(this.storageDir, server_id);
    if (s.capabilities.size === 0) {
      // Empty capability set — keep file (preserves grant_epoch monotonicity even
      // if the user revokes everything; bumping epoch for a bystander-grant flow
      // matters more than file cleanup). Caller can `clearAll` to delete.
    }
    try {
      mkdirSync(serverDir, { recursive: true });
      const data: McpGrantedFileShape = {
        capabilities: Array.from(s.capabilities).sort(),
        grant_epoch: s.grant_epoch,
      };
      writeFileSync(join(serverDir, GRANTED_FILENAME), JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[McpCapabilityGate] persist failed for ${server_id}: ${msg}`);
    }
  }

  /**
   * Grant a single capability synchronously. Persists if storageDir set.
   * Idempotent — granting an already-granted cap is a no-op (no epoch bump).
   *
   * Note: this method assumes user consent has already been obtained upstream
   * (via `conflictResolver` + caller-driven prompt). It does NOT prompt.
   */
  grantOne(server_id: string, capability: string): void {
    const s = this.getOrInitState(server_id);
    if (s.capabilities.has(capability)) return;
    s.capabilities.add(capability);
    this.writePersisted(server_id, s);
    this.auditSink({
      timestamp: new Date().toISOString(),
      event: 'mcp.cap_granted',
      server_id,
      capability,
      grant_epoch: s.grant_epoch,
    });
  }

  /**
   * Revoke a single capability — or pass undefined to revoke all for this server.
   *
   * **G5 invariant**: grant_epoch is incremented synchronously here, BEFORE this
   * method returns. The hostBridge dispatcher reads grant_epoch on every in-flight
   * RPC; any RPC issued under a stale epoch is aborted. This closes the
   * "already-posted parentPort message cannot be recalled" race.
   *
   * Idempotent in the no-op sense — revoking an ungranted capability still bumps
   * the epoch (caller may rely on monotonic ordering).
   */
  revokeOne(server_id: string, capability?: string): number {
    const s = this.getOrInitState(server_id);
    s.grant_epoch += 1;
    if (capability === undefined) {
      s.capabilities.clear();
      // v2.4.0 fix: persist empty-cap state (with bumped epoch) instead of
      // deleting the file. The class invariant promises "monotonic counter
      // persisted across restarts" (G5) — deleting the file would lose the
      // bumped epoch, so a future re-grant + revoke would replay the same
      // epoch number and any stale RPC carrying that epoch as a snapshot
      // could match. Persisting empty caps keeps monotonicity honest.
      // For full cleanup (e.g. plugin uninstall), callers use clearAll().
      this.writePersisted(server_id, s);
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'mcp.cap_revoked_all',
        server_id,
        grant_epoch: s.grant_epoch,
      });
      return s.grant_epoch;
    }
    s.capabilities.delete(capability);
    this.writePersisted(server_id, s);
    this.auditSink({
      timestamp: new Date().toISOString(),
      event: 'mcp.cap_revoked',
      server_id,
      capability,
      grant_epoch: s.grant_epoch,
    });
    return s.grant_epoch;
  }

  isGranted(server_id: string, capability: string): boolean {
    return this.state.get(server_id)?.capabilities.has(capability) === true;
  }

  listGranted(server_id: string): string[] {
    const s = this.state.get(server_id);
    if (s === undefined) return [];
    return Array.from(s.capabilities).sort();
  }

  /** Read current grant_epoch for a server. Used by dispatcher per-call check (US-403). */
  getGrantEpoch(server_id: string): number {
    return this.state.get(server_id)?.grant_epoch ?? 0;
  }

  /** Test/shutdown — clear all in-memory state. File persistence preserved. */
  clearAll(): void {
    this.state.clear();
  }
}
