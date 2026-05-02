# Roadmap — Dev Tool 개발 단계

> **베이스**: [PRD.md](./PRD.md) F-001 ~ F-012
> **추정**: 24주 (~6개월) Phase 1+2+3 합산
> **인력**: 1-2명 풀타임 (또는 4-6명 파트타임)
> **버전**: 0.1 초안

---

## 📊 단계별 개요

```
Phase 1 (MVP)         4주    F-001~F-004    "기본 래퍼 동작"
Phase 2 (v1)          8주    F-005~F-008    "smart routing + cross-AI"
Phase 3 (v2)         12주    F-009~F-012    "UI + 확장 + 플러그인"
                    ────
                     24주

이후:
- Phase 4 — 운영 / 커뮤니티 (Continuous)
```

---

## Phase 1 — MVP (4주)

### 목표

**"두 CLI를 단일 명령어로 호출할 수 있다"**

이 Phase 종료 시:
- `aix code "..."` 가 정상 동작
- 양쪽 CLI 자동 감지
- 통합 세션 디렉토리 작성
- MCP 통합 manifest 동기화

### Week 1: 프로젝트 셋업 + 기본 CLI

**Sprint Goal**: `aix --version` 동작

- [ ] **D-1**: GitHub repo 생성 (`@aix/cli` 또는 사용자 이름 기반)
- [ ] **D-2**: TypeScript 6 + Vite + ts-node 셋업
- [ ] **D-3**: oxlint + oxfmt + vitest 설정
- [ ] **D-4**: `commander` 기반 CLI 스캐폴드
- [ ] **D-5**: `aix --version` / `aix --help` 동작
- [ ] **D-7**: GitHub Actions CI (lint + test + build)

**Acceptance**: GitHub에 push 시 CI green, `npm install -g .` 후 `aix --help` 동작.

### Week 2: Provider Adapter (claude / codex)

**Sprint Goal**: `aix code "hello"` 가 양쪽 CLI를 spawn

- [ ] **D-1~2**: `BaseProvider` 인터페이스 + `ClaudeProvider` 클래스 (basic spawn)
- [ ] **D-3~4**: `CodexProvider` 클래스
- [ ] **D-5**: Auto-detect binary (PATH + 일반 위치)
- [ ] **D-6~7**: `aix code` 명령 구현 (passthrough mode)

**Acceptance**: `aix code --provider claude "hello"` 가 `claude "hello"` 와 동일 출력.

### Week 3: 세션 통합 + Config

**Sprint Goal**: 통합 세션 + 설정 파일

- [ ] **D-1**: `~/.aix/config.toml` 로더 (smol-toml)
- [ ] **D-2**: zod schema validation
- [ ] **D-3~4**: Claude JSONL → aix-native 변환기
- [ ] **D-5~6**: Codex JSONL → aix-native 변환기
- [ ] **D-7**: `~/.aix/sessions/` 작성 + raw 보존

**Acceptance**: turn 종료 시 `~/.aix/sessions/<id>.aix.jsonl` 생성됨, raw도 보존.

### Week 4: MCP 통합 + 출시 준비

**Sprint Goal**: MVP 출시

- [ ] **D-1~2**: `aix mcp add/remove/list` 명령 구현
- [ ] **D-3**: 두 CLI에 MCP 동기화 로직
- [ ] **D-4**: README + LICENSE (Apache 2.0) + CONTRIBUTING.md
- [ ] **D-5**: npm publish (`@aix/cli@0.1.0`)
- [ ] **D-6**: Twitter/X / Reddit / HN 발표
- [ ] **D-7**: 첫 사용자 피드백 수집

**Acceptance**: `npm install -g @aix/cli` 동작, GitHub README에 GIF demo, Discord 채널 생성.

### Phase 1 산출물

```
@aix/cli@0.1.0
- aix code (CLI passthrough)
- aix mcp add/remove/list
- aix sessions list
- aix --version, --help
- ~/.aix/config.toml + sessions/
- 통합 세션 JSONL + raw 보존
```

### Phase 1 위험 / 완화

| 위험 | 완화 |
|------|------|
| 두 CLI 인자 매핑 시 spec 변경 발견 | `aix doctor` 명령으로 호환성 검사 |
| auto-detect 실패 (Windows 경로 케이스) | 환경변수 `AIX_CLAUDE_BIN` 등으로 override |
| MCP 동기화 충돌 | merge prompt 또는 manifest 우선 |

---

## Phase 2 — v1 (8주)

### 목표

**"단순 래퍼를 넘어 부가가치 제공"**

이 Phase 종료 시:
- Smart routing (작업 → 모델 자동 선택)
- Cross-AI 검증
- 통합 세션 검색
- 비용 추적 대시보드

### Week 5-6: Smart Router

**Sprint Goal**: `aix code "..."` 자동 라우팅

- [ ] **D-1~3**: Task analyzer (length, context, complexity heuristic)
- [ ] **D-4~5**: SmartRouter 결정 로직
- [ ] **D-6~7**: `--verbose` 라우팅 결정 표시
- [ ] **D-8~10**: 라우팅 정확도 측정 (수동 100건 평가)
- [ ] **D-11~14**: 사용자 override 옵션 + 라우팅 학습 (옵션)

**Acceptance**: 라우팅 정확도 70%+ (사용자 만족)

### Week 7-8: Cross-AI 검증

**Sprint Goal**: `aix verify` 동작

- [ ] **D-1~3**: 마지막 turn → 다른 AI 전달 로직
- [ ] **D-4~5**: Diff 표시 (`diff`, `patch`)
- [ ] **D-6~7**: `aix compare` 동시 실행 명령
- [ ] **D-8~10**: 결과 mergee 옵션 (manual / auto)

**Acceptance**: 같은 작업 양쪽 결과 비교 + diff 표시.

### Week 9-10: 통합 세션 검색

**Sprint Goal**: `aix search "..."`

- [ ] **D-1~3**: SQLite FTS 인덱스 (better-sqlite3)
- [ ] **D-4~5**: 백그라운드 인덱싱 (turn 종료 후)
- [ ] **D-6~7**: 결과 ranking + provider tag
- [ ] **D-8~10**: `aix search --provider X` 필터

**Acceptance**: 1000건 세션 검색 ≤ 500ms

### Week 11-12: 비용 추적 + 출시

**Sprint Goal**: `aix usage` + v1 출시

- [ ] **D-1~3**: 토큰 / 비용 파싱 (claude usage / codex usage)
- [ ] **D-4~5**: SQLite turns 테이블 schema
- [ ] **D-6~7**: `aix usage` 대시보드 (terminal)
- [ ] **D-8~10**: `aix usage --limit` 한도 / 알림
- [ ] **D-11~14**: v1.0 출시 + 마케팅

**Acceptance**: 월간 사용량 정확 ±5%, 한도 도달 시 prompt.

### Phase 2 산출물

```
@aix/cli@1.0.0
- Smart routing
- aix verify, aix compare
- aix search (SQLite FTS)
- aix usage 대시보드
- 자동 비용 추적
```

---

## Phase 3 — v2 (12주)

### 목표

**"확장가능한 플랫폼"**

이 Phase 종료 시:
- Optional Electron UI
- Plugin 시스템
- VSCode 확장
- Git worktree 통합 (Claude 패턴 차용)

### Week 13-16: Optional Electron UI

- [ ] electron-forge 7.x 셋업
- [ ] Vite 6 + React 18 (Claude와 동일 스택)
- [ ] 메인 윈도우 + 사이드바 + 컴포저
- [ ] 양쪽 provider 토글
- [ ] 세션 검색 UI
- [ ] 설정 패널 (config.toml visual editor)
- [ ] 비용 차트 (recharts)

**Acceptance**: `aix ui` 명령으로 Electron 시작, CLI와 동일 기능.

### Week 17-20: Plugin 시스템

- [ ] Plugin 인터페이스 정의 (TypeScript)
- [ ] Hook 시스템 (pre-turn, post-turn, route-override)
- [ ] Plugin 디렉토리: `~/.aix/plugins/<name>/index.js`
- [ ] 예시 plugin 3개:
  1. **Custom router** (사용자 라우팅 로직)
  2. **Slack notifier** (turn 완료 시)
  3. **Cost limit** (한도 강화)

**Acceptance**: `aix plugin add <name>` 동작, plugin 호출 latency < 50ms 추가.

### Week 21-22: VSCode 확장

- [ ] VSCode Extension API 스캐폴드
- [ ] Sidebar view (세션 목록)
- [ ] Inline command (Cmd+Shift+P → aix code)
- [ ] Status bar (현재 사용량)

**Acceptance**: VSCode Marketplace 게시.

### Week 23-24: Git worktree 통합 + v2 출시

- [ ] Claude 패턴 차용 (`<adjective>-<scientist>-<6hex>`)
- [ ] `aix worktree create / list / cleanup`
- [ ] 자동 매핑 (turn → worktree)
- [ ] v2.0 마케팅 + Product Hunt

### Phase 3 산출물

```
@aix/cli@2.0.0
@aix/desktop@2.0.0 (Electron, optional)
@aix/vscode@2.0.0 (VSCode extension)
- Plugin 시스템 + 3 example plugins
- Git worktree 통합
- VSCode extension marketplace
```

---

## Phase 4 — 운영 / 커뮤니티 (Continuous)

### 지속 작업

- **Bug fixes** — 사용자 보고 issue 대응
- **CLI 버전 호환** — claude/codex 새 버전 즉시 지원
- **Plugin 생태계** — community plugins 큐레이션
- **Docs** — 공식 docs 사이트 (Docusaurus)
- **Localization** — Korean / Japanese / Chinese / Spanish

### 운영 KPI

| 지표 | Phase 4 목표 |
|------|-------------|
| GitHub Stars | 1,000+ |
| 일간 사용자 | 500+ |
| Plugin 수 | 20+ |
| Discord 멤버 | 200+ |

---

## 📅 타임라인 시각화

```
Month:    1    2    3    4    5    6    7    8    9    10   11   12
Phase 1:  ████ ░░░░ ░░░░
Phase 2:  ░░░░ ████ ████ ░░░░
Phase 3:  ░░░░ ░░░░ ░░░░ ████ ████ ████
Phase 4:  ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ████ ████ ████ ████ ████ ████

Public:           v0.1            v1.0           v2.0
                  (npm)           (npm + uplift) (full ecosystem)
```

---

## 🎯 결정 시점 (Go/No-Go)

각 Phase 종료 시 의사결정:

### Phase 1 → Phase 2 진입 조건

- [ ] MVP가 실제 사용자 100명+에 의해 사용됨
- [ ] 일간 활성 사용자 (DAU) 10+
- [ ] GitHub stars 100+
- [ ] 명백한 버그 5개 이하

→ 충족하면 Phase 2 진행. 미충족 시 Phase 1 polish 추가 4주.

### Phase 2 → Phase 3 진입 조건

- [ ] DAU 50+
- [ ] Smart routing 정확도 70%+
- [ ] NPS 30+
- [ ] 통합 세션 검색 사용률 30%+
- [ ] GitHub stars 500+

→ 충족하면 Phase 3 진행. 미충족 시 Phase 2 iteration.

### Phase 3 종료 시

- [ ] DAU 200+
- [ ] Plugin 수 10+
- [ ] VSCode 확장 다운로드 1000+

---

## 💰 자원 / 예산 (가상 추정)

### 인력

```
Phase 1 (4주):  1명 풀타임 (또는 2명 파트타임 50%)
Phase 2 (8주):  1-2명 풀타임
Phase 3 (12주): 2-3명 풀타임 (frontend / backend / VSCode)
Phase 4:        커뮤니티 + 1명 메인테이너
```

### 인프라 비용 (월)

```
GitHub:           $0 (public repo)
GitHub Actions:   $0 (public repo, 2000분/월)
npm:              $0 (public)
Discord:          $0
Docusaurus:       $0 (GitHub Pages)
도메인 (옵션):     $1/월

= ~$1/월 (도메인 외 무료)
```

API 비용은 사용자 부담 (이 도구는 자체 호스팅 안 함).

---

## 🤝 커뮤니티 / 거버넌스

### 의사결정

- **BDFL** (Benevolent Dictator For Life) 모델 — 단일 메인테이너
- **RFC 프로세스** — Phase 3+ 부터 큰 변경은 RFC

### 컨트리뷰션

- **Issue 라벨**: bug / feature / docs / good-first-issue / help-wanted
- **PR 가이드**: CONTRIBUTING.md
- **Code of Conduct**: Contributor Covenant 2.1

---

## 🔮 장기 비전 (12개월 이후)

### 가능한 방향

1. **공식 Anthropic / OpenAI 후원** (현실적이면)
2. **Premium 기능** (advanced 라우팅, 팀 collaboration)
3. **Mobile companion** (iOS / Android remote)
4. **Cross-AI 평가 서비스** (모델 quality benchmark)
5. **Enterprise 패키지** (org-level 비용 관리)

---

## ❓ Open Decisions

다음은 Phase 1 시작 전 결정 필요:

1. **프로젝트 이름**
   - aix / mux / devpilot / cocode / 기타
   - 결정자: 사용자

2. **첫 빌드 언어**
   - Node.js (TypeScript) — 가장 빠른 개발
   - Bun — 단일 binary 가능
   - Rust — 가장 빠르나 개발 시간 ↑

3. **라이선스**
   - Apache 2.0 (권장)
   - MIT
   - 기타

4. **OS 우선순위**
   - Windows 우선 (사용자 환경)
   - macOS 동시 지원
   - Linux Phase 2

---

## 관련

- [README.md](./README.md) — 프로젝트 인덱스
- [PRD.md](./PRD.md) — 제품 요구사항
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 기술 아키텍처
- [CLI_INTEGRATION.md](./CLI_INTEGRATION.md) — CLI 래핑
- [TECH_STACK.md](./TECH_STACK.md) — 기술 선택
