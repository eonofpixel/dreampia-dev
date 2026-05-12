# Preview inspector — known limitations

Annotation 모드 (F-021) + DOM inspector (F-033) 의 알려진 제약사항.

## Selector best-effort, not stable

- `generateSelector` 는 `id` → `tag.class` → `tag:nth-of-type` chain (max depth 6) 의
  순서로 만든다.
- 페이지 reload / re-render 후 동일 selector 가 동일 요소를 가리킨다는 보장은
  **없다**. sibling 카운트 / 동적 클래스명 / hydration 순서 변동이 selector 를
  stale 화 한다.
- `AnnotationBlock.selector` 는 chat 컨텍스트 hint 용 — AI 가 "사람이 어디를
  가리켰는지" 추측하는 단서다. **재-pick 용 locator 가 아니다.**

## Cross-origin iframe 은 β-3 까지 범위 밖

- `document` 의 capture-phase listener 는 cross-origin iframe (YouTube embed,
  Twitter embed 등) 안의 클릭을 수신하지 못한다.
- 사용자가 cross-origin iframe 안 element 를 pick 하려 하면 → silent ignore.
- Future: 각 same-origin iframe 마다 INSPECTOR_SCRIPT 별도 주입 검토.
  Cross-origin iframe 은 브라우저 보안 정책상 영구 차단.

## `getComputedStyle` 메타의 scope (β-3)

- hover 메타 카드의 `color` / `bg_color` / `font` 는 `getComputedStyle` 결과를
  그대로 사용한다.
- **Closed shadow DOM** — 일부 컴포넌트 라이브러리의 closed shadow root 는
  computed style 에 접근 불가. 이 경우 해당 필드는 omit (카드는 dimensions /
  tag 만 표시).
- **Cross-origin iframe** — 안쪽 element 의 메타는 항상 unavailable.
- `dimensions` 는 항상 채워짐 (boundingClientRect 는 cross-origin 에서도
  유효).

## Polling cost / latency

- 50ms polling = 20Hz `executeJavaScript` calls **while inspector active**.
- Active 는 사용자가 annotation toggle 을 켠 동안만. 비활성 시 비용 0.
- 50ms 의 hover-outline latency 는 의도된 trade-off — 메인 프로세스 load 와
  paint latency 간의 균형.
- ADR-0010 의 Option B (webview preload) 로 migrate 하면 본 항목은 obsolete.

## Partial screenshot capture (β-3)

- `pick` event 가 도착하면 PreviewPanel 이 `browser/capture-region` 을 main 에
  호출.
- main 의 `BrowserManager.captureRegion` 이 `webContents.capturePage({x,y,w,h})`
  결과를 `userData/annotations/<sessionId>/<uuid>.png` 으로 atomic write.
- bbox 가 webview viewport 밖이면 viewport 로 clamp (Electron 의 capturePage
  rejection 회피). clamp 후 사이즈가 0 이 되면 null 반환.
- 실패 시 (capturePage rejection / fs write 실패) → null + console.warn.
  AnnotationBlock 은 screenshot_uri 없이 그대로 forward (graceful path 유지,
  사용자는 selector + bbox 만 가지고 chat 에 전달).

## Migration

ADR-0010 의 Option B (webview preload) 로 migrate 시:
- 본 문서의 "Polling cost / latency" 항목은 obsolete.
- "Cross-origin iframe" / "Closed shadow DOM" 항목은 영구 보존 (브라우저
  보안 정책 / shadow DOM 정책).
- Selector 안정성 항목도 영구 보존 — selector 생성 알고리즘 자체와 무관한
  본질적 한계.

## References

- ADR-0010: `docs/adr/0010-inspector-script-injection.md`
- F-021: `docs/ux/patterns/F-021-annotation.md`
- F-033: `docs/ux/patterns/F-033-dom-inspector.md`
- `src/main/BrowserManager.ts` — INSPECTOR_SCRIPT / captureRegion
