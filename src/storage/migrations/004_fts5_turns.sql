-- 004_fts5_turns.sql — FTS5 full-text search over turns 의 text content (v0.7.0 F-026).
-- Spec: ROADMAP.md (v0.7.0 chat search MVP)
--
-- 개요
-- ────────────
--   v0.6.0 까지는 누적된 대화를 다시 찾을 방법이 사이드바의 세션 제목 스크롤
--   뿐이었다. 본 migration 은 turns 안의 사람-가독 텍스트만 추출해 FTS5
--   가상 테이블에 인덱싱한다. UI 의 사이드바 검색 입력 (`메시지 검색…`) 이
--   `turns_fts MATCH ?` 으로 BM25-ranked 결과 + snippet 을 즉시 보여준다.
--
--   - **Standalone (non-contentless) table** — UNINDEXED auxiliary columns
--     (turn_id / session_id / role) 을 retrieval 시 그대로 읽으려면 contentless
--     모드 (`content=''`) 를 쓸 수 없다 (그 모드에선 UNINDEXED 컬럼 SELECT 가
--     NULL 반환). 따라서 본 테이블은 standalone — body 텍스트가 한 번 더
--     FTS5 내부에 저장된다 (전체 turns 본문의 ~2배 storage). 트레이드오프:
--     단순한 SELECT 가 가능하고, sync 도 trigger 대신 JS 측 명시적 INSERT/
--     DELETE 만으로 충분 (단일 진실의 원천 = `extractTurnText`).
--   - **Tokenizer**: `unicode61 remove_diacritics 1` — 영문/유럽어 친화 +
--     한국어는 character-level fallback 으로 `안녕` 같은 부분 일치도 동작.
--     향후 `simple` 또는 trigram 추가 검토 가능 (현재는 MVP 트레이드오프).
--   - **UNINDEXED 컬럼**: turn_id / session_id / role 은 결과 매핑/필터용
--     (검색 자체에 사용 X). body 만 인덱스되어 storage 부담 최소화.
--   - **Snippet API**: `snippet(turns_fts, 3, '<mark>', '</mark>', '…', 24)`
--     로 매칭 위치를 markup. UI 가 split('<mark>') 로 안전하게 React 스팬 렌더.
--
-- INV-1: turns_fts 의 모든 row 는 turns 테이블의 row 와 1:1 (또는 0:1 — body
--        가 비어있을 경우 인덱스 스킵). orphan FTS row 는 허용 X.
-- INV-2: turns_fts 는 append-only 가 아니라 mutable — clearTurns / deleteSession
--        시 같은 트랜잭션에서 DELETE.
-- INV-3: FTS5 가 빌드에 누락되어 CREATE 가 실패해도 migration 은 통과해야 한다
--        (최소 LIKE fallback). 따라서 SessionStore 가 startup 시 turns_fts 의
--        존재 여부를 sqlite_master 로 확인하고, 없으면 LIKE 경로를 사용.

CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts USING fts5(
    turn_id UNINDEXED,
    session_id UNINDEXED,
    role UNINDEXED,
    body,
    tokenize='unicode61 remove_diacritics 1'
);
