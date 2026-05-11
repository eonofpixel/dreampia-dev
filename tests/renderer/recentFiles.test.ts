/**
 * recentFiles helper — 단위 테스트.
 *
 * v2.8.0 (Builder UX) — Code 모드 워크스페이스별 최근 파일 보관.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  loadRecentFiles,
  pushRecentFile,
  removeRecentFile,
  MAX_RECENTS,
} from '../../src/renderer/components/code/recentFiles';

describe('recentFiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('empty workspace 또는 빈 storage → 빈 배열 반환', () => {
    expect(loadRecentFiles('')).toEqual([]);
    expect(loadRecentFiles('/proj')).toEqual([]);
  });

  it('push 후 load 가 같은 entry 반환', () => {
    pushRecentFile('/proj', 'a.ts');
    expect(loadRecentFiles('/proj')).toEqual(['a.ts']);
  });

  it('push 가 가장 최근 entry 를 head 로 둠', () => {
    pushRecentFile('/proj', 'a.ts');
    pushRecentFile('/proj', 'b.ts');
    pushRecentFile('/proj', 'c.ts');
    expect(loadRecentFiles('/proj')).toEqual(['c.ts', 'b.ts', 'a.ts']);
  });

  it('동일 entry 재push → dedup 후 head 이동', () => {
    pushRecentFile('/proj', 'a.ts');
    pushRecentFile('/proj', 'b.ts');
    pushRecentFile('/proj', 'a.ts');
    expect(loadRecentFiles('/proj')).toEqual(['a.ts', 'b.ts']);
  });

  it('MAX_RECENTS 초과 시 가장 오래된 entry 가 잘림', () => {
    for (let i = 0; i < MAX_RECENTS + 3; i++) {
      pushRecentFile('/proj', `f${i}.ts`);
    }
    const result = loadRecentFiles('/proj');
    expect(result).toHaveLength(MAX_RECENTS);
    // f7 부터 f3 까지 (최근 5개) — f0, f1, f2 는 잘림.
    expect(result[0]).toBe(`f${MAX_RECENTS + 2}.ts`);
    expect(result[result.length - 1]).toBe(`f3.ts`);
  });

  it('워크스페이스별로 분리되어 저장됨', () => {
    pushRecentFile('/proj-a', 'a.ts');
    pushRecentFile('/proj-b', 'b.ts');
    expect(loadRecentFiles('/proj-a')).toEqual(['a.ts']);
    expect(loadRecentFiles('/proj-b')).toEqual(['b.ts']);
  });

  it('removeRecentFile 가 entry 만 제거', () => {
    pushRecentFile('/proj', 'a.ts');
    pushRecentFile('/proj', 'b.ts');
    pushRecentFile('/proj', 'c.ts');
    removeRecentFile('/proj', 'b.ts');
    expect(loadRecentFiles('/proj')).toEqual(['c.ts', 'a.ts']);
  });

  it('removeRecentFile 가 없는 entry 면 변화 없음', () => {
    pushRecentFile('/proj', 'a.ts');
    removeRecentFile('/proj', 'gone.ts');
    expect(loadRecentFiles('/proj')).toEqual(['a.ts']);
  });

  it('손상된 storage value → 빈 배열로 안전 fallback', () => {
    localStorage.setItem('dreampia.codeMode.recentFiles./proj', 'not-json');
    expect(loadRecentFiles('/proj')).toEqual([]);
  });

  it('load 시 storage 의 비-string 항목과 빈 string 은 걸러짐', () => {
    localStorage.setItem(
      'dreampia.codeMode.recentFiles./proj',
      JSON.stringify(['a.ts', 42, '', null, 'b.ts'])
    );
    expect(loadRecentFiles('/proj')).toEqual(['a.ts', 'b.ts']);
  });
});
