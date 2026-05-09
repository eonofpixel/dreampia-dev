/**
 * topicPublishers — wire host-side event sources to the eventBus.
 *
 * Spec: docs/adr/0009-plugin-worker-lifecycle.md, .omc/plans/v2.3.0-plugin-ga.md §4 Phase 5A.5 (US-504).
 *
 * Topics:
 *   - audit.log          (every AuditLogStore.recordEvent → event.payload)
 *   - workspace.file_change   (workspace store change events)
 *   - session.path_change     (session path changes)
 *
 * Integration is opt-in: production wires these in `src/main/index.ts` after
 * the EventBus is constructed and the relevant stores are open. Tests can
 * skip wiring entirely and exercise EventBus.publish() directly.
 *
 * Pure DI module — no imports from electron, sqlite, or storage. Callers
 * pass the source events into `publish*` helpers; this file just enforces
 * canonical topic names + payload shapes.
 */

import type { HostEventBus } from './eventBus';

// ────────────────────────────────────────────────────────────
// Canonical topic names + payload shapes
// ────────────────────────────────────────────────────────────

export const TOPIC_AUDIT_LOG = 'audit.log';
export const TOPIC_WORKSPACE_FILE_CHANGE = 'workspace.file_change';
export const TOPIC_SESSION_PATH_CHANGE = 'session.path_change';

export interface AuditLogTopicPayload {
  timestamp: string;
  event: string;
  capability: string;
  decision_reason: string;
  /** Optional fields for richer subscribers. */
  session_id?: string;
  turn_id?: string;
  outcome?: string;
}

export interface WorkspaceFileChangePayload {
  workspace_id: string;
  /** Path relative to workspace root. */
  rel_path: string;
  kind: 'created' | 'modified' | 'deleted' | 'renamed';
  at: string;
}

export interface SessionPathChangePayload {
  session_id: string;
  prev_workspace_id?: string;
  new_workspace_id: string;
  at: string;
}

// ────────────────────────────────────────────────────────────
// Publishers
// ────────────────────────────────────────────────────────────

export function publishAuditLog(bus: HostEventBus, payload: AuditLogTopicPayload): void {
  bus.publish(TOPIC_AUDIT_LOG, payload);
}

export function publishWorkspaceFileChange(
  bus: HostEventBus,
  payload: WorkspaceFileChangePayload
): void {
  bus.publish(TOPIC_WORKSPACE_FILE_CHANGE, payload);
}

export function publishSessionPathChange(
  bus: HostEventBus,
  payload: SessionPathChangePayload
): void {
  bus.publish(TOPIC_SESSION_PATH_CHANGE, payload);
}

/**
 * Convenience binding: wire AuditLogStore-style record events into bus.
 * Caller passes a per-event projector that returns null to skip publishing
 * (e.g., when the audit row has session_id but plugin subscribers only care
 * about plugin events).
 *
 * Returns an unsubscribe function so the caller can detach on shutdown.
 */
export function bindAuditSourceToBus<TSource>(
  source: { on: (handler: (e: TSource) => void) => () => void },
  project: (e: TSource) => AuditLogTopicPayload | null,
  bus: HostEventBus
): () => void {
  return source.on((e) => {
    const payload = project(e);
    if (payload !== null) {
      publishAuditLog(bus, payload);
    }
  });
}
