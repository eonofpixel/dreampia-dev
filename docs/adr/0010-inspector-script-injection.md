# ADR-0010: Inspector script injection (executeJavaScript + drain polling)

- **Status**: accepted
- **Date**: 2026-05-12
- **Decision authority**: β-2 land (commit `2659c0f`) + β-3 review
- **Predecessors**: F-021 (annotation), F-033 (DOM inspector hover)
- **Consequence for**: v2.10.0 β-2 / β-3 preview annotation pipeline

## Context

- `WebContentsView` (BrowserManager) 은 sandbox:true / contextIsolation:true /
  preload 없음으로 생성된다.
- 각 세션마다 `persist:dreampia-browser-app-{session_id}` 파티션으로 격리 (쿠키
  / storage 가 분리).
- v2.10.0 β-2 의 DOM element pick 모드는 webview 안에서 발생한 hover / click
  이벤트를 main process 로 push 해야 한다 (renderer 의 AnnotationOverlay 가
  outline / 메타 카드를 그리고 main 의 IPC 가 chat 으로 forward).

별도 webview-preload 가 없는 상태에서 위 push-stream 을 어떻게 실현할 것인가
가 본 ADR 의 결정 대상.

## Decision

**Option A 채택** — main 이 `INSPECTOR_SCRIPT` 를 `webContents.executeJavaScript`
로 inject 하고, in-page 큐 (hover ring-of-1 + pick FIFO cap 16) 를 50ms 폴링으로
drain. 큐 JSON 은 `{ hover: Event|null, picks: Event[] }` shape.

핵심 구현:
- `src/main/BrowserManager.ts` 의 `INSPECTOR_SCRIPT` 가 in-page 에 install
  (idempotent). `document` 의 capture-phase listener 로 mousemove / click 을
  잡는다.
- `enableInspector(tab_id)` 가 active flag 를 켜고 `setInterval(50ms)` 로
  `window.__dreampia_inspector_drain()` 를 호출.
- 큐 분리 (β-2 hardening P0-1) — hover 는 latest-only, pick 은 FIFO cap 16.
  hover storm 이 pick 을 evict 하지 못하도록.
- Drain reentrancy guard (β-2 hardening P0-2) — `inspectorDrainInFlight` flag
  로 페이지 stall 시 Promise 가 piling 하지 않게.
- Nav re-arm (β-2 hardening P1-3) — `did-finish-load` 에서 INSPECTOR_SCRIPT
  재주입. 페이지 reload / 링크 클릭 후에도 inspector 가 살아남는다.
- Explicit uninstall hook (β-2 hardening P1-4) — `__dreampia_inspector_uninstall`.
  closeTab / shutdown 이 호출 (실제로는 wc 가 곧 폐기되어 noop 이지만 contract
  명시).

β-3 추가:
- INSPECTOR_SCRIPT 에 `extractMeta(el, rect)` 추가. `getComputedStyle` 로
  color / bg_color / font 를 읽고 hover/pick event payload 에 동봉.
- `parseInspectorEvent` 가 optional meta 필드 (`id` / `classes` / `color` /
  `bg_color` / `font`) 와 required `dimensions` 를 검증.

## Alternatives Considered

### Option B — WebContentsView 전용 preload 추가
contextBridge + `ipcRenderer.sendToHost` 패턴으로 push-stream 을 native IPC 위에
얹는다.

장점:
- 구조적으로 깔끔 — script string injection 대신 typed bridge.
- Polling 비용 0 — push 만으로 충분.
- 50ms latency 가 없음.

단점 (Option A 가 이기는 이유):
- 별도 vite entry (`webview-preload.ts`) + electron-builder ASAR 포함 검증 필요.
- Partition signing / sandbox 와 preload 의 호환성 검증 필요.
- v2.10.0 β-2 시점에 push 가 필요한 기능은 inspector 단일 → 인프라 변경 폭이
  feature 단일 가치 대비 과대.

**Migration trigger**: webview→main push 가 필요한 두 번째 기능이 land 할 때
(input recording / scroll capture / console mirror 등). 그 시점에 Option B 가
amortize 된다.

### Option C — `console-message` 채널
폐기. 이벤트 ordering 보장 X, 일반 페이지 console.log 와 노이즈 혼입.

## Trade-offs

**Pro**:
- Build infra 변경 0 — 기존 `dumpTabDom` / `captureTab` 의 executeJavaScript
  패턴과 일관.
- Sandbox / contextIsolation / no-preload 보안 모델 유지.
- Per-partition 격리도 그대로.

**Con**:
- 50ms hover latency (paint frame 의 ~3x). 사용자는 outline 이 살짝 lag.
- 폴링 비용 — inspector active 동안 20Hz/sec `executeJavaScript` 호출.
  Inactive 시 비용 0.
- 큐 cap (16 pick) 으로 pick eviction 가능성 — 실용상 도달 X (사용자가 16번
  연속 클릭하기 전에 한 번 drain 이 일어남).
- INSPECTOR_SCRIPT 는 page 의 동일 JS context 에서 실행 — 악성 페이지가 큐를
  덮어쓸 수 있다. 그래서 main 의 `parseInspectorEvent` 가 각 entry 를 shape-check.

## Migration plan to Option B

Trigger: 두 번째 webview→main push-stream 기능 land 시점.

1. `src/main/webview-preload.ts` 신규 — sandbox:true 와 호환되는 isolated-world
   preload.
2. `vite.config` 에 entry 추가. electron-builder ASAR 포함 확인.
3. `WebContentsView` 생성 시 `webPreferences.preload` 지정. Electron 33 isolated
   world preload 호환성 검증.
4. `wc.on('ipc-message', (_e, channel, payload) => ...)` 로 event 수신.
5. Feature flag `experimental.previewInspectorPreload` 로 1 release 동안 양쪽
   path 병행.
6. Option A path 제거 — v2.11.0 또는 그 이후.

## References

- β-2 land: commit `2659c0f` (fixup hardening) + 이전 base commit.
- F-021: `docs/ux/patterns/F-021-annotation.md`.
- F-033: `docs/ux/patterns/F-033-dom-inspector.md`.
- 구현: `src/main/BrowserManager.ts` `INSPECTOR_SCRIPT` / `enableInspector` /
  `parseInspectorEvent`.
- 테스트: `tests/main/BrowserManager.test.ts` `describe('inspector ...')`.
- 한계 문서: `docs/preview/inspector.md`.
