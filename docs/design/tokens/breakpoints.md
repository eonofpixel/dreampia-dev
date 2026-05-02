---
title: Design Tokens — Breakpoints
parent: ./_index.md
related:
  - ../layout/grid.md
status: draft
last_updated: 2026-05-02
---

# Breakpoints

> **한 줄 요약**: Desktop-first (Electron 환경). 일부 mobile-friendly 영역.

---

## 일반 원칙

```
Dreampia-Dev = Electron Desktop 앱
  → 모바일 / 태블릿 미지원 (Phase 1~3)
  → 단, 사용자가 창 크기 줄였을 때 우아하게 대응
```

## Breakpoint Tokens

```css
--breakpoint-sm:   640px;     /* 작은 데스크톱 / 큰 태블릿 */
--breakpoint-md:   768px;     /* 표준 (3-패널 임계점) */
--breakpoint-lg:   1024px;    /* 권장 최소 */
--breakpoint-xl:   1280px;    /* 권장 */
--breakpoint-2xl:  1536px;    /* 큰 화면 */
--breakpoint-3xl:  1920px;    /* Full HD */
--breakpoint-4xl:  2560px;    /* 2K */
```

### 의미별 매핑

```
< 768px (md):
  - 미니 창 모드 강제
  - 사이드바 hidden (햄버거)
  - 1-패널 레이아웃

768~1023px (md-lg):
  - 사이드바 슬림 (아이콘만)
  - 2-패널 (사이드바 + 채팅 또는 미리보기)

1024~1279px (lg-xl):
  - 사이드바 정상
  - 3-패널 가능 (좁은 미리보기)

1280px+ (xl+):
  - 권장 환경 ★
  - 3-패널 풍성
  - 모든 기능 정상
```

---

## Layout 적응

### 3-패널 vs 단일 패널

```tsx
function MainLayout() {
  const isWide = useMediaQuery('(min-width: 1024px)');
  
  if (!isWide) {
    return <SinglePanelLayout />;   // 모바일/좁은 창
  }
  
  return <ThreePanelLayout />;       // 데스크톱 표준
}
```

### 사이드바

```tsx
const isCompact = useMediaQuery('(max-width: 1023px)');

<Sidebar variant={isCompact ? 'icon-only' : 'expanded'} />
```

---

## 미니 창 모드 (★ Codex 패턴)

```
사용자: 채팅 ··· → 미니 창에서 열기

→ 별도 창 (BrowserWindow) 800x600 정도
→ 자동으로 < 768px breakpoint 적용
→ 사이드바 + 채팅 만 (미리보기 X)
```

```tsx
function MiniWindow() {
  return (
    <div className="min-w-[400px] min-h-[500px]">
      <CompactSidebar />
      <ChatPanel />
    </div>
  );
}
```

---

## Tailwind 매핑

```javascript
screens: {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '3xl': '1920px',
  '4xl': '2560px',
},
```

### 사용 예시

```tsx
<div className="
  grid 
  grid-cols-1                       // < md: 1 column
  md:grid-cols-[286px_1fr]          // md+: 사이드바 + 메인
  lg:grid-cols-[286px_750px_1fr]    // lg+: 3-패널
">
  ...
</div>
```

---

## 권장 / 최소 / 절대 최소

```
권장 (default):     1920×1080  (Full HD)
권장 minimum:        1280×720   (HD ready)
지원 minimum:        1024×768   (Phase 1)
절대 minimum:        800×600    (미니 창)

< 800×600 = 사용자에게 경고 표시
```

---

## DPI 대응

```css
/* High-DPI (Retina, etc) */
@media (-webkit-min-device-pixel-ratio: 2),
       (min-resolution: 192dpi) {
  /* 2x 이미지 사용 */
  .icon {
    background-image: url('icon@2x.png');
  }
}

/* SVG 권장 (DPI 무관) */
```

---

## Container Query (Phase 2+)

특정 컨테이너 안 width 따라 적응:

```css
/* 부모가 작으면 child 도 compact */
.preview-panel {
  container-type: inline-size;
}

.preview-tab {
  font-size: 0.875rem;
}

@container (min-width: 600px) {
  .preview-tab {
    font-size: 1rem;
  }
}
```

→ 미디어 쿼리보다 정밀. 미리보기 패널 width 조정에 유용.

---

## Print 스타일 (선택)

```css
@media print {
  /* 사이드바, 입력창 hide */
  .sidebar, .chat-input { display: none; }
  
  /* 채팅만 출력 */
  .chat-content {
    width: 100%;
    color: black;
    background: white;
  }
}
```

---

## 검증

```typescript
// 모든 컴포넌트가 권장 viewport 에서 정상 동작
// - 1024×768
// - 1280×720
// - 1920×1080

// Playwright snapshots:
test.describe('Responsive', () => {
  for (const size of [[1024, 768], [1280, 720], [1920, 1080]]) {
    test(`size ${size[0]}x${size[1]}`, async ({ page }) => {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await expect(page).toHaveScreenshot();
    });
  }
});
```

---

## 관련

- [_index.md](./_index.md) — 토큰 시스템
- [../layout/grid.md](../layout/grid.md) — Layout 적응
- [../layout/3panel.md](../layout/3panel.md) — 3-패널 상세
