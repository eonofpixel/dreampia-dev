---
title: UX Patterns — Wiki Index
parent: ../../README.md
status: complete
last_updated: 2026-05-02
---

# UX Patterns (28개) — Wiki Home

> **한 줄 요약**: Codex Desktop 분석으로 식별한 28개 UX 패턴. 각각 Dreampia-Dev 의 F-013 ~ F-040 에 매핑.
>
> **출처**: [docs/findings/](../findings/) (라이브 UI + 디스크 forensics)

---

## 28 패턴 매트릭스

### Phase 1 P0 (필수, 5개)

| ID | 패턴 | 페이지 |
|----|------|--------|
| F-025 | 통합 단축키 시스템 (20+) | [F-025](./patterns/F-025-shortcut-system.md) |
| F-026 | 채팅 검색 팔레트 + Ctrl+1~9 | [F-026](./patterns/F-026-chat-search.md) |
| F-027 | 권한 4단계 dropdown | [F-027](./patterns/F-027-permission-dropdown.md) |
| F-028 | 모델 + 인텔리전스 + 속도 3단 | [F-028](./patterns/F-028-model-intelligence-speed.md) |
| F-029 | 빈 채팅 Welcome + 추천 프롬프트 | [F-029](./patterns/F-029-empty-state.md) |

### Phase 1 P0 (Codex 라이브 12개)

| ID | 패턴 | 페이지 |
|----|------|--------|
| F-013 | 3-패널 레이아웃 | [F-013](./patterns/F-013-3panel.md) |
| F-014 | 전체화면 토글 ⛶ | [F-014](./patterns/F-014-fullscreen.md) |
| F-015 | Floating 채팅 overlay | [F-015](./patterns/F-015-floating-overlay.md) |
| F-016 | "최근 메시지 ›" expand | [F-016](./patterns/F-016-recent-messages.md) |
| F-017 | 미리보기 멀티탭 + 브라우저 컨트롤 | [F-017](./patterns/F-017-preview-tabs.md) |
| F-018 | / 슬래쉬 명령 팔레트 | [F-018](./patterns/F-018-slash-commands.md) |
| F-019 | @ 멘션 팔레트 | [F-019](./patterns/F-019-mention-palette.md) |
| F-020 | /status 사용량 투명성 | [F-020](./patterns/F-020-status.md) |
| F-021 | ★ 주석 달기 모드 | [F-021](./patterns/F-021-annotation.md) |
| F-022 | 임베디드 미리보기 카드 | [F-022](./patterns/F-022-embedded-card.md) |
| F-023 | 메시지마다 모델 + 효력 | [F-023](./patterns/F-023-per-message-model.md) |
| F-024 | 좋아요/싫어요/공유 인라인 | [F-024](./patterns/F-024-inline-actions.md) |

### Phase 2 P1 (6개)

| ID | 패턴 | 페이지 |
|----|------|--------|
| F-030 | 통합 터미널 패널 | [F-030](./patterns/F-030-terminal.md) |
| F-031 | 파일 트리 패널 | [F-031](./patterns/F-031-filetree.md) |
| F-032 | Diff Panel (Git/PR) | [F-032](./patterns/F-032-diff-panel.md) |
| F-033 | DOM Inspector 호버 | [F-033](./patterns/F-033-dom-inspector.md) |
| F-034 | 12 카테고리 설정 | [F-034](./patterns/F-034-settings.md) |
| F-035 | 성격 + 지침 + 메모리 | [F-035](./patterns/F-035-personality.md) |

### Phase 3 P2 (5개)

| ID | 패턴 | 페이지 |
|----|------|--------|
| F-036 | 플러그인 마켓플레이스 | [F-036](./patterns/F-036-plugin-marketplace.md) |
| F-037 | 스킬 마켓 | [F-037](./patterns/F-037-skill-market.md) |
| F-038 | 자동화 시스템 | [F-038](./patterns/F-038-automation.md) |
| F-039 | Plugin/Skill Creator | [F-039](./patterns/F-039-creator.md) |
| F-040 | Multi-IDE 열림 위치 | [F-040](./patterns/F-040-multi-ide.md) |

---

## 채택 우선순위 통계

```
P0 (Phase 1):  17개 (60%)
P1 (Phase 2):  6개  (21%)
P2 (Phase 3):  5개  (19%)
```

---

## 카테고리별

### Layout / 구조
F-013 (3-패널), F-014 (전체화면), F-015 (Floating overlay), F-016 (Recent messages), F-030 (Terminal), F-031 (FileTree), F-032 (Diff)

### 상호작용
F-018 (/), F-019 (@), F-021 (Annotation), F-022 (Card), F-033 (Inspector)

### 메시지
F-023 (Per-msg model), F-024 (Inline actions), F-029 (Empty state)

### 권한 / 모드
F-027 (Permission dropdown), F-028 (Model+Speed)

### 자동화 / 확장
F-036 (Plugin market), F-037 (Skill market), F-038 (Automation), F-039 (Creator)

### 시스템
F-017 (Preview tabs), F-020 (Status), F-025 (Shortcuts), F-026 (Search), F-034 (Settings), F-035 (Personality), F-040 (Multi-IDE)

---

## 정적 분석으로 발견 못한 패턴

```
대부분 (28개 중 25개) 이 라이브 UI 분석 만으로 발견 가능.
정적 분석 (asar) 으로는 string 만 보였고 의미 알 수 없음.
```

→ **사용자 라이브 시연 = 가장 가치 있는 분석 방법**.

---

## 관련

- [docs/findings/_index.md](../findings/_index.md) — 패턴 발견 과정
- [PRD.md](../../PRD.md) — F-001 ~ F-012 (기본 기능) + F-013~F-040 (Codex 차용)
- [ROADMAP.md](../../ROADMAP.md) — Phase 별 일정
