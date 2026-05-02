---
title: Release Process
parent: ../README.md
status: stable
last_updated: 2026-05-03
---

# Release 프로세스

## 한 줄 요약

`v0.1.0` 같은 git tag push → GitHub Actions 자동 빌드 (Win/macOS/Linux) → GitHub Release 발행.

## 첫 release 전 체크리스트

### 1. Secrets 설정 (GitHub repo settings → Secrets and variables → Actions)

#### Windows code signing (선택, Phase 2 이후 필수)
- `CSC_LINK`: .pfx 인증서 base64 인코딩
  ```bash
  base64 -i certificate.pfx | tr -d '\n' > cert.b64
  ```
- `CSC_KEY_PASSWORD`: 인증서 패스워드

#### macOS code signing + notarization (선택)
- `CSC_LINK`: Developer ID Application 인증서 .p12 base64
- `CSC_KEY_PASSWORD`: 인증서 패스워드
- `APPLE_ID`: 애플 개발자 계정 이메일
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password
  (https://appleid.apple.com → Sign-In and Security → App-Specific Passwords)
- `APPLE_TEAM_ID`: 10자리 Team ID

#### GitHub Release (자동 — `secrets.GITHUB_TOKEN` 자동 제공)

### 2. 아이콘 파일 준비

`build/` 디렉터리에 다음 파일 추가:
- `icon.icns` — macOS (1024×1024 base, multi-resolution)
- `icon.ico` — Windows
- `icon.png` — Linux (512×512)

없으면 electron-builder 가 기본 Electron 아이콘 사용 (배포 가능하지만 권장 X).

### 3. 버전 bump + tag push

```bash
# 1. package.json 의 version 수동 변경 (예: 0.0.1 → 0.1.0)

# 2. commit + tag
git add package.json
git commit -m "chore: bump version to 0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0

# 3. GitHub Actions 자동 트리거 → 60분 내 GitHub Release 발행
```

또는 `gh` CLI:
```bash
npm version 0.1.0   # bumps version + commits + tags
git push origin main --follow-tags
```

### 4. workflow_dispatch (수동 테스트)

Code signing 환경 검증 시 secrets 만 설정 후:
- GitHub Actions → Release workflow → Run workflow
- tag input: `v0.1.0-test` 같은 임시 tag
- artifacts 다운로드 후 검증 → 이상 없으면 진짜 tag push

## 자동 업데이트

`electron-updater` 가 GitHub Releases 채널을 폴링.
- Win NSIS: `latest.yml`
- macOS DMG: `latest-mac.yml`
- Linux AppImage: `latest-linux.yml`

(electron-builder publish 시 자동 생성)

## 관련

- [electron-builder.yml](../electron-builder.yml) — 패키징 설정
- [.github/workflows/release.yml](../.github/workflows/release.yml) — CI 파이프라인
- [package.json](../package.json) — version 필드
