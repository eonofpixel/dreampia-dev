---
title: IA — Sidebar Architecture
parent: ./_index.md
related:
  - ../design/components/sidebar.md
status: draft
last_updated: 2026-05-02
---

# Sidebar Architecture

> **한 줄 요약**: 286px 좌측 패널. 위→아래 정보 위계.

---

## 구조

```
┌──────────────────┐
│ ☰ 새 채팅        │  ← Top action (가장 자주)
├──────────────────┤
│ 🔍 검색          │
│ 🔌 플러그인      │
│ 🤖 자동화        │
├──────────────────┤
│ 📁 프로젝트       │  ← Section (workspace 단위)
│   pyeongtaek-portal
│   another-project
│   [+ 새 프로젝트]
├──────────────────┤
│ 💬 채팅           │  ← Section (Session 단위)
│   📌 고정         │
│   ⋮ ─────       │
│   서버 열고...   │  ← 최근 활성 (Ctrl+1)
│   테스트 통과... │           (Ctrl+2)
│   리팩토링...    │           (Ctrl+3)
│   ...           │
│   [모두 보기]   │  ← 50개 이상 시
├──────────────────┤
│ ⚙ 설정           │  ← 가장 적게 사용
└──────────────────┘
```

---

## Section 별 상세

### Top Actions (자주 사용)

```
🔵 새 채팅        Alt+Ctrl+N
🔍 검색           Ctrl+K
🔌 플러그인       (페이지 이동)
🤖 자동화         (페이지 이동)
```

→ 최상단 = Fitts's law (가장 가까이).

### Projects

```typescript
interface ProjectItem {
  id: WorkspaceId;
  name: string;
  path: string;
  pinned: boolean;
  
  // 시각
  icon?: string;        // 자동 (favicon, package.json icon)
  color?: string;       // 사용자 지정
  
  // 메타
  last_used: Date;
  chat_count: number;
}
```

UI:
```
프로젝트
  📁 pyeongtaek-portal     [⋮]    ← context menu
  📁 another-project       [⋮]
  + 새 프로젝트
```

### Chats (Session 목록)

```typescript
interface ChatItem {
  id: SessionId;
  title: string;
  pinned: boolean;
  workspace_id: WorkspaceId;
  
  // 시각
  provider: 'claude' | 'codex';   // 작은 아이콘
  archived: boolean;
  
  // 메타
  updated_at: Date;
  message_count: number;
  has_unread?: boolean;
}
```

#### 정렬

```
1. Pinned 먼저
2. 그 후 updated_at DESC

5개 이내 = 모두 표시
50개 이내 = 모두 표시
50개 이상 = 처음 50 + [모두 보기] 링크
```

#### 그룹화 (시간)

```typescript
function groupByTime(chats: ChatItem[]) {
  const today = new Date();
  
  return {
    pinned: chats.filter(c => c.pinned),
    today: chats.filter(c => isSameDay(c.updated_at, today)),
    yesterday: chats.filter(c => isYesterday(c.updated_at)),
    thisWeek: chats.filter(c => isThisWeek(c.updated_at)),
    older: chats.filter(c => /* ... */),
  };
}
```

UI:
```
💬 채팅

📌 고정 (3)
  서버 열고 미리보기
  배포 자동화
  ...

오늘 (5)
  테스트 통과
  ...

어제 (8)
  ...

이번 주
  ...

[모두 보기] [지난 채팅 보기]
```

→ Codex 도 비슷한 패턴.

---

## Active 표시

```tsx
function SidebarChatItem({ chat }) {
  const isActive = chat.id === activeChat?.id;
  
  return (
    <button className={cn(
      'w-full px-3 py-2 rounded text-sm',
      'hover:bg-bg-tertiary',
      isActive && 'bg-bg-tertiary font-medium'    // ← active
    )}>
      {chat.pinned && <PinIcon />}
      <span className="truncate">{chat.title}</span>
      {chat.has_unread && <Dot color="primary" />}
    </button>
  );
}
```

---

## Compact mode (사이드바 축소)

```
[Compact - 56px]
┌──┐
│☰ │  새 채팅
│🔍│
│🔌│
│🤖│
├──┤
│📁│  프로젝트 첫 글자만
│  │
├──┤
│💬│
│  │
├──┤
│⚙ │
└──┘
```

→ 호버 시 tooltip 으로 풀 이름.

---

## 우클릭 (Context Menu)

라운드 4 발견 12개 옵션 중 일부:

```
ChatItem 우클릭:
  📌 채팅 고정
  ✏ 이름 바꾸기
  💾 보관
  ─────
  📋 작업 디렉토리 복사
  🆔 세션 ID 복사
  🔗 딥링크 복사
  📄 Markdown 으로 복사
  ─────
  🔀 사이드 채팅 열기
  🍴 로컬로 포크
  🌳 새 작업 트리로 포크
  🤖 자동화 추가...
  📦 미니 창에서 열기

ProjectItem 우클릭:
  📌 프로젝트 고정
  🗂 탐색기에서 열기
  🌳 영구 작업 트리 생성
  ✏ 이름 변경
  💾 채팅 보관 (모두)
  × 제거
```

상세: [docs/findings/round4-context-menus.md](../findings/round4-context-menus.md).

---

## 검색 (Ctrl+K)

```
Ctrl+K → 검색 팔레트 (사이드바 위에 overlay):

┌────────────────────────────────────────────┐
│ 🔍 [검색어 입력...]                         │
├────────────────────────────────────────────┤
│ 채팅:                                      │
│   "서버 열고..." - 어제                    │
│                                            │
│ 메시지:                                    │
│   "...localhost:3000..." in "서버 열고..." │
│                                            │
│ 파일:                                      │
│   src/foo.ts                               │
│                                            │
│ 명령:                                      │
│   /플랜 모드                               │
└────────────────────────────────────────────┘
```

---

## 빈 상태

```
첫 사용자:
  💬 채팅
    아직 채팅이 없어요.
    [+ 첫 채팅 만들기]
```

---

## 관련

- [../design/components/sidebar.md](../design/components/sidebar.md) — 시각 구현
- [../ux/patterns/F-026-chat-search.md](../ux/patterns/F-026-chat-search.md) — 검색
- [../findings/round4-context-menus.md](../findings/round4-context-menus.md)
