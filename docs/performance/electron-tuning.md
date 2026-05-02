---
title: Performance — Electron Tuning
parent: ./_index.md
related:
  - memory.md
status: draft
last_updated: 2026-05-02
---

# Electron Tuning

> **한 줄 요약**: V8 flags + GPU + memory limits. Production-grade Electron 앱.

---

## V8 Flags

```typescript
// main.ts
import { app } from 'electron';

// V8 메모리 한도 (default 1.5GB → 4GB)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// 최적화 플래그
app.commandLine.appendSwitch('js-flags', [
  '--max-old-space-size=4096',
  '--max-semi-space-size=64',
  '--use-strict',                  // strict mode (성능 약간 향상)
].join(' '));
```

---

## GPU Acceleration

```typescript
// 기본: GPU 자동 사용
// 단, 일부 환경에선 비활성 (예: 가상머신)

// 강제 GPU 사용
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// GPU 끄기 (디버깅 / 가상머신)
app.disableHardwareAcceleration();
```

→ Production 에선 GPU 활성 유지.

---

## Renderer 분리

```typescript
// 새 BrowserWindow = 새 renderer process
const mainWindow = new BrowserWindow({
  webPreferences: {
    sandbox: true,                 // ★ 보안 + 성능
    contextIsolation: true,        // ★ 필수
    nodeIntegration: false,        // ★ 필수
    
    // Process 격리
    partition: 'persist:main',     // 다른 window 와 cookie 분리
    
    // 메모리
    backgroundThrottling: true,    // 비활성 window 메모리 절약
  },
});

// In-app browser (★ 별도 partition - codex-browser-app 패턴)
const iabView = new BrowserView({
  webPreferences: {
    partition: `persist:codex-browser-app-${sessionId}`,
    sandbox: true,
  },
});
```

---

## Background throttling

```typescript
const window = new BrowserWindow({
  webPreferences: {
    backgroundThrottling: true,    // 비활성 시 timer 늦춤
  },
});

// 비활성 window 자동 처리:
//   - setTimeout/setInterval → 1초당 1번 (default)
//   - requestAnimationFrame → 멈춤
//   → 메모리 + CPU 절약
```

---

## Process count 관리

```typescript
import { app } from 'electron';

app.on('ready', () => {
  // Process 개수 모니터링
  setInterval(() => {
    const metrics = app.getAppMetrics();
    console.log(`Processes: ${metrics.length}`);
    
    metrics.forEach(m => {
      console.log(`  PID ${m.pid}: ${m.type}, ${m.memory.workingSetSize / 1024} MB`);
    });
  }, 60000);
});
```

```
Process 종류:
  - Browser (main)        : 1
  - Renderer              : N (window 개수)
  - GPU                   : 1
  - Network               : 1
  - Utility (각 BrowserView): N
  
권장: 5-10 process (메모리 합 1-2GB)
```

---

## Window 관리

```typescript
// Hidden window 절약
window.on('hide', () => {
  window.webContents.setBackgroundThrottling(true);
});

window.on('show', () => {
  window.webContents.setBackgroundThrottling(false);
});

// Memory pressure
app.on('render-process-gone', (event, webContents, details) => {
  if (details.reason === 'oom') {
    console.error('Renderer OOM!');
    // 자동 reload + 알림
  }
});
```

---

## IPC 최적화

```typescript
// ✗ 자주 호출하는 IPC (느림)
setInterval(() => {
  ipcRenderer.invoke('get-time');   // 매번 IPC = round-trip
}, 1000);

// ✓ Batch
const cache = useRef<{ time: Date }>({ time: new Date() });
useEffect(() => {
  const interval = setInterval(async () => {
    cache.current.time = await ipcRenderer.invoke('get-time');
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

---

## File 시스템 lazy

```typescript
// ✗ 시작 시 모든 파일 읽기
const allConfigs = fs.readdirSync('.').map(f => fs.readFileSync(f));

// ✓ 필요할 때만
async function loadConfig(name: string) {
  if (!cache.has(name)) {
    cache.set(name, await fs.promises.readFile(name, 'utf-8'));
  }
  return cache.get(name);
}
```

---

## Native modules

```typescript
// ✗ 큰 native module 매번 로드
const sqlite = require('better-sqlite3');

// ✓ Lazy
let _sqlite;
async function getSqlite() {
  if (!_sqlite) {
    _sqlite = await import('better-sqlite3');
  }
  return _sqlite.default;
}
```

---

## Auto-update 성능

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.autoDownload = false;        // 사용자 명시 다운로드
autoUpdater.autoInstallOnAppQuit = true;

// 백그라운드 (사용자 작업 방해 X)
setTimeout(() => {
  autoUpdater.checkForUpdates();
}, 60000);   // 시작 1분 후
```

---

## DevTools 자동 닫기

```typescript
if (process.env.NODE_ENV !== 'development') {
  // Production 에선 DevTools 차단 (보안 + 성능)
  window.webContents.on('devtools-opened', () => {
    window.webContents.closeDevTools();
  });
}
```

---

## Crash recovery

```typescript
const { crashReporter } = require('electron');

crashReporter.start({
  productName: 'Dreampia-Dev',
  companyName: 'Dreampia',
  submitURL: 'https://your-crash-server.com',   // 또는 sentry
  uploadToServer: true,
});

// Renderer crash 자동 reload
window.webContents.on('render-process-gone', (event, details) => {
  if (details.reason !== 'clean-exit') {
    window.reload();
    
    // 사용자 알림
    showToast('앱이 자동 복구됐어요. 작업 내역은 안전히 저장됩니다.');
  }
});
```

---

## Production 빌드 최적화

```javascript
// electron-builder.yml
nodeGypRebuild: false        // native rebuild 자제 (build 시간)
buildDependenciesFromSource: false
fileAssociations: []

# 더 작은 bundle
asar: true                   # 압축
asarUnpack:
  - 'node_modules/sharp/**'  # native 만 unpack

# Code signing (성능 X 보안 +)
win:
  signtoolOptions:
    publisherName: 'Dreampia'
```

---

## 측정

```typescript
// app.getAppMetrics() 매 분 기록
import { app } from 'electron';

const metrics = setInterval(() => {
  const data = app.getAppMetrics();
  
  for (const m of data) {
    Sentry.addBreadcrumb({
      category: 'performance',
      data: {
        pid: m.pid,
        type: m.type,
        memory_mb: m.memory.workingSetSize / 1024,
        cpu_percent: m.cpu.percentCPUUsage,
      },
    });
  }
}, 60000);
```

---

## 관련

- [memory.md](./memory.md)
- [rendering.md](./rendering.md)
- [monitoring.md](./monitoring.md)
