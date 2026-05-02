---
title: Session State — Plan 서브 스키마
parent: ./_index.md
related:
  - ./schema.md
  - ../../PERMISSION_MODEL.md
status: draft
last_updated: 2026-05-02
---

# Plan Sub-schema

> **한 줄 요약**: /플랜 모드 활성 시 체크리스트 + 브라우저 도구 + 자동 read-only 강제.

---

## PlanState 인터페이스

```typescript
interface PlanState {
  active: boolean;                     // /플랜 모드 ON?
  
  checklist?: PlanItem[];              // ⊟ 체크리스트
  current_item_index?: number;
  
  browser_tool_enabled: boolean;       // 🌐 브라우저 도구 활성
  
  // Plan 모드는 read-only
  // 권한 dropdown 자동 hidden
}
```

---

## PlanItem

```typescript
interface PlanItem {
  id: string;
  text: string;                        // "서버 띄우기"
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  sub_items?: PlanItem[];              // nested
  
  // 자동 추적
  related_turns: TurnId[];
  evidence?: string;                   // 완료 증거 (screenshot, log 등)
}
```

---

## /플랜 모드 활성화 흐름

```
사용자: /플랜 모드  → / 메뉴에서 선택
   ↓
PlanState.active = true
   ↓
입력창 변화:
  before:  [+ ⚠ <텍스트> 5.5 매우 높음 🎤 ▶]
  after:   [+ ⊟ 🌐 <텍스트>     5.5 매우 높음 🎤 ▶]
                ↑  ↑
                |  └ browser_tool_enabled
                └─── 체크리스트 (PlanItem[])
   ↓
권한 dropdown 사라짐 (read-only 강제)
   ↓
PermissionState.temporarily_blocked_capabilities = [
  'LOCAL_WRITE.*',
  'LOCAL_EXECUTE',
  'NETWORK_REMOTE.upload',
  'BROWSER_INTERACT',
  'SYSTEM_AUTOMATION'
]
```

---

## Plan → 실행 전환

```
Plan 모드에서 실행 모드로:
  1. AI 가 checklist 작성 (자동 또는 사용자 요청)
  2. 사용자 검토:
     - 항목 추가/삭제/순서 변경 가능
     - 각 항목 클릭으로 펼쳐서 sub_items 작성 가능
  3. 사용자: "이대로 실행해줘"
  4. UI: 차단된 capability 모두 보여주는 모달
     → "다음 권한이 필요합니다: [...]"
  5. 사용자 확인
  6. PlanState.active = false (또는 유지하면서 추적만)
  7. PermissionState.temporarily_blocked_capabilities = []
  8. AI 가 checklist 따라 순차 실행:
     - current_item_index 갱신
     - 각 item.status 갱신
     - related_turns 자동 추가
```

---

## 체크리스트 추적

### 자동 status 갱신

```typescript
// AI 가 plan 항목과 관련된 작업 완료 시
function markItemDone(planItem: PlanItem, evidence: string) {
  planItem.status = 'done';
  planItem.evidence = evidence;
  planItem.related_turns.push(currentTurn.id);
}

// 예시:
//   item: "서버 띄우기"
//   AI 가 npm run dev 실행 + 200 OK 확인
//   → evidence: "Server listening on :3000, /login returned 200"
//   → status: 'done'
```

### UI 표시

```
┌─────────────────────────────────────────────┐
│ 📋 작업 계획                                │
├─────────────────────────────────────────────┤
│ ✓ 서버 띄우기                               │
│   └─ npm run dev 실행 (3000번 포트)         │
│                                             │
│ ▶ 미리보기 탭 열기                          │ ← in_progress
│                                             │
│ ☐ /login → /dashboard 라우팅 확인           │
│ ☐ 콘솔 에러 체크                            │
└─────────────────────────────────────────────┘
```

---

## 중첩 (sub_items)

```json
{
  "id": "p-001",
  "text": "프론트엔드 빌드",
  "status": "in_progress",
  "sub_items": [
    {
      "id": "p-001-a",
      "text": "TypeScript 컴파일",
      "status": "done",
      "evidence": "tsc --noEmit (0 errors)"
    },
    {
      "id": "p-001-b",
      "text": "Tailwind CSS 빌드",
      "status": "in_progress"
    },
    {
      "id": "p-001-c",
      "text": "이미지 최적화",
      "status": "pending"
    }
  ]
}
```

**규칙**:
- 부모 status 는 자식들 결과로 자동 derived
  - 모두 done → 부모 done
  - 하나라도 in_progress → 부모 in_progress
  - 모두 pending → 부모 pending
- 깊이 제한: max 3 (UI 가독성)

---

## Plan 모드 vs 일반 모드 비교

| 항목 | 일반 모드 | Plan 모드 |
|------|----------|----------|
| LOCAL_READ | ✓ | ✓ |
| BROWSER_NAVIGATE | ✓ | ✓ |
| LOCAL_WRITE | grant 따라 | ✗ 자동 차단 |
| LOCAL_EXECUTE | grant 따라 | ✗ 자동 차단 |
| NETWORK_REMOTE.upload | grant 따라 | ✗ 자동 차단 |
| BROWSER_INTERACT | grant 따라 | ✗ 자동 차단 |
| AI 응답 길이 | 제한 X | 더 상세 (계획 작성) |
| Tool 호출 | 자유 | read-only tools 만 |
| 권한 dropdown | 표시 | 숨김 |
| 체크리스트 UI | 없음 | 자동 표시 |

---

## /속도형 (Speed) 와의 차이

```
/속도형:
  - effort = 'minimum' or 'low' 자동
  - 모델 변경 X (사용자 선택 유지)
  - ⚡ 아이콘 표시
  - 권한은 그대로 (Plan 모드와 다름)

/플랜:
  - effort 자동 변경 X
  - read-only 강제 (Plan 의 핵심)
  - ⊟ 🌐 아이콘 표시
  - 체크리스트 활성화
```

→ 두 모드는 **다른 축**. 동시 활성 가능하나 일반적이진 않음.

---

## 검증 (Invariants)

```
INV-1: active=false 면 checklist 는 옵셔널 (남길 수도 있음)
INV-2: current_item_index 가 있으면 checklist 안에 존재
INV-3: PlanItem.status='done' 이면 evidence 권장 (필수 X)
INV-4: sub_items 깊이 ≤ 3
INV-5: related_turns 의 ID 들은 모두 존재해야
INV-6: active=true → permission.temporarily_blocked_capabilities 비어있지 않음
```

---

## 예시

```json
{
  "active": true,
  "checklist": [
    {
      "id": "p-001",
      "text": "테스트 실패 원인 파악",
      "status": "done",
      "related_turns": ["01a-asst-002", "01a-asst-004"],
      "evidence": "tests/foo.test.ts:15 assertion error"
    },
    {
      "id": "p-002",
      "text": "foo.ts 의 greeting 함수 수정",
      "status": "in_progress",
      "sub_items": [
        {
          "id": "p-002-a",
          "text": "현재 동작 분석",
          "status": "done"
        },
        {
          "id": "p-002-b",
          "text": "수정안 작성",
          "status": "in_progress"
        },
        {
          "id": "p-002-c",
          "text": "수정 후 테스트 재실행",
          "status": "pending"
        }
      ],
      "related_turns": []
    },
    {
      "id": "p-003",
      "text": "PR 작성",
      "status": "pending",
      "related_turns": []
    }
  ],
  "current_item_index": 1,
  "browser_tool_enabled": false
}
```

---

## 관련

- [schema.md](./schema.md) — Session 안에서 plan 의 위치
- [PERMISSION_MODEL.md](../../PERMISSION_MODEL.md) — temporarily_blocked_capabilities
- [conversation.md](./conversation.md) — current_mode='plan' 과 연동
- [DEEP_EXPLORATION_FINDINGS.md](../../DEEP_EXPLORATION_FINDINGS.md) — /플랜 모드 발견 사항
