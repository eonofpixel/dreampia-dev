/**
 * dreampia-diagnose.cjs — v0.14.0 (A ABI Hardening) 사용자 자가 진단 CLI.
 *
 * 검증:
 *  - --json 모드 실행 시 valid JSON 반환
 *  - JSON 안에 platform / node_version / electron_version / binding_exists 등
 *    핵심 필드 포함
 *  - 0 또는 1 exit code (검사 결과 OK / FAIL 둘 다 정상 동작)
 *  - 사람이 읽는 모드도 throw 하지 않음
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'dreampia-diagnose.cjs');

interface DiagOutput {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; value: string; hint?: string }>;
  generated_at: string;
}

function runJson(): { result: DiagOutput; status: number } {
  const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf-8' });
  return {
    result: JSON.parse(r.stdout) as DiagOutput,
    status: r.status ?? -1,
  };
}

describe('dreampia-diagnose script (v0.14.0 A ABI Hardening)', () => {
  it('runs with --json and produces valid JSON', () => {
    const { result, status } = runJson();
    expect(status === 0 || status === 1).toBe(true);
    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.checks)).toBe(true);
    expect(typeof result.generated_at).toBe('string');
  });

  it('reports platform / node_version / binding_exists checks', () => {
    const { result } = runJson();
    const names = result.checks.map((c) => c.name);
    expect(names).toContain('platform');
    expect(names).toContain('node_version');
    expect(names).toContain('binding_exists');
  });

  it('node_version check passes (Node 22+)', () => {
    const { result } = runJson();
    const nodeCheck = result.checks.find((c) => c.name === 'node_version');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck?.ok).toBe(true);
  });

  it('produces non-empty plain text output without --json', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
    expect(r.status === 0 || r.status === 1).toBe(true);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(r.stdout).toMatch(/Dreampia-Dev Diagnose/);
  });
});
