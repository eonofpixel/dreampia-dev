/**
 * DiagnoseSettings (v0.14.0 A ABI Hardening) — Settings 모달 [진단] 탭.
 *
 * 검증:
 *  - 정상 상태: 환경 + DB 섹션 모두 노출
 *  - 새로고침 버튼: diagnose IPC 재호출
 *  - DB 로드 실패: db_loaded=false 분기 → 안내 메시지 + 빨간 아이콘
 *  - integrity 실패: integrity_message 표시
 *  - IPC 자체 실패: error 블록 + hint 표시
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiagnoseSettings } from '../../src/renderer/components/settings/DiagnoseSettings';
import { __mockStore } from '../setup';

describe('DiagnoseSettings (v0.14.0 A ABI Hardening)', () => {
  it('renders environment + database sections on healthy state', async () => {
    render(<DiagnoseSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-diagnose-data')).toBeInTheDocument();
    });
    // 환경 섹션 핵심 필드.
    expect(screen.getByTestId('settings-diagnose-platform')).toBeInTheDocument();
    expect(screen.getByTestId('settings-diagnose-node_version')).toBeInTheDocument();
    expect(screen.getByTestId('settings-diagnose-electron_version')).toBeInTheDocument();
    // DB 섹션 핵심 필드.
    expect(screen.getByTestId('settings-diagnose-db_loaded')).toBeInTheDocument();
    expect(screen.getByTestId('settings-diagnose-schema_version')).toBeInTheDocument();
    expect(screen.getByTestId('settings-diagnose-integrity')).toBeInTheDocument();
    expect(screen.getByTestId('settings-diagnose-wal_mode')).toBeInTheDocument();
  });

  it('refresh button re-triggers diagnose IPC', async () => {
    const user = userEvent.setup();
    render(<DiagnoseSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-diagnose-data')).toBeInTheDocument();
    });
    const diagnoseFn = window.dreampia?.app.diagnose as unknown as {
      mock?: { calls: unknown[][] };
    };
    const initialCalls = diagnoseFn.mock?.calls.length ?? 0;
    const refresh = screen.getByTestId('settings-diagnose-refresh');
    await user.click(refresh);
    await waitFor(() => {
      const callsAfter = diagnoseFn.mock?.calls.length ?? 0;
      expect(callsAfter).toBeGreaterThan(initialCalls);
    });
  });

  it('shows db_load_failed message when db_loaded=false', async () => {
    __mockStore.diagnose.db_loaded = false;
    __mockStore.diagnose.db_ok = undefined;
    __mockStore.diagnose.schema_version = undefined;
    __mockStore.diagnose.table_count = undefined;
    __mockStore.diagnose.integrity_ok = undefined;
    __mockStore.diagnose.wal_mode = undefined;
    render(<DiagnoseSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-diagnose-db-load-failed')).toBeInTheDocument();
    });
  });

  it('shows integrity_message when integrity check fails', async () => {
    __mockStore.diagnose.integrity_ok = false;
    __mockStore.diagnose.integrity_message = 'page 5 free; expected 4';
    render(<DiagnoseSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-diagnose-integrity-message')).toBeInTheDocument();
    });
    expect(screen.getByTestId('settings-diagnose-integrity-message')).toHaveTextContent(
      'page 5 free'
    );
  });

  it('shows error block when IPC itself fails', async () => {
    __mockStore.diagnoseError = 'IPC unavailable';
    render(<DiagnoseSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-diagnose-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('settings-diagnose-error')).toHaveTextContent('IPC unavailable');
  });

  it('panel has stable test id even after error', async () => {
    __mockStore.diagnoseError = 'something';
    render(<DiagnoseSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-diagnose-panel')).toBeInTheDocument();
    });
  });
});
