---
title: Components — StatusBar
parent: ./_index.md
related:
  - topbar.md
status: draft
last_updated: 2026-05-02
---

# StatusBar

> **한 줄 요약**: 하단 작은 상태 정보. workspace, git, 백그라운드 작업.

---

## Visual

```
┌──────────────────────────────────────────────────────────────────┐
│ 🌐 main ↑0 ↓2 │ 📁 pyeongtaek │ ⚙ 워크스페이스 쓰기 │ ⚡ 2 active │
└──────────────────────────────────────────────────────────────────┘
   git           workspace      permission         jobs
```

---

## 구성

```tsx
function StatusBar() {
  const session = useCurrentSession();
  const jobs = useBackgroundJobs();
  
  return (
    <div className="h-6 px-3 flex items-center gap-3 bg-bg-secondary border-t border-border-primary text-xs">
      <GitStatus state={session?.workspace.git_state} />
      <Divider />
      <WorkspaceInfo workspace={session?.workspace} />
      <Divider />
      <PermissionLevel level={session?.permission.default_level} />
      <Divider />
      <BackgroundJobsBadge jobs={jobs} />
      
      <div className="flex-1" />
      
      {/* Right side */}
      <ConnectionStatus />
      <UpdateAvailable />
    </div>
  );
}
```

---

## 컴포넌트들

### GitStatus

```tsx
function GitStatus({ state }) {
  if (!state) return null;
  
  return (
    <button className="flex items-center gap-1 hover:bg-bg-tertiary px-2 py-0.5 rounded">
      <GitBranch className="w-3 h-3" />
      <span>{state.branch}</span>
      {state.ahead > 0 && <span className="text-text-tertiary">↑{state.ahead}</span>}
      {state.behind > 0 && <span className="text-text-tertiary">↓{state.behind}</span>}
      {state.staged_count > 0 && <span className="text-success">+{state.staged_count}</span>}
      {state.unstaged_count > 0 && <span className="text-warning">·{state.unstaged_count}</span>}
    </button>
  );
}
```

### Background Jobs

```tsx
function BackgroundJobsBadge({ jobs }) {
  const active = jobs.filter(j => j.status === 'running');
  
  if (active.length === 0) return null;
  
  return (
    <button onClick={openJobsPanel} className="flex items-center gap-1">
      <Spinner size="xs" />
      <span>{active.length} active</span>
    </button>
  );
}
```

### Permission Level

```tsx
function PermissionLevel({ level }) {
  const config = LEVEL_CONFIG[level];
  
  return (
    <button className="flex items-center gap-1">
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </button>
  );
}

const LEVEL_CONFIG = {
  read_only: { icon: '🔒', label: '읽기 전용' },
  workspace_write: { icon: '🔵', label: '워크스페이스 쓰기' },
  full_access: { icon: '🔓', label: '전체 접근' },
  custom: { icon: '⚙', label: '사용자 지정' },
};
```

### Update Available

```tsx
function UpdateAvailable() {
  const { updateAvailable } = useAutoUpdater();
  
  if (!updateAvailable) return null;
  
  return (
    <button onClick={triggerUpdate} className="text-accent">
      <Download className="w-3 h-3" />
      업데이트 가능
    </button>
  );
}
```

---

## Tooltip 으로 상세

```tsx
<TooltipTrigger content={
  <div>
    <div>활성 작업 {jobs.length}개</div>
    {jobs.slice(0, 3).map(j => (
      <div key={j.id}>• {j.title}</div>
    ))}
  </div>
}>
  <BackgroundJobsBadge />
</TooltipTrigger>
```

---

## 관련

- [topbar.md](./topbar.md)
- [../../session/workspace.md](../../session/workspace.md) — Workspace 데이터
