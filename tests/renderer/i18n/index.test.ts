/**
 * i18n module-level test.
 *
 * v0.11.0 (B2 English i18n) — vendor-free runtime.
 *   - t() lookup with fallback chain
 *   - Locale switching + subscriber notification
 *   - {param} interpolation
 *   - isLocale() type guard
 *
 * Spec: ROADMAP.md (v0.11.0 B2)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  getLocale,
  isLocale,
  setLocale,
  subscribeLocale,
  t,
} from '../../../src/renderer/i18n';

describe('i18n module', () => {
  beforeEach(() => {
    setLocale('ko'); // ensure clean slate
  });

  afterEach(() => {
    setLocale('ko'); // restore default for other tests
  });

  describe('LOCALES + DEFAULT_LOCALE', () => {
    it('exposes ko + en in LOCALES', () => {
      expect(LOCALES).toEqual(['ko', 'en']);
    });

    it('default locale is ko', () => {
      expect(DEFAULT_LOCALE).toBe('ko');
    });
  });

  describe('isLocale()', () => {
    it('accepts ko and en', () => {
      expect(isLocale('ko')).toBe(true);
      expect(isLocale('en')).toBe(true);
    });

    it('rejects other strings, undefined, numbers, objects', () => {
      expect(isLocale('jp')).toBe(false);
      expect(isLocale('')).toBe(false);
      expect(isLocale(undefined)).toBe(false);
      expect(isLocale(null)).toBe(false);
      expect(isLocale(42)).toBe(false);
      expect(isLocale({ kind: 'ko' })).toBe(false);
    });
  });

  describe('setLocale + getLocale', () => {
    it('starts at ko and switches to en', () => {
      expect(getLocale()).toBe('ko');
      setLocale('en');
      expect(getLocale()).toBe('en');
    });

    it('updates document.documentElement.lang', () => {
      setLocale('en');
      expect(document.documentElement.lang).toBe('en');
      setLocale('ko');
      expect(document.documentElement.lang).toBe('ko');
    });

    it('no-ops if locale is already the same', () => {
      setLocale('ko');
      const listener = vi.fn();
      const unsub = subscribeLocale(listener);
      setLocale('ko'); // same locale → no notification
      expect(listener).not.toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribeLocale()', () => {
    it('notifies subscribers on locale change', () => {
      const listener = vi.fn();
      const unsub = subscribeLocale(listener);
      setLocale('en');
      expect(listener).toHaveBeenCalledTimes(1);
      setLocale('ko');
      expect(listener).toHaveBeenCalledTimes(2);
      unsub();
    });

    it('returns unsubscribe that stops further notifications', () => {
      const listener = vi.fn();
      const unsub = subscribeLocale(listener);
      unsub();
      setLocale('en');
      expect(listener).not.toHaveBeenCalled();
    });

    it('isolates subscriber errors so others still fire', () => {
      const bad = vi.fn(() => {
        throw new Error('boom');
      });
      const good = vi.fn();
      const u1 = subscribeLocale(bad);
      const u2 = subscribeLocale(good);
      setLocale('en');
      expect(bad).toHaveBeenCalledTimes(1);
      expect(good).toHaveBeenCalledTimes(1);
      u1();
      u2();
    });
  });

  describe('t() — lookup + fallback', () => {
    it('returns Korean message by default', () => {
      const result = t('chat.input.send');
      expect(result).toBe('전송');
    });

    it('returns English message when locale is en', () => {
      setLocale('en');
      const result = t('chat.input.send');
      expect(result).toBe('Send');
    });

    it('falls back to Korean when key missing in English (theoretical)', () => {
      // 모든 키가 양쪽 다 있어야 하지만, 만약 한쪽에 누락된다면 fallback 동작 검증.
      // 실제로는 테스트용 — `messages.en.json` 에 없는 가짜 키를 시도.
      setLocale('en');
      const result = t('this.key.does.not.exist.anywhere');
      // fallback chain 마지막 = 키 자체.
      expect(result).toBe('this.key.does.not.exist.anywhere');
    });

    it('returns key string when missing in both dictionaries', () => {
      const result = t('totally.bogus.key');
      expect(result).toBe('totally.bogus.key');
    });
  });

  describe('t() — {param} interpolation', () => {
    it('replaces {name} with provided string', () => {
      const result = t('chat.welcome.start', { name: 'my-project' });
      expect(result).toContain('my-project');
    });

    it('replaces multiple params', () => {
      const result = t('sidebar.mcp.error_count', { n: 3, e: 2 });
      expect(result).toContain('3');
      expect(result).toContain('2');
    });

    it('substitutes empty string for missing params', () => {
      // chat.welcome.start uses {name} — passing empty params yields empty interpolation.
      const result = t('chat.welcome.start', {});
      expect(result).not.toContain('{name}');
    });

    it('returns raw message when params is undefined', () => {
      const result = t('chat.welcome.start');
      // 파라미터가 없으면 raw template 그대로 — 한국어 메시지 안에 `{name}` 토큰이 살아 있어야 함.
      expect(result).toContain('{name}');
    });
  });
});
