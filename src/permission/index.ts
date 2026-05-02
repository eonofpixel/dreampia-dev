/**
 * Permission module — public API.
 *
 * Spec: docs/permission/_index.md
 *
 * 단일 import 경로:
 *   import { isAllowed, type Capability, ... } from '@/permission';
 */

// Capability enum + parent-child
export {
  ALL_CAPABILITIES,
  CapabilitySchema,
  isParentCapability,
  type Capability,
} from './Capability';

// Levels
export { LEVEL_CAPABILITIES } from './Levels';

// Targets
export {
  isExpired,
  isOutsideWorkspace,
  matchesTarget,
  mostSpecific,
  specificity,
  type ResolvedTarget,
} from './Targets';

// Danger / secret
export {
  DANGEROUS_PATTERNS,
  SECRET_PATTERNS,
  checkDangerousPattern,
  checkUserInputForSecrets,
  maskSecret,
  type DangerAction,
  type DangerCheckResult,
  type DangerRule,
  type SecretMatch,
  type SecretPattern,
} from './DangerCheck';

// Resolver
export {
  defaultLevelDecides,
  findActiveGrants,
  findDeny,
  isAllowed,
  isReadOnly,
  type DecisionReason,
  type GrantDecision,
} from './Resolver';
