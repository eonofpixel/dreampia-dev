/**
 * v1.7.29 — AutomationModal 의 audit viewer 섹션 회귀.
 *
 * 검증:
 *  - 모달 open 시 audit viewer section 렌더 (header + filter controls + 새로고침).
 *  - api 미주입 시 empty state 표시.
 *  - api.auditLog mock 이 fired/error 이벤트 반환 시 list 렌더 + 각 row testid.
 *  - event type 필터 (fired/error/all) 가 client-side 로 동작.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutomationModal } from '../../src/renderer/components/automation/AutomationModal';

interface MockApi {
  list: () => Promise<{ ok: true; value: unknown[] }>;
  listHandlers?: () => Promise<{ ok: true; value: string[] }>;
  auditLog?: (opts?: {
    rule_name?: string;
    limit?: number;
  }) => Promise<{ ok: true; value: AuditRow[] }>;
}

interface AuditRow {
  id: number;
  timestamp: string;
  session_id: string;
  event: string;
  capability: string;
  target_json: string;
  decision_reason: string;
  outcome?: string;
  error?: string;
}

function setApi(api: MockApi | undefined): void {
  // @ts-expect-error renderer test injection
  window.dreampia = api === undefined ? undefined : { automation: api };
}

describe('AutomationModal audit viewer (v1.7.29)', () => {
  beforeEach(() => {
    setApi(undefined);
  });

  afterEach(() => {
    setApi(undefined);
  });

  it('renders audit viewer section with header + filters + refresh button', async () => {
    setApi({
      list: async () => ({ ok: true, value: [] }),
    });
    render(<AutomationModal open onClose={() => {}} />);
    expect(screen.getByTestId('automation-audit-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('automation-audit-filter-rule')).toBeInTheDocument();
    expect(screen.getByTestId('automation-audit-filter-event')).toBeInTheDocument();
    expect(screen.getByTestId('automation-audit-refresh')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('automation-audit-empty')).toBeInTheDocument();
    });
  });

  it('shows empty state when no api is wired', async () => {
    setApi(undefined);
    render(<AutomationModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('automation-audit-empty')).toBeInTheDocument();
    });
  });

  it('renders rows when api.auditLog returns events', async () => {
    const rows: AuditRow[] = [
      {
        id: 1,
        timestamp: '2026-05-07T10:00:00.000Z',
        session_id: 'automation',
        event: 'automation.fired',
        capability: 'AUTOMATION',
        target_json: JSON.stringify({
          rule_name: 'r-fired',
          handler_name: 'noop-log',
          duration_ms: 12,
          output: 'noop',
        }),
        decision_reason: 'fired',
        outcome: 'ok',
      },
      {
        id: 2,
        timestamp: '2026-05-07T10:01:00.000Z',
        session_id: 'automation',
        event: 'automation.error',
        capability: 'AUTOMATION',
        target_json: JSON.stringify({
          rule_name: 'r-error',
          handler_name: 'shell-exec',
          duration_ms: 5,
        }),
        decision_reason: 'error',
        outcome: 'failed',
        error: 'boom',
      },
    ];
    setApi({
      list: async () => ({ ok: true, value: [] }),
      auditLog: vi.fn(async () => ({ ok: true as const, value: rows })),
    });
    render(<AutomationModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('automation-audit-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('automation-audit-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('automation-audit-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('automation-audit-row-1').textContent ?? '').toContain(
      'r-fired'
    );
    expect(screen.getByTestId('automation-audit-row-2').textContent ?? '').toContain(
      'r-error'
    );
  });

  it('event filter dropdown narrows to fired only (client-side)', async () => {
    const rows: AuditRow[] = [
      {
        id: 10,
        timestamp: '2026-05-07T10:00:00.000Z',
        session_id: 'automation',
        event: 'automation.fired',
        capability: 'AUTOMATION',
        target_json: JSON.stringify({ rule_name: 'a' }),
        decision_reason: 'fired',
      },
      {
        id: 11,
        timestamp: '2026-05-07T10:01:00.000Z',
        session_id: 'automation',
        event: 'automation.error',
        capability: 'AUTOMATION',
        target_json: JSON.stringify({ rule_name: 'b' }),
        decision_reason: 'error',
      },
    ];
    setApi({
      list: async () => ({ ok: true, value: [] }),
      auditLog: async () => ({ ok: true, value: rows }),
    });
    const user = userEvent.setup();
    render(<AutomationModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('automation-audit-row-10')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByTestId('automation-audit-filter-event'), 'fired');
    await waitFor(() => {
      expect(screen.queryByTestId('automation-audit-row-11')).toBeNull();
    });
    expect(screen.getByTestId('automation-audit-row-10')).toBeInTheDocument();
  });

  it('refresh button re-invokes api.auditLog', async () => {
    const auditLog = vi.fn(async () => ({ ok: true as const, value: [] }));
    setApi({
      list: async () => ({ ok: true, value: [] }),
      auditLog,
    });
    const user = userEvent.setup();
    render(<AutomationModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(auditLog).toHaveBeenCalled();
    });
    const initial = auditLog.mock.calls.length;
    await user.click(screen.getByTestId('automation-audit-refresh'));
    await waitFor(() => {
      expect(auditLog.mock.calls.length).toBeGreaterThan(initial);
    });
  });
});
