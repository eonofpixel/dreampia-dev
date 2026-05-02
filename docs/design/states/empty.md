---
title: States — Empty
parent: ../_index.md
related:
  - ../components/empty-state.md
status: draft
last_updated: 2026-05-02
---

# Empty State

> **한 줄 요약**: 데이터가 없을 때 환영 + 다음 행동 권유.

---

## 종류

```
[FirstTime]   처음 진입 (환영)
[Cleared]     사용자가 비움 (의도적)
[Filtered]    필터로 인한 빈 상태
[Error]       에러로 인한 빈 상태
[Migrated]    데이터 마이그레이션 후 (드물게)
```

---

## 시나리오 별

### 채팅 없음

```
[FirstTime]
  👋 안녕하세요
  pyeongtaek-portal 작업 시작
  [추천 prompts]

[Cleared]
  📭 모든 채팅 보관됨
  [보관함 보기]
```

### 검색 결과 없음

```
[Filtered]
  🔍 검색 결과 없음
  "Codex 자동화" 와 일치하는 항목 없음
  [검색어 변경] [필터 제거]
```

### 자동화 없음

```
[FirstTime]
  📭 아직 자동화가 없어요
  매일 09시 자동 코드 리뷰부터 시작해보세요
  [+ 새 자동화]
```

### MCP 서버 없음

```
[FirstTime]
  🔌 MCP 서버 없음
  외부 도구를 연결해서 AI 기능 확장
  [+ MCP 서버 추가] [추천 서버 보기]
```

### 권한 거부됨

```
[Error]
  🚫 접근 권한 없음
  이 워크스페이스를 보려면 권한 설정 필요
  [설정 열기] [다른 워크스페이스]
```

---

## 디자인 가이드

### 시각 위계

```
1. 큰 아이콘/일러스트 (감정 호소)
2. 명확한 한 문장 제목
3. 짧은 설명 (왜 비어있는지)
4. 행동 권유 버튼 (다음 단계)
```

### 톤

```
✓ 긍정적: "시작해보세요" / "추가하기"
✗ 부정적: "데이터 없음" / "발견되지 않음"

✓ 한국어: "안녕하세요"
✗ 영어 only: "No results found"
```

### 너무 많은 정보 X

```
✗ 긴 onboarding 텍스트
✗ 모든 기능 설명
✓ 한 가지 명확한 다음 행동
```

---

## 일러스트레이션 (Phase 2)

```
emoji → SVG illustration:
  📭 → 빈 우편함 (warm 톤)
  🔍 → 돋보기 (큰)
  🚫 → 자물쇠 / 표지판
```

기본 emoji 도 충분 (Phase 1).

---

## 관련

- [../components/empty-state.md](../components/empty-state.md) — 컴포넌트
- [../../ux/patterns/F-029-empty-state.md](../../ux/patterns/F-029-empty-state.md) — 패턴
