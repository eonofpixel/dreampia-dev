---
title: Permission Model — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Permission Model (권한 모델) — Wiki Home

> **한 줄 요약**: Codex `runFullTrust` 패턴 참고하되 **자체 명시적 permission policy**.
>
> **Codex 자체 조언**: *"full trust 자체가 아니라, 어떤 행동 전에 확인이 필요한가, 로컬 파일/브라우저/외부 전송을 어떻게 분리하는가"* — [출처](../../CODEX_SELF_ADVICE.md)

---

## 페이지 목록

### Foundation
- [principles.md](./principles.md) — 7가지 불변 원칙 (default-deny, capability-based 등)
- [capabilities.md](./capabilities.md) — 30+ capability 카테고리 (LOCAL_*, NETWORK_*, BROWSER_*, SYSTEM_*)
- [levels.md](./levels.md) — 4단계 권한 level (read_only / workspace_write / full_access / custom)

### Grant Mechanism
- [grants.md](./grants.md) — Grant 데이터 모델 (target / scope / 만료)
- [resolver.md](./resolver.md) — `isAllowed()` 알고리즘 + Plan 모드 통합
- [audit.md](./audit.md) — 감사 로그 (모든 grant/deny/revoke 기록)

### UI & Behavior
- [ui-flow.md](./ui-flow.md) — Inline / Modal / Toast 권한 요청 UI
- [danger-patterns.md](./danger-patterns.md) — 위험 행동 자동 차단 + secret 검출
- [automation.md](./automation.md) — 자동화 (cron) 의 명시적 grant

### Provider Integration
- [provider-mapping.md](./provider-mapping.md) — Codex 3-tier sandbox + Claude Code hooks 매핑
- [examples.md](./examples.md) — 실제 시나리오 + 테스트

---

## 빠른 답변

| 질문 | 페이지 |
|------|--------|
| 어떤 권한들이 있어? | [capabilities.md](./capabilities.md) |
| 권한 level 차이가 뭐야? | [levels.md](./levels.md) |
| AI 가 권한 요청하면 어떻게 보여? | [ui-flow.md](./ui-flow.md) |
| rm -rf / 같은 거 자동 차단? | [danger-patterns.md](./danger-patterns.md) |
| 권한 사용 이력 보고 싶다 | [audit.md](./audit.md) |
| Codex sandbox 와 어떻게 매핑? | [provider-mapping.md](./provider-mapping.md) |
| Plan 모드는 권한 어떻게 처리? | [resolver.md](./resolver.md) |

---

## Phase 1 작업 항목

| ID | 작업 | 산출물 | 참고 |
|----|------|--------|------|
| PM-1 | Capability enum | `src/permission/Capability.ts` | [capabilities.md](./capabilities.md) |
| PM-2 | Grant model | `src/permission/Grant.ts` | [grants.md](./grants.md) |
| PM-3 | isAllowed() | `src/permission/Resolver.ts` | [resolver.md](./resolver.md) |
| PM-4 | Default level | `src/permission/Levels.ts` | [levels.md](./levels.md) |
| PM-5 | Audit writer | `src/permission/Audit.ts` | [audit.md](./audit.md) |
| PM-6~8 | UI components | `src/ui/Permission*.tsx` | [ui-flow.md](./ui-flow.md) |
| PM-9 | Danger matcher | `src/permission/DangerCheck.ts` | [danger-patterns.md](./danger-patterns.md) |
| PM-10 | Secret detect | `src/permission/SecretDetect.ts` | [danger-patterns.md](./danger-patterns.md) |
| PM-11 | Plan integration | `src/permission/PlanMode.ts` | [resolver.md](./resolver.md) |
| PM-12 | Automation perm | `src/permission/Automation.ts` | [automation.md](./automation.md) |
| PM-13 | Codex mapping | `src/providers/CodexSandbox.ts` | [provider-mapping.md](./provider-mapping.md) |
| PM-14 | Claude hooks | `src/providers/ClaudeHooks.ts` | [provider-mapping.md](./provider-mapping.md) |
| PM-15 | Audit UI | `src/ui/AuditLog.tsx` | [audit.md](./audit.md) |

**총 예상 시간**: 1.5주 (1인 fulltime)

---

## 관련 (외부)

- [docs/session/permission-state](../session/_index.md) — Session 내 PermissionState 통합
- [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) — Tool 실행 시 권한 체크
- [CODEX_SELF_ADVICE.md](../../CODEX_SELF_ADVICE.md) — 우선순위 2번 근거
