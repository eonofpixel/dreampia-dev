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
import { SLASH_COMMANDS } from '../../commands/registry';
import { SHORTCUT_DEFS, formatShortcut, type ShortcutAction } from '../../keyboard/shortcuts';
import { useT } from '../../i18n';
import { ModalShell } from '../ui/ModalShell';

export interface SlashHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function SlashHelpModal({ open, onClose }: SlashHelpModalProps): React.JSX.Element | null {
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

  // v2.10.0 (.omc/DESIGN.md, modal migration A) — chrome 을 ModalShell + token
  // 으로. ModalShell 의 onClose 가 Escape + overlay click 자동 처리해 기존
  // 자체 keydown listener 제거. subtitle 은 children 의 상단으로 옮김 (header
  // 는 title 단일 row 유지).
  return (
    <ModalShell
      open={open}
      size="lg"
      title={t('slash_help.title')}
      titleId="slash-help-modal-title"
      onClose={onClose}
      data-testid="slash-help-modal"
      footer={
        <span className="text-caption text-text-tertiary">
          <kbd className="rounded-sm bg-surface-strong px-xxs">↑</kbd>
          <kbd className="ml-[2px] rounded-sm bg-surface-strong px-xxs">↓</kbd>{' '}
          {t('slash_help.footer.navigate')}
          <span className="mx-xs">·</span>
          <kbd className="rounded-sm bg-surface-strong px-xxs">Enter</kbd>{' '}
          {t('slash_help.footer.select')}
          <span className="mx-xs">·</span>
          <kbd className="rounded-sm bg-surface-strong px-xxs">Tab</kbd>{' '}
          {t('slash_help.footer.autocomplete')}
          <span className="mx-xs">·</span>
          <kbd className="rounded-sm bg-surface-strong px-xxs">Esc</kbd>{' '}
          {t('slash_help.footer.close')}
        </span>
      }
    >
      <p className="mb-base text-caption text-text-secondary">
        {t('slash_help.subtitle.before')}
        <kbd className="rounded-sm bg-surface-strong px-xxs">/</kbd>
        {t('slash_help.subtitle.after')}
      </p>

      <h3 className="mb-xs text-caption-uppercase uppercase text-text-tertiary">
        {t('slash_help.section.commands')}
      </h3>
      <table className="mb-lg w-full text-body-sm">
        <thead className="text-left text-caption text-text-tertiary">
          <tr>
            <th className="pb-xs font-medium">{t('slash_help.col.command')}</th>
            <th className="pb-xs font-medium">{t('slash_help.col.description')}</th>
          </tr>
        </thead>
        <tbody>
          {SLASH_COMMANDS.map((cmd) => (
            <tr
              key={cmd.id}
              data-testid={`slash-help-row-${cmd.id}`}
              className="border-t border-hairline"
            >
              <td className="py-xs align-top">
                <code className="font-mono text-caption text-accent">{cmd.trigger}</code>
                {cmd.hasArgs === true && cmd.argHint !== undefined && (
                  <code className="ml-xxs font-mono text-caption text-text-tertiary">
                    {cmd.argHint}
                  </code>
                )}
              </td>
              <td className="py-xs align-top">
                <div className="font-medium text-text-primary">{cmd.label}</div>
                <div className="text-caption text-text-tertiary">{cmd.description}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3
        className="mb-xs text-caption-uppercase uppercase text-text-tertiary"
        data-testid="slash-help-shortcuts-heading"
      >
        {t('slash_help.section.shortcuts')}
      </h3>
      <table className="w-full text-body-sm">
        <thead className="text-left text-caption text-text-tertiary">
          <tr>
            <th className="pb-xs font-medium">{t('slash_help.col.key')}</th>
            <th className="pb-xs font-medium">{t('slash_help.col.description')}</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUT_DEFS.map((def) => {
            const combo = overrides[def.action] ?? def.default;
            return (
              <tr
                key={def.action}
                data-testid={`slash-help-shortcut-${def.action as ShortcutAction}`}
                className="border-t border-hairline"
              >
                <td className="py-xs align-top">
                  <kbd className="rounded-sm bg-surface-strong px-xs py-[2px] font-mono text-caption text-text-secondary">
                    {formatShortcut(combo)}
                  </kbd>
                </td>
                <td className="py-xs align-top">
                  <div className="font-medium text-text-primary">{def.label}</div>
                  <div className="text-caption text-text-tertiary">{def.description}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ModalShell>
  );
}
