/**
 * VCR fixture format — Real CLI integration e2e (v1.1.5 / Codex Q10 권고).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9/Q10.
 *
 * 목적:
 *   subprocess e2e 회귀 lock — `argv` / `cwd` / `stdin` / `stdout chunks` /
 *   `stderr` / `exit` / `signal` / `timing` 이 SoT. fake CLI replay 와
 *   provider translator 검증을 분리하면서 argv-last + KR cwd 회귀 고정.
 *
 * 형식 (Codex Q10 picking 그대로):
 *   - 자체 정의 JSON (nock/polly 는 HTTP, plain JSONL 은 회귀 lock 약함).
 *   - manual record only — `npm run vcr:record` 가 갱신, PR diff 동봉.
 *
 * Tier 사용:
 *   - Tier 1 (vi.mock unit): fixture 의 stdout_chunks 만 driving.
 *   - Tier 2 (fake-claude-cli.js integration): fixture 의 argv 검증 + stdout
 *     chunks chunk-by-chunk emit + exit code.
 *   - Tier 3 (nightly real CLI): expected_events_hash drift fail.
 */

/** VCR fixture schema version. Major bump = breaking change. */
export const VCR_FIXTURE_VERSION = '1' as const;

export interface VcrFixture {
  /** Schema version. */
  version: typeof VCR_FIXTURE_VERSION;
  /**
   * Fixture 식별자 — 디렉토리 + 파일명 또는 안정적 slug.
   * drive 시나리오 에서 fixture lookup 키로 사용.
   */
  fixture_id: string;
  /** 'claude' | 'codex' — translator 매칭. */
  provider: 'claude' | 'codex';
  /** 기록 시각 — drift 검증 기준. */
  recorded_at: string;
  /** byte encoding (default 'utf8'). */
  encoding?: 'utf8' | 'utf16le';
  /** spawn 시 검증할 argv 정합성. */
  spawn: VcrSpawn;
  /** stdin 으로 child 가 받는 chunk 들 (보통 비어있음 — prompt 는 argv-last). */
  stdin_chunks: VcrChunk[];
  /** stdout 으로 child 가 emit 할 chunk 들. timing 정합성 회귀 lock. */
  stdout_chunks: VcrChunk[];
  /** stderr 으로 child 가 emit 할 chunk 들. */
  stderr_chunks: VcrChunk[];
  /** child 종료 정보. */
  exit: VcrExit;
  /**
   * translator 가 stdout_chunks 를 처리하면 emit 하는 StreamEvent 들의
   * stable hash. translator 회귀 lock — drift 발견 시 fail.
   * (선택 — 없으면 hash 검증 skip.)
   */
  expected_events_hash?: string;
  /** 보조 timing 정보 — 사람 검토용. */
  timing?: VcrTiming;
  /** argv 검증 assertion. */
  argv_assert?: VcrArgvAssert;
}

export interface VcrSpawn {
  /** child_process.spawn 의 첫 인자 — 실제 spawn 시 override 가능. */
  argv: string[];
  /** child cwd — 한국어 폴더 회귀 검증 시 비-ASCII path 포함. */
  cwd: string;
  /** 검증할 환경변수 키 목록 (값은 비교 X — 로컬마다 다름). */
  env_keys?: string[];
}

export interface VcrChunk {
  /** spawn 시각 기준 ms. record 시 측정. replay 시 해당 시각에 emit. */
  delay_ms: number;
  /** 청크 내용 (utf8 텍스트 — 한 줄 단위 권고 X. real CLI 가 split 하는 그대로). */
  data: string;
}

export interface VcrExit {
  /** exit code (0 = 정상). null = signal 종료. */
  code: number | null;
  /** signal — null 또는 'SIGTERM' / 'SIGKILL' 등. */
  signal: string | null;
}

export interface VcrTiming {
  /** spawn → 첫 stdout chunk 까지 ms. */
  spawn_to_first_chunk_ms: number;
  /** spawn → exit 까지 ms. */
  total_ms: number;
}

export interface VcrArgvAssert {
  /**
   * Codex Q9 권고: argv-last 검증. fixture 의 argv 마지막 원소가 prompt
   * 텍스트와 일치하는지 검증. Provider 가 prompt 를 stdin 이 아닌 argv
   * 마지막에 넣는 계약이 깨지지 않게 lock.
   */
  prompt_last?: string;
  /** model arg position 검증 — argv 인덱스 + 기대값. */
  model_arg?: { index: number; value: string };
}

// ────────────────────────────────────────────────────────────
// Mode env (Codex Q10): replay | record | live.
// ────────────────────────────────────────────────────────────

export type VcrMode = 'replay' | 'record' | 'live';

/**
 * 환경변수 `DREAMPIA_VCR_MODE` 파싱.
 *
 * - undefined / 'replay' → replay (default PR CI).
 * - 'record' → fixture 갱신 (수동 검토 후 commit).
 * - 'live' → fixture 무시, 실제 API 호출 (env key 필요).
 */
export function getVcrMode(): VcrMode {
  const raw = process.env.DREAMPIA_VCR_MODE;
  if (raw === 'record') return 'record';
  if (raw === 'live') return 'live';
  return 'replay';
}

// ────────────────────────────────────────────────────────────
// CLI command override env (Codex Q10).
// ────────────────────────────────────────────────────────────

export interface CliCommandOverride {
  /** child_process.spawn 의 첫 인자. 보통 `process.execPath` (node). */
  command: string;
  /** binary 앞에 prepend 할 args. fake CLI script 경로. */
  pre_args: string[];
}

/**
 * `DREAMPIA_CLI_COMMAND` + `DREAMPIA_CLI_PREARGS` 파싱.
 *
 * Codex Q10 picking: DREAMPIA_TEST=1 (mock 조기 반환) 보다 먼저 적용 — drive
 * harness 가 fake CLI 사용. test-only IPC 회피.
 *
 * - `DREAMPIA_CLI_COMMAND` 설정 시 fake CLI mode 활성.
 * - `DREAMPIA_CLI_PREARGS` 는 공백 split (간단함). 따옴표 quoting 미지원 —
 *   spaces 포함 path 가 필요하면 cli-vcr fixture 의 argv 에 그대로 박는 게
 *   더 deterministic.
 */
export function getCliCommandOverride(): CliCommandOverride | null {
  const cmd = process.env.DREAMPIA_CLI_COMMAND;
  if (cmd === undefined || cmd.length === 0) return null;
  const preArgsRaw = process.env.DREAMPIA_CLI_PREARGS ?? '';
  const preArgs = preArgsRaw.length > 0 ? preArgsRaw.split(/\s+/) : [];
  return { command: cmd, pre_args: preArgs };
}
