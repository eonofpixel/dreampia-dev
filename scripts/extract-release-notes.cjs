#!/usr/bin/env node
/**
 * extract-release-notes — CHANGELOG.md 의 특정 버전 섹션 추출.
 *
 * 사용:
 *   node scripts/extract-release-notes.cjs 0.1.3 > release-notes.md
 *
 * 추출 규칙:
 *   '## [0.1.3]' 헤더부터 다음 '## [' 헤더 직전까지.
 *   해당 버전 없으면 stderr 에러 + exit 1.
 *
 * Spec: Issue #2 (v0.1.3 hardening)
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: extract-release-notes.cjs <version>');
  console.error('Example: node scripts/extract-release-notes.cjs 0.1.3');
  process.exit(2);
}

const changelogPath = join(__dirname, '..', 'CHANGELOG.md');
const content = readFileSync(changelogPath, 'utf-8');
const lines = content.split('\n');

const headerPattern = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`);
const nextHeaderPattern = /^## \[/;

let inSection = false;
const collected = [];

for (const line of lines) {
  if (headerPattern.test(line)) {
    inSection = true;
    continue;  // skip the header itself
  }
  if (inSection && nextHeaderPattern.test(line)) {
    break;
  }
  if (inSection) {
    collected.push(line);
  }
}

if (collected.length === 0) {
  console.error(`Version [${version}] not found in CHANGELOG.md`);
  process.exit(1);
}

// trim leading/trailing empty lines
while (collected.length && collected[0].trim() === '') collected.shift();
while (collected.length && collected[collected.length - 1].trim() === '') collected.pop();

console.log(collected.join('\n'));
