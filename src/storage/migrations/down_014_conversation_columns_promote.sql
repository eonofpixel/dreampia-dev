-- down_014_conversation_columns_promote.sql — v1.4.2 down.
-- 컬럼 제거. metadata_json._extra 데이터는 그대로 유지 (application 이 fallback).
--
-- SQLite ALTER TABLE DROP COLUMN 은 3.35+ (2021) 부터 지원 — better-sqlite3 12.x
-- 가 사용하는 SQLite 는 충분히 최신.

ALTER TABLE sessions DROP COLUMN current_mode;
ALTER TABLE sessions DROP COLUMN current_effort;
ALTER TABLE sessions DROP COLUMN current_model;
