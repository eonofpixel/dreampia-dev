---
title: Permission Model — Implementation Notes
parent: ./_index.md
related:
  - ./capabilities.md
  - ./levels.md
  - ./resolver.md
status: stable
last_updated: 2026-05-02
---

# Permission Implementation Notes (PM-3/PM-9)

> This document records deviations between the spec and the actual implementation.
> This is the "as-built" contract that 30+ downstream tools depend on.

---

## 1. Bare parent capabilities added

`capabilities.md` sub-capability union (lines 37-88) does not list bare parents
`SYSTEM_CLIPBOARD` and `SYSTEM_AUTOMATION`, but the actual `ALL_CAPABILITIES` array
includes both.

**Reason**: `levels.md` code sample (line 179) uses bare `'SYSTEM_AUTOMATION'` directly,
and `capabilities.md` 107-114 parent-child grant rules require bare parents to be
grantable. For the same reason `LOCAL_WRITE` and `LOCAL_OUTSIDE_CWD` are also in the array
(these two ARE in the spec union).

**Effect**: `ALL_CAPABILITIES.length` = **40**

- Spec union-listed capabilities: 38
  (SYSTEM_CLIPBOARD, SYSTEM_AUTOMATION added as bare parents)
- Implementation: LOCAL_WRITE, LOCAL_OUTSIDE_CWD (already in union) +
  SYSTEM_CLIPBOARD, SYSTEM_AUTOMATION (bare parents not in union) = 40 total

**Action item**: `capabilities.md` union example should explicitly list bare parents
(`SYSTEM_CLIPBOARD`, `SYSTEM_AUTOMATION`).

**Test sentinel**: `tests/permission/Capability.test.ts` "locks the count to 40" test
pins this value. Update that test alongside any intentional change here.

---

## 2. `__deny__:` capability prefix

**Design**: Deny grants reuse the standard `PermissionGrant` table rather than a
separate deny table. The `capability` field is prefixed with `__deny__:` to mark them
as deny records.

```typescript
// Example: deny LOCAL_EXECUTE for a specific path
{
  id: 'deny-1',
  capability: '__deny__:LOCAL_EXECUTE',  // deny prefix
  target: { kind: 'path', path: 'C:\\Dev\\foo', recursive: true },
  scope: 'session',
  ...
}
```

**Zod schema** (`src/types/permission.ts` lines 62-72):
`GrantCapabilitySchema` accepts two forms:
1. A valid `Capability` (enum value)
2. `__deny__:` + a valid `Capability`

Parsing fails if the suffix after `__deny__:` is not a known capability, or if the
suffix is empty.

**Resolver handling** (`src/permission/Resolver.ts`):
- `findDeny()` — looks for `__deny__:${capability}` key in active grants
- `findActiveGrants()` — explicitly skips grants with `__deny__:` prefix

For full algorithm details see `resolver.md` lines 168-185.

---

## 3. `workspaceRoot` parameter

**Current state**: `isAllowed()` accepts an optional 4th argument `workspaceRoot?: string`
(`src/permission/Resolver.ts` line 211).

```typescript
function isAllowed(
  capability: Capability,
  target: ResolvedTarget,
  session: Session,
  workspaceRoot?: string  // optional 4th argument
): GrantDecision
```

**Purpose**: Used at `workspace_write` level to check whether a `LOCAL_*` target path
is outside the workspace root. Omitting this argument skips the outside-workspace check
(fail-open behavior).

**TODO (PM-9 follow-up)**: Integrate `Session.workspace.root` so the caller does not
need to pass it separately. See `Resolver.ts` lines 138-139 comment.

**Impact**: If `workspaceRoot` is omitted at `workspace_write` level, a `LOCAL_WRITE`
to a path outside the workspace returns `allowed_by_default_level` instead of
`level_does_not_allow`. Security-sensitive callers must pass `workspaceRoot`.

---

## 4. OpenAI API key regex relaxed

**Spec** (`danger-patterns.md` example): `/\bsk-[A-Za-z0-9]{32,}\b/`

**Impl** (`src/permission/DangerCheck.ts`): `/\bsk-[A-Za-z0-9-]{20,}\b/`

**Reason**: The spec regex rejects hyphens, so keys like `sk-proj-abc...XYZ` (OpenAI
Project API key format) would not be matched. Adding `-` to the character class and
relaxing the minimum length to 20 covers the spec's own example.

**Trade-off**: Slight increase in false positives for strings starting with `sk-` that
are 20+ characters. If false positives become a problem in production, consider adding
`requireContext: 'openai'` to the pattern entry.

---

## 5. `NETWORK_REMOTE.read` not in spec union

**Spec** (`levels.md` line 168): `workspace_write` level includes `NETWORK_REMOTE.read`.

**Problem**: `capabilities.md` union does not list `NETWORK_REMOTE.read`. The only
official sub-capability of `NETWORK_REMOTE` is `NETWORK_REMOTE.upload`.

**Impl** (`src/permission/Levels.ts`): `workspace_write` set includes bare `NETWORK_REMOTE`.
Via the parent-child rule, a `NETWORK_REMOTE` entry covers all of its sub-capabilities.

```typescript
// workspace_write capabilities (Levels.ts)
'NETWORK_REMOTE',          // bare parent - covers all NETWORK_REMOTE.*
// 'NETWORK_REMOTE.read'  // not used - doesn't exist in capabilities.md union
```

**Effect**: Functionally equivalent for resolver checks — `isAllowed('NETWORK_REMOTE', ...)`
returns `allowed_by_default_level` at `workspace_write`. `NETWORK_REMOTE.read` as a
distinct capability string does not exist, so the spec reference is effectively an alias
for bare `NETWORK_REMOTE`.

**Action item**: `levels.md` should be updated to say `NETWORK_REMOTE` (bare) instead
of `NETWORK_REMOTE.read`, or `capabilities.md` should add `NETWORK_REMOTE.read`.

---

## Tie-breaking (mostSpecific)

`mostSpecific()` (`src/permission/Targets.ts` lines 154-161) uses strict `>` comparison.
On equal specificity scores, `Array.reduce` (no initial value) keeps the first element,
so **the first-encountered grant in the array wins on a tie**.

```typescript
return grants.reduce((best, current) =>
  specificity(current) > specificity(best) ? current : best
  //                     ^ strict > so ties keep 'best' (first element)
);
```

**Spec undefined**: The spec does not define tie-breaking behavior. Downstream tools
should not depend on tie behavior; prefer grants with explicitly different specificity.

---

## Expiry boundary

`isExpired()` (`src/permission/Targets.ts` line 178) uses `<` (strict less than):

```typescript
if (grant.expires_at && grant.expires_at < now.toISOString()) return true;
//                                        ^ strict <
```

A grant where `expires_at === now` is **not considered expired**. This is intentional.
`tests/permission/Resolver.test.ts` scenario 17 ("exact boundary") is a sentinel that
asserts this behavior and will fail immediately if the comparison is changed to `<=`.
