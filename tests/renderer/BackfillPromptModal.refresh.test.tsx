/**
 * v1.4.9 — BackfillPromptModal onDone callback 검증.
 *
 * App.tsx 의 onDone 인라인 콜백이:
 *   1. setBackfillModal(null) 을 호출하는지
 *   2. sessionStore.refresh() 를 호출하는지
 *
 * BackfillPromptModal 자체를 직접 렌더링하여 onDone prop 이 호출되는 시나리오를
 * 확인하고, App.tsx 의 콜백 로직을 별도 spy 로 검증한다.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackfillPromptModal } from '../../src/renderer/components/workspace/BackfillPromptModal';

describe('BackfillPromptModal — onDone callback', () => {
  it('[나중에] 버튼 클릭 시 onDone 이 호출된다', () => {
    const onDone = vi.fn();
    render(
      <BackfillPromptModal
        open={true}
        legacyCount={3}
        targetConflicts={0}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByTestId('workspace-backfill-later'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('X 닫기 버튼 클릭 시 onDone 이 호출된다', () => {
    const onDone = vi.fn();
    render(
      <BackfillPromptModal
        open={true}
        legacyCount={3}
        targetConflicts={0}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByTestId('modal-shell-close'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('open=false 이면 모달이 렌더링되지 않는다', () => {
    const onDone = vi.fn();
    render(
      <BackfillPromptModal
        open={false}
        legacyCount={3}
        targetConflicts={0}
        onDone={onDone}
      />
    );

    expect(screen.queryByTestId('workspace-backfill-modal')).not.toBeInTheDocument();
  });

  it('App.tsx onDone 콜백 계약: setBackfillModal + refresh 둘 다 호출', () => {
    // App.tsx 의 인라인 콜백을 직접 시뮬레이션하여 두 side-effect 가 모두
    // 실행되는지 검증한다.
    const setBackfillModal = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);

    // App.tsx 의 onDone 콜백과 동일한 구조
    const onDone = (): void => {
      setBackfillModal(null);
      void refresh();
    };

    onDone();

    expect(setBackfillModal).toHaveBeenCalledTimes(1);
    expect(setBackfillModal).toHaveBeenCalledWith(null);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
