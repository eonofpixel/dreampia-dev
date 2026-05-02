/**
 * Roundtrip tests — Turn → Provider format → Turn 정보 보존 검증.
 *
 * Spec: docs/session/cross-ai-sync.md INV-2 (best effort 정보 보존)
 *
 * 알려진 손실:
 *   - turn.id, turn.timestamp 는 provider format 에 안 실어 보냄 (역변환 시 새로 생성)
 *   - turn.status 는 outgoing 에서 의미 없음 (응답에서만 setting)
 *   - turn.effort, edited, reactions 등은 metadata 외 저장이라 lossy
 *
 * 보존 보장 (best effort):
 *   - text content 의 텍스트
 *   - tool_calls 의 (id, tool_id, input)
 *   - role
 *
 * Provider format 을 거치는 가장 신뢰할 만한 사이클:
 *   Turn → toProviderMessages → (가짜 응답 만들기) → fromProviderResponse → new Turn
 *
 * 우리는 outgoing 메시지의 모양을 검사하고, 그것을 가짜 응답으로 다시 주입해
 * 어댑터의 incoming 파서가 동일 정보를 복원하는지 확인.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeAdapter } from '../../src/providers/ClaudeAdapter';
import { CodexAdapter } from '../../src/providers/CodexAdapter';
import type { Session } from '../../src/types';
import type { Turn } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf-8');
  return JSON.parse(raw) as Session;
}

function getAssistantTurns(session: Session): Turn[] {
  return session.conversation.turns.filter((t) => t.role === 'assistant');
}

// ────────────────────────────────────────────────────────────
// Helpers — synthesize a "fake response" from outgoing message
// so we can drive fromProviderResponse on the SAME shape we emitted.
// ────────────────────────────────────────────────────────────

function claudeResponseFromAssistantMessage(
  message: Record<string, unknown>,
  model: string
): Record<string, unknown> {
  // Claude assistant message already has shape { role, content: [text|tool_use] }
  // A response wraps it.
  return {
    content: message.content,
    model,
  };
}

function codexResponseFromAssistantMessage(
  message: Record<string, unknown>,
  model: string
): Record<string, unknown> {
  return {
    choices: [{ message }],
    model,
  };
}

// ────────────────────────────────────────────────────────────
// 02-single-turn — Claude roundtrip
// ────────────────────────────────────────────────────────────

describe('roundtrip — Claude (02-single-turn fixture)', () => {
  it('preserves text content of assistant turn', () => {
    const session = loadFixture('02-single-turn.json');
    const assistants = getAssistantTurns(session);
    expect(assistants).toHaveLength(1);
    const original = assistants[0];
    if (!original) throw new Error('expected assistant turn');

    const adapter = new ClaudeAdapter();

    // Outgoing
    const messages = adapter.toProviderMessages([original]);
    expect(messages).toHaveLength(1);
    const message = messages[0] as Record<string, unknown>;

    // Synthesize response & parse back
    const response = claudeResponseFromAssistantMessage(
      message,
      original.model ?? 'claude-unknown'
    );
    const { new_turn } = adapter.fromProviderResponse(response);

    // Text content preserved
    expect(new_turn.content).toEqual(original.content);
    // Role preserved
    expect(new_turn.role).toBe('assistant');
    // Model preserved
    expect(new_turn.model).toBe(original.model);
    // INFO LOSS: id/timestamp newly generated — not asserting equality
  });
});

// ────────────────────────────────────────────────────────────
// 02-single-turn — Codex roundtrip
// ────────────────────────────────────────────────────────────

describe('roundtrip — Codex (02-single-turn fixture)', () => {
  it('preserves text content + role', () => {
    const session = loadFixture('02-single-turn.json');
    const original = getAssistantTurns(session)[0];
    if (!original) throw new Error('expected assistant turn');

    const adapter = new CodexAdapter();

    const messages = adapter.toProviderMessages([original]);
    expect(messages).toHaveLength(1);
    const message = messages[0] as Record<string, unknown>;

    const response = codexResponseFromAssistantMessage(
      message,
      original.model ?? 'gpt-unknown'
    );
    const { new_turn } = adapter.fromProviderResponse(response);

    expect(new_turn.role).toBe('assistant');
    expect(new_turn.model).toBe(original.model);
    // Codex joins text into a string — content is reconstructed as single text block
    expect(new_turn.content).toEqual([
      { type: 'text', text: '반갑습니다! 무엇을 도와드릴까요?' },
    ]);
  });
});

// ────────────────────────────────────────────────────────────
// 03-tool-call — Claude roundtrip with tool_calls
// ────────────────────────────────────────────────────────────

describe('roundtrip — Claude (03-tool-call fixture)', () => {
  it('preserves text + tool_call (id, tool_id, input)', () => {
    const session = loadFixture('03-tool-call.json');
    const original = getAssistantTurns(session)[0];
    if (!original) throw new Error('expected assistant turn');
    expect(original.tool_calls).toBeDefined();

    const adapter = new ClaudeAdapter();

    const messages = adapter.toProviderMessages([original]);
    const message = messages[0] as Record<string, unknown>;

    const response = claudeResponseFromAssistantMessage(
      message,
      original.model ?? 'claude-unknown'
    );
    const { new_turn, tool_calls } = adapter.fromProviderResponse(response);

    // Text content preserved
    expect(new_turn.content).toEqual(original.content);

    // Tool call info preserved
    expect(tool_calls).toHaveLength(1);
    const origCall = original.tool_calls?.[0];
    expect(origCall).toBeDefined();
    if (!origCall) return;

    expect(tool_calls[0]?.id).toBe(origCall.id); // id preserved as Claude tool_use.id
    expect(tool_calls[0]?.tool_id).toBe(origCall.tool_id); // shell.run survives encode/decode
    expect(tool_calls[0]?.input).toEqual(origCall.input);
  });
});

// ────────────────────────────────────────────────────────────
// 03-tool-call — Codex roundtrip
// ────────────────────────────────────────────────────────────

describe('roundtrip — Codex (03-tool-call fixture)', () => {
  it('preserves tool_call (id, tool_id, input) through function-call format', () => {
    const session = loadFixture('03-tool-call.json');
    const original = getAssistantTurns(session)[0];
    if (!original) throw new Error('expected assistant turn');

    const adapter = new CodexAdapter();

    const messages = adapter.toProviderMessages([original]);
    const message = messages[0] as Record<string, unknown>;

    const response = codexResponseFromAssistantMessage(
      message,
      original.model ?? 'gpt-unknown'
    );
    const { tool_calls } = adapter.fromProviderResponse(response);

    expect(tool_calls).toHaveLength(1);
    const origCall = original.tool_calls?.[0];
    expect(origCall).toBeDefined();
    if (!origCall) return;

    expect(tool_calls[0]?.id).toBe(origCall.id);
    expect(tool_calls[0]?.tool_id).toBe(origCall.tool_id); // shell.run round-trip
    expect(tool_calls[0]?.input).toEqual(origCall.input);
  });
});

// ────────────────────────────────────────────────────────────
// Documented info loss — explicit assertions on what does NOT survive
// ────────────────────────────────────────────────────────────

describe('roundtrip — documented info loss', () => {
  it('turn.id is newly generated on incoming (not preserved)', () => {
    const session = loadFixture('02-single-turn.json');
    const original = getAssistantTurns(session)[0];
    if (!original) throw new Error('expected assistant turn');

    const adapter = new ClaudeAdapter();
    const message = adapter.toProviderMessages([original])[0] as Record<
      string,
      unknown
    >;
    const response = claudeResponseFromAssistantMessage(
      message,
      original.model ?? 'claude-unknown'
    );
    const { new_turn } = adapter.fromProviderResponse(response);

    expect(new_turn.id).not.toBe(original.id);
  });

  it('turn.timestamp is regenerated on incoming', () => {
    const session = loadFixture('02-single-turn.json');
    const original = getAssistantTurns(session)[0];
    if (!original) throw new Error('expected assistant turn');

    const adapter = new ClaudeAdapter();
    const message = adapter.toProviderMessages([original])[0] as Record<
      string,
      unknown
    >;
    const response = claudeResponseFromAssistantMessage(
      message,
      original.model ?? 'claude-unknown'
    );
    const { new_turn } = adapter.fromProviderResponse(response);

    // new timestamp should be ISO8601, but typically not equal to fixture's
    expect(new_turn.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Will almost certainly differ — but we don't assert strict inequality
    // because fixture happened in past and Date.now() now will differ.
    expect(new_turn.timestamp).not.toBe(original.timestamp);
  });

  it('turn.effort is NOT preserved through provider format (drop)', () => {
    const session = loadFixture('03-tool-call.json');
    const original = getAssistantTurns(session)[0];
    if (!original) throw new Error('expected assistant turn');
    expect(original.effort).toBe('high'); // sanity — fixture has effort

    const adapter = new ClaudeAdapter();
    const message = adapter.toProviderMessages([original])[0] as Record<
      string,
      unknown
    >;
    const response = claudeResponseFromAssistantMessage(
      message,
      original.model ?? 'claude-unknown'
    );
    const { new_turn } = adapter.fromProviderResponse(response);

    // effort is in toProviderConfig (separate request param), not in message — lost in roundtrip
    expect(new_turn.effort).toBeUndefined();
  });

  // ★ Documented limitation: tool_id encoding is lossy when names mix dots and underscores.
  // 인코딩 규칙: '.' → '_'. 디코딩: '_' → '.'.
  // 즉, 'my_tool.run' → 'my_tool_run' → 'my.tool.run' (원본 복원 불가)
  // Mitigation: TO-4 의 tool registry 는 tool_id 에 underscore 금지를 강제할 것.
  it('★ tool_id with underscores does NOT round-trip cleanly (known encoding limitation)', () => {
    const adapter = new ClaudeAdapter();
    // Manually construct a turn with an underscore-bearing tool_id
    const originalToolId = 'my_tool.run';

    // Encode via outgoing path (uses .replace(/\./g, '_'))
    const turn: Turn = {
      id: '01900000-0000-7000-8000-aaaaaaaaaaaa' as Turn['id'],
      role: 'assistant',
      timestamp: '2026-05-02T00:00:00.000Z',
      status: 'completed',
      content: [],
      tool_calls: [
        {
          id: '01900000-0000-7000-8000-bbbbbbbbbbbb' as never,
          tool_id: originalToolId,
          input: { x: 1 },
          ts: '2026-05-02T00:00:00.000Z',
        },
      ],
    };

    const messages = adapter.toProviderMessages([turn]) as Array<{
      content: Array<{ type: string; name?: string }>;
    }>;
    const toolUseBlock = messages[0]?.content.find((b) => b.type === 'tool_use');
    expect(toolUseBlock?.name).toBe('my_tool_run'); // dots → underscores

    // Decode via incoming path (uses .replace(/_/g, '.'))
    const response = claudeResponseFromAssistantMessage(
      messages[0] as Record<string, unknown>,
      'claude-test'
    );
    const { tool_calls } = adapter.fromProviderResponse(response);
    const decoded = tool_calls[0]?.tool_id;

    // Decoded value is 'my.tool.run' — NOT the original 'my_tool.run'
    expect(decoded).toBe('my.tool.run');
    expect(decoded).not.toBe(originalToolId); // ★ documents the known loss
  });
});
