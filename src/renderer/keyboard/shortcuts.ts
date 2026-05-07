/**
 * Keyboard shortcut registry — v0.10.0 (G F-025).
 *
 * Spec: ROADMAP.md (v0.10.0 Keyboard Command Layer), PRD.md (v0.5.0 acceptance).
 *
 * 단축키 시스템의 single-source-of-truth. 정의는 ReadonlyArray 로 export 되어
 * useKeyboardShortcuts hook 과 SettingsModal 의 [단축키] 패널이 같은 데이터를
 * 공유한다.
 *
 * 표기 규칙:
 *  - "Mod" 토큰은 macOS 에선 Cmd (Meta), 그 외엔 Ctrl 로 자동 resolve.
 *  - 조합은 +로 구분: "Mod+K", "Mod+Shift+/", "Escape".
 *  - 키 이름은 KeyboardEvent.key (대소문자 무관). "?" 같은 shifted 글자는
 *    "Shift+/" 로 표현 — KeyboardEvent.code 가 아닌 .key 가 layout 에 안전.
 *
 * IME 안전성:
 *  - 본 모듈은 순수 parsing/matching 만 담당. composition 가드는
 *    useKeyboardShortcuts hook 에서 처리.
 */

/** 단축키가 트리거할 수 있는 추상 액션 식별자. */
export type ShortcutAction =
  | 'search.focus'
  | 'usage.open'
  | 'settings.open'
  | 'chat.new'
  | 'sidebar.toggle'
  | 'help.open'
  | 'modal.close'
  | 'chat.cancel'
  | 'preview.toggle'
  | 'layout.fullscreen';

/** 사용자에게 노출할 카테고리. SettingsModal 의 그룹핑에 사용. */
export type ShortcutCategory = 'navigation' | 'settings' | 'chat' | 'modal';

export interface ShortcutDef {
  action: ShortcutAction;
  /**
   * Default key combo. Stored as canonical "Mod+K", "Mod+Shift+K", etc.
   * "Mod" auto-resolves to Cmd on macOS, Ctrl elsewhere.
   */
  default: string;
  label: string;
  description: string;
  category: ShortcutCategory;
}

/**
 * 등록된 모든 단축키 정의. 순서는 SettingsModal 의 [단축키] 패널 표시 순서와
 * 일치 — UI 가 별도로 정렬할 필요가 없도록.
 */
export const SHORTCUT_DEFS: ReadonlyArray<ShortcutDef> = [
  {
    action: 'search.focus',
    default: 'Mod+K',
    label: '검색 포커스',
    description: '사이드바 메시지 검색 박스로 포커스 이동',
    category: 'navigation',
  },
  {
    action: 'sidebar.toggle',
    default: 'Mod+B',
    label: '사이드바 토글',
    description: '사이드바 표시 / 숨김',
    category: 'navigation',
  },
  {
    action: 'preview.toggle',
    // Mod+\ 는 VSCode 의 panel split / Cursor 의 right-pane toggle 과 같은 키.
    default: 'Mod+\\',
    label: '미리보기 토글',
    description: '우측 미리보기 패널 표시 / 숨김',
    category: 'navigation',
  },
  {
    // v1.6.4 — Fullscreen / distraction-free 모드. 사이드바 + 미리보기 동시
    // 숨김 (chat 만 풀폭). 다시 누르면 진입 직전 상태로 복원.
    action: 'layout.fullscreen',
    default: 'Mod+Shift+F',
    label: '풀스크린 토글',
    description: '사이드바 + 미리보기 한 번에 숨겨 채팅에 집중',
    category: 'navigation',
  },
  {
    action: 'settings.open',
    default: 'Mod+,',
    label: '설정 열기',
    description: 'Settings 모달 열기 (MCP 탭)',
    category: 'settings',
  },
  {
    action: 'usage.open',
    default: 'Mod+U',
    label: '사용량 보기',
    description: 'Settings 모달의 사용량 탭 열기',
    category: 'settings',
  },
  {
    action: 'chat.new',
    default: 'Mod+N',
    label: '새 채팅',
    description: '새 세션 생성',
    category: 'chat',
  },
  {
    action: 'help.open',
    default: 'Mod+/',
    label: '단축키 도움말',
    description: '단축키 + 슬래시 명령 도움말 열기',
    category: 'modal',
  },
  // modal.close 가 chat.cancel 보다 먼저 등록되어야 한다 — 둘 다 Escape 를
  // default 로 갖고 first-match-wins 정책이라, modal.close 가 먼저 dispatch
  // 되고 그 안에서 priority chain (모달 닫기 > 스트리밍 취소) 을 처리한다.
  {
    action: 'modal.close',
    default: 'Escape',
    label: '모달 닫기',
    description: '열린 모달 또는 popover 닫기',
    category: 'modal',
  },
  {
    action: 'chat.cancel',
    default: 'Escape',
    label: '스트리밍 취소',
    description: '진행 중인 AI 응답 중단 (모달이 닫힌 상태에서)',
    category: 'chat',
  },
];

/** Action → ShortcutDef 빠른 lookup. */
const DEFS_BY_ACTION: ReadonlyMap<ShortcutAction, ShortcutDef> = (() => {
  const m = new Map<ShortcutAction, ShortcutDef>();
  for (const d of SHORTCUT_DEFS) m.set(d.action, d);
  return m;
})();

export function getShortcutDef(action: ShortcutAction): ShortcutDef | undefined {
  return DEFS_BY_ACTION.get(action);
}

/**
 * macOS 감지. test 환경 (jsdom) 에서도 동작하도록 navigator.platform fallback.
 *
 * navigator.userAgentData?.platform 은 modern API (Chromium 90+). 없으면
 * navigator.platform 의 'mac' substring 으로 fallback.
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Modern API (User-Agent Client Hints).
  const uaData = (
    navigator as unknown as {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  if (uaData?.platform !== undefined && typeof uaData.platform === 'string') {
    return uaData.platform.toLowerCase().includes('mac');
  }
  // Legacy navigator.platform — deprecated 지만 jsdom + 옛 브라우저에 안전.
  if (typeof navigator.platform === 'string') {
    return navigator.platform.toLowerCase().includes('mac');
  }
  // Last resort — userAgent.
  if (typeof navigator.userAgent === 'string') {
    return navigator.userAgent.toLowerCase().includes('mac');
  }
  return false;
}

/** Combo 의 parsed 형태. matchesShortcut 의 내부 헬퍼이지만 export 도. */
export interface ParsedShortcut {
  /** "Mod" 또는 "Cmd" / "Ctrl" / "Meta" 가 포함되었는지. */
  mod: boolean;
  /** Explicit "Ctrl" 토큰만. macOS 에서 Mod 와 별개로 Ctrl 도 강제할 때. */
  ctrl: boolean;
  /** Explicit "Meta" 또는 "Cmd". */
  meta: boolean;
  shift: boolean;
  alt: boolean;
  /** 마지막 비-modifier 키. 항상 lowercase 로 정규화. 예: 'k', '/', 'escape'. */
  key: string;
}

/**
 * "Mod+Shift+K" 같은 combo 를 ParsedShortcut 으로. 알 수 없는 토큰은 key 로
 * 처리 — 마지막 비-modifier 토큰이 키. 중복 modifier 는 무시.
 *
 * Empty / 잘못된 입력은 key='' 인 ParsedShortcut 반환 (matchesShortcut 가
 * false 반환하도록 fallback).
 */
export function parseShortcut(combo: string): ParsedShortcut {
  const out: ParsedShortcut = {
    mod: false,
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
    key: '',
  };
  if (typeof combo !== 'string' || combo.length === 0) return out;
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (const raw of parts) {
    const lower = raw.toLowerCase();
    switch (lower) {
      case 'mod':
        out.mod = true;
        break;
      case 'ctrl':
      case 'control':
        out.ctrl = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        out.meta = true;
        break;
      case 'shift':
        out.shift = true;
        break;
      case 'alt':
      case 'option':
      case 'opt':
        out.alt = true;
        break;
      default:
        // 마지막 토큰이 key. 여러 개여도 마지막이 win — 보수적.
        out.key = lower;
        break;
    }
  }
  return out;
}

/**
 * KeyboardEvent 가 combo 에 매칭되는지 검사.
 *
 * 매칭 룰:
 *  - "Mod" 토큰: macOS 면 metaKey, 그 외엔 ctrlKey 와 매칭.
 *  - "Ctrl" / "Meta" 토큰: 명시된 modifier 만 매칭 (Mod 와 독립).
 *  - "Shift" / "Alt": 명시된 경우 그 modifier 가 활성, 미명시 시 비활성.
 *  - key: KeyboardEvent.key 의 lowercase 와 비교.
 *
 * key 가 비어있으면 (parseShortcut 실패) 항상 false.
 */
export function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  const parsed = parseShortcut(combo);
  if (parsed.key.length === 0) return false;

  const eventKey = e.key.toLowerCase();
  if (eventKey !== parsed.key) return false;

  // Modifier 매칭. Mod 는 platform 에 따라 다름.
  const onMac = isMacOS();
  const expectMeta = parsed.meta || (parsed.mod && onMac);
  const expectCtrl = parsed.ctrl || (parsed.mod && !onMac);
  const expectShift = parsed.shift;
  const expectAlt = parsed.alt;

  if (Boolean(e.metaKey) !== expectMeta) return false;
  if (Boolean(e.ctrlKey) !== expectCtrl) return false;
  if (Boolean(e.shiftKey) !== expectShift) return false;
  if (Boolean(e.altKey) !== expectAlt) return false;

  return true;
}

/**
 * 사용자에게 보여줄 형태로 combo 를 문자열로. macOS 는 ⌘ ⌃ ⌥ ⇧ 기호,
 * 그 외엔 "Ctrl+K" 형태. key 는 대문자화 + 'escape' → 'Esc' 같은 alias.
 *
 * 예시:
 *   "Mod+K"          → macOS ⌘K | Win Ctrl+K
 *   "Mod+Shift+/"    → macOS ⇧⌘/ | Win Ctrl+Shift+/
 *   "Escape"         → "Esc"
 *
 * macOS 의 modifier 순서는 Apple HIG: Ctrl ⌃ → Alt ⌥ → Shift ⇧ → Cmd ⌘.
 */
export function formatShortcut(combo: string): string {
  const parsed = parseShortcut(combo);
  if (parsed.key.length === 0) return combo;
  const onMac = isMacOS();
  const parts: string[] = [];
  if (onMac) {
    if (parsed.ctrl) parts.push('⌃');
    if (parsed.alt) parts.push('⌥');
    if (parsed.shift) parts.push('⇧');
    // Mod on macOS = ⌘. Explicit Meta also = ⌘.
    if (parsed.meta || parsed.mod) parts.push('⌘');
  } else {
    if (parsed.mod) parts.push('Ctrl');
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.meta) parts.push('Meta');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
  }
  parts.push(displayKey(parsed.key));
  return onMac ? parts.join('') : parts.join('+');
}

function displayKey(key: string): string {
  switch (key) {
    case 'escape':
      return 'Esc';
    case 'arrowup':
      return '↑';
    case 'arrowdown':
      return '↓';
    case 'arrowleft':
      return '←';
    case 'arrowright':
      return '→';
    case 'enter':
    case 'return':
      return 'Enter';
    case 'tab':
      return 'Tab';
    case 'space':
    case ' ':
      return 'Space';
    case 'backspace':
      return 'Backspace';
    case 'delete':
      return 'Del';
    default:
      // 단일 글자는 대문자화. 그 외 (e.g. 'f1') 는 첫 글자만 대문자.
      if (key.length === 1) return key.toUpperCase();
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

/**
 * KeyboardEvent → canonical combo 문자열. SettingsModal 의 [편집] 모드에서
 * 사용자가 누른 키를 저장 가능한 형태로 변환.
 *
 * - 특정 modifier 만 누른 (key === 'Control', 'Shift' 등) 이벤트는 null.
 * - macOS 에서 metaKey, 그 외에서 ctrlKey 가 활성이면 "Mod" 로 정규화.
 * - 동시에 Ctrl+Cmd 처럼 cross-platform-ambiguous 한 조합은 explicit Meta/Ctrl
 *   둘 다 emit (사용자 의도 보존).
 */
export function canonicalizeKeyEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === undefined || k === '') return null;
  // Bare modifier press → 무시 (사용자가 아직 trigger key 안 누름).
  const modifierKeys = new Set([
    'Control',
    'Shift',
    'Alt',
    'Meta',
    'OS',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'AltGraph',
    'Hyper',
    'Super',
  ]);
  if (modifierKeys.has(k)) return null;

  const onMac = isMacOS();
  const parts: string[] = [];

  // Mod resolution: macOS 의 metaKey = Mod, 그 외 ctrlKey = Mod.
  // 다만 사용자가 두 modifier 를 둘 다 눌렀다면 explicit 토큰 사용 (분리 의도).
  if (onMac && e.metaKey && !e.ctrlKey) {
    parts.push('Mod');
  } else if (!onMac && e.ctrlKey && !e.metaKey) {
    parts.push('Mod');
  } else {
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Meta');
  }
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Trigger key — Escape / Enter 같은 단독 키도 허용 (modifier-less).
  // KeyboardEvent.key 의 첫 글자 대문자화 (Escape, Enter 등은 이미 그 형태).
  let key = k;
  if (key.length === 1) {
    // a → A, , → , (그대로). canonical 은 대문자.
    key = key.toUpperCase();
  }
  parts.push(key);

  // 단독 글자 키 (modifier 없음, 한 글자) 는 거절 — 일반 텍스트 입력과 충돌.
  // 단 Escape / Enter / F1.. 같은 special 은 허용.
  if (parts.length === 1 && key.length === 1) return null;
  return parts.join('+');
}

/**
 * 두 combo 가 같은 키 이벤트를 trap 하는지. 충돌 검출용 — 두 다른 action 에
 * 같은 combo 를 할당하면 reject 해야 한다 (단 modal.close 와 chat.cancel
 * 처럼 Escape 를 공유하는 경우는 App.tsx 의 priority chain 으로 처리).
 */
export function shortcutsEqual(a: string, b: string): boolean {
  const pa = parseShortcut(a);
  const pb = parseShortcut(b);
  if (pa.key.length === 0 || pb.key.length === 0) return false;
  if (pa.key !== pb.key) return false;
  if (pa.shift !== pb.shift) return false;
  if (pa.alt !== pb.alt) return false;
  // Mod / Ctrl / Meta 비교 — Mod 는 platform 별로 다르지만 같은 platform 위에서
  // 비교하므로 Mod=Mod, 또는 Mod 와 Ctrl/Meta 는 다른 토큰 으로 취급. 단 명시
  // Ctrl 과 Mod (Win/Linux) 는 같은 trap 을 만들 수 있으므로 platform-aware
  // 비교: macOS 에서 Mod === Meta, 그 외엔 Mod === Ctrl.
  const onMac = isMacOS();
  const aMeta = pa.meta || (pa.mod && onMac);
  const aCtrl = pa.ctrl || (pa.mod && !onMac);
  const bMeta = pb.meta || (pb.mod && onMac);
  const bCtrl = pb.ctrl || (pb.mod && !onMac);
  return aMeta === bMeta && aCtrl === bCtrl;
}
