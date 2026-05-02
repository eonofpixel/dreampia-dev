---
title: Round 5 — MSIX Package + 설치 경로
parent: ./_index.md
related:
  - ./round5-plugins-skills-spec.md
  - ./round5-ipc-telemetry.md
status: complete
last_updated: 2026-05-02
---

# Round 5: MSIX 패키지 + 설치 파일 시스템

> **방법**: 디스크 forensics — `C:\Program Files\WindowsApps\OpenAI.Codex_*` 직접 탐색
>
> **결과**: MSIX 메타 + 번들 binary + Codex 의 `runFullTrust` 보안 모델

---

## MSIX 패키지 메타데이터

```
패키지: OpenAI.Codex_26.429.2026.0_x64__2p2nqsd0c76g0
버전: 26.429.2026.0
아키텍처: x64만 (ARM 미지원)
Publisher CN: 50BDFD77-8903-4850-9FFE-6E8522F64D5B (익명 UUID)
PublisherDisplayName: OpenAI

Windows 호환:
  MinVersion: 10.0.19041.0 (Win10 20H1, 2020-05)
  MaxVersionTested: 10.0.19041.0 (★ Win11 명시 테스트 X)

Capabilities:
  rescap:runFullTrust    ← 제한 capability (MS 승인 필요)
  internetClient

EntryPoint: Windows.FullTrustApplication
Background Color: #3143FF (Codex blue)
URL Protocol: codex://    ← 딥링크 스킴 확인!
```

### 핵심 인사이트

```
1. runFullTrust = MSFT 제한 capability → MS Store / Partner Center 승인 필수 (자체 서명 불가)
2. 익명 publisher CN + display name "OpenAI" = MS Store 표준 패턴
3. codex:// URL scheme 등록 → "딥링크 복사" feature 의 backbone
```

→ Dreampia-Dev: `dreampia-dev://` URL scheme 등록 필요.

---

## 설치 경로 구조

### MSIX 설치 경로

```
C:\Program Files\WindowsApps\OpenAI.Codex_26.429.2026.0_x64__2p2nqsd0c76g0\
├── AppxManifest.xml           ← 위 메타데이터
├── AppxBlockMap.xml
├── AppxSignature.p7x          ← 디지털 서명 (P7X 형식)
├── app\
│   ├── Codex.exe              ← Electron 41.2 부트스트랩
│   ├── chrome_*_percent.pak   ← Chromium 리소스
│   ├── d3dcompiler_47.dll
│   ├── ffmpeg.dll
│   ├── icudtl.dat
│   ├── libEGL.dll, libGLESv2.dll, vulkan-1.dll  ← GPU 가속
│   ├── version → "41.2.0"     ← Electron 버전
│   ├── locales\               ← 약 40개 .pak (en-US, ko, ja, zh-CN ...)
│   └── resources\
│       ├── app.asar (131 MB)  ← 실제 앱 코드
│       ├── app.asar.unpacked\
│       ├── codex.exe (CLI)    ← 별도 codex CLI
│       ├── codex-command-runner.exe (789 KB)
│       ├── codex-windows-sandbox-setup.exe (738 KB)
│       ├── codex-notification.wav   ← 알림 사운드
│       ├── icon.ico
│       ├── native\
│       │   └── windows-updater.node ← 커스텀 자동 업데이트
│       ├── node.exe (91 MB)   ← 번들 Node.js
│       ├── node_repl.exe      ← REPL helper
│       ├── rg.exe (4.2 MB)    ← 번들 ripgrep
│       └── plugins\openai-bundled\plugins\
│           ├── browser-use\   ← 번들 브라우저 자동화
│           └── latex-tectonic\ ← 번들 LaTeX 컴파일러!
```

### 사용자 데이터 경로

```
C:\Users\<user>\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\
├── LocalCache\
│   ├── Local\
│   │   ├── Codex\Logs\YYYY\MM\DD\codex-desktop-{guid}-...log
│   │   └── OpenAI\Codex\bin\
│   │       ├── codex.exe (258 MB)
│   │       ├── node.exe, node_repl.exe, rg.exe
│   │       ├── codex-command-runner.exe
│   │       └── codex-windows-sandbox-setup.exe
│   └── Roaming\Codex\         ← Electron 사용자 데이터
│       ├── Cache, Code Cache, GPUCache    ← Chromium 캐시
│       ├── Local Storage\leveldb\         ← localStorage
│       ├── Local State                    ← 암호화 키 (DPAPI)
│       ├── Preferences                    ← {spellcheck: ko, ...}
│       ├── Network\
│       │   ├── Cookies, Cookies-journal
│       │   ├── TransportSecurity
│       │   └── Trust Tokens
│       ├── Partitions\codex-browser-app\  ← ★ in-app 브라우저 분리 파티션
│       │   ├── Cache, Code Cache, GPUCache
│       │   ├── Local Storage\, Session Storage\
│       │   └── Preferences (별도)
│       ├── Crashpad\          ← Chromium crash reporter
│       ├── Dictionaries\
│       ├── DIPS, DIPS-wal     ← Chromium DIPS DB
│       └── sentry\
│           ├── queue\
│           ├── scope_v3.json
│           └── session.json
└── Settings\settings.dat      ← MSIX-specific settings
```

### 핵심 인사이트

```
1. 별도 Electron Partition (codex-browser-app) → in-app 브라우저는 메인 앱과 cookie/storage 격리
2. DPAPI 로 암호화 키 보호 (Windows Data Protection API)
3. 한국어 spellcheck 자동 활성화 (시스템 locale 따라)
```

---

## 번들 파일 분석

### 파일 크기

```
app.asar:        131 MB (Claude Desktop 보다 약 2배)
node.exe:        91 MB (일반 Node.js와 비슷)
codex.exe (CLI): 258 MB (큼! Rust + 임베드 LLM 추정)
rg.exe:          4.2 MB (ripgrep)
```

### 번들 binary 정리

```
1. codex.exe (258 MB)         - 메인 Codex CLI (Rust + 큰 binary)
2. codex-command-runner.exe (789 KB) - subprocess 헬퍼
3. codex-windows-sandbox-setup.exe (738 KB) - Windows 샌드박스 초기화
4. node.exe (91 MB)           - 번들 Node.js (시스템 의존성 X)
5. node_repl.exe (8.9 MB)     - Node REPL (browser-use 등에 사용)
6. rg.exe (4.2 MB)            - 번들 ripgrep (코드 검색)
7. tectonic.exe (수십 MB)     - 번들 LaTeX 엔진 (latex-tectonic plugin)
8. windows-updater.node       - 커스텀 자동 업데이트
```

→ **시스템 의존성 0** = 사용자가 Node/rg/Python 설치 필요 없음.

---

## Locale 지원

```
40개 .pak 파일 (Chromium 표준):
  af, am, ar, bg, bn, ca, cs, da, de, el, 
  en-GB, en-US, es-419, es, et, fa, fi, fil, fr, gu,
  he, hi, hr, hu, id, it, ja, kn, ko ...
```

→ 한국어 ko 포함, Codex Desktop 한국어 지원 확인.

---

## 버전 차이 발견

```
앱 버전: 26.429.2026.0 (MSIX)
Electron: 41.2.0
codex.exe (Local bin): May 2026 (최신 자동 업데이트)
codex.exe (MSIX): May 2026 (같음)
```

→ Local bin 의 codex.exe = 자동 업데이트 가능 경로 (MSIX 외).

---

## Dreampia-Dev 차용

### P0 (Phase 1 필수)
```
✓ MSIX 패키징 (runFullTrust + MS Store / Trusted Signing)
✓ dreampia-dev:// URL scheme (딥링크)
✓ Electron Partition 분리 (in-app 브라우저 격리)
```

### P1 (Phase 2)
```
✓ 번들 Node.js + ripgrep (시스템 의존성 0)
✓ Windows 샌드박스 setup binary
```

### P2 (Phase 3)
```
✓ 번들 플러그인 (LaTeX 등)
✓ 커스텀 자동 업데이트 (windows-updater.node)
```

---

## 관련

- [round5-plugins-skills-spec.md](./round5-plugins-skills-spec.md) — 번들 플러그인 상세
- [round5-ipc-telemetry.md](./round5-ipc-telemetry.md) — IPC + Datadog
