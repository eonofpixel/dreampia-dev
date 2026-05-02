/**
 * Contract tests — SessionSchema validation.
 *
 * Verifies:
 *   1. All valid fixtures parse successfully
 *   2. All invalid fixtures fail with the expected error
 *   3. Round-trip: parse → stringify → parse produces identical object
 *
 * Spec: docs/session/_index.md, docs/session/schema.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionSchema } from '../../src/types';

// ────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const VALID_DIR = join(FIXTURES_DIR, 'sessions');
const INVALID_DIR = join(FIXTURES_DIR, 'invalid');

function loadFixture(dir: string, file: string): unknown {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf-8');
  return JSON.parse(text);
}

function listFixtures(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json'));
}

// ────────────────────────────────────────────────────────────
// Valid fixtures: must parse
// ────────────────────────────────────────────────────────────

describe('Valid fixtures parse successfully', () => {
  const validFiles = listFixtures(VALID_DIR);

  it('found at least 5 valid fixtures', () => {
    expect(validFiles.length).toBeGreaterThanOrEqual(5);
  });

  validFiles.forEach((file) => {
    it(`${file} parses against SessionSchema`, () => {
      const data = loadFixture(VALID_DIR, file);
      const result = SessionSchema.safeParse(data);

      if (!result.success) {
        // Print errors for debugging
        console.error(`Fixture ${file} failed:`, JSON.stringify(result.error.issues, null, 2));
      }

      expect(result.success).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────
// Invalid fixtures: must fail
// ────────────────────────────────────────────────────────────

describe('Invalid fixtures are rejected', () => {
  const invalidFiles = listFixtures(INVALID_DIR);

  it('found at least 3 invalid fixtures', () => {
    expect(invalidFiles.length).toBeGreaterThanOrEqual(3);
  });

  invalidFiles.forEach((file) => {
    it(`${file} fails SessionSchema parse`, () => {
      const data = loadFixture(INVALID_DIR, file);
      const result = SessionSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  it('archived-and-pinned: fails INV-6', () => {
    const data = loadFixture(INVALID_DIR, 'archived-and-pinned.json');
    const result = SessionSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toMatch(/archived.*cannot.*pinned/i);
    }
  });

  it('two-pending-turns: fails INV-2', () => {
    const data = loadFixture(INVALID_DIR, 'two-pending-turns.json');
    const result = SessionSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toMatch(/pending.*streaming.*turn/i);
    }
  });

  it('plan-active-no-block: fails INV-7', () => {
    const data = loadFixture(INVALID_DIR, 'plan-active-no-block.json');
    const result = SessionSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toMatch(/plan.*temporarily_blocked/i);
    }
  });

  it('toolcall-not-followed: fails INV-3', () => {
    const data = loadFixture(INVALID_DIR, 'toolcall-not-followed.json');
    const result = SessionSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toMatch(/tool_calls.*next.*tool/i);
    }
  });

  it('bad-uuid: rejects non-UUIDv7 ids', () => {
    const data = loadFixture(INVALID_DIR, 'bad-uuid.json');
    const result = SessionSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toMatch(/UUIDv7/);
    }
  });
});

// ────────────────────────────────────────────────────────────
// Round-trip: parse → JSON → parse must be idempotent
// ────────────────────────────────────────────────────────────

describe('Round-trip serialization', () => {
  const validFiles = listFixtures(VALID_DIR);

  validFiles.forEach((file) => {
    it(`${file} survives JSON round-trip`, () => {
      const original = loadFixture(VALID_DIR, file);
      const parsed1 = SessionSchema.parse(original);

      const serialized = JSON.parse(JSON.stringify(parsed1));
      const parsed2 = SessionSchema.parse(serialized);

      expect(parsed2).toEqual(parsed1);
    });
  });
});
