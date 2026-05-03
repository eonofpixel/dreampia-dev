/**
 * SessionStore — backward compat for v0.6 ~ v0.12 plain-text mention turns.
 *
 * v0.13.0 (J) 가 ContentBlock schema 에 file_reference / session_reference
 * variant 를 ADDITIVE 하게 추가했지만, 이미 SQLite 에 저장된 plain-text 멘션
 * turn 들이 그대로 load 돼야 한다.
 *
 * 검증:
 *   1. v0.6 형식 ("--- 컨텍스트 ---" prefixed text block) round-trip
 *   2. v0.13 typed file_reference block round-trip
 *   3. v0.13 typed session_reference block round-trip
 *   4. mixed turn (text + file_reference + session_reference) round-trip
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SessionStore } from '@/storage';
import { SessionSchema, type Session } from '@/types/session';
import type { Turn } from '@/types/conversation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadBaseSession(): Session {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8')
  );
  return SessionSchema.parse(raw);
}

describe('SessionStore — typed block backward compat', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('round-trips a v0.6 plain-text "--- 컨텍스트 ---" mention turn unchanged', () => {
    const session = loadBaseSession();
    store.createSession(session);

    // v0.6 형식 — 멘션은 단일 text block 안에 prepend 됨.
    const legacyTurn: Turn = {
      id: '019d0001-0000-7000-8000-0000000000c1' as Turn['id'],
      role: 'user',
      timestamp: '2026-05-02T01:01:00.000Z',
      status: 'completed',
      content: [
        {
          type: 'text',
          text:
            'Look at @README.md\n\n--- 컨텍스트 ---\n[파일] @README.md (line 1-3):\n```\n# Hello\nworld\n```',
        },
      ],
    };

    store.appendTurn(session.id, legacyTurn);
    const reloaded = store.getSession(session.id);
    expect(reloaded).not.toBeNull();

    const last =
      reloaded!.conversation.turns[reloaded!.conversation.turns.length - 1];
    expect(last).toEqual(legacyTurn);
    // text block 안에 옛 marker 가 살아있어야 함.
    expect(last?.content[0]?.type).toBe('text');
    if (last?.content[0]?.type === 'text') {
      expect(last.content[0].text).toContain('--- 컨텍스트 ---');
    }
  });

  it('round-trips a v0.13 typed file_reference turn', () => {
    const session = loadBaseSession();
    store.createSession(session);

    const newTurn: Turn = {
      id: '019d0001-0000-7000-8000-0000000000c2' as Turn['id'],
      role: 'user',
      timestamp: '2026-05-02T01:01:00.000Z',
      status: 'completed',
      content: [
        { type: 'text', text: 'Look at:' },
        {
          type: 'file_reference',
          path: 'README.md',
          snippet: '# Hello\nworld',
          line_count: 2,
          truncated: false,
        },
      ],
    };

    store.appendTurn(session.id, newTurn);
    const reloaded = store.getSession(session.id);
    const last =
      reloaded!.conversation.turns[reloaded!.conversation.turns.length - 1];
    expect(last).toEqual(newTurn);
    expect(last?.content[1]?.type).toBe('file_reference');
  });

  it('round-trips a v0.13 typed session_reference turn', () => {
    const session = loadBaseSession();
    store.createSession(session);

    const newTurn: Turn = {
      id: '019d0001-0000-7000-8000-0000000000c3' as Turn['id'],
      role: 'user',
      timestamp: '2026-05-02T01:01:00.000Z',
      status: 'completed',
      content: [
        {
          type: 'session_reference',
          session_id: 'sess-prior',
          title: '이전 대화',
          context_text: '사용자: hi\nAI: hello',
          turn_count: 2,
        },
      ],
    };

    store.appendTurn(session.id, newTurn);
    const reloaded = store.getSession(session.id);
    const last =
      reloaded!.conversation.turns[reloaded!.conversation.turns.length - 1];
    expect(last).toEqual(newTurn);
    expect(last?.content[0]?.type).toBe('session_reference');
  });

  it('round-trips mixed text + file_reference + session_reference turn', () => {
    const session = loadBaseSession();
    store.createSession(session);

    const newTurn: Turn = {
      id: '019d0001-0000-7000-8000-0000000000c4' as Turn['id'],
      role: 'user',
      timestamp: '2026-05-02T01:01:00.000Z',
      status: 'completed',
      content: [
        { type: 'text', text: 'compare these:' },
        {
          type: 'file_reference',
          path: 'a.ts',
          snippet: 'A',
          line_count: 1,
          truncated: false,
          language: 'ts',
        },
        {
          type: 'session_reference',
          session_id: 'prev',
          title: 'Prev',
          context_text: 'q\na',
          turn_count: 1,
        },
      ],
    };

    store.appendTurn(session.id, newTurn);
    const reloaded = store.getSession(session.id);
    const last =
      reloaded!.conversation.turns[reloaded!.conversation.turns.length - 1];
    expect(last).toEqual(newTurn);
    expect(last?.content.map((b) => b.type)).toEqual([
      'text',
      'file_reference',
      'session_reference',
    ]);
  });
});
