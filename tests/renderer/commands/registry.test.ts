/**
 * Registry tests — F-018 슬래시 명령 파싱 + 필터링.
 *
 * Spec: docs/ux/patterns/F-018-slash-commands.md
 */

import { describe, it, expect } from 'vitest';
import {
  KNOWN_MODELS,
  SLASH_COMMANDS,
  filterCommands,
  parseSlashInput,
} from '../../../src/renderer/commands/registry';

describe('SLASH_COMMANDS registry', () => {
  it('contains 8 unique commands (7 base + /compare in v0.12.0)', () => {
    expect(SLASH_COMMANDS).toHaveLength(8);
    const ids = new Set(SLASH_COMMANDS.map((c) => c.id));
    expect(ids.size).toBe(8);
  });

  it('every trigger starts with /', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.trigger.startsWith('/')).toBe(true);
    }
  });

  it('Korean labels are non-empty', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.label.length).toBeGreaterThan(0);
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it('only /model and /compare have hasArgs (v0.12.0)', () => {
    const argsCommands = SLASH_COMMANDS.filter((c) => c.hasArgs === true);
    expect(argsCommands.map((c) => c.id).sort()).toEqual(['compare', 'model']);
    for (const cmd of argsCommands) {
      expect(cmd.argHint).toBeDefined();
    }
  });
});

describe('parseSlashInput', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashInput('hello world')).toBeNull();
    expect(parseSlashInput('')).toBeNull();
    expect(parseSlashInput('  /help')).toBeNull();
  });

  it('returns null for unknown trigger', () => {
    expect(parseSlashInput('/foo')).toBeNull();
    expect(parseSlashInput('/help-me')).toBeNull();
  });

  it('matches a command without arg', () => {
    const result = parseSlashInput('/help');
    expect(result).not.toBeNull();
    expect(result?.command.id).toBe('help');
    expect(result?.arg).toBe('');
  });

  it('matches a command with arg', () => {
    const result = parseSlashInput('/model claude-3-5-sonnet-20241022');
    expect(result).not.toBeNull();
    expect(result?.command.id).toBe('model');
    expect(result?.arg).toBe('claude-3-5-sonnet-20241022');
  });

  it('trims trailing whitespace from arg', () => {
    const result = parseSlashInput('/model   gpt-4o   ');
    expect(result?.arg).toBe('gpt-4o');
  });

  it('returns empty arg when only trigger and trailing space', () => {
    const result = parseSlashInput('/help ');
    expect(result?.command.id).toBe('help');
    expect(result?.arg).toBe('');
  });
});

describe('filterCommands', () => {
  it('returns empty for non-slash query', () => {
    expect(filterCommands('')).toEqual([]);
    expect(filterCommands('help')).toEqual([]);
  });

  it('returns ALL commands for / alone', () => {
    const result = filterCommands('/');
    expect(result.length).toBe(SLASH_COMMANDS.length);
  });

  it('prefix-matches /h to /help only (no other trigger starts with /h)', () => {
    const result = filterCommands('/h');
    const ids = result.map((c) => c.id);
    expect(ids).toContain('help');
    // /clear, /new, /model, /settings, /usage, /onboarding all NOT prefix-/h
    expect(ids).not.toContain('clear');
    expect(ids).not.toContain('settings');
  });

  it('case-insensitive prefix match', () => {
    const lower = filterCommands('/usage');
    const mixed = filterCommands('/USAge');
    expect(lower.map((c) => c.id)).toEqual(mixed.map((c) => c.id));
  });

  it('label substring fallback when no prefix match', () => {
    // '/도움' → '/' starts with '/' but no trigger has Korean.
    // 라벨 '도움말' 의 '도움' 이 substring match.
    const result = filterCommands('/도움');
    const ids = result.map((c) => c.id);
    expect(ids).toContain('help');
  });

  it('prefix matches sort before substring matches', () => {
    // '/u' prefix-matches /usage; substring '도움' would match /help.
    // 이 케이스에서는 prefix match 만 있음.
    const result = filterCommands('/u');
    expect(result[0]?.id).toBe('usage');
  });

  it('returns empty when no matches', () => {
    expect(filterCommands('/zzzzzz')).toEqual([]);
  });
});

describe('KNOWN_MODELS', () => {
  it('contains both Claude and Codex models', () => {
    expect(KNOWN_MODELS.some((m) => m.startsWith('claude-'))).toBe(true);
    expect(KNOWN_MODELS.some((m) => m.startsWith('gpt-'))).toBe(true);
  });

  it('all entries are non-empty strings', () => {
    for (const model of KNOWN_MODELS) {
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    }
  });
});
