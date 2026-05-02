---
title: Permission Model — 4단계 Level
parent: ./_index.md
related:
  - ./capabilities.md
  - ./resolver.md
status: draft
last_updated: 2026-05-02
---

# 4단계 권한 Level

> **한 줄 요약**: Codex 의 3-tier sandbox + 4번째 custom level. 세션 기본값 + 사용자 변경 가능.

---

## 4단계 시스템

```
LEVEL 1: read_only         (Codex 1단계)
LEVEL 2: workspace_write   (Codex 2단계, 기본값)
LEVEL 3: full_access       (Codex 3단계)
LEVEL 4: custom            (사용자 정의 — Codex 미지원)
```

---

## LEVEL 1: read_only

```
✓ LOCAL_READ
✓ NETWORK_LOCAL
✓ NETWORK_AI
✓ SYSTEM_NOTIFICATION
✗ LOCAL_WRITE.*
✗ LOCAL_EXECUTE
✗ NETWORK_REMOTE
✗ SYSTEM_AUTOMATION
```

**용도**:
- 코드 분석 / 리뷰 (변경 X)
- /플랜 모드의 자동 적용 base
- 처음 진입한 미신뢰 디렉토리

**UI 표시**: 🔒 읽기 전용

---

## LEVEL 2: workspace_write (기본값)

```
✓ LEVEL 1 모두
✓ LOCAL_WRITE.* (작업 디렉토리 한정)
✓ LOCAL_EXECUTE (작업 디렉토리 한정)
✓ NETWORK_REMOTE.read (외부 GET)
✓ SYSTEM_CLIPBOARD.read
✗ LOCAL_OUTSIDE_CWD.*
✗ LOCAL_EXECUTE.elevated
✗ NETWORK_REMOTE.upload (★ 데이터 송신)
✗ SYSTEM_AUTOMATION
```

**용도**:
- 일반 개발 (가장 흔함)
- 코드 수정 + 빌드 + 테스트

**UI 표시**: 🔵 워크스페이스 쓰기

---

## LEVEL 3: full_access

```
✓ LEVEL 2 모두
✓ LOCAL_OUTSIDE_CWD.*
✓ LOCAL_EXECUTE.elevated (★ Ask each)
✓ NETWORK_REMOTE.upload
✓ SYSTEM_AUTOMATION
✓ SYSTEM_CLIPBOARD.write
✓ SYSTEM_HOTKEY
```

**용도**:
- 시스템 설정 변경 작업
- 데이터 동기화 (외부 서버 송신)
- 고급 사용자

**UI 표시**: 🔓 전체 접근

**주의**: 이 level 에서도 `danger-patterns.md` 의 자동 차단은 유효 (System32 등 절대 차단).

---

## LEVEL 4: custom

```
사용자가 capability 별로 명시적 grant 설정
→ "이 디렉토리는 읽기만, 저 디렉토리는 쓰기까지" 등
```

**용도**:
- 정밀한 권한 관리 원하는 고급 사용자
- 보안 민감 환경 (감사 대상)

**UI**:
```
┌────────────────────────────────────────────────┐
│ 사용자 지정 권한                               │
├────────────────────────────────────────────────┤
│ ✓ LOCAL_READ                                   │
│ ✓ LOCAL_WRITE.modify                           │
│   대상: C:\Dev\foo (recursive)                 │
│ ✓ LOCAL_EXECUTE                                │
│   허용 명령: npm, git, node                    │
│   거부 명령: rm -rf, format                    │
│ ✗ LOCAL_OUTSIDE_CWD                            │
│ ✓ NETWORK_REMOTE.read                          │
│   허용 도메인: github.com, npmjs.com           │
│ ✗ NETWORK_REMOTE.upload                        │
│ ...                                            │
└────────────────────────────────────────────────┘
```

---

## Level 선택 UI

세션 입력창 → 권한 dropdown:
```
┌─────────────────────────────────┐
│ 🔵 워크스페이스 쓰기 (기본값)   │ ← 현재
├─────────────────────────────────┤
│ 🔒 읽기 전용                    │
│ 🔵 워크스페이스 쓰기            │
│ 🔓 전체 접근                    │
│ ⚙ 사용자 지정...                │
└─────────────────────────────────┘
```

**조건**:
- /플랜 모드 활성 시 자동 read_only + dropdown 숨김
- 세션 default 는 일반적으로 workspace_write
- Level 변경은 세션 단위 (다른 세션에 영향 X — P7)

---

## Level → Capability 매핑 코드

```typescript
const LEVEL_CAPABILITIES: Record<PermissionLevel, Set<Capability>> = {
  read_only: new Set([
    'LOCAL_READ',
    'NETWORK_LOCAL',
    'NETWORK_AI',
    'SYSTEM_NOTIFICATION',
  ]),
  
  workspace_write: new Set([
    ...LEVEL_CAPABILITIES.read_only,
    'LOCAL_WRITE',
    'LOCAL_WRITE.create',
    'LOCAL_WRITE.modify',
    'LOCAL_WRITE.rename',
    // 'LOCAL_WRITE.delete' 는 별도 confirm
    'LOCAL_EXECUTE',
    'NETWORK_REMOTE',
    'NETWORK_REMOTE.read',
    'SYSTEM_CLIPBOARD.read',
  ]),
  
  full_access: new Set([
    ...LEVEL_CAPABILITIES.workspace_write,
    'LOCAL_OUTSIDE_CWD',
    'LOCAL_OUTSIDE_CWD.read',
    'LOCAL_OUTSIDE_CWD.write',
    'LOCAL_EXECUTE.elevated',  // 단, 매번 confirm
    'NETWORK_REMOTE.upload',
    'SYSTEM_AUTOMATION',
    'SYSTEM_AUTOMATION.cron',
    'SYSTEM_AUTOMATION.event',
    'SYSTEM_CLIPBOARD.write',
    'SYSTEM_HOTKEY',
  ]),
  
  custom: new Set(),  // 사용자가 직접 채움
};
```

---

## Level 변경 흐름

```typescript
async function changeLevel(sessionId: SessionId, newLevel: PermissionLevel) {
  // 1. 현재 활성 grants 검사
  const conflicting = findConflictingGrants(sessionId, newLevel);
  
  if (conflicting.length > 0) {
    // 사용자에게 확인
    const confirm = await showModal({
      title: '권한 level 변경',
      body: `다음 grants 와 충돌: ${conflicting.map(g => g.capability).join(', ')}\n취소하시겠어요?`,
      buttons: ['유지하고 변경', '충돌 grants 취소', '취소'],
    });
    
    if (confirm === '취소') return;
    if (confirm === '충돌 grants 취소') {
      for (const g of conflicting) {
        revokeGrant(g.id);
      }
    }
  }
  
  // 2. 세션 default_level 갱신
  db.prepare(`
    UPDATE sessions 
    SET default_level = ?, updated_at = ?
    WHERE id = ?
  `).run(newLevel, new Date().toISOString(), sessionId);
  
  // 3. 감사 로그
  audit.log('level_changed', { sessionId, newLevel });
}
```

---

## 관련

- [capabilities.md](./capabilities.md) — Level 안 capability 정의
- [resolver.md](./resolver.md) — Level + grant 결합 로직
- [provider-mapping.md](./provider-mapping.md) — Codex 3-tier 와 매핑
