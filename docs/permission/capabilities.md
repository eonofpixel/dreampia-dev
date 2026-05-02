---
title: Permission Model — Capability 분류
parent: ./_index.md
related:
  - ./levels.md
  - ./grants.md
status: draft
last_updated: 2026-05-02
---

# Capability 분류

> **한 줄 요약**: 30+ 세분화된 권한 항목. AI 가 "관리자 권한" 같은 broad 권한 X, 정밀한 capability 만.

---

## 10가지 핵심 카테고리

| Capability | 설명 | 위험도 | 기본값 |
|------------|------|--------|--------|
| `LOCAL_READ` | 작업 디렉토리 파일 읽기 | 낮음 | Auto-grant |
| `LOCAL_WRITE` | 작업 디렉토리 파일 쓰기 | 중 | Ask once |
| `LOCAL_EXECUTE` | shell 명령 실행 | 높음 | Ask each |
| `LOCAL_OUTSIDE_CWD` | 작업 디렉토리 외부 접근 | 높음 | Ask each |
| `NETWORK_LOCAL` | localhost 접근 | 낮음 | Auto-grant |
| `NETWORK_REMOTE` | 외부 HTTP/HTTPS | 중 | Ask once |
| `NETWORK_AI` | AI 모델 API 호출 | 낮음 | Auto-grant |
| `SYSTEM_CLIPBOARD` | 클립보드 read/write | 낮음 | Ask once |
| `SYSTEM_NOTIFICATION` | OS 알림 표시 | 낮음 | Auto-grant |
| `SYSTEM_AUTOMATION` | 백그라운드 자동화 (cron) | 높음 | Ask each |

---

## Sub-capability 전체 목록

```typescript
type Capability =
  // ─── Local FS ───
  | 'LOCAL_READ'
  | 'LOCAL_READ.binary'              // 큰 binary 파일
  | 'LOCAL_WRITE'
  | 'LOCAL_WRITE.create'             // 새 파일
  | 'LOCAL_WRITE.modify'             // 기존 파일 수정
  | 'LOCAL_WRITE.delete'             // 파일 삭제 ★ 위험
  | 'LOCAL_WRITE.rename'
  | 'LOCAL_OUTSIDE_CWD'              // ↑ 모든 LOCAL_* 의 외부 변형
  | 'LOCAL_OUTSIDE_CWD.read'
  | 'LOCAL_OUTSIDE_CWD.write'

  // ─── Execute ───
  | 'LOCAL_EXECUTE'                   // shell 명령
  | 'LOCAL_EXECUTE.background'        // long-running
  | 'LOCAL_EXECUTE.elevated'          // sudo / Run as Admin ★

  // ─── Network ───
  | 'NETWORK_LOCAL'                   // 127.0.0.1, localhost
  | 'NETWORK_LAN'                     // 192.168.*, 10.*
  | 'NETWORK_REMOTE'                  // 외부 도메인
  | 'NETWORK_REMOTE.upload'           // 데이터 송신
  | 'NETWORK_AI'                      // OpenAI/Anthropic API
  | 'NETWORK_MCP'                     // MCP 서버 통신

  // ─── Browser ───
  | 'BROWSER_NAVIGATE'                // URL 열기
  | 'BROWSER_INTERACT'                // 클릭/타이핑
  | 'BROWSER_DOWNLOAD'                // 파일 다운로드
  | 'BROWSER_SCREENSHOT'              // 스크린샷
  | 'BROWSER_DOM_READ'                // DOM 읽기 (★ HTML/data)
  | 'BROWSER_COOKIE_READ'             // 쿠키 ★

  // ─── System ───
  | 'SYSTEM_CLIPBOARD.read'
  | 'SYSTEM_CLIPBOARD.write'
  | 'SYSTEM_NOTIFICATION'
  | 'SYSTEM_TRAY'                     // 트레이 아이콘
  | 'SYSTEM_AUTOMATION.cron'          // 시간 기반
  | 'SYSTEM_AUTOMATION.event'         // 이벤트 기반
  | 'SYSTEM_HOTKEY'                   // 글로벌 단축키

  // ─── Provider 통합 ───
  | 'PROVIDER_CLAUDE_CALL'
  | 'PROVIDER_CODEX_CALL'
  | 'PROVIDER_TOKEN_READ'             // CLI 토큰 접근

  // ─── 플러그인 ───
  | 'PLUGIN_INSTALL'
  | 'PLUGIN_EXECUTE'                  // 플러그인 코드 실행
  | 'PLUGIN_NETWORK';                 // 플러그인 외부 통신
```

---

## Parent-child 관계

```
LOCAL_WRITE
  ├── LOCAL_WRITE.create
  ├── LOCAL_WRITE.modify
  ├── LOCAL_WRITE.delete
  └── LOCAL_WRITE.rename

LOCAL_OUTSIDE_CWD
  ├── LOCAL_OUTSIDE_CWD.read
  └── LOCAL_OUTSIDE_CWD.write
```

**규칙**:
- 부모 grant 시 → 모든 자식 자동 허용
- 자식만 명시적 grant 가능 (더 정밀)

```typescript
function isParentCapability(parent: Capability, child: Capability): boolean {
  return child.startsWith(`${parent}.`);
}

// LOCAL_WRITE grant 가 있으면 LOCAL_WRITE.modify 도 허용
isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.modify')  // true
```

---

## 위험도별 기본 정책

### 위험도 낮음 (Auto-grant)
```
LOCAL_READ                 - 작업 디렉토리 안 (P3 scope)
NETWORK_LOCAL              - localhost
NETWORK_AI                 - 사용자가 명시적으로 시작한 AI 호출
SYSTEM_NOTIFICATION        - 알림 표시
PROVIDER_*_CALL            - 사용자가 모델 선택
```

→ 매번 묻지 않음. Toast 알림으로 사후 보고만.

### 위험도 중 (Ask once, remember)
```
LOCAL_WRITE                - 작업 디렉토리 안
NETWORK_REMOTE.read        - 외부 도메인 GET
SYSTEM_CLIPBOARD.write     - 클립보드 쓰기
```

→ 첫 사용 시 inline 모달. 사용자 "허용 (세션)" 가능.

### 위험도 높음 (Ask each)
```
LOCAL_EXECUTE              - shell 실행
LOCAL_OUTSIDE_CWD          - 작업 디렉토리 외부
LOCAL_EXECUTE.elevated     - sudo / Admin
NETWORK_REMOTE.upload      - 외부 데이터 송신
SYSTEM_AUTOMATION          - 백그라운드 cron
PLUGIN_INSTALL             - 새 플러그인 설치
```

→ 매번 모달 (또는 사용자가 "영구 허용" 명시).

---

## 카테고리별 사용 시나리오

### LOCAL_*

```
파일 읽기:        LOCAL_READ
파일 수정:        LOCAL_WRITE.modify
새 파일 생성:     LOCAL_WRITE.create
파일 삭제:        LOCAL_WRITE.delete  ★ 항상 모달
shell 실행:       LOCAL_EXECUTE
sudo:             LOCAL_EXECUTE.elevated  ★ 매번 모달
```

### NETWORK_*

```
http://localhost:3000:     NETWORK_LOCAL
192.168.1.1:               NETWORK_LAN
github.com (read):         NETWORK_REMOTE.read
acme.com/api (POST data):  NETWORK_REMOTE.upload  ★ 모달
api.anthropic.com:         NETWORK_AI (자동)
mcp://server/tool:         NETWORK_MCP
```

### BROWSER_*

```
url 이동:        BROWSER_NAVIGATE
클릭/타이핑:     BROWSER_INTERACT
스크린샷:        BROWSER_SCREENSHOT
DOM 추출:        BROWSER_DOM_READ
파일 다운로드:   BROWSER_DOWNLOAD
쿠키 읽기:       BROWSER_COOKIE_READ  ★ 매우 민감
```

### SYSTEM_*

```
알림 띄우기:     SYSTEM_NOTIFICATION
클립보드 읽기:   SYSTEM_CLIPBOARD.read
클립보드 쓰기:   SYSTEM_CLIPBOARD.write
글로벌 단축키:   SYSTEM_HOTKEY
백그라운드 cron: SYSTEM_AUTOMATION.cron
```

---

## Tool → Capability 매핑

각 tool 은 `required_capabilities()` 를 명시:

```typescript
class ShellRunTool implements Tool<{ cmd: string }, ShellResult> {
  id = 'shell.run';
  
  required_capabilities(input: { cmd: string }): Capability[] {
    const caps: Capability[] = ['LOCAL_EXECUTE'];
    
    // sudo / runas 감지
    if (/\b(sudo|runas)\b/i.test(input.cmd)) {
      caps.push('LOCAL_EXECUTE.elevated');
    }
    
    return caps;
  }
}

class FsWriteTool implements Tool<{ path: string }, void> {
  required_capabilities(input: { path: string }): Capability[] {
    const caps: Capability[] = [];
    
    if (isOutsideWorkspace(input.path)) {
      caps.push('LOCAL_OUTSIDE_CWD.write');
    } else {
      caps.push('LOCAL_WRITE.modify');
    }
    
    return caps;
  }
}
```

---

## 검증 (Invariants)

```
INV-1: 모든 capability 는 enum 안 (typo 방지)
INV-2: Sub-capability 는 부모 prefix + '.' + name 형식
INV-3: 위험도별 default behavior 정의됨
INV-4: 모든 tool 은 required_capabilities() 구현
```

---

## 관련

- [levels.md](./levels.md) — Level 별 capability set
- [grants.md](./grants.md) — Grant 의 capability 필드
- [danger-patterns.md](./danger-patterns.md) — 추가 자동 차단
- [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) — tool 의 required_capabilities()
