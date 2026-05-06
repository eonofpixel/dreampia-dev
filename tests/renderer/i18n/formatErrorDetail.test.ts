/**
 * formatErrorDetail unit test (v1.7.22)
 *
 * Settings panel toast detail 의 raw IPC error 정규화 검증:
 * - undefined / null → t('error.unknown')
 * - "error.foo" 형태 (i18n key 같음) → t() 통과
 * - 그 외 string → 원문 그대로
 * - Error instance → .message
 * - 그 외 → String(value)
 */

import { describe, it, expect } from 'vitest';
import { formatErrorDetail, t, setLocale, __resetLocale } from '../../../src/renderer/i18n';

describe('formatErrorDetail (v1.7.22)', () => {
  it('undefined → "알 수 없는 오류" (ko default)', () => {
    __resetLocale();
    expect(formatErrorDetail(t, undefined)).toBe('알 수 없는 오류가 발생했어요.');
  });

  it('null → "알 수 없는 오류" (ko default)', () => {
    __resetLocale();
    expect(formatErrorDetail(t, null)).toBe('알 수 없는 오류가 발생했어요.');
  });

  it('undefined → "An unknown error occurred." after setLocale(en)', () => {
    __resetLocale();
    setLocale('en');
    expect(formatErrorDetail(t, undefined)).toBe('An unknown error occurred.');
    __resetLocale();
  });

  it('"error.workspace_required" → t() 통과 (ko)', () => {
    __resetLocale();
    expect(formatErrorDetail(t, 'error.workspace_required')).toBe(
      '작업 폴더를 먼저 선택해 주세요.'
    );
  });

  it('"error.unknown" → t() 통과 (ko)', () => {
    __resetLocale();
    expect(formatErrorDetail(t, 'error.unknown')).toBe('알 수 없는 오류가 발생했어요.');
  });

  it('"error.never_registered" → t() 통과 (key fallback to itself)', () => {
    __resetLocale();
    // 등록 안된 키도 t() 의 자체 fallback 으로 key 그대로 반환 — ok.
    expect(formatErrorDetail(t, 'error.never_registered')).toBe('error.never_registered');
  });

  it('일반 영문 stack 문자열은 원문 유지', () => {
    __resetLocale();
    const stack = 'TypeError: Cannot read property foo of undefined\n  at ...';
    expect(formatErrorDetail(t, stack)).toBe(stack);
  });

  it('한국어 사람 메시지도 원문 유지', () => {
    __resetLocale();
    expect(formatErrorDetail(t, '서버 응답이 없어요.')).toBe('서버 응답이 없어요.');
  });

  it('Error instance → .message 사용', () => {
    __resetLocale();
    const err = new Error('boom');
    expect(formatErrorDetail(t, err)).toBe('boom');
  });

  it('숫자나 객체는 String() 처리', () => {
    __resetLocale();
    expect(formatErrorDetail(t, 42)).toBe('42');
    expect(formatErrorDetail(t, { code: 1 })).toBe('[object Object]');
  });

  it('"settings.foo.bar" 같은 일반 i18n key 도 t() 통과', () => {
    __resetLocale();
    // i18n key 형식 (lowercase + dots) 매칭됨. 등록 안된 키면 그대로 반환.
    expect(formatErrorDetail(t, 'foo.bar.baz')).toBe('foo.bar.baz');
  });

  it('대문자로 시작하는 string 은 i18n key 가 아님 — 원문 유지', () => {
    __resetLocale();
    expect(formatErrorDetail(t, 'Error.Something')).toBe('Error.Something');
  });

  it('"error" 단일 단어는 i18n key 형식 아님 (dot 없음) — 원문', () => {
    __resetLocale();
    expect(formatErrorDetail(t, 'error')).toBe('error');
  });
});
