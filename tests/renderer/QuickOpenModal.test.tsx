/**
 * QuickOpenModal — Cmd/Ctrl+P 빠른 파일 열기.
 *
 * v2.8.0 (Builder UX) Recents 섹션 동작 + 기존 검색/네비게이션 행동 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuickOpenModal } from '../../src/renderer/components/code/QuickOpenModal';
import { pushRecentFile } from '../../src/renderer/components/code/recentFiles';
import { __mockStore } from '../setup';

describe('QuickOpenModal', () => {
  beforeEach(() => {
    __mockStore.workspaceFiles = [];
    localStorage.clear();
  });

  it('open=false → 아무것도 렌더하지 않음', () => {
    const { container } = render(
      <QuickOpenModal open={false} onClose={vi.fn()} onSelect={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('워크스페이스 미선택 → 안내 표시', () => {
    render(<QuickOpenModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByTestId('quick-open-no-workspace')).toBeInTheDocument();
  });

  it('파일 목록을 로드하고 표시', async () => {
    __mockStore.workspaceFiles = [
      { path: 'a.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
      { path: 'b.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
    ];
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={vi.fn()} onSelect={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('quick-open-row-a.ts')).toBeInTheDocument();
      expect(screen.getByTestId('quick-open-row-b.ts')).toBeInTheDocument();
    });
  });

  it('Enter 키가 highlight 된 행을 선택', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    __mockStore.workspaceFiles = [
      { path: 'a.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
      { path: 'b.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
    ];
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={vi.fn()} onSelect={onSelect} />
    );
    await waitFor(() => screen.getByTestId('quick-open-row-a.ts'));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('b.ts');
  });

  it('Esc 가 onClose 호출', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={onClose} onSelect={vi.fn()} />
    );
    // input 자동 focus 후 Esc
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────
  // v2.8.0 (Builder UX) — Recents 섹션
  // ────────────────────────────────────────────────────────────

  it('Recents: 빈 storage → recents 섹션 헤더 미노출', async () => {
    __mockStore.workspaceFiles = [
      { path: 'a.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
    ];
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={vi.fn()} onSelect={vi.fn()} />
    );
    await waitFor(() => screen.getByTestId('quick-open-row-a.ts'));
    expect(screen.queryByTestId('quick-open-section-recents')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-open-section-all')).not.toBeInTheDocument();
  });

  it('Recents: 최근 파일이 있으면 섹션 헤더 + recents 우선 노출', async () => {
    pushRecentFile('/proj', 'b.ts');
    pushRecentFile('/proj', 'a.ts'); // a.ts 가 head
    __mockStore.workspaceFiles = [
      { path: 'a.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
      { path: 'b.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
      { path: 'c.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
    ];
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={vi.fn()} onSelect={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('quick-open-section-recents')).toBeInTheDocument();
      expect(screen.getByTestId('quick-open-section-all')).toBeInTheDocument();
    });
    // 첫 행 (idx 0) 이 a.ts (recent head)
    const firstRow = screen.getByTestId('quick-open-row-a.ts');
    expect(firstRow.getAttribute('data-row-idx')).toBe('0');
    expect(firstRow.getAttribute('data-row-kind')).toBe('recent');
    // c.ts 는 file 섹션 (recents 에 없음)
    const cRow = screen.getByTestId('quick-open-row-c.ts');
    expect(cRow.getAttribute('data-row-kind')).toBe('file');
  });

  it('Recents: 검색어 입력 시 섹션 헤더 사라지고 검색 결과만', async () => {
    const user = userEvent.setup();
    pushRecentFile('/proj', 'recent.ts');
    __mockStore.workspaceFiles = [
      { path: 'recent.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
      { path: 'other.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
    ];
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={vi.fn()} onSelect={vi.fn()} />
    );
    await waitFor(() => screen.getByTestId('quick-open-section-recents'));
    await user.type(screen.getByTestId('quick-open-input'), 'other');
    await waitFor(() => {
      expect(screen.queryByTestId('quick-open-section-recents')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-open-section-all')).not.toBeInTheDocument();
      expect(screen.getByTestId('quick-open-row-other.ts')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-open-row-recent.ts')).not.toBeInTheDocument();
    });
  });

  it('Recents: 동일 파일이 recents 와 file pool 양쪽에 중복 표시되지 않음', async () => {
    pushRecentFile('/proj', 'shared.ts');
    __mockStore.workspaceFiles = [
      { path: 'shared.ts', size_bytes: 1, mtime: '2026-05-10T00:00:00.000Z' },
    ];
    render(
      <QuickOpenModal open={true} workspaceRoot="/proj" onClose={vi.fn()} onSelect={vi.fn()} />
    );
    await waitFor(() => screen.getByTestId('quick-open-section-recents'));
    // shared.ts 행은 정확히 1개만 (recent kind).
    const rows = screen.getAllByTestId('quick-open-row-shared.ts');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute('data-row-kind')).toBe('recent');
  });
});
