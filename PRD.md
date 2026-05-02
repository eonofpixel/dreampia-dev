# Product Requirements Document — Dev Tool

> **프로젝트**: AI 코딩 CLI 통합 래퍼 (Claude Code + Codex)
> **버전**: PRD v0.1 (초안)
> **상태**: 기획 (Pre-Implementation)
> **승인자**: TBD

---

## 1. 배경 (Background)

### 1.1 시장 상황 (2026년 5월 기준)

- **Anthropic Claude Code** (CCD) — `@anthropic-ai/claude-agent-sdk@0.2.121`, Claude Desktop 1.5354에 통합
- **OpenAI Codex CLI** — `npm/codex`, Codex 26.422에 통합

두 도구 모두:
- 명령어 기반 인터페이스
- MCP (Model Context Protocol) 표준 지원
- 세션 트랜스크립트 (JSONL)
- 프로젝트 trust 모델
- Sentry 텔레메트리

그러나 **별도 라이프사이클**:
- 설정 / 세션 / MCP / 프로젝트 컨텍스트 분리
- 사용자가 매번 둘 중 선택해야 함
- 같은 작업을 두 AI에 비교 검증 어려움

### 1.2 사용자 인터뷰 (가상 시나리오)

> "복잡한 리팩토링은 Claude가 좋은 거 같아서 Claude Code 쓰고, 빠른 typo 수정은 Codex 쓰는데, 매번 다른 CLI를 켜야 해서 귀찮음. 또 Claude로 짠 거를 Codex로 review 받고 싶을 때도 있고."
>
> — 가상 시나리오 사용자 A

> "MCP 서버 (Gmail, Notion, GitHub)를 두 CLI에 따로 등록해야 하는 게 짜증남. 한 번 등록하면 둘 다 쓸 수 있으면 좋겠어."
>
> — 가상 시나리오 사용자 B

### 1.3 분석 결과로 가능성 확인

[FINAL_REPORT.md](../FINAL_REPORT.md) 분석 결과:
- 두 CLI 모두 **subprocess로 호출 가능**
- 두 CLI 모두 **JSONL 트랜스크립트** 출력
- 두 CLI 모두 **MCP 표준** 따름
- 두 CLI 모두 **OAuth 또는 API 키** 인증

→ **단순 subprocess 래퍼 + JSONL adapter로 통합 가능** (라이선스 / 법적 문제 없음).

---

## 2. 사용자 (Users)

### 2.1 Primary Persona — "양손잡이 개발자"

| 항목 | 설명 |
|------|------|
| 직업 | 풀스택 개발자, AI 도구 enthusiast |
| 환경 | Windows 11 또는 macOS, IDE = VSCode/JetBrains |
| 기존 사용 | Claude Code + ChatGPT (둘 다 유료 구독) |
| 페인 포인트 | 두 CLI 사이 컨텍스트 스위칭 + 비교 검증 어려움 |
| 동기 | 작업별 최적 모델 활용 + 한 곳에서 관리 |

### 2.2 Secondary Persona — "AI 도구 평가자"

| 항목 | 설명 |
|------|------|
| 직업 | 시니어 엔지니어, CTO, 컨설턴트 |
| 환경 | 다양한 프로젝트 동시 진행 |
| 동기 | 같은 작업을 두 AI에 비교하여 모델 품질 평가 |
| 사용 패턴 | benchmark + side-by-side comparison |

### 2.3 Anti-Persona — 다음은 타겟 X

- 단일 AI만 쓰는 사용자 (이미 만족)
- API 키 없는 사용자 (이 도구는 자체 키 호스팅 X)
- 비개발자 (CLI 도구라 진입 장벽)

---

## 3. 핵심 기능 (Core Features)

### 3.1 P0 — MVP 필수 (Phase 1, 4주)

#### F-001: Subprocess 래핑 (claude / codex)

```bash
$ aix code --provider claude "..."   # → spawns claude CLI
$ aix code --provider codex "..."    # → spawns codex CLI
```

**Acceptance**: 두 CLI의 모든 인자를 정상 전달, stdout/stderr 그대로 표시

#### F-002: 통합 설정 파일

```toml
# ~/.aix/config.toml
default_provider = "claude"
[providers.claude]
binary = "auto"  # auto-detect from $PATH or ~/.claude/...
[providers.codex]
binary = "auto"
[smart_routing]
enabled = true
short_task_threshold = 100  # chars → use codex
```

**Acceptance**: 설정 변경 시 즉시 반영, `aix config get/set` 지원

#### F-003: 통합 세션 디렉토리

```
~/.aix/sessions/
├─ <session-id>.aix.jsonl          # aix-native 형식
└─ raw/
   ├─ claude_<id>.jsonl            # 원본 보존
   └─ codex_<id>.jsonl
```

**Acceptance**: 세션 시작 시 양쪽 형식 모두 저장, `aix sessions list/show` 지원

#### F-004: MCP 통합 manifest

```json
// ~/.aix/mcp.json
{
  "mcpServers": {
    "gmail": { "command": "...", "providers": ["claude", "codex"] },
    "github": { "command": "...", "providers": ["claude"] }
  }
}
```

**Acceptance**: 설정 시 두 CLI에 자동 동기화 (`claude mcp add` + `codex mcp add` 호출)

### 3.2 P1 — v1 (Phase 2, 8주)

#### F-005: Smart Routing

작업 분석 → 적절한 모델 자동 선택:
- 짧은 작업 (< 100 chars input) → codex (저렴)
- 긴 컨텍스트 (> 100k tokens) → claude (1M context)
- 복잡한 reasoning → opus
- 빠른 코드 수정 → sonnet 또는 GPT

**Heuristic**:
```python
def route(task: Task) -> Provider:
    if task.context_tokens > 200_000:
        return "claude"  # 1M context
    if task.is_complex_reasoning():
        return "claude-opus"
    if task.is_quick_fix():
        return "codex-fast"
    return config.default_provider
```

#### F-006: Cross-AI 검증

```bash
$ aix verify  # 마지막 turn 응답을 다른 AI에 review 요청
$ aix verify --diff  # diff 표시
```

#### F-007: 통합 세션 검색

```bash
$ aix search "authentication middleware"
[claude] 2026-04-20 implementing auth → ~/.claude/projects/...
[codex]  2026-04-22 fixing auth bug → ~/.codex/sessions/...
[aix]    2026-04-25 cross-validate → ~/.aix/sessions/...
```

#### F-008: 비용 통합 대시보드

```bash
$ aix usage
This month:
  claude: $42.18 (12 sessions, 580k input + 120k output)
  codex:  $8.31  (38 sessions, 250k input + 80k output)
  total:  $50.49
```

### 3.3 P2 — v2 (Phase 3, 12주)

#### F-009: Optional Electron UI
#### F-010: VSCode 확장 (옵션)
#### F-011: Plugin 시스템 (사용자 정의 router)
#### F-012: 통합 git worktree 관리 (Claude의 `claude/<adjective>-<scientist>` 패턴 차용)

---

## 4. Non-Functional Requirements

### 4.1 성능

| 지표 | 목표 |
|------|------|
| `aix code` 시작 latency | ≤ 100ms (위에 spawn 없을 때) |
| Subprocess overhead | ≤ 50ms |
| 세션 검색 1000건 | ≤ 500ms |

### 4.2 호환성

- **OS**: Windows 11 + macOS 13+ + Linux (Ubuntu 22+)
- **Node**: 22+ (양쪽 CLI 요구사항 따라)
- **Bun**: 옵셔널 (Claude CLI Bun 빌드 가능성 발견)

### 4.3 보안

- 양쪽 CLI 인증은 **각 회사 시스템에 위임** (직접 토큰 저장 X)
- 사용자 API 키는 **OS keychain** 사용 (DPAPI/Keychain/libsecret)
- MCP 도구 호출 권한은 **각 CLI의 권한 시스템 따름**
- 자체 API 키 추가 통합 X (legal liability)

### 4.4 라이선스

- **Apache 2.0** 또는 MIT (오픈소스)
- 두 CLI는 subprocess 호출만 → 두 회사 라이선스 위반 X

---

## 5. 사용자 시나리오 (User Stories)

### US-1: 빠른 시작 (5분 내)

```
사용자: 새 머신에 Claude Code + Codex CLI 둘 다 설치된 상태
조건: aix 설치만 하면 즉시 사용 가능

$ npm install -g @aix/cli   # 30초
$ aix init                   # 5초 — 자동 detect
$ aix code "..."             # 작동
```

### US-2: 모델 비교

```
사용자: "이 함수의 버그를 두 AI에 모두 보여서 비교"
$ aix compare code/buggy.ts "find the bug"
[claude opus]
> The bug is on line 42: array index out of bounds.
[codex gpt-5]
> Line 42 has an off-by-one error.
[diff]
- 동의: 같은 라인 식별
- 차이: claude가 더 자세한 설명
```

### US-3: 비용 컨트롤

```
$ aix usage --limit 100  # 월 $100 한도 설정
[현재: $50.49 / $100.00]

$ aix code "..."  # 한도 초과 임박 시 경고
⚠ This task estimated $5.20. Continuing will reach 95% of limit.
Confirm? [y/N]
```

### US-4: MCP 단일 등록

```
$ aix mcp add gmail
✓ Added to claude (~/.claude/mcp-config)
✓ Added to codex (~/.codex/config.toml)
✓ Authenticated (OAuth flow once)

$ aix mcp list
- gmail (active in: claude, codex)
- github (active in: claude)
```

---

## 6. 측정 (Metrics)

### 6.1 사용성 지표

| 지표 | MVP 목표 (Phase 1) | v1 목표 (Phase 2) |
|------|-------------------|-------------------|
| 일간 활성 사용자 | 10 | 100 |
| 평균 세션 수 / 일 / 사용자 | 3 | 8 |
| Smart routing 정확도 | N/A | 80% |
| 통합 세션 검색 사용률 | N/A | 30% |
| 사용자 만족도 (NPS) | 미측정 | 30+ |

### 6.2 기술 지표

| 지표 | 목표 |
|------|------|
| Subprocess 실패율 | < 1% |
| 세션 데이터 손실 | 0% |
| 평균 응답 latency | < 1s 추가 (CLI 자체 latency 외) |

---

## 7. 위험 (Risks)

| 위험 | 영향 | 완화 |
|------|------|------|
| Claude/OpenAI CLI 인터페이스 변경 | High | CLI 버전 호환 매트릭스 + auto-update 알림 |
| 두 회사가 자체 통합 도구 출시 | Medium | 차별화 (자체 라우팅, 통합 검색, 비용 추적) |
| 라이선스 모호성 | Medium | 법무 자문 + Apache 2.0 사용 |
| 사용자 토큰 노출 위험 | High | OS keychain 사용 + 자체 토큰 저장 X |
| Smart routing 부정확 → 사용자 불만 | Medium | "예측 표시 + override 가능" UX |

---

## 8. 출시 계획

### Phase 1 (MVP) — 4주
- F-001 ~ F-004 구현
- Windows + macOS 지원
- GitHub 공개 (early access)

### Phase 2 (v1) — 8주
- F-005 ~ F-008 추가
- Linux 지원
- npm 정식 publish

### Phase 3 (v2) — 12주
- F-009 ~ F-012 추가
- VSCode Marketplace
- 가능 시 후원 / 공식 인증

---

## 9. Open Questions

1. **이름**: aix? mux? devpilot? cocode? — 사용자 결정 필요
2. **언어**: Node.js / Bun / Rust 중 어느 것? → [TECH_STACK.md](./TECH_STACK.md) 참고
3. **라이선스**: Apache 2.0 vs MIT vs proprietary?
4. **수익 모델**: 무료 OSS? Premium 기능?
5. **공식 협력**: Anthropic / OpenAI 사전 컨택 여부?

---

## 10. 승인 사인오프

| 역할 | 이름 | 날짜 | 승인 |
|------|------|------|------|
| Product | TBD | TBD | ☐ |
| Engineering | TBD | TBD | ☐ |
| Legal | TBD | TBD | ☐ |
| Security | TBD | TBD | ☐ |

---

## 관련

- [README.md](./README.md) — 프로젝트 인덱스
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 기술 아키텍처
- [CLI_INTEGRATION.md](./CLI_INTEGRATION.md) — CLI 래핑 스펙
- [ROADMAP.md](./ROADMAP.md) — 개발 로드맵
- [TECH_STACK.md](./TECH_STACK.md) — 기술 선택
