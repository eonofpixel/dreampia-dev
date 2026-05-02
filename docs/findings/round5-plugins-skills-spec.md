---
title: Round 5 — plugin.json + SKILL.md Spec
parent: ./_index.md
related:
  - ./round3-creators.md
  - ./round5-msix-paths.md
status: complete
last_updated: 2026-05-02
---

# Round 5: Plugin / Skill Specification

> **방법**: 번들 플러그인 (browser-use, latex-tectonic) 의 plugin.json + SKILL.md 직접 읽기
>
> **결과**: Codex 의 proprietary 플러그인 매니페스트 형식 노출

---

## plugin.json — proprietary OpenAI plugin manifest

`browser-use/.codex-plugin/plugin.json`:

```json
{
  "name": "browser-use",
  "version": "0.1.0-alpha1",
  "description": "Browser / browser-use plugin\n\nAliases: ...\n\n[★ AI 행동 지침 포함]",
  "author": { "name": "OpenAI" },
  "homepage": "https://github.com/openai/openai/tree/master/lib/browser_use/plugin",
  "license": "Proprietary",
  "keywords": ["browser", "automation", "chrome", "iab", "node-repl", "browser-client"],
  "skills": "./skills/",
  "interface": {
    "displayName": "Browser Use",
    "shortDescription": "Control the in-app browser with Codex",
    "longDescription": "...",
    "developerName": "OpenAI",
    "category": "Engineering",
    "capabilities": ["Interactive", "Read", "Write"],   ← ★ 권한 모델
    "websiteURL": "https://openai.com/",
    "privacyPolicyURL": "...",
    "termsOfServiceURL": "...",
    "defaultPrompt": ["Test my checkout flow on localhost"],
    "brandColor": "#013B7B",
    "composerIcon": "./assets/browser.png",
    "logo": "./assets/browser.png",
    "screenshots": []
  }
}
```

### 핵심 발견

```
1. description 안에 AI 행동 지침 포함:
   - "Use this plugin whenever the user asks to..."
   - "After significant frontend changes, suggest testing..."
   - "Do not satisfy explicit @browser-use requests with macOS `open`..."

2. interface.capabilities = ["Interactive", "Read", "Write"]
   - 권한 declaration

3. interface.defaultPrompt = 첫 실행 추천 프롬프트

4. interface.brandColor = 플러그인 브랜드 색

5. skills 필드 = ./skills/ 폴더 경로
```

→ Dreampia-Dev: 동일 schema 차용 + extra fields.

---

## latex-tectonic plugin

```json
{
  "name": "latex-tectonic",
  "version": "0.1.0",
  "description": "Compile LaTeX and TeX documents with the bundled Tectonic engine.",
  "interface": {
    "displayName": "LaTeX Tectonic",
    "shortDescription": "Bundled LaTeX compiler",
    "longDescription": "...",
    "category": "Engineering",
    "capabilities": ["Read", "Write"],
    "defaultPrompt": [
      "Compile this LaTeX file with Tectonic",
      "Build a PDF from my TeX document"
    ],
    "brandColor": "#2563EB"
  }
}
```

### 핵심

```
- bin/tectonic.exe (수십 MB) 번들
- 사용자 시스템에 TeX 설치 필요 X
- capabilities 더 적음 (Interactive 없음)
```

---

## SKILL.md 구조

`browser-use/skills/browser/SKILL.md` (★ 41 KB!):

```yaml
---
name: browser
description: "Browser automation for the Codex in-app browser. Use for developer browser tasks on local targets such as localhost, 127.0.0.1, file:// and viewing websites side by side inside Codex."
---

# Browser

Use this skill for browser automation tasks such as inspecting pages, navigating, testing local apps, clicking, typing, taking screenshots, and reading visible page state. Initialize Browser with the `iab` backend.

If this plugin is listed as available in the session, treat that as mandatory reading before browser work. ...

## Bootstrap

The `browser-client` module is the core entry point for browser use, and is available under `scripts/browser-client.mjs` in this plugin's root directory. ALWAYS import it using an absolute path.

Run browser setup code through the Node REPL `js` tool. ...

```js
const { setupAtlasRuntime } = await import("<plugin root>/scripts/browser-client.mjs");
const backend = "iab";
await setupAtlasRuntime({ globals: globalThis, backend });
```

## Troubleshooting
...

## Runtime Behavior
### node_repl
...
```

### 핵심 발견

```
1. YAML frontmatter (name, description) — Anthropic Skills 와 동일
2. Markdown 본문 — AI 가 읽고 행동
3. 명령적 지침:
   - "MUST read this entire SKILL.md file"
   - "Do not skip this skill"
   - "Use tool discovery for `node_repl js`..."
4. Bootstrap 코드 (setupAtlasRuntime)
5. Atlas runtime = 내부 코드명?
6. 41 KB = 매우 상세
```

---

## agents/openai.yaml (보조 메타)

```yaml
interface:
  display_name: "Browser Use"
  short_description: "Browser Use lets Codex open and control..."
  default_prompt: "Inspect the current in-app browser tab..."
```

→ Skill 별 추가 메타 (provider-specific).

---

## scripts/browser-client.mjs

```javascript
const listeners = new Map();

const processShim = {
  env: {},
  version: "v20.0.0",
  versions: { node: "20.0.0", icu: "shim" },
  pid: 0,
  argv: ["node", ""],
  cwd: () => "/",
  // ...
  on: (event, listener) => { ... },
  exit: (code = 0) => {
    throw new Error(`process.exit(${code}) called`);
  },
  // ...
};

// 177줄 - 브라우저 클라이언트 + process shim
```

→ Plugin 실행은 격리된 sandbox (process shim 으로 system process 접근 차단).

---

## Dreampia-Dev plugin schema (제안)

```typescript
// docs/tools/plugin-loader.md 의 PluginManifestSchema 참고

interface DreampiaPluginManifest {
  name: string;
  version: string;
  description: string;                 // AI 행동 지침 포함
  
  author: { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license: string;
  keywords?: string[];
  
  skills?: string;                     // ./skills/ 경로
  
  interface: {
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    developerName: string;
    category: string;
    capabilities: ('Read' | 'Write' | 'Interactive')[];
    
    websiteURL?: string;
    privacyPolicyURL?: string;
    termsOfServiceURL?: string;
    
    defaultPrompt?: string[];
    brandColor?: string;
    composerIcon?: string;
    logo?: string;
    screenshots?: string[];
  };
  
  // Dreampia 추가
  enabled_in?: ('claude' | 'codex' | 'dreampia')[];
  cross_provider?: boolean;            // 양쪽 동기화 가능?
}
```

---

## SKILL.md schema (제안)

```yaml
---
name: <skill-id>
description: <한 줄 설명>

# Dreampia 추가 메타
required_tools: [tool_id, ...]
required_capabilities: [Capability, ...]
---

# <Title>

<지침 본문 — markdown>

## Bootstrap (선택)

...

## Tools used

...
```

---

## 차용 우선순위

```
P0:
  ✓ plugin.json schema (interface.capabilities, defaultPrompt)
  ✓ SKILL.md frontmatter + 본문 패턴

P1:
  ✓ description 안 AI 행동 지침
  ✓ defaultPrompt (첫 실행 시 추천)
  ✓ brandColor (UI 표시)

P2:
  ✓ Cross-provider plugin (enabled_in)
  ✓ Plugin sandbox (process shim)
```

---

## 관련

- [round3-creators.md](./round3-creators.md) — Plugin Creator UI
- [docs/tools/plugin-loader.md](../tools/plugin-loader.md) — Loader 구현
