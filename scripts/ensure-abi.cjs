#!/usr/bin/env node
/**
 * ensure-abi — better-sqlite3 native binary 가 요구된 ABI 와 일치하는지
 * 확인하고 다르면 rebuild. 일치하면 즉시 종료 (~50-200ms).
 *
 * 사용:
 *   node scripts/ensure-abi.cjs electron  # Electron ABI 강제
 *   node scripts/ensure-abi.cjs node      # Node ABI 강제
 *
 * 이유:
 *   - dev (Electron) 와 test (Node vitest) 가 서로 다른 NODE_MODULE_VERSION 을
 *     요구 → native module 매번 재컴파일 필요.
 *   - predev / pretest hook 으로 자동 보장 + smart skip 으로 매번 rebuild 회피.
 *
 * Windows 주의:
 *   ABI 검증 시 .node binary 를 직접 require() 하면 Windows 가 파일 lock 을
 *   걸어버려서 후속 rebuild 시 EPERM (unlink 불가). → 검증은 child process
 *   에서 수행하고 즉시 종료시켜야 lock 해제됨.
 *
 * Spec: docs/release.md (better-sqlite3 ABI 토글 자동화)
 */
const { execSync, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const target = process.argv[2];
if (!['electron', 'node'].includes(target)) {
  console.error('Usage: ensure-abi.cjs <electron|node>');
  process.exit(2);
}

const bindingPath = join(
  __dirname,
  '..',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

/**
 * better-sqlite3 binding 의 ABI 확인 (child process 에서).
 * - 자식 종료 코드 0 → 현재 Node 의 ABI 와 일치 (= 'node' ABI 컴파일)
 * - 자식 stderr 에 NODE_MODULE_VERSION → Electron ABI 컴파일됨
 * - 그 외 → 'unknown' (rebuild 강제)
 *
 * 자식 process 가 종료되면 Windows 의 파일 lock 도 해제됨 → 후속 rebuild 가능.
 */
function getCurrentAbi() {
  if (!existsSync(bindingPath)) return null;

  // 자식 process 에서 require — 검증 후 즉시 종료해 파일 lock 해제.
  const result = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(bindingPath)})`],
    {
      encoding: 'utf8',
      windowsHide: true,
    }
  );

  if (result.status === 0) {
    return 'node';
  }
  const errOut = String(result.stderr || '');
  if (/NODE_MODULE_VERSION/.test(errOut)) {
    return 'electron';
  }
  return 'unknown';
}

const current = getCurrentAbi();
console.log(`[ensure-abi] current=${current} target=${target}`);

if (current === target) {
  console.log('[ensure-abi] already matched — skip rebuild');
  process.exit(0);
}

console.log(`[ensure-abi] rebuilding for ${target} ABI...`);
// `npx --no-install` 사용 — local node_modules/.bin 의 electron-rebuild 호출.
// 직접 'electron-rebuild' 실행 시 PATH 의존성으로 실패 가능 (npm script 컨텍스트 외부).
// `npx --no-install` 은 이미 설치된 패키지만 사용 (인터넷 fetch 안 함).
const cmd =
  target === 'electron'
    ? 'npx --no-install electron-rebuild -f -w better-sqlite3'
    : 'npm rebuild better-sqlite3 --build-from-source';

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('[ensure-abi] done');
} catch (err) {
  console.error('[ensure-abi] rebuild failed:', err.message);
  process.exit(1);
}
