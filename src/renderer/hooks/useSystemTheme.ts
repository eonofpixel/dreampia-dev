/**
 * useSystemTheme — OS prefers-color-scheme 감지 (v1.3.5).
 *
 * Spec: docs/v1.x-roadmap.md (P3 v1.3.5 다크모드 회귀).
 *
 * 사용:
 *   const sys = useSystemTheme();
 *   const theme = settings.theme === 'system' ? sys : settings.theme;
 *
 * matchMedia('(prefers-color-scheme: dark)') 변경 listener — OS 가 light/dark
 * toggle 하면 즉시 반응.
 */

import { useEffect, useState } from 'react';

export type SystemTheme = 'light' | 'dark';

export function useSystemTheme(): SystemTheme {
  const [theme, setTheme] = useState<SystemTheme>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Safari < 14: addListener / removeListener legacy.
    if ('addListener' in mq && typeof mq.addListener === 'function') {
      (mq as unknown as { addListener: (h: typeof handler) => void }).addListener(handler);
      return () => {
        (mq as unknown as { removeListener: (h: typeof handler) => void }).removeListener(
          handler
        );
      };
    }
    return undefined;
  }, []);
  return theme;
}

/**
 * settings.theme + system 결과를 합쳐 effective theme 반환.
 * settings.theme === 'system' (or undefined) → system. 그 외 → settings 값.
 */
export function resolveEffectiveTheme(
  settingsTheme: string | undefined,
  systemTheme: SystemTheme
): 'light' | 'dark' {
  if (settingsTheme === 'light' || settingsTheme === 'dark') return settingsTheme;
  return systemTheme;
}
