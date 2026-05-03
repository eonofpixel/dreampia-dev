#!/usr/bin/env node
/**
 * dreampia-diagnose — 사용자 자가 진단 CLI.
 *
 * 사용:
 *   npm run diagnose
 *   node scripts/dreampia-diagnose.cjs
 *   node scripts/dreampia-diagnose.cjs --json    # CI 친화적 JSON 출력
 *
 * 검사 항목 (v0.14.0 A ABI Hardening):
 *   - Platform / Arch
 *   - Node version (>= 22)
 *   - Electron version (devDependencies 의 spec)
 *   - better-sqlite3 binding 존재 / 경로 / 크기
 *   - Binding 의 ABI ('node' / 'electron' / 'unknown')
 *   - Cache 상태 (.ensure-abi-state.json)
 *
 * 출력 포맷:
 *   기본: 사람이 읽기 좋은 컬러 (or 컬러 없는 plain) 텍스트.
 *   --json: 머신-파싱 가능한 JSON. CI / 자동화에서 사용.
 *
 * Exit code:
 *   0 — 모든 검사 OK
 *   1 — 한 개 이상 실패 (사용자가 fix 해야 함)
 */
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const projectRoot = join(__dirname, '..');
const useJson = process.argv.includes('--json');
const useColor = !useJson && process.stdout.isTTY === true;

function color(code, text) {
  if (!useColor) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (t) => color('32', t);
const red = (t) => color('31', t);
const yellow = (t) => color('33', t);
const dim = (t) => color('2', t);
const bold = (t) => color('1', t);

const checks = [];

function addCheck(name, ok, value, hint) {
  checks.push({ name, ok, value, ...(hint !== undefined && { hint }) });
}

// ────────────────────────────────────────────────────────────
// Collect diagnostics
// ────────────────────────────────────────────────────────────

function collect() {
  // Platform / Arch — informational only, never fails.
  addCheck('platform', true, `${os.platform()} ${os.release()} ${os.arch()}`);

  // Node version — must be >= 22 (engines.node spec).
  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split('.')[0]);
  addCheck(
    'node_version',
    nodeMajor >= 22,
    nodeVersion,
    nodeMajor < 22 ? 'Node 22+ 필요. nvm/volta 등으로 업그레이드.' : undefined
  );

  // Electron version — read from package.json devDependencies.
  let electronSpec = '';
  let electronMajor = null;
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    electronSpec = (pkg.devDependencies ?? {}).electron ?? '';
    const m = electronSpec.match(/(\d+)/);
    electronMajor = m ? Number(m[1]) : null;
  } catch {
    // ignore — addCheck 에서 ok=false 처리.
  }
  addCheck(
    'electron_version',
    electronMajor !== null && electronMajor >= 33,
    electronSpec,
    electronMajor === null ? 'package.json 에서 electron 못 찾음' : undefined
  );

  // better-sqlite3 binding 존재 검사.
  const bindingPath = join(
    projectRoot,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  );
  const bindingExists = existsSync(bindingPath);
  addCheck(
    'binding_exists',
    bindingExists,
    bindingPath,
    bindingExists ? undefined : '`npm install` 후 다시 시도하세요'
  );

  if (bindingExists) {
    try {
      const stat = statSync(bindingPath);
      addCheck(
        'binding_size',
        stat.size > 0,
        `${(stat.size / 1024).toFixed(0)} KB`,
        stat.size === 0 ? 'binding 이 0 byte — `npm run dev:rebuild` 실행' : undefined
      );
    } catch {
      addCheck('binding_size', false, '(stat 실패)', '권한 확인');
    }

    // Binding 의 ABI 확인 (child process — Windows lock 회피).
    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(bindingPath)})`],
      { encoding: 'utf8', windowsHide: true }
    );
    let abi = 'unknown';
    let abiHint;
    if (result.status === 0) {
      abi = 'node';
    } else {
      const errOut = String(result.stderr || '');
      if (/NODE_MODULE_VERSION/.test(errOut)) {
        abi = 'electron';
        // 이건 사실 OK — Electron 에서 require 할 땐 동작. CLI 진단은 Node 라
        // require 가 fail 했을 뿐. dev/test 흐름이 아니라면 의도된 상태.
      }
    }

    // dev (Electron) 컨텍스트면 'electron' OK, test (Node) 컨텍스트면 'node' OK.
    // 진단 도구는 Node 로 동작하니 'node' 가 ideal — 'electron' 도 not-fatal.
    const abiOk = abi === 'node' || abi === 'electron';
    if (abi === 'unknown') {
      abiHint = 'binding 손상 가능 — `npm run dev:rebuild` 또는 `npm install`';
    } else if (abi === 'electron') {
      abiHint = 'Electron ABI 로 빌드됨 (dev 모드 정상). test 실행 시 자동 토글됨.';
    }
    addCheck('binding_abi', abiOk, abi, abiHint);
  }

  // Ensure-abi cache 상태 — 정보용.
  const cacheFile = join(projectRoot, '.ensure-abi-state.json');
  if (existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
      addCheck(
        'abi_cache',
        true,
        `target=${cache.target} verified=${cache.last_verified_at}`
      );
    } catch {
      addCheck('abi_cache', false, '(corrupt)', 'cache 파일 삭제 후 다시 시도');
    }
  } else {
    addCheck('abi_cache', true, '(absent — 첫 실행)');
  }
}

// ────────────────────────────────────────────────────────────
// Render
// ────────────────────────────────────────────────────────────

function render() {
  const allOk = checks.every((c) => c.ok);

  if (useJson) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: allOk,
          checks,
          generated_at: new Date().toISOString(),
        },
        null,
        2
      ) + '\n'
    );
    return allOk ? 0 : 1;
  }

  // Human-readable output.
  console.log(bold('  Dreampia-Dev Diagnose'));
  console.log('');
  for (const c of checks) {
    const icon = c.ok ? green('OK') : red('FAIL');
    console.log(`  [${icon}] ${c.name.padEnd(18)} ${dim(c.value)}`);
    if (!c.ok && c.hint !== undefined) {
      console.log(`         ${yellow('hint: ' + c.hint)}`);
    } else if (c.ok && c.hint !== undefined) {
      console.log(`         ${dim('note: ' + c.hint)}`);
    }
  }
  console.log('');
  if (allOk) {
    console.log(green('  All checks passed'));
  } else {
    console.log(red('  Some checks failed — fix hints 위에 표시됨'));
    console.log('');
    console.log('  추가 도움말:');
    console.log('    npm run dev:rebuild    — Electron ABI 로 native rebuild');
    console.log('    npm run test:rebuild   — Node ABI 로 native rebuild');
    console.log('    npm install            — 의존성 재설치 (postinstall 이 자동 rebuild)');
  }
  return allOk ? 0 : 1;
}

collect();
process.exit(render());
