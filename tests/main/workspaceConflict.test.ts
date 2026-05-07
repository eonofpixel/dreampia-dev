/**
 * workspaceConflict — v1.0.13 META-4 + v1.0.14 hotfix contract.
 *
 * 검증 대상:
 *  - 정확 일치 (exact) — Codex 4a 차단.
 *  - userData 의 자식 (child) — DB 노출 위험.
 *  - userData 의 부모 (parent) — DB 가 작업 폴더 안.
 *  - 무관계 → null (안전).
 *  - Windows: case-insensitive.
 *  - Trailing separator / 형식 다양성.
 *
 * Codex 의 v1.0.14 hotfix blind spot — saved settings 우회 — 본 함수 자체는
 * pure 라 단위 테스트로 검증 가능.
 */

import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkUserDataConflict,
  classifyUserDataConflict,
} from '../../src/main/workspaceConflict';

describe('checkUserDataConflict — POSIX', () => {
  // Force POSIX 으로 보이도록 platform 검사 우회 — 본 모듈은 process.platform
  // 분기를 갖지만 path.resolve 의 구분자는 OS 의존. Linux/macOS CI 에서 직접
  // 검증.
  //
  // CI 안정성: `/home/u/.dreampia` 같은 path 의 일부 prefix (`/home`) 가
  // 실제 존재 여부에 따라 realpath 가 다르게 정규화 — macOS 의 autofs 매핑
  // (`/home` → `/System/Volumes/Data/...`) 등 환경 의존. test 는 lexical
  // 비교만 검증하므로 모든 prefix 가 미존재인 path 를 사용 — realpath fail →
  // 일관된 lexical fallback.
  const isWin = process.platform === 'win32';
  const POSIX_UD = '/nonexistent-dreampia-test/u/.dreampia';
  const WIN_UD = 'Q:\\nonexistent-dreampia-test\\u\\AppData\\Roaming\\Dreampia-Dev';

  it('정확 일치 → 차단', () => {
    const root = isWin ? WIN_UD : POSIX_UD;
    expect(checkUserDataConflict(root, root)).not.toBeNull();
    expect(classifyUserDataConflict(root, root)).toBe('exact');
  });

  it('child 관계 (picked 가 userData 안) → 차단', () => {
    const ud = isWin ? WIN_UD : POSIX_UD;
    const picked = path.join(ud, 'sub', 'workspace');
    expect(classifyUserDataConflict(picked, ud)).toBe('child');
  });

  it('parent 관계 (picked 가 userData 의 부모) → 차단', () => {
    const ud = isWin ? WIN_UD : POSIX_UD;
    const picked = path.dirname(path.dirname(ud));
    expect(classifyUserDataConflict(picked, ud)).toBe('parent');
  });

  it('무관 폴더 → null', () => {
    const ud = isWin ? WIN_UD : POSIX_UD;
    const picked = isWin
      ? 'Q:\\nonexistent-dreampia-test\\dev\\my-project'
      : '/nonexistent-dreampia-test/u/projects/my-project';
    expect(checkUserDataConflict(picked, ud)).toBeNull();
    expect(classifyUserDataConflict(picked, ud)).toBeNull();
  });

  it('sibling (같은 부모 다른 자식) → null', () => {
    const ud = isWin
      ? WIN_UD
      : '/nonexistent-dreampia-test/u/Library/Application Support/Dreampia-Dev';
    const sibling = path.join(path.dirname(ud), 'OtherApp');
    expect(classifyUserDataConflict(sibling, ud)).toBeNull();
  });
});

describe('checkUserDataConflict — Windows case-insensitive', () => {
  it.runIf(process.platform === 'win32')('대소문자 다른 같은 path → 차단', () => {
    const ud = 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev';
    const sameButLower = ud.toLowerCase();
    const sameButUpper = ud.toUpperCase();
    expect(classifyUserDataConflict(sameButLower, ud)).toBe('exact');
    expect(classifyUserDataConflict(sameButUpper, ud)).toBe('exact');
  });

  it.runIf(process.platform === 'win32')('대소문자 다른 child → 차단', () => {
    const ud = 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev';
    const childLower = `${ud.toLowerCase()}\\workspace`;
    expect(classifyUserDataConflict(childLower, ud)).toBe('child');
  });
});

describe('checkUserDataConflict — boundary safety', () => {
  it('prefix 만 같은 다른 폴더 → null (substring 우회 방지)', () => {
    // 'Dreampia-Dev' vs 'Dreampia-Dev-Old' — 단순 startsWith 으로 child 처리
    // 되면 안 됨. 본 구현은 path.sep 까지 매칭해 안전.
    const ud =
      process.platform === 'win32'
        ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev'
        : '/home/u/.dreampia';
    const evil =
      process.platform === 'win32'
        ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev-Old'
        : '/home/u/.dreampia-old';
    expect(classifyUserDataConflict(evil, ud)).toBeNull();
  });

  it('빈 path → null (또는 무관) — 방어', () => {
    const ud =
      process.platform === 'win32'
        ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev'
        : '/home/u/.dreampia';
    // path.resolve('') 는 process.cwd() — 실제 동작 검증.
    const result = classifyUserDataConflict('', ud);
    // process.cwd() 가 실행 환경에 따라 ud 일 수도 child 일 수도. 결정성 위해
    // 단순히 null 또는 정의된 enum 만 확인.
    expect(['exact', 'child', 'parent', null].includes(result)).toBe(true);
  });

  it('checkUserDataConflict + classifyUserDataConflict 가 일관', () => {
    const ud =
      process.platform === 'win32' ? 'C:\\Test\\App' : '/test/app';
    const cases = [
      ud,
      path.join(ud, 'inside'),
      path.dirname(ud),
      path.join('/elsewhere', 'unrelated'),
    ];
    for (const picked of cases) {
      const msg = checkUserDataConflict(picked, ud);
      const kind = classifyUserDataConflict(picked, ud);
      // null ↔ null, non-null ↔ non-null.
      expect(msg === null).toBe(kind === null);
    }
  });
});

describe('Codex blind spot regression — saved settings 우회', () => {
  it('settings.workspace_root 가 userData 정확 일치 → 차단', () => {
    // 시나리오: 사용자가 v1.0.12 이하에서 실수로 userData 를 workspace 로
    // 저장. v1.0.13 의 picker-only 차단으로는 부팅 시 그대로 사용됨.
    // v1.0.14 의 재검증이 이걸 잡아야 함.
    const ud =
      process.platform === 'win32'
        ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev'
        : '/home/u/.config/Dreampia-Dev';
    const savedRoot = ud; // settings.json 에 이렇게 저장돼있다고 가정.
    const conflict = classifyUserDataConflict(savedRoot, ud);
    expect(conflict).toBe('exact');
    // ipc 의 app:get-default-workspace / workspace/get 가 이 결과 보면 null
    // 반환해야 함 — 그건 별도 IPC 단위/통합 테스트.
  });

  it('수동 settings 편집으로 child 폴더 저장 → 차단', () => {
    const ud =
      process.platform === 'win32'
        ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev'
        : '/home/u/.config/Dreampia-Dev';
    const evilSaved = path.join(ud, 'workspace-trick');
    expect(classifyUserDataConflict(evilSaved, ud)).toBe('child');
  });
});

// __resetSettingsCache 는 main/settings.ts — 본 테스트는 pure 함수만.
void vi;

// ────────────────────────────────────────────────────────────
// v1.0.15 (Codex Q6): symlink / junction / long-path bypass 차단
//
// 진짜 fs realpath 호출이 필요해 통합-style 테스트. tmpdir 에 실제 폴더 +
// symlink 생성 후 검사. Windows 의 symlink 는 admin 권한 필요라 platform
// 검사 후 skip.
// ────────────────────────────────────────────────────────────

describe('v1.0.15 — realpath bypass 차단 (Codex Q6)', () => {
  it('symlink 가 userData 를 가리키면 차단 (정확 일치)', () => {
    // POSIX 또는 Windows admin 만 symlink 생성 가능. Windows non-admin 은 skip.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'wc-realpath-'));
    const fakeUd = join(tmpRoot, 'userData');
    mkdirSync(fakeUd, { recursive: true });
    const linkPath = join(tmpRoot, 'evil-link');

    let symlinkOk = true;
    try {
      symlinkSync(fakeUd, linkPath, 'dir');
    } catch {
      symlinkOk = false;
    }

    try {
      if (!symlinkOk) {
        // Windows non-admin — symlink 못 만들면 검증 skip (사용자도 못 만듦
        // → 우회 자체 불가능).
        return;
      }
      // 사용자가 symlink 를 workspace 로 picked. lexical 로는 다른 path 지만
      // realpath 정규화로 정확 일치 → 'exact' 차단되어야 함 (v1.0.15).
      const kind = classifyUserDataConflict(linkPath, fakeUd);
      expect(kind).toBe('exact');

      // 차단 메시지도 함께 검증.
      const msg = checkUserDataConflict(linkPath, fakeUd);
      expect(msg).not.toBeNull();
      expect(msg ?? '').toContain('정확히 같');
    } finally {
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('symlink 가 userData 의 자식을 가리키면 child 로 차단', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'wc-realpath-'));
    const fakeUd = join(tmpRoot, 'userData');
    const childInside = join(fakeUd, 'inside');
    mkdirSync(childInside, { recursive: true });
    const linkPath = join(tmpRoot, 'sneaky-link');

    let symlinkOk = true;
    try {
      symlinkSync(childInside, linkPath, 'dir');
    } catch {
      symlinkOk = false;
    }

    try {
      if (!symlinkOk) return;
      // sneaky-link → userData/inside (자식). realpath 거치면 child 로 분류.
      expect(classifyUserDataConflict(linkPath, fakeUd)).toBe('child');
    } finally {
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it.runIf(process.platform === 'win32')(
    '`\\\\?\\` long-path prefix 가 같은 path 를 가리켜도 차단',
    () => {
      // Windows 만. `\\?\C:\foo` 는 lexical 로는 `C:\foo` 와 다르지만 같은 path.
      // 실제 파일이 없어도 prefix strip 로직은 동작 — realpath 실패 fallback
      // 에서 stripLongPathPrefix 가 적용됨.
      const ud = 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev';
      const longPathPicked = `\\\\?\\${ud}`;
      // realpath 실패 (path 미존재) 시 fallback 의 lexical 비교 — strip 후
      // 같은 lower-cased path → exact.
      expect(classifyUserDataConflict(longPathPicked, ud)).toBe('exact');
    }
  );

  it('미존재 path 는 lexical fallback (회귀 0)', () => {
    // realpath 실패 → lexical resolve fallback. 기존 동작 유지.
    const ud =
      process.platform === 'win32'
        ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev'
        : '/home/u/.config/Dreampia-Dev';
    const evil = ud; // 둘 다 존재 X — lexical 만으로도 잡혀야 함.
    expect(classifyUserDataConflict(evil, ud)).toBe('exact');
  });
});
