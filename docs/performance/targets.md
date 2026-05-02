---
title: Performance — Targets
parent: ./_index.md
related:
  - budgets.md
  - monitoring.md
status: draft
last_updated: 2026-05-02
---

# Performance Targets

> **한 줄 요약**: 사용자 인지 임계점 따라. 측정 가능한 목표.

---

## 응답 시간 (사용자 인지)

```
< 50ms       즉각적 (typing, hover)
< 100ms      매끄러움 (click → response)
< 200ms      빠름 (modal open, dropdown)
< 500ms      허용 (search results)
< 1초        지연 인식 (큰 작업 시작)
> 1초        loading 표시 필수
> 3초        background job 으로 분리 권장
> 10초       반드시 progress + 취소 가능
```

**Doherty Threshold**: 400ms 미만 = 사용자 만족 + flow 유지.

---

## 핵심 경로 budget

### 시작 (Cold start)

```
0ms:        process spawn
100ms:      Electron initialized
300ms:      First paint (로고 / splash)
500ms:      App shell rendered
800ms:      세션 데이터 로드 시작
1000ms:     ★ TTI (사용자 입력 가능)
2000ms:     모든 lazy chunks 로드
```

→ **목표: 1초 TTI**.

### 채팅 전환

```
0ms:        사용자 클릭
50ms:       active state 표시
100ms:      ★ 채팅 헤더 + 메시지 placeholder
200ms:      모든 메시지 렌더 (가상화)
300ms:      입력창 focus
```

### AI 응답

```
0ms:        Enter 누름
50ms:       UI 에서 메시지 추가 (optimistic)
200ms:      AI 호출 시작 + spinner
500ms:      ★ 첫 토큰 도착 (streaming)
~~~         streaming 진행 (60fps)
~~~         완료 후 trace timeline 표시
```

### 검색 (Ctrl+K)

```
0ms:        Ctrl+K 누름
50ms:       팔레트 표시
100ms:      input focus
200ms:      ★ 결과 표시 (debounce 100ms 후 fuzzy)
```

### 슬래쉬 명령

```
0ms:        / 입력
30ms:       팔레트 표시
50ms:       모든 명령 (캐시) 표시
```

---

## FPS (Frame rate)

```
60fps        ✓ 핵심 화면 (스크롤, 애니메이션)
30fps 미만   ✗ 사용자 불편 (부드럽지 X)
```

### 측정 시점

```
스크롤 (긴 채팅):    60fps 유지
모달 등장:          60fps
드래그 (탭, 패널):   60fps
Streaming (AI):     30fps 이상 (text update)
```

---

## 메모리

```
앱 시작 직후:        < 150MB
1 세션 활성:         < 250MB
10 세션 활성:        < 500MB
50 세션 활성:        < 1GB

100MB 이하:          현실적으로 어려움 (Electron + Chromium)
```

---

## Bundle size

```
Main (renderer):      < 300KB gzip
Lazy chunks:          < 200KB each gzip
Total initial:        < 500KB gzip
Total all assets:     < 5MB

비교:
  Codex Desktop:      ~131MB (asar)
  → 우리도 비슷할 것 (Electron 본질적 크기)
  
사용자 download:      ~50-80MB MSIX
```

---

## Disk

```
앱 설치:              < 200MB
사용자 데이터:        < 2GB (1년 사용 평균)
Backup:               < 500MB
```

---

## Network

```
AI API 호출:
  Claude:     ~50KB request, 1KB chunks streaming
  Codex:      ~50KB request, 1KB chunks streaming
  
MCP 서버:    < 100KB per call (대부분 작음)
```

---

## CPU

```
Idle (편집 중):       < 5%
Active typing:       < 20%
AI streaming:        < 30%
Background indexing: < 50% (사용자 작업 방해 X)
Build / heavy:       100% OK (사용자 명시 작업)
```

---

## SQLite 성능

```
세션 로드:            < 100ms
턴 추가:              < 10ms
검색 (FTS5):          < 500ms (10K turns)
백업 생성:            < 5초 (1GB DB)
시작 시 검증:         < 200ms
```

상세: [sqlite-tuning.md](./sqlite-tuning.md).

---

## 측정 도구

```
DevTools Performance:
  - Cold start record
  - Interaction record (long tasks)
  - Memory profiler
  
Lighthouse:
  - Performance score (90+)
  - Best practices

Custom:
  - User timing API
  - Performance Observer
  
Production:
  - Sentry performance
  - Custom metrics
```

상세: [profiling.md](./profiling.md), [monitoring.md](./monitoring.md).

---

## CI 검증

```yaml
# .github/workflows/perf.yml
- name: Bundle size check
  run: |
    SIZE=$(stat -c %s dist/main.js)
    if [ $SIZE -gt 500000 ]; then
      echo "Bundle too large: $SIZE"
      exit 1
    fi

- name: Lighthouse
  run: npx lighthouse-ci --score=performance:0.9
```

---

## Regression test

```typescript
// CI 에서 매 PR 마다
test('App startup < 1500ms', async () => {
  const start = performance.now();
  await launchApp();
  await waitForTTI();
  const duration = performance.now() - start;
  
  expect(duration).toBeLessThan(1500);
});
```

---

## 관련

- [budgets.md](./budgets.md) — 자세한 budget
- [profiling.md](./profiling.md) — 측정 방법
- [monitoring.md](./monitoring.md) — Production 모니터링
