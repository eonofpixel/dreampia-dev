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

interface ReleaseHighlight {
  /** "v2.7.0" 형식의 시맨틱 버전 라벨. */
  version: string;
  /** ISO 8601 또는 사람이 읽기 좋은 짧은 날짜. */
  date: string;
  /** 한 줄 설명 — 헤딩 아래 노출. */
  tagline: string;
  /**
   * 강조 항목들. 마크다운 X — 단순 string[] 로 안전. 사용자 친화적 요약체로
   * 작성 (구현 디테일 X).
   */
  bullets: ReadonlyArray<string>;
}

const RELEASES: ReadonlyArray<ReleaseHighlight> = [
  {
    version: 'v2.7.0',
    date: '2026-05-10',
    tagline: '코드 모드: 편집 + 자동 저장 + 외부 변경 감지',
    bullets: [
      'Code 모드: 사이드바에서 [코드] 진입 → 우측 패널이 파일 트리 + 에디터로 전환',
      'CodeMirror 6 — 신택스 하이라이트 (TS/JS/JSON/HTML/CSS/MD/Python 등)',
      '편집 모드 ⇄ 보기 모드 토글 — Mod+S 로 저장, Mod+E 로 토글',
      '비교(Diff) 보기 — 디스크와 편집 중 내용 inline 비교',
      '외부 변경 감지 — 파일이 다른 곳에서 바뀌면 banner 알림',
      '마지막 열린 파일 자동 복원 (워크스페이스 별)',
    ],
  },
  {
    version: 'v2.4.1',
    date: '2026-05-10',
    tagline: '아이콘 통일 + 시각 일관성',
    bullets: [
      '이모지를 모두 제거하고 Lucide 아이콘으로 통일 (30+ 위치)',
      '토스트 / 배지 / 워크스페이스 / 권한 모달 / 온보딩 / 미리보기 전반',
      '재유입 차단 — 코드 리뷰 시점 자동 검증 lint 룰',
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
            <p className="mb-2 text-sm text-text-secondary">{release.tagline}</p>
            <ul className="space-y-1 text-xs text-text-secondary">
              {release.bullets.map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex gap-2"
                  data-testid={`whats-new-bullet-${release.version}-${idx}`}
                >
                  <span aria-hidden className="select-none text-text-tertiary">
                    —
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
