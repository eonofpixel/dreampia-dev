/**
 * i18n — vendor-free, lightweight runtime.
 *
 * v0.11.0 (B2 English i18n). Codex 권고에 따라 react-intl 같은 외부 dep 없이
 * 자체 구현. 한국어 (`ko`) 가 default — 누락된 키는 자동 fallback.
 *
 * 디자인:
 *   - JSON 메시지를 build-time 에 import (Vite 가 inline) → bundle size 추가 ~7KB
 *   - `{name}` placeholder 보간 지원 (escape 없음 — UI 라벨용 plain text 가정)
 *   - Locale 변경은 module-level state + simple subscriber set → React hook
 *     `useT` 가 forceUpdate 로 reactive 하게 동작
 *   - DOM `lang` 속성도 자동 갱신 → screen reader / spell-check 정확도
 *
 * Spec: ROADMAP.md (v0.11.0 B2 English i18n)
 */

import { useEffect, useState } from 'react';
import koMessages from './messages.ko.json';
import enMessages from './messages.en.json';

/** Supported UI locales. ko (Korean) is default; en (English) is opt-in. */
export type Locale = 'ko' | 'en';

export const LOCALES: ReadonlyArray<Locale> = ['ko', 'en'];

export const DEFAULT_LOCALE: Locale = 'ko';

/** Type guard — settings.json 에서 읽은 unknown 값 검증용. */
export function isLocale(v: unknown): v is Locale {
  return v === 'ko' || v === 'en';
}

/**
 * Message dictionaries. JSON 파일에서 로드 — build-time inline.
 * Type 은 `Record<string, string>` 로 narrowing — JSON 의 모든 값은 string.
 */
const MESSAGES: Record<Locale, Record<string, string>> = {
  ko: koMessages as Record<string, string>,
  en: enMessages as Record<string, string>,
};

let currentLocale: Locale = DEFAULT_LOCALE;

/** Subscribers for locale changes — `useT` hook 이 강제 re-render 용. */
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // ignore subscriber errors — 한 곳의 throw 가 다른 listener 를 막지 않도록
    }
  }
}

/**
 * Set the active locale. Updates `<html lang>` and notifies all `useT` hooks.
 * No-op if locale is already the same — 불필요한 re-render 방지.
 */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  notify();
}

/** Get the active locale (synchronous). */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Subscribe to locale changes. Returns an unsubscribe function.
 * Used by `useT` hook — public surface so non-React modules can also react.
 */
export function subscribeLocale(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * `t(key, params?)` — translate a key with optional `{param}` interpolation.
 *
 * Lookup order:
 *   1. current locale dictionary
 *   2. fallback to default locale (ko)
 *   3. fallback to the key string itself (visible "i18n miss" indicator)
 *
 * Interpolation: `{name}` tokens are replaced with `String(params[name] ?? '')`.
 * No HTML escape — caller is responsible for using safe React JSX (default).
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = MESSAGES[currentLocale];
  const fallback = MESSAGES[DEFAULT_LOCALE];
  // `dict[key]` is `string | undefined` under noUncheckedIndexedAccess.
  const msg = dict[key] ?? fallback[key] ?? key;
  if (params === undefined) return msg;
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    return v === undefined ? '' : String(v);
  });
}

/**
 * React hook — returns `t` and re-renders the consuming component on locale
 * change. Stable function reference within a single locale (no extra deps).
 *
 * Usage:
 *   const t = useT();
 *   return <button>{t('chat.input.send')}</button>;
 */
export function useT(): typeof t {
  // useState returns a tuple — we only need the trigger for re-renders.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeLocale(() => {
      forceUpdate((n) => n + 1);
    });
    return unsubscribe;
  }, []);
  return t;
}

/**
 * Test-only — reset module state. Production callers must NOT use this.
 * Useful in vitest where multiple tests configure different locales.
 */
export function __resetLocale(): void {
  currentLocale = DEFAULT_LOCALE;
  subscribers.clear();
}

/**
 * v1.7.22 — IPC error detail 표시용 helper.
 *
 * 사용 맥락: settings panel 의 toast detail 에 main process 의 `r.error` 를
 * 그대로 노출했었는데, 그 값이 영문 stack 일 수도 / `error.foo` 같은 i18n
 * key 일 수도 / undefined 일 수도 있다. UX 일관성을 위해 한 곳에서 정규화:
 *
 *   - undefined / null → t('error.unknown')
 *   - "error.xxx" 형식 (i18n key prefix) → t(value)  (한국어 fallback 자동)
 *   - 그 외 string → 원문 그대로 (이미 사람이 읽을 수 있는 메시지로 가정)
 */
export function formatErrorDetail(translate: typeof t, raw: unknown): string {
  if (raw === undefined || raw === null) return translate('error.unknown');
  if (typeof raw === 'string') {
    // i18n key 같으면 t() 통과 — 누락된 키도 자체 fallback 으로 원문 반환.
    if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(raw)) {
      return translate(raw);
    }
    return raw;
  }
  if (raw instanceof Error) return raw.message;
  return String(raw);
}
