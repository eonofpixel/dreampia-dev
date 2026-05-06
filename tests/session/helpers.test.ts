/**
 * Helpers tests — UUIDv7, workspaceId, partitionId.
 *
 * Spec: docs/session/schema.md
 */

import { describe, it, expect } from 'vitest';
import {
  newSessionId,
  newTurnId,
  workspaceIdFor,
  workspaceIdForSha256,
  isLegacyFnvWorkspaceId,
  partitionIdFor,
  nowIso,
  SessionIdSchema,
  TurnIdSchema,
  type SessionId,
} from '../../src/types';

describe('UUIDv7 helpers', () => {
  it('newSessionId produces valid UUIDv7', () => {
    const id = newSessionId();

    // UUIDv7 pattern: version (7), variant (8/9/a/b)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // Schema accepts it
    expect(SessionIdSchema.safeParse(id).success).toBe(true);
  });

  it('newTurnId is unique across calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      ids.add(newTurnId());
    }
    expect(ids.size).toBe(100);

    // All accepted by schema
    for (const id of ids) {
      expect(TurnIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('UUIDv7 is time-ordered', async () => {
    const id1 = newSessionId();
    await new Promise((r) => setTimeout(r, 5));
    const id2 = newSessionId();

    // String comparison should reflect time order (first 12 chars = ts)
    expect(id1 < id2).toBe(true);
  });
});

describe('workspaceIdFor', () => {
  it('produces stable id for same path', () => {
    const id1 = workspaceIdFor('C:\\Dev\\foo');
    const id2 = workspaceIdFor('C:\\Dev\\foo');
    expect(id1).toBe(id2);
  });

  it('case-insensitive (Windows)', () => {
    const id1 = workspaceIdFor('C:\\Dev\\foo');
    const id2 = workspaceIdFor('c:\\dev\\FOO');
    expect(id1).toBe(id2);
  });

  it('forward/backslash equivalent', () => {
    const id1 = workspaceIdFor('C:\\Dev\\foo');
    const id2 = workspaceIdFor('c:/dev/foo');
    expect(id1).toBe(id2);
  });

  it('different paths produce different ids', () => {
    const id1 = workspaceIdFor('C:\\Dev\\foo');
    const id2 = workspaceIdFor('C:\\Dev\\bar');
    expect(id1).not.toBe(id2);
  });

  it('always starts with "ws-"', () => {
    expect(workspaceIdFor('/any/path')).toMatch(/^ws-[0-9a-f]+$/);
  });

  it('한국어 경로 OK', () => {
    const id = workspaceIdFor('C:\\Dev\\한국프로젝트');
    expect(id).toMatch(/^ws-[0-9a-f]+$/);
  });
});

describe('partitionIdFor', () => {
  it('uses persist: prefix (Codex pattern)', () => {
    const sessionId = newSessionId() as SessionId;
    const partition = partitionIdFor(sessionId);
    expect(partition).toMatch(/^persist:dreampia-browser-app-/);
  });

  it('different sessions get different partitions', () => {
    const a = partitionIdFor(newSessionId() as SessionId);
    const b = partitionIdFor(newSessionId() as SessionId);
    expect(a).not.toBe(b);
  });
});

describe('nowIso', () => {
  it('produces valid ISO8601 string', () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});

describe('v1.4.0 — workspaceIdForSha256', () => {
  it('returns ws-<16 hex>', () => {
    const id = workspaceIdForSha256('/some/path');
    expect(id).toMatch(/^ws-[0-9a-f]{16}$/);
  });

  it('deterministic — 같은 path 반복 호출 동일', () => {
    const a = workspaceIdForSha256('/a/b');
    const b = workspaceIdForSha256('/a/b');
    expect(a).toBe(b);
  });

  it('대소문자 / 백슬래시 정규화 — Windows/Unix 동일', () => {
    expect(workspaceIdForSha256('C:\\Dev\\foo')).toBe(
      workspaceIdForSha256('c:/dev/foo')
    );
  });

  it('FNV id 와 다른 결과 (sha256 명시 분리)', () => {
    const fnv = workspaceIdFor('/foo');
    const sha = workspaceIdForSha256('/foo');
    expect(sha).not.toBe(fnv);
  });
});

describe('v1.4.0 — isLegacyFnvWorkspaceId', () => {
  it('FNV id 매칭 → true', () => {
    const fnv = workspaceIdFor('/x/y');
    expect(isLegacyFnvWorkspaceId(fnv, '/x/y')).toBe(true);
  });

  it('sha256 id 는 FNV 가 아님 → false', () => {
    const sha = workspaceIdForSha256('/x/y');
    expect(isLegacyFnvWorkspaceId(sha, '/x/y')).toBe(false);
  });

  it('random UUIDv7 같은 id → false', () => {
    expect(
      isLegacyFnvWorkspaceId(
        '019d-zzzz-1111-2222-3333' as ReturnType<typeof workspaceIdFor>,
        '/anything'
      )
    ).toBe(false);
  });
});
