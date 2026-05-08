#!/usr/bin/env node
/**
 * v2.1.0 (C2) — DB down migration CLI tool.
 *
 * Usage:
 *   npm run db:migrate-down -- <target_version> [--db <path>]
 *
 * Examples:
 *   npm run db:migrate-down -- 14            # roll back to schema v=14
 *   npm run db:migrate-down -- 14 --db ./my.sqlite
 *
 * Default DB path: app userData dir 의 sessions.sqlite (Electron app 와 동일).
 *   Windows: %APPDATA%/Dreampia-Dev/sessions.sqlite
 *   macOS:   ~/Library/Application Support/Dreampia-Dev/sessions.sqlite
 *   Linux:   ~/.config/Dreampia-Dev/sessions.sqlite
 *
 * Spec: docs/release-checklist.md (Phase C C2), docs/v2.x-roadmap.md.
 *
 * 본 스크립트는 production user 가 schema down-grade 가 필요할 때 사용.
 *  - 새 binary 가 schema 이전과 호환 안 되어 사용자가 이전 버전으로 돌릴 때
 *  - down migration 정의된 schema 만 가능 (현재 v=8 ~ v=16). v=1~7 은
 *    down 없음 — 그 이전으로 가려면 backup 복원 필요.
 *
 * 안전:
 *  - dry-run 미지원 (revertTo 가 transaction 안에서 atomic). 사용자는 backup
 *    먼저 권장.
 *  - target_version > current → no-op + warn.
 *  - target_version < lowest down 정의된 v → throw with backup 안내.
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function parseArgs(argv) {
  const args = argv.slice(2);
  let targetVersion;
  let dbPath;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--db') {
      dbPath = args[++i];
    } else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else if (/^\d+$/.test(a)) {
      targetVersion = parseInt(a, 10);
    } else {
      console.error(`[db-migrate-down] unknown arg: ${a}`);
      printUsage();
      process.exit(2);
    }
  }
  if (typeof targetVersion !== 'number') {
    console.error('[db-migrate-down] missing required <target_version>');
    printUsage();
    process.exit(2);
  }
  return { targetVersion, dbPath };
}

function printUsage() {
  console.log(`Usage:
  npm run db:migrate-down -- <target_version> [--db <path>]

Arguments:
  target_version   schema version 숫자 (예: 14)
  --db <path>      DB 파일 경로 override (default: app userData dir)

Examples:
  npm run db:migrate-down -- 14
  npm run db:migrate-down -- 8 --db ./mydb.sqlite

Spec: docs/release-checklist.md (Phase C C2)`);
}

function defaultDbPath() {
  const appName = 'Dreampia-Dev';
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, appName, 'sessions.sqlite');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, 'sessions.sqlite');
  }
  // Linux / others
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, appName, 'sessions.sqlite');
}

async function main() {
  const { targetVersion, dbPath: dbPathArg } = parseArgs(process.argv);
  const dbPath = dbPathArg || defaultDbPath();

  if (!fs.existsSync(dbPath)) {
    console.error(`[db-migrate-down] DB 파일이 없음: ${dbPath}`);
    console.error('  --db <path> 로 다른 경로 지정 가능');
    process.exit(1);
  }

  // dist/ 가 없으면 빌드 안내. revertTo 는 dist/main/migrate.js 에서 import.
  const distMigrate = path.join(__dirname, '..', 'dist', 'main', 'migrate.js');
  if (!fs.existsSync(distMigrate)) {
    console.error(
      '[db-migrate-down] dist/main/migrate.js 가 없음. `npm run build` 먼저 실행.'
    );
    process.exit(1);
  }

  // better-sqlite3 + revertTo 동적 로드
  let Database;
  let revertTo;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    console.error('[db-migrate-down] better-sqlite3 load 실패:', err.message);
    console.error('  npm rebuild 또는 npm install 후 재시도.');
    process.exit(1);
  }
  try {
    ({ revertTo } = require(distMigrate));
  } catch (err) {
    console.error('[db-migrate-down] migrate.js load 실패:', err.message);
    process.exit(1);
  }

  console.log(`[db-migrate-down] DB: ${dbPath}`);
  console.log(`[db-migrate-down] target schema version: ${targetVersion}`);
  console.warn(
    '[db-migrate-down] WARNING: down migration 은 데이터 변형 가능성 있음. backup 권장.'
  );

  const db = new Database(dbPath);
  try {
    const result = revertTo(db, targetVersion);
    console.log('[db-migrate-down] result:');
    console.log(JSON.stringify(result, null, 2));
    if (result.reverted && result.reverted.length > 0) {
      console.log(
        `[db-migrate-down] OK — ${result.reverted.length} migration 되돌림.`
      );
    } else {
      console.log('[db-migrate-down] no-op (이미 target version 이하).');
    }
  } catch (err) {
    console.error('[db-migrate-down] FAIL:', err.message);
    if (/no down migration/i.test(err.message)) {
      console.error(
        '  본 schema 이전으로 가려면 backup 복원 필요 — down 미정의 영역.'
      );
    }
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[db-migrate-down] unexpected error:', err);
  process.exit(1);
});
