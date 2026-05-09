/**
 * conflictResolver — decide how to handle an MCP capability request given the
 * already-granted set for that server.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 1.3 (US-103).
 *
 * Decision matrix (G6 spirit — minimum-surprise):
 *   - All requested already granted → allow (no prompt).
 *   - Any requested capability is in DENY list (host policy) → deny.
 *   - Any requested capability NOT yet granted (and not denied) → requires_user_consent.
 *
 * Forbidden (deny) capabilities are policy-controlled host-side; v2.3.0 ships
 * with an empty deny set but the structure is here so future ADRs can populate
 * (e.g., a malicious-publisher revocation may add `host.fs.write` to the deny
 * set for that publisher's servers).
 */

export type CapabilityConflictDecision =
  | { kind: 'allow'; reason: 'superset_granted' }
  | { kind: 'deny'; reason: string; offending: readonly string[] }
  | { kind: 'requires_user_consent'; reason: string; new_capabilities: readonly string[] };

export interface CapabilityConflictPolicy {
  /** Capabilities that this caller may NEVER grant. Empty by default v2.3.0. */
  readonly deniedCapabilities?: ReadonlySet<string>;
}

/**
 * Decide outcome for a request.
 *
 * @param requested capability set the manifest declares (or runtime requests)
 * @param currentGranted capability set already approved for this server
 * @param policy optional deny-list policy
 */
export function resolveCapabilityConflict(
  requested: readonly string[],
  currentGranted: readonly string[],
  policy: CapabilityConflictPolicy = {}
): CapabilityConflictDecision {
  const granted = new Set(currentGranted);
  const denied = policy.deniedCapabilities ?? new Set<string>();

  const denyOffenders = requested.filter((c) => denied.has(c));
  if (denyOffenders.length > 0) {
    return {
      kind: 'deny',
      reason: 'capability in host deny list',
      offending: denyOffenders,
    };
  }

  const newCaps = requested.filter((c) => !granted.has(c));
  if (newCaps.length === 0) {
    return { kind: 'allow', reason: 'superset_granted' };
  }

  return {
    kind: 'requires_user_consent',
    reason: 'one or more capabilities not previously granted',
    new_capabilities: newCaps,
  };
}
