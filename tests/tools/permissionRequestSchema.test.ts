/**
 * v2.0.0 (A2) — PermissionRequestSchema unit tests.
 *
 * 검증:
 *  - valid shape → safeParse success + kind default 적용
 *  - kind 명시 시 그 값 유지
 *  - 필수 필드 누락 → fail
 *  - target 의 kind 가 잘못된 enum → fail
 *  - 빈 문자열 / 잘못된 ISO8601 → fail
 *  - parsePermissionRequest helper 가 null 반환 (throw X)
 */

import { describe, it, expect } from 'vitest';
import {
  PermissionRequestSchema,
  parsePermissionRequest,
} from '../../src/tools/permissionRequestSchema';

// SessionIdSchema 가 UUIDv7 강제 — 7번째 nibble='7', 17번째 nibble∈[8-b].
const validRequest = {
  request_id: 'req-1',
  session_id: '01890c1c-9c47-7a3f-bf24-aabbccddeeff',
  turn_id: 'turn-xyz-456',
  call_id: 'call-uvw-789',
  tool_id: 'shell.run',
  capability: 'LOCAL_EXECUTE',
  target: { kind: 'global', value: '' },
  is_dangerous: false,
  tool_display_name: 'Shell Run',
  requested_at: '2026-05-09T00:00:00.000Z',
};

describe('v2.0.0 (A2) — PermissionRequestSchema', () => {
  it('valid shape → safeParse success + kind default = permission_confirmation', () => {
    const result = PermissionRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('permission_confirmation');
      expect(result.data.request_id).toBe('req-1');
      expect(result.data.target.kind).toBe('global');
    }
  });

  it('kind 명시 = permission_confirmation 도 통과', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      kind: 'permission_confirmation',
    });
    expect(result.success).toBe(true);
  });

  it('kind 다른 값 → fail (literal mismatch)', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      kind: 'something-else',
    });
    expect(result.success).toBe(false);
  });

  it('request_id 빈 문자열 → fail', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      request_id: '',
    });
    expect(result.success).toBe(false);
  });

  it('target.kind 가 enum 외 값 → fail', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      target: { kind: 'badkind', value: '' },
    });
    expect(result.success).toBe(false);
  });

  it('target 누락 → fail', () => {
    const { target: _t, ...withoutTarget } = validRequest;
    void _t;
    const result = PermissionRequestSchema.safeParse(withoutTarget);
    expect(result.success).toBe(false);
  });

  it('is_dangerous 가 boolean 아님 → fail', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      is_dangerous: 'no',
    });
    expect(result.success).toBe(false);
  });

  it('requested_at 가 ISO8601 아님 → fail', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      requested_at: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('hint optional — 누락 OK', () => {
    const result = PermissionRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('hint 지정 시 그 값 유지', () => {
    const result = PermissionRequestSchema.safeParse({
      ...validRequest,
      hint: 'Tool 이 X 폴더에 쓰기를 요청합니다',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hint).toMatch(/X 폴더/);
    }
  });
});

describe('v2.0.0 (A2) — parsePermissionRequest helper', () => {
  it('valid → 데이터 반환', () => {
    const data = parsePermissionRequest(validRequest);
    expect(data).not.toBeNull();
    expect(data?.kind).toBe('permission_confirmation');
  });

  it('invalid → null (throw X — fail-closed)', () => {
    expect(parsePermissionRequest({ broken: true })).toBeNull();
    expect(parsePermissionRequest(null)).toBeNull();
    expect(parsePermissionRequest(undefined)).toBeNull();
    expect(parsePermissionRequest('string')).toBeNull();
  });
});
