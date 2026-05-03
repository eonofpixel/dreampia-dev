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
 * v0.14.0 — A ABI Hardening:
 *   - state cache (.ensure-abi-state.json) 에 마지막 성공 토글 메타데이터
 *     기록 → 두 번째 호출은 cache hit 으로 즉시 종료.
 *   - cache 키: target + Electron major + Node major + better-sqlite3 mtime.
 *     이 중 하나라도 바뀌면 invalidate 후 재검증.
 *   - rebuild 실패 시 사용자 친화적 hint 출력 (npm run diagnose 안내).
 *
 * Windows 주의:
 *   ABI 검증 시 .node binary 를 직접 require() 하면 Windows 가 파일 lock 을
 *   걸어버려서 후속 rebuild 시 EPERM (unlink 불가). → 검증은 child process
 *   에서 수행하고 즉시 종료시켜야 lock 해제됨.
 *
 * Spec: docs/release.md (better-sqlite3 ABI 토글 자동화)
 */
const { execSync, spawnSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

const target = process.argv[2];
if (!['electron', 'node'].includes(target)) {
  console.error('Usage: ensure-abi.cjs <electron|node>');
  process.exit(2);
}

const projectRoot = join(__dirname, '..');

const bindingPath = join(
  projectRoot,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

const stateFilePath = join(projectRoot, '.ensure-abi-state.json');

/**
 * Read major version of Electron from package.json (devDependencies).
 * better-sqlite3 의 Electron-targeted ABI 는 Electron major 에 강하게 결합돼
 * 있어서, Electron major 가 달라지면 cache 를 invalidate 해야 한다.
 */
function readPackageVersions() {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const dev = pkg.devDependencies ?? {};
    const dep = pkg.dependencies ?? {};
    const electronSpec = dev.electron ?? '';
    const sqliteSpec = dep['better-sqlite3'] ?? '';
    return {
      electronMajor: parseMajor(electronSpec),
      sqliteSpec, // 캐시 키에만 사용 — semver 변동도 invalidate.
    };
  } catch {
    return { electronMajor: null, sqliteSpec: '' };
  }
}

function parseMajor(spec) {
  // "^33.0.0" / "33.0.0" / "~33.1.2" → 33
  const m = String(spec).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function readBindingMtime() {
  if (!existsSync(bindingPath)) return null;
  try {
    return statSync(bindingPath).mtimeMs;
  } catch {
    return null;
  }
}

function readStateCache() {
  if (!existsSync(stateFilePath)) return null;
  try {
    const raw = readFileSync(stateFilePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // Corrupt JSON → discard. 다음 성공 시 overwrite.
    return null;
  }
}

function writeStateCache(state) {
  try {
    writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
  } catch (err) {
    // Cache 쓰기 실패는 fatal 아님 — 다음 호출에서 다시 검증할 뿐.
    console.warn('[ensure-abi] cache write failed (non-fatal):', err.message);
  }
}

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

const versions = readPackageVersions();
const bindingMtime = readBindingMtime();
const cache = readStateCache();

// Cache hit: 이전 토글이 동일 (target, Electron major, Node major, binding mtime)
// 으로 성공했으면 ABI 재검증 (child process spawn) 도 생략한다.
// 약 100-300ms 절약.
if (
  cache &&
  cache.target === target &&
  cache.electron_major === versions.electronMajor &&
  cache.node_major === Number(process.versions.node.split('.')[0]) &&
  cache.sqlite_spec === versions.sqliteSpec &&
  cache.binding_mtime === bindingMtime &&
  bindingMtime !== null
) {
  console.log(`[ensure-abi] cache hit — already ${target} (skipped verification)`);
  process.exit(0);
}

const current = getCurrentAbi();
console.log(`[ensure-abi] current=${current} target=${target}`);

if (current === target) {
  console.log('[ensure-abi] already matched — skip rebuild');
  // Cache 갱신: 다음 호출에서 child spawn 도 skip.
  writeStateCache({
    target,
    electron_major: versions.electronMajor,
    node_major: Number(process.versions.node.split('.')[0]),
    sqlite_spec: versions.sqliteSpec,
    binding_mtime: readBindingMtime(),
    last_verified_at: new Date().toISOString(),
  });
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
  // Rebuild 성공 후 binding mtime 이 바뀌었을 테니 다시 읽어서 cache 갱신.
  writeStateCache({
    target,
    electron_major: versions.electronMajor,
    node_major: Number(process.versions.node.split('.')[0]),
    sqlite_spec: versions.sqliteSpec,
    binding_mtime: readBindingMtime(),
    last_verified_at: new Date().toISOString(),
  });
} catch (err) {
  console.error('[ensure-abi] rebuild failed:', err.message);
  console.error('');
  console.error('  진단 가이드:');
  console.error('    1. npm run diagnose          — 자가 진단 출력');
  console.error('    2. npm run dev:rebuild       — Electron ABI 수동 rebuild');
  console.error('    3. npm run test:rebuild      — Node   ABI 수동 rebuild');
  console.error('    4. node-gyp 가 누락이면 https://github.com/nodejs/node-gyp 참조');
  console.error('');
  process.exit(1);
}
