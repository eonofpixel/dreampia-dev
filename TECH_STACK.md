# Tech Stack — Dev Tool 기술 선택

> **베이스**: [Codex 분석](../codex/) + [Claude 분석](../claude/) + [Codex 검토](../codex_review_result.md)
> **원칙**: 두 회사가 검증한 패턴 차용 + 단순함 우선
> **버전**: 0.1 초안

---

## 1. 핵심 결정 (TL;DR)

| 영역 | 선택 | 이유 |
|------|------|------|
| **언어** | TypeScript 6 (`@typescript/native-preview` tsgo) | 두 회사 모두 채택 |
| **런타임** | Node.js 22+ (Bun 옵션) | 두 CLI가 Node 생태계 |
| **번들러** | Vite 6 또는 8 | Claude=6, Codex=8, 둘 다 검증 |
| **CLI 파서** | commander 12 | Codex/Claude 표준 |
| **린트/포맷** | oxlint + oxfmt | 두 회사 모두 채택 (OXC) |
| **테스트** | vitest 4 | 두 회사 모두 채택 |
| **패키징** | electron-forge (UI) + Bun bundle (CLI) | 검증된 패턴 |
| **DB** | better-sqlite3 12 | Claude 채택 |
| **Schema 검증** | zod 3 | Claude 채택 |
| **Subprocess** | execa 9 | child_process 대비 우월 |
| **Config 형식** | TOML (smol-toml) | Codex 동일 |
| **Logger** | winston | Claude 채택 |
| **Telemetry** | @sentry/node 옵셔널 | 두 회사 채택 |

---

## 2. 언어 / 런타임 결정

### 2.1 Node.js (TypeScript) ⭐ 채택

**근거**:
- 두 CLI 모두 Node.js 22+ 요구
- `npm install -g @aix/cli` 단순
- 풍부한 생태계 (commander, execa, zod, etc.)
- 가장 빠른 개발 속도

**리스크**:
- Cold start 100ms+ (가벼운 작업에 부담)
- single-binary 배포 어려움 (Bun 또는 pkg 보완)

### 2.2 Bun (대안 또는 보완)

**근거**:
- Bun bundle → 단일 binary
- 빠른 cold start (~50ms)
- TypeScript 네이티브
- Codex CCD CLI도 Bun 사용 가능성 (분석에서 발견 X but 추정)

**채택 시점**: Phase 2 빌드 최적화 단계

### 2.3 Rust (검토 후 보류)

**검토 결과**: 보류
- 개발 속도 ↓↓ (Phase 1 4주 ↑ 12주)
- subprocess 호출은 Rust 강점 적음
- TypeScript로 충분

**언제 채택?**: 성능 critical path 발견 시 부분 rewrite (예: 세션 검색)

---

## 3. UI 프레임워크 결정 (Phase 3)

### 3.1 Electron 41 (Phase 3 채택)

**근거**:
- 두 회사 모두 Electron 41.x 사용
- 검증된 워크플로우 (electron-forge 7.x)
- React + Vite + Tailwind 생태계
- claude.exe / codex.exe 둘 다 Electron 41

**구체 버전**:
- Electron: 41.3.0 (Claude 일치)
- electron-forge: 7.8.3 (Claude 일치)
- Vite: 6.4.1 (Claude 일치)
- React: 18.3.1 (Claude 일치) ← Codex 19보다 안정적
- Tailwind: 3.4 (Claude 일치) ← v4 OKLCH는 새로 검증 필요

### 3.2 Tauri (대안)

**검토**: 보류
- Rust + WebView2 → 작은 바이너리
- 그러나 두 CLI 통합에 추가 복잡도
- electron으로 충분

### 3.3 Ink (CLI TUI, 옵션)

**채택 시점**: Phase 2 후반
- React-style CLI UI (`aix code` 인터랙티브)
- claude도 일부 Ink-like 패턴

---

## 4. 데이터 저장

### 4.1 SQLite + better-sqlite3 ⭐ 채택

**근거**:
- Claude가 Drizzle + better-sqlite3 사용
- Codex가 sqlx (Rust)이지만 동일 SQLite
- 단일 파일, 백업 쉬움
- FTS (Full-Text Search) 내장

**스키마**: [ARCHITECTURE.md § 6.2](./ARCHITECTURE.md) 참고

### 4.2 Drizzle ORM (옵션)

**채택 시점**: Phase 2 (스키마 복잡도 ↑)
- Claude가 Drizzle 7 사용 (ec292792-... snapshot)
- TypeScript-first ORM
- 마이그레이션 관리 쉬움

### 4.3 LevelDB (불채택)

**근거**: SQLite로 충분

---

## 5. CLI 파서

### 5.1 commander 12 ⭐ 채택

**근거**:
- Node 생태계 표준
- 풍부한 옵션 / sub-command
- TypeScript types 우수

```typescript
import { Command } from 'commander';

const program = new Command();
program
  .name('aix')
  .description('Unified wrapper for Claude Code + Codex CLI')
  .version('0.1.0');

program
  .command('code [prompt...]')
  .option('-p, --provider <name>', 'Provider (claude/codex/auto)')
  .option('-m, --model <name>', 'Model name')
  .action(async (prompt, opts) => { ... });
```

### 5.2 yargs (대안)

**불채택**: commander가 더 단순하고 충분.

---

## 6. Schema 검증

### 6.1 zod 3 ⭐ 채택

**근거**: Claude 채택 (확인됨)

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  default_provider: z.enum(['claude', 'codex', 'auto']),
  providers: z.object({
    claude: z.object({ binary: z.string(), default_model: z.string() }),
    codex: z.object({ binary: z.string(), default_model: z.string() }),
  }),
});

type Config = z.infer<typeof ConfigSchema>;
```

### 6.2 zod-to-json-schema

**채택 시점**: MCP tool 정의 시 (Claude 동일 패턴)

---

## 7. Subprocess

### 7.1 execa 9 ⭐ 채택

**근거**:
- `child_process`보다 깔끔한 API
- Promise + async iterable 지원
- signal handling 간편
- 두 CLI spawn 표준화

```typescript
import { execa } from 'execa';

const subprocess = execa('claude', ['--print', prompt], {
  stdio: ['inherit', 'pipe', 'inherit'],
});

for await (const line of subprocess.stdout!) {
  console.log(line.toString());
}
```

### 7.2 node:child_process (직접)

**불채택**: execa가 더 우월.

---

## 8. Config 형식

### 8.1 TOML (smol-toml) ⭐ 채택

**근거**:
- Codex가 TOML 사용 (`~/.codex/config.toml`)
- 사용자 친숙도 ↑ (vs JSON)
- 주석 지원
- smol-toml은 Claude 채택

```toml
# ~/.aix/config.toml
default_provider = "auto"

[providers.claude]
binary = "auto"
default_model = "claude-sonnet-4-6"

[smart_routing]
enabled = true
short_threshold = 100
```

### 8.2 JSON (대안)

**불채택**: TOML이 더 사용자 친화적.

---

## 9. Lint / Format

### 9.1 oxlint + oxfmt (OXC) ⭐ 채택

**근거**:
- 두 회사 모두 채택 (산업 표준화 신호)
- ESLint 대비 50-100x 빠름
- TypeScript 네이티브

```json
{
  "scripts": {
    "lint": "oxlint --tsconfig ./tsconfig.json --max-warnings 0 --type-aware",
    "format": "oxfmt --check",
    "format:fix": "oxfmt --write"
  }
}
```

### 9.2 prettier + eslint (대안)

**불채택**: oxc가 미래.

---

## 10. 테스트

### 10.1 vitest 4 ⭐ 채택

**근거**:
- 두 회사 모두 채택
- Vite 통합 (config 공유)
- TypeScript 네이티브

### 10.2 playwright (E2E)

**채택 시점**: Phase 3 (Electron UI)
- Claude가 playwright 1.58 사용

---

## 11. 텔레메트리 (옵션)

### 11.1 Sentry (옵션 — 사용자 동의)

**근거**:
- 두 회사 모두 사용 (@sentry/electron + @sentry/node)
- crash report 자동
- Privacy-first (PII 자동 scrub)

**Default**: **OFF** (사용자가 명시적 opt-in)

```toml
# ~/.aix/config.toml
[telemetry]
enabled = false  # 기본값
sentry_dsn = ""  # 사용자가 자체 DSN 사용 가능
```

---

## 12. 패키징 / 배포

### 12.1 npm (CLI)

```json
{
  "name": "@aix/cli",
  "version": "0.1.0",
  "bin": { "aix": "./dist/index.js" },
  "scripts": {
    "build": "vite build",
    "prepublishOnly": "npm run build && npm run test"
  }
}
```

### 12.2 Bun bundle (단일 binary, Phase 2)

```bash
bun build src/index.ts --compile --outfile aix
# → 단일 binary (~50 MB), 빠른 cold start
```

### 12.3 electron-forge MSIX (Phase 3, Windows UI)

**근거**: 두 회사 동일 (electron-forge maker-msix)

```json
{
  "config": {
    "forge": {
      "makers": [
        { "name": "@electron-forge/maker-msix" },
        { "name": "@electron-forge/maker-dmg" },
        { "name": "@electron-forge/maker-zip" }
      ]
    }
  }
}
```

---

## 13. 의존성 매트릭스

### 핵심 (모든 Phase)

```json
{
  "dependencies": {
    "commander": "^12",
    "execa": "^9",
    "smol-toml": "^1",
    "zod": "^3",
    "better-sqlite3": "^12",
    "winston": "^3",
    "chalk": "^5",
    "ora": "^8"
  }
}
```

### Phase 2 추가

```json
{
  "dependencies": {
    "ink": "^4",                  // CLI TUI (옵션)
    "drizzle-orm": "^0.30"        // SQLite ORM 강화
  }
}
```

### Phase 3 (Electron UI)

```json
{
  "dependencies": {
    "electron": "41.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^3.4",
    "@phosphor-icons/react": "^2.1",
    "react-intl": "^6.7"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.8.3",
    "@electron-forge/maker-msix": "^7.10.2",
    "@electron-forge/plugin-vite": "^7.8.3",
    "vite": "6.4.1"
  }
}
```

---

## 14. CI/CD

### 14.1 GitHub Actions ⭐ 채택

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [22, 24]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

### 14.2 Auto-publish

```yaml
# .github/workflows/release.yml
on:
  push: { tags: ['v*'] }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
```

---

## 15. 보안

### 15.1 Secret 저장 — OS keychain

| OS | Library |
|----|---------|
| Windows | `keytar` (DPAPI 백엔드) |
| macOS | `keytar` (Keychain) |
| Linux | `keytar` (libsecret) |

### 15.2 Subprocess 인자 sanitization

```typescript
// 사용자 입력을 직접 shell에 넣지 않음
import { execa } from 'execa';

// ❌ Wrong (shell injection)
exec(`claude "${userInput}"`);

// ✅ Correct (array args)
execa('claude', [userInput]);
```

### 15.3 Dependency audit

```yaml
# .github/workflows/audit.yml
on: { schedule: [{ cron: '0 0 * * 0' }] }
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=moderate
```

---

## 16. 문서

### 16.1 Docusaurus (Phase 3)

**채택 이유**:
- React 기반 (생태계 일치)
- GitHub Pages 무료 호스팅
- Markdown 친화

### 16.2 README + Inline JSDoc

Phase 1-2는 README만 충분.

---

## 17. 분석 결과 직접 활용

이 섹션은 두 회사의 실제 빌드 환경을 그대로 차용:

### 직접 활용 항목

| 항목 | 출처 | 활용 |
|------|------|------|
| OXC 도구체인 (oxlint + oxfmt) | 두 회사 모두 | 채택 |
| TypeScript 6 + tsgo | 두 회사 모두 | 채택 |
| Electron 41.3 | Claude | 채택 |
| Vite 6.4.1 | Claude | 채택 (Phase 3 UI) |
| React 18.3.1 | Claude | 채택 (안정성 우선) |
| Tailwind 3.4 | Claude | 채택 (v4 OKLCH는 신중) |
| commander 12 | Codex/Claude | 채택 |
| smol-toml | Claude | 채택 |
| better-sqlite3 12 | Claude | 채택 |
| zod 3 | Claude | 채택 |
| winston 3 | Claude | 채택 |
| @sentry/electron 7 | 두 회사 | 채택 (옵션) |
| vitest 4 | 두 회사 | 채택 |
| @phosphor-icons/react 2.1 | Claude | 채택 (Phase 3) |
| electron-forge 7.8 | Claude | 채택 (Phase 3) |
| electron-store 8 | Claude | 채택 |

### 비채택 (이유)

| 항목 | 출처 | 비채택 이유 |
|------|------|-------------|
| Rust 백엔드 | Codex | TypeScript로 충분 |
| Hyper-V VM | Claude (Cowork) | 너무 복잡 + 의존성 |
| Walnut .NET WASM | Codex | 우리는 Office 통합 X |
| Lit 3.2 | Claude | React로 충분 |
| @anthropic-ai/conway-client | Claude | 우리는 자체 라우팅 |
| @ant/* workspace | Claude | 우리는 단일 패키지 |

---

## 18. Open Decisions

1. **단일 binary 빌드 시점**: Phase 1 끝 vs Phase 2 (Bun bundle)
2. **Electron UI**: Phase 3 vs 더 늦춤
3. **Rust 부분 rewrite**: 검색 부하 발생 시
4. **Drizzle vs raw SQL**: 스키마 복잡도 ↑ 시 Drizzle 도입
5. **VSCode 확장 monorepo vs 분리**: 결정 필요

---

## 19. 변경 로그

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-01 | v0.1 초안 | PRD 기반 |

---

## 관련

- [README.md](./README.md) — 프로젝트 인덱스
- [PRD.md](./PRD.md) — 제품 요구사항
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 시스템 아키텍처
- [CLI_INTEGRATION.md](./CLI_INTEGRATION.md) — CLI 래핑
- [ROADMAP.md](./ROADMAP.md) — 개발 로드맵
- [../codex/codex-spec.md](../codex/codex-spec.md) — Codex 분석
- [../claude/claude-spec-v5.md](../claude/claude-spec-v5.md) — Claude 분석
