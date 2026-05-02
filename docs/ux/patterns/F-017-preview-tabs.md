---
title: F-017 — 미리보기 멀티탭 + 브라우저 컨트롤
parent: ../_index.md
priority: P0
phase: Phase 1
status: complete
---

# F-017: 미리보기 멀티탭 + 브라우저 컨트롤

> **한 줄 요약**: 여러 페이지 동시 + 표준 브라우저 navigation.

---

## UI

```
[검토] [평택문화원 업무포털] [+]
[← → ↻]  127.0.0.1:3000/dashboard

기능:
  - 멀티탭 (여러 페이지 동시)
  - "+" 버튼으로 새 탭
  - 표준 브라우저 navigation (← → ↻)
  - URL 바 표시
  - 자체 webview/iframe (CSP 회피)
```

## 탭 종류

```
일반 탭:    URL 페이지 (http://...)
검토 탭:    git diff / code review viewer
사이드 탭:  /사이드 명령으로 띄운 보조 채팅
```

## 브라우저 컨트롤

| 버튼 | 동작 |
|-----|------|
| ← | 뒤로 (history) |
| → | 앞으로 |
| ↻ | 새로고침 |
| URL bar | 클릭 → 편집 가능 |
| ⛶ | 전체화면 ([F-014](./F-014-fullscreen.md)) |

## 구현 — Electron BrowserView

```typescript
// 각 탭 = BrowserView
function createTabView(tabId: TabId, url: string): BrowserView {
  const view = new BrowserView({
    webPreferences: {
      session: getPartition(tabId),  // 격리 (F-013 참고)
      sandbox: true,
    },
  });
  
  view.webContents.loadURL(url);
  return view;
}

// 탭 전환
function switchTab(tabId: TabId) {
  mainWindow.setBrowserView(tabViews[tabId]);
  mainWindow.setTopBrowserView(tabViews[tabId]);
}
```

## 관련

- [F-013](./F-013-3panel.md) — 미리보기 패널
- [docs/session/browser.md](../../session/browser.md) — BrowserState
