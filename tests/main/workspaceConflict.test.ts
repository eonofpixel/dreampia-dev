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
import {
  checkUserDataConflict,
  classifyUserDataConflict,
} from '../../src/main/workspaceConflict';

describe('checkUserDataConflict — POSIX', () => {
  // Force POSIX 으로 보이도록 platform 검사 우회 — 본 모듈은 process.platform
  // 분기를 갖지만 path.resolve 의 구분자는 OS 의존. Linux/macOS CI 에서 직접
  // 검증.
  const isWin = process.platform === 'win32';

  it('정확 일치 → 차단', () => {
    const root = isWin ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev' : '/home/u/.dreampia';
    expect(checkUserDataConflict(root, root)).not.toBeNull();
    expect(classifyUserDataConflict(root, root)).toBe('exact');
  });

  it('child 관계 (picked 가 userData 안) → 차단', () => {
    const ud = isWin ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev' : '/home/u/.dreampia';
    const picked = path.join(ud, 'sub', 'workspace');
    expect(classifyUserDataConflict(picked, ud)).toBe('child');
  });

  it('parent 관계 (picked 가 userData 의 부모) → 차단', () => {
    const ud = isWin ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev' : '/home/u/.dreampia';
    const picked = path.dirname(path.dirname(ud));
    expect(classifyUserDataConflict(picked, ud)).toBe('parent');
  });

  it('무관 폴더 → null', () => {
    const ud = isWin ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev' : '/home/u/.dreampia';
    const picked = isWin ? 'D:\\dev\\my-project' : '/home/u/projects/my-project';
    expect(checkUserDataConflict(picked, ud)).toBeNull();
    expect(classifyUserDataConflict(picked, ud)).toBeNull();
  });

  it('sibling (같은 부모 다른 자식) → null', () => {
    const ud = isWin
      ? 'C:\\Users\\u\\AppData\\Roaming\\Dreampia-Dev'
      : '/home/u/Library/Application Support/Dreampia-Dev';
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
