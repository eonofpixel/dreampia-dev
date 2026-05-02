---
title: F-036 — 플러그인 마켓플레이스
parent: ../_index.md
priority: P2
phase: Phase 3
---

# F-036: 플러그인 마켓플레이스

> **한 줄 요약**: GitHub-based 플러그인 marketplace. plugin.json 자동 검증.

---

## UI

```
설정 → 플러그인 → 마켓플레이스:

┌─────────────────────────────────────────────┐
│ 플러그인 마켓플레이스       [검색 ▼] [필터]  │
├─────────────────────────────────────────────┤
│ Browser Use         OpenAI                  │
│   In-app browser 자동화                     │
│   ★★★★★ 4.5  📥 12K                       │
│   [설치]                                    │
├─────────────────────────────────────────────┤
│ Spreadsheets       OpenAI                   │
│   Excel/CSV 처리                            │
│   ★★★★☆ 4.2  📥 8K                        │
│   [설치]                                    │
├─────────────────────────────────────────────┤
│ Presentations      OpenAI                   │
│   PowerPoint 자동 생성                      │
│   ★★★★☆ 4.0  📥 6K                        │
│   [설치]                                    │
├─────────────────────────────────────────────┤
│ HuggingFace        Community                │
│   HF 모델 로드                              │
│   ★★★★☆ 4.1  📥 4K                        │
│   [설치]                                    │
├─────────────────────────────────────────────┤
│ Netlify            Community                │
│   Netlify 배포 자동화                       │
│   ★★★☆☆ 3.8  📥 2K                        │
│   [설치]                                    │
└─────────────────────────────────────────────┘
```

## 플러그인 정보 페이지

```
[Browser Use]
┌─────────────────────────────────────────────┐
│ Browser Use                          OpenAI │
│ v0.1.0-alpha1                               │
│ ★★★★★ 4.5 (1,234 reviews)                  │
│ 📥 12,345 downloads                         │
│                                             │
│ [설치]                          [GitHub]    │
├─────────────────────────────────────────────┤
│ 설명:                                       │
│   In-app browser 자동화 (이하 길게)          │
│                                             │
│ Capabilities:                               │
│   ✓ Read   ✓ Write   ✓ Interactive          │
│                                             │
│ Skills:                                     │
│   - browser (41 KB SKILL.md)                │
│                                             │
│ 스크린샷:                                    │
│   [thumb] [thumb] [thumb]                   │
│                                             │
│ Reviews:                                    │
│   ★★★★★ "잘 작동합니다" - user1             │
│   ★★★★☆ "한국어 지원..." - user2            │
└─────────────────────────────────────────────┘
```

## 검증

```
설치 시 자동 체크:
  ✓ plugin.json schema 통과
  ✓ 디지털 서명 (Phase 3+)
  ✓ Capabilities 합리성 (filesystem-only 가 NETWORK 요구하면 경고)
  ✓ 평점 / 리뷰
```

## Source

```
1. 공식 (OpenAI / Anthropic / Dreampia)
2. Community (GitHub repo 등록)
3. 사용자 자체 (로컬 path 또는 zip)
```

## 검색 / 필터

```
카테고리:
  Engineering / Productivity / Data / Design / DevOps

가격:
  Free / Paid (Phase 3+)

권한 요구:
  Read only / Workspace / Full
```

## 출처

- [docs/findings/round3-creators.md](../../findings/round3-creators.md)
- 정적 분석 (5 marketplace 플러그인 string 발견)
