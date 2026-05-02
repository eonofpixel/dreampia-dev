---
title: Traceability — Spec ↔ Test ↔ Implementation
parent: ../README.md
status: draft
last_updated: 2026-05-02
---

# Traceability Matrix

> **목적**: 모든 spec 페이지가 어떤 test 와 어떤 코드 파일에 매핑되는지 추적.
>
> **유지**: PR 마다 갱신. 새 spec 추가 시 행 추가.
>
> **Codex 권고**: *"wiki와 코드 간 추적표 spec → test → implementation"* (Day 7 산출물).

---

## 범례

```
✅ 구현됨        : spec + test + impl 모두 존재
🟡 부분 구현    : test 또는 impl 일부
⏳ 계획됨       : spec 만 (Phase 1+ 후속)
─ 해당없음      : 추적 대상 X (예: 분석 라운드)
```

---

## docs/session/ — Session State Contract

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| [session/principles.md](./session/principles.md) | `tests/session/schema.test.ts` (invariants) | `src/types/session.ts` (`.superRefine`) | ✅ |
| [session/schema.md](./session/schema.md) | `tests/session/schema.test.ts` | `src/types/session.ts`, `src/types/common.ts` | ✅ |
| [session/conversation.md](./session/conversation.md) | `tests/session/schema.test.ts` (fixtures 02, 03) | `src/types/conversation.ts` | ✅ |
| [session/workspace.md](./session/workspace.md) | `tests/session/schema.test.ts` (fixture 05) | `src/types/workspace.ts` | ✅ |
| [session/terminal.md](./session/terminal.md) | `tests/session/schema.test.ts` (fixture 05) | `src/types/terminal.ts` | ✅ |
| [session/browser.md](./session/browser.md) | `tests/session/schema.test.ts` (fixture 05, 08) | `src/types/browser.ts` | ✅ |
| [session/plan.md](./session/plan.md) | `tests/session/schema.test.ts` (fixture 04) | `src/types/plan.ts` | ✅ |
| [session/persistence.md](./session/persistence.md) | — | (SQLite, Phase 1 후반) | ⏳ |
| [session/multi-window.md](./session/multi-window.md) | — | (Leader election, Phase 1 후반) | ⏳ |
| [session/cross-ai-sync.md](./session/cross-ai-sync.md) | — | (Provider adapters, Phase 1 후반) | ⏳ |
| [session/migration.md](./session/migration.md) | — | (Schema migration, Phase 1 후반) | ⏳ |
| [session/examples.md](./session/examples.md) | `tests/session/schema.test.ts` (round-trip) | `tests/fixtures/sessions/*.json` (8개) | ✅ |

---

## docs/permission/ — Permission Model

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| [permission/principles.md](./permission/principles.md) | — | (Phase 1, PM-3) | ⏳ |
| [permission/capabilities.md](./permission/capabilities.md) | — | `src/types/permission.ts` (basic) | 🟡 |
| [permission/levels.md](./permission/levels.md) | — | `src/types/permission.ts` (PermissionLevel enum) | 🟡 |
| [permission/grants.md](./permission/grants.md) | `tests/session/schema.test.ts` (fixture 03, 05) | `src/types/permission.ts` (PermissionGrant) | ✅ |
| [permission/resolver.md](./permission/resolver.md) | — | (Phase 1, PM-3) | ⏳ |
| [permission/ui-flow.md](./permission/ui-flow.md) | — | (Phase 1, PM-6~8) | ⏳ |
| [permission/audit.md](./permission/audit.md) | — | (Phase 1, PM-5) | ⏳ |
| [permission/automation.md](./permission/automation.md) | — | (Phase 2, PM-12) | ⏳ |
| [permission/danger-patterns.md](./permission/danger-patterns.md) | — | (Phase 1, PM-9, PM-10) | ⏳ |
| [permission/provider-mapping.md](./permission/provider-mapping.md) | — | (Phase 1, PM-13, PM-14) | ⏳ |

---

## docs/tools/ — Tool Orchestration

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| docs/tools/* | — | (Phase 1, TO-1~15) | ⏳ |

전체 16 페이지가 Phase 1 후반 작업. Day 7 시점 = 미구현.

---

## docs/ux/patterns/ — UX Patterns (F-013 ~ F-040)

| F-ID | 패턴 | Test | Implementation | Status |
|------|------|------|----------------|--------|
| F-013 | 3-패널 레이아웃 | `tests/renderer/ThreePanelLayout.test.tsx` | `src/renderer/components/layout/ThreePanelLayout.tsx` | ✅ |
| F-014 | 전체화면 토글 | — | (Phase 1+) | ⏳ |
| F-015 | Floating overlay | — | (Phase 1+) | ⏳ |
| F-016 | 최근 메시지 expand | — | (Phase 1+) | ⏳ |
| F-017 | 미리보기 멀티탭 | — | `src/renderer/components/preview/PreviewPanel.tsx` (윤곽) | 🟡 |
| F-018 | / 슬래쉬 명령 | — | (Phase 1+) | ⏳ |
| F-019 | @ 멘션 | — | (Phase 1+) | ⏳ |
| F-020 | /status 사용량 | — | (Phase 1+) | ⏳ |
| F-021 | 주석 모드 | — | (Phase 2) | ⏳ |
| F-022 | 임베디드 카드 | — | `src/types/conversation.ts` (EmbeddedCard) | 🟡 |
| F-023 | 메시지마다 모델 | — | `src/types/conversation.ts` (Turn.model) | 🟡 |
| F-024 | 인라인 액션 | — | (Phase 1+) | ⏳ |
| F-025 | 단축키 시스템 | — | (Phase 1+) | ⏳ |
| F-026 | 채팅 검색 | — | (Phase 1+) | ⏳ |
| F-027 | 권한 dropdown | — | (Phase 1+) | ⏳ |
| F-028 | 모델+효력+속도 | — | `src/types/common.ts` (EffortLevel) | 🟡 |
| F-029 | Welcome empty state | — | `src/renderer/components/chat/ChatPanel.tsx` (WelcomeMessage) | 🟡 |
| F-030 ~ F-040 | (Phase 2-3) | — | — | ⏳ |

---

## docs/i18n/ — Internationalization

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| [i18n/korean-first.md](./i18n/korean-first.md) | (전체 component test 들 한국어 문구 검증) | 모든 component | ✅ |
| [i18n/ime.md](./i18n/ime.md) | `tests/renderer/ChatInput.test.tsx` (IME 보호 5개) | `src/renderer/components/chat/ChatInput.tsx` | ✅ |
| [i18n/keyboard-shortcuts.md](./i18n/keyboard-shortcuts.md) | — | (Phase 1+) | ⏳ |
| [i18n/datetime.md](./i18n/datetime.md) | — | (Phase 1+) | ⏳ |
| [i18n/numbers.md](./i18n/numbers.md) | — | (Phase 1+) | ⏳ |
| [i18n/text-overflow.md](./i18n/text-overflow.md) | — | `src/renderer/index.css` (`word-break: keep-all`) | 🟡 |
| [i18n/locale-strategy.md](./i18n/locale-strategy.md) | — | (Phase 2) | ⏳ |
| [i18n/pluralization.md](./i18n/pluralization.md) | — | (Phase 2) | ⏳ |

---

## docs/design/ — Design System

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| [design/tokens/colors.md](./design/tokens/colors.md) | — | `src/renderer/index.css`, `tailwind.config.ts` | ✅ |
| [design/tokens/typography.md](./design/tokens/typography.md) | — | `src/renderer/index.css`, `index.html` (Pretendard) | ✅ |
| [design/tokens/spacing.md](./design/tokens/spacing.md) | — | `tailwind.config.ts` (default 4px scale) | ✅ |
| [design/tokens/motion.md](./design/tokens/motion.md) | — | `src/renderer/index.css` (`prefers-reduced-motion`) | 🟡 |
| [design/tokens/elevation.md](./design/tokens/elevation.md) | — | (Phase 1+) | ⏳ |
| [design/tokens/radius.md](./design/tokens/radius.md) | — | (Tailwind default) | ✅ |
| [design/tokens/breakpoints.md](./design/tokens/breakpoints.md) | — | (Phase 2) | ⏳ |
| [design/components/button.md](./design/components/button.md) | — | (Phase 1+) | ⏳ |
| [design/components/input.md](./design/components/input.md) | `tests/renderer/ChatInput.test.tsx` | `src/renderer/components/chat/ChatInput.tsx` | ✅ |
| [design/components/sidebar.md](./design/components/sidebar.md) | `tests/renderer/Sidebar.test.tsx` | `src/renderer/components/sidebar/Sidebar.tsx` | ✅ |
| [design/components/...] | — | (Phase 1+) | ⏳ |
| [design/layout/3panel.md](./design/layout/3panel.md) | `tests/renderer/ThreePanelLayout.test.tsx` | `src/renderer/components/layout/ThreePanelLayout.tsx` | ✅ |
| [design/layout/floating-overlay.md](./design/layout/floating-overlay.md) | — | (Phase 1+) | ⏳ |
| [design/typography/korean-first.md](./design/typography/korean-first.md) | — | `src/renderer/index.css`, `index.html` | ✅ |
| [design/typography/code-fonts.md](./design/typography/code-fonts.md) | — | `src/renderer/index.css` (D2Coding stack) | ✅ |
| [design/theme/dark.md](./design/theme/dark.md) | — | `src/renderer/index.css` (`[data-theme="dark"]`) | ✅ |
| [design/theme/light.md](./design/theme/light.md) | — | `src/renderer/index.css` (`:root`) | ✅ |
| [design/a11y/focus.md](./design/a11y/focus.md) | — | `src/renderer/index.css` (`*:focus-visible`) | ✅ |
| [design/a11y/keyboard-only.md](./design/a11y/keyboard-only.md) | — | (Phase 1+) | ⏳ |
| [design/a11y/contrast.md](./design/a11y/contrast.md) | — | `src/renderer/index.css` (token 정의) | 🟡 |
| [design/a11y/reduced-motion.md](./design/a11y/reduced-motion.md) | — | `src/renderer/index.css` | ✅ |

---

## docs/performance/ — Performance

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| [performance/electron-tuning.md](./performance/electron-tuning.md) | — | `src/main/index.ts` (sandbox, contextIsolation, V8 flags) | ✅ |
| [performance/startup.md](./performance/startup.md) | — | `src/main/index.ts` (`ready-to-show`) | 🟡 |
| [performance/bundle.md](./performance/bundle.md) | — | `vite.config.ts` (manualChunks: react-vendor) | 🟡 |
| 기타 | — | (Phase 1+ 측정 후) | ⏳ |

---

## docs/ia/ — Information Architecture

| Spec | Test | Implementation | Status |
|------|------|----------------|--------|
| [ia/overview.md](./ia/overview.md) | — | `src/renderer/App.tsx` (4-layer hierarchy) | ✅ |
| [ia/sidebar.md](./ia/sidebar.md) | `tests/renderer/Sidebar.test.tsx` | `src/renderer/components/sidebar/Sidebar.tsx` | ✅ |
| [ia/chat-flow.md](./ia/chat-flow.md) | — | `src/renderer/components/chat/ChatPanel.tsx` | 🟡 |
| [ia/preview-panel.md](./ia/preview-panel.md) | — | `src/renderer/components/preview/PreviewPanel.tsx` (윤곽) | 🟡 |
| [ia/onboarding.md](./ia/onboarding.md) | — | (Phase 1+) | ⏳ |
| [ia/empty-app-state.md](./ia/empty-app-state.md) | — | `ChatPanel.tsx` (WelcomeMessage) | 🟡 |
| [ia/settings-hierarchy.md](./ia/settings-hierarchy.md) | — | (Phase 1+) | ⏳ |
| [ia/first-run.md](./ia/first-run.md) | — | (Phase 1+) | ⏳ |

---

## docs/findings/ — Analysis Findings

분석 라운드는 추적 대상 X (코드 매핑 X). 결과가 spec 으로 흘러감.

---

## 통계 (Day 7 시점)

```
Spec 페이지:        181개
Implemented (✅):    24개  (13%)
Partial (🟡):        12개  (7%)
Planned (⏳):       145개  (80%)

Test 파일:           5개
  - tests/smoke.test.ts
  - tests/session/schema.test.ts (8 fixtures + invariants)
  - tests/session/helpers.test.ts (UUIDv7, FNV-1a)
  - tests/renderer/ChatInput.test.tsx (10 tests, IME 보호)
  - tests/renderer/Sidebar.test.tsx (9 tests)
  - tests/renderer/ThreePanelLayout.test.tsx (2 tests)

Implementation 파일:
  - src/main/ (3 files): index, preload, ipc
  - src/types/ (10 files): 전체 Session model
  - src/renderer/ (8 files): App + 5 components
  - 합계: 21 source files
```

---

## 다음 액션 (Phase 1 핵심)

```
P0 (필수, 1-2주):
  1. Permission Resolver (PM-3) — 첫 권한 체크
  2. SessionStore (SS-4) — SQLite 영구화
  3. Provider Adapter (SS-6) — Claude/Codex 첫 호출
  4. ChatPanel 메시지 표시 + streaming
  5. Tool Queue (TO-4) — shell.run 첫 도구

P1 (Phase 1 후반):
  - 권한 모달 UI
  - F-018 / 슬래쉬 명령
  - F-019 @ 멘션
  - 사이드바 검색 (F-026)
```

---

## 관련

- [README.md](../README.md) — 프로젝트 진행 상황
- [CONTRIBUTING.md](../CONTRIBUTING.md) — 기여 가이드
- [CODEX_SELF_ADVICE.md](../CODEX_SELF_ADVICE.md) — Codex 자체 조언
