/**
 * VCR loader unit tests (v1.1.10 / drive17 prep).
 *
 * 검증:
 *  - loadFixture: missing → VcrFixtureMissingError.
 *  - loadFixture: 잘못된 JSON / version / 필드 → VcrFixtureInvalidError.
 *  - eventsHashOf: 결정성 + 같은 events 같은 hash + 다른 events 다른 hash.
 *  - detectDrift: expected_events_hash 미지정 → drift X.
 *  - detectDrift: hash mismatch → drift true.
 *  - updateFixtureHash: 파일 갱신 (recorded_at + expected_events_hash).
 *  - shouldRequireFixture: replay → true / record / live → false.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadFixture,
  eventsHashOf,
  detectDrift,
  updateFixtureHash,
  shouldRequireFixture,
  vcrProductionGate,
  VcrFixtureMissingError,
  VcrFixtureInvalidError,
} from '../../../src/providers/cli/vcrLoader';
import type { StreamEvent } from '../../../src/providers/types';
import type { VcrFixture } from '../../../src/providers/cli/vcr';

let scratchDir: string;
beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'vcr-loader-test-'));
});
afterEach(() => {
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function writeFixture(fileName: string, fixture: unknown): string {
  const path = join(scratchDir, fileName);
  writeFileSync(path, JSON.stringify(fixture, null, 2), 'utf8');
  return path;
}

const VALID_FIXTURE: VcrFixture = {
  version: '1',
  fixture_id: 'test/sample',
  provider: 'claude',
  recorded_at: '2026-05-06T00:00:00.000Z',
  spawn: { argv: ['--print'], cwd: '.' },
  stdin_chunks: [],
  stdout_chunks: [{ delay_ms: 5, data: 'hello\n' }],
  stderr_chunks: [],
  exit: { code: 0, signal: null },
};

describe('v1.1.10 — VcrLoader.loadFixture', () => {
  it('missing path → VcrFixtureMissingError', () => {
    expect(() => loadFixture(join(scratchDir, 'no-such.json'))).toThrow(
      VcrFixtureMissingError
    );
  });

  it('잘못된 JSON → VcrFixtureInvalidError', () => {
    const path = join(scratchDir, 'bad.json');
    writeFileSync(path, '{ not valid json', 'utf8');
    expect(() => loadFixture(path)).toThrow(VcrFixtureInvalidError);
  });

  it('version mismatch → VcrFixtureInvalidError', () => {
    const path = writeFixture('v2.json', { ...VALID_FIXTURE, version: '2' });
    expect(() => loadFixture(path)).toThrow(/version/i);
  });

  it('missing provider → VcrFixtureInvalidError', () => {
    const path = writeFixture('no-prov.json', {
      ...VALID_FIXTURE,
      provider: '',
    });
    expect(() => loadFixture(path)).toThrow(VcrFixtureInvalidError);
  });

  it('invalid provider → VcrFixtureInvalidError', () => {
    const path = writeFixture('bad-prov.json', {
      ...VALID_FIXTURE,
      provider: 'bedrock',
    });
    expect(() => loadFixture(path)).toThrow(/claude\|codex/);
  });

  it('missing spawn → VcrFixtureInvalidError', () => {
    const fx = { ...VALID_FIXTURE } as unknown as Record<string, unknown>;
    delete fx.spawn;
    const path = writeFixture('no-spawn.json', fx);
    expect(() => loadFixture(path)).toThrow(VcrFixtureInvalidError);
  });

  it('valid fixture → 정상 반환', () => {
    const path = writeFixture('ok.json', VALID_FIXTURE);
    const result = loadFixture(path);
    expect(result.fixture_id).toBe('test/sample');
    expect(result.provider).toBe('claude');
    expect(result.spawn.argv).toEqual(['--print']);
  });
});

describe('v1.1.10 — VcrLoader.eventsHashOf', () => {
  it('빈 배열 → stable hash', () => {
    expect(eventsHashOf([])).toBe(eventsHashOf([]));
  });

  it('같은 events 시퀀스 → 같은 hash', () => {
    const a: StreamEvent[] = [
      { type: 'message_start', turn_id: 'T1' as never, model: 'claude-x' },
      { type: 'text_delta', text: 'hi' },
    ];
    const b: StreamEvent[] = [
      { type: 'message_start', turn_id: 'T2' as never, model: 'claude-x' },
      { type: 'text_delta', text: 'hi' },
    ];
    // turn_id 는 normalize 에서 제외 → hash 동일.
    expect(eventsHashOf(a)).toBe(eventsHashOf(b));
  });

  it('다른 text → 다른 hash', () => {
    const a: StreamEvent[] = [{ type: 'text_delta', text: 'hi' }];
    const b: StreamEvent[] = [{ type: 'text_delta', text: 'hello' }];
    expect(eventsHashOf(a)).not.toBe(eventsHashOf(b));
  });

  it('text_delta 순서 다르면 다른 hash', () => {
    const a: StreamEvent[] = [
      { type: 'text_delta', text: 'a' },
      { type: 'text_delta', text: 'b' },
    ];
    const b: StreamEvent[] = [
      { type: 'text_delta', text: 'b' },
      { type: 'text_delta', text: 'a' },
    ];
    expect(eventsHashOf(a)).not.toBe(eventsHashOf(b));
  });
});

describe('v1.1.10 — VcrLoader.detectDrift', () => {
  it('expected_events_hash 미지정 → drift false (opt-in)', () => {
    const fixture: VcrFixture = { ...VALID_FIXTURE };
    delete fixture.expected_events_hash;
    const events: StreamEvent[] = [{ type: 'text_delta', text: 'x' }];
    const result = detectDrift(fixture, events);
    expect(result.drift).toBe(false);
    expect(result.actual).toMatch(/^[a-f0-9]+$/);
  });

  it('hash 일치 → drift false', () => {
    const events: StreamEvent[] = [{ type: 'text_delta', text: 'x' }];
    const expected = eventsHashOf(events);
    const fixture: VcrFixture = { ...VALID_FIXTURE, expected_events_hash: expected };
    expect(detectDrift(fixture, events).drift).toBe(false);
  });

  it('hash mismatch → drift true', () => {
    const events: StreamEvent[] = [{ type: 'text_delta', text: 'x' }];
    const fixture: VcrFixture = {
      ...VALID_FIXTURE,
      expected_events_hash: 'definitely-wrong-hash',
    };
    const result = detectDrift(fixture, events);
    expect(result.drift).toBe(true);
    expect(result.expected).toBe('definitely-wrong-hash');
  });
});

describe('v1.1.10 — VcrLoader.updateFixtureHash', () => {
  it('fixture 의 expected_events_hash + recorded_at 갱신', () => {
    const path = writeFixture('upd.json', VALID_FIXTURE);
    const events: StreamEvent[] = [{ type: 'text_delta', text: 'updated' }];
    updateFixtureHash(path, events);
    const reread = JSON.parse(readFileSync(path, 'utf8')) as VcrFixture;
    expect(reread.expected_events_hash).toBe(eventsHashOf(events));
    expect(reread.recorded_at).not.toBe(VALID_FIXTURE.recorded_at);
    expect(existsSync(path)).toBe(true);
  });
});

describe('v1.1.10 — VcrLoader.shouldRequireFixture', () => {
  it("'replay' → true", () => {
    expect(shouldRequireFixture('replay')).toBe(true);
  });
  it("'record' → false", () => {
    expect(shouldRequireFixture('record')).toBe(false);
  });
  it("'live' → false", () => {
    expect(shouldRequireFixture('live')).toBe(false);
  });
});

// v1.9.0 (A4) — VCR production gate. spec: docs/v1.x-completion-audit.md (HIGH).
// 사용자 결정 2026-05-08: "DREAMPIA_VCR_MODE production: startup fail".
describe('v1.9.0 — VcrLoader.vcrProductionGate', () => {
  it('unpackaged + vcrMode unset → ok', () => {
    const r = vcrProductionGate({ isPackaged: false, vcrMode: undefined });
    expect(r.ok).toBe(true);
  });
  it('unpackaged + vcrMode replay (e2e/dev) → ok', () => {
    const r = vcrProductionGate({ isPackaged: false, vcrMode: 'replay' });
    expect(r.ok).toBe(true);
  });
  it('packaged + vcrMode unset (production normal) → ok', () => {
    const r = vcrProductionGate({ isPackaged: true, vcrMode: undefined });
    expect(r.ok).toBe(true);
  });
  it('packaged + vcrMode replay → fail with message', () => {
    const r = vcrProductionGate({ isPackaged: true, vcrMode: 'replay' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/VCR mode detected in production build/);
      expect(r.message).toMatch(/DREAMPIA_VCR_MODE=replay/);
      expect(r.message).toMatch(/Test fixtures must not leak into production/);
    }
  });
  it('packaged + vcrMode record → fail (test fixture write 가능성도 차단)', () => {
    const r = vcrProductionGate({ isPackaged: true, vcrMode: 'record' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/DREAMPIA_VCR_MODE=record/);
  });
  it('packaged + vcrMode live → fail (any value blocked)', () => {
    const r = vcrProductionGate({ isPackaged: true, vcrMode: 'live' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/DREAMPIA_VCR_MODE=live/);
  });
  it('packaged + vcrMode 빈 문자열 → fail (any non-undefined string blocked)', () => {
    const r = vcrProductionGate({ isPackaged: true, vcrMode: '' });
    expect(r.ok).toBe(false);
  });

  // architect verify 2026-05-09 추가: DREAMPIA_CLI_COMMAND 도 같은 보안 경계.
  it('packaged + cliCommand set → fail (fake-CLI override 차단)', () => {
    const r = vcrProductionGate({
      isPackaged: true,
      vcrMode: undefined,
      cliCommand: '/path/to/fake-cli',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/Fake CLI override detected/);
      expect(r.message).toMatch(/DREAMPIA_CLI_COMMAND=/);
    }
  });
  it('packaged + 두 env 모두 set → vcrMode 우선 메시지', () => {
    const r = vcrProductionGate({
      isPackaged: true,
      vcrMode: 'replay',
      cliCommand: '/path/to/fake-cli',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/VCR mode detected/);
      expect(r.message).not.toMatch(/Fake CLI override/);
    }
  });
  it('unpackaged + cliCommand set (e2e fixture-vcr) → ok', () => {
    const r = vcrProductionGate({
      isPackaged: false,
      vcrMode: undefined,
      cliCommand: '/path/to/fake-cli',
    });
    expect(r.ok).toBe(true);
  });
});
