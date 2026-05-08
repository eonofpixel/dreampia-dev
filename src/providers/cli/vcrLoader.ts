/**
 * VCR fixture loader / hasher (v1.1.10 / Codex Q10 권고).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9/Q10.
 *
 * 책임:
 *  - fixture JSON 파일 → `VcrFixture` 객체 (기본 검증).
 *  - StreamEvent[] → 결정성 hash (timestamps / turn_id / cost float 제외).
 *  - fixture.expected_events_hash 와 비교해서 drift 판정.
 *
 * Replay (default): fake CLI 가 fixture 의 chunks 를 emit. 본 모듈의 hash
 *   는 translator regression detection 에 사용.
 * Record: live 실행 캡처 후 fixture 작성 (사람이 PR 검토 후 commit).
 * Live: live 실행 + fixture 와 hash 비교 → drift fail.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { VcrFixture, VcrMode } from './vcr';
import { VCR_FIXTURE_VERSION, getVcrMode } from './vcr';
import type { StreamEvent } from '../types';

export class VcrFixtureMissingError extends Error {
  constructor(public readonly path: string) {
    super(`VCR fixture not found: ${path}`);
    this.name = 'VcrFixtureMissingError';
  }
}

export class VcrFixtureInvalidError extends Error {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super(`VCR fixture invalid (${path}): ${message}`);
    this.name = 'VcrFixtureInvalidError';
  }
}

/**
 * fixture JSON 파일 로드 + 기본 schema 검증.
 *
 * 검증:
 *   - version === '1' (현재 schema 버전).
 *   - fixture_id, provider, recorded_at 필수 string.
 *   - spawn.argv array, spawn.cwd string.
 *   - exit.code number | null.
 *
 * Codex Q10 picking: replay missing fixture → fail (silent fallback X).
 */
export function loadFixture(path: string): VcrFixture {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new VcrFixtureMissingError(abs);
  }
  let parsed: unknown;
  try {
    const raw = readFileSync(abs, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new VcrFixtureInvalidError(
      abs,
      `parse failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new VcrFixtureInvalidError(abs, 'root must be object');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== VCR_FIXTURE_VERSION) {
    throw new VcrFixtureInvalidError(
      abs,
      `unsupported version ${obj.version} (expected ${VCR_FIXTURE_VERSION})`
    );
  }
  for (const key of ['fixture_id', 'provider', 'recorded_at']) {
    if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
      throw new VcrFixtureInvalidError(abs, `missing or invalid '${key}'`);
    }
  }
  if (obj.provider !== 'claude' && obj.provider !== 'codex') {
    throw new VcrFixtureInvalidError(abs, `provider must be claude|codex`);
  }
  const spawn = obj.spawn as Record<string, unknown> | undefined;
  if (!spawn || !Array.isArray(spawn.argv) || typeof spawn.cwd !== 'string') {
    throw new VcrFixtureInvalidError(abs, 'spawn{argv, cwd} required');
  }
  for (const k of ['stdin_chunks', 'stdout_chunks', 'stderr_chunks']) {
    if (!Array.isArray(obj[k])) {
      throw new VcrFixtureInvalidError(abs, `${k} must be array`);
    }
  }
  const exit = obj.exit as Record<string, unknown> | undefined;
  if (
    !exit ||
    !(typeof exit.code === 'number' || exit.code === null) ||
    !(typeof exit.signal === 'string' || exit.signal === null)
  ) {
    throw new VcrFixtureInvalidError(abs, 'exit{code, signal} required');
  }
  return parsed as VcrFixture;
}

/**
 * StreamEvent[] → 결정성 hash.
 *
 * 제외 필드 (drift 와 무관 — runtime 변동):
 *  - turn_id (newTurnId() 가 매 호출 다른 UUID).
 *  - timestamp / recorded_at / created_at.
 *  - usage.total_cost_usd 의 floating-point 마지막 자리수.
 *  - tool_call.id (Claude CLI 가 매번 다른 ID 부여).
 *
 * 본 hash 가 일치하면 translator output sequence 가 stable. drift 발견 시
 * 의도된 변경인지 (translator 코드 변경) regression 인지 PR diff 로 확인.
 */
export function eventsHashOf(events: StreamEvent[]): string {
  const normalized = events.map((ev) => normalizeEvent(ev));
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex');
}

function normalizeEvent(ev: StreamEvent): unknown {
  switch (ev.type) {
    case 'message_start':
      return { type: ev.type, model: ev.model };
    case 'text_delta':
      return { type: ev.type, text: ev.text };
    case 'tool_call_start':
      return {
        type: ev.type,
        tool_id: ev.tool_call.tool_id,
        input: ev.tool_call.input,
      };
    case 'tool_call_input_delta':
      return { type: ev.type, partial_input: ev.partial_input };
    case 'tool_call_complete':
      return {
        type: ev.type,
        tool_id: ev.tool_call.tool_id,
        input: ev.tool_call.input,
      };
    case 'tool_result':
      return {
        type: ev.type,
        status: ev.result.status,
        // output / side_effects 까지는 tool 자체 결정 — translator 외 변수.
      };
    case 'message_complete':
      // turn 의 content 만 비교 — id/timestamp 제외.
      return {
        type: ev.type,
        content: ev.turn.content,
        role: ev.turn.role,
        status: ev.turn.status,
      };
    case 'usage':
      // usage 의 token 수만 비교, total_cost_usd 는 가격 정책 변경에 민감 → 제외.
      return {
        type: ev.type,
        input_tokens: ev.data.input_tokens,
        output_tokens: ev.data.output_tokens,
        provider: ev.data.provider,
      };
    case 'error':
      return { type: ev.type, error: ev.error };
    default:
      return { type: 'unknown' };
  }
}

/**
 * fixture 의 expected_events_hash 와 captured events hash 비교.
 *
 * @returns drift === true 면 fixture 와 다름. fixture 에 hash 미설정 시 drift X
 *   (fixture 가 hash 검증 opt-in).
 */
export function detectDrift(
  fixture: VcrFixture,
  capturedEvents: StreamEvent[]
): { drift: boolean; expected?: string; actual: string } {
  const actual = eventsHashOf(capturedEvents);
  if (
    typeof fixture.expected_events_hash !== 'string' ||
    fixture.expected_events_hash.length === 0
  ) {
    return { drift: false, actual };
  }
  return {
    drift: fixture.expected_events_hash !== actual,
    expected: fixture.expected_events_hash,
    actual,
  };
}

/**
 * Record mode helper — 캡처된 events 의 hash 를 fixture 에 갱신해서 file 에 write.
 *
 * 사용 흐름:
 *   1. DREAMPIA_VCR_MODE=record 로 live 실행 → events 캡처.
 *   2. 본 함수가 fixture.expected_events_hash 갱신.
 *   3. 사람이 PR diff 검토 + commit.
 *
 * Codex Q10 picking: manual record (auto-overwrite on nightly fail X).
 */
export function updateFixtureHash(fixturePath: string, capturedEvents: StreamEvent[]): void {
  const fixture = loadFixture(fixturePath);
  const hash = eventsHashOf(capturedEvents);
  const updated: VcrFixture = {
    ...fixture,
    expected_events_hash: hash,
    recorded_at: new Date().toISOString(),
  };
  writeFileSync(fixturePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
}

/**
 * 현재 mode 에서 fixture 를 require 할지 (replay) skip 할지 (live/record) 결정.
 */
export function shouldRequireFixture(mode: VcrMode = getVcrMode()): boolean {
  return mode === 'replay';
}

/**
 * v1.9.0 (A4) — VCR / fake-CLI production gate.
 *
 * Spec: docs/v1.x-completion-audit.md (HIGH severity), 사용자 결정 2026-05-08:
 *   "DREAMPIA_VCR_MODE production: startup fail (test fixture prod 누출 차단)".
 *
 * 차단 대상 env (architect verify 2026-05-09: 같은 보안 경계 — fake-CLI 우회):
 *   - `DREAMPIA_VCR_MODE`     — VCR replay/record/live 모드
 *   - `DREAMPIA_CLI_COMMAND`  — CliProvider binary override (test fake CLI)
 *
 * Returns `{ ok: false, message }` 면 호출자 (main/index.ts) 가 dialog 표시
 * 후 `app.exit(1)` 로 즉시 종료해야 한다.
 *
 * 통과 조건 (모두 ok):
 *  - unpackaged build (app.isPackaged === false): VCR env set 여부 무관
 *  - packaged build + 두 env 모두 undefined
 *
 * 차단 조건 (fail):
 *  - packaged build + 두 env 중 하나라도 string (값 무관 — typo / silent
 *    coercion 차단; getVcrMode 가 unknown → replay 로 강제하는 거동 보호)
 *
 * Pure function — `app` 모듈 의존성 없이 호출자가 isPackaged 를 주입한다.
 * 단위 테스트가 쉽고 main/index.ts 내 wiring 이 최소화된다.
 */
export function vcrProductionGate(args: {
  isPackaged: boolean;
  vcrMode: string | undefined;
  cliCommand?: string | undefined;
}): { ok: true } | { ok: false; message: string } {
  if (!args.isPackaged) return { ok: true };
  if (args.vcrMode !== undefined) {
    return {
      ok: false,
      message:
        `VCR mode detected in production build (DREAMPIA_VCR_MODE=${args.vcrMode}). ` +
        `Test fixtures must not leak into production. Application will exit.`,
    };
  }
  if (args.cliCommand !== undefined) {
    return {
      ok: false,
      message:
        `Fake CLI override detected in production build ` +
        `(DREAMPIA_CLI_COMMAND=${args.cliCommand}). ` +
        `Test harness must not leak into production. Application will exit.`,
    };
  }
  return { ok: true };
}
