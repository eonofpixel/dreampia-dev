---
title: Round 5 — Codex 발견된 버그
parent: ./_index.md
related:
  - ./round5-ipc-telemetry.md
status: complete
last_updated: 2026-05-02
---

# Round 5: Codex 의 알려진 버그

> **방법**: Logs (codex-desktop-*.log) 분석 시 발견된 에러 패턴
>
> **결과**: 3가지 분명한 버그 + Dreampia-Dev 가 회피해야 할 함정

---

## 버그 1: MCP message parser 약함 ★

### 증상

```
매 메시지마다 SyntaxError 로그:

[AppServerConnection] Failed to parse MCP message
  errorMessage="Unexpected token 'S', \"SUCCESS: T\"... is not valid JSON"
  linePreview="SUCCESS: The process with PID 66848 (child process of PID 19280) has been terminated."
  errorStack="SyntaxError: Unexpected token 'S', \"SUCCESS: T\"... is not valid JSON
    at JSON.parse (<anonymous>)
    at Bc.handleIncomingLine (C:\Program Files\WindowsApps\OpenAI.Codex_*\app.asar\.vite\build\workspace-root-drop-handler-D_UHIXp9.js:242:17280)
    ..."
```

### 원인

```
Windows TASKKILL 명령의 출력이 stdout 에 섞임:
  > taskkill /pid 12345
  SUCCESS: The process with PID 12345 has been terminated.

→ MCP 서버가 사용한 Windows 시스템 호출 결과가 JSON-RPC stream 으로 흘러들어옴
→ Codex 의 MCP parser 가 SUCCESS 로 시작하는 라인 을 JSON 으로 파싱 시도
→ 매번 SyntaxError → 로그 폭주
```

### 영향

```
- 기능적 영향 X (parser 가 다음 line 으로 넘어감)
- 로그 폭주 (디스크 I/O 낭비)
- 디버깅 시 진짜 에러 찾기 어려움
- 사용자에게는 invisible (silent error)
```

### Dreampia-Dev 의 회피 방법

```typescript
// docs/tools/mcp-bridge.md 의 강건한 parser

private processBuffer() {
  while (true) {
    const newlineIdx = this.buffer.indexOf('\n');
    if (newlineIdx === -1) break;
    
    const line = this.buffer.slice(0, newlineIdx).trim();
    this.buffer = this.buffer.slice(newlineIdx + 1);
    
    if (!line) continue;
    
    // ★ JSON 시작 마커 검증 (Codex 의 SUCCESS: 같은 garbage 제거)
    if (!line.startsWith('{') && !line.startsWith('[')) {
      Logger.log('debug', 'mcp.skip_non_json', line.slice(0, 100));
      continue;  // skip silently
    }
    
    try {
      const message = JSON.parse(line);
      this.handleMessage(message);
    } catch (err) {
      Logger.log('debug', 'mcp.parse_failed', err.message);
      // silent skip (사용자 알림 X)
    }
  }
}
```

---

## 버그 2: electron-sampler PowerShell 호출 실패

### 증상

```
[electron-sampler] Failed to collect child process snapshot
  errorMessage="Command failed: powershell.exe -NoProfile -NonInteractive -Command 
    $ErrorActionPreference = 'Stop';
    $cpuByPid = @{};
    Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { ... };
    Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,WorkingSetSize,...;
    "
```

### 원인

```
Win32_PerfFormattedData_PerfProc_Process CIM 쿼리:
  - 시스템 부하 시 timeout (>5초)
  - 권한 문제 (UAC)
  - PowerShell 5.1 의 한계
```

### 영향

```
- CPU 모니터링 데이터 손실
- 사용자 경험 영향 X (단순 로그)
```

### Dreampia-Dev 의 회피

```
1. CIM 쿼리 대신 더 가벼운 API 사용:
   - process.cpuUsage() (Node.js 내장)
   - GetProcessTimes (Win32 API)

2. Sampling 빈도 줄이기 (Codex 는 매초 실행 추정)
   - 30초 주기로 충분
   
3. Failure tolerance:
   - 3회 연속 실패 시 sampling 비활성화
   - 사용자에게 알림 (옵션)
```

---

## 버그 3: Win11 명시 테스트 부재

### 증상

```
AppxManifest.xml:
  <TargetDeviceFamily Name="Windows.Desktop" 
    MinVersion="10.0.19041.0"        ← Win10 20H1 (2020-05)
    MaxVersionTested="10.0.19041.0"  ← ★ 같음!
  />
```

### 의미

```
MaxVersionTested = 명시적으로 테스트한 최대 Windows 버전
  - Win10 만 테스트
  - Win11 호환성 보증 X
  - WinUI 3 / 새 API 사용 시 동작 미확인
```

### 사용자 영향

```
대부분 정상 동작 (Win11 도 Win10 API 호환)
하지만 알려진 미보증:
  - Win11 의 Snap layouts (snap groups)
  - Win11 의 새 contextual menu
  - Phantom focus loss (Win11 특이)
```

### Dreampia-Dev 의 대응

```
✓ MaxVersionTested = Win11 (10.0.22000.0) 명시
✓ Win10 + Win11 모두 테스트
✓ Windows Phone old metadata 제거 (mp:PhoneIdentity)
```

---

## 추가 발견: Skills 메타 품질 추적

```
[electron-message-handler] Skills/list missing short_description count
  affectedCwdsCount=1
  missingShortDescriptionCount=95
```

### 의미

```
Codex 가 자체 Skill 의 short_description 누락 95개 발견
→ 품질 검증 메커니즘 존재 (사용자 표시 X)
→ 개발자는 이걸 보고 Skill 개선 가능
```

### Dreampia-Dev 의 적용

```
Plugin / Skill 에 대해:
  ✓ schema 검증 (frontmatter, required fields)
  ✓ 품질 점수 (description 길이, defaultPrompt 유무 등)
  ✓ 사용자에게 경고 표시 (선택)
```

---

## 종합 — Codex 의 약점

| 버그 | 심각도 | Dreampia-Dev 차별화 |
|------|--------|---------------------|
| MCP parser 약함 | 중 | ★ 강건한 line parser |
| electron-sampler 실패 | 약 | 더 가벼운 sampling |
| Win11 미보증 | 중 | Win11 명시 테스트 |
| Skills 메타 품질 | 약 | 사용자 visible 검증 |

→ **이런 부분에서 Dreampia-Dev 가 더 견고할 수 있음**.

---

## 관련

- [round5-ipc-telemetry.md](./round5-ipc-telemetry.md) — Logs 출처
- [docs/tools/mcp-bridge.md](../tools/mcp-bridge.md) — Bug 1 회피 코드
