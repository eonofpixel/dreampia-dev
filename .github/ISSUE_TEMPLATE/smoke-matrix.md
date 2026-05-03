---
name: Smoke Matrix (v1.0)
about: 첫 사용자 체크리스트 — v1.0 production release 검증
title: '[Smoke v1.0] '
labels: ['feedback', 'installer', 'v1.0']
assignees: []
---

> **목적**: v1.0.0 production release 검증. 같은 형식으로 결과 보고 → 우선순위
> patch (v1.0.x) 결정. 처음 30분 흐름 + 일상 사용 흐름을 모두 다룬다.

## 환경

- **OS**: (예: Windows 11 / macOS 14 Sonoma Apple Silicon / Ubuntu 22.04)
- **CPU 아키텍처**: x64 / arm64
- **Dreampia-Dev 버전**: (다운로드한 파일명에서 확인)
- **Claude CLI**: 설치됨 (v?.?.?) / 미설치
- **Codex CLI**: 설치됨 (v?.?.?) / 미설치
- **Node.js**: (`node -v`)
- **GitHub username**: (선택)

## 1단계: 다운로드 + 설치

- [ ] GitHub Releases 에서 OS 별 파일 다운로드 성공
- [ ] 다운로드한 파일 크기가 GitHub 표시 크기와 일치
- [ ] 인스톨러 실행 가능 (Win: `.exe` / macOS: `.dmg` / Linux: `.AppImage` 또는 `.deb`)
- [ ] **(예상)** SmartScreen / Gatekeeper 경고 표시 — v1.0.0 은 unsigned 라 정상
- [ ] 우회 후 설치 진행 가능
- [ ] 설치 완료 후 시작 메뉴 / Applications / 데스크톱 아이콘 등록

## 2단계: 첫 실행 + Onboarding 5-step

- [ ] 앱 창이 뜸 (3-panel layout: 사이드바 + 채팅 + 미리보기)
- [ ] Step 0 — Welcome 화면 표시
- [ ] Step 1 — CLI 감지 (Claude / Codex 정확히 표시. 미설치면 Mock 모드 안내)
- [ ] Step 2 — 인증 안내 화면 (사용자 자체 API 키 / CLI 인증 모두 가능)
- [ ] Step 3 — Workspace picker (폴더 선택 가능, 영속)
- [ ] Step 4 — 첫 채팅 (추천 prompt 클릭 → ChatInput 자동 입력)
- [ ] Onboarding 종료 후 정상적으로 메인 화면 진입

## 3단계: 첫 채팅 (Mock 또는 실제 AI)

- [ ] 사용자 입력 → user 버블 등장
- [ ] Mock 응답 또는 실제 AI 응답 streaming (▋ 펄싱)
- [ ] 메시지 완료 → 영속 (앱 재시작 후 자동 복원)
- [ ] IME (한글) 입력 시 키보드 처리 정상 (compositionStart/End — Enter 가 변환 확정)

## 4단계: 종료 + 재시작

- [ ] 앱 종료 (Cmd/Ctrl+Q)
- [ ] 다시 실행 → 마지막 세션 자동 복원
- [ ] 사이드바의 세션 목록 보존
- [ ] 채팅 내역 보존

## 5단계: 자동 업데이트 (v0.x 사용자만 해당)

- [ ] v0.x 에서 v1.0.0 으로 자동 업데이트 가능
- [ ] 앱 시작 후 5초 → electron-updater 가 v1.0.0 감지
- [ ] 백그라운드 다운로드 → 다음 종료 시 자동 설치
- [ ] 설치 후 v1.0.0 정상 시작 + 데이터 보존

## 6단계: 단축키 (v0.10.0)

- [ ] **Cmd/Ctrl+K** — 슬래시 명령 팔레트 열림
- [ ] **Cmd/Ctrl+,** — Settings 모달 열림
- [ ] **Cmd/Ctrl+U** — Usage 모달 열림
- [ ] **Cmd/Ctrl+F** — Sidebar 검색 포커스
- [ ] Settings → 단축키 탭에서 사용자 지정 매핑 가능

## 7단계: 슬래시 명령 (v0.5.0)

- [ ] `/help` 또는 슬래시 명령 팔레트 (Cmd+K) 열림
- [ ] `/settings` → Settings 모달 열림
- [ ] `/usage` → 사용량 모달
- [ ] `/clear` → 현재 세션의 turns 비우기
- [ ] `/model <name>` → 현재 세션의 모델 변경
- [ ] `/compare <prompt>` → Cross-AI 비교 모달

## 8단계: @ 멘션 + Typed File References (v0.6.0 + v0.13.0)

- [ ] ChatInput 에 `@` 입력 시 popover 등장
- [ ] 파일 검색 (workspace 안의 파일 fuzzy match)
- [ ] 세션 검색 (다른 세션 reference)
- [ ] 멘션 확정 시 chip 으로 표시
- [ ] Chip 클릭 → expanded 상태 (snippet 미리보기)
- [ ] 채팅 응답 후 chip metadata 가 chat 검색에 노출 (FTS5)

## 9단계: Cross-AI Compare (v0.12.0)

- [ ] `/compare <prompt>` 슬래시 명령
- [ ] 좌우 두 컬럼 (Claude | Codex) 동시 streaming
- [ ] 한쪽 실패해도 다른 쪽 계속 (failure isolation)
- [ ] "diff 표시" 토글 → line-by-line diff
- [ ] "이 응답 채택" 클릭 → 활성 세션에 user/assistant turn pair 추가

## 10단계: 채팅 검색 (v0.7.0 FTS5)

- [ ] Sidebar 검색창에 query 입력
- [ ] 모든 세션의 turns 에서 검색 결과 표시
- [ ] 검색 결과 클릭 → 해당 세션 + turn 으로 이동
- [ ] 한국어 / 영어 / 코드 snippet 모두 검색 가능

## 11단계: Usage Tracking (v0.4.0 + v0.9.0)

- [ ] Settings → 사용량 탭 열기
- [ ] 오늘 / 7일 / 30일 사용량 차트 표시
- [ ] Provider 별 (Claude / Codex / Mock) 분리 표시
- [ ] CSV 내보내기 가능
- [ ] 비용 한도 설정 가능 (alert_threshold, cost_limit_usd)

## 12단계: MCP Bridge (v0.2.0 + v0.9.0 discovery)

- [ ] Settings → MCP 탭 열기
- [ ] 추천 MCP 서버 (filesystem, github 등) 자동 표시
- [ ] Claude / Codex 설정에서 import 가능
- [ ] 새 MCP 서버 수동 추가 (이름, 명령어, 인자, 환경변수)
- [ ] 추가된 서버 status: ready / disabled / error 정확히 표시
- [ ] 서버 logs 확인 가능

## 13단계: BrowserView (v0.1.0 ~ Phase 1)

- [ ] PreviewPanel 의 [예시 URL 열기] 클릭 → example.com 로드
- [ ] 탭 전환 + URL 입력 + 뒤/앞/새로고침 버튼 동작
- [ ] partition isolation 작동 (앱 cookie 와 분리)

## 14단계: 영어 i18n (v0.11.0)

- [ ] Settings → 언어 탭에서 English 선택
- [ ] UI 전체가 영어로 즉시 전환
- [ ] 한국어로 다시 전환 시 즉시 복원
- [ ] 영어 모드에서 모든 메뉴 / 버튼 / 라벨 적절히 번역

## 15단계: Settings → 진단 (v0.14.0)

- [ ] Settings → 진단 탭 열기
- [ ] 환경 정보 (platform / arch / Node / Electron / app version) 표시
- [ ] DB 정보 (db_loaded / schema_version / table_count / integrity / WAL mode) 표시
- [ ] 모든 항목 ✅ (녹색) 또는 정상 값
- [ ] 새로고침 버튼 작동

## 16단계: Settings → 정보 (v1.0.0 신규)

- [ ] Settings → 정보 (About) 탭 열기
- [ ] 앱 이름 + 버전 (1.0.0) 표시
- [ ] License (Apache 2.0) 명시
- [ ] GitHub repo 링크 클릭 가능
- [ ] 코드 서명 status (signed / unsigned) 정확히 표시
- [ ] 자동 업데이트 status 표시

## 17단계: 위험 명령 차단 (PM-9)

- [ ] AI 응답에 `rm -rf /` 같은 위험 패턴 포함 시 DangerCheck 차단
- [ ] 명령 실행 거부 + 사용자 안내 메시지
- [ ] 권한 dropdown 으로 임시 elevation 가능

## 발견된 이슈

(여기에 자유 기재 — 별도 [Bug Report](https://github.com/eonofpixel/dreampia-dev/issues/new?template=bug-report.md) 또는 [Install Problem](https://github.com/eonofpixel/dreampia-dev/issues/new?template=install-problem.md) 으로 이동 권장)

## 전반적 첫 인상

(자유 기재 — 좋았던 점 / 헷갈렸던 점 / 누락 기능 / 다른 도구와의 비교)

## 추가 의견 / 제안

- v1.1 / v1.2 에서 보고 싶은 기능
- 코드 서명 우선순위 (사용자 입장에서 얼마나 critical?)
- macOS / Windows / Linux 별 사용 빈도

---

피드백 감사합니다. v1.0.0 production release 안정화 + v1.0.x patch 우선순위
결정에 큰 도움이 됩니다.
