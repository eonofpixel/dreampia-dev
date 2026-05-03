---
title: 코드 서명 가이드
parent: ../README.md
status: stable
last_updated: 2026-05-03
---

# 코드 서명 가이드 (Code Signing Guide)

> Dreampia-Dev v1.0.0 의 마지막 production 단계. 코드 측 인프라는 v0.1.0 부터
> 모두 준비돼 있고 (`electron-builder.yml` + `release.yml`) — 사용자가 인증서를
> 매입한 뒤 GitHub Secrets 5~7개를 등록하면 다음 tag push 부터 자동 서명 + 공증이 활성화된다.

## 한 줄 요약

`electron-builder` 가 빌드 시점에 다음 환경 변수를 자동 감지한다:

| 변수 | 무엇 |
|------|------|
| `CSC_LINK` / `CSC_KEY_PASSWORD` | 인증서 (.pfx / .p12) base64 + 패스워드 |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | macOS 공증 (notarization) |

미설정이면 **silent skip** — 빌드 자체는 성공 (unsigned). 즉 v0.x 와 v1.0
사이엔 코드 변경 0, 사용자가 secrets 만 등록하면 다음 release 부터 signed.

## 왜 필요한가

| 플랫폼 | 미서명 시 사용자 경험 |
|--------|----------------------|
| **macOS** | "확인되지 않은 개발자" 경고 → 우클릭 → 열기 우회 필요 |
| **Windows** | SmartScreen 경고 → "더 많이 → 실행" 우회 필요. 다운로드 차단되는 케이스도 있음 |
| **Linux** | 표준 코드 서명 없음 (AppImage / deb 모두 unsigned 가 기본) |

v1.0.0 부터 코드 서명 도입 = **전문성 신호** + **자동 업데이트 안전성**
(`electron-updater` 가 signature 검증 통과해야 무결성 확신).

## 비용

| 항목 | 가격 (2026 기준) | 빈도 |
|------|---------------|------|
| Windows EV Code Signing Certificate (DigiCert / Sectigo / Comodo) | $300~400 | 매년 갱신 |
| Apple Developer Program | $99 | 매년 갱신 |
| **합계** | **$400~500** | **매년** |

> EV (Extended Validation) cert 는 SmartScreen "reputation" 을 즉시 받는다.
> Standard OV cert ($75~150/년) 도 가능하지만 SmartScreen 누적 다운로드
> 까지는 경고가 나올 수 있어 v1.0 에는 **EV 권장**.

## Windows 서명 단계

### 1. EV cert 매입

추천 발급사:

- DigiCert ($474/년)
- Sectigo (Comodo Group) ($299/년)
- SSL.com ($349/년)

매입 시 **USB hardware token** 또는 **cloud HSM** 으로 받는다 (CA/B Forum
가이드라인 2023+ 부터 EV cert 의 private key 는 hardware-bound 필수).

### 2. .pfx 파일 추출

```bash
# Windows: certutil
certutil -p "<password>" -exportPFX <thumbprint> certificate.pfx

# 또는 Hardware token 의 경우 token vendor 의 export tool 사용
# (DigiCert Hardware Token Manager / Yubikey Manager 등)
```

### 3. base64 인코딩

```bash
# Linux/macOS:
base64 -i certificate.pfx | tr -d '\n' > cert.b64

# Windows PowerShell:
[Convert]::ToBase64String([IO.File]::ReadAllBytes('certificate.pfx')) > cert.b64
```

### 4. GitHub Secrets 등록

Repository → Settings → Secrets and variables → Actions → New repository secret:

| 이름 | 값 |
|------|----|
| `WIN_CSC_LINK` | `cert.b64` 의 전체 내용 (base64 문자열, 줄바꿈 X) |
| `WIN_CSC_KEY_PASSWORD` | 인증서 export 시 사용한 패스워드 |

> `release.yml` 의 windows job 이 이 두 secret 을 `CSC_LINK` /
> `CSC_KEY_PASSWORD` 환경 변수로 export → electron-builder 가 자동 감지.

### 5. `electron-builder.yml` 검증

`electron-builder.yml` 의 `win` 섹션이 이미 다음을 포함하고 있어야 한다 (v1.0
시점에 자동 활성화):

```yaml
win:
  signingHashAlgorithms: ['sha256']
  signDlls: false
  verifyUpdateCodeSignature: false   # → v1.0.1 부터 true 로 토글 권장
```

`verifyUpdateCodeSignature: true` 는 electron-updater 가 update 시점에 서명을
강제 검증 — 인증서 변경/만료 시 자동 업데이트가 끊기므로 **첫 signed release
는 false 로 두고**, 1주일 안정화 후 true 로 토글하는 게 안전하다.

### 6. tag push

```bash
npm version patch   # 1.0.0 → 1.0.1
git push origin main --follow-tags
```

→ GitHub Actions release.yml 자동 트리거. 빌드 로그에서 다음 표시 확인:

```
electron-builder> signing file=release/Dreampia-Dev-Setup-1.0.1-x64.exe
electron-builder> done in 12s
```

## macOS 서명 + 공증 단계

### 1. Apple Developer Program 가입

https://developer.apple.com/programs/ → $99/년 결제. 가입 승인까지 24-48시간
대기 (개인 계정의 경우 1차 결제로 즉시 활성화되는 경우도 있음).

### 2. Developer ID Application 인증서 생성

1. https://developer.apple.com/account/resources/certificates/list
2. `+` 버튼 → **Developer ID Application** 선택
3. CSR (Certificate Signing Request) 업로드 — 로컬 키체인에서 생성
4. 발급된 .cer 다운로드 → 더블클릭으로 키체인 import
5. 키체인에서 .p12 export (private key 포함)

> **주의**: Developer ID Application 은 Mac App Store 외부 배포용. App Store
> 용은 Mac App Store Distribution 인증서가 필요한데 Dreampia-Dev 는 Mac App
> Store 배포 계획 X.

### 3. App-Specific Password 생성

1. https://appleid.apple.com → Sign-In and Security → App-Specific Passwords
2. **+** 버튼 → "dreampia-dev-notarization" 같은 라벨
3. 생성된 16자 비밀번호 (xxxx-xxxx-xxxx-xxxx) 안전하게 복사 (한 번만 표시됨)

### 4. Team ID 확인

1. https://developer.apple.com/account#MembershipDetailsCard
2. **Team ID** (10자리 영숫자, e.g. `9ABCD1EF23`) 복사

### 5. base64 인코딩

```bash
base64 -i developer-id.p12 | tr -d '\n' > mac-cert.b64
```

### 6. GitHub Secrets 등록

| 이름 | 값 |
|------|----|
| `MAC_CSC_LINK` | `mac-cert.b64` 의 전체 내용 |
| `MAC_CSC_KEY_PASSWORD` | .p12 export 시 사용한 패스워드 |
| `APPLE_ID` | Apple Developer 계정 이메일 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 위 3단계의 16자 비밀번호 |
| `APPLE_TEAM_ID` | 위 4단계의 10자리 ID |

### 7. `electron-builder.yml` 토글

v1.0.1 release 직전에 `mac` 섹션에서:

```yaml
mac:
  identity: null   # ← 이 라인 제거 (또는 실제 Common Name 으로 변경)
  notarize: true   # ← false 에서 true 로 변경
```

> `identity: null` 이 남아 있으면 secrets 가 있어도 unsigned 로 강제됨.
> 제거 시 electron-builder 가 키체인의 첫 Developer ID Application 을 자동 사용.

### 8. tag push

Windows 와 동일 — `release.yml` 의 macos job 이 자동으로:
1. .p12 keychain import
2. electron-builder 빌드 + 서명
3. notarytool 호출 (5-15분 대기)
4. .dmg + .zip stapling

빌드 로그에서:

```
electron-builder> signing file=Dreampia-Dev.app
electron-builder> notarizing
electron-builder> notarization done in 8m 23s
electron-builder> stapling
```

## 검증 체크리스트

서명 + 공증된 release 가 발행된 뒤 사용자 환경에서 다음을 검증:

### macOS

- [ ] `codesign -dv --verbose=4 /Applications/Dreampia-Dev.app` 명령이
      "signed by Developer ID Application" 표시
- [ ] `spctl -a -t exec -vv /Applications/Dreampia-Dev.app` 가 "accepted" 표시
- [ ] 다운로드 후 처음 더블클릭 시 "확인되지 않은 개발자" 경고 **없음**
- [ ] 첫 실행 시 매끄럽게 시작 (Gatekeeper 우회 없이)
- [ ] `xattr -p com.apple.quarantine` 가 stapled ticket 포함

### Windows

- [ ] 다운로드 후 SmartScreen 경고 **없음**
- [ ] 인스톨러 우클릭 → 속성 → 디지털 서명 탭에 "Dreampia" publisher 표시
- [ ] 설치 후 첫 실행 시 UAC 외 추가 경고 없음
- [ ] `Get-AuthenticodeSignature 'C:\Path\To\Dreampia-Dev.exe'` 가
      "Status: Valid" 표시 (PowerShell)

### 자동 업데이트

- [ ] v1.0.1 release 후 v1.0.0 사용자 환경에서 5초 이내 update 감지
- [ ] 백그라운드 다운로드 → 다음 종료 시 자동 설치
- [ ] 설치 후 v1.0.1 시작 시 signature 유효 (재경고 없음)

## 트러블슈팅

### Windows: "Error: SignTool: cannot find certificate"

원인: `WIN_CSC_LINK` 가 base64 형식이 아니거나 (.pfx raw 가 들어 있거나)
줄바꿈이 포함됨.

해결:
```bash
# 정확히 한 줄이어야 함
base64 -i certificate.pfx | tr -d '\n' > cert.b64
wc -l cert.b64   # → 0 이어야 함
```

### Windows: "0x80070005 - Access denied" during signing

원인: hardware token 이 CI 환경에서 접근 불가. 해결책 두 가지:
1. SignTool 의 `/csp` + `/k` 옵션을 직접 지정 (vendor 별 SDK 필요)
2. Cloud HSM 서비스 (DigiCert KeyLocker, Sectigo Cloud Signing) 사용 →
   SDK 설치 후 SignTool 명령에 `/dlib` 인자 추가

> CA/B Forum 정책 변경 (2023.06 부터 EV cert 의 private key 는 hardware-bound)
> 으로 GitHub-hosted runner 에서 직접 USB token 사용은 거의 불가능. **Cloud HSM
> 권장**.

### macOS: "Notarization failed: The executable does not have the hardened runtime enabled"

원인: `electron-builder.yml` 의 `mac.hardenedRuntime` 이 `false`.

해결:
```yaml
mac:
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
```

(현재 v0.x 부터 이미 `true` 로 설정돼 있음)

### macOS: "Notarization failed: Invalid Apple ID credentials"

원인: `APPLE_APP_SPECIFIC_PASSWORD` 가 일반 Apple ID 비밀번호. **반드시
app-specific password (xxxx-xxxx-xxxx-xxxx 형식)** 사용.

### macOS: "Notarization timeout (>30 minutes)"

원인: Apple notary service 가 일시적으로 느림. 재시도 가능:
```bash
xcrun notarytool log <submission-id> --apple-id <email> \
   --team-id <TEAM> --password <app-pwd>
```

### electron-updater: "Signature verification failed" after upgrade

원인: cert 갱신 후 thumbprint 가 바뀜. `verifyUpdateCodeSignature: true` 면
이전 thumbprint 와 mismatch 로 차단.

해결:
- v1.0~v1.0.x 동안은 `verifyUpdateCodeSignature: false` 유지
- 안정화 후 `publisherName: ['Dreampia']` 로 publisher 기준 검증으로 전환
- 갱신 시 publisher name 만 같으면 연속성 보장

## v1.0.0 의 unsigned 단계 (현재)

v1.0.0 자체는 **unsigned** 로 배포된다 — 인증서 매입 사용자 액션 대기 중.

- `WIN_CSC_LINK` / `MAC_CSC_LINK` 가 unset 이라 electron-builder 의
  서명 단계가 silent skip
- 빌드 자체는 성공 → installer / dmg / AppImage / deb 정상 생성
- 사용자는 macOS / Windows 의 "확인되지 않은 발행자" 경고를 우회해야 함
  (README 에 안내)

이 상태가 production-ready 인 이유:

- 기능 측면: Phase 1~4 모두 완료 (1421+ vitest, 28+ E2E)
- 인프라 측면: 서명 코드 경로 모두 검증됨 (secrets 등록만 하면 즉시 활성화)
- 리스크 측면: 자동 업데이트는 작동하지만 signature mismatch 시 한 번
  사용자 manual install 필요할 수 있음 (v1.0 → v1.0.1 transition 시)

v1.0.1 부터는 signed release 권장 — 이때부터 진정한 "전문성 + 안전성"
production grade 달성.

## 관련

- [docs/release.md](./release.md) — Release process 전체
- [docs/release-checklist.md](./release-checklist.md) — Pre-release 체크리스트
- [electron-builder.yml](../electron-builder.yml) — 패키징 설정
- [.github/workflows/release.yml](../.github/workflows/release.yml) — CI 파이프라인
- [README.md § Release](../README.md) — 사용자 관점 다운로드 안내
