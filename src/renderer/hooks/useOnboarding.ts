/**
 * useOnboarding — Phase 3 B2: 첫 실행 wizard 표시 여부 + 완료 상태 영속.
 *
 * 흐름:
 *   1) onMount: window.dreampia.app.getOnboardingStatus() → settings.json 조회
 *   2) completed === true 면 wizard skip, 아니면 OnboardingWizard 표시
 *   3) 사용자가 wizard 끝낼 때 complete() 호출 → main 에 영속 + state 갱신
 *
 * Loading state (`completed === null`):
 *   IPC 응답 도착 전까지는 main app 도 wizard 도 표시하지 않는다 (flicker 방지).
 *   App.tsx 가 `loading || onboardingLoading` 동안 빈 화면 또는 splash 유지.
 *
 * IPC 미존재 (preload 안 로드 / 테스트 격리):
 *   safe fallback — completed=false (= wizard 표시) + complete() 는 in-memory
 *   토글만. 테스트는 setup.ts mock 이 정상 응답 시뮬.
 *
 * Spec: docs/ia/onboarding.md
 */

import { useCallback, useEffect, useState } from 'react';

export interface UseOnboardingApi {
  /**
   * `true`  — wizard 이미 끝남 (또는 건너뛰기 됨), main app 표시
   * `false` — 첫 실행 또는 미완료, wizard 표시 필요
   * `null`  — IPC 응답 대기 중 (로딩 중)
   */
  completed: boolean | null;
  loading: boolean;
  /** Wizard 완료 처리 — settings.json 에 onboarding_completed=true 영속. */
  complete: () => Promise<void>;
}

function hasOnboardingApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.dreampia !== undefined &&
    typeof window.dreampia.app === 'object' &&
    window.dreampia.app !== null &&
    typeof window.dreampia.app.getOnboardingStatus === 'function' &&
    typeof window.dreampia.app.completeOnboarding === 'function'
  );
}

export function useOnboarding(): UseOnboardingApi {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hasOnboardingApi()) {
      // IPC 미존재 (preload 깨짐 / vitest 격리) → wizard 표시 default.
      // E2E 는 fixtures 가 settings.json 을 미리 써둠.
      setCompleted(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.dreampia.app.getOnboardingStatus();
        if (cancelled) return;
        if (result.ok) {
          setCompleted(result.value.completed);
        } else {
          // IPC error → wizard 표시 (안전한 default).
          setCompleted(false);
        }
      } catch {
        if (!cancelled) setCompleted(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(async (): Promise<void> => {
    if (!hasOnboardingApi()) {
      setCompleted(true);
      return;
    }
    try {
      await window.dreampia.app.completeOnboarding();
    } catch {
      // 영속 실패해도 in-memory 는 완료로 — 재시작 시 다시 wizard 보일 수 있음.
    }
    setCompleted(true);
  }, []);

  return {
    completed,
    loading: completed === null,
    complete,
  };
}
