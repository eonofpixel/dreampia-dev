/**
 * ProviderDropdown — v1.5.2.
 *
 * Spec: docs/v1.x-roadmap.md (v1.5.2 — provider selection UI in ChatHeader).
 *
 * 채팅 헤더에 작은 dropdown 으로 settings.default_provider 를 즉시 변경.
 * 기존 [Settings → Provider] 탭 까지 들어가지 않고 한 번 클릭으로 전환할 수
 * 있도록.
 *
 * 4 옵션:
 *  - auto   — 모델 prefix 로 Claude/Codex 자동 분기 (Direct API key 있으면 우선)
 *  - claude — Claude (CLI 또는 Direct API key 가 있으면 그것)
 *  - codex  — Codex (CLI 또는 Direct API key)
 *  - mock   — 개발용 mock provider
 *
 * 본 컴포넌트는 self-contained — 자기 IPC 로 영속 + 로딩.
 *  - getDefaultProvider() 로 초기 값 로드
 *  - select 변경 시 setDefaultProvider() 즉시 호출
 *  - 다음 메시지부터 새 provider 적용 (현재 진행 중 turn 은 영향 X)
 *
 * UX 결정:
 *  - native <select> — PermissionDropdown 와 동일 paradigm (z-index / IME 안전).
 *  - Cpu icon + sr-only 라벨.
 *  - 현재 active option 을 title 로 노출 (hover tooltip).
 *  - IPC 미지원 환경 (preload 깨짐 / dev) 에선 disabled.
 */

import { useCallback, useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { useT } from '../../i18n';

export type DefaultProviderChoice = 'auto' | 'claude' | 'codex' | 'mock';

const PROVIDER_OPTIONS: ReadonlyArray<DefaultProviderChoice> = [
  'auto',
  'claude',
  'codex',
  'mock',
];

export interface ProviderDropdownProps {
  /**
   * 외부에서 의도적으로 disable 가능 (e.g. 스트리밍 중). 미지정이면 자체 IPC
   * 가용성 검사 후 자동 결정.
   */
  disabled?: boolean;
  /**
   * 테스트 / Storybook 등에서 IPC 우회용. 본 prop 이 주어지면 self-managed
   * IPC 대신 controlled 모드로 동작.
   */
  controlled?: {
    value: DefaultProviderChoice;
    onChange: (next: DefaultProviderChoice) => void;
  };
}

export function ProviderDropdown({
  disabled,
  controlled,
}: ProviderDropdownProps): React.JSX.Element {
  const t = useT();
  const [value, setValue] = useState<DefaultProviderChoice>(
    controlled?.value ?? 'auto'
  );
  const [ipcAvailable, setIpcAvailable] = useState(false);
  const [loaded, setLoaded] = useState(controlled !== undefined);

  // controlled 모드일 땐 외부 값 → 내부 상태 동기화. self-managed 일 땐 mount 시
  // 한 번만 IPC 로 fetch.
  useEffect(() => {
    if (controlled !== undefined) {
      setValue(controlled.value);
      setLoaded(true);
      setIpcAvailable(true);
      return;
    }
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (
      appApi === undefined ||
      typeof appApi.getDefaultProvider !== 'function' ||
      typeof appApi.setDefaultProvider !== 'function'
    ) {
      setIpcAvailable(false);
      setLoaded(true);
      return;
    }
    setIpcAvailable(true);
    let cancelled = false;
    void (async () => {
      try {
        const r = await appApi.getDefaultProvider();
        if (!cancelled && r.ok) {
          setValue(r.value);
        }
      } catch {
        // safe default 'auto' 유지
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controlled]);

  const handleChange = useCallback(
    (next: DefaultProviderChoice): void => {
      // Optimistic update — 사용자에게 즉시 반응.
      setValue(next);
      if (controlled !== undefined) {
        controlled.onChange(next);
        return;
      }
      const appApi =
        typeof window !== 'undefined' ? window.dreampia?.app : undefined;
      if (appApi === undefined || typeof appApi.setDefaultProvider !== 'function') {
        return;
      }
      void appApi.setDefaultProvider(next).catch(() => {
        // 실패해도 UI 는 selected 상태 유지 — 다음 fetch 가 진실의 단일 소스.
      });
    },
    [controlled]
  );

  // controlled 모드면 항상 enable. self-managed 일 땐 IPC 가용 + 초기 fetch
  // 완료까지 대기. 외부 disabled 는 모든 것을 오버라이드.
  const isDisabled =
    disabled ?? (controlled === undefined && (!ipcAvailable || !loaded));
  const currentLabel = t(`provider.dropdown.option.${value}`);

  return (
    <label
      className="flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-border-primary"
      title={t('provider.dropdown.tooltip', { label: currentLabel })}
      data-testid="provider-dropdown"
    >
      <Cpu className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">{t('provider.dropdown.label')}</span>
      <select
        value={value}
        disabled={isDisabled}
        onChange={(e) => {
          handleChange(e.target.value as DefaultProviderChoice);
        }}
        className="cursor-pointer bg-transparent text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t('provider.dropdown.aria')}
        data-testid="provider-dropdown-select"
      >
        {PROVIDER_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {t(`provider.dropdown.option.${opt}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
