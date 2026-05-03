/**
 * SearchSection — Sidebar 내 메시지 전체 검색 입력 + 결과 리스트.
 *
 * v0.7.0 (F-026 Chat Search). v0.6.0 까지는 사이드바에 검색 placeholder 만
 * 있었지만, 이제 사용자가 누적된 모든 turn 의 텍스트를 즉시 검색 (FTS5 BM25)
 * 하고 결과를 클릭하면 해당 세션이 활성화되며 거기 turn 으로 스크롤된다.
 *
 * UX 결정:
 *   - 입력은 컨트롤드 (`query` 외부 state) — App.tsx 가 debounce 후
 *     실제 IPC 호출을 트리거한다 (300ms).
 *   - 결과 영역은 query 가 비어있을 땐 hidden, 그 외엔 max-h-64 + scroll.
 *   - snippet 은 `<mark>...</mark>` 마커를 split 후 React span 으로 렌더 —
 *     dangerouslySetInnerHTML 사용 X (XSS 방어).
 *   - Empty/loading/error 모든 상태가 한국어 메시지로 명시.
 */

import { Search } from 'lucide-react';

export interface SearchResultEntry {
  turn_id: string;
  session_id: string;
  role: string;
  snippet: string;
  rank: number;
  timestamp: string;
}

export interface SearchSectionProps {
  query: string;
  onQueryChange: (next: string) => void;
  results: ReadonlyArray<SearchResultEntry>;
  loading: boolean;
  error: string | null;
  onResultClick: (sessionId: string, turnId: string) => void;
  /**
   * Optional session-id → title map so each row can show which session a hit
   * belongs to. Caller (App.tsx) builds this from the same SessionMeta list
   * that drives the chat list above.
   */
  sessionTitleById?: ReadonlyMap<string, string>;
}

export function SearchSection({
  query,
  onQueryChange,
  results,
  loading,
  error,
  onResultClick,
  sessionTitleById,
}: SearchSectionProps): React.JSX.Element {
  const trimmed = query.trim();
  const showResults = trimmed.length > 0;

  return (
    <div className="space-y-1" data-testid="sidebar-search-section">
      <label className="relative block">
        <span className="sr-only">메시지 검색</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
          }}
          placeholder="메시지 검색…"
          aria-label="메시지 검색"
          data-testid="sidebar-search-input"
          className="w-full rounded-md border border-transparent bg-bg-tertiary py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-primary focus:outline-none"
        />
      </label>

      {showResults && (
        <div
          className="max-h-64 overflow-y-auto rounded-md border border-border-primary bg-bg-primary"
          role="region"
          aria-label="검색 결과"
          data-testid="sidebar-search-results"
        >
          {loading ? (
            <p className="px-3 py-2 text-xs text-text-tertiary" data-testid="sidebar-search-loading">
              검색 중...
            </p>
          ) : error !== null ? (
            <p
              className="px-3 py-2 text-xs text-red-400"
              role="alert"
              data-testid="sidebar-search-error"
            >
              검색 중 오류가 발생했습니다
            </p>
          ) : results.length === 0 ? (
            <p
              className="px-3 py-2 text-xs text-text-tertiary"
              data-testid="sidebar-search-empty"
            >
              검색 결과 없음
            </p>
          ) : (
            <ul className="divide-y divide-border-primary" role="listbox">
              {results.map((r) => (
                <li key={r.turn_id} role="option" aria-selected="false">
                  <button
                    type="button"
                    onClick={() => {
                      onResultClick(r.session_id, r.turn_id);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-bg-tertiary"
                    data-testid="sidebar-search-result"
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-text-tertiary">
                      <span className="truncate">
                        {sessionTitleById?.get(r.session_id) ?? '대화'}
                      </span>
                      <span className="shrink-0">
                        {r.role === 'user' ? '나' : r.role === 'assistant' ? 'AI' : r.role}
                      </span>
                    </span>
                    <SnippetText snippet={r.snippet} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * snippet 안의 `<mark>...</mark>` 토큰을 split 해 일반 span / 강조 span 을
 * 교차 렌더. innerHTML 우회로 XSS 방어 — turn 내용에 `<script>` 등이 들어와도
 * React 가 텍스트로 escape.
 */
function SnippetText({ snippet }: { snippet: string }): React.JSX.Element {
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  // Split on the literal `<mark>` / `</mark>` markers FTS5 emits.
  const regex = /<mark>([\s\S]*?)<\/mark>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(snippet)) !== null) {
    if (match.index > cursor) {
      parts.push({ text: snippet.slice(cursor, match.index), highlight: false });
    }
    parts.push({ text: match[1] ?? '', highlight: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < snippet.length) {
    parts.push({ text: snippet.slice(cursor), highlight: false });
  }

  return (
    <span className="block w-full truncate text-text-primary" data-testid="sidebar-search-snippet">
      {parts.map((p, i) =>
        p.highlight ? (
          <mark
            key={i}
            className="bg-yellow-500/30 text-text-primary"
            data-testid="sidebar-search-mark"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}
