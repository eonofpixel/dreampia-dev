/**
 * jsonSchemaToZod — v1.0.13 (FAKE-5) MCP input_schema 중간 변환.
 *
 * Spec: docs/v1.x-roadmap.md (FAKE-5), Codex 외부 검토 (codex-question-4).
 *
 * 정책 (Codex picking — 옵션 b 중간):
 *  - top-level required + 기본 type (string / number / boolean / object /
 *    array) 만 변환.
 *  - nested properties 는 z.unknown() — full JSON Schema 변환 (의존
 *    추가 + 호환성 표면) 은 P1.
 *  - 변환 실패 → z.unknown() fallback (silent) + 호출자가 audit 발행.
 *
 * INV-1: 함수는 throw X — 항상 ZodSchema 반환 (worst case z.unknown()).
 * INV-2: result + raw flag 반환해 caller 가 fallback 여부 audit 가능.
 *
 * 참고: MCP server 의 inputSchema 는 JSON Schema draft-07 (or 2020-12)
 * 의 subset. Anthropic 의 Tool use API 도 같은 형식.
 */

import { z } from 'zod';

export type JsonSchemaLike = Record<string, unknown>;

export interface JsonSchemaToZodResult {
  schema: z.ZodSchema<unknown>;
  /** true 면 raw object 모양만 변환됨 (nested 은 unknown). false = 완전 unknown fallback. */
  converted: boolean;
  /** 변환 중 발생한 경고 / 미지원 항목. audit 에 그대로 기록 권장. */
  warnings: string[];
}

const MAX_PROPERTY_COUNT = 200;

/**
 * JSON Schema → Zod (top-level + 기본 type 중간 변환).
 *
 * 입력이 object 가 아니거나 type !== 'object' 면 z.unknown() 반환 (converted=false).
 * type=object 면 properties 의 각 키를 1차 type 로 변환 — nested 는 unknown.
 */
export function jsonSchemaToZod(input: unknown): JsonSchemaToZodResult {
  const warnings: string[] = [];

  if (input === null || input === undefined || typeof input !== 'object') {
    return { schema: z.unknown(), converted: false, warnings: ['schema: not an object'] };
  }
  const schemaObj = input as JsonSchemaLike;
  const topType = schemaObj['type'];

  // MCP spec 은 inputSchema.type === 'object' 가 일반. 그 외 (e.g. array, string)
  // 는 정상이지만 흔치 않음 — 일단 unknown 으로 두고 caller 가 audit.
  if (topType !== 'object') {
    return {
      schema: z.unknown(),
      converted: false,
      warnings: [`schema.type=${typeof topType === 'string' ? topType : '<missing>'} not object`],
    };
  }

  const propsRaw = schemaObj['properties'];
  const requiredRaw = schemaObj['required'];

  if (propsRaw === undefined || typeof propsRaw !== 'object' || propsRaw === null) {
    // type=object + properties 없음 = 모든 input 허용. z.record(z.unknown()) 가 자연.
    return {
      schema: z.record(z.unknown()),
      converted: true,
      warnings: ['schema.properties absent — accepting any object'],
    };
  }

  const propsObj = propsRaw as JsonSchemaLike;
  const propKeys = Object.keys(propsObj);
  if (propKeys.length > MAX_PROPERTY_COUNT) {
    warnings.push(
      `properties count ${propKeys.length} > ${MAX_PROPERTY_COUNT} — truncating`
    );
  }

  const requiredSet = new Set<string>();
  if (Array.isArray(requiredRaw)) {
    for (const k of requiredRaw) {
      if (typeof k === 'string') requiredSet.add(k);
    }
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of propKeys.slice(0, MAX_PROPERTY_COUNT)) {
    const propVal = propsObj[key];
    const base = primitiveType(propVal, warnings, key);
    // optional vs required: required[] 에 있으면 그대로, 없으면 .optional().
    shape[key] = requiredSet.has(key) ? base : base.optional();
  }

  // additionalProperties: false 명시 시 strict, 그 외엔 passthrough (MCP 가
  // 추가 필드 보낼 수 있으니 관대).
  const additional = schemaObj['additionalProperties'];
  const objSchema =
    additional === false ? z.object(shape).strict() : z.object(shape).passthrough();

  return { schema: objSchema, converted: true, warnings };
}

/**
 * Top-level type 만 변환 — string/number/boolean → 정확. object/array 는
 * z.unknown() (nested 는 P1 에서 변환). enum/format 등 은 미지원 (warnings).
 */
function primitiveType(
  prop: unknown,
  warnings: string[],
  key: string
): z.ZodTypeAny {
  if (prop === null || prop === undefined || typeof prop !== 'object') {
    warnings.push(`property "${key}": malformed`);
    return z.unknown();
  }
  const obj = prop as JsonSchemaLike;
  const t = obj['type'];

  if (typeof t !== 'string') {
    // type 미지정 — z.unknown().
    return z.unknown();
  }

  switch (t) {
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'null':
      return z.null();
    case 'array':
      // items 의 type 까지 보지 않음 — Codex 권고 (P0 적정선).
      return z.array(z.unknown());
    case 'object':
      // nested object 는 z.record(unknown) 으로 — 키 검증은 P1 full conversion.
      return z.record(z.unknown());
    default:
      warnings.push(`property "${key}": unsupported type "${t}"`);
      return z.unknown();
  }
}
