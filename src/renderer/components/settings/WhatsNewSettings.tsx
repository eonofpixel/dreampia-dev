/**
 * WhatsNewSettings — Settings 모달의 "What's new" 탭 (v2.7.x sub-PR).
 *
 * 점수 결정 #5 의 직접 구현 — emoji 정리 + Code mode 도입을 사용자에게
 * 알리는 in-app changelog. CHANGELOG.md 의 raw 마크다운을 통째로 렌더하지
 * 않고, **curated highlight 만** TypeScript 상수로 관리해 다국어 / 길이 /
 * 마크다운 의존성 (XSS) 문제 없이 안정적.
 *
 * 새 release 가 있을 때마다 RELEASES 배열 상단에 entry 추가 — 시간 역순.
 *
 * Decision doc: ../../../../CODE_TAB_DECISION.md (#5 채택).
 */

import { Sparkles } from 'lucide-react';

import { useT } from '../../i18n';

interface ReleaseHighlightSpec {
  /** "v2.7.0" 형식의 시맨틱 버전 라벨. */
  version: string;
  /** ISO 8601 또는 사람이 읽기 좋은 짧은 날짜. */
  date: string;
  /** 한 줄 설명 — 헤딩 아래 노출. i18n 키 (locale-aware). */
  taglineKey: string;
  /** 강조 항목들 — 모두 i18n 키. 길이는 release 마다 다를 수 있음. */
  bulletKeys: ReadonlyArray<string>;
}

// 새 release 가 있을 때마다 RELEASES 배열 상단에 entry 추가, 동시에
// messages.{ko,en}.json 에 동일 key 쌍 추가. 점 (`.`) 은 JSON key 안에서
// nested path 로 보일 뿐 — 실제 lookup 은 단일 key 그대로.
const RELEASES: ReadonlyArray<ReleaseHighlightSpec> = [
  {
    version: 'v2.8.0',
    date: '2026-05-11',
    taglineKey: 'settings.whats_new.v280.tagline',
    bulletKeys: [
      'settings.whats_new.v280.bullet_0',
      'settings.whats_new.v280.bullet_1',
      'settings.whats_new.v280.bullet_2',
      'settings.whats_new.v280.bullet_3',
      'settings.whats_new.v280.bullet_4',
    ],
  },
  {
    version: 'v2.7.0',
    date: '2026-05-10',
    taglineKey: 'settings.whats_new.v270.tagline',
    bulletKeys: [
      'settings.whats_new.v270.bullet_0',
      'settings.whats_new.v270.bullet_1',
      'settings.whats_new.v270.bullet_2',
      'settings.whats_new.v270.bullet_3',
      'settings.whats_new.v270.bullet_4',
      'settings.whats_new.v270.bullet_5',
    ],
  },
  {
    version: 'v2.4.1',
    date: '2026-05-10',
    taglineKey: 'settings.whats_new.v241.tagline',
    bulletKeys: [
      'settings.whats_new.v241.bullet_0',
      'settings.whats_new.v241.bullet_1',
      'settings.whats_new.v241.bullet_2',
    ],
  },
];

export function WhatsNewSettings(): React.JSX.Element {
  const t = useT();
  return (
    <div
      className="flex-1 overflow-y-auto p-6"
      data-testid="settings-panel-whats_new-content"
    >
      <header className="mb-6 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="h-5 w-5 text-accent" />
        <h3 className="text-base font-semibold text-text-primary">
          {t('settings.whats_new.title')}
        </h3>
      </header>
      <ol className="space-y-6" data-testid="whats-new-release-list">
        {RELEASES.map((release) => (
          <li
            key={release.version}
            className="rounded-md border border-border-primary bg-bg-secondary p-4"
            data-testid={`whats-new-release-${release.version}`}
          >
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-text-primary">
                {release.version}
              </span>
              <span className="text-[11px] text-text-tertiary">{release.date}</span>
            </div>
            <p className="mb-2 text-sm text-text-secondary">{t(release.taglineKey)}</p>
            <ul className="space-y-1 text-xs text-text-secondary">
              {release.bulletKeys.map((bulletKey, idx) => (
                <li
                  key={bulletKey}
                  className="flex gap-2"
                  data-testid={`whats-new-bullet-${release.version}-${idx}`}
                >
                  <span aria-hidden className="select-none text-text-tertiary">
                    —
                  </span>
                  <span>{t(bulletKey)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
