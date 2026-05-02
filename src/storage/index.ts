/**
 * Storage layer public API.
 *
 * Spec: docs/session/persistence.md
 */

export { SessionStore } from './SessionStore';
export type { SessionListFilter, SessionMeta } from './SessionStore';
export { LATEST_SCHEMA_VERSION } from './migrate';
