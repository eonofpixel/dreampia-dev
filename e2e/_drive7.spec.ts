/**
 * Agent drive spec — Round 7 (v1.0.9): SEC-1 path guard via IPC.
 *
 * Codex 검토에서 발견된 보안 hole — workspace/read-file 가 symlink 통과시
 * workspace 외부 파일 읽힘. v1.0.9 의 realpath check 가 잡는지 e2e 로 검증.
 *
 * vitest 환경 (Node ABI) 에선 better-sqlite3 binding 이 안 떠 unit test 가
 * local 에서 못 돔. e2e 는 Electron 환경이라 정상 작동.
 *
 * 출력: test-results/drive/r7-*.png + r7-*.json
 */

import { test, expect } from './fixtures';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

test.describe('drive r7 — SEC-1 path guard (v1.0.9)', () => {
  test('28 — workspace/read-file rejects symlink pointing outside workspace', async ({
    window,
    workspaceDir,
  }) => {
    // 외부 폴더 + secret 파일 + workspace 안에 symlink 배치.
    const externalDir = join(tmpdir(), 'sec1-r7-external-' + Date.now());
    mkdirSync(externalDir, { recursive: true });
    const secretFile = join(externalDir, 'secret.txt');
    writeFileSync(secretFile, 'TOP-SECRET-EXTERNAL', 'utf-8');

    // v1.0.14: workspace_root 는 userDataDir 와 분리된 workspaceDir 사용.
    const workspaceRoot = workspaceDir;

    const linkPath = join(workspaceRoot, 'evil-link.txt');
    let symlinkOk = true;
    try {
      symlinkSync(secretFile, linkPath, 'file');
    } catch {
      // Windows non-admin 환경 — symlink 생성 권한 X. test 자체가 의미 없음
      // (공격자도 권한 없음). skip 처리.
      symlinkOk = false;
    }
    if (!symlinkOk) {
      console.warn('symlink creation requires admin on Windows — test skipped');
      return;
    }

    // workspace/read-file IPC 직접 호출 (renderer 의 dreampia.workspace.readFile).
    const result = await window.evaluate(async (root) => {
      const w = window as unknown as {
        dreampia?: {
          workspace?: {
            readFile: (args: {
              workspace_root: string;
              rel_path: string;
            }) => Promise<{ ok: boolean; error?: string; value?: { content: string } }>;
          };
        };
      };
      if (w.dreampia?.workspace?.readFile === undefined) {
        return { ok: false as const, error: 'IPC not available' };
      }
      return w.dreampia.workspace.readFile({
        workspace_root: root,
        rel_path: 'evil-link.txt',
      });
    }, workspaceRoot);

    // v1.0.9 의 realpath check 가 reject 해야 함.
    // 이전 v1.0.8 까지는 ok=true 로 'TOP-SECRET-EXTERNAL' 가 흘러나옴.
    expect(result.ok).toBe(false);
    if (typeof result.error === 'string') {
      expect(result.error).toMatch(/path traversal/);
      // symlink 가 외부를 가리킨다는 걸 메시지로 표현해야 함.
      expect(result.error).toMatch(/symlink|outside/i);
    }
  });

  test('29 — workspace/read-file allows normal in-workspace file (positive control)', async ({
    window,
    workspaceDir,
  }) => {
    // v1.0.14: workspace 는 userDataDir 와 분리된 별도 폴더.
    const workspaceRoot = workspaceDir;

    // 정상 파일 생성 후 read.
    const normalFile = join(workspaceRoot, 'normal.txt');
    writeFileSync(normalFile, 'normal-content', 'utf-8');

    const result = await window.evaluate(async (root) => {
      const w = window as unknown as {
        dreampia?: {
          workspace?: {
            readFile: (args: {
              workspace_root: string;
              rel_path: string;
            }) => Promise<{ ok: boolean; error?: string; value?: { content: string } }>;
          };
        };
      };
      if (w.dreampia?.workspace?.readFile === undefined) {
        return { ok: false as const, error: 'IPC not available' };
      }
      return w.dreampia.workspace.readFile({
        workspace_root: root,
        rel_path: 'normal.txt',
      });
    }, workspaceRoot);

    expect(result.ok).toBe(true);
    if (result.ok && result.value !== undefined) {
      expect(result.value.content).toBe('normal-content');
    }
  });
});
