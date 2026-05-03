/**
 * LanguageSettings — v0.11.0 (B2 English i18n) Settings 모달의 [언어] 탭.
 *
 * Spec: ROADMAP.md (v0.11.0 B2 English i18n)
 *
 * UX:
 *  - Radio group: 한국어 (default) / English
 *  - 변경 즉시 i18n.setLocale + IPC persist (page reload 불필요 —
 *    useT 가 subscriber 로 reactive 하게 동작)
 *  - 영문화 범위가 chat / search / usage / settings / error 핵심 화면에 한정
 *    되어 있다는 사실을 description 에서 명시 — 사용자에게 expectation 를
 *    솔직하게 전달해야 "왜 일부만 영어지?" 같은 confusion 을 막을 수 있다.
 *
 * 모달이 한 번도 안 열렸을 때도 boot-time 에 App.tsx 가 setLocale 호출하므로
 * 이 패널은 "현재 IPC 가 들고 있는 값" 만 다시 보여주면 된다 (race-free).
 */

import { useCallback, useEffect, useState } from 'react';
import { setLocale, useT, type Locale } from '../../i18n';

export function LanguageSettings(): React.JSX.Element {
  const t = useT();
  const [choice, setChoice] = useState<Locale>('ko');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getLanguage !== 'function') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await appApi.getLanguage();
        if (!cancelled && r.ok) {
          setChoice(r.value);
          setLocale(r.value);
        }
      } catch {
        // safe default 유지
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(async (next: Locale): Promise<void> => {
    setChoice(next);
    // 1) 즉시 locale 적용 — useT subscribers 가 re-render.
    setLocale(next);
    // 2) IPC persist. 실패해도 in-memory state 는 유지 — 다음 부팅 시
    //    한국어로 fallback 되므로 UX 가 silently degraded 되지 않는다.
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setLanguage !== 'function') return;
    try {
      await appApi.setLanguage(next);
    } catch {
      // ignore
    }
  }, []);

  const options: ReadonlyArray<{ value: Locale; label: string; hint: string }> = [
    {
      value: 'ko',
      label: t('settings.language.korean'),
      hint: t('settings.language.korean_hint'),
    },
    {
      value: 'en',
      label: t('settings.language.english'),
      hint: t('settings.language.english_hint'),
    },
  ];

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-language-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.language.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.language.description')}</p>
      </header>
      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.loading')}</p>
      ) : (
        <ul className="space-y-2">
          {options.map((opt) => {
            const active = choice === opt.value;
            return (
              <li key={opt.value}>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
                    active
                      ? 'border-accent bg-bg-tertiary'
                      : 'border-border-primary hover:bg-bg-tertiary'
                  }`}
                  data-testid={`settings-language-${opt.value}`}
                >
                  <input
                    type="radio"
                    name="settings-language"
                    value={opt.value}
                    checked={active}
                    onChange={() => {
                      void handleChange(opt.value);
                    }}
                    className="mt-0.5"
                    aria-label={opt.label}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-text-tertiary">{opt.hint}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
