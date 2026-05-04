/**
 * jsonSchemaToZod — v1.0.13 (FAKE-5) MCP input_schema 변환 contract.
 *
 * 검증 (Codex 옵션 b — 중간):
 *  1. type=object + properties → ZodObject (passthrough by default).
 *  2. required[] 처리.
 *  3. additionalProperties: false → strict.
 *  4. type=string/number/boolean → z.string/number/boolean.
 *  5. type=integer → z.number (JSON Schema 의 integer 도 number 로).
 *  6. nested object/array 는 z.unknown / z.record(unknown) (full 변환 X).
 *  7. type 미지정 → z.unknown.
 *  8. Non-object input → z.unknown + converted=false.
 *  9. type=object + properties 없음 → z.record(unknown).
 *  10. Warnings 누적.
 */

import { describe, it, expect } from 'vitest';
import { jsonSchemaToZod } from '../../src/main/mcp/jsonSchemaToZod';

describe('jsonSchemaToZod — Codex 옵션 b 중간 변환', () => {
  it('non-object input → z.unknown + converted=false', () => {
    const r = jsonSchemaToZod(null);
    expect(r.converted).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.schema.safeParse('anything').success).toBe(true);
  });

  it('type 미지정 → z.unknown + converted=false', () => {
    const r = jsonSchemaToZod({ properties: { foo: { type: 'string' } } });
    expect(r.converted).toBe(false);
  });

  it('type=object + properties 없음 → z.record(unknown)', () => {
    const r = jsonSchemaToZod({ type: 'object' });
    expect(r.converted).toBe(true);
    expect(r.schema.safeParse({ a: 1 }).success).toBe(true);
    expect(r.schema.safeParse('not an object').success).toBe(false);
  });

  it('type=object + 기본 type 변환', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
        flag: { type: 'boolean' },
      },
      required: ['name'],
    });
    expect(r.converted).toBe(true);
    expect(r.schema.safeParse({ name: 'a', count: 1, flag: true }).success).toBe(true);
    // count optional — 누락 OK.
    expect(r.schema.safeParse({ name: 'a' }).success).toBe(true);
    // name required — 누락 시 fail.
    expect(r.schema.safeParse({ count: 1 }).success).toBe(false);
  });

  it('type=integer 도 z.number 로 매핑', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: { age: { type: 'integer' } },
      required: ['age'],
    });
    expect(r.schema.safeParse({ age: 42 }).success).toBe(true);
  });

  it('nested object 는 z.record(unknown) — full 변환 X', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: { deep: { type: 'string' } },
          required: ['deep'],
        },
      },
      required: ['config'],
    });
    // nested 의 deep 누락도 통과 (z.record(unknown) 이라).
    expect(r.schema.safeParse({ config: {} }).success).toBe(true);
    expect(r.schema.safeParse({ config: { whatever: 1 } }).success).toBe(true);
  });

  it('array 는 z.array(z.unknown())', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: {
        tags: { type: 'array' },
      },
    });
    expect(r.schema.safeParse({ tags: ['a', 'b', 1] }).success).toBe(true);
    expect(r.schema.safeParse({ tags: 'not array' }).success).toBe(false);
  });

  it('additionalProperties: false → strict mode', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    });
    expect(r.schema.safeParse({ name: 'a' }).success).toBe(true);
    expect(r.schema.safeParse({ name: 'a', extra: 1 }).success).toBe(false);
  });

  it('default (additionalProperties 미지정) → passthrough', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    expect(r.schema.safeParse({ name: 'a', extra: 'allowed' }).success).toBe(true);
  });

  it('지원되지 않는 type → warnings + z.unknown', () => {
    const r = jsonSchemaToZod({
      type: 'object',
      properties: { weird: { type: 'fancy-format' } },
      required: ['weird'],
    });
    expect(r.converted).toBe(true);
    expect(r.warnings.some((w) => w.includes('weird'))).toBe(true);
    // weird 가 z.unknown() + required → 어떤 값이든 통과.
    expect(r.schema.safeParse({ weird: 'whatever' }).success).toBe(true);
  });

  it('top-level type 이 array 면 변환 안 함 (P0 적정선)', () => {
    const r = jsonSchemaToZod({ type: 'array' });
    expect(r.converted).toBe(false);
  });
});
