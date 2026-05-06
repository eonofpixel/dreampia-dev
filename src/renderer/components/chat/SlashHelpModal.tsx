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

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { SLASH_COMMANDS } from '../../commands/registry';
import {
  SHORTCUT_DEFS,
  formatShortcut,
  type ShortcutAction,
} from '../../keyboard/shortcuts';
import { useT } from '../../i18n';

export interface SlashHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function SlashHelpModal({
  open,
  onClose,
}: SlashHelpModalProps): React.JSX.Element | null {
  const t = useT();
  // v0.10.0 — 사용자가 지정한 keyboard overrides 를 IPC 에서 fetch 해 표시.
  // 미존재 / 실패 시 default 만 보여줌 (graceful).
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getKeyboardShortcuts !== 'function') {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getKeyboardShortcuts();
        if (!cancelled && result.ok) setOverrides(result.value);
      } catch {
        // ignore — default 표시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Esc 로 닫기 — 다른 모달과 일관된 keyboard UX. App level 의 useKeyboardShortcuts
  // 가 modal.close 를 dispatch 해 onClose 까지 도달 가능하지만, 본 모달은 단독
  // 으로도 사용될 수 있어 자체 listener 도 유지.
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
      aria-label={t('slash_help.modal_aria')}
      data-testid="slash-help-modal"
    >
      <div className="flex max-h-[90vh] w-[640px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <div>
            <h2 className="text-lg font-semibold">{t('slash_help.title')}</h2>
            <p className="text-xs text-text-secondary">
              {t('slash_help.subtitle.before')}
              <kbd className="rounded bg-bg-tertiary px-1">/</kbd>
              {t('slash_help.subtitle.after')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label={t('slash_help.close')}
            data-testid="slash-help-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 명령 목록 + 단축키 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t('slash_help.section.commands')}
          </h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-tertiary">
              <tr>
                <th className="pb-2 font-medium">{t('slash_help.col.command')}</th>
                <th className="pb-2 font-medium">{t('slash_help.col.description')}</th>
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

          <h3
            className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-text-tertiary"
            data-testid="slash-help-shortcuts-heading"
          >
            {t('slash_help.section.shortcuts')}
          </h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-tertiary">
              <tr>
                <th className="pb-2 font-medium">{t('slash_help.col.key')}</th>
                <th className="pb-2 font-medium">{t('slash_help.col.description')}</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUT_DEFS.map((def) => {
                const combo = overrides[def.action] ?? def.default;
                return (
                  <tr
                    key={def.action}
                    data-testid={`slash-help-shortcut-${def.action as ShortcutAction}`}
                    className="border-t border-border-primary"
                  >
                    <td className="py-2 align-top">
                      <kbd className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-secondary">
                        {formatShortcut(combo)}
                      </kbd>
                    </td>
                    <td className="py-2 align-top">
                      <div className="font-medium">{def.label}</div>
                      <div className="text-xs text-text-tertiary">{def.description}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer hint */}
        <div className="border-t border-border-primary px-4 py-2 text-xs text-text-tertiary">
          <kbd className="rounded bg-bg-tertiary px-1">↑</kbd>
          <kbd className="ml-0.5 rounded bg-bg-tertiary px-1">↓</kbd> {t('slash_help.footer.navigate')}
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1">Enter</kbd> {t('slash_help.footer.select')}
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1">Tab</kbd> {t('slash_help.footer.autocomplete')}
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1">Esc</kbd> {t('slash_help.footer.close')}
        </div>
      </div>
    </div>
  );
}
