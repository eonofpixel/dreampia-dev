/**
 * LiveAnnouncer — aria-live 영역 (v1.3.4 / A11y).
 *
 * Spec: docs/v1.x-roadmap.md (P3 v1.3.4 A11y full audit).
 *
 * 사용:
 *   const announce = useAnnouncer();
 *   announce('스트리밍 완료');
 *
 * 두 region:
 *   - polite: 사용자 작업 흐름 방해 X (default).
 *   - assertive: 즉시 알림 (error / 차단성).
 *
 * 메시지가 같으면 reader 가 무시하므로 매번 공백 toggle 후 set — 사용자 입력
 * 없는 자동 announcement 도 명확히.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

let singletonRefCount = 0;
let singletonPolite = '';
let singletonAssertive = '';
let singletonSetters: Set<(p: string, a: string) => void> = new Set();

function notifyAll(): void {
  for (const setter of singletonSetters) {
    setter(singletonPolite, singletonAssertive);
  }
}

export function useAnnouncer(): {
  announce: (message: string, kind?: 'polite' | 'assertive') => void;
} {
  const setterRef = useRef<((p: string, a: string) => void) | null>(null);
  // ref 가 mount/unmount 와 무관하게 일관된 set fn 갖도록.
  if (setterRef.current === null) {
    setterRef.current = (): void => {};
  }
  const announce = useCallback((message: string, kind: 'polite' | 'assertive' = 'polite'): void => {
    if (kind === 'assertive') {
      singletonAssertive = singletonAssertive === message ? `${message} ` : message;
    } else {
      singletonPolite = singletonPolite === message ? `${message} ` : message;
    }
    notifyAll();
  }, []);
  return { announce };
}

/**
 * App.tsx 가 한 번 mount. polite + assertive 두 region 동시 보유.
 */
export function LiveAnnouncerRegion(): React.JSX.Element {
  const [state, setState] = useState<{ polite: string; assertive: string }>({
    polite: '',
    assertive: '',
  });
  useEffect(() => {
    const setter = (polite: string, assertive: string): void => {
      setState({ polite, assertive });
    };
    singletonSetters.add(setter);
    singletonRefCount += 1;
    return () => {
      singletonSetters.delete(setter);
      singletonRefCount -= 1;
      // 마지막 region 이 unmount 되면 singleton 도 reset (test 격리).
      if (singletonRefCount <= 0) {
        singletonRefCount = 0;
        singletonPolite = '';
        singletonAssertive = '';
        singletonSetters = new Set();
      }
    };
  }, []);
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-announcer-polite"
      >
        {state.polite}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-announcer-assertive"
      >
        {state.assertive}
      </div>
    </>
  );
}
