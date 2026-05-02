---
title: States — Loading
parent: ../_index.md
related:
  - ../components/spinner.md
  - ../components/progress.md
status: draft
last_updated: 2026-05-02
---

# Loading State

> **한 줄 요약**: 사용자에게 "기다려주세요" 명확히. Progress > Skeleton > Spinner.

---

## 종류 별 사용

### Determinate progress (가장 명확)

```
정확한 진행률 알 수 있을 때:
  - 파일 다운로드 (bytes)
  - 다단계 작업 (5/10)
  - 큰 파일 업로드

→ ProgressBar value={percent}
```

### Skeleton (구조 미리 보기)

```
페이지 / 큰 컨텐츠 로딩:
  - 채팅 목록 처음 로드
  - 워크스페이스 인덱싱
  - 파일 트리 처음

→ Skeleton 컴포넌트 (실제 컨텐츠 모양으로)
```

### Spinner (작은 영역 / 진행률 모름)

```
짧은 로딩 (<3초):
  - 버튼 안 (저장 중)
  - 인풋 옆 (검색 중)

→ Spinner size="sm"
```

### Indeterminate progress (긴 진행률 모름)

```
> 3초 + 진행률 추정 X:
  - npm install
  - AI 응답 대기

→ ProgressBar indeterminate
```

---

## Skeleton 패턴

```tsx
function ChatListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <div className="w-4 h-4 bg-bg-tertiary rounded animate-pulse" />
          <div className="flex-1 h-4 bg-bg-tertiary rounded animate-pulse" 
               style={{ width: `${60 + Math.random() * 30}%` }} />
        </div>
      ))}
    </div>
  );
}
```

```css
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

---

## 시간별 가이드

```
< 100ms:    UI 변화만 (loading 표시 X)
100ms~1초:  Spinner inline
1~3초:      Spinner + 텍스트 ("로딩 중...")
3~10초:     Progress bar (determinate or indeterminate)
> 10초:     Background job (사이드 패널, 알림)
```

→ 사용자가 "고장난 줄" 알기 전에 빨리 표시.

---

## 사용자 메시지

```
짧은 작업:    "로딩 중..." / "저장 중..." / "검색 중..."
긴 작업:      "분석 중 (12초)..." (시간 표시)
백그라운드:   "백그라운드에서 진행" (사용자가 다른 일 할 수 있음)
```

→ 한국어 우선. 영어 fallback ("Loading...").

---

## Streaming (AI 응답)

AI 가 글자 단위로 응답:

```tsx
function StreamingMessage({ partial }) {
  return (
    <div>
      <span>{partial}</span>
      <BlinkingCursor />   {/* | 깜박임 */}
    </div>
  );
}
```

→ Spinner 보다 streaming = 사용자가 직접 진행 봄.

---

## 취소 가능

```
로딩 중에도 사용자가 취소 가능:

[Spinner + 텍스트]
  ⠋ 분석 중...   [취소]    ← 우측에 취소 버튼
```

```tsx
<div className="flex items-center gap-2">
  <Spinner size="sm" />
  <span>분석 중 ({elapsed}초)...</span>
  <Button size="sm" variant="ghost" onClick={cancel}>취소</Button>
</div>
```

---

## Optimistic UI (Phase 2)

```
사용자 액션 → 즉시 UI 변경 (loading 표시 X) → 백그라운드 sync

예: 좋아요 클릭 → 즉시 빨간 하트 → 서버 fail 시 rollback
```

---

## Accessibility

```
✓ aria-live="polite" (로딩 메시지)
✓ aria-busy="true" (로딩 중인 영역)
✓ Spinner = role="status"
✓ Progress = aria-valuenow / valuemax
✓ Reduced motion 시 spinner → pulse (회전 X)
```

---

## 안티 패턴

```
✗ 모든 영역에 spinner (시각 노이즈)
✗ Skeleton 이 실제와 너무 다름 (사용자 혼란)
✗ Progress bar 가 끝까지 안 가고 멈춤 (의심)
✗ "Please wait..." 영어만 (한국어 누락)
✗ 5초 이상 작업 = 단순 spinner (사용자 포기)
```

---

## 관련

- [../components/spinner.md](../components/spinner.md)
- [../components/progress.md](../components/progress.md)
