# CLI Integration — Claude CCD + Codex 래핑 스펙

> **베이스**: 두 CLI의 정확한 인터페이스 분석 결과 활용
> **참고**: [Codex 분석](../codex/) + [Claude 분석](../claude/)
> **버전**: 0.1 초안

---

## 1. 두 CLI의 인터페이스 (실측)

### 1.1 Claude CCD (Anthropic)

**바이너리**: `~/AppData/Roaming/Claude/claude-code/2.1.121/claude.exe` (253 MB Node SEA)
**또는**: `npx @anthropic-ai/claude-agent-sdk` (npm)

**식별된 명령어 (실측)**:

```
claude [PROMPT]                  # 인터랙티브
claude --print "..."             # non-interactive (stdout만)
claude --continue                # 마지막 세션 재개
claude --resume <session-id>     # 특정 세션 재개
claude --output-format json      # JSONL stream
claude --mcp-config <path>       # MCP 서버 추가
claude --add-dir <path>          # 추가 워크스페이스
claude --skip-permissions        # 권한 prompt 우회
claude --dangerously-skip-permissions  # 강력 우회
claude mcp list                  # MCP 서버 목록
claude mcp add <name> <command>
claude mcp remove <name>
```

**입력 / 출력**:
- stdin: 프롬프트 (옵션)
- stdout: 응답 또는 JSONL stream
- 세션 저장: `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`

**JSONL 형식 (실측)**:

```json
{"type":"queue-operation","operation":"enqueue","timestamp":"...","sessionId":"...","content":"<user message>"}
{"parentUuid":null,"isSidechain":false,"attachment":{"type":"hook_success","hookName":"...",...},"type":"attachment","uuid":"...","timestamp":"...","userType":"external","entrypoint":"claude-desktop","cwd":"...","sessionId":"...","version":"2.1.121","gitBranch":"HEAD"}
```

---

### 1.2 OpenAI Codex CLI

**바이너리**: `~/AppData/Roaming/npm/codex` (npm 글로벌)

**식별된 명령어 (실측)**:

```
codex [OPTIONS] [PROMPT]                  # 인터랙티브
codex exec [OPTIONS] [PROMPT]            # non-interactive [aliases: e]
codex review                              # 코드 리뷰 비인터랙티브
codex login                               # 인증
codex logout                              # 인증 제거
codex mcp                                 # MCP 서버 관리
codex plugin                              # 플러그인 관리
codex mcp-server                          # Codex을 MCP 서버로 시작 (stdio)
codex app-server                          # [실험] app 서버
codex app                                 # 데스크톱 앱 시작
codex completion                          # 셸 자동완성
codex sandbox                             # 샌드박스 명령
codex debug
codex apply [aliases: a]                  # 마지막 diff을 git apply
codex resume                              # 이전 인터랙티브 재개
codex fork                                # 이전 세션 분기
codex cloud                               # [실험] Codex Cloud
codex exec-server                         # [실험] standalone exec-server
codex features                            # feature flag 검사
codex help
```

**`codex exec` 핵심 옵션 (실측)**:

```
-c, --config <key=value>          # ~/.codex/config.toml override
    --enable <FEATURE>
    --disable <FEATURE>
-s, --sandbox <SANDBOX_MODE>      # read-only / workspace-write / danger-full-access
    --full-auto                   # 저마찰 sandboxed 자동 실행
    --dangerously-bypass-approvals-and-sandbox
-C, --cd <DIR>                    # working directory
    --add-dir <DIR>
    --skip-git-repo-check
    --ephemeral                   # 세션 파일 미저장
    --ignore-user-config
    --ignore-rules
    --output-schema <FILE>        # JSON Schema 응답 형식
    --color <COLOR>
    --json                        # JSONL stdout
-o, --output-last-message <FILE>  # 마지막 메시지 → 파일
```

**JSONL 형식 (실측)**:

```json
{"timestamp":"...","type":"session_meta","payload":{"id":"...","cwd":"...","source":"...","base_instructions":"...","dynamic_tools":[...]}}
{"timestamp":"...","type":"event_msg","payload":{"type":"task_started",...}}
{"timestamp":"...","type":"response_item","payload":{"type":"function_call|reasoning|message|...",...}}
```

---

## 2. aix 명령어 매핑

### 2.1 매핑 테이블 — 핵심 명령

| aix 명령 | 동작 | claude 호출 | codex 호출 |
|----------|------|------------|-----------|
| `aix code "..."` | 인터랙티브 turn | `claude "..."` | `codex "..."` |
| `aix exec "..."` | non-interactive | `claude --print "..."` | `codex exec "..."` |
| `aix code --resume` | 마지막 세션 재개 | `claude --continue` | `codex resume --last` |
| `aix code --resume <id>` | 특정 세션 재개 | `claude --resume <id>` | `codex resume <id>` |
| `aix code --json` | JSONL stream | `claude --output-format json` | `codex exec --json` |
| `aix mcp add <name>` | MCP 추가 | `claude mcp add` | `codex mcp add` |
| `aix mcp list` | MCP 목록 | `claude mcp list` | `codex mcp list` |
| `aix mcp remove <name>` | MCP 제거 | `claude mcp remove` | `codex mcp remove` |
| `aix review <file>` | 코드 리뷰 | `claude --print "review {file}"` | `codex review` |
| `aix apply` | 마지막 diff 적용 | (없음 — 자체 구현) | `codex apply` |
| `aix login --provider X` | 인증 | (Claude Desktop UI) | `codex login` |

### 2.2 글로벌 옵션 매핑

| aix 옵션 | claude | codex |
|----------|--------|-------|
| `--provider {claude,codex,auto}` | (라우팅) | (라우팅) |
| `--model <name>` | `claude --model` | `codex -c model="..."` |
| `--cwd <path>` | `claude --add-dir` | `codex -C` |
| `--no-confirm` | `claude --dangerously-skip-permissions` | `codex --dangerously-bypass-...` |
| `--workspace-write` | (default 동작) | `codex -s workspace-write` |
| `--read-only` | (제한 prompt) | `codex -s read-only` |
| `--ephemeral` | (해당 옵션 없음) | `codex --ephemeral` |
| `--mcp-config <path>` | `claude --mcp-config` | `codex --enable mcp:<file>` |

### 2.3 출력 형식 매핑

```
aix 통합 stdout:
[provider:claude model:opus-4-7]
> Implementing auth middleware...

[tools]
+ Read app/middleware.ts
+ Edit app/middleware.ts (3 lines added)

[done]
~/.aix/sessions/<aix-id>.aix.jsonl saved
```

`--quiet`: 두 CLI의 stdout만 (passthrough)
`--verbose`: 라우팅 결정 + 토큰 수 + 비용 표시
`--json`: aix-native JSONL stream

---

## 3. Subprocess 호출 패턴

### 3.1 단순 turn (passthrough)

```typescript
import { spawn } from 'node:child_process';
import { execa } from 'execa';

class ClaudeProvider extends BaseProvider {
  async exec(args: ExecArgs): Promise<ExecResult> {
    const cliArgs = this.translateArgs(args);
    const proc = execa(this.binary, cliArgs, {
      stdio: ['inherit', 'pipe', 'inherit'],  // stdin / stdout / stderr
      cwd: args.cwd,
    });

    const sessionId = this.extractSessionId(proc.stdout);

    proc.stdout.on('data', (chunk) => {
      this.parseAndForward(chunk);
    });

    const { exitCode } = await proc;
    return {
      output: this.collectedOutput,
      sessionId,
      rawSessionPath: this.findSessionFile(sessionId),
      tokens: await this.parseUsage(),
    };
  }

  private translateArgs(args: ExecArgs): string[] {
    const out: string[] = [];
    if (args.model) out.push('--model', args.model);
    if (args.cwd) out.push('--add-dir', args.cwd);
    // ... etc
    out.push(args.prompt);
    return out;
  }
}
```

### 3.2 Stream parsing (JSONL)

```typescript
async function* parseClaudeStream(proc: ChildProcess): AsyncIterable<AixEvent> {
  for await (const line of readlines(proc.stdout)) {
    try {
      const event = JSON.parse(line);
      yield translateClaudeEvent(event);
    } catch {
      // JSONL 외 라인은 raw passthrough
    }
  }
}

function translateClaudeEvent(claudeEvent: ClaudeEvent): AixEvent {
  switch (claudeEvent.type) {
    case 'attachment':
      return { type: 'tool_use', ...claudeEvent.attachment };
    case 'queue-operation':
      return { type: 'queue', op: claudeEvent.operation };
    // ...
  }
}
```

### 3.3 동시 spawn (compare 명령)

```typescript
async function compareCommand(prompt: string) {
  const [claudeResult, codexResult] = await Promise.all([
    new ClaudeProvider().exec({ prompt }),
    new CodexProvider().exec({ prompt }),
  ]);

  return {
    claude: claudeResult,
    codex: codexResult,
    diff: computeDiff(claudeResult.output, codexResult.output),
  };
}
```

---

## 4. 알려진 차이 / 호환 이슈

### 4.1 Claude는 있지만 Codex 없는 기능

| 기능 | Claude | Codex 대응 |
|------|--------|-----------|
| Git worktrees 자동 관리 | `~/.claude/git-worktrees.json` | 자체 구현 필요 |
| Skills (49+ user) | `~/.claude/plugins/.../SKILL.md` | (Codex skill 시스템 미검증, 자체 구현 권장) |
| `--continue` (last session) | ✓ | `codex resume --last` |
| Hooks (pre/post turn) | `~/.claude/hooks/*.mjs` | (Codex 미상) |

### 4.2 Codex는 있지만 Claude 없는 기능

| 기능 | Codex | Claude 대응 |
|------|-------|-----------|
| `codex apply` (git apply) | ✓ | (자체 구현 필요) |
| `codex review` 단독 | ✓ | `claude --print "review {file}"` |
| `codex sandbox` | ✓ | (Cowork VM 일부 유사) |
| `codex fork` | ✓ | (Claude는 worktree 자동) |
| `codex features` | ✓ | (Claude는 자체 GBCache) |
| `--ephemeral` | ✓ | (Claude 옵션 없음 — 자체 구현 필요) |

### 4.3 양쪽 다 있지만 다른 동작

| 항목 | Claude | Codex |
|------|--------|-------|
| 세션 저장 위치 | `~/.claude/projects/<encoded>/` | `~/.codex/sessions/` |
| 권한 모델 | trust folder + bypass mode | sandbox levels (read-only / workspace-write / full-access) |
| 설정 파일 | `~/.claude/settings.json` (JSON) | `~/.codex/config.toml` (TOML) |
| Model 명시 | `--model claude-opus-4-7` | `-c model="gpt-5"` |
| MCP 형식 | `claude_desktop_config.json` | `~/.codex/config.toml` `[mcp_servers.X]` |

### 4.4 aix 통합 정책

```toml
# ~/.aix/config.toml
[providers.claude]
binary = "auto"
default_model = "claude-sonnet-4-6"
session_dir = "~/.claude/projects"

[providers.codex]
binary = "auto"
default_model = "gpt-5-mini"  # Codex 기본
session_dir = "~/.codex/sessions"

[features]
unified_session_search = true
mcp_sync = true
git_worktree_management = "claude_only"  # 또는 "self"
```

---

## 5. MCP 통합 동기화

### 5.1 통합 manifest

```json
// ~/.aix/mcp.json
{
  "version": 1,
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@anthropic/gmail-mcp"],
      "env": { "GMAIL_TOKEN": "..." },
      "providers": ["claude", "codex"],
      "lastSyncedAt": 1777615535
    },
    "github": {
      "command": "node",
      "args": ["./mcp-github.js"],
      "providers": ["claude"],
      "lastSyncedAt": 1777615535
    }
  }
}
```

### 5.2 동기화 알고리즘

```typescript
async function syncMcp() {
  const manifest = readManifest('~/.aix/mcp.json');

  for (const [name, server] of Object.entries(manifest.mcpServers)) {
    if (server.providers.includes('claude')) {
      await execa('claude', ['mcp', 'add', name, server.command, ...server.args]);
    }
    if (server.providers.includes('codex')) {
      await execa('codex', ['mcp', 'add', name, server.command, ...server.args]);
    }
    server.lastSyncedAt = Date.now();
  }

  writeManifest('~/.aix/mcp.json', manifest);
}
```

### 5.3 충돌 해결

```
사용자가 claude mcp add를 직접 실행한 경우:
1. aix mcp pull → 양쪽 CLI에서 mcp list 가져옴
2. ~/.aix/mcp.json과 비교
3. 충돌 시 prompt:
   - aix manifest 우선?
   - CLI 직접 등록 우선?
   - merge?
```

---

## 6. 세션 통합 형식 (aix-native JSONL)

### 6.1 schema

```typescript
type AixJsonlLine =
  | { type: 'session_meta', ... }
  | { type: 'message', role: 'user'|'assistant', content: ContentBlock[], ... }
  | { type: 'tool_call', name: string, args: any, result?: any, ... }
  | { type: 'usage', input: number, output: number, cost: number, ... }
  | { type: 'route_decision', from: string, to: string, reason: string, ... }
  | { type: 'raw_event', provider: 'claude'|'codex', payload: any, ... };
```

### 6.2 변환기 — Claude → aix

```typescript
function convertClaudeJsonl(line: ClaudeJsonl): AixJsonlLine | null {
  switch (line.type) {
    case 'queue-operation':
      if (line.operation === 'enqueue') {
        return { type: 'message', role: 'user', content: [{ type: 'text', text: line.content }], timestamp: line.timestamp };
      }
      return null;
    case 'attachment':
      if (line.attachment.type === 'tool_use') {
        return { type: 'tool_call', name: line.attachment.toolName, args: line.attachment.input, ... };
      }
      return null;
    // ...
  }
}
```

### 6.3 변환기 — Codex → aix

```typescript
function convertCodexJsonl(line: CodexJsonl): AixJsonlLine | null {
  switch (line.type) {
    case 'session_meta':
      return { type: 'session_meta', cwd: line.payload.cwd, ... };
    case 'response_item':
      if (line.payload.type === 'message') {
        return { type: 'message', role: 'assistant', content: line.payload.content, ... };
      }
      if (line.payload.type === 'function_call') {
        return { type: 'tool_call', name: line.payload.name, args: line.payload.arguments, ... };
      }
      return null;
    // ...
  }
}
```

---

## 7. 토큰 / 비용 추적

### 7.1 모델별 가격 (2026년 5월 기준 추정)

```typescript
const PRICING = {
  // Claude (Anthropic)
  'claude-opus-4-7':   { input: 15.00, output: 75.00 },  // per 1M tokens
  'claude-opus-4-6':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.00 },

  // OpenAI (Codex)
  'gpt-5':       { input: 5.00,  output: 20.00 },
  'gpt-5-mini':  { input: 0.30,  output: 1.20 },
  'gpt-5-nano':  { input: 0.05,  output: 0.20 },
  // o-series는 별도
};
```

### 7.2 추적 트리거

```typescript
// CLI exec 종료 시
const usage = parseUsage(rawOutput);
db.run('INSERT INTO turns (...)', usage);

// 월간 합산
const total = db.get('SELECT SUM(estimated_cost) FROM turns WHERE created_at > ?', startOfMonth);
```

---

## 8. 위험 / 호환성 매트릭스

### 8.1 CLI 버전 호환

| 도구 | 분석 시 버전 | aix v0.1 호환 |
|------|-------------|--------------|
| claude CCD | 2.1.121 | ✓ (확인) |
| codex CLI | (분석 시점) | ✓ (확인) |

**자동 감지**:

```typescript
async function checkCliVersions() {
  const claudeVersion = (await execa('claude', ['--version'])).stdout;
  const codexVersion = (await execa('codex', ['--version'])).stdout;

  if (semver.lt(claudeVersion, '2.0')) {
    throw new Error('claude CLI ≥ 2.0 required');
  }
  // ...
}
```

### 8.2 Breaking change 대응

CLI 인자 변경 → aix 자동 업데이트 (npm)
- `aix doctor` 명령으로 호환성 진단
- README에 "Tested with claude X.Y.Z, codex A.B.C" 명시

---

## 9. 인증 / 권한 위임 흐름

```
사용자 → aix code → ClaudeProvider.exec() → child_process.spawn(claude)
                                                    ↓
                                         claude CLI uses ~/.claude/auth.json
                                         (Anthropic-managed)
                                                    ↓
                                         API call to api.anthropic.com
                                                    ↓
                                         response → child stdout
                                                    ↓
aix ← child stdout

aix는 토큰 / 인증을 절대 보지 않음.
```

---

## 10. 테스트 전략

### 10.1 단위 테스트

```typescript
// tests/providers/claude.test.ts
test('translateArgs maps --model correctly', () => {
  const provider = new ClaudeProvider();
  const args = provider.translateArgs({ prompt: 'test', model: 'claude-opus-4-7' });
  expect(args).toContain('--model');
  expect(args).toContain('claude-opus-4-7');
});
```

### 10.2 통합 테스트 (mock CLI)

```typescript
// tests/integration/exec.test.ts
beforeEach(() => {
  mockBinary('claude', './fixtures/claude-mock.js');  // stdout JSONL fixture
});

test('aix code routes to claude when --provider claude', async () => {
  const result = await runAix(['code', '--provider', 'claude', 'hello']);
  expect(result.stdout).toContain('claude response');
});
```

### 10.3 E2E (실제 CLI)

```yaml
# .github/workflows/e2e.yml
- name: E2E test
  run: |
    npm install -g claude
    npm install -g codex
    npm install -g .  # aix
    aix code --provider claude --ephemeral "hello"
    aix code --provider codex --ephemeral "hello"
```

---

## 관련

- [README.md](./README.md) — 프로젝트 인덱스
- [PRD.md](./PRD.md) — 제품 요구사항
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 시스템 아키텍처
- [TECH_STACK.md](./TECH_STACK.md) — 기술 선택
- [ROADMAP.md](./ROADMAP.md) — 개발 로드맵
- [../codex/codex-spec.md](../codex/codex-spec.md) — Codex CLI 분석
- [../claude/claude-spec-v5.md](../claude/claude-spec-v5.md) — Claude CLI 분석
