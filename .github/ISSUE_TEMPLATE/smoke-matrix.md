---
name: ✅ Smoke Matrix
about: 첫 사용자 체크리스트 — 설치 + Onboarding + 첫 채팅 검증
title: '[Smoke] '
labels: ['feedback', 'installer']
assignees: []
---

> **목적**: 10-30명 초기 사용자가 같은 형식으로 결과 보고 → v0.1.x patch 우선순위 결정.

## 환경

- **OS**: (예: Windows 11 / macOS 14 Sonoma Apple Silicon / Ubuntu 22.04)
- **Dreampia-Dev 버전**: (다운로드한 파일명에서 확인)
- **Claude CLI**: 설치됨 (v?.?.?) / 미설치
- **Codex CLI**: 설치됨 (v?.?.?) / 미설치
- **GitHub username**: (선택)

## Step 1: 설치

- [ ] 다운로드 성공
- [ ] 설치 시작 (SmartScreen / Gatekeeper 우회 가능)
- [ ] 첫 실행 — 앱 창이 뜸
- [ ] 3-panel layout 보임 (사이드바 / 채팅 / 미리보기)

## Step 2: Onboarding 5-step

- [ ] Step 0: Welcome 화면
- [ ] Step 1: CLI 감지 (Claude/Codex 정확히 표시)
- [ ] Step 2: 인증 안내 (실제 CLI 미설치 시 Mock 모드 안내)
- [ ] Step 3: Workspace picker (폴더 선택 가능, 영속)
- [ ] Step 4: 첫 채팅 (추천 prompt 클릭 → ChatInput 자동 입력)

## Step 3: 첫 채팅

- [ ] 사용자 입력 → user 버블 등장
- [ ] Mock 응답 또는 실제 AI 응답 streaming (▋ 펄싱)
- [ ] 메시지 완료 → 영속 (앱 재시작 후 복원)

## Step 4: Tool 실행 (선택)

- [ ] AI 응답에 tool_call 포함 시 ToolCallCard 표시
- [ ] 실행 결과 (✅ 완료 / ❌ 실패) 정확
- [ ] `rm -rf /` 같은 위험 명령 → DangerCheck 차단 (시각 확인)

## Step 5: BrowserView (선택)

- [ ] PreviewPanel 의 [예시 URL 열기] 클릭 → example.com 로드
- [ ] 탭 전환 + URL 입력 + 뒤/앞/새로고침 버튼 동작

## Step 6: 자동 업데이트 (v0.1.0 / v0.1.1 사용자만)

- [ ] 앱 시작 후 5초 → electron-updater 가 새 버전 감지
- [ ] 백그라운드 다운로드 → 다음 종료 시 자동 설치

## 발견된 이슈

(여기에 자유 기재 — 별도 [Bug Report](https://github.com/eonofpixel/dreampia-dev/issues/new?template=bug-report.md) 또는 [Install Problem](https://github.com/eonofpixel/dreampia-dev/issues/new?template=install-problem.md) 으로 이동 권장)

## 전반적 첫 인상

(자유 기재 — 좋았던 점 / 헷갈렸던 점 / 누락 기능)

---

🙏 피드백 감사합니다. 10-30명 모집 단계입니다.
