# Bootstrap Prompt — 다음 세션 시작용

> **사용법**: 새 Claude Code 세션에서 본 문서의 § 2 또는 § 3 의
> **그대로 복사 붙여넣기**. 모드별 옵션 제공.
>
> **위치**: `docs/bootstrap-prompt.md`
> **참조 문서**:
> - `docs/status-2026-05-07-v2.md` — Batch #1~#3 완료 시점 스냅샷 (최신)
> - `docs/v1.x-next-batch.md` — 다음 batch (#4) 슬롯 정의 + WHY
> - `docs/extra-namespace-audit.md` — v1.8 트랙 audit 결과
> - `docs/extra-namespace-schema.md` — v1.8.2 canonical schema reference

> **현 상태 (2026-05-07 저녁)**: Batch #1~#3 모두 완료. 마지막 commit
> `8a02d6f`, baseline 2045/7, package.json 1.8.3.
>
> **다음 권장 작업**: § 2 (Batch #4 ulw — column-only 마무리 + 비정규화
> + baseline 7 fail 정리, 약 120분).

---

## 1. 사전 체크리스트 (세션 시작 전 1분)

### 1.1 OMC 위임 활성화 확인 (선택)
```bash
# claude.ai/settings/usage 에서 1M context billing 활성화 확인.
# 활성 시 ultrapilot/swarm 등 멀티 에이전트 모드 사용 가능.
# 비활성 시 메인 세션 직접 편집만 가능 (ecomode 도 single-thread 동작).
```

### 1.2 Git 상태 확인
```bash
cd "C:\Dev\분석\dreampia-dev"
git status                 # 깨끗해야 함 (settings.json 외)
git log --oneline -3       # 마지막 commit = 560f26e (v1.4.8)
git push origin main       # 109 commits ahead — push 권장
```

### 1.3 Test baseline 확인
```bash
npx vitest run 2>&1 | tail -3
# Expected: 1988 passed / 7 failed (baseline) / 175 files
```

---

## 2. **권장 Prompt** — Batch #4 ulw (4 슬롯, 정리 트랙)

> **시간**: ~120분 / **모드**: ulw (메인 세션 직렬) / **리스크**: 중
>
> v1.8.4 column-only 마무리 + 비정규화 정리 (v1.4.12, v1.4.13) +
> baseline 7 fail 정리. Batch #1~#3 의 후속.

```
Dreampia-Dev 작업 재개. 작업 디렉토리: C:\Dev\분석\dreampia-dev

## 현재 상태
- 마지막 commit: 8a02d6f (status v2 snapshot)
- package.json: 1.8.3
- baseline: 2045 passed / 7 failed (workspace pick 5 + SessionStore migration 2)
- 자세한 현황: docs/status-2026-05-07-v2.md
- 다음 batch 정의: docs/v1.x-next-batch.md § 4 (Batch #4)

## 이번 세션 목표 — Batch #4 4 슬롯 (ulw 직렬)

1. v1.8.4 — _extra write 제거 (column-only transition 마무리)
   - buildStoredMetadata 의 _extra.permission.default_level / _extra.plan.active 직렬화 stop
   - MetadataExtraSchema 의 두 필드 optional 또는 제거
   - 신규 unit: insert 후 metadata_json._extra 에 두 필드 부재 검증
   - 기존 테스트의 _extra assertion 업데이트
   - 파일: src/storage/SessionStore.ts, src/storage/metadataExtraSchema.ts, tests

2. v1.4.12 — permission.grants 비정규화 정리
   - buildStoredMetadata 가 _extra.permission.grants 더이상 직렬화 X
   - assembleSession 은 loadGrants 만 사용 (이미 그러함, 재확인)
   - MetadataExtraSchema.permission.grants 제거 또는 optional
   - 신규 unit: round-trip 시 _extra.permission.grants 가 metadata 에 없어도 정상

3. v1.4.13 — plan.checklist 비정규화 정리
   - buildStoredMetadata 의 _extra.plan.checklist 직렬화 stop
   - plan_items 테이블만 source of truth
   - 신규 unit

4. baseline-7-fix — pre-existing 7 fail 정리
   - tests/main/sessions.workspace-pick.* 5 fail (Win path) — 분석 + 수정
   - tests/storage/SessionStore.test.ts:73,82 의 toBe(5) → toBe(LATEST_SCHEMA_VERSION)
   - 모두 pass 후 baseline 0/0 달성

## 진행 방식 (각 슬롯)
1. typecheck clean
2. 신규 unit (mock + assertion)
3. 회귀 0
4. lint 변경 파일 clean
5. CHANGELOG.md entry + package.json bump
6. commit: feat(domain): vN.N.N — 한 줄 요약 + 본문
7. 다음 슬롯

## 환경 주의
- 베이스라인 2045/7. 슬롯 4 (baseline-7-fix) 후 0/0 목표.
- 현재 16 commits ahead of origin/main (push 직후라 0).
- pre-existing dirty:
  - tests/storage/permissionGrants.idText.test.ts (이번 batch 무관)
  - settings.json untracked (build artifact)

## 진행 후
- batch 완료 시 docs/v1.x-next-batch.md § 4 에 ✅ 마킹 + 실제 시간.
- docs/status-{date}.md 새로 작성 (스냅샷 패턴).
- git push origin main 권장 (사용자 승인 후).

자동 진행 시작.
```

---

## 2-legacy. **이전 Batch 시작 prompt** — Batch #1 ultrapilot (병렬 5 슬롯)

> **시간**: ~90분 / **모드**: ultrapilot / **리스크**: 낮음 / **가시성**: 높음
>
> 5개 독립 슬롯 (v1.7.26, v1.6.20, v1.7.27, v1.4.9, v1.7.28) 을 file
> ownership 분할 후 병렬 진행. 약 3x 가속 예상.

```
Dreampia-Dev 작업 재개. 작업 디렉토리: C:\Dev\분석\dreampia-dev

## 현재 상태
- 마지막 commit: 560f26e (v1.4.8 — workspace_id sha256 default + backfill modal)
- package.json: 1.4.8 (트랙 1.4.x)
- baseline: 1988 passed / 7 failed (workspace pick 5 + SessionStore migration 2)
- 자세한 현황: docs/status-2026-05-07.md

## 이번 세션 목표 — Batch #1 ultrapilot 병렬 실행

다음 5개 독립 슬롯을 ultrapilot 모드로 동시 진행:

1. v1.7.26 — Audit log DB persistence
   - getAutomationManager() 의 auditSink → AuditLogStore.recordEvent 연결
   - AutomationAuditEvent 의 output/handler_name/error 를 target_json 직렬화
   - 신규 IPC: automation/audit-log (최근 N개 조회)
   - 파일: src/main/index.ts, src/main/automation/AutomationManager.ts,
     src/main/ipc.ts, src/main/preload.ts
   - 신규 unit: tests/main/automation.audit.test.ts

2. v1.6.20 — ChatPanel 잔여 i18n
   - src/renderer/components/chat/ChatPanel.tsx 의 hardcoded 한국어
     문자열을 모두 t() 통과로 변경
   - ko/en pair 추가 (messages.ko.json + messages.en.json)
   - tests/renderer/i18n/i18n.coverage.test.ts 가 자동 검증

3. v1.7.27 — Automation rule enable/disable toggle
   - AutomationRule + persisted shape 에 enabled?: boolean (default true)
   - AutomationManager: disabled 면 schedule 등록 X, fire 시 skip + audit
   - IPC: automation/set-enabled(name, enabled)
   - AutomationModal UI: rule 항목에 toggle switch
   - i18n ko/en 2 키
   - 파일: AutomationManager / settings / ipc / preload / AutomationModal /
     i18n / 신규 unit

4. v1.4.9 — Workspace cache invalidation (post-backfill)
   - BackfillPromptModal 의 결과 화면 onDone 시 sessions 전체 refetch
   - App.tsx: loadSessions() 노출 + 전달
   - Test: backfill 후 새 createSession 이 sha256 id 로 정상 insert
   - 파일: BackfillPromptModal.tsx, App.tsx, 신규 unit

5. v1.7.28 — Automation rule import/export JSON
   - IPC: automation/export → JSON 반환
   - IPC: automation/import(json) → handler registry validation + dryrun
   - AutomationModal UI: 헤더에 [내보내기] [가져오기] 버튼
   - 보안: import 는 user confirm 필수
   - 파일: ipc / preload / AutomationModal / i18n / unit test

## 진행 방식 (각 슬롯 공통)
1. typecheck clean 확인
2. 신규 unit test 출하 (mock IPC + assertion)
3. 기존 unit 회귀 0 확인 (npm test — pre-existing 7 fail baseline)
4. lint 변경 파일 clean
5. CHANGELOG.md 슬롯 entry + package.json version bump
6. commit: feat(domain): vN.N.N — 한 줄 요약 + 본문
7. 다음 슬롯 즉시 (단, 충돌 row 가 발견되면 조정자가 머지)

## ultrapilot 활성화 + 시작
"ultrapilot 위 5개 슬롯 동시 시작" 으로 활성화.
파일 충돌 분석:
- v1.7.26 + v1.7.27 + v1.7.28: 모두 automation 영역 → AutomationManager.ts
  / ipc.ts / preload.ts / AutomationModal.tsx 공유. 순차 또는 careful merge.
- v1.6.20: ChatPanel + i18n 만 → 독립.
- v1.4.9: BackfillPromptModal + App.tsx → 다른 영역 → 독립.

→ 실제 병렬: v1.6.20 + v1.4.9 + (v1.7.26 → v1.7.27 → v1.7.28 sequential)
   = 약 100-120분 (sequential 240min 의 ~2x 가속).

## 환경 주의
- OMC 서브에이전트 위임이 1M context billing 활성 시만 동작.
  비활성이면 ultrapilot → ecomode (single-thread) 로 자동 fallback.
- pre-existing dirty:
  - tests/storage/permissionGrants.idText.test.ts (이번 작업 무관)
  - settings.json untracked (build artifact)

## 진행 후
- batch 완료 시 docs/status-{date}.md 새로 작성 (스냅샷 패턴).
- v1.x-next-batch.md 의 Batch #1 슬롯들에 ✅ + 실제 시간 추가.
- git push origin main 권장.

자동 진행 시작.
```

---

## 3. **대안 Prompt 1** — Batch #1 ecomode 단일 트랙

> **시간**: ~240분 (4시간) / **모드**: ecomode / **리스크**: 매우 낮음
>
> 슬롯 1개씩 순차. 토큰 절감 우선. 위험 적은 보수 전략.

```
Dreampia-Dev 작업 재개. 작업 디렉토리: C:\Dev\분석\dreampia-dev

## 현재 상태
v1.4.8 (560f26e) baseline 1988/7. 자세한 건 docs/status-2026-05-07.md.

## 이번 세션 목표 — ecomode 순차 5 슬롯

docs/v1.x-next-batch.md 의 Batch #1 다섯 슬롯을 다음 순서로 진행:

1. v1.6.20 — ChatPanel 잔여 i18n        (30min, low risk)
2. v1.4.9 — Workspace cache invalidation (45min, low risk)
3. v1.7.26 — Audit log DB persistence    (60min, medium risk)
4. v1.7.27 — Automation rule toggle       (45min, low risk)
5. v1.7.28 — Automation import/export    (60min, medium risk)

## 모드
ecomode 단일 트랙 (defaultExecutionMode 확인 후, 미설정이면 직접 명시).
각 슬롯: 단순 작업 (i18n / settings / type) → Haiku 자동 라우팅 / 복잡
작업 (handler / IPC) → Sonnet.

## 슬롯별 진행 패턴 (각각)
1. typecheck clean
2. 신규 unit (mock + assertion)
3. 회귀 0 (1988 passed baseline 유지)
4. lint clean
5. CHANGELOG entry + version bump
6. commit "feat(domain): vN.N.N — 한 줄 + 본문"
7. 다음 슬롯

## 슬롯 디테일
docs/v1.x-next-batch.md 의 § 1 "Batch #1" 의 각 슬롯 항목 그대로 따름.

## 환경
- OMC 위임 비활성이어도 동작 (단일 세션 직접 편집).
- baseline 7 fail 무관.

자동 진행 시작.
```

---

## 4. **대안 Prompt 2** — 단일 슬롯 tdd (test-first)

> **시간**: ~60-90분 / **모드**: tdd / **리스크**: 낮음
>
> test surface 가 새롭거나 (handler 새 종류 등) 단일 슬롯에 집중.

```
Dreampia-Dev v1.7.26 단일 슬롯 — tdd 모드.

## 작업 디렉토리
C:\Dev\분석\dreampia-dev

## 현재 상태
v1.4.8 baseline 1988/7. docs/status-2026-05-07.md 참조.

## 슬롯: v1.7.26 — Audit log DB persistence

### WHY
v1.7.23~25 에서 자동화 handler 가 결과를 audit event 로 emit 하지만
현재는 console.error 만. AuditLogStore (v1.0.x 부터 존재) 에 영구
저장 + 조회 가능해야 디버깅/모니터링 실용성.

### 범위
- getAutomationManager() 부팅 시 auditSink 를 AuditLogStore.recordEvent
  로 연결 (DI 패턴)
- AutomationAuditEvent 의 output/handler_name/error 를 target_json 으로
  직렬화
- 신규 IPC automation/audit-log(rule_name?, limit?) — 최근 N 조회
- 신규 preload automation.auditLog()

### TDD 순서 강제
1. 먼저 tests/main/automation.audit.test.ts 작성 (red):
   - audit event 생성 후 AuditLogStore 에 row 존재 검증
   - target_json 의 round-trip JSON parse
   - rule_name 필터 + limit 동작
2. 그 다음 prod 코드:
   - AutomationManager 의 auditSink injection point 확인
   - main/index.ts 부팅 시 store 가 있을 때만 wire
   - IPC handler 추가
3. typecheck → unit (red→green) → 회귀 → lint → commit

### 파일
- src/main/index.ts (boot wire)
- src/main/automation/AutomationManager.ts (audit event shape 변경 X,
  단 export 추가 가능)
- src/main/ipc.ts (automation/audit-log 핸들러)
- src/main/preload.ts (auditLog() 노출)
- tests/main/automation.audit.test.ts (신규)
- CHANGELOG.md (v1.7.26 entry)
- package.json (1.4.8 → 1.7.26)

### 검증
- typecheck clean
- 신규 unit ≥3 PASS (audit row + filter + limit)
- 기존 ipc.automation 19 + automation.handlers 15 + automation.shellExec 10
  + automation.ipcTrigger 9 = 53 회귀 0
- baseline 1988 → 1991+ (+신규 tests)
- lint 변경 파일 clean

### Commit
feat(automation): v1.7.26 — audit log DB persistence

본문: AuditLogStore wire-up + IPC + preload + 신규 unit tests.

자동 진행 시작.
```

---

## 5. **대안 Prompt 3** — 위험 슬롯 pipeline:refactor

> **시간**: ~120-180분 / **모드**: pipeline:refactor / **리스크**: 높음
>
> v1.8.0 (_extra audit) 또는 v1.8.1 (column promote) 같은 마이그레이션
> 슬롯. architect 사전 검증 + critic 사후 검증 강제.

```
Dreampia-Dev v1.8.0 — _extra namespace usage audit (pipeline:refactor).

## 작업 디렉토리
C:\Dev\분석\dreampia-dev

## 현재 상태
v1.4.8. docs/status-2026-05-07.md / docs/v1.x-next-batch.md § 3 참조.

## 슬롯: v1.8.0 — _extra namespace audit (read-only deliverable)

### WHY
v1.4.4-v1.4.6 에서 도입된 _extra.{workspace|terminal|browser|plan|permission}
는 schema-less JSON. 일부는 자주 query → column promote 필요. 일부는
array → JSON 유지 적합. **무엇을 promote 할지 결정의 input 데이터**가
필요.

### Pipeline 모드 (자동 활성)
explore → architect-medium → executor (read-only) → code-reviewer

### 단계
1. **explore** (Sonnet)
   - 모든 src/storage/migrations 의 _extra 컬럼 정의 확인
   - 모든 caller (read/write) grep
   - 각 namespace 별 frequency map

2. **architect-medium** (Sonnet)
   - explore 결과 분석
   - column promote 후보 vs JSON 유지 결정 기준 제안
   - schema 추론 (TypeScript or zod)

3. **executor** (Sonnet, READ-ONLY)
   - architect 결과를 docs/extra-namespace-audit.md 로 출력
   - 각 namespace 별 표 + 권고

4. **code-reviewer** (Opus)
   - audit 문서 검토
   - 누락 caller / wrong frequency / over-eager promote 제안 검출

### 산출물
- docs/extra-namespace-audit.md (신규)
- 코드 변경 0 (다음 슬롯 v1.8.1 의 input)

### Commit
docs(audit): v1.8.0 — _extra namespace usage audit

자동 진행 시작.
```

---

## 6. 시작 후 디버깅 패턴

진행 중 문제 발생 시 권장 액션:

| 증상 | 액션 |
|---|---|
| typecheck 에러 | 실패 line 보고 → 한 줄 fix → re-typecheck |
| unit test 신규 RED | 의도치 않은 회귀? 검토 후 fix or expected 갱신 |
| lint 에러 (변경 파일) | 즉시 fix, 통과 안 하면 commit 차단 |
| baseline 1988 fail 추가 | 회귀 — 즉시 분석. 직전 변경 revert 가능 |
| ultrapilot file conflict | merge 시도 → 실패 시 ecomode fallback |

---

## 7. 세션 종료 시 체크리스트

```bash
# 1. 모든 commit 됐는지
git status

# 2. 마지막 commit 확인
git log --oneline -5

# 3. CHANGELOG 와 package.json 동기 확인
cat package.json | grep version
head -5 CHANGELOG.md

# 4. 다음 세션 위해 status 갱신 (선택)
cp docs/status-2026-05-07.md docs/status-$(date +%Y-%m-%d).md
# 새 status 파일 편집 후 다시 commit

# 5. push (네트워크 가능 시)
git push origin main
```

---

## 8. 자주 묻는 질문

### Q1. ultrapilot vs ecomode 어떻게 결정?
- **ultrapilot**: OMC 위임 활성 + 시간 여유 + 슬롯 5+ 묶음.
- **ecomode**: 위임 비활성 또는 보수적 진행 또는 1-2 슬롯.

### Q2. baseline 7 fail 은 신경 써야?
- 아님. workspace pick (windows path) + SessionStore migration 회귀로
  이번 작업과 무관. 회귀 detection 시 기준선만 쓰면 됨.

### Q3. _extra audit (v1.8.x) 을 먼저 해야 하나?
- 추천 X. 사용자 가시 슬롯 (Batch #1) 먼저 → 가시성 + 모멘텀.
  _extra 는 위험도 높고 사용자가 즉각 못 봄.

### Q4. 위 prompts 가 너무 길어 보이는데?
- 디테일이 많을수록 슬롯이 1번에 깔끔하게 land. 짧은 prompt 는
  의도 손실. 본 prompt 는 그대로 복붙용.

### Q5. 슬롯 우선순위가 바뀌면?
- `docs/v1.x-next-batch.md` 의 해당 batch 섹션 갱신 → commit.
- 본 bootstrap-prompt.md 의 § 2 prompt 도 슬롯 번호/순서 동기화.
