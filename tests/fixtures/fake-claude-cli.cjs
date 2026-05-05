#!/usr/bin/env node

/**
 * Fake Claude CLI — VCR fixture replay for Real CLI integration e2e (v1.1.5).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9/Q10.
 *
 * 동작:
 *   1. argv-last (마지막 positional arg) = prompt 텍스트로 간주.
 *   2. fixture 의 argv_assert.prompt_last 가 있으면 일치 검증.
 *   3. fixture.stdout_chunks 를 timing 정보로 emit.
 *   4. fixture.stderr_chunks 도 동일하게 emit.
 *   5. fixture.exit.code 로 종료.
 *
 * 호출 형태 (Codex Q10 권고: process.execPath + script):
 *   node tests/fixtures/fake-claude-cli.js --print --output-format stream-json ...
 *
 * fixture 위치: 환경변수 `DREAMPIA_VCR_FIXTURE` 로 지정.
 *   미지정 시 stderr 에 안내 후 exit 1.
 *
 * stdin 은 EOF 만 기록 (CliProvider 가 즉시 end). 실제 read X.
 */

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_PATH = process.env.DREAMPIA_VCR_FIXTURE;
if (FIXTURE_PATH === undefined || FIXTURE_PATH.length === 0) {
  process.stderr.write(
    '[fake-claude-cli] DREAMPIA_VCR_FIXTURE env not set. Cannot replay.\n'
  );
  process.exit(2);
}

let fixture;
try {
  const raw = fs.readFileSync(path.resolve(FIXTURE_PATH), 'utf8');
  fixture = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`[fake-claude-cli] Cannot load fixture: ${err.message}\n`);
  process.exit(3);
}

if (fixture.version !== '1') {
  process.stderr.write(
    `[fake-claude-cli] Unsupported fixture version: ${fixture.version} (expected '1')\n`
  );
  process.exit(4);
}

// argv-last 검증 (Codex Q9 picking).
const argvLast = process.argv[process.argv.length - 1];
const expectedPrompt = fixture?.argv_assert?.prompt_last;
if (typeof expectedPrompt === 'string' && argvLast !== expectedPrompt) {
  process.stderr.write(
    `[fake-claude-cli] argv-last mismatch.\n  expected: ${JSON.stringify(expectedPrompt)}\n  actual:   ${JSON.stringify(argvLast)}\n`
  );
  process.exit(5);
}

// model arg 검증 (선택).
const modelAssert = fixture?.argv_assert?.model_arg;
if (
  modelAssert !== undefined &&
  typeof modelAssert.index === 'number' &&
  typeof modelAssert.value === 'string'
) {
  // process.argv[0]=node, [1]=script. CLI argv 는 [2] 부터.
  const cliArgv = process.argv.slice(2);
  const actual = cliArgv[modelAssert.index];
  if (actual !== modelAssert.value) {
    process.stderr.write(
      `[fake-claude-cli] model arg mismatch at index ${modelAssert.index}.\n  expected: ${modelAssert.value}\n  actual:   ${actual}\n`
    );
    process.exit(6);
  }
}

// stdin 은 즉시 EOF — 실제 CLI 가 stdin 받지 않는 계약 lock.
// (CliProvider 가 child.stdin?.end() 즉시 호출.)
process.stdin.resume();
process.stdin.on('end', () => {
  // no-op — stdin 데이터는 무시.
});
process.stdin.on('error', () => {
  // ignore — replay 도중 stdin 에러는 무관.
});

// chunk emission with timing.
async function emitChunks(stream, chunks) {
  for (const chunk of chunks) {
    if (chunk.delay_ms > 0) {
      await new Promise((r) => setTimeout(r, chunk.delay_ms));
    }
    stream.write(chunk.data);
  }
}

(async () => {
  const stdoutChunks = Array.isArray(fixture.stdout_chunks) ? fixture.stdout_chunks : [];
  const stderrChunks = Array.isArray(fixture.stderr_chunks) ? fixture.stderr_chunks : [];

  // stdout / stderr 동시 emission.
  await Promise.all([
    emitChunks(process.stdout, stdoutChunks),
    emitChunks(process.stderr, stderrChunks),
  ]);

  const exitCode = fixture?.exit?.code;
  // signal 종료는 fake 가 자기 자신을 죽일 수 없어서 code 만 사용.
  // signal 종료 시나리오는 별도 fixture (CliProvider 가 SIGTERM 보내는 흐름).
  process.exit(typeof exitCode === 'number' ? exitCode : 0);
})().catch((err) => {
  process.stderr.write(`[fake-claude-cli] Replay error: ${err.message}\n`);
  process.exit(7);
});
