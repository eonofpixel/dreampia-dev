/**
 * SlashHelpModal — `/help` 슬래시 명령용 도움말 모달 (F-018, v0.5.0).
 *
 * Spec:
 *   - docs/ux/patterns/F-018-slash-commands.md
 *   - PRD.md (v0.5.0 acceptance: "마우스 없이 주요 화면/액션 접근 가능")
 *
 * UI 결정:
 *  - McpSettings / UsageSettings 와 동일한 fixed overlay 패턴 (z-50)
 *  - 단순 표 — trigger / 라벨 / 설명만 표시. 인자 정보가 있으면 함께 표시.
 *  - 닫기 버튼 + Esc 닫기 (jsx-a11y 가 알아서 dialog onKeyDown 처리)
 *
 * 한국어 우선 — Spec: docs/design/principles.md
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SLASH_COMMANDS } from '../../commands/registry';

export interface SlashHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function SlashHelpModal({
  open,
  onClose,
}: SlashHelpModalProps): React.JSX.Element | null {
  // Esc 로 닫기 — 다른 모달과 일관된 keyboard UX.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="슬래시 명령 도움말"
      data-testid="slash-help-modal"
    >
      <div className="flex max-h-[90vh] w-[640px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <div>
            <h2 className="text-lg font-semibold">슬래시 명령</h2>
            <p className="text-xs text-text-secondary">
              채팅 입력창에서 <kbd className="rounded bg-bg-tertiary px-1">/</kbd> 를 입력하면
              명령 목록이 자동으로 표시돼요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
            data-testid="slash-help-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 명령 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-tertiary">
              <tr>
                <th className="pb-2 font-medium">명령</th>
                <th className="pb-2 font-medium">설명</th>
              </tr>
            </thead>
            <tbody>
              {SLASH_COMMANDS.map((cmd) => (
                <tr
                  key={cmd.id}
                  data-testid={`slash-help-row-${cmd.id}`}
                  className="border-t border-border-primary"
                >
                  <td className="py-2 align-top">
                    <code className="font-mono text-xs text-accent">{cmd.trigger}</code>
                    {cmd.hasArgs === true && cmd.argHint !== undefined && (
                      <code className="ml-1 font-mono text-xs text-text-tertiary">
                        {cmd.argHint}
                      </code>
                    )}
                  </td>
                  <td className="py-2 align-top">
                    <div className="font-medium">{cmd.label}</div>
                    <div className="text-xs text-text-tertiary">{cmd.description}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer hint */}
        <div className="border-t border-border-primary px-4 py-2 text-xs text-text-tertiary">
          <kbd className="rounded bg-bg-tertiary px-1">↑</kbd>
          <kbd className="ml-0.5 rounded bg-bg-tertiary px-1">↓</kbd> 탐색
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1">Enter</kbd> 선택
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1">Tab</kbd> 자동완성
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1">Esc</kbd> 닫기
        </div>
      </div>
    </div>
  );
}
