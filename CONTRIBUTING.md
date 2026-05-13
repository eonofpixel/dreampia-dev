# Contributing to Dreampia-Dev

> 한국어 우선 / 오픈소스 / Apache 2.0

---

## 시작하기

```bash
git clone https://github.com/eonofpixel/dreampia-dev.git
cd dreampia-dev
npm install
npm run dev
```

## 개발 흐름

1. **Issue 먼저** — 큰 변경은 issue 로 논의 후 진행
2. **Branch** — `feature/<issue번호>-<짧은-설명>` 또는 `fix/<...>`
3. **작업** — 위키 spec 따라 (`docs/` 참고)
4. **테스트** — `npm test` 모두 통과
5. **PR** — Draft 로 시작, 준비되면 Ready

## 개발 환경 셋업 (Windows-first, v1.0.13 정리)

### 필수

| 항목 | 권장 버전 | 메모 |
|------|---------|------|
| **Node.js** | 22 LTS | `engines >=22` (electron 33 ABI 매칭) |
| **npm** | 10.x | Node 와 함께 설치 |
| **Git** | 최신 | line-ending 처리 자동 |

### Windows 추가 (better-sqlite3 native build)

`better-sqlite3` 는 Electron native module 로, prebuilt binary 가 없으면
로컬에서 build 해야 합니다. **Windows 에서 처음 셋업 시**:

1. **Visual Studio Build Tools 2022** (or 2019) 설치 — C++ 워크로드 포함:
   - https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
   - 설치 시 "Desktop development with C++" 체크.
2. **Python 3.x** — node-gyp 가 사용. Windows 10/11 Store 또는 python.org.
3. 설치 후 새 터미널 열고 `npm install`.

설치 실패 시:
- `npm run diagnose` — ABI / Node 버전 / 환경 출력.
- `npm run dev:rebuild` — Electron ABI 로 native module rebuild.
- `npm run test:rebuild` — Node ABI 로 rebuild (vitest 시).

설정 안 되면 e2e + drive harness 만 돌릴 수 있고 (Electron prebuilt 가
번들), unit test (`npm test`) 는 native ABI mismatch 로 실패할 수 있습니다.

### macOS / Linux

대부분 사전 설치된 toolchain 으로 충분 (`xcode-select --install` /
`apt install build-essential` 정도). 그래도 안 되면 위 Windows 가이드의
diagnose 스크립트 참고.

### 한국어 / 비-ASCII 폴더 경로

Dreampia-Dev 는 **한국어 폴더 cwd 처리에 특화** 되어 있습니다 — `spawn`
시 NTFS short-name (`8.3 form`) 으로 자동 변환 (Windows). 그러나:

- **저장소 path 자체** 는 가급적 ASCII 권장 (e.g. `C:\dev\dreampia-dev`).
  한국어 폴더에 clone 가능하지만 일부 third-party tool (특히 `node-gyp`,
  `electron-builder`) 이 한국어 path 처리에 완벽하지 않음.
- **사용자 workspace** (앱 안에서 [프로젝트] 폴더로 선택하는 곳) 는 한국어
  자유롭게 OK — 그게 spawnSafe 의 본업.
- 한국어 폴더에서 cmd / 외부 tool 호출 시 `chcp 65001` 권장.

### 폴더 / userData 충돌 (v1.0.13 META-4)

작업 폴더로 `~/AppData/Roaming/Dreampia-Dev/` (Windows) /
`~/Library/Application Support/Dreampia-Dev/` (macOS) /
`~/.config/Dreampia-Dev/` (Linux) — 즉 **앱 자체의 userData 폴더** — 를
선택하면 차단됩니다. SQLite WAL/journal 파일이 사용자 작업 트리에 노출되면
실수로 commit / 삭제 위험. 다른 폴더를 선택해주세요.

## Spec 우선

```
구현 전 항상 docs/ 위키 확인:
  - docs/session/      세션 모델
  - docs/permission/   권한 모델
  - docs/tools/        도구 실행
  - docs/design/       디자인 시스템
  - docs/i18n/         한국어 우선
```

## 코딩 스타일

- **TypeScript strict** — `any` 금지 (warning)
- **Prettier** — `npm run format` 자동
- **ESLint** — `npm run lint`
- **함수형 컴포넌트** — class X
- **한국어 우선** — 사용자 보이는 string 모두 한국어 first

## Commit 메시지

이 저장소의 maintainer commit 은 Lore Commit Protocol 을 따릅니다. 첫 줄은
무엇을 바꿨는지가 아니라 **왜 바꿨는지**를 짧게 씁니다.

```text
<intent line: why the change was made>

Constraint: <external constraint that shaped the decision>
Rejected: <alternative considered> | <reason>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <forward-looking warning>
Tested: <what was verified>
Not-tested: <known gaps>
```

작은 외부 기여 PR 은 conventional commit 형식도 받을 수 있지만, merge/squash 시
maintainer 가 위 형식으로 정리합니다.

## PR 체크리스트

- [ ] Issue 연결 (Closes #N)
- [ ] CI 통과 (lint / typecheck / test / build)
- [ ] spec 위키 업데이트 (필요 시)
- [ ] 한국어 string 자연스러움
- [ ] A11y 통과 (focus, contrast, keyboard)
- [ ] PR 설명 충분 (변경 이유, 영향 범위)

## 의문 / 질문

GitHub Discussions 활용. 한국어 또는 영어 모두 OK.

---

기여 감사합니다 🙏
