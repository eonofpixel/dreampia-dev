# Architecture — Dev Tool

> **베이스**: [PRD.md](./PRD.md) F-001~F-012
> **분석 활용**: [Codex 분석](../codex/) + [Claude 분석](../claude/)
> **버전**: 0.1 초안

---

## 1. 시스템 다이어그램

```
┌──────────────────────────────────────────────────────────────────────┐
│  사용자 입력                                                           │
│  $ aix code "implement auth" --provider claude                        │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 1: aix CLI (Node.js / Bun, single binary 옵션)                 │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Argument Parser (commander 또는 yargs)                       │    │
│  │   - 글로벌 옵션 (--provider, --config, --usage)               │    │
│  │   - 서브커맨드 (code/exec/sessions/mcp/usage/verify)         │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 2: Smart Router                                                │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  if --provider 명시  → 해당 provider                           │    │
│  │  elif config.default → 그것                                     │    │
│  │  elif config.smart_routing.enabled:                            │    │
│  │      task_features = analyze(input)                           │    │
│  │      provider = heuristic(task_features)                      │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 3: Provider Adapter (Strategy Pattern)                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                  │
│  │  ClaudeProvider     │    │  CodexProvider      │                  │
│  │  - spawn claude     │    │  - spawn codex      │                  │
│  │  - args mapping     │    │  - args mapping     │                  │
│  │  - JSONL parser     │    │  - JSONL parser     │                  │
│  └─────────────────────┘    └─────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 4: Subprocess Manager                                          │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Node.js child_process.spawn()                                │    │
│  │  - stdin/stdout/stderr piping                                 │    │
│  │  - signal handling (Ctrl+C → SIGINT)                          │    │
│  │  - exit code propagation                                      │    │
│  │  - cancellation token                                         │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                ↓                        ↓
        ┌───────────────┐        ┌───────────────┐
        │  claude.exe   │        │  codex.exe    │
        │  (CCD CLI)    │        │  (Codex CLI)  │
        └───────────────┘        └───────────────┘
                ↓                        ↓
        ┌───────────────┐        ┌───────────────┐
        │ ~/.claude/    │        │ ~/.codex/     │
        │ projects/     │        │ sessions/     │
        │ <id>.jsonl    │        │ <id>.jsonl    │
        └───────────────┘        └───────────────┘
                ↓                        ↓
                └────────────┬───────────┘
                             ↓
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 5: Output Aggregator + Session Writer                          │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  - 두 CLI의 stdout JSONL 형식 → aix-native 통합 schema       │    │
│  │  - ~/.aix/sessions/<id>.aix.jsonl 작성                         │    │
│  │  - 원본은 raw/ 디렉토리에 보존                                  │    │
│  │  - 사용 토큰 / 비용 추적 (~/.aix/usage.db)                     │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 6: 사용자 출력                                                  │
│  - stdout: 응답 (passthrough or aix-native rendering)                │
│  - stderr: 진행 정보 + 라우팅 결정 + 비용 알림                          │
│  - 사후: 세션 파일 위치 표시                                            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. 데이터 플로우

### 2.1 단일 turn 실행

```
1. 사용자 입력 → aix CLI parse
2. config 로드 (~/.aix/config.toml)
3. smart_routing 결정 (또는 명시적 provider)
4. ProviderAdapter 인스턴스화 (Claude or Codex)
5. CLI 인자 매핑 (aix args → claude/codex args)
6. child_process.spawn() — stdin pipe
7. CLI stdout JSONL → aix parser → aggregator
8. aggregator → ~/.aix/sessions/<id>.aix.jsonl
9. parser → 사용자 stdout (응답 표시)
10. CLI 종료 → exit code 전파
```

### 2.2 세션 검색

```
$ aix search "auth"
1. ~/.aix/sessions/*.aix.jsonl scan
2. (옵션) ~/.claude/projects/<encoded>/*.jsonl scan
3. (옵션) ~/.codex/sessions/*.jsonl scan
4. content match → ranked results
5. terminal 출력 (provider tag + timestamp + path)
```

### 2.3 MCP 동기화

```
$ aix mcp add gmail --command "..."
1. validation (command 실행 가능?)
2. ~/.aix/mcp.json update
3. claude mcp add gmail --command "..." (subprocess)
4. codex mcp add gmail --command "..." (subprocess)
5. OAuth flow (necessary)
6. confirmed in both
```

---

## 3. 모듈 구조

```
src/
├─ cli/
│  ├─ index.ts              # 메인 entry (commander)
│  ├─ commands/
│  │  ├─ code.ts            # aix code "..."
│  │  ├─ exec.ts            # aix exec "..." (non-interactive)
│  │  ├─ sessions.ts        # aix sessions list/show/search
│  │  ├─ mcp.ts             # aix mcp add/remove/list
│  │  ├─ usage.ts           # aix usage
│  │  ├─ verify.ts          # aix verify
│  │  ├─ compare.ts         # aix compare
│  │  └─ config.ts          # aix config get/set
│  └─ utils/
│     ├─ args.ts
│     └─ output.ts
├─ router/
│  ├─ smart-router.ts       # heuristic 라우팅
│  ├─ task-analyzer.ts      # 입력 분석 (length, context, complexity)
│  └─ provider-selector.ts
├─ providers/
│  ├─ base-provider.ts      # 공통 인터페이스
│  ├─ claude-provider.ts    # Claude CCD wrapper
│  ├─ codex-provider.ts     # OpenAI Codex CLI wrapper
│  └─ types.ts
├─ subprocess/
│  ├─ spawn-manager.ts      # child_process 래핑
│  ├─ signal-handler.ts     # Ctrl+C 등
│  └─ stream-parser.ts      # JSONL stream parsing
├─ session/
│  ├─ writer.ts             # ~/.aix/sessions/ 작성
│  ├─ reader.ts             # 검색 / 로드
│  ├─ schema.ts             # aix-native JSONL schema
│  └─ adapter/
│     ├─ from-claude.ts     # claude → aix
│     └─ from-codex.ts      # codex → aix
├─ mcp/
│  ├─ manifest.ts           # ~/.aix/mcp.json 관리
│  ├─ sync.ts               # claude / codex 동기화
│  └─ validator.ts
├─ usage/
│  ├─ tracker.ts            # 토큰 / 비용 추적
│  └─ db.ts                 # SQLite (better-sqlite3)
├─ config/
│  ├─ loader.ts             # ~/.aix/config.toml
│  └─ schema.ts             # zod validation
└─ index.ts                 # entry point
```

---

## 4. 핵심 인터페이스

### 4.1 BaseProvider

```typescript
abstract class BaseProvider {
  abstract readonly name: 'claude' | 'codex';
  abstract readonly models: string[];

  abstract findBinary(): Promise<string>;
  abstract supportedFeatures(): Feature[];

  abstract async exec(args: ExecArgs): Promise<ExecResult>;
  abstract async stream(args: ExecArgs): AsyncIterable<ChunkEvent>;

  abstract parseSessionFile(path: string): Promise<AixSession>;
  abstract translateMessage(msg: AixMessage): NativeMessage;
}

interface ExecArgs {
  prompt: string;
  model?: string;
  cwd?: string;
  systemPrompt?: string;
  mcpConfig?: string;
  allowedTools?: string[];
  effort?: 'low' | 'medium' | 'high';
  ephemeral?: boolean;
}

interface ExecResult {
  output: string;
  tokens: { input: number; output: number; cache?: number };
  cost?: number;
  sessionId: string;
  rawSessionPath: string;
}
```

### 4.2 SmartRouter

```typescript
interface RoutingContext {
  prompt: string;
  promptTokens: number;
  contextTokens: number;
  cwd?: string;
  hasAttachments?: boolean;
  userPreference?: 'claude' | 'codex' | 'auto';
}

interface RoutingDecision {
  provider: 'claude' | 'codex';
  model?: string;
  reasoning: string;  // for stderr 표시
  estimatedCost?: number;
}

class SmartRouter {
  decide(ctx: RoutingContext, config: AixConfig): RoutingDecision;
}
```

### 4.3 AixSession (통합 schema)

```typescript
interface AixSession {
  id: string;                    // aix-native UUID
  provider: 'claude' | 'codex';
  rawSessionId: string;          // 원본 CLI session id
  createdAt: number;
  updatedAt: number;
  cwd?: string;
  model: string;

  messages: AixMessage[];
  toolCalls: AixToolCall[];
  artifacts: AixArtifact[];

  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    estimatedCost: number;
  };

  metadata?: Record<string, unknown>;
}

interface AixMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
  timestamp: number;
}
```

---

## 5. CLI 매핑 (Highlight)

### Claude CCD CLI ↔ aix

| aix 명령 | Claude 명령 |
|----------|------------|
| `aix code "..."` | `claude --print "..."` |
| `aix exec "..."` | `claude -p "..." --output-format json` |
| `aix code --resume` | `claude --continue` |
| `aix mcp add` | `claude mcp add` |
| `aix sessions list` | `claude sessions ls` (또는 자체 ~/.aix scan) |

### Codex CLI ↔ aix

| aix 명령 | Codex 명령 |
|----------|-----------|
| `aix code "..."` | `codex "..."` (interactive) |
| `aix exec "..."` | `codex exec "..."` |
| `aix code --resume` | `codex resume --last` |
| `aix mcp add` | `codex mcp add` |
| `aix review` | `codex review` |

세부: [CLI_INTEGRATION.md](./CLI_INTEGRATION.md)

---

## 6. Storage 모델

### 6.1 디렉토리 구조

```
~/.aix/
├─ config.toml                # 글로벌 설정
├─ mcp.json                   # MCP 통합 manifest
├─ sessions/
│  ├─ <aix-id>.aix.jsonl     # 통합 형식
│  └─ raw/
│     ├─ claude_<id>.jsonl   # 원본 보존 (참조용)
│     └─ codex_<id>.jsonl
├─ usage.db                   # SQLite — 토큰 / 비용
├─ projects/
│  └─ <encoded-cwd>.json      # 프로젝트별 컨텍스트
└─ logs/
   └─ aix-<date>.log
```

### 6.2 usage.db 스키마

```sql
CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER,
  cache_creation_tokens INTEGER,
  estimated_cost REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_turns_provider ON turns(provider);
CREATE INDEX idx_turns_created ON turns(created_at);
```

---

## 7. 보안 설계

### 7.1 인증 위임

```
aix는 토큰을 저장하지 않음.
- claude 인증 → ~/.claude/auth.json (Anthropic 관리)
- codex 인증 → ~/.codex/auth.json (OpenAI 관리)
- aix는 둘을 호출만 함 (subprocess로)
```

### 7.2 권한 시스템

```
aix code 시 권한 모델:
1. aix --no-confirm 옵션 → 양쪽 CLI에 그대로 전달 (--dangerously-skip)
2. aix --workspace-write → claude/codex 둘 다 workspace-write 모드
3. 기본: 양쪽 CLI 기본값 따름 (대화형 prompt)
```

### 7.3 시크릿 보호

```
config.toml 에 절대 저장하지 않음:
- API 키 (각 회사 시스템에 위임)
- OAuth 토큰

OS keychain 사용 (필요 시):
- Windows: DPAPI (electron-store 패턴)
- macOS: Keychain
- Linux: libsecret
```

---

## 8. 성능 / 확장성

### 8.1 Cold start 최적화

목표: `aix code "..."` 시작 → child spawn까지 100ms 이내

전략:
- Lazy-load (commander 외 module은 lazy import)
- Bun 빌드 옵션 (single binary, native startup)
- pkg / nexe 옵션도 평가

### 8.2 세션 검색 1000건

목표: ≤ 500ms

전략:
- ~/.aix/sessions/*.aix.jsonl을 SQLite FTS로 인덱스
- 백그라운드 인덱싱 (turn 종료 후)
- 사용자 검색은 인덱스만 hit

### 8.3 동시 turn

```
$ aix compare "..."  # claude + codex 둘 다 동시 실행
```

전략:
- Promise.all() 병렬 spawn
- 두 결과 모두 받으면 diff 표시
- 토큰 / 비용 합산

---

## 9. 의존성

### Runtime (설치 필수)

```json
{
  "dependencies": {
    "commander": "^12",         // CLI parser
    "smol-toml": "^1",          // config (Codex와 동일)
    "zod": "^3",                // schema validation
    "better-sqlite3": "^12",    // usage tracking (Claude와 동일)
    "execa": "^9",              // subprocess (better than child_process)
    "ora": "^8",                // spinner
    "chalk": "^5"               // terminal color
  }
}
```

### Dev

```json
{
  "devDependencies": {
    "typescript": "^6",
    "@typescript/native-preview": "*",
    "vitest": "^4",
    "oxlint": "^1",
    "oxfmt": "*",
    "@types/node": "^22"
  }
}
```

(Codex/Claude 분석 결과로 발견된 oxc 도구체인 동일 채택)

---

## 10. 비기능 요구사항 매핑

| PRD NFR | 아키텍처 보장 |
|---------|--------------|
| Cold start ≤ 100ms | Bun single binary + lazy load |
| Subprocess overhead ≤ 50ms | execa 직접 사용 |
| 세션 검색 1000건 ≤ 500ms | SQLite FTS 인덱스 |
| Windows/macOS/Linux | Node.js 22+ 크로스 플랫폼 |
| 보안 | OS keychain + 위임 인증 |

---

## 11. Open Questions

1. **단일 binary 빌드?** Bun bundle vs pkg vs nexe vs Rust rewrite
2. **TUI vs 단순 CLI?** Ink (React for CLI) 도입 시기
3. **Plugin 시스템?** Phase 3에서 어떤 형태 (NPM package vs WebAssembly)
4. **VSCode 확장 분리?** 별도 repo or monorepo
5. **공식 SDK 사용?** `@anthropic-ai/claude-agent-sdk` 직접 사용 vs CLI subprocess

---

## 관련

- [README.md](./README.md) — 프로젝트 인덱스
- [PRD.md](./PRD.md) — 제품 요구사항
- [CLI_INTEGRATION.md](./CLI_INTEGRATION.md) — CLI 명령어 매핑 상세
- [TECH_STACK.md](./TECH_STACK.md) — 기술 선택 근거
- [ROADMAP.md](./ROADMAP.md) — 단계별 개발 계획
