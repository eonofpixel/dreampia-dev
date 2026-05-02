---
title: Interaction — Drag & Drop
parent: ../_index.md
related:
  - keyboard.md
status: draft
last_updated: 2026-05-02
---

# Drag & Drop

> **한 줄 요약**: dnd-kit 기반. 항상 키보드 대안 제공.

---

## 사용 시나리오

```
1. 탭 reorder (브라우저 탭 이동)
2. 사이드바 채팅 reorder
3. 패널 resize (분할선 드래그)
4. 파일 첨부 (drag from OS)
5. 트리뷰 노드 이동 (Phase 2)
```

---

## 라이브러리 선택

```
@dnd-kit/core         - 모던, accessible (★ 권장)
react-beautiful-dnd   - deprecated
react-dnd             - 복잡, 오래됨
```

→ Dreampia-Dev = `@dnd-kit/core` 사용.

---

## 기본 패턴

```tsx
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

function ReorderableList({ items, onReorder }) {
  return (
    <DndContext onDragEnd={(event) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorder(active.id, over.id);
      }
    }}>
      {items.map(item => <DraggableItem key={item.id} item={item} />)}
    </DndContext>
  );
}

function DraggableItem({ item }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id,
  });
  
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Transform.toString(transform) }}
      className="cursor-grab active:cursor-grabbing"
    >
      {item.content}
    </div>
  );
}
```

---

## Sortable List (탭, 사이드바)

```tsx
import { SortableContext, useSortable } from '@dnd-kit/sortable';

function SortableTabs({ tabs, onReorder }) {
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map(t => t.id)}>
        {tabs.map(tab => <SortableTab key={tab.id} tab={tab} />)}
      </SortableContext>
    </DndContext>
  );
}

function SortableTab({ tab }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: tab.id,
  });
  
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {tab.title}
    </div>
  );
}
```

---

## 드래그 시각 피드백

```
[Idle]
[탭 1] [탭 2] [탭 3]

[Dragging]
[탭 1]  ╔══════╗  [탭 3]
        ║ 탭 2 ║   ← shadow + scale 1.05
        ╚══════╝

[Dropped]
[탭 1] [탭 3] [탭 2]   ← 자연스럽게 swap
```

```css
/* Dragging element */
[data-dragging="true"] {
  opacity: 0.5;
}

/* Drag overlay (fly above) */
.drag-overlay {
  box-shadow: var(--shadow-lg);
  transform: scale(1.05);
  cursor: grabbing;
}

/* Drop zone */
.drop-zone-active {
  background: var(--color-accent-bg);
  border: 2px dashed var(--color-accent);
}
```

---

## File drop (OS → 앱)

```tsx
function FileDropZone({ onDrop }) {
  const [isDragging, setIsDragging] = useState(false);
  
  return (
    <div
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        onDrop(files);
      }}
      className={cn(
        'border-2 border-dashed rounded p-4',
        isDragging ? 'border-accent bg-accent-bg' : 'border-border-primary'
      )}
    >
      {isDragging ? '여기 놓으세요' : '파일을 드래그하거나 클릭'}
    </div>
  );
}
```

---

## 패널 resize

```tsx
function ResizableSplitter({ leftWidth, onResize }) {
  const [dragging, setDragging] = useState(false);
  
  useEffect(() => {
    if (!dragging) return;
    
    const handler = (e: MouseEvent) => {
      onResize(e.clientX);    // x 좌표 = 좌측 패널 width
    };
    
    document.addEventListener('mousemove', handler);
    document.addEventListener('mouseup', () => setDragging(false), { once: true });
    
    return () => document.removeEventListener('mousemove', handler);
  }, [dragging, onResize]);
  
  return (
    <div
      onMouseDown={() => setDragging(true)}
      className={cn(
        'w-1 h-full bg-border-primary',
        'cursor-ew-resize hover:bg-accent',
        'transition-colors'
      )}
      role="separator"
      aria-valuenow={leftWidth}
      aria-valuemin={200}
      aria-valuemax={800}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onResize(leftWidth - 10);
        if (e.key === 'ArrowRight') onResize(leftWidth + 10);
      }}
    />
  );
}
```

→ 키보드 ←→ 로도 resize 가능 (a11y).

---

## Accessibility (★ 매우 중요)

```
드래그 = 마우스 only X. 키보드 대안 필수:

✓ Tab: 항목 focus
✓ Space: drag mode 토글
✓ ↑↓ (또는 ←→): 이동
✓ Enter: 위치 확정
✓ Esc: 취소

예: 사이드바 채팅 reorder
  Tab → 채팅 항목 focus
  Space → drag mode (시각: outline + announce)
  ↑↓ → 이동 (각 step 마다 announce "위로 이동했습니다")
  Enter → 확정
  Esc → 원위치
```

@dnd-kit 의 keyboard sensor 활용:

```tsx
import { KeyboardSensor, useSensors } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);

<DndContext sensors={sensors}>...</DndContext>
```

---

## 관련

- [keyboard.md](./keyboard.md) — 키보드 대안
- [../components/tab.md](../components/tab.md) — 탭 reorder
- [../layout/3panel.md](../layout/3panel.md) — 패널 resize
