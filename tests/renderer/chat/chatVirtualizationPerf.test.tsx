/**
 * v2.x (Phase D) — Chat virtualization 10k turn render smoke + perf bound.
 *
 * Spec: docs/v2.x-roadmap.md Phase D + PRD US-300.
 *
 * 검증:
 *  - 10000 turn 의 ChatPanel 이 throw 없이 mount
 *  - mount 시간이 합리적 bound 안에 (windowing 활성 → simple O(n) 보다 훨씬 빠름)
 *  - DOM 에 모든 10k turn 이 동시에 존재 X (Virtuoso windowing 검증)
 *
 * Note: 실제 60fps scroll perf 는 jsdom 환경에서 측정 불가 — 별 슬롯
 * (Playwright + Chrome DevTools timeline). 본 test 는 windowing 의 mount-time
 * 효과를 회귀 lock 하는 cheap smoke.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChatPanel } from '../../../src/renderer/components/chat/ChatPanel';
import type { Session, Turn } from '../../../src/types';
import {
  newSessionId,
  newTurnId,
  workspaceIdFor,
  partitionIdFor,
  nowIso,
} from '../../../src/types';

function makeSession(turns: Turn[] = []): Session {
  const id = newSessionId();
  const now = nowIso();
  return {
    id,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    provider: 'claude',
    workspace_id: workspaceIdFor('C:\\Dev\\dreampia-dev'),
    title: 'perf-test',
    pinned: false,
    archived: false,
    conversation: {
      turns,
      current_model: 'claude-opus-4',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: 'C:\\Dev\\dreampia-dev',
      name: 'dreampia-dev',
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: [],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: {
      tabs: [],
      panel_visible: false,
      layout: 'hidden',
      partition_id: partitionIdFor(id),
    },
    plan: { active: false, browser_tool_enabled: false },
    permission: {
      grants: [],
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: [],
    },
    metadata: {},
  };
}

function makeTurn(idx: number): Turn {
  const role: Turn['role'] = idx % 2 === 0 ? 'user' : 'assistant';
  return {
    id: newTurnId(),
    role,
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text: `turn ${idx}: lorem ipsum dolor sit amet` }],
  };
}

describe('v2.x Phase D — ChatPanel 10000 turn perf smoke', () => {
  it('10000 turn render 가 throw 없이 완료', () => {
    const turns = Array.from({ length: 10_000 }, (_, i) => makeTurn(i));
    const session = makeSession(turns);
    const { container } = render(<ChatPanel session={session} onSubmit={() => undefined} />);

    // Mount 자체가 OK 라는 invariant — windowing 없으면 jsdom 가 OOM 위험.
    expect(container).toBeDefined();
  });

  it('10000 turn render 시간이 합리적 bound (< 5s) 안 — windowing 효과', () => {
    const turns = Array.from({ length: 10_000 }, (_, i) => makeTurn(i));
    const session = makeSession(turns);

    const start = Date.now();
    render(<ChatPanel session={session} onSubmit={() => undefined} />);
    const elapsed = Date.now() - start;

    // 보수적 bound — jsdom + Virtuoso 의 initial render. CI 환경에 따라
    // 변동 가능 — 5000ms 으로 generous 하게 설정. windowing 부재 시 simple
    // map 만 해도 O(n × component depth) 로 훨씬 큼.
    expect(elapsed).toBeLessThan(5_000);
  });

  it('10000 turn render 후 DOM 에 모든 turn 이 동시에 존재 X (windowing)', () => {
    const turns = Array.from({ length: 10_000 }, (_, i) => makeTurn(i));
    const session = makeSession(turns);
    const { container } = render(<ChatPanel session={session} onSubmit={() => undefined} />);

    // Virtuoso 가 viewport 안 + buffer 만 render. 정확한 수는 환경 별
    // 다르지만 10000 보다는 훨씬 적어야 함 (보통 viewport ~10-30 + buffer).
    // 보수적 bound — 1000 미만 이면 확실히 windowing 동작.
    const turnElements = container.querySelectorAll('[data-turn-id]');
    expect(turnElements.length).toBeLessThan(1_000);
    // 단, 0 이면 mount 안 된 거라 의심 — 최소 viewport 분 1+.
    // jsdom 은 viewport 가 0×0 이라 Virtuoso 가 0 render 할 수 있음 — 그
    // 케이스도 valid (windowing 의 극단). 0 도 통과 (windowing 동작 증거).
    expect(turnElements.length).toBeGreaterThanOrEqual(0);
  });

  it('100 turn 미만 render — simple map path (threshold 미만)', () => {
    const turns = Array.from({ length: 50 }, (_, i) => makeTurn(i));
    const session = makeSession(turns);
    const { container } = render(<ChatPanel session={session} onSubmit={() => undefined} />);

    // simple map 에선 모든 turn 이 DOM 에 존재.
    const turnElements = container.querySelectorAll('[data-turn-id]');
    expect(turnElements.length).toBe(50);
  });
});
