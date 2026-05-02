---
title: Components — Annotation Marker
parent: ./_index.md
related:
  - ../../ux/patterns/F-021-annotation.md
status: draft
last_updated: 2026-05-02
---

# AnnotationMarker

> **한 줄 요약**: 미리보기 위에 떠있는 주석 마커. F-021 의 시각.

---

## Visual

```
미리보기 위에 overlay:

  ┌──────────────────────────────────┐
  │ ╔════════════════════════════════╗│ ← 호버 outline
  │ ║  대시보드                      ║│
  │ ║  HOME › 업무 현황         ① ━━━━━━━ 마커 (number badge)
  │ ╚════════════════════════════════╝│
  │                                   │
  │             ┌─────────────────┐   │
  │             │ 댓글 추가...  🎤 │   │ ← 인라인 입력창
  │             └─────────────────┘   │
  └──────────────────────────────────┘

마커 스타일:
  원 16px, accent 배경, 흰 텍스트, 번호 표시
  shadow-md (떠있는 느낌)
  cursor pointer (클릭 → 댓글 보기)
```

---

## 구현

```tsx
function AnnotationMarker({ annotation, index, onClick }) {
  const { x, y } = annotation.bounding_box;
  
  return (
    <div
      className={cn(
        'absolute pointer-events-auto',
        'flex items-center justify-center',
        'w-6 h-6 rounded-full',
        'bg-accent text-accent-text',
        'text-xs font-bold',
        'shadow-md cursor-pointer',
        'hover:scale-110 transition-transform'
      )}
      style={{
        left: x + annotation.bounding_box.w - 12,  // 우측 상단 모서리
        top: y - 12,
      }}
      onClick={onClick}
      role="button"
      aria-label={`주석 ${index}: ${annotation.comment.slice(0, 50)}`}
    >
      {index}
    </div>
  );
}
```

---

## Outline (호버 시)

```tsx
function HoverOutline({ rect }) {
  if (!rect) return null;
  
  return (
    <div
      className="absolute pointer-events-none border-2 border-accent rounded"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
      }}
    />
  );
}
```

---

## 인라인 입력창

```tsx
function AnnotationInput({ onSave, onCancel, position }) {
  const [comment, setComment] = useState('');
  
  return (
    <div
      className="absolute z-[1500] bg-bg-elevated rounded-md shadow-lg p-2 w-80"
      style={{ left: position.x, top: position.y + 32 }}
    >
      <Textarea
        autoFocus
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="댓글 추가..."
        rows={3}
      />
      
      <div className="flex justify-between items-center mt-2">
        <button aria-label="음성 입력">
          <Mic className="w-4 h-4" />
        </button>
        
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onCancel}>취소</Button>
          <Button size="sm" onClick={() => onSave(comment)} disabled={!comment.trim()}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## DOM 자동 인식 (F-033 통합)

```typescript
// 미리보기 (BrowserView) 안에 inspector 주입
function injectAnnotationMode(view: BrowserView) {
  view.webContents.executeJavaScript(`
    let lastTarget = null;
    let lastOutline = null;
    
    document.addEventListener('mousemove', (e) => {
      if (e.target === lastTarget) return;
      lastTarget = e.target;
      
      // outline 위치 업데이트
      const rect = e.target.getBoundingClientRect();
      window.electron.send('annotation:hover', {
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        meta: extractDomMeta(e.target),
      });
    });
    
    document.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const meta = extractDomMeta(e.target);
      const screenshot = await capturePartialScreenshot(e.target.getBoundingClientRect());
      
      window.electron.send('annotation:click', {
        selector: generateSelector(e.target),
        meta,
        screenshot,
        position: { x: e.clientX, y: e.clientY },
      });
    });
    
    function extractDomMeta(el) {
      const computed = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        color: computed.color,
        bg_color: computed.backgroundColor,
        font: computed.font,
        dimensions: \`\${el.offsetWidth} × \${el.offsetHeight}\`,
      };
    }
    
    function generateSelector(el) {
      // 고유 selector 생성 (ID > class > nth-child)
      if (el.id) return '#' + el.id;
      // ...
    }
  `);
}
```

---

## 관련

- [../../ux/patterns/F-021-annotation.md](../../ux/patterns/F-021-annotation.md)
- [../../ux/patterns/F-033-dom-inspector.md](../../ux/patterns/F-033-dom-inspector.md)
- [../../session/conversation.md](../../session/conversation.md) — Annotation 데이터
