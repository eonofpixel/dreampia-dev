import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'extract-release-notes.cjs');

describe('extract-release-notes', () => {
  it('exits 2 with no argument', () => {
    expect(() => execSync(`node ${SCRIPT}`, { stdio: 'pipe' })).toThrow();
  });

  it('extracts known version (0.1.2)', () => {
    const out = execSync(`node ${SCRIPT} 0.1.2`, { encoding: 'utf-8' });
    expect(out).toContain('Hardening release');
    expect(out).toContain('ABI 자동 토글');
  });

  it('exits 1 for unknown version', () => {
    expect(() =>
      execSync(`node ${SCRIPT} 99.99.99`, { stdio: 'pipe' })
    ).toThrow();
  });
});
