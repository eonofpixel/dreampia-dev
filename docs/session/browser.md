---
title: Session State — Browser 서브 스키마
parent: ./_index.md
related:
  - ./schema.md
  - ./conversation.md
status: draft
last_updated: 2026-05-02
---

# Browser Sub-schema

> **한 줄 요약**: 세션별 격리 파티션 + 멀티탭 + 주석 모드 + in-app/external 백엔드.

---

## BrowserState 인터페이스

```typescript
interface BrowserState {
  tabs: BrowserTab[];
  active_tab_id?: TabId;
  panel_visible: boolean;              // 미리보기 패널 토글
  layout: 'panel' | 'fullscreen' | 'mini' | 'hidden';
  
  // 분리 파티션 (Codex codex-browser-app 패턴)
  partition_id: string;                // session 별 격리
}
```

---

## BrowserTab

```typescript
interface BrowserTab {
  id: TabId;
  title: string;
  url: string;
  favicon_uri?: Uri;
  
  status: 'loading' | 'ready' | 'failed';
  last_load: ISO8601;
  
  // 히스토리 (탭별)
  history: Array<{ url: string; ts: ISO8601 }>;
  history_index: number;
  
  // 주석 모드
  annotation_mode: boolean;
  annotations: Annotation[];           // 이 탭의 주석들
  
  // 스냅샷
  last_screenshot_uri?: Uri;
  last_dom_dump_uri?: Uri;
  
  // 출처
  spawned_by: 'user' | 'ai' | 'embedded_card';
  spawning_turn_id?: TurnId;
}
```

---

## Backend 종류

```typescript
type BrowserBackend = 
  | 'iab'              // in-app browser (Codex 패턴)
  | 'system_default'   // OS 기본 브라우저
  | 'playwright'       // headless 자동화
  | 'cdp_attach';      // 사용자 Chrome 에 attach
```

### iab (In-app Browser)

```
Electron BrowserView 사용 + Codex 와 동일한 격리 partition
  ✓ Codex 의 codex-browser-app 패턴 차용
  ✓ Cookie/Storage 격리 (메인 앱과 분리)
  ✓ DOM Inspector 통합 (주석 모드)
  ✗ 일반 사용자 브라우저 확장 사용 불가
```

### system_default

```
shell.openExternal(url) 사용
  ✓ 사용자가 익숙한 환경
  ✓ 확장 프로그램 모두 사용 가능
  ✗ AI 가 직접 제어 불가
  ✗ 주석 모드 불가
```

### playwright

```
Headless Chromium (playwright npm)
  ✓ AI 자동화 적합 (테스트, 스크래핑)
  ✓ 백그라운드 실행
  ✗ 사용자 시각화 X (별도 스크린샷 필요)
```

### cdp_attach

```
Chrome DevTools Protocol 으로 사용자 Chrome 에 attach
  ✓ 사용자 환경 그대로
  ✓ 로그인 세션 활용
  ✗ 사용자가 Chrome --remote-debugging-port 띄워야 함
  ✗ 보안 위험 (디버그 포트 노출)
```

### 설정

```typescript
interface BrowserConfig {
  default_backend: BrowserBackend;     // 기본값: 'iab'
  iab_partition_isolation: boolean;    // default true (★ Codex 패턴)
  playwright_headless: boolean;
  cdp_endpoint?: string;
}
```

---

## Partition 격리 (★ Codex 핵심 패턴)

```
사용자 Chrome 프로필
  └── Cookie: facebook.com 로그인됨
       (이 정보가 노출되면 안 됨)

Dreampia-Dev iab 파티션
  ├── partition: "session-{session_id}"  ← 매 세션마다 다름
  ├── 격리된 cookie store
  ├── 격리된 localStorage
  └── 격리된 cache
```

**Electron 구현**:
```typescript
import { session as electronSession, BrowserView } from 'electron';

function createIabView(sessionId: SessionId): BrowserView {
  const partition = `persist:codex-browser-app-${sessionId}`;
  const sess = electronSession.fromPartition(partition);
  
  return new BrowserView({
    webPreferences: {
      session: sess,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
}
```

**파일 시스템**:
```
%APPDATA%\Dreampia-Dev\Partitions\
  ├── codex-browser-app-{session_id_1}\
  │   ├── Cookies
  │   ├── Local Storage\
  │   └── ...
  └── codex-browser-app-{session_id_2}\
      └── ...
```

---

## 주석 모드 통합

상세는 [conversation.md - Annotation](./conversation.md#annotation-주석-모드--dom-inspector) 참고. 여기는 BrowserTab 의 통합만:

```typescript
interface BrowserTab {
  // ...
  annotation_mode: boolean;            // ON/OFF 토글
  annotations: Annotation[];           // 이 탭에 만들어진 주석들
}
```

**활성화 흐름**:
```
1. 사용자: 주석 모드 ON 클릭
2. → annotation_mode = true
3. → DOM 요소 호버 시 outline 표시
4. → 클릭 시 inline 입력창 + 마커 생성
5. → 입력 완료 시 Annotation 저장
6. → 입력창에 "주석 N개" 뱃지 표시 (다음 turn 에 자동 첨부)
```

---

## 스냅샷 (last_screenshot, last_dom_dump)

```typescript
// AI 가 turn 결과로 스크린샷/DOM 캡처 시 자동 저장
interface BrowserTab {
  // ...
  last_screenshot_uri?: Uri;           // PNG file
  last_dom_dump_uri?: Uri;             // HTML / JSON
}
```

**저장 정책**:
- 매 navigation 후 스크린샷 자동 (옵션)
- 사용자 명시 캡처 또는 AI tool call 시
- 7일 이상된 스냅샷 자동 cleanup

---

## 멀티탭 + 사이드 채팅

```
탭 목록 표시 (Codex 패턴):
  [검토] [평택문화원 업무포털] [hr.html] [사이드 채팅] [+]

특수 탭:
  - "검토" = git diff / code review viewer
  - "사이드 채팅" = 임시 fork 채팅 (별도 conversation)
  - 일반 URL 탭들
```

**사이드 채팅 = 별도 세션**:
```typescript
// /사이드 명령 → 새 Session 생성
const sideSession = createSession({
  parent_session_id: mainSession.id,
  workspace_id: mainSession.workspace_id,  // 같은 workspace
  title: `${mainSession.title} (사이드)`,
});

// 메인 세션 의 browser.tabs 에 ref 만 추가
mainSession.browser.tabs.push({
  id: 'side-tab',
  title: '사이드 채팅',
  url: `dreampia://session/${sideSession.id}`,  // internal URL
  // ...
});
```

---

## Layout 모드

```
'panel'      = 우측 패널 (기본)
'fullscreen' = 전체화면 (⛶ 토글)
'mini'       = 별도 floating window
'hidden'     = 패널 닫음
```

### 'fullscreen' 모드 시 floating chat

```
미리보기 전체화면 →
  채팅 패널 사라짐
  하단 floating overlay 등장:
    "최근 메시지 ›" expand
    입력창 + 권한 dropdown
```

---

## 검증 (Invariants)

```
INV-1: tabs 의 url 은 valid URL or "dreampia://" scheme
INV-2: active_tab_id 가 있으면 tabs 안에 존재
INV-3: spawned_by='ai' 면 spawning_turn_id 존재
INV-4: partition_id 는 세션 ID 와 1:1 (다른 세션과 공유 X)
INV-5: layout='hidden' 이면 panel_visible=false
INV-6: history_index 는 history 길이 안
```

---

## 예시

```json
{
  "tabs": [
    {
      "id": "tab-001",
      "title": "평택문화원 업무포털 - 대시보드",
      "url": "http://127.0.0.1:3000/dashboard",
      "favicon_uri": "data:image/png;base64,...",
      "status": "ready",
      "last_load": "2026-05-02T01:54:00.000Z",
      "history": [
        { "url": "http://127.0.0.1:3000/login", "ts": "2026-05-02T01:53:50.000Z" },
        { "url": "http://127.0.0.1:3000/dashboard", "ts": "2026-05-02T01:54:00.000Z" }
      ],
      "history_index": 1,
      "annotation_mode": false,
      "annotations": [],
      "last_screenshot_uri": "blob://session-{id}/screenshots/sc-001.png",
      "spawned_by": "ai",
      "spawning_turn_id": "01a-asst-002"
    }
  ],
  "active_tab_id": "tab-001",
  "panel_visible": true,
  "layout": "panel",
  "partition_id": "codex-browser-app-01a-..."
}
```

---

## 관련

- [conversation.md](./conversation.md) — Annotation 정의 + EmbeddedCard
- [schema.md](./schema.md) — Session 안에서의 위치
- [persistence.md](./persistence.md) — browser_tabs 테이블
- [DEEP_EXPLORATION_FINDINGS.md](../../DEEP_EXPLORATION_FINDINGS.md) — Codex partition 패턴 발견
