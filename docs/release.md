---
title: Release Process
parent: ../README.md
status: stable
last_updated: 2026-05-02
---

# Release 프로세스

## 한 줄 요약

`v0.1.1` 같은 git tag push → GitHub Actions 2-stage 파이프라인:
1. **Stage 1 (build matrix)**: 3 OS 가 병렬로 artifact 만 빌드 (`--publish never`)
2. **Stage 2 (publish job)**: 모든 artifact 를 한 곳에 모아 GitHub Release 단일 atomic 생성

> **v0.1.0 의 race condition 수정** (Issue #1): 이전엔 3 OS 가 동시에 release
> create 시도 → 두번째부터 422 already_exists 에러 → macOS DMG 누락. 이제는
> publish job 만 release 를 만들어 race 없음.

## 첫 release 전 체크리스트 (v0.1.0)

> **현재 상태**: `package.json` version `0.1.0` 설정 완료. 아래 단계 완료 후 tag push 가능.

### 0. 아이콘 파일 생성 (권장, unsigned release 허용 시 건너뛸 수 있음)

`build/icon.svg` 가 source-of-truth. 다음 포맷을 생성해 `build/` 에 추가:
- `icon.icns` — macOS
- `icon.ico` — Windows
- `icon.png` — Linux

생성 명령어는 [build/README.md](../build/README.md) 참고.
미생성 시 electron-builder 가 기본 Electron 아이콘으로 대체 (배포 가능, unbranded).

### 1. Secrets 설정 (GitHub repo settings → Secrets and variables → Actions)

> Win/macOS 의 code-signing secret 은 **플랫폼별로 분리**돼 있다.
> 이전엔 `CSC_LINK` / `CSC_KEY_PASSWORD` 가 두 OS 공유라 한쪽만 서명 가능했다.

#### Windows code signing (선택, Phase 2 이후 필수)
- `WIN_CSC_LINK`: .pfx 인증서 base64 인코딩
  ```bash
  base64 -i certificate.pfx | tr -d '\n' > cert.b64
  ```
- `WIN_CSC_KEY_PASSWORD`: 인증서 패스워드

#### macOS code signing + notarization (선택)
- `MAC_CSC_LINK`: Developer ID Application 인증서 .p12 base64
- `MAC_CSC_KEY_PASSWORD`: 인증서 패스워드
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

> **v0.1.0**: `package.json` 이미 `0.1.0`. commit + tag 만 하면 됨.

```bash
# v0.1.0 tag push (B3 commit 후)
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main
git push origin v0.1.0

# GitHub Actions 자동 트리거 → 60분 내 GitHub Release 발행
```

다음 버전 (v0.1.1 / v0.2.0):
```bash
# package.json version 수동 변경 후:
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.1.1"
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin main --follow-tags

# 또는 npm version 사용:
npm version patch   # 0.1.0 → 0.1.1 (버그 픽스)
npm version minor   # 0.1.0 → 0.2.0 (기능 추가)
git push origin main --follow-tags
```

### 4. workflow_dispatch (수동 테스트 — release 발행 X, artifact 만)

★ **dry-run 검증 전용**: 진짜 tag push 전 `release.yml` 이 정상
   동작하는지 검증. **GitHub Release 는 발행되지 않음** — Actions 의 artifact
   탭에서 zip 으로만 다운로드 가능. 14일 후 자동 삭제.

```bash
# 1. dry-run 용 tag (실제 release 와 분리)
git tag -a v0.1.1-rc1 -m 'Dry-run for v0.1.1'
git push origin v0.1.1-rc1

# 2. GitHub Actions UI:
#    Repository → Actions → Release workflow → Run workflow 버튼
#    Branch: main, tag input: v0.1.1-rc1
#    → 60분 내 빌드 완료 (3 OS matrix)
#    → publish job 은 skip (workflow_dispatch 면 artifact-only job 만 실행)

# 3. artifact 확인:
#    Actions UI → 해당 workflow run → Artifacts 섹션 (페이지 하단)
#    dreampia-dev-windows-latest.zip / dreampia-dev-macos-latest.zip /
#    dreampia-dev-ubuntu-latest.zip 다운로드 → 로컬에서 sanity check.

# 4. 실패 시:
#    - 빌드 로그 확인
#    - release.yml 수정 → push → 재실행
#    - dry-run tag 삭제 가능: git tag -d v0.1.1-rc1 && git push origin :refs/tags/v0.1.1-rc1

# 5. 성공 시:
#    - 진짜 v0.1.1 tag push (push trigger → publish job 까지 실행)
#    - GitHub Release 자동 발행
```

> ★ **v0.1.0 와의 차이**: 이전엔 `tags: v*` 패턴이라 `v0.1.0-rc1` 도
> push 시 자동 release 발행됐다. 이제 dispatch trigger 는 publish job 자체를
> skip 하므로 rc tag 도 안전하게 push 가능 (단 push trigger 는 여전히 모든
> `v*` 에 동작 — rc tag 자동 release 회피하려면 부록 참고).

### 5. v0.1.0 unsigned early adopter release

★ **현재 권장 패턴** — secrets/icons 미준비 상태에서도 release 가능:

```bash
# 1. (선택) workflow_dispatch dry-run 으로 release.yml 검증
git tag -a v0.1.0-rc1 -m 'Dry-run for v0.1.0'
git push origin v0.1.0-rc1
# → GitHub Actions UI 에서 수동 trigger → 빌드 성공 확인

# 2. 진짜 v0.1.0 tag push
git tag -a v0.1.0 -m 'Release v0.1.0 — Phase 1+2+3 B1/B2 complete'
git push origin main
git push origin v0.1.0
# → GitHub Actions release.yml 자동 trigger → 60분 내 GitHub Release 발행

# 3. 다운로드 + 사용자 시각 검증 + 피드백 수렴
```

**v0.1.0 알려진 한계** (README 에도 명시):
- Unsigned: macOS/Windows 가 "확인되지 않은 발행자" 경고 표시
- Unbranded: SVG 아이콘 source 만 있고 .icns/.ico/.png 미생성 → 기본 Electron icon
- Auto-update: 작동 (electron-updater) 하지만 signature mismatch 시 v0.1.1 자동 업데이트 실패 가능

이 모든 한계는 **v1.0.0 진입 전 (Phase 4/5)** 디자인 + 인증서 + signed
release 로 해결.

## 자동 업데이트

`electron-updater` (^6.8.3) 가 GitHub Releases 채널을 폴링.
- Win NSIS: `latest.yml`
- macOS DMG: `latest-mac.yml`
- Linux AppImage: `latest-linux.yml`

(electron-builder publish 시 자동 생성)

### 어떻게 wire 됐나

`src/main/index.ts` 의 `setupAutoUpdater()` 가:
- `app.isPackaged === true` (production) 일 때만 활성
- 첫 윈도우 ready 후 5초 뒤 한 번 `checkForUpdatesAndNotify()`
- 새 버전 발견 시 `autoDownload=true` → 다운로드 → `autoInstallOnAppQuit=true`
  로 다음 종료 시 자동 설치

dev/e2e 환경 (`app.isPackaged === false`) 에선 early return 이라 영향 X.

## 빌드 분리 (per-platform)

각 OS runner 가 자기 타겟만 빌드한다 (`--win` / `--mac` / `--linux`):
- 빌드 시간 단축 (한 OS 가 3-OS universal 빌드 안함)
- electron-builder 가 OS-native dep 만 처리하면 됨
- code-signing secret 누설 면 축소 (Win 잡엔 mac secret 미주입)

## 2-stage publish 파이프라인

`release.yml` 은 push 시 두 stage 로 직렬화된다:

### Stage 1 — `build` (matrix, parallel)

3 OS (windows-latest / macos-latest / ubuntu-latest) 가 병렬로:
1. checkout + node + deps + native rebuild
2. typecheck / lint / unit test
3. `npx vite build`
4. `npx electron-builder --<platform> --publish never` ← **artifact 만 생성, release 발행 X**
5. `actions/upload-artifact@v4` 로 release/ dir 의 installer/dmg/AppImage/blockmap/latest*.yml 업로드

### Stage 2 — `publish` (push trigger 만, atomic)

`needs: build` 로 모든 OS 가 완료된 뒤 단일 ubuntu-latest 러너에서 실행:
1. `actions/download-artifact@v4` 로 모든 OS artifact 다운로드 (각 OS 별 dir)
2. flatten step 으로 `release-final/` 단일 dir 에 모음
3. `gh release view` 로 기존 release 존재 여부 확인:
   - 있으면 `gh release upload --clobber` (re-run 안전, 동일 파일 덮어쓰기)
   - 없으면 `gh release create` 로 새로 생성하면서 모든 asset 한 번에 업로드
4. → 422 race 없음 (단일 job 이 atomic 처리)

### Stage 2b — `artifact-only` (workflow_dispatch 만)

dispatch trigger 시 publish job 은 skip 되고 이 job 이 실행:
- artifact 다운로드 + sanity check (ls -la)
- GitHub Release 발행 X — Actions 의 artifact zip 으로 14일 보존만

## 관련

- [electron-builder.yml](../electron-builder.yml) — 패키징 설정
- [.github/workflows/release.yml](../.github/workflows/release.yml) — CI 파이프라인
- [package.json](../package.json) — version 필드 + electron-updater dep
- [CHANGELOG.md](../CHANGELOG.md) — 버전별 변경 내역
- [build/README.md](../build/README.md) — 아이콘 생성 명령어
- [docs/performance/electron-tuning.md](./performance/electron-tuning.md#auto-update-성능) — autoUpdater tuning
