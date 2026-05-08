# ADR-0002 — `MetadataExtra` legacy optional 필드 strict removal 시점

> **Status**: Accepted
> **Date**: 2026-05-09
> **Phase**: A5 (v1.9.0 hotfix sweep) — Open Questions Q2 land
> **Authors**: 사용자 결정 (2026-05-08) + Claude Code (Opus 4.7)
> **Related**: [ADR-0001](0001-cli-provider-timeout.md), [v2.x-roadmap.md](../v2.x-roadmap.md)

---

## Context

`MetadataExtraSchema` (`src/storage/metadataExtraSchema.ts`) 는 SQLite
`sessions.metadata_json._extra` 의 strict zod 컨트랙트다. v1.8.0~1.8.4
column-promote 트랜지션 결과 두 필드가 **legacy optional** 로 남아있다:

| 필드 | Source-of-truth column (v1.8.1+) | metadata_json 직렬화 |
|------|-----------------------------------|----------------------|
| `plan.active` | `sessions.plan_active INTEGER` | v1.8.4 부터 write 안 함 |
| `permission.default_level` | `sessions.permission_default_level TEXT` | v1.8.4 부터 write 안 함 |

v1.8.4 (`buildStoredMetadata`) 가 두 필드 직렬화를 중단한 후, schema 의
`.optional()` 은 **과거 row 호환용** 으로만 존재한다 — pre-v1.8.4 row 가
load 될 때 strict parse 가 실패하지 않도록 받아주되, 신규 row 의 metadata
에는 절대 들어가지 않는다.

### 왜 즉시 strict 강제 (`.required()`) 를 안 했나

v1.8.4 시점 trade-off (Codex Q11 권고):
- ✅ **즉시 제거 시 장점**: schema 가 "single source of truth = column" 라
  는 invariant 를 컴파일 타임에 강제. dead code 정리.
- ❌ **즉시 제거 시 단점**: pre-v1.8.4 사용자가 v1.8.4+ 설치 시 모든 기존
  세션의 metadata 가 schema parse fail → load 거부. 사용자 데이터 손실.

v1.8.4 는 안전 우선으로 `legacy optional` 유지 결정. 본 ADR 은 strict
강제 시점을 명시한다.

## Decision

**v2.0.0 의 Phase B breaking change 흐름에 묶어서 strict 강제한다.**

근거 (사용자 결정 Q2 2026-05-08, [v2.x-roadmap.md](../v2.x-roadmap.md) line 110):

> [x] **`MetadataExtra` legacy optional** strict removal: **v2.0.0** (Phase B breaking 흐름에 묶음)

### v1.9.0 동작 (현재)
- `plan.active`, `permission.default_level` 모두 `.optional()` 유지
- `buildStoredMetadata` 직렬화 중단 (v1.8.4 부터 적용 중)
- pre-v1.8.4 row load 호환

### v2.0.0 동작 (Phase B)
- `MetadataExtraSchema` 의 두 필드 **삭제** (single source = column)
- 마이그레이션 015+ 에서 모든 row 의 `metadata_json` 정규화 → 두 필드 strip
- pre-migration row 가 v2.0.0 binary 로 load 시 schema parse fail 가능 →
  마이그레이션이 먼저 돌아 strip 보장

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **v1.9.0 즉시 strict** | ✗ 기각 — semver 위반 (v1.x 라인의 schema breaking). pre-v1.8.4 사용자 데이터 손실 risk |
| **v2.1.0 deferred** | ✗ 기각 — v2.0.0 가 이미 breaking (Phase B Plugin API), 한 wave 에 정리하는 것이 semver clarity 좋음 |
| **deprecation warning + telemetry** | ✗ 기각 — legacy optional 은 이미 dead-write 상태라 user-visible warning 의미 없음 |
| **column-only 표면화 (UI 수준)** | ✗ 기각 — schema parse 거동과 무관, 별 작업 |

## Consequences

### Positive
- v2.0.0 = Phase B Plugin breaking + schema strict 한 wave 로 정리 → semver communication 명확
- v2.0.0 마이그레이션 015+ 에서 모든 row metadata 정규화 → schema 와 storage 일관
- v1.9.0 사용자는 schema 변경 영향 없음 (silent)

### Negative
- **v1.x → v2.0.0 down-grade 차단**: v2.0.0 마이그레이션이 metadata strip 한 후엔 v1.x binary 가 load 가능하지만 의미적 차이 없음. 단 v2.0.0 에서 추가된 다른 column 이 down-grade 시 무시될 risk 는 별도 (v2.0.0 down migration script 가 cover 해야).
- **maintenance window 길어짐**: v1.8.4 (2026-04-XX) → v2.0.0 (예상 ~2026-05~06) 까지 dead schema field 유지. 단 코드 영향 12 줄 (`active?: ...`, `default_level?: ...` 와 주석 4 줄 × 2 = 12 줄), maintenance burden 작음.

### Future Work
- **v2.0.0 Phase B 진입 시**: 본 ADR 의 "v2.0.0 동작" 섹션이 implementation 가이드. migration 015 spec 작성 + `MetadataExtraSchema` 두 줄 삭제 + `tests/storage/extraSchemaContract.test.ts` 의 legacy 케이스 제거.
- **v2.0.0 release notes**: down-grade 영향 + migration 자동성 명시 필수.

## Compatibility Matrix

| 사용자 binary | row metadata 상태 | load 결과 |
|---------------|-------------------|-----------|
| v1.7.x (pre-promote) | column 미존재 + `_extra.{plan.active, permission.default_level}` 존재 | (해당 binary 가 자체 동작) |
| v1.8.0~1.8.3 | column dual-write + `_extra` dual-write | OK (column 우선 read) |
| v1.8.4~1.9.x | column write + `_extra` 미직렬화 (legacy row 는 _extra 잔존) | OK (legacy optional 호환) |
| **v2.0.0** | column write + migration 으로 _extra 정규화 | OK (schema strict, 두 필드 부재 강제) |

## Test Coverage

| Test | Layer | 목적 |
|------|-------|------|
| `tests/storage/extraSchemaContract.test.ts` | vitest | 등록되지 않은 _extra 필드 거부 + legacy optional round-trip 호환 |
| `tests/storage/extraColumnPromote.test.ts` (v1.8.1~1.8.4) | vitest | column-only read + dual-write transition 단계 검증 |
| `tests/storage/SessionStore.test.ts` | vitest | LATEST_SCHEMA_VERSION 회귀 lock |

v2.0.0 strict 진입 시 추가 필요:
- `tests/storage/migration015.test.ts` (가칭) — metadata strip 검증
- `extraSchemaContract.test.ts` 의 "legacy field 가 strict 에 거부됨" 케이스

---

## References

- 코드: `src/storage/metadataExtraSchema.ts:69-79` (`PlanExtraSchema.active`)
- 코드: `src/storage/metadataExtraSchema.ts:81-91` (`PermissionExtraSchema.default_level`)
- 컨텍스트: `docs/v1.x-next-batch.md:239-256` (v1.8.4 trade-off 기록)
- 사용자 결정: `docs/v2.x-roadmap.md:108-110` (Open Questions Q2 resolved 2026-05-08)
- 관련 ADR: [ADR-0001 CLI provider timeout](0001-cli-provider-timeout.md)
