---
title: F-033 — DOM Inspector 호버
parent: ../_index.md
priority: P1
phase: Phase 2
---

# F-033: DOM Inspector 호버

> **한 줄 요약**: 주석 모드의 underlying tech. 호버 시 자동 DOM 메타 추출.

---

## 동작

```
주석 모드 활성 + 미리보기 호버 →

1. 마우스 hover 한 요소 자동 outline (파란색)
2. 옆에 메타 카드 표시:
   ┌───────────────────────────────┐
   │ <h3.section-title>            │
   │ #1A1C1F (전경)                │
   │ #FFFFFF (배경)                │
   │ font: 'Pretendard', 16px      │
   │ 280 × 32 px                   │
   └───────────────────────────────┘
3. 클릭 → 마커 + 입력창
```

## 자동 추출 정보

```typescript
interface DomMeta {
  tag: string;                       // "h3", "button", "div"
  classes: string[];                 // ["section-title", "primary"]
  id?: string;                       // "main-header"
  
  // 시각 정보
  color?: string;                    // foreground
  bg_color?: string;
  font?: string;                     // family + size
  dimensions?: string;               // "280 x 32"
  
  // 구조
  selector: string;                  // CSS selector (unique)
  xpath?: string;                    // 대안
  bounding_box: { x, y, w, h };
  
  // 컨텍스트
  parent_tag?: string;
  innerHTML_preview?: string;        // 첫 100자
}
```

## 기술 구현

```typescript
// iframe / webview 안에 inspector script 주입
function injectInspector(view: BrowserView) {
  view.webContents.executeJavaScript(`
    (function() {
      const overlay = document.createElement('div');
      overlay.id = '__dreampia_inspector';
      overlay.style = 'position: fixed; pointer-events: none; ...';
      document.body.appendChild(overlay);
      
      let lastTarget = null;
      
      document.addEventListener('mousemove', (e) => {
        const target = e.target;
        if (target === lastTarget) return;
        lastTarget = target;
        
        const rect = target.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.outline = '2px solid #339CFF';
        
        // Meta 추출
        const meta = extractMeta(target);
        window.electron.send('inspector-hover', meta);
      });
      
      document.addEventListener('click', (e) => {
        if (annotationMode) {
          e.preventDefault();
          const meta = extractMeta(e.target);
          const screenshot = capturePartialScreenshot(rect);
          window.electron.send('inspector-click', { meta, screenshot });
        }
      });
    })();
  `);
}
```

## 자동 selector 생성

```typescript
function generateSelector(el: Element): string {
  // ID 가 있으면 우선
  if (el.id) return `#${el.id}`;
  
  // 클래스 조합
  if (el.className) {
    const classes = el.className.split(' ').filter(c => c).join('.');
    const selector = `${el.tagName.toLowerCase()}.${classes}`;
    if (document.querySelectorAll(selector).length === 1) return selector;
  }
  
  // 부모 chain (nth-child)
  return buildPathSelector(el);
}
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
- [F-021](./F-021-annotation.md) — Annotation 모드와 통합
