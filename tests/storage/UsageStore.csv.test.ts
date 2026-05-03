/**
 * UsageStore.exportCsv — v0.9.0 CSV export contract tests.
 *
 * Verifies:
 *   1. Header line + columns 순서.
 *   2. 빈 결과 → header only + trailing newline.
 *   3. 콤마/따옴표/줄바꿈 escaping (RFC 4180).
 *   4. 모든 토큰 컬럼 + cost (6자리) 정확.
 *   5. range filter (from/to/provider/session_id) 동작.
 *   6. ISO timestamp 보존 (timezone 변환 X).
 *
 * Spec: ROADMAP.md (v0.9.0 F)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore, UsageStore } from '../../src/storage';

describe('UsageStore.exportCsv', () => {
  let store: SessionStore;
  let usage: UsageStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    usage = new UsageStore(store.getDb());
  });

  afterEach(() => {
    store.close();
  });

  // ── Header & empty ────────────────────────────────────────

  it('returns header-only CSV with trailing newline when no events', () => {
    const csv = usage.exportCsv();
    expect(csv).toBe(
      'timestamp,session_id,turn_id,provider,model,input_tokens,output_tokens,cache_creation,cache_read,reasoning,total_cost_usd\n'
    );
  });

  it('header contains exactly 11 columns in fixed order', () => {
    const csv = usage.exportCsv();
    const headerLine = csv.split('\n')[0] ?? '';
    expect(headerLine.split(',')).toEqual([
      'timestamp',
      'session_id',
      'turn_id',
      'provider',
      'model',
      'input_tokens',
      'output_tokens',
      'cache_creation',
      'cache_read',
      'reasoning',
      'total_cost_usd',
    ]);
  });

  // ── Basic round-trip ──────────────────────────────────────

  it('emits one data line per event with correct columns', () => {
    usage.recordEvent({
      session_id: 's1',
      turn_id: 't1',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 100,
      output_tokens: 50,
      total_cost_usd: 0.001234,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const lines = usage.exportCsv().trim().split('\n');
    expect(lines).toHaveLength(2); // header + 1 data
    const data = lines[1]?.split(',');
    expect(data?.[0]).toBe('2026-05-03T10:00:00.000Z');
    expect(data?.[1]).toBe('s1');
    expect(data?.[2]).toBe('t1');
    expect(data?.[3]).toBe('claude');
    expect(data?.[4]).toBe('claude-3-5-sonnet-20241022');
    expect(data?.[5]).toBe('100');
    expect(data?.[6]).toBe('50');
    expect(data?.[7]).toBe('0'); // cache_creation default
    expect(data?.[8]).toBe('0'); // cache_read default
    expect(data?.[9]).toBe('0'); // reasoning default
    expect(data?.[10]).toBe('0.001234');
  });

  it('preserves cache + reasoning tokens', () => {
    usage.recordEvent({
      session_id: 's1',
      turn_id: 't1',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
      reasoning_output_tokens: 25,
      total_cost_usd: 0.005,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const data = usage.exportCsv().trim().split('\n')[1]?.split(',');
    expect(data?.[7]).toBe('200');
    expect(data?.[8]).toBe('300');
    expect(data?.[9]).toBe('25');
  });

  // ── CSV escaping (RFC 4180) ───────────────────────────────

  it('escapes commas in field values with double quotes', () => {
    usage.recordEvent({
      session_id: 's,with,commas',
      turn_id: 't1',
      provider: 'mock',
      model: 'gpt-4',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const csv = usage.exportCsv();
    // session_id 가 escape 됐는지 — `"s,with,commas"` 포함.
    expect(csv).toContain('"s,with,commas"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    usage.recordEvent({
      session_id: 's"quoted"',
      turn_id: 't1',
      provider: 'mock',
      model: 'gpt-4',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const csv = usage.exportCsv();
    // RFC 4180: `"` → `""`, 외부에 `"` 으로 wrap.
    expect(csv).toContain('"s""quoted"""');
  });

  it('escapes embedded newlines and CRs', () => {
    usage.recordEvent({
      session_id: 's\nwith\nnewlines',
      turn_id: 't1',
      provider: 'mock',
      model: 'gpt-4',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const csv = usage.exportCsv();
    expect(csv).toContain('"s\nwith\nnewlines"');
  });

  it('does not wrap fields without special chars', () => {
    usage.recordEvent({
      session_id: 's1',
      turn_id: 't1',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 100,
      output_tokens: 50,
      total_cost_usd: 0.001,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const csv = usage.exportCsv();
    // 일반 필드는 wrap 없어야 한다.
    expect(csv).not.toContain('"claude"');
    expect(csv).toContain(',claude,');
  });

  // ── Range filter ──────────────────────────────────────────

  it('filters by from/to range', () => {
    usage.recordEvent({
      session_id: 's1',
      turn_id: 't1',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-04-01T00:00:00.000Z',
    });
    usage.recordEvent({
      session_id: 's2',
      turn_id: 't2',
      provider: 'codex',
      model: 'gpt-4',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T00:00:00.000Z',
    });
    const csv = usage.exportCsv({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-06-01T00:00:00.000Z',
    });
    expect(csv).not.toContain('s1');
    expect(csv).toContain('s2');
  });

  it('filters by provider', () => {
    usage.recordEvent({
      session_id: 's1',
      turn_id: 't1',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    usage.recordEvent({
      session_id: 's2',
      turn_id: 't2',
      provider: 'codex',
      model: 'gpt-4',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const csv = usage.exportCsv({ provider: 'codex' });
    expect(csv).not.toContain('s1');
    expect(csv).toContain('s2');
  });

  it('orders rows by recorded_at ASC (chronological)', () => {
    usage.recordEvent({
      session_id: 's-late',
      turn_id: 't',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T20:00:00.000Z',
    });
    usage.recordEvent({
      session_id: 's-early',
      turn_id: 't',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0,
      recorded_at: '2026-05-03T05:00:00.000Z',
    });
    const lines = usage.exportCsv().trim().split('\n');
    // header + 2 rows. 첫 번째 데이터 row 는 early.
    expect(lines[1]).toContain('s-early');
    expect(lines[2]).toContain('s-late');
  });

  it('cost is formatted with 6 decimal places (no scientific notation)', () => {
    usage.recordEvent({
      session_id: 's1',
      turn_id: 't1',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 1,
      output_tokens: 1,
      total_cost_usd: 0.00000123, // tiny — must not use e-notation
      recorded_at: '2026-05-03T10:00:00.000Z',
    });
    const data = usage.exportCsv().trim().split('\n')[1]?.split(',');
    expect(data?.[10]).toMatch(/^0\.000001$/);
    expect(data?.[10]).not.toMatch(/e/i);
  });
});
