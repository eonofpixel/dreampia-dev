---
title: Session State — 7가지 불변 원칙
parent: ./_index.md
related:
  - ./schema.md
  - ./persistence.md
status: draft
last_updated: 2026-05-02
---

# 7가지 불변 원칙

> **한 줄 요약**: 모든 세션 관련 결정의 헌법.

---

## P1. 세션 = 모든 AI 작업의 최소 단위

```
채팅 1개 = 세션 1개. 더 작게 분할 X.
```

**이유**: 한 세션 안에 대화·터미널·브라우저·권한이 모두 묶여야 의미가 있음. "터미널만 별도 저장" 같은 분리는 컨텍스트 손실로 이어짐.

**예외 X**: 사이드 채팅 / 미니 창 같은 UI 다중성도 내부적으로는 단일 세션 (multi-window).

## P2. 상태는 항상 직렬화 가능 (JSON serializable)

```
허용:    string, number, boolean, null, array, object (plain)
금지:    Function, Promise, DOM Node, Map, Set (직렬화 안 됨)
변환:    Date → ISO8601 string, BigInt → string
```

**이유**: 앱 종료 시 100% 복원 가능해야 함. SQLite 저장 / Export / Import 모두 JSON 기반.

**검증**: `JSON.stringify(session)` 무손실 통과 필수.

## P3. 단일 진실 (Single Source of Truth)

```
✓  user.email 은 한 곳에만 (User 객체)
✗  user.email 을 conversation.user_email 에도 복사 X
✓  Cross-reference 만 허용 (user_id 로 lookup)
```

**이유**: 동기화 버그 원천 차단. 한 곳에서만 update.

**예외**: 성능을 위한 cache 는 명시적 marker 사용 (`_cached_at`).

## P4. Append-only history

```
Turn 삭제 X. archived 플래그만 사용.
```

**이유**:
- 시간 순서 보존 (감사 추적 가능)
- AI 재현성 (같은 입력 → 같은 응답 검증)
- 사용자 mental model (방금 한 말이 사라지면 혼란)

**물리 삭제**: 90일 후 자동 archive → 별도 cold storage (사용자 명시 요청 시만).

## P5. Provider 중립

```
✓  Claude / Codex 어느 쪽이든 동일 schema
✗  Provider-specific top-level 필드 (e.g., session.openai_thread_id)
✓  metadata.codex.* / metadata.claude.* 로 namespacing
```

**이유**: 한 세션이 provider 바뀌어도 (메시지마다 모델 선택) 재호환 필요.

**예시**:
```json
{
  "id": "...",
  "provider": "codex",            // 현재 주
  "metadata": {
    "codex": { "deep_link": "codex://..." },
    "claude": { "vacated_thread_id": "..." }
  }
}
```

## P6. 멀티 윈도우 안전

```
같은 세션이 여러 윈도우에서 열릴 수 있음.
동시 쓰기 충돌 → leader election or CRDT.
```

**이유**: 사용자가 미니 창 / 사이드 채팅 / 메인 창 모두 같은 세션 표시 가능.

**구현**: [multi-window.md](./multi-window.md) — Leader election (heartbeat 5초, TTL 30초).

## P7. 마이그레이션 가능

```
schema_version 필수. 옛 버전 자동 변환.
```

**이유**: 1년 후 schema 변해도 사용자 데이터 손실 X.

**규칙**:
- 버전 increment = 호환 깨지는 변경
- 자동 up-migration (다운그레이드는 optional)
- 마이그레이션 전 백업 자동 생성

상세: [migration.md](./migration.md).

---

## 비목표 (NON-goals)

원칙은 다음을 **포함하지 않음**:

```
❌ 실시간 협업 (Phase 2+)
❌ Cloud sync (Phase 3+)
❌ 멀티 사용자 (단일 사용자 데스크톱 가정)
❌ 분산 시스템 (단일 머신)
❌ Compliance modes (HIPAA, GDPR — Phase 3+)
```

이런 것들은 별도 contract 가 필요. 본 contract 는 **단일 사용자 / 단일 머신 / 로컬 저장** 가정.

---

## 적용 예시

### 좋은 예
```typescript
interface Turn {
  id: TurnId;                    // ✓ P3 - 유일한 식별자
  timestamp: ISO8601;            // ✓ P2 - 직렬화 가능
  archived: boolean;             // ✓ P4 - 삭제 X, flag 만
  // user 정보는 별도 user_id 참조 (P3)
}
```

### 나쁜 예
```typescript
interface Turn {
  id: TurnId;
  timestamp: Date;               // ✗ P2 - Date 객체 (직렬화 안 됨)
  user: User;                    // ✗ P3 - User 전체 복사 (single source of truth 깨짐)
  delete(): void;                // ✗ P2/P4 - 함수 + 삭제
}
```

---

## 관련

- [schema.md](./schema.md) — 이 원칙들이 적용된 실제 schema
- [persistence.md](./persistence.md) — P2 (직렬화) 가 SQLite 에 어떻게 매핑되는지
- [migration.md](./migration.md) — P7 (마이그레이션) 상세
