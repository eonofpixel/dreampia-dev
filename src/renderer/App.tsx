/**
 * App.tsx — Main React component
 *
 * Day 1: 얇은 scaffold + Hello world.
 * Day 2-3: SS-1 TypeScript types 적용 시작 — Session 정의 사용.
 */

import { useMemo } from 'react';
import {
  SessionSchema,
  newSessionId,
  workspaceIdFor,
  nowIso,
  type Session,
  EFFORT_LABELS_KO,
  PERMISSION_LEVEL_LABELS_KO,
} from '@/types';

function createDemoSession(): Session {
  const id = newSessionId();
  const now = nowIso();
  const workspaceId = workspaceIdFor('C:\\Dev\\demo');

  return SessionSchema.parse({
    id,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    provider: 'codex',
    workspace_id: workspaceId,
    title: '데모 세션',
    pinned: false,
    archived: false,
    conversation: {
      turns: [],
      current_model: 'gpt-5.5',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: 'C:\\Dev\\demo',
      name: 'demo',
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: ['node_modules/**', '.git/**'],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: {
      tabs: [],
      panel_visible: false,
      layout: 'hidden',
      partition_id: `persist:dreampia-browser-app-${id}`,
    },
    plan: { active: false, browser_tool_enabled: false },
    permission: {
      grants: [],
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: [],
    },
    metadata: {},
  });
}

export function App(): React.JSX.Element {
  const session = useMemo(() => createDemoSession(), []);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-bg-primary text-text-primary">
      <div className="text-6xl">👋</div>

      <h1 className="mt-4 text-3xl font-bold">Dreampia-Dev</h1>

      <p className="mt-2 text-text-secondary">
        Claude Code + Codex 통합 GUI · 오픈소스 · 한국어 우선
      </p>

      <p className="mt-6 text-sm text-text-tertiary">
        Day 2-3: SS-1 TypeScript types 작동 중 ✓
      </p>

      <div className="mt-8 max-w-md rounded-md border border-border-primary bg-bg-secondary p-4 text-left text-sm">
        <h2 className="mb-2 font-semibold">검증된 데모 Session</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-text-secondary">
          <dt>id</dt>
          <dd className="truncate">{session.id}</dd>
          <dt>provider</dt>
          <dd>{session.provider}</dd>
          <dt>workspace</dt>
          <dd className="truncate">{session.workspace_id}</dd>
          <dt>모델</dt>
          <dd>{session.conversation.current_model}</dd>
          <dt>효력</dt>
          <dd>{EFFORT_LABELS_KO[session.conversation.current_effort]}</dd>
          <dt>권한</dt>
          <dd>{PERMISSION_LEVEL_LABELS_KO[session.permission.default_level]}</dd>
        </dl>
      </div>

      <div className="mt-8 flex flex-col gap-2 text-sm text-text-tertiary">
        <span>다음:</span>
        <ul className="list-inside list-disc">
          <li>Day 4-5: Contract tests + fixtures (완료)</li>
          <li>Day 6: 3-패널 layout</li>
          <li>Day 7: spec ↔ test ↔ impl 추적표</li>
        </ul>
      </div>
    </div>
  );
}
