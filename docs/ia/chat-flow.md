---
title: IA — Chat Flow
parent: ./_index.md
related:
  - sidebar.md
  - preview-panel.md
  - ../session/conversation.md
status: draft
last_updated: 2026-05-02
---

# Chat Flow

> **한 줄 요약**: 메시지 입력 → AI 응답 → 도구 실행 → 결과 표시 → 다음.

---

## 패널 구조

```
┌──────────────────────────────┐
│ 채팅 헤더                     │  ← 제목, ··· 메뉴
├──────────────────────────────┤
│                              │
│ 메시지 history (스크롤)       │
│   - User                     │
│   - Assistant                │
│   - Tool                     │
│                              │
├──────────────────────────────┤
│ 입력창 + 컨트롤              │  ← 모델, 권한, 전송
└──────────────────────────────┘
```

---

## 채팅 헤더

```
┌──────────────────────────────────────────────┐
│ 서버 열고 미리보기 확인           ··· ▶     │
└──────────────────────────────────────────────┘
   ↑                                  ↑    ↑
   제목 (편집 가능)                   ⋮메뉴 실행
```

### 표시 정보

```
- 채팅 제목 (truncate, hover → 전체)
- 모델 (작은 indicator)
- 마지막 활동 시간 (옵션)
```

### Actions

```
··· (Dropdown menu — F-라운드 4 12옵션):
  📌 채팅 고정
  ✏ 이름 바꾸기
  💾 보관
  ...
```

---

## 메시지 area

### 시각 위계

```
[User 메시지]                                    ┌────────────┐
                                                  │ 사용자 입력 │
                                                  └────────────┘
                                                          ↑
                                                          우측 정렬

[Assistant 메시지]
┌────────────────────────────────────┐
│ AI 응답                             │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ ▶ shell.run("npm test")  ✗     │ │  ← Tool result (펼침 가능)
│ └────────────────────────────────┘ │
│                                    │
│ 5개 테스트 실패. 분석 중...        │
│                                    │
│ 👍 👎 ↪ 📋 ✏                       │  ← inline actions (hover)
└────────────────────────────────────┘
        ↑
        좌측 정렬

[System 메시지]
            ─── 백그라운드 작업 완료 ───
                    (중앙)

[Tool 메시지]
  → 별도 표시 X (Assistant 안 inline)
```

상세: [../design/components/chat-message.md](../design/components/chat-message.md).

---

## 입력창 (Composer)

```
┌──────────────────────────────────────────────────────────┐
│ + ⊕ 안녕하세요, 다음 작업을 부탁해요...   🎤            │  ← textarea
├──────────────────────────────────────────────────────────┤
│ [+ 첨부] [⊟ 플랜] [🌐 브라우저]   🔵 워크스페이스 ▼  ▶  │  ← 컨트롤
└──────────────────────────────────────────────────────────┘
```

### 좌측 (입력)

```
+ : 첨부 메뉴 (사진/플랜/플러그인)
⊕ : 추가 옵션
textarea: auto-grow (max 300px)
🎤 : 음성 입력 (Phase 2)
```

### 우측 (전송 컨트롤)

```
🔵 워크스페이스 쓰기 ▼   : 권한 dropdown (F-027)
[모델 ▼]                : 모델 선택 (F-023)
[효력 ▼]                : Effort
▶                       : 전송 (또는 Enter)
```

---

## 메시지 흐름

### 사용자 입력

```
사용자 typing...
   ↓ Ctrl+Enter (또는 Enter)
optimistic: 즉시 UI 에 메시지 추가
   ↓
서버에 POST + AI 호출
   ↓ (200ms)
첫 토큰 도착
   ↓
streaming 표시 (60fps)
   ↓
... (반복) ...
   ↓
완료
   ↓
trace timeline 표시 (옵션)
```

### Tool call 흐름

```
AI: "npm test 실행해 볼게요"
   ↓
ToolCall 생성 (Tool: shell.run, input: { cmd: "npm test" })
   ↓
권한 체크
   - 자동 허용 → 즉시 실행
   - Ask once → inline 권한 요청
   - Ask each → modal
   ↓ (사용자 허용)
실행 (background or foreground)
   ↓
스트리밍 결과 (streaming output)
   ↓
ToolResult (success/failed) 메시지에 inline 표시
   ↓
AI 다음 응답 (도구 결과 분석)
```

상세: [../tools/queue.md](../tools/queue.md).

---

## 자동 스크롤

```
원칙:
  - 새 메시지 = 자동 맨 아래
  - 사용자가 위로 스크롤 = auto 비활성
  - 맨 아래 다시 도달 = auto 재활성

UI:
  사용자가 위 스크롤 + 새 메시지 도착 →
    [ ▼ N개 새 메시지 ]   ← 클릭 시 맨 아래
```

상세: [../design/interaction/scroll.md](../design/interaction/scroll.md).

---

## 사이드 채팅 (병렬)

```
[메인 채팅]                    [사이드 채팅]
┌──────────────┐               ┌──────────────┐
│ ...           │               │ 임시 / 빠른  │
│ 작업 중       │               │ 검증         │
│              │               │              │
│ 입력창        │               │ 입력창        │
└──────────────┘               └──────────────┘
```

→ 다른 모드 / 모델 / 권한 가능 (라운드 4 발견).

---

## Plan 모드 활성 시

```
[일반 입력창]
[+ ⚠ <텍스트>...   🔵 워크스페이스 ▼   ▶]

[Plan 모드]
[+ ⊟ 🌐 <텍스트>...   ⚠ 권한 잠김       ▶]
   ↑  ↑                ↑
   체크리스트 브라우저  (모두 read-only)
```

상세: [../session/plan.md](../session/plan.md).

---

## Streaming UX

```
사용자: "테스트 통과시켜줘"
   ↓ 즉시 표시
[Sending...]
   ↓ ~200ms
AI 응답 시작:
  "분석"
  "분석 중"
  "분석 중입니다"
  "분석 중입니다."
  ...
   ↓ Tool call 시작
"테스트 실행해 볼게요"
[▶ shell.run("npm test")  ⠋ 실행 중...]
   ↓ Tool result
[▶ shell.run("npm test")  ✗ exit 1]
   ↓ AI 다음 응답
"5개 테스트 실패. 원인 분석..."
   ↓ 완료
👍 👎 ↪
```

→ 매끄러운 streaming 60fps.

---

## 입력 보존

```
사용자 typing...
  ↓
다른 채팅으로 이동
  ↓
원래 채팅으로 복귀
  ↓
입력 그대로 유지 (PendingInput)
```

상세: [../session/conversation.md](../session/conversation.md).

---

## 관련

- [../session/conversation.md](../session/conversation.md) — 데이터 모델
- [../design/components/chat-message.md](../design/components/chat-message.md) — 시각
- [../tools/queue.md](../tools/queue.md) — Tool flow
- [preview-panel.md](./preview-panel.md) — 우측 패널
