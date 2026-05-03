/**
 * useKeyboardShortcuts — v0.10.0 (G F-025).
 *
 * 단축키 시스템의 single global keydown listener. SHORTCUT_DEFS 의 정의를
 * 기반으로 매 키 이벤트를 매칭해 등록된 handler 를 호출한다.
 *
 * Design rationale:
 *  - **단일 listener 원칙**: 각 컴포넌트가 자기 단축키를 따로 등록하면
 *    handler 충돌 / 우선순위 / cleanup 누락이 쉽게 발생. 본 hook 은 App.tsx
 *    에서 한 번만 mount 되어 모든 단축키를 중앙 dispatch.
 *  - **IME 안전**: composition 중 (한글 조합 입력 등) 발생한 keydown 은
 *    `e.isComposing` 또는 `e.keyCode === 229` 로 식별 가능 — 둘 다 무시.
 *  - **Editable element 가드**: input/textarea/contentEditable 안에서는
 *    Mod 가 없는 단순 글자키는 무시 (사용자 텍스트 입력과 충돌 방지).
 *    Escape 는 항상 통과 (모달 닫기는 input focus 상태에서도 필요).
 *  - **first-match-wins**: SHORTCUT_DEFS 의 순서대로 매칭. modal.close 와
 *    chat.cancel 처럼 같은 키를 공유하는 경우, 호출자(App.tsx) 가 단일
 *    handler 안에서 priority chain 을 구성한다.
 *
 * Spec: ROADMAP.md (v0.10.0 Keyboard Command Layer)
 */

import { useEffect, useRef } from 'react';
import {
  SHORTCUT_DEFS,
  matchesShortcut,
  type ShortcutAction,
} from '../keyboard/shortcuts';

export interface UseKeyboardShortcutsArgs {
  /**
   * Action → handler. 미정의 action 은 dispatch 안 됨. handler 는
   * 동기 — 비동기 작업은 호출자가 void wrap.
   */
  handlers: Partial<Record<ShortcutAction, () => void>>;
  /**
   * Action → 사용자 지정 combo. 미지정 시 SHORTCUT_DEFS 의 default 사용.
   * 빈 문자열 / 공백은 default 로 fallback (사용자가 실수로 지웠을 경우).
   */
  overrides?: Partial<Record<ShortcutAction, string>>;
  /**
   * 전역 활성 여부. wizard / 모달이 ownership 을 가져갈 때 false.
   * 미지정 시 true (default 활성).
   */
  enabled?: boolean;
}

/**
 * Editable target 인지 검사. INPUT/TEXTAREA/contentEditable=true 인 element
 * 또는 그 자손을 target 으로 하는 keydown 은 일반 텍스트 입력으로 간주.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * IME composition 감지. e.isComposing 은 modern 브라우저, keyCode === 229
 * 는 Chromium / Safari / Firefox 모두 호환되는 legacy fallback. 둘 중 하나라도
 * 활성이면 단축키 무시.
 */
function isComposingEvent(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  // Some browsers report keyCode 229 for IME composition without setting
  // isComposing. Both checks are needed for max coverage.
  if (e.keyCode === 229) return true;
  return false;
}

export function useKeyboardShortcuts(args: UseKeyboardShortcutsArgs): void {
  const { handlers, overrides, enabled = true } = args;
  // Latest props refs — listener 는 한 번만 등록되고, 매 호출마다 최신
  // handlers / overrides 를 참조하도록.
  const handlersRef = useRef(handlers);
  const overridesRef = useRef(overrides);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!enabledRef.current) return;
      // 한글 조합 등 IME composition 중에는 무시. ChatInput 의 패턴과 동일.
      if (isComposingEvent(e)) return;

      const target = e.target;
      const inEditable = isEditableTarget(target);
      const hasMod = e.metaKey || e.ctrlKey;

      // Editable element 안에서:
      //  - Escape 는 항상 통과 (모달 닫기 / 스트리밍 취소 트리거)
      //  - Mod 조합도 통과 (Mod+K 같은 단축키)
      //  - Mod 없는 글자키는 무시 (텍스트 입력과 충돌)
      if (inEditable && !hasMod && e.key !== 'Escape') return;

      const handlersMap = handlersRef.current;
      const overridesMap = overridesRef.current ?? {};

      for (const def of SHORTCUT_DEFS) {
        const handler = handlersMap[def.action];
        if (handler === undefined) continue;
        // 빈 / 공백 override 는 default 로 fallback. 사용자가 실수로
        // [편집] 모드에서 빈 키를 저장한 경우에도 단축키가 살아 있도록.
        const rawOverride = overridesMap[def.action];
        const combo =
          rawOverride !== undefined && rawOverride.trim().length > 0
            ? rawOverride
            : def.default;
        if (matchesShortcut(e, combo)) {
          e.preventDefault();
          handler();
          return; // first-match-wins
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
