/**
 * Smoke test — Day 1 scaffold 검증.
 *
 * 실제 contract tests 는 Day 4-5 부터 (SS-1 types 작성 후).
 */

import { describe, it, expect } from 'vitest';

describe('Day 1 scaffold', () => {
  it('TypeScript runs', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });

  it('한국어 string handling', () => {
    const greeting = '안녕하세요';
    expect(greeting.normalize('NFC')).toBe('안녕하세요');
    expect(greeting.length).toBe(5);
  });

  it('UUID v7 generation works (uuid package)', async () => {
    const { v7 } = await import('uuid');
    const id = v7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('Zod is available', async () => {
    const { z } = await import('zod');
    const schema = z.object({ name: z.string() });
    expect(schema.parse({ name: '홍길동' })).toEqual({ name: '홍길동' });
  });
});
