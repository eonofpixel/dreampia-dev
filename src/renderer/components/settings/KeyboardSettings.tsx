/**
 * KeyboardSettings — v0.10.0 Settings 모달 [단축키] 탭 패널.
 *
 * Spec: ROADMAP.md (v0.10.0 Keyboard Command Layer), docs/ux/patterns/F-025-keyboard.md
 *
 * UI 구조:
 *  - 그룹별 (navigation / settings / chat / modal) 단축키 목록
 *  - 각 행: 라벨 + 설명 + 현재 매핑 (formatShortcut) + [편집] / [기본값] 버튼
 *  - [편집] 버튼 클릭 시 inline capture 모드 — 다음 keydown 을 캡처해 저장
 *  - [모두 기본값으로] 전역 reset 버튼
 *  - 헬프 라인: "Mod = Cmd (macOS) / Ctrl (Windows/Linux)"
 *
 * 충돌 검출:
 *  - 한 combo 가 다른 액션의 매핑과 일치하면 reject (modal.close + chat.cancel
 *    같은 의도된 공유는 SHORTCUT_DEFS 의 default 가 동일하므로 사용자가 같은
 *    값으로 명시 변경하지 않는 한 발생 X — 어차피 default 면 override 가 빈
 *    값이라 비교 대상에 안 들어감).
 *
 * IPC 미존재 시 단축키 변경은 silently no-op (graceful degrade) — input
 * field 자체는 disable 로 표시.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pencil, RotateCcw, X } from 'lucide-react';
import {
  SHORTCUT_DEFS,
  canonicalizeKeyEvent,
  formatShortcut,
  isMacOS,
  shortcutsEqual,
  type ShortcutAction,
  type ShortcutCategory,
  type ShortcutDef,
} from '../../keyboard/shortcuts';
import { useKeyboardOverrides } from '../../hooks/useKeyboardOverrides';

const CATEGORY_LABELS_KO: Record<ShortcutCategory, string> = {
  navigation: '탐색',
  settings: '설정',
  chat: '채팅',
  modal: '모달',
};

const CATEGORY_ORDER: ReadonlyArray<ShortcutCategory> = ['navigation', 'settings', 'chat', 'modal'];

/**
 * SettingsModal 의 [단축키] 탭에서 mount. 자체적으로 IPC fetch + save 처리.
 */
export function KeyboardSettings(): React.JSX.Element {
  const { overrides, loading, save } = useKeyboardOverrides();
  const [editing, setEditing] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // editing 모드일 때 화면 외 영역 클릭 시 cancel — Escape 도 cancel.
  useEffect(() => {
    if (editing === null) return;
    const onKey = (e: KeyboardEvent): void => {
      // Escape 는 capture cancel.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setEditing(null);
        return;
      }
      // IME 조합 중 키는 무시.
      if (e.isComposing || e.keyCode === 229) return;
      const combo = canonicalizeKeyEvent(e);
      if (combo === null) return; // bare modifier — 사용자가 trigger 키 안 누름
      e.preventDefault();
      e.stopPropagation();
      handleAssign(editing, combo);
    };
    // capture phase 로 등록 — App level 의 useKeyboardShortcuts 보다 먼저 받음.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, overrides]);

  /**
   * combo 를 한 action 에 할당. 충돌 검사 후 저장. 같은 default 라면 override
   * 자체를 제거해 미니멀하게 영속.
   */
  const handleAssign = useCallback(
    (action: ShortcutAction, combo: string): void => {
      const def = SHORTCUT_DEFS.find((d) => d.action === action);
      if (def === undefined) return;

      // 충돌 검사 — 다른 action 이 같은 combo 를 trap 하는지.
      // 단 modal.close ↔ chat.cancel 처럼 default 가 같은 페어는 SHORTCUT_DEFS
      // 의 default 자체가 동일하므로 사용자가 explicit 충돌을 일으키지 않는
      // 한 검출에 안 걸림. 충돌 시 reject + error 표시.
      for (const other of SHORTCUT_DEFS) {
        if (other.action === action) continue;
        const otherCombo = overrides[other.action] ?? other.default;
        if (shortcutsEqual(combo, otherCombo)) {
          // modal.close / chat.cancel 처럼 의도된 default 공유는 허용 — 둘 다
          // default 를 유지한 채 사용자가 같은 값을 explicit 으로 입력해도
          // 의미가 같으므로 통과시킨다.
          if (otherCombo === other.default && combo === def.default) continue;
          setError(`${formatShortcut(combo)} 는 이미 "${other.label}" 에 사용 중입니다.`);
          setEditing(null);
          return;
        }
      }

      const next: Record<string, string> = { ...overrides };
      // 기본값과 같으면 override 삭제. 그 외엔 저장.
      if (combo === def.default) {
        delete next[action];
      } else {
        next[action] = combo;
      }
      void save(next);
      setEditing(null);
      setError(null);
    },
    [overrides, save]
  );

  const handleResetOne = useCallback(
    (action: ShortcutAction): void => {
      const next = { ...overrides };
      delete next[action];
      void save(next);
      setError(null);
    },
    [overrides, save]
  );

  const handleResetAll = useCallback((): void => {
    void save({});
    setError(null);
    setEditing(null);
  }, [save]);

  // SHORTCUT_DEFS 를 카테고리 별로 그룹.
  const grouped = useMemo<Map<ShortcutCategory, ShortcutDef[]>>(() => {
    const m = new Map<ShortcutCategory, ShortcutDef[]>();
    for (const def of SHORTCUT_DEFS) {
      const arr = m.get(def.category) ?? [];
      arr.push(def);
      m.set(def.category, arr);
    }
    return m;
  }, []);

  const onMac = isMacOS();
  const hasAnyOverride = Object.keys(overrides).length > 0;

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-keyboard-panel">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Keyboard className="h-4 w-4" />
            단축키
          </h3>
          <p className="text-xs text-text-secondary">
            행을 [편집] 으로 누른 뒤 원하는 키 조합을 입력하면 즉시 적용됩니다.{' '}
            <code className="rounded bg-surface-strong px-1 font-mono">Mod</code> ={' '}
            {onMac ? '⌘ Cmd (macOS)' : 'Ctrl (Windows / Linux)'}.
          </p>
        </div>
        {hasAnyOverride && (
          <button
            type="button"
            onClick={handleResetAll}
            className="flex shrink-0 items-center gap-1 rounded-md border border-hairline bg-canvas-soft px-3 py-1.5 text-xs hover:bg-surface-strong"
            data-testid="settings-keyboard-reset-all"
            aria-label="모든 단축키 기본값으로"
          >
            <RotateCcw className="h-3 w-3" />
            전체 초기화
          </button>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-text-secondary">불러오는 중...</p>
      ) : (
        <>
          {error !== null && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-semantic-danger/40 bg-semantic-danger/10 p-3 text-xs text-semantic-danger"
              data-testid="settings-keyboard-error"
            >
              {error}
            </div>
          )}

          {CATEGORY_ORDER.map((category) => {
            const defs = grouped.get(category) ?? [];
            if (defs.length === 0) return null;
            return (
              <div key={category} className="mb-4 last:mb-0">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  {CATEGORY_LABELS_KO[category]}
                </h4>
                <ul
                  className="rounded-md border border-hairline bg-canvas-soft"
                  data-testid={`settings-keyboard-group-${category}`}
                >
                  {defs.map((def, idx) => {
                    const combo = overrides[def.action] ?? def.default;
                    const isEditing = editing === def.action;
                    const isOverridden =
                      overrides[def.action] !== undefined && overrides[def.action] !== def.default;
                    return (
                      <li
                        key={def.action}
                        className={`flex items-center justify-between gap-3 px-3 py-2 ${
                          idx > 0 ? 'border-t border-hairline' : ''
                        }`}
                        data-testid={`settings-keyboard-row-${def.action}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{def.label}</p>
                          <p className="text-xs text-text-tertiary">{def.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isEditing ? (
                            <span
                              className="rounded-md border border-accent bg-surface-strong px-2 py-1 font-mono text-xs text-accent"
                              data-testid={`settings-keyboard-capture-${def.action}`}
                              role="status"
                              aria-live="polite"
                            >
                              키 입력 대기...
                            </span>
                          ) : (
                            <kbd
                              className="rounded-md bg-surface-strong px-2 py-1 font-mono text-xs text-text-secondary"
                              data-testid={`settings-keyboard-combo-${def.action}`}
                            >
                              {formatShortcut(combo)}
                            </kbd>
                          )}
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(null);
                              }}
                              className="rounded-md p-1 text-text-tertiary hover:bg-surface-strong"
                              aria-label="편집 취소"
                              data-testid={`settings-keyboard-cancel-${def.action}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setError(null);
                                  setEditing(def.action);
                                }}
                                className="rounded-md p-1 text-text-tertiary hover:bg-surface-strong hover:text-text-primary"
                                aria-label={`${def.label} 단축키 편집`}
                                data-testid={`settings-keyboard-edit-${def.action}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {isOverridden && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleResetOne(def.action);
                                  }}
                                  className="rounded-md p-1 text-text-tertiary hover:bg-surface-strong hover:text-text-primary"
                                  aria-label={`${def.label} 기본값 복원`}
                                  data-testid={`settings-keyboard-reset-${def.action}`}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
