---
title: Permission Model — 위험 패턴 자동 차단
parent: ./_index.md
related:
  - ./resolver.md
  - ./capabilities.md
status: draft
last_updated: 2026-05-02
---

# Dangerous Pattern Detection

> **한 줄 요약**: 사용자 grant 와 무관하게 자동 차단되는 위험 패턴 + secret 검출.

---

## 자동 deny 규칙 (Resolver 우선순위 2)

사용자가 LEVEL 3 (full_access) 이거나 명시적 grant 가 있어도 **무조건 차단** 또는 **모달 강제**:

```typescript
const DANGEROUS_PATTERNS: DangerRule[] = [
  // 시스템 파일
  { capability: 'LOCAL_WRITE', pattern: /^C:\\Windows\\System32/i, action: 'deny_silent' },
  { capability: 'LOCAL_WRITE', pattern: /^C:\\ProgramData/i, action: 'require_modal' },
  { capability: 'LOCAL_WRITE', pattern: /\/etc\/(passwd|shadow|sudoers)/, action: 'deny_silent' },
  
  // 사용자 secrets
  { capability: 'LOCAL_READ', pattern: /\.ssh\/id_rsa$/, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.ssh\/id_(ed25519|ecdsa|dsa)$/, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.aws\/credentials$/, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.gcp\/.*\.json$/i, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.env$/, action: 'warn' },
  { capability: 'LOCAL_READ', pattern: /\.pem$/, action: 'warn' },
  { capability: 'LOCAL_READ', pattern: /\.key$/, action: 'warn' },
  
  // 시스템 명령
  { capability: 'LOCAL_EXECUTE', pattern: /\b(rm\s+-rf\s+\/(?!\*)|del\s+\/[a-z](?!:))/i, action: 'deny_silent' },
  { capability: 'LOCAL_EXECUTE', pattern: /\bformat\s+[a-z]:/i, action: 'deny_silent' },
  { capability: 'LOCAL_EXECUTE', pattern: /\bdd\s+if=.+\s+of=\/dev\//, action: 'deny_silent' },
  { capability: 'LOCAL_EXECUTE', pattern: /\bsudo\b/, action: 'require_modal' },
  { capability: 'LOCAL_EXECUTE', pattern: /\brunas\b/i, action: 'require_modal' },
  { capability: 'LOCAL_EXECUTE', pattern: /\b(reg\s+(delete|add)|regedit)\b/i, action: 'require_modal' },
  
  // Network 데이터 송신
  { capability: 'NETWORK_REMOTE.upload', pattern: /pastebin\.com|gist\.github\.com|0x0\.st|ix\.io|hastebin/, action: 'require_modal' },
  
  // Browser
  { capability: 'BROWSER_NAVIGATE', pattern: /^javascript:/i, action: 'deny_silent' },
  { capability: 'BROWSER_NAVIGATE', pattern: /^file:\/\/\/.*\.\.\/.*$/, action: 'warn' },
];

interface DangerRule {
  capability: Capability;
  pattern: RegExp;
  action: 'deny_silent' | 'require_modal' | 'warn';
  message?: string;                    // 사용자 표시 메시지
}
```

---

## Action 종류

| Action | UI | 차단 강도 |
|--------|----|---------|
| `deny_silent` | Toast 만 ("차단됨") | ★★★ 절대 차단 |
| `require_modal` | Modal 강제 (사용자 명시 허용 필요) | ★★ 사용자 결정 |
| `warn` | Inline warning + AI 에 컨텍스트 | ★ 정보 제공 |

### deny_silent

```typescript
case 'deny_silent':
  // 1. Tool 실행 즉시 거부
  // 2. AI 에게 "차단됨" 결과 전달 (이유 포함)
  // 3. Toast 알림: "⛔ 시스템 파일 변경 차단됨"
  // 4. Audit log: deny + decision_reason='dangerous_pattern_match'
  // 5. 사용자가 수동 grant 추가해도 무시 (override 불가)
```

### require_modal

```typescript
case 'require_modal':
  // 1. UI 모달 강제 (auto-grant 불가)
  // 2. 모달 안에 위험 경고 표시
  // 3. 사용자 [거부] / [한 번만] / [영구 허용] 선택
  // 4. 영구 허용해도 매 세션 첫 사용 시 재확인 (옵션)
```

### warn

```typescript
case 'warn':
  // 1. Inline warning 표시
  // 2. AI 에게 컨텍스트 ("이 파일은 비밀로 보입니다")
  // 3. 사용자 [계속] / [중단] (기본 [계속])
  // 4. 정상 grant flow 진행
```

---

## Secret 검출 (사용자 입력 시)

사용자가 메시지에 입력 시 비밀로 보이는 패턴 감지:

```typescript
const SECRET_PATTERNS: SecretPattern[] = [
  // API keys
  { name: 'OpenAI API Key', regex: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9-]{32,}\b/ },
  { name: 'Google API Key', regex: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: 'GitHub PAT', regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub OAuth', regex: /\bgho_[A-Za-z0-9]{36}\b/ },
  { name: 'AWS Access Key', regex: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'AWS Secret', regex: /\b[A-Za-z0-9/+=]{40}\b/, requireContext: 'aws' },
  { name: 'Slack Token', regex: /\bxox[abp]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'Stripe Key', regex: /\b(sk_live_|pk_live_|rk_live_)[A-Za-z0-9]{20,}\b/ },
  
  // 한국어 환경
  { name: '주민번호', regex: /\b\d{6}-[1-4]\d{6}\b/ },
  { name: '한국 휴대전화', regex: /\b01[0-9]-?\d{3,4}-?\d{4}\b/ },
  
  // 카드
  { name: 'Visa', regex: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { name: 'MasterCard', regex: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  
  // 비밀번호 같은
  { name: '비밀번호 후보', regex: /password\s*[:=]\s*['"]?[^\s'"]{6,}/i, lowConfidence: true },
];

interface SecretPattern {
  name: string;
  regex: RegExp;
  requireContext?: string;             // 추가 키워드 필요 (false positive 줄임)
  lowConfidence?: boolean;             // 사용자에게 알림만 (자동 차단 X)
}
```

### 검출 시 흐름

```typescript
async function checkUserInputForSecrets(text: string): Promise<SecretMatch[]> {
  const matches: SecretMatch[] = [];
  
  for (const pattern of SECRET_PATTERNS) {
    const m = text.match(pattern.regex);
    if (m) {
      // Context 검증 (있는 경우)
      if (pattern.requireContext && !text.toLowerCase().includes(pattern.requireContext)) {
        continue;
      }
      
      matches.push({
        pattern_name: pattern.name,
        matched_text: maskSecret(m[0]),  // 일부만 표시
        position: m.index!,
        confidence: pattern.lowConfidence ? 'low' : 'high',
      });
    }
  }
  
  return matches;
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}
```

### UI

```
사용자 입력 시 전송 버튼 누르면:

┌────────────────────────────────────────────────┐
│ ⚠ 비밀 정보가 포함된 것 같습니다                │
├────────────────────────────────────────────────┤
│ 감지된 항목:                                   │
│   - OpenAI API Key (sk-Proj...XYZ)             │
│   - 주민번호 (901***-*******)                  │
│                                                │
│ 이 정보가 AI 에 전송됩니다. 계속하시겠어요?    │
│                                                │
│         [취소]  [편집하기]  [그래도 보내기]    │
└────────────────────────────────────────────────┘
```

---

## 패턴 추가 / 수정 (사용자)

```
설정 → 보안 → 위험 패턴:

[기본 패턴 (50개)] 활성화 ON/OFF
  ☑ 시스템 파일 보호
  ☑ Secret 검출
  ☑ 위험 명령 차단
  ☐ 비밀번호 입력 검출 (low confidence — 비활성)

[사용자 추가 패턴]
  + 새 패턴 추가
  
  ┌─────────────────────────────────────┐
  │ 이름: 사내 도메인 차단              │
  │ Capability: NETWORK_REMOTE.upload   │
  │ 패턴: ^https?://internal\.acme\.com │
  │ Action: require_modal               │
  │ [저장]                              │
  └─────────────────────────────────────┘
```

---

## False Positive 방지

```typescript
// AWS Secret 같은 일반 base64 문자열은 false positive 많음
//   → "aws" 같은 컨텍스트 키워드 필요

// 비밀번호 후보는 low confidence
//   → 자동 차단 X, 알림만

// 사용자 환경에 맞는 추가 차단 가능
//   → 사용자가 직접 패턴 추가
```

---

## 검증 (Invariants)

```
INV-1: deny_silent 패턴은 사용자 grant 로 override 불가
INV-2: require_modal 패턴은 자동 grant 불가
INV-3: warn 패턴은 정보 제공만 (차단 X)
INV-4: secret 검출은 false positive 최소화 (high confidence 만 자동)
INV-5: 패턴 매칭은 case-insensitive (path) 또는 case-sensitive (key/token)
```

---

## 테스트 시나리오

```typescript
describe('Dangerous Pattern Detection', () => {
  it('blocks rm -rf /', () => {
    expect(checkDangerousPattern('LOCAL_EXECUTE', 'rm -rf /')).toEqual({
      action: 'deny_silent',
    });
  });
  
  it('blocks System32 writes', () => {
    expect(checkDangerousPattern('LOCAL_WRITE', 'C:\\Windows\\System32\\drivers\\hosts')).toEqual({
      action: 'deny_silent',
    });
  });
  
  it('warns on .env file read', () => {
    expect(checkDangerousPattern('LOCAL_READ', 'C:\\Dev\\foo\\.env')).toEqual({
      action: 'warn',
    });
  });
  
  it('detects OpenAI API key', () => {
    const matches = checkUserInputForSecrets('내 키: sk-Proj-abc123def456...');
    expect(matches).toContainEqual(expect.objectContaining({
      pattern_name: 'OpenAI API Key',
    }));
  });
});
```

---

## 관련

- [resolver.md](./resolver.md) — checkDangerousPattern 호출 시점
- [ui-flow.md](./ui-flow.md) — modal/warn 표시
- [audit.md](./audit.md) — 자동 차단도 로그 기록
