---
title: Release Checklist (v0.1.0 Runbook)
parent: ./release.md
status: stable
last_updated: 2026-05-03
---

# v0.1.0 Release Runbook

> Codex audit 의 4-step 권고를 따라할 수 있는 step-by-step 가이드.
>
> **현재 시점**: local 에 31 commits + `v0.1.0-rc1` tag 생성됨. Remote 미연결.
>
> 이 체크리스트는 첫 OSS Electron 앱을 release 해본 적 없는 사용자도
> 따라할 수 있게 작성됐습니다.

---

## ⏰ 예상 소요 시간

| 단계 | 시간 | 비용 |
|------|------|------|
| 0. GitHub repo + remote | 5분 | 무료 |
| 1. push + dry-run | 5분 | 무료 |
| 2. GitHub Actions dry-run 빌드 | 60분 (대기) | 무료 (public repo Actions 무제한) |
| 3. 진짜 release tag push | 5분 | 무료 |
| 4. release 빌드 | 60분 (대기) | 무료 |
| 5. 수동 smoke matrix | 30분 | 무료 |
| **총** | **2-3시간** | **무료** (signing 인증서 X) |

---

## Step 0: GitHub Repo 생성 + remote 연결

### 0.1 GitHub 에서 새 repo 생성

1. https://github.com/new 접속
2. 입력:
   - **Owner**: 본인 또는 조직 (`dreampia-org` 권장)
   - **Repository name**: `dreampia-dev`
   - **Description**: `Open source AI coding desktop wrapper. Claude Code + OpenAI Codex 통합 GUI.`
   - **Visibility**: **Public** (필수 — Actions 무제한 사용)
   - ⚠ **README/.gitignore/license 자동 생성 X** (체크박스 모두 unchecked) — 우리 local 에 이미 있음
3. [Create repository] 클릭

### 0.2 Local repo 에 remote 추가

```bash
cd C:\Dev\분석\dreampia-dev
git remote add origin https://github.com/<your-owner>/dreampia-dev.git

# 검증
git remote -v
# → origin  https://github.com/<your-owner>/dreampia-dev.git (fetch)
# → origin  https://github.com/<your-owner>/dreampia-dev.git (push)
```

> **Tip**: SSH 사용자는 `git@github.com:<your-owner>/dreampia-dev.git` 사용.

### 0.3 (조직 저장소면) electron-builder.yml 갱신

`electron-builder.yml` 의 `publish.owner` 가 `dreampia-org` 로 hardcoded.
다른 owner 면 변경:

```yaml
publish:
  provider: github
  owner: <your-owner>      # ← 본인 GitHub username 또는 조직명
  repo: dreampia-dev
  releaseType: release
```

변경 시 commit 추가:

```bash
git add electron-builder.yml
git commit -m "chore: update publish.owner to <your-owner>"
```

---

## Step 1: push + dry-run

### 1.1 main branch push

```bash
git push -u origin main
```

→ 30 commits 가 GitHub 에 올라감.

### 1.2 dry-run tag push

```bash
git push origin v0.1.0-rc1
```

→ tag 자체는 push 되지만, `release.yml` 의 trigger 가
`tags: v*` 라서 **자동 trigger 됨**. dry-run 만 하려면 step 2 의 manual
trigger 만 사용해야 함 — 자동 trigger 도 괜찮으면 그대로.

> **현재 상황**: rc1 도 `v*` 패턴이라 자동 trigger 됨. 즉 step 1.2 push 만
> 해도 60분 후 GitHub Release 가 발행됩니다 (rc1 tag 의 prerelease 로).
> 의도한 대로면 OK.
>
> 만약 **artifact 만 보고 release 발행은 X 원하면**: rc1 push 안 하고
> 바로 step 2 의 workflow_dispatch 만 사용. 단, dispatch 는 git tag 가
> 이미 존재해야 작동 — 그래서 push 는 해야 함.
>
> **현실적 권장**: rc1 push → 자동 release (prerelease 표시) 발행 → 사용자가
> 다운로드 검증 → 이상 없으면 v0.1.0 push.

---

## Step 2: GitHub Actions 빌드 검증

### 2.1 진척 확인

push 직후 https://github.com/<your-owner>/dreampia-dev/actions 접속

**3 OS matrix 빌드 진행**:
- 🖥 Windows: NSIS installer + zip
- 🍎 macOS: DMG (x64 + arm64) + zip
- 🐧 Linux: AppImage + deb

**예상 시간**: 60분 (3 OS 병렬, fail-fast=false 라 한 OS 실패해도 다른 OS 계속).

### 2.2 실패 시 진단

| 실패 단계 | 가능한 원인 | 해결 |
|----------|------------|------|
| `npm ci` | Node 버전 mismatch | actions/setup-node@v4 의 `node-version: '22'` 확인 |
| `dev:rebuild` | better-sqlite3 native compile 실패 | Linux 면 `apt install build-essential python3` 추가, Windows 는 `windows-build-tools` 자동 |
| `vite build` | TypeScript 또는 dep 문제 | local 에서 `npm run build` 재현 |
| `electron-builder` | platform 별 패키징 실패 | log 의 마지막 lines 확인. 흔한 원인: icon 파일 없으면 default fallback (실패 X) |
| `publish` | GH_TOKEN 권한 부족 | repo Settings → Actions → General → Workflow permissions 가 'Read and write' 인지 확인 |

### 2.3 성공 시 확인

- Actions 탭의 release workflow 가 ✅ 녹색
- Repo 의 Releases 페이지에 `v0.1.0-rc1` 항목 + 8-12 artifact 파일

artifact 파일 (예시):
```
Dreampia-Dev-Setup-0.1.0-rc1-x64.exe        (Windows)
Dreampia-Dev-0.1.0-rc1-x64.dmg              (macOS Intel)
Dreampia-Dev-0.1.0-rc1-arm64.dmg            (macOS Apple Silicon)
Dreampia-Dev-0.1.0-rc1-x64.AppImage         (Linux)
Dreampia-Dev-0.1.0-rc1-x64.deb              (Linux Debian)
latest.yml / latest-mac.yml / latest-linux.yml (auto-updater channel)
```

---

## Step 3: 진짜 v0.1.0 release

dry-run 성공 시:

```bash
# rc1 tag 는 prerelease 로 그대로 두거나 삭제
# git tag -d v0.1.0-rc1
# git push origin :refs/tags/v0.1.0-rc1

# v0.1.0 tag 재생성 (이전에 삭제됨 — Codex 권고로)
git tag -a v0.1.0 -m "Release v0.1.0 — Phase 1+2+3 B1/B2 complete

첫 공식 릴리스 (early adopter, unsigned).
자세한 내용: CHANGELOG.md, docs/release.md"

git push origin v0.1.0
```

→ `release.yml` 자동 trigger → 60분 후 GitHub Release 발행 (정식 release,
prerelease X).

---

## Step 4: 수동 Smoke Matrix

다운로드 후 직접 검증. **각 OS 별 30분 정도**.

### Windows 10/11
1. `Dreampia-Dev-Setup-0.1.0-x64.exe` 다운로드
2. 더블클릭 → SmartScreen 경고 → [더 많이] → [실행]
3. 설치 (per-user, 경로 선택 가능 — `oneClick: false` 옵션)
4. 시작 메뉴에서 Dreampia-Dev 실행
5. 검증:
   - [ ] 앱 창이 뜸 (3-panel layout)
   - [ ] Onboarding wizard 5-step 진행 가능
   - [ ] CLI 감지 (claude/codex 설치되어 있다면 ✓ 표시)
   - [ ] Workspace picker → 폴더 선택 → 영속
   - [ ] 첫 채팅 → 추천 prompt 클릭 → ChatInput 자동 입력
   - [ ] Mock 응답 streaming (▋ 펄싱)
   - [ ] 앱 종료 → 재시작 → onboarding skip + 세션 복원
   - [ ] **rm -rf / 입력 시도 → DangerCheck 차단 (e2e 검증 완료지만 시각 재확인)**

### macOS 14+ (Sonoma)
1. `Dreampia-Dev-0.1.0-arm64.dmg` (M1/M2/M3) 또는 `-x64.dmg` (Intel) 다운로드
2. DMG mount → app drag to Applications
3. **첫 실행**: '확인되지 않은 개발자' → Cmd+우클릭 → Open
   - 또는 시스템 환경설정 → 보안 및 개인정보 보호 → "확인 없이 열기"
4. 검증: 위 Windows 와 동일

### Ubuntu 22+
1. `Dreampia-Dev-0.1.0-x64.AppImage` 다운로드
2. `chmod +x Dreampia-Dev-0.1.0-x64.AppImage`
3. 더블클릭 또는 `./Dreampia-Dev-0.1.0-x64.AppImage`
4. 검증: 위와 동일

### 발견된 issue → v0.1.1 patch
smoke matrix 에서 발견된 모든 bug 는 v0.1.1 hardening 으로 처리.

---

## Step 5: 사용자 피드백 수렴

10-30명 초기 사용자에게:
- GitHub Discussions 또는 Issues 활용
- 알려진 한계 (CHANGELOG 의 Known Limitations) 공유
- 피드백 form: GitHub Issue template (별도 작업 필요)

---

## Step 6: v0.1.1 Hardening (Phase 4 진입 전 권장)

Codex 권고:

| 항목 | 작업 | 비용 |
|------|------|------|
| 플랫폼 아이콘 (.icns/.ico/.png) | 디자이너 외주 또는 본인 + ImageMagick 설치 | $50-200 또는 0 + 시간 |
| Win signing | EV cert 매입 (DigiCert, Sectigo) | $300+/년 |
| macOS signing | Apple Developer Program | $99/년 |
| macOS notarization | 위 인증서 활용 | 추가 비용 X |
| smoke matrix issue fix | bug 별 patch | 무료 |
| README / CONTRIBUTING / Issue templates | OSS 표준 문서 | 무료 |

이후 v1.0.0 진입 가능 (signed + branded + production-grade).

---

## 부록: rc1 자동 trigger 회피 (workflow_dispatch only)

만약 **rc1 push 시 자동 release 발행을 막고 싶다면**:

`release.yml` 의 trigger 를 일시적으로:

```yaml
on:
  push:
    tags:
      - 'v*'
      - '!v*-rc*'   # rc tag 제외
  workflow_dispatch:
    ...
```

추가 후 push → rc1 자동 trigger X → workflow_dispatch 로만 수동 빌드.

검증 후 `'!v*-rc*'` 라인 삭제하고 v0.1.0 push.

---

## 관련

- [docs/release.md](./release.md) — 전체 release 프로세스
- [CHANGELOG.md](../CHANGELOG.md) — v0.1.0 변경 사항
- [build/README.md](../build/README.md) — 아이콘 생성 명령어
- [.github/workflows/release.yml](../.github/workflows/release.yml) — CI 정의
