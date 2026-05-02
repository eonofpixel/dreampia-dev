/**
 * inferProvider 라우팅 테스트.
 *
 * Spec: docs/session/cross-ai-sync.md (모델 → provider 자동 라우팅)
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_PREFIXES,
  inferProvider,
  isClaudeModel,
  isCodexModel,
} from '../../src/providers/routing';

describe('inferProvider — Claude prefixes', () => {
  it('claude-sonnet-4.6 → claude', () => {
    expect(inferProvider('claude-sonnet-4.6')).toBe('claude');
  });

  it('claude-opus-4-1 → claude', () => {
    expect(inferProvider('claude-opus-4-1')).toBe('claude');
  });

  it('claude-haiku-3.5 → claude', () => {
    expect(inferProvider('claude-haiku-3.5')).toBe('claude');
  });

  it('case-insensitive: CLAUDE-Sonnet-4.6 → claude', () => {
    expect(inferProvider('CLAUDE-Sonnet-4.6')).toBe('claude');
  });

  it('shortened sonnet- prefix → claude', () => {
    expect(inferProvider('sonnet-4.6')).toBe('claude');
  });

  it('opus- prefix → claude', () => {
    expect(inferProvider('opus-4-1')).toBe('claude');
  });

  it('haiku- prefix → claude', () => {
    expect(inferProvider('haiku-3.5')).toBe('claude');
  });
});

describe('inferProvider — Codex/OpenAI prefixes', () => {
  it('gpt-5.5 → codex', () => {
    expect(inferProvider('gpt-5.5')).toBe('codex');
  });

  it('gpt-4.1 → codex', () => {
    expect(inferProvider('gpt-4.1')).toBe('codex');
  });

  it('o1-preview → codex', () => {
    expect(inferProvider('o1-preview')).toBe('codex');
  });

  it('o3-mini → codex', () => {
    expect(inferProvider('o3-mini')).toBe('codex');
  });

  it('codex-mini → codex', () => {
    expect(inferProvider('codex-mini')).toBe('codex');
  });

  it('case-insensitive: GPT-5.5 → codex', () => {
    expect(inferProvider('GPT-5.5')).toBe('codex');
  });
});

describe('inferProvider — error cases', () => {
  it('throws on unknown model', () => {
    expect(() => inferProvider('unknown-model')).toThrow(
      /cannot infer provider/i
    );
  });

  it('throws on llama-3 (not registered)', () => {
    expect(() => inferProvider('llama-3-70b')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => inferProvider('')).toThrow(/non-empty/);
  });

  it('error message names the model', () => {
    expect(() => inferProvider('mystery-x')).toThrow(/"mystery-x"/);
  });
});

describe('isClaudeModel / isCodexModel — boolean helpers', () => {
  it('isClaudeModel(claude-*) returns true', () => {
    expect(isClaudeModel('claude-sonnet-4.6')).toBe(true);
  });

  it('isClaudeModel(gpt-*) returns false', () => {
    expect(isClaudeModel('gpt-5.5')).toBe(false);
  });

  it('isClaudeModel on unknown model returns false (no throw)', () => {
    expect(isClaudeModel('unknown-x')).toBe(false);
  });

  it('isCodexModel(gpt-*) returns true', () => {
    expect(isCodexModel('gpt-5.5')).toBe(true);
  });

  it('isCodexModel(claude-*) returns false', () => {
    expect(isCodexModel('claude-opus-4')).toBe(false);
  });

  it('isCodexModel on unknown model returns false (no throw)', () => {
    expect(isCodexModel('unknown-x')).toBe(false);
  });

  it('isClaudeModel + isCodexModel are mutually exclusive for known models', () => {
    const known = [
      'claude-sonnet-4.6',
      'gpt-5.5',
      'o1-preview',
      'haiku-3.5',
      'codex-mini',
    ];
    for (const m of known) {
      const claude = isClaudeModel(m);
      const codex = isCodexModel(m);
      expect(claude !== codex).toBe(true);
    }
  });
});

describe('MODEL_PREFIXES — public registry', () => {
  it('has both providers populated', () => {
    expect(MODEL_PREFIXES.claude.length).toBeGreaterThan(0);
    expect(MODEL_PREFIXES.codex.length).toBeGreaterThan(0);
  });

  it('all prefixes end with hyphen (convention)', () => {
    for (const prefix of MODEL_PREFIXES.claude) {
      expect(prefix.endsWith('-')).toBe(true);
    }
    for (const prefix of MODEL_PREFIXES.codex) {
      expect(prefix.endsWith('-')).toBe(true);
    }
  });
});
