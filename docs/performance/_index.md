---
title: Performance — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Performance — Wiki Home

> **한 줄 요약**: 100ms 응답 + 60fps 유지 + 200MB 메모리 budget. 측정 기반.

---

## 페이지

### Targets
- [targets.md](./targets.md) — 성능 목표 (응답 / 메모리 / FPS)
- [budgets.md](./budgets.md) — Bundle / Memory / Time budget

### Optimization
- [startup.md](./startup.md) — 앱 시작 시간 단축
- [memory.md](./memory.md) — 메모리 관리
- [rendering.md](./rendering.md) — 60fps 보장
- [bundle.md](./bundle.md) — Bundle size 최적화
- [code-splitting.md](./code-splitting.md) — Lazy load 전략
- [cache.md](./cache.md) — Cache 패턴

### Storage
- [sqlite-tuning.md](./sqlite-tuning.md) — SQLite 최적화
- [streaming.md](./streaming.md) — AI 응답 streaming

### Tuning
- [electron-tuning.md](./electron-tuning.md) — Electron / V8 / GPU
- [profiling.md](./profiling.md) — DevTools, Lighthouse, custom

### Monitoring
- [monitoring.md](./monitoring.md) — Production 모니터링 (sentry + Datadog)

---

## 성능 우선순위

```
P0 (사용자 인지):
  1. 입력 응답 (typing 50ms)
  2. 클릭 → UI 변화 (100ms)
  3. AI 응답 streaming (200ms 이내 첫 토큰)
  4. 60fps 유지 (핵심 화면)

P1 (체감):
  5. 앱 시작 (1초)
  6. 채팅 전환 (100ms)
  7. 검색 (500ms 이내 결과)
  8. 큰 파일 로드 (skeleton 200ms)

P2 (배경):
  9. Background indexing
  10. Crash 복구
  11. Auto-update download
```

---

## 측정 우선

```
원칙: 측정 안 한 것은 최적화 X

✓ 모든 핵심 경로 measure
✓ Production 모니터링 (real user metrics)
✓ Performance budget 설정 + CI 검증
✓ Regression test (느려졌으면 PR block)
```

---

## 주요 지표

```
시간:
  TTI (Time to Interactive):  < 1초
  FCP (First Content Paint):  < 500ms
  LCP (Largest Content Paint): < 1.5초
  
인터랙션:
  INP (Interaction to Next Paint): < 100ms
  Click → response:                < 100ms

메모리:
  앱 시작 직후:    < 150MB
  10개 세션 활성: < 500MB
  
번들:
  Initial JS:      < 300KB (gzip)
  Total assets:    < 5MB
```

---

## 관련

- [../../docs/session/persistence.md](../session/persistence.md) — SQLite 사용
- [../../docs/tools/queue.md](../tools/queue.md) — Tool 실행 큐
- [../design/tokens/motion.md](../design/tokens/motion.md) — 60fps 애니메이션
