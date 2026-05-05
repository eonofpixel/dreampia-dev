/**
 * Tier 2 integration — fake-claude-cli.js replay smoke (v1.1.5 / Codex Q10).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9/Q10.
 *
 * 검증:
 *   1. process.execPath + fake-cli.js + argv 로 CliProvider 가 정상 spawn.
 *   2. fake CLI 가 fixture 의 stdout_chunks 를 chunk 단위 emit.
 *   3. translator (translateClaudeJsonl) 가 chunk 를 StreamEvent 로 변환.
 *   4. argv-last (마지막 positional) 가 prompt 와 정확히 일치.
 *   5. exit code 정상 종료 → message_complete + accumulated text.
 *   6. preArgs option 이 binary 앞에 prepend 되는 것 검증.
 *
 * Tier 2 — actual subprocess spawn (Tier 1 vi.mock 와 다름). PR CI 에서 실행.
 */

import { describe, it, expect } from 'vitest';
import { execPath } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CliProvider } from '../../../src/providers/cli/CliProvider';
import { translateClaudeJsonl } from '../../../src/providers/cli/translateClaudeJsonl';
import type { StreamEvent } from '../../../src/providers/types';
import type { Turn } from '../../../src/types';
import { newTurnId, nowIso } from '../../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = resolve(__dirname, '..', '..', 'fixtures', 'fake-claude-cli.cjs');
const FIXTURE_TEXT_HAPPY = resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'cli-vcr',
  'claude',
  'text-happy.json'
);

function makeUserTurn(text: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

function turnToText(turn: Turn): string {
  return turn.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('');
}

async function collectStream(
  provider: CliProvider,
  input: { turns: Turn[]; model: string }
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.stream(input)) {
    events.push(ev);
  }
  return events;
}

describe('v1.1.5 — fake CLI replay (Tier 2 integration)', () => {
  it(
    'fake CLI 가 fixture 의 stdout chunks 를 emit + translator 가 StreamEvent 변환',
    async () => {
      const provider = new CliProvider({
        binaryPath: execPath, // node 실행 파일.
        provider: 'claude',
        translate: translateClaudeJsonl,
        preArgs: [FAKE_CLI],
      });

      // fixture 의 prompt_last 와 일치 ('안녕').
      const env = { ...process.env, DREAMPIA_VCR_FIXTURE: FIXTURE_TEXT_HAPPY };
      const originalEnv = process.env.DREAMPIA_VCR_FIXTURE;
      process.env.DREAMPIA_VCR_FIXTURE = env.DREAMPIA_VCR_FIXTURE;
      try {
        const events = await collectStream(provider, {
          turns: [makeUserTurn('안녕')],
          model: 'claude-sonnet-4-6',
        });

        // message_start + 2개 text_delta + usage (assistant + result) +
        // message_complete (CliProvider 가 합성).
        const types = events.map((e) => e.type);
        expect(types).toContain('message_start');
        expect(types).toContain('text_delta');
        expect(types).toContain('message_complete');

        // 누적된 text 가 fixture 의 text 와 일치.
        const completes = events.filter((e) => e.type === 'message_complete');
        expect(completes.length).toBe(1);
        const c = completes[0];
        if (c?.type === 'message_complete') {
          const text = turnToText(c.turn);
          expect(text).toContain('안녕하세요!');
          expect(text).toContain('무엇을 도와드릴까요?');
        }

        // 에러 event 없음 (happy path).
        const errors = events.filter((e) => e.type === 'error');
        expect(errors.length).toBe(0);
      } finally {
        if (originalEnv === undefined) delete process.env.DREAMPIA_VCR_FIXTURE;
        else process.env.DREAMPIA_VCR_FIXTURE = originalEnv;
      }
    },
    20_000
  );

  it(
    'argv-last mismatch 시 fake CLI 가 exit 5 — translator 가 error event emit',
    async () => {
      const provider = new CliProvider({
        binaryPath: execPath,
        provider: 'claude',
        translate: translateClaudeJsonl,
        preArgs: [FAKE_CLI],
      });

      const originalEnv = process.env.DREAMPIA_VCR_FIXTURE;
      process.env.DREAMPIA_VCR_FIXTURE = FIXTURE_TEXT_HAPPY;
      try {
        // fixture 의 prompt_last 가 '안녕' 인데 다른 prompt 보냄 → mismatch.
        const events = await collectStream(provider, {
          turns: [makeUserTurn('different prompt')],
          model: 'claude-sonnet-4-6',
        });

        // fake CLI 가 stderr 에 mismatch 메시지 + exit 5 → CliProvider 가 error
        // event emit (exit code !== 0 이거나 stderr 에 'error' 포함).
        const errors = events.filter((e) => e.type === 'error');
        expect(errors.length).toBeGreaterThan(0);
      } finally {
        if (originalEnv === undefined) delete process.env.DREAMPIA_VCR_FIXTURE;
        else process.env.DREAMPIA_VCR_FIXTURE = originalEnv;
      }
    },
    20_000
  );
});
