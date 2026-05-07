/**
 * useToasts — 통일된 toast 알림 (v1.1.16 / L/E/E 첫 단계).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x Loading / Error / Empty + visual polish).
 *
 * 책임:
 *  - error / warning / info / success 4 종 toast push API.
 *  - default 4초 후 자동 dismiss. error 는 8초 (사용자가 충분히 읽음).
 *  - 사용자가 명시적으로 dismiss 가능.
 *  - 동시 다중 toast — 최신이 위에. cap 5개 (오버플로우 시 oldest dismiss).
 *
 * 사용:
 *   const toasts = useToasts();
 *   toasts.error('파일 저장 실패', { detail: err.message });
 *   <ToastContainer toasts={toasts.list} onDismiss={toasts.dismiss} />
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'error' | 'warning' | 'info' | 'success';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** 사용자에게 추가 정보. error stack / 코드 / 명령 hint 등. */
  detail?: string;
  /** 자동 dismiss 까지 ms. default kind 별로 다름. 0 = 수동 dismiss 만. */
  ttl_ms: number;
  created_at: number;
  /** retry callback 이 있으면 toast 안에 [재시도] 버튼 표시. */
  retry?: () => void;
}

export interface ToastsApi {
  list: ReadonlyArray<ToastItem>;
  push: (kind: ToastKind, message: string, options?: ToastPushOptions) => string;
  error: (message: string, options?: ToastPushOptions) => string;
  warning: (message: string, options?: ToastPushOptions) => string;
  info: (message: string, options?: ToastPushOptions) => string;
  success: (message: string, options?: ToastPushOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export interface ToastPushOptions {
  detail?: string;
  ttl_ms?: number;
  retry?: () => void;
}

/** Toast 동시 cap. */
const MAX_TOASTS = 5;

/** kind 별 default TTL. error 는 좀 더 오래. */
const DEFAULT_TTL_MS: Record<ToastKind, number> = {
  error: 8_000,
  warning: 6_000,
  info: 4_000,
  success: 4_000,
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function useToasts(): ToastsApi {
  const [list, setList] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string): void => {
    setList((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, options: ToastPushOptions = {}): string => {
      const id = nextId();
      const ttl = options.ttl_ms ?? DEFAULT_TTL_MS[kind];
      const item: ToastItem = {
        id,
        kind,
        message,
        ttl_ms: ttl,
        created_at: Date.now(),
        ...(options.detail !== undefined && { detail: options.detail }),
        ...(options.retry !== undefined && { retry: options.retry }),
      };
      setList((prev) => {
        const next = [...prev, item];
        if (next.length > MAX_TOASTS) {
          // 오래된 것부터 drop.
          return next.slice(next.length - MAX_TOASTS);
        }
        return next;
      });
      if (ttl > 0) {
        setTimeout(() => {
          setList((prev) => prev.filter((t) => t.id !== id));
        }, ttl);
      }
      return id;
    },
    []
  );

  const error = useCallback(
    (message: string, options?: ToastPushOptions): string => push('error', message, options),
    [push]
  );
  const warning = useCallback(
    (message: string, options?: ToastPushOptions): string => push('warning', message, options),
    [push]
  );
  const info = useCallback(
    (message: string, options?: ToastPushOptions): string => push('info', message, options),
    [push]
  );
  const success = useCallback(
    (message: string, options?: ToastPushOptions): string => push('success', message, options),
    [push]
  );

  const clear = useCallback((): void => {
    setList([]);
  }, []);

  return { list, push, error, warning, info, success, dismiss, clear };
}

// ────────────────────────────────────────────────────────────
// v1.7.11 — Toast context provider
//
// useToasts 는 단일 인스턴스 (App.tsx 가 owner) 가 ToastContainer 를 mount.
// 깊이 nested 한 컴포넌트 (SettingsModal 의 panel 들 등) 에서도 같은 toast
// 시스템을 쓰려면 prop drilling 대신 context 가 필요.
//
// 사용:
//   App.tsx 안:
//     const toasts = useToasts();
//     <ToastsContext.Provider value={toasts}>...</ToastsContext.Provider>
//
//   하위 컴포넌트:
//     const toasts = useToastsContext(); // throws if outside provider
//     // 또는
//     const toasts = useOptionalToasts(); // null if outside provider
// ────────────────────────────────────────────────────────────

const ToastsContext = createContext<ToastsApi | null>(null);

export interface ToastsProviderProps {
  value: ToastsApi;
  children: ReactNode;
}

export function ToastsProvider({ value, children }: ToastsProviderProps): React.JSX.Element {
  return createElement(ToastsContext.Provider, { value }, children);
}

/**
 * Provider 안에서만 사용. 미설정이면 throw — 누락 디버깅 명확화.
 * 옵션이 필요하면 `useOptionalToasts` 사용.
 */
export function useToastsContext(): ToastsApi {
  const ctx = useContext(ToastsContext);
  if (ctx === null) {
    throw new Error(
      'useToastsContext must be used within a ToastsProvider. ' +
        'Wrap the app (or test) with <ToastsProvider value={useToasts()}>.'
    );
  }
  return ctx;
}

/**
 * Provider 가 없는 환경 (테스트 / 분리 mount) 에서 사용 가능. null 이면
 * caller 가 silent fallback 결정.
 */
export function useOptionalToasts(): ToastsApi | null {
  return useContext(ToastsContext);
}
