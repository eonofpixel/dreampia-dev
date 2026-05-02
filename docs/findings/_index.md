---
title: Deep Exploration Findings — Wiki Index
parent: ../../README.md
status: complete
last_updated: 2026-05-02
---

# Findings (탐색 결과) — Wiki Home

> **한 줄 요약**: Codex Desktop 5라운드 분석 (정적 + 라이브 UI + 디스크 forensics) + Codex 자체 조언.
>
> **분석 일시**: 2026-05-01 ~ 2026-05-02
>
> **방법**: asar 분석 + 라이브 UI 클릭 + 디스크 file forensics + AI 자기 질문

---

## 라운드별

| 라운드 | 페이지 | 분량 |
|------|--------|------|
| **0. 정적 분석** | [round0-static-analysis.md](./round0-static-analysis.md) | codex-spec.md 4,002줄 요약 |
| **1-2. 라이브 UI 1차** | [rounds-1-2-live-ui.md](./rounds-1-2-live-ui.md) | 메뉴/패널/팝오버 |
| **3. /명령 + @멘션** | [round3-slash-mention.md](./round3-slash-mention.md) | 44+ 명령, 30+ 에이전트 |
| **3. 자동화/MCP/플러그인 폼** | [round3-creators.md](./round3-creators.md) | 자동화 / MCP / Plugin Creator |
| **4. 컨텍스트 메뉴** | [round4-context-menus.md](./round4-context-menus.md) | 프로젝트 ✏ + 채팅 ··· + + |
| **4. MCP 편집 / 테마** | [round4-mcp-themes.md](./round4-mcp-themes.md) | MCP 폼 / 모양 설정 |
| **4. 병렬 모드 / 스킬** | [round4-parallel-skills.md](./round4-parallel-skills.md) | /사이드 + /플랜 + 스킬 |
| **5. MSIX / 설치 경로** | [round5-msix-paths.md](./round5-msix-paths.md) | 패키지 메타 + 파일 layout |
| **5. 플러그인 + Skill spec** | [round5-plugins-skills-spec.md](./round5-plugins-skills-spec.md) | plugin.json + SKILL.md |
| **5. IPC + Telemetry** | [round5-ipc-telemetry.md](./round5-ipc-telemetry.md) | AppServerConnection + Datadog |
| **Codex 자체 조언** | [codex-self-advice.md](./codex-self-advice.md) | 5대 영역 권고 |

---

## 토픽별 (cross-round)

| 토픽 | 페이지 |
|------|--------|
| Codex IPC 메시지 스키마 | [round5-ipc-telemetry.md](./round5-ipc-telemetry.md) |
| plugin.json 매니페스트 | [round5-plugins-skills-spec.md](./round5-plugins-skills-spec.md) |
| SKILL.md 형식 | [round5-plugins-skills-spec.md](./round5-plugins-skills-spec.md) |
| Codex 발견된 버그 | [round5-bugs.md](./round5-bugs.md) |
| Codex 가 사용하는 라이브러리 | [round5-msix-paths.md](./round5-msix-paths.md) |

---

## 종합 우선순위 (Dreampia-Dev 차용)

### P0 (Phase 1 필수)
- 3-패널 레이아웃 (사이드바 + 채팅 + 미리보기)
- 권한 4단계 dropdown (Codex 3-tier + 우리 custom)
- 모델 + 인텔리전스 + 속도 3단 분리
- /명령 + @멘션 시스템
- Multi-IDE 열림 위치 (8가지)

### P1 (Phase 2)
- Plugin/Skill 시스템 (plugin.json 호환)
- 자동화 시스템 ($sentry 변수)
- 통합 터미널 / 파일 트리 / Diff 패널
- DOM Inspector (주석 호버)

### P2 (Phase 3)
- 플러그인 마켓플레이스
- Plugin/Skill Creator (AI 가이드)
- 스킬 시장 + 사용자 정의

---

## 핵심 인사이트

| 인사이트 | 근거 |
|---------|------|
| **세션 = 모든 AI 작업의 first-class object** | 채팅 ··· 메뉴의 12개 옵션 (포크/Markdown/딥링크/미니창) |
| **Plugin manifest 는 AI 행동 지침 포함** | plugin.json description 필드 |
| **In-app browser 격리 파티션이 보안 핵심** | codex-browser-app 별도 partition |
| **MCP env passthrough = 보안 패턴** | 시스템 env 이름만 (값 X) |
| **Codex 자체가 "더 파지 마" 권고** | 본인이 조언 |

---

## 정적 분석으로 발견 못한 이유

| 발견 | 정적 분석 가능? |
|------|----------------|
| /명령 풀 리스트 (44+) | ❌ |
| 채팅 ··· 12 옵션 | ❌ |
| /플랜 모드 입력창 변화 | ❌ |
| MCP 편집 폼 (5 필드) | ❌ |
| codex-browser-app 격리 | ❌ |
| IPC 메시지 스키마 | ❌ |
| Codex 자체 조언 | ❌ |
| Datadog telemetry 엔드포인트 | ❌ |
| 자동화 $sentry 변수 | ❌ |

→ **라이브 UI + 디스크 forensics + AI 자기 질문 = 가장 가치 있는 분석.**

---

## 통계

```
분석 분량:
  - 라이브 UI 캡처: 169 PNG
  - 라운드 1~5 발견: 56+ 패턴
  - 단일 분석 문서 (원본): 1,650줄
  - 위키 분리 (현재): 14 파일, 평균 200줄
  
시간 투자:
  - 정적 분석: 8시간
  - 라이브 UI: 6시간
  - 디스크 forensics: 2시간
  - 위키 분리: 1시간
```

---

## 관련

- [CODEX_SELF_ADVICE.md](../../CODEX_SELF_ADVICE.md) — 구체적 조언
- [docs/session/_index.md](../session/_index.md) — Findings 기반 contract
- [docs/permission/_index.md](../permission/_index.md)
- [docs/tools/_index.md](../tools/_index.md)
- [docs/ux/_index.md](../ux/_index.md)
