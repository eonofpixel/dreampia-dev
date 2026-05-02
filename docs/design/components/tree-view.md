---
title: Components — Tree View (File Tree)
parent: ./_index.md
related:
  - ../../ux/patterns/F-031-filetree.md
status: draft
last_updated: 2026-05-02
---

# TreeView

> **한 줄 요약**: 파일 트리 + git status + AI 변경 표시. F-031 의 시각.

---

## Visual

```
┌──────────────────────────┐
│ 📁 pyeongtaek-portal      │
├──────────────────────────┤
│ ▾ 📁 src                  │
│   ▾ 📁 components         │
│     📄 Button.tsx     ✏  │ ← AI 가 수정
│     📄 Card.tsx           │
│   ▾ 📁 utils              │
│     📄 format.ts          │
│     📄 helpers.ts     +  │ ← AI 가 새로 만듦
│ ▾ 📁 tests                │
│   📄 foo.test.ts      ✗  │ ← AI 가 삭제
│ 📄 package.json       M  │ ← git modified
│ 📄 README.md              │
└──────────────────────────┘
```

---

## 구현

```tsx
function TreeView({ root, onSelect, expandedNodes, onToggleExpand }) {
  return (
    <div role="tree" className="font-sm">
      <TreeNode 
        node={root}
        depth={0}
        onSelect={onSelect}
        expanded={expandedNodes}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );
}

function TreeNode({ node, depth, onSelect, expanded, onToggleExpand }) {
  const isFolder = node.type === 'folder';
  const isExpanded = expanded.has(node.path);
  const meta = useFileMeta(node.path);
  
  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={node.selected}
        tabIndex={0}
        className={cn(
          'flex items-center gap-1 py-0.5 px-2 cursor-pointer',
          'hover:bg-bg-tertiary',
          node.selected && 'bg-bg-tertiary font-medium'
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => isFolder ? onToggleExpand(node.path) : onSelect(node.path)}
      >
        {isFolder ? (
          <ChevronRight className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')} />
        ) : (
          <span className="w-3" />
        )}
        
        <FileIcon type={node.type} extension={getExtension(node.path)} />
        
        <span className="flex-1 truncate">{node.name}</span>
        
        {meta && <FileMetaBadge meta={meta} />}
      </div>
      
      {isFolder && isExpanded && node.children?.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  );
}
```

---

## File meta 표시

```tsx
function FileMetaBadge({ meta }) {
  if (meta.ai_modified_in_session) {
    return (
      <TooltipTrigger content="AI 가 이번 세션에서 수정">
        <span className="text-xs text-accent">✏</span>
      </TooltipTrigger>
    );
  }
  
  if (meta.ai_created) {
    return <span className="text-xs text-success">+</span>;
  }
  
  if (meta.ai_deleted) {
    return <span className="text-xs text-danger">✗</span>;
  }
  
  if (meta.git_status === 'M') {
    return <span className="text-xs text-warning">M</span>;
  }
  
  if (meta.git_status === '?') {
    return <span className="text-xs text-text-tertiary">?</span>;
  }
  
  return null;
}
```

---

## 키보드

```
↑↓         이동
←          collapse (folder) / parent
→          expand (folder) / first child
Enter      파일 열기
Space      선택
Ctrl+A     전체 선택
F2         이름 변경
Delete     삭제 (확인 모달)
Ctrl+C/V   복사/붙여넣기 (Phase 2)
```

---

## Drag & Drop

```tsx
import { DndContext } from '@dnd-kit/core';

function DraggableTreeNode({ node, ...props }) {
  // 드래그 → 다른 폴더로 이동
  // 드롭 시 modal: "이동하시겠어요?"
}
```

---

## 검색

```tsx
function TreeSearch({ root, onResult }) {
  const [query, setQuery] = useState('');
  const matches = useFuzzySearch(root, query);
  
  return (
    <div>
      <Input
        variant="search"
        placeholder="파일 검색..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      
      {query && (
        <div className="space-y-1 mt-2">
          {matches.map(match => (
            <FileSearchResult 
              key={match.path}
              match={match}
              query={query}
              onClick={() => onResult(match.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Accessibility

```
✓ role="tree" / "treeitem"
✓ aria-expanded (folder)
✓ aria-selected (current)
✓ aria-level (depth)
✓ Keyboard: ↑↓←→ 표준 tree navigation
✓ Type-ahead (한 글자 입력 → 매칭 노드)
```

---

## 관련

- [../../ux/patterns/F-031-filetree.md](../../ux/patterns/F-031-filetree.md)
- [../../session/workspace.md](../../session/workspace.md) — Workspace 데이터
