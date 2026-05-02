/**
 * Storage layer public API.
 *
 * Spec: docs/session/persistence.md, docs/session/multi-window.md
 */

export { SessionStore } from './SessionStore';
export type { SessionListFilter, SessionMeta } from './SessionStore';
export { LATEST_SCHEMA_VERSION } from './migrate';
export { LeaderElection } from './LeaderElection';
export type { SessionLock, LeaderElectionOptions } from './LeaderElection';
