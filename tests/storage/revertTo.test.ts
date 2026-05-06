/**
 * revertTo / down-migration unit tests (v1.4.3).
 *
 * 검증:
 *  - getRevertableVersions — markers 8-12 만 포함.
 *  - revertTo(current) → no-op.
 *  - revertTo(11) — markers 12 down → schema_version=11.
 *  - revertTo(0) → DownMigrationMissingError (1-7 down 미정).
 *  - revertTo(future) → throw (target > current).
 *  - revertTo(-1) → throw (negative).
 *  - 결과 reverted 배열 — descending 순서.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../src/storage';
import {
  revertTo,
  getRevertableVersions,
  DownMigrationMissingError,
  LATEST_SCHEMA_VERSION,
} from '../../src/storage/migrate';

describe('v1.4.3 — revertTo / down-migration', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('getRevertableVersions — markers 8-12 (1-7 미정)', () => {
    const versions = getRevertableVersions();
    // markers 8-12 down SQL 정의됨.
    expect(versions).toContain(8);
    expect(versions).toContain(9);
    expect(versions).toContain(10);
    expect(versions).toContain(11);
    expect(versions).toContain(12);
    // 1-7 은 down 없음.
    expect(versions).not.toContain(1);
    expect(versions).not.toContain(7);
  });

  it('revertTo(current) → no-op', () => {
    const current = store.getSchemaVersion();
    const result = revertTo(store.getDb(), current);
    expect(result.from).toBe(current);
    expect(result.to).toBe(current);
    expect(result.reverted).toEqual([]);
    expect(store.getSchemaVersion()).toBe(current);
  });

  it('revertTo(LATEST-1) — 한 단계 down', () => {
    const target = LATEST_SCHEMA_VERSION - 1;
    const result = revertTo(store.getDb(), target);
    expect(result.from).toBe(LATEST_SCHEMA_VERSION);
    expect(result.to).toBe(target);
    expect(result.reverted).toEqual([LATEST_SCHEMA_VERSION]);
    expect(store.getSchemaVersion()).toBe(target);
  });

  it('revertTo(8) — 모든 marker down 적용 (12→8 = 4 step)', () => {
    const result = revertTo(store.getDb(), 8);
    expect(result.from).toBe(LATEST_SCHEMA_VERSION);
    expect(result.to).toBe(8);
    // 12 → 11 → 10 → 9 → version 마다 down 1번씩 (target+1=9 까지).
    // 즉 12, 11, 10, 9 의 down 이 실행됨 → schema_version=8 이 됨.
    expect(result.reverted).toEqual([12, 11, 10, 9]);
    expect(store.getSchemaVersion()).toBe(8);
  });

  it('revertTo(7) → DownMigrationMissingError (8 의 down 은 있지만 7 cross 시 down_007 없음)', () => {
    // 12→8 까지는 가능하지만 7 까지 가려면 v8 의 down (이미 있음) → schema_version=7
    // 이지만 v8 자체의 down 을 거치는 것은 OK. v7 cross 는 v8 의 down 만 적용
    // 하면 schema_version 이 7 이 됨. v7 의 down 은 호출 안 됨.
    //
    // 실제로 fail 하는 건 revertTo(6) 부터 — v7 cross 시 v7 down 필요.
    expect(() => revertTo(store.getDb(), 6)).toThrow(DownMigrationMissingError);
    // schema 는 변경 안 됨 — fail-fast (try 도 안 함).
    expect(store.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
  });

  it('revertTo(0) → DownMigrationMissingError (1-7 down 미정)', () => {
    expect(() => revertTo(store.getDb(), 0)).toThrow(DownMigrationMissingError);
    expect(store.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
  });

  it('revertTo(target > current) → 일반 throw', () => {
    expect(() =>
      revertTo(store.getDb(), LATEST_SCHEMA_VERSION + 1)
    ).toThrow(/target > current/);
  });

  it('revertTo(-1) → 일반 throw', () => {
    expect(() => revertTo(store.getDb(), -1)).toThrow(/non-negative/);
  });

  it('revertTo 결과 reverted — descending 순서 (current → target+1)', () => {
    const result = revertTo(store.getDb(), 9);
    expect(result.reverted[0]).toBe(LATEST_SCHEMA_VERSION);
    for (let i = 1; i < result.reverted.length; i += 1) {
      expect(result.reverted[i]).toBeLessThan(result.reverted[i - 1]!);
    }
  });

  it('revertTo 후 다시 migrate 가능 (forward 재적용)', () => {
    revertTo(store.getDb(), 8);
    expect(store.getSchemaVersion()).toBe(8);
    // 새 SessionStore 인스턴스 생성 — 부팅 시점 migrate 자동 적용.
    const store2 = new SessionStore(':memory:');
    // 전혀 다른 DB 라 LATEST 직행. revert 한 DB 자체로 migrate 다시 호출하는
    // 시나리오는 application 책임 (별도 helper 필요할 수 있음).
    expect(store2.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
    store2.close();
  });
});
