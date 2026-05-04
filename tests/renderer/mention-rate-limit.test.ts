/**
 * MENT-1 — mention rate-limit contract (v1.0.13).
 *
 * Codex 권고: 50개 + dedupe + 200KB. 초과 시 limits 정보 노출.
 *
 * 검증:
 *  1. 50개 이내 + dedupe 0 → limits 모두 0.
 *  2. 51개 입력 → dropped_over_count=1.
 *  3. 같은 path 5개 → dropped_duplicate=4.
 *  4. cumulative byte 한도 초과 → dropped_over_bytes 누적.
 *  5. cumulative_bytes 가 실제 흐른 값 (한도 초과 분 제외).
 */

import { describe, it, expect } from 'vitest';
import { resolveMentionsRich } from '../../src/renderer/mentions/resolver';
import type {
  MentionMatch,
  ResolverContext,
} from '../../src/renderer/mentions/resolver';

function fileMatch(path: string): MentionMatch {
  return {
    kind: 'file',
    value: path,
    query: path,
    start: 0,
    end: path.length + 1,
  };
}

function makeCtx(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    workspaceRoot: '/ws',
    readFile: async ({ rel_path }) => ({
      ok: true,
      value: { content: `content of ${rel_path}`, line_count: 1, truncated: false },
    }),
    getSession: async () => null,
    ...overrides,
  };
}

describe('MENT-1 — mention rate-limit (v1.0.13)', () => {
  it('정상 입력 (5개) → limits 모두 0', async () => {
    const inputs: MentionMatch[] = [
      fileMatch('a.txt'),
      fileMatch('b.txt'),
      fileMatch('c.txt'),
      fileMatch('d.txt'),
      fileMatch('e.txt'),
    ];
    const r = await resolveMentionsRich(inputs, makeCtx());
    expect(r.limits.dropped_over_count).toBe(0);
    expect(r.limits.dropped_duplicate).toBe(0);
    expect(r.limits.dropped_over_bytes).toBe(0);
    expect(r.resolved.length).toBe(5);
  });

  it('51개 입력 → 1개 dropped_over_count', async () => {
    const inputs: MentionMatch[] = [];
    for (let i = 0; i < 51; i++) {
      inputs.push(fileMatch(`file-${i}.txt`));
    }
    const r = await resolveMentionsRich(inputs, makeCtx());
    expect(r.limits.dropped_over_count).toBe(1);
    expect(r.resolved.length).toBe(50);
  });

  it('같은 path 5개 → 4개 dropped_duplicate', async () => {
    const inputs: MentionMatch[] = [
      fileMatch('same.txt'),
      fileMatch('same.txt'),
      fileMatch('same.txt'),
      fileMatch('same.txt'),
      fileMatch('same.txt'),
    ];
    const r = await resolveMentionsRich(inputs, makeCtx());
    expect(r.limits.dropped_duplicate).toBe(4);
    expect(r.resolved.length).toBe(1);
  });

  it('dedupe + count limit 동시 — dedupe 가 먼저, 그 다음 count', async () => {
    // 60 mention 중 30개가 중복 → dedupe 후 30 unique → 모두 통과.
    const inputs: MentionMatch[] = [];
    for (let i = 0; i < 30; i++) {
      inputs.push(fileMatch(`u-${i}.txt`));
      inputs.push(fileMatch(`u-${i}.txt`)); // 중복
    }
    const r = await resolveMentionsRich(inputs, makeCtx());
    expect(r.limits.dropped_duplicate).toBe(30);
    expect(r.limits.dropped_over_count).toBe(0);
    expect(r.resolved.length).toBe(30);
  });

  it('cumulative byte 한도 초과 시 dropped_over_bytes', async () => {
    // 각 파일 100KB 짜리 → 3개째 (300KB) 가 200KB 한도 초과.
    const big = 'x'.repeat(100 * 1024);
    const ctx = makeCtx({
      readFile: async () => ({
        ok: true,
        value: { content: big, line_count: 1, truncated: false },
      }),
    });
    const inputs: MentionMatch[] = [
      fileMatch('big-1.txt'),
      fileMatch('big-2.txt'),
      fileMatch('big-3.txt'),
    ];
    const r = await resolveMentionsRich(inputs, ctx);
    expect(r.limits.dropped_over_bytes).toBe(1);
    // big-1, big-2 통과, big-3 은 error 로 변경.
    expect(r.resolved.filter((m) => m.kind === 'file').length).toBe(2);
    expect(r.resolved.filter((m) => m.kind === 'error').length).toBe(1);
    expect(r.limits.cumulative_bytes).toBe(big.length * 2);
  });
});
