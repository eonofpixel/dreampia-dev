---
title: Tool Orchestration — Background Jobs
parent: ./_index.md
related:
  - ./queue.md
  - ./observability.md
status: draft
last_updated: 2026-05-02
---

# Background Jobs (백그라운드 작업)

> **한 줄 요약**: 30초 이상 long-running 작업의 분리된 실행 + UI.

---

## Tool 실행 vs Background Job

```
[Tool 실행 (즉시)]
  - timeout 30초 이내
  - 사용자가 STOP 버튼으로 즉시 취소
  - 결과를 메시지에 inline 표시
  - 예: fs.read, browser.navigate

[Background Job (지연)]
  - 30초 ~ 30분
  - 별도 패널에 진행 상황 표시
  - 완료 시 알림
  - 예: npm install, 큰 파일 다운로드, agent 작업
```

### 분류 기준

```typescript
function shouldRunInBackground(tool: Tool, input: unknown): boolean {
  // 1. Tool 이 명시적으로 long-running
  if (tool.id === 'shell.spawn') return true;
  
  // 2. 예상 시간 초과 (사용자 hint)
  if (tool.estimated_duration_ms && tool.estimated_duration_ms > 30_000) return true;
  
  // 3. 사용자가 명시 요청
  if (input?.run_in_background) return true;
  
  // 4. Tool 이 기본 background
  if (tool.default_background) return true;
  
  return false;
}
```

---

## BackgroundJob 인터페이스

```typescript
interface BackgroundJob {
  id: string;
  session_id: SessionId;
  spawning_call_id: ToolCallId;
  
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  
  title: string;
  progress?: { current: number; total: number; message?: string };
  
  started_at: ISO8601;
  estimated_duration_ms?: number;
  
  // 결과 또는 에러
  output?: unknown;
  error?: ToolError;
  
  // UI
  ui_panel: 'jobs' | 'terminal' | 'browser' | 'hidden';
  notify_on_complete: boolean;
}
```

---

## Job 시작

```typescript
async function startBackgroundJob(call: ToolCall): Promise<BackgroundJob> {
  const tool = registry.get(call.tool_id)!;
  
  const job: BackgroundJob = {
    id: uuidv7(),
    session_id: call.session_id,
    spawning_call_id: call.id,
    status: 'queued',
    title: tool.display.summary(call.input),
    started_at: new Date().toISOString(),
    estimated_duration_ms: tool.estimated_duration_ms,
    ui_panel: pickPanel(tool),
    notify_on_complete: true,
  };
  
  // DB 저장
  await db.insertBackgroundJob(job);
  
  // 비동기 실행 (await X — 사용자에게 즉시 반환)
  executeJobAsync(job).catch(err => {
    handleJobError(job.id, err);
  });
  
  return job;
}

function pickPanel(tool: Tool): 'jobs' | 'terminal' | 'browser' | 'hidden' {
  if (tool.id.startsWith('shell.')) return 'terminal';
  if (tool.id.startsWith('browser.')) return 'browser';
  return 'jobs';
}
```

---

## Job 실행 (별도 큐)

```typescript
class BackgroundJobRunner {
  private active: Map<string, ActiveJob> = new Map();
  private maxConcurrent = 3;             // background 도 제한
  private pending: BackgroundJob[] = [];
  
  async executeJobAsync(job: BackgroundJob) {
    // 1. 동시 실행 제한 대기
    while (this.active.size >= this.maxConcurrent) {
      await new Promise(r => setTimeout(r, 100));
    }
    
    // 2. ActiveJob 등록
    const active: ActiveJob = {
      job,
      abort_controller: new AbortController(),
    };
    this.active.set(job.id, active);
    
    // 3. Status 갱신
    await this.updateStatus(job.id, 'running');
    
    try {
      // 4. Tool 실행 (큐의 execute() 와 같은 로직)
      const tool = registry.get(job.spawning_call.tool_id)!;
      const ctx = createContext(job, active.abort_controller);
      
      const output = await tool.execute(job.spawning_call.input, ctx);
      
      // 5. 완료
      await this.complete(job.id, { status: 'completed', output });
    } catch (err) {
      await this.complete(job.id, { status: 'failed', error: err });
    } finally {
      this.active.delete(job.id);
    }
  }
  
  async complete(jobId: string, result: { status; output?; error? }) {
    const job = await db.getBackgroundJob(jobId);
    
    await db.updateBackgroundJob(jobId, {
      status: result.status,
      output: result.output,
      error: result.error,
      completed_at: new Date().toISOString(),
    });
    
    // 알림
    if (job.notify_on_complete) {
      sendNotification({
        title: result.status === 'completed' ? '✓ 작업 완료' : '✗ 작업 실패',
        body: job.title,
        action: () => openJob(jobId),
      });
    }
    
    // AI 에게 결과 전달 (다음 turn 에 사용)
    notifyAIOfBackgroundResult(job);
  }
}
```

---

## Job Panel UI

사이드바 또는 하단 패널:

```
┌──────────────────────────────────────────┐
│ 백그라운드 작업                  [모두 보기]│
├──────────────────────────────────────────┤
│ ▶ npm install                            │
│   ━━━━━━━━━━━━━━━━━━━━ 65% (12.4s 남음) │
│                                          │
│ ⏸ deploy.sh                              │
│   대기 중                                │
│                                          │
│ ✓ git push                               │
│   완료 (2초 전)                          │
│                                          │
│ ✗ test.sh                                │
│   실패: 종료 코드 1                      │
│   [재시도] [로그 보기]                   │
└──────────────────────────────────────────┘
```

### React 컴포넌트

```tsx
function BackgroundJobsPanel() {
  const jobs = useBackgroundJobs();
  
  return (
    <div className="jobs-panel">
      <div className="header">
        백그라운드 작업
        <button onClick={() => openAllJobs()}>모두 보기</button>
      </div>
      
      {jobs.map(job => (
        <JobItem key={job.id} job={job} />
      ))}
    </div>
  );
}

function JobItem({ job }: { job: BackgroundJob }) {
  return (
    <div className={`job-item status-${job.status}`}>
      <StatusIcon status={job.status} />
      <div className="job-info">
        <div className="title">{job.title}</div>
        {job.progress && (
          <ProgressBar 
            current={job.progress.current} 
            total={job.progress.total}
            message={job.progress.message}
          />
        )}
      </div>
      <JobActions job={job} />
    </div>
  );
}
```

---

## Job 사용자 액션

```typescript
// Pause / Resume (지원되는 tool 만)
async function pauseJob(jobId: string) {
  const active = jobRunner.getActive(jobId);
  if (active && active.tool.pausable) {
    active.tool.pause(active.context);
    await db.updateBackgroundJob(jobId, { status: 'paused' });
  }
}

// Cancel
async function cancelJob(jobId: string) {
  const active = jobRunner.getActive(jobId);
  if (active) {
    active.abort_controller.abort('user_cancelled');
  }
  await db.updateBackgroundJob(jobId, { status: 'cancelled' });
}

// Retry
async function retryJob(jobId: string) {
  const job = await db.getBackgroundJob(jobId);
  
  // 새 job 으로 재시작
  await startBackgroundJob({
    ...job.spawning_call,
    parent_call_id: job.spawning_call.id,  // history 추적
  });
}
```

---

## 알림 통합

```typescript
function sendNotification(opts: NotificationOptions) {
  if (process.platform === 'win32') {
    // Windows toast
    new Notification({
      title: opts.title,
      body: opts.body,
      icon: 'app-icon.ico',
    }).show();
  } else if (process.platform === 'darwin') {
    // macOS
    new Notification(opts);
  } else {
    // Linux: notify-send
    spawn('notify-send', [opts.title, opts.body]);
  }
}
```

---

## Job 결과를 AI 에게

```typescript
function notifyAIOfBackgroundResult(job: BackgroundJob) {
  // 다음 사용자 turn 시작 전에 자동 첨부
  const session = loadSession(job.session_id);
  
  // System message 추가
  session.conversation.pending_system_messages = [
    ...(session.conversation.pending_system_messages ?? []),
    {
      role: 'system',
      content: [
        { 
          type: 'text', 
          text: `[백그라운드 작업 완료]\n${job.title}\n결과: ${
            job.status === 'completed' ? '성공' : '실패: ' + job.error?.message
          }`
        }
      ],
    },
  ];
  
  await saveSession(session);
}
```

---

## 검증 (Invariants)

```
INV-1: Background job 은 메인 Tool queue 와 별개 (서로 영향 X)
INV-2: 같은 session 의 background job 은 max_concurrent_per_session 무시 가능
INV-3: 앱 종료 시 running job 은 cancelled 표시
INV-4: 30분 이상 stuck 된 job 은 자동 timeout (옵션)
INV-5: AI 에게 결과 전달은 idempotent (이미 알린 job 다시 안 함)
```

---

## 관련

- [queue.md](./queue.md) — Tool queue 와의 차이
- [observability.md](./observability.md) — Trace timeline
- [docs/session/terminal.md](../session/terminal.md) — terminal 용 background
