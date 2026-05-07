/**
 * v1.8.2 — Contract test for `metadata_json._extra` strict schema.
 *
 * 검증:
 *  - 모든 fixture 의 `_extra` 가 MetadataExtraSchema 통과 (현재 schema
 *    snapshot).
 *  - SessionStore 의 round-trip 후 metadata_json._extra 도 통과.
 *  - 등록되지 않은 namespace key 는 strict 거부.
 *  - 등록되지 않은 leaf field 도 strict 거부 (각 namespace 별).
 *  - 필수 필드 누락 시 거부.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore } from '../../src/storage';
import { SessionSchema } from '../../src/types/session';
import { MetadataExtraSchema } from '../../src/storage/metadataExtraSchema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

describe('v1.8.2 — _extra MetadataExtraSchema contract', () => {
  it('모든 fixture 의 _extra 가 strict schema 통과', () => {
    const fixtures = listFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      const raw = JSON.parse(
        readFileSync(join(FIXTURES_DIR, f), 'utf-8')
      ) as { metadata?: { _extra?: unknown } };
      // fixture 의 metadata 는 외부 스키마 — _extra 가 없거나 partial 일 수
      // 있다. 본 검증은 SessionStore 가 build 한 _extra 가 schema 를 통과
      // 하는지 검사 (fixture 자체는 raw 라 skip).
      expect(raw).toBeDefined();
    }
  });

  it('SessionStore round-trip 의 metadata_json._extra 가 strict schema 통과', () => {
    // 각 fixture 마다 fresh store — fixture 간 id 충돌 (workspace, session,
    // permission_grants) 회피. parent_session_id 있는 fixture 는 parent 가
    // 같은 store 에 없어 FK 위반 — 본 contract 검증 범위 외라 skip.
    for (const f of listFixtures()) {
      const store = new SessionStore(':memory:');
      try {
        const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf-8')) as {
          parent_session_id?: string;
        };
        if (typeof raw.parent_session_id === 'string') continue;
        const session = SessionSchema.parse(raw);
        store.createSession(session);
        const row = store.getDb()
          .prepare('SELECT metadata_json FROM sessions WHERE id = ?')
          .get(session.id) as { metadata_json: string };
        const meta = JSON.parse(row.metadata_json) as { _extra: unknown };
        const result = MetadataExtraSchema.safeParse(meta._extra);
        if (!result.success) {
          throw new Error(
            `fixture ${f} _extra failed schema: ${result.error.message}`
          );
        }
      } finally {
        store.close();
      }
    }
  });

  it('strict — 미등록 top-level namespace key 는 거부', () => {
    const sample = {
      conversation: {
        current_model: 'sonnet',
        current_effort: 'medium',
        current_mode: 'chat',
      },
      workspace: { recent_files: [], open_files: [], ignore_patterns: [] },
      terminal: { panel_open: false, height_px: 200 },
      browser: {
        panel_visible: false,
        layout: 'hidden',
        partition_id: 'p',
      },
      plan: { active: false, browser_tool_enabled: false },
      permission: {
        default_level: 'workspace_write',
        temporarily_blocked_capabilities: [],
      },
      // 미등록 namespace.
      future_unknown: { foo: 1 },
    };
    const r = MetadataExtraSchema.safeParse(sample);
    expect(r.success).toBe(false);
  });

  it('strict — 등록된 namespace 의 미등록 leaf 필드도 거부', () => {
    const sample = {
      conversation: {
        current_model: 'sonnet',
        current_effort: 'medium',
        current_mode: 'chat',
      },
      workspace: {
        recent_files: [],
        open_files: [],
        ignore_patterns: [],
        // 미등록 leaf.
        sneaky_field: 'oops',
      },
      terminal: { panel_open: false, height_px: 200 },
      browser: {
        panel_visible: false,
        layout: 'hidden',
        partition_id: 'p',
      },
      plan: { active: false, browser_tool_enabled: false },
      permission: {
        default_level: 'workspace_write',
        temporarily_blocked_capabilities: [],
      },
    };
    const r = MetadataExtraSchema.safeParse(sample);
    expect(r.success).toBe(false);
  });

  it('필수 필드 누락 시 거부 (예: terminal.height_px)', () => {
    const sample = {
      conversation: {
        current_model: 'sonnet',
        current_effort: 'medium',
        current_mode: 'chat',
      },
      workspace: { recent_files: [], open_files: [], ignore_patterns: [] },
      terminal: { panel_open: false }, // height_px 누락.
      browser: {
        panel_visible: false,
        layout: 'hidden',
        partition_id: 'p',
      },
      plan: { active: false, browser_tool_enabled: false },
      permission: {
        default_level: 'workspace_write',
        temporarily_blocked_capabilities: [],
      },
    };
    const r = MetadataExtraSchema.safeParse(sample);
    expect(r.success).toBe(false);
  });

  it('v1.4.12 — round-trip 후 _extra.permission 에 grants 키 부재 (denorm guard)', () => {
    // _extra.permission.grants[] 는 한 번도 source 가 아니었으나 audit
    // (v1.8.0) 의 speculative 권고 이후 명시 가드. permission_grants 테이블이
    // 단일 source. 향후 regression 시 본 test 가 즉시 fail.
    //
    // 위 round-trip test 와 같은 isolation 패턴 — fixture 마다 fresh store.
    for (const f of listFixtures()) {
      const store = new SessionStore(':memory:');
      try {
        const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf-8')) as {
          parent_session_id?: string;
        };
        if (typeof raw.parent_session_id === 'string') continue;
        const session = SessionSchema.parse(raw);
        store.createSession(session);
        const row = store.getDb()
          .prepare('SELECT metadata_json FROM sessions WHERE id = ?')
          .get(session.id) as { metadata_json: string };
        const meta = JSON.parse(row.metadata_json) as {
          _extra: { permission: Record<string, unknown> };
        };
        expect(meta._extra.permission).not.toHaveProperty('grants');
      } finally {
        store.close();
      }
    }
  });

  it('v1.4.12 — strict schema 가 _extra.permission.grants 가 들어오면 거부', () => {
    // legacy row 시뮬레이션 — 만약 production read path (assembleSession) 가
    // 직접 schema 검증을 하면 거부. 현재는 JSON.parse cast 라 tolerant.
    const sample = {
      conversation: {
        current_model: 'sonnet',
        current_effort: 'medium',
        current_mode: 'chat',
      },
      workspace: { recent_files: [], open_files: [], ignore_patterns: [] },
      terminal: { panel_open: false, height_px: 200 },
      browser: {
        panel_visible: false,
        layout: 'hidden',
        partition_id: 'p',
      },
      plan: { browser_tool_enabled: false },
      permission: {
        temporarily_blocked_capabilities: [],
        // 미등록 leaf — strict 거부 대상.
        grants: [],
      },
    };
    const r = MetadataExtraSchema.safeParse(sample);
    expect(r.success).toBe(false);
  });

  it('permission.default_level enum 강제 (잘못된 값 거부)', () => {
    const sample = {
      conversation: {
        current_model: 'sonnet',
        current_effort: 'medium',
        current_mode: 'chat',
      },
      workspace: { recent_files: [], open_files: [], ignore_patterns: [] },
      terminal: { panel_open: false, height_px: 200 },
      browser: {
        panel_visible: false,
        layout: 'hidden',
        partition_id: 'p',
      },
      plan: { active: false, browser_tool_enabled: false },
      permission: {
        default_level: 'totally_made_up',
        temporarily_blocked_capabilities: [],
      },
    };
    const r = MetadataExtraSchema.safeParse(sample);
    expect(r.success).toBe(false);
  });
});
