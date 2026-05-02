# Dreampia-Dev — 결정 사항 (Source of Truth)

> **목적**: 모든 product / engineering 결정을 한 곳에 — 변경 추적 가능
> **상태**: v2.0 확정 (2026-05-01) — 한국 후원 전략 + Apache 2.0 반영
> **이전**: dev-tool/ 폴더 (일반 spec) → dreampia-dev/ (브랜드 통합)

---

## 🆔 프로젝트 정체성

| 항목 | 결정 | 근거 |
|------|------|------|
| **이름** | **Dreampia-Dev** | 사용자 기존 Dreampia 생태계 (Builder/Dev/AI/Wiki) 통합 |
| **타입** | 데스크톱 앱 (Electron) | Claude/Codex 동일 패턴 검증 |
| **카테고리** | AI 코딩 어시스턴트 (오픈소스) | 두 CLI 통합 GUI 래퍼 |
| **타깃 사용자** | 한국 개발자 + Dreampia 생태계 + 글로벌 | 한국어 우선 |
| **핵심 가치** | 통합 GUI + 한 번 셋업 + 편리함 + 한국어 우선 | 사용자 인터뷰 |
| **차별점** | "Apache + Codex 두 AI를 한국어 첫 GUI로 통합" | 마케팅 메시지 |

---

## ⚖️ 라이선스 + 법적 (확정)

### Apache License 2.0 ⭐ 확정

```
선택: Apache 2.0
이유:
  1. 한국 대기업 OSS 표준 (네이버 D2 / 카카오 / 우아한형제들)
  2. patent grant 명시 → 대기업 legal review 1주 → 1-2일
  3. NOTICE 파일 = 한국 SBOM 호환
  4. v2+ 수익화 (SaaS / SLA) 자유
  5. 중소기업/개인이 fork + 상업화 자유
```

### 의무 사항 (구현 시)

- [ ] `LICENSE` 파일 (Apache 2.0 풀 텍스트)
- [ ] `NOTICE` 파일 (의존성 attribution)
- [ ] 변경 사실 명시 (큰 변경 시)
- [ ] 원본 copyright header 보존
- [ ] 상표권 보호 (Dreampia 이름/로고는 trademark — 라이선스 X)

### 사용자 권리 (Apache 2.0)

✅ Fork / 수정 / 배포 / 상업적 사용 / 사내 사용 / SaaS 판매 / 수정본 비공개 / 다른 OSS와 결합 자유
❌ 원작자 책임 못 묻음 (AS IS) / Dreampia 이름 무단 사용 X (trademark)

---

## 🛠 기술 결정

### 프레임워크 / 런타임

| 항목 | 결정 | 비고 |
|------|------|------|
| **GUI 프레임워크** | Electron 41.3.0 | Claude Desktop 동일 버전 |
| **번들러** | Vite 6.4.1 | Claude 동일 |
| **UI 라이브러리** | React 18.3.1 | Claude 동일 (안정성) |
| **CSS 프레임워크** | Tailwind 3.4 | Claude 동일 |
| **언어** | TypeScript 6 (`@typescript/native-preview` tsgo) | 두 회사 모두 채택 |
| **린트/포맷** | oxlint + oxfmt | 두 회사 모두 채택 |
| **테스트** | vitest 4 | 두 회사 모두 채택 |
| **DB** | better-sqlite3 12 + Drizzle | Claude 동일 |
| **Config 형식** | TOML (smol-toml) | Codex 동일 |
| **Schema** | zod 3 | Claude 동일 |
| **Subprocess** | execa 9 | child_process 우월 |
| **로거** | winston 3 | Claude 동일 |
| **아이콘** | @phosphor-icons/react 2.1 | Claude 동일 |
| **i18n** | react-intl 6 | Claude 동일 |
| **패키징** | electron-forge 7.8.3 | Claude 동일 |

### 플랫폼 / 단계

| 항목 | 결정 |
|------|------|
| **Phase 1** | **Windows 11+ (MSIX)** |
| **Phase 2** | **macOS 13+ (DMG)** |
| **Phase 3** | Linux (AppImage / deb) — 커뮤니티 요청 시 |
| **Node** | 22+ |

### AI 범위

| 항목 | 결정 |
|------|------|
| **지원 AI** | **Claude (CCD) + Codex (OpenAI) 2개만** |
| **확장 시점** | Phase 3+ (사용자 요구 시 Gemini 등) |
| **Plugin 시스템** | Phase 3+ |
| **CLI 추가 제공** | Phase 3+ 옵션 (현재 GUI만) |

---

## 👤 프로필 시스템 (정정 반영)

### "로그인" = 로컬 프로필 관리 (클라우드 X)

```
프로필 = 격리된 작업 환경
  ├─ sandbox 권한 (read-only / workspace-write / full-access)
  ├─ MCP 셋업
  ├─ API 키 (또는 CLI 위임)
  ├─ 세션 디렉토리
  └─ 기본 cwd

저장 위치: ~/.dreampia-dev/profiles/<name>/
```

### Phase별 도입

| Phase | 프로필 | 워크스페이스 |
|-------|--------|------------|
| **Phase 1 (MVP)** | 단일 프로필 강제 ("기본") | ❌ — cwd로 충분 |
| **Phase 2 (v1)** | 다중 프로필 (생성/전환/삭제/내보내기) | ❌ |
| **Phase 3 (v2)** | 다중 프로필 + 옵션 | Workspace 검토 |

### UI 흐름

```
[Phase 2 첫 실행]
  ↓
프로필 선택 화면 ← 첫 실행 시 "기본" 자동 생성
  ├─ "회사용" (read-only sandbox, GitHub MCP, 회사 키)
  ├─ "개인용" (full-access, Gmail+Drive, 개인 키)
  └─ "+ 새 프로필"
  ↓
채팅 화면 — 우상단 현재 프로필 표시 (클릭으로 전환)
```

---

## 🎨 UX / UI 결정

### 레이아웃

| 항목 | 결정 | 출처 |
|------|------|------|
| **메인 레이아웃** | 사이드바 + 멀티탭 | Claude Desktop 스타일 |
| **사이드바** | 프로젝트/세션 단순 리스트 | Codex 스타일 |
| **모델 선택** | 메시지마다 상단 (드롭다운) | Codex 스타일 |
| **MCP 셋업** | 단순 명령어 + 폼 | Codex 스타일 |
| **세션 관리** | Codex 단순 리스트 (트리 X) | Codex 스타일 |
| **코드 표시** | 채팅 안 inline + 다운로드 | hybrid |
| **테마** | 시스템 따라 (다크/라이트) | 두 회사 동일 |

### 첫 실행

```
[설치 후 첫 실행]
  ↓
Claude/Codex CLI 자동 감지
  ├─ "Claude CLI 감지됨 ✓"
  ├─ "Codex CLI 감지됨 ✓"
  └─ "API 키 입력" (옵션, CLI 없는 사용자)
  ↓
"기본" 프로필 자동 생성
  ↓
바로 채팅 화면 (빈 사이드바)
```

→ Claude의 4-페이지 온보딩 / 시드 데이터 안 함 (단순화).

---

## 🔐 보안 / 권한 결정

### 권한 모델 — Codex 3-tier sandbox 차용

```
sandbox_mode:
  read-only          ← 기본값 (안전)
  workspace-write    ← cwd 안에서만 수정
  danger-full-access ← 전체 시스템 (사용자 명시 동의)
```

### 인증 — 하이브리드

```
1순위: Claude/Codex CLI 자동 감지 (이미 로그인된 경우 그대로 사용)
2순위: API 키 직접 입력 (CLI 없는 사용자)
저장: OS keychain (DPAPI on Windows, Keychain on macOS)
```

### 차단 항목

- ❌ 자체 OAuth 흐름 (Anthropic/OpenAI cert 필요)
- ❌ raw token 평문 저장
- ❌ 자체 모델 호스팅
- ❌ 자체 API 프록시

---

## 📦 배포 결정

| OS | 형식 | Phase |
|----|------|-------|
| **Windows** | **MSIX** (Windows Store + 외부 sideload) | Phase 1 |
| **macOS** | **DMG** (notarized) | Phase 2 |
| **Linux** | AppImage (옵션) | Phase 3+ |

### 자동 업데이트

- electron-updater 사용
- GitHub Releases 호스팅 (Phase 1)
- 자체 endpoint (Phase 3+, Anthropic/Codex 패턴)

---

## ✍ 코드 서명 전략 (Phase별)

```
Phase 1 (MVP, ~50 사용자)
  └─ Self-signed
  └─ 비용: $0
  └─ SmartScreen: ⚠️ 경고 (사용자 "여전히 실행" 클릭)
  └─ 대처: README "Microsoft Defender 추가 안내"
  └─ GitHub Actions: Sigstore SBOM (검증용)

Phase 2 (v1, ~500 사용자)
  └─ OV cert (한국 발급 또는 해외)
  └─ 비용: ~₩180,000-250,000/년 ($135-185)
  └─ 한국 발급: 한국정보인증 / 한국전자인증 / DigiCert 한국 파트너
  └─ SmartScreen: 6개월~1년 reputation 누적 후 통과
  └─ GitHub Actions: cert를 Secrets에, electron-forge 자동 서명

Phase 3 (v2, 500+ 사용자)
  └─ EV cert + GitHub Sponsor / 기업 후원
  └─ 비용: ₩550,000-650,000/년 ($410-490)
  └─ 한국 발급: 한국정보인증 / 한국전자인증 (~₩550K)
  └─ 옵션: LLC 등록 시 회사 명의 EV cert
  └─ SmartScreen: 즉시 통과
```

---

## 🇰🇷 한국 기업 후원 전략

### 타겟 후원자 (Tier별)

#### Tier 1 — OSS 적극 후원 (가장 가능성)

| 기업 | 부서 | 컨택 채널 |
|------|------|----------|
| **네이버** | NAVER D2 / 네이버 클라우드 | DEVIEW CFP / D2 컨택 |
| **카카오** | 카카오 OSS / Kakao Brain | if(kakao) CFP / OSS 펀드 |
| **토스** | Toss 개발자 | SLASH CFP / 직접 컨택 |
| **우아한형제들** | 우아한기술 | 우아콘 CFP / OSS 후원 |
| **NCSoft / 크래프톤** | AI R&D | 직접 컨택 |

#### Tier 2 — 정부 SW 진흥

| 기관 | 사업명 | 시기 |
|------|--------|------|
| NIPA (정보통신산업진흥원) | OSS 활성화 사업 | 매년 1-2월 공고 |
| KOSA (한국SW산업협회) | OSS 우수개발자 | 연간 |
| 과기부 R&D | AI/SW 지원 사업 | 연간 (대학 연계 필요) |

#### Tier 3 — 대기업 IT (CSR)

삼성 SDS / LG CNS / 현대오토에버 / KT / SKT (AI 사업)

### 후원 채널

```
1. GitHub Sponsor (글로벌, 신뢰도)
2. Toss Tipping (한국, 간단)
3. 카카오페이 후원
4. 직접 기업 컨택 (CSR / OSS 후원 부서)
5. NIPA 공고 신청
6. Open Collective (옵션)
```

### Phase별 후원 목표

```
Phase 1 (MVP)
  목표: 사용자 50-100명
  후원: $0 / Toss Tipping 페이지 오픈

Phase 2 (v1)
  목표: 사용자 500+, GeekNews 노출
  후원: $100-300/월 (개인 후원자)

Phase 3 (v2)
  목표: 컨퍼런스 발표 + 기업 후원
  후원: $500-2,000/월 (기업 + 개인 혼합)
```

### 마케팅 채널 (한국)

| 채널 | 영향력 | 시점 |
|------|--------|------|
| **GeekNews** | ⭐⭐⭐⭐⭐ | Phase 1 끝 |
| **OKKY 프로젝트** | ⭐⭐⭐⭐ | Phase 1-2 |
| **블로터 / ZDNet Korea** | ⭐⭐⭐ | Phase 2 |
| **AI Times** | ⭐⭐⭐ | Phase 2 |
| **개인 블로그 / 미디엄** | ⭐⭐⭐ | 항상 |

### 컨퍼런스 발표 목표

| 컨퍼런스 | 주최 | CFP 시기 |
|---------|------|---------|
| DEVIEW | NAVER | 매년 6월 |
| if(kakao) | 카카오 | 매년 6월 |
| SLASH | Toss | 매년 8월 |
| 우아콘 | 우아한형제들 | 매년 9월 |
| AWSKRUG / GDG Korea | 커뮤니티 | 월간 |

→ Phase 2 시점에 2027년 CFP 제출

### 운영 구조

```
Phase 1-2: 개인 프로젝트 (GitHub Sponsor + Toss Tipping)
Phase 3:   LLC 등록 검토 (Dreampia 1인 LLC) 또는 비영리 단체 산하
```

---

## 🌐 i18n / 다국어

| Phase | 언어 |
|-------|------|
| **Phase 1** | **한국어 (ko-KR)** 우선 |
| **Phase 2** | 영어 (en-US) 추가 |
| **Phase 3** | 일본어 / 중국어 / 스페인어 (커뮤니티 PR) |

### i18n 시스템

- react-intl 6.7.2 (Claude 동일)
- 키 형식: sentence-key (영어 fallback 자연스러움)

---

## 📅 로드맵 결정

### Phase 1 — MVP (Windows GUI, 4-6주)

**목표**: "두 CLI를 단일 GUI로 호출 가능 + 한국어"

- [ ] Electron + React + Tailwind 셋업
- [ ] 사이드바 + 멀티탭 레이아웃
- [ ] Claude/Codex CLI 자동 감지
- [ ] 채팅 UI (메시지마다 모델 선택)
- [ ] 권한 sandbox 토글 (3 levels)
- [ ] MCP 추가 폼 (양쪽 동기화)
- [ ] 한국어 UI
- [ ] MSIX 빌드 + GitHub Releases
- [ ] LICENSE (Apache 2.0) + NOTICE 파일

### Phase 2 — v1 (macOS + 영어, 8-10주)

- [ ] macOS DMG 빌드 + 코드 서명 (OV cert ~₩200K/년)
- [ ] 영어 UI 추가
- [ ] 비용 추적 대시보드
- [ ] 통합 세션 검색
- [ ] Cross-AI 비교 (compare 명령)
- [ ] 다중 프로필 시스템
- [ ] GitHub Sponsor + Toss Tipping 페이지
- [ ] GeekNews 알파 발표

### Phase 3 — v2 (확장, 12주)

- [ ] Plugin 시스템
- [ ] AI 추가 (Gemini, Llama 등)
- [ ] CLI 옵션 추가
- [ ] Linux AppImage
- [ ] 커뮤니티 i18n (ja/zh/es/...)
- [ ] EV cert 도입 + LLC 검토
- [ ] DEVIEW / if(kakao) CFP

---

## 🚫 비목표 (Non-Goals)

이 프로젝트는 다음을 **하지 않음**:

- ❌ 자체 AI 모델 호스팅
- ❌ Hyper-V VM 통합 (Claude Cowork 같은 격리)
- ❌ Browser extension (Claude_in_Chrome)
- ❌ Office Add-in (Walnut.dll / m365)
- ❌ Buddy / BLE 하드웨어
- ❌ CLI 도구 (Phase 1-2, 단 Phase 3+ 옵션)
- ❌ Anthropic / OpenAI 공식 후원
- ❌ Phase 1에 macOS 빌드 (Windows 우선)
- ❌ Phase 1에 다국어 (한국어만)

---

## 🔄 변경 이력

| 날짜 | 변경 | 이유 |
|------|------|------|
| 2026-05-01 | 초안 작성 (이름: aix) | 일반 spec |
| 2026-05-01 | 이름 변경: aix → OH MY DEV | 사용자 제안 |
| 2026-05-01 | 이름 확정: OH MY DEV → **Dreampia-Dev** | Dreampia 생태계 통합 |
| 2026-05-01 | 폴더 rename: dev-tool/ → dreampia-dev/ | 브랜드 일관성 |
| 2026-05-01 | "로그인" 정정: 클라우드 X → 로컬 프로필 | 사용자 명시 |
| 2026-05-01 | CLI: Phase 1 X → Phase 3 옵션 | GUI 우선 |
| 2026-05-01 | **라이선스 확정: Apache 2.0** | 한국 기업 후원 타겟 |
| 2026-05-01 | 한국 후원 전략 추가 | 사용자 명시 타겟 |
| 2026-05-01 | 서명 한국 옵션 추가 (한국정보인증 등) | 한국 발급 비용 ↓ |

---

## 🔗 참고 분석 결과

본 프로젝트의 모든 결정은 다음 분석 결과 기반:

- [../codex/codex-spec.md](../codex/codex-spec.md) — 4,002줄 Codex 분석
- [../claude/claude-spec-v5.md](../claude/claude-spec-v5.md) — 4,830줄 Claude 분석
- [../FINAL_REPORT.md](../FINAL_REPORT.md) — 분석 종합 + 편향 정정
- [../COMPARISON.md](../COMPARISON.md) — 두 앱 비교
- [../PROS_CONS.md](../PROS_CONS.md) — 장단점 18 항목
- [../codex_review_result.md](../codex_review_result.md) — 외부 AI 비판

---

## 📚 다른 결정 문서

| 문서 | 내용 |
|------|------|
| [README.md](./README.md) | 프로젝트 인덱스 |
| [PRD.md](./PRD.md) | 제품 요구사항 (페르소나 + 기능) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 6-레이어 시스템 디자인 |
| [CLI_INTEGRATION.md](./CLI_INTEGRATION.md) | claude/codex CLI 매핑 |
| [ROADMAP.md](./ROADMAP.md) | Phase 1+2+3 단계별 |
| [TECH_STACK.md](./TECH_STACK.md) | 기술 스택 + 의존성 |

---

## ❓ 다음 결정 필요 (Open)

| 항목 | 우선 | 비고 |
|------|------|------|
| GitHub repo 위치 | P1 | `<username>/dreampia-dev` 또는 `dreampia-org/dev` |
| 도메인 | P2 | dreampia.dev / dreampia-dev.io / 기타 |
| 첫 빌드 시작 시점 | P1 | TBD |
| 비용 한도 알림 임계값 | P3 | Phase 2 |
| LLC 등록 시점 | P3 | Phase 3 (사용자 500+ 시점) |
| GitHub Sponsor 페이지 오픈 | P2 | Phase 1 끝 시점 |

---

**End of decisions v2.0.**
