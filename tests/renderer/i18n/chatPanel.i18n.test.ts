/**
 * v1.6.20 — ChatPanel i18n coverage.
 *
 * ChatPanel.tsx 가 hardcoded 문자열 대신 t() 키를 사용하는지 검증.
 * 신규 키 (chat.embedded_card.label, chat.provider_badge.*) 의 ko/en
 * 양쪽 존재 + {title}, {version}, {path} 보간 검증.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '../../../src/renderer/i18n';

describe('v1.6.20 — ChatPanel i18n keys', () => {
  beforeEach(() => {
    setLocale('ko');
  });

  afterEach(() => {
    setLocale('ko');
  });

  it('chat.embedded_card.label — ko {title} 보간', () => {
    setLocale('ko');
    const out = t('chat.embedded_card.label', { title: 'Hello' });
    expect(out).toContain('Hello');
    expect(out).toContain('임베디드');
  });

  it('chat.embedded_card.label — en {title} 보간', () => {
    setLocale('en');
    const out = t('chat.embedded_card.label', { title: 'World' });
    expect(out).toContain('World');
    expect(out).toContain('Embedded');
  });

  it('chat.provider_badge.mock + mock_title — ko/en 양쪽 존재', () => {
    setLocale('ko');
    expect(t('chat.provider_badge.mock')).toBe('Mock');
    expect(t('chat.provider_badge.mock_title')).toContain('Mock provider');

    setLocale('en');
    expect(t('chat.provider_badge.mock')).toBe('Mock');
    expect(t('chat.provider_badge.mock_title')).toContain('Mock provider');
  });

  it('chat.provider_badge.claude/codex — {version} 보간', () => {
    setLocale('ko');
    expect(t('chat.provider_badge.claude', { version: '1.2.3' })).toContain(
      '1.2.3'
    );
    expect(t('chat.provider_badge.codex', { version: '0.9' })).toContain('0.9');

    setLocale('en');
    expect(t('chat.provider_badge.claude_title', { version: 'v1', path: '/x' }))
      .toContain('/x');
    expect(t('chat.provider_badge.codex_title', { version: 'v2', path: '/y' }))
      .toContain('/y');
  });

  it('chat.provider_badge.none + none_title — ko/en 정상 lookup', () => {
    setLocale('ko');
    expect(t('chat.provider_badge.none')).toBe('CLI 없음');
    expect(t('chat.provider_badge.none_title')).toContain('Mock');

    setLocale('en');
    expect(t('chat.provider_badge.none')).toBe('No CLI');
    expect(t('chat.provider_badge.none_title')).toContain('Mock');
  });

  it('all new keys — ko/en 둘 다 hit (no missing key fallback)', () => {
    const keys = [
      'chat.embedded_card.label',
      'chat.provider_badge.mock_title',
      'chat.provider_badge.mock',
      'chat.provider_badge.claude_title',
      'chat.provider_badge.claude',
      'chat.provider_badge.codex_title',
      'chat.provider_badge.codex',
      'chat.provider_badge.none_title',
      'chat.provider_badge.none',
    ];
    for (const locale of ['ko', 'en'] as const) {
      setLocale(locale);
      for (const k of keys) {
        const out = t(k, { title: 'T', version: 'V', path: 'P' });
        // miss fallback returns the key itself; pass means out !== k (after
        // {param} interpolation).
        const hasInterp = out.includes('T') || out.includes('V') || out.includes('P');
        expect(out !== k || hasInterp).toBe(true);
        expect(out.length).toBeGreaterThan(0);
      }
    }
  });
});
