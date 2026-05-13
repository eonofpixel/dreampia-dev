# Local Repo Coding Loop v1 Audit

작성일: 2026-05-14 KST
범위: Dreampia-Dev의 local repo coding loop v1 구현, 테스트, 경쟁력 재평가.

## 결론

이번 변경은 "작업 요청 -> repo context -> 계획 -> 변경 후보/diff -> 안전한 테스트 -> git handoff"를 앱 안에서 하나의 제품 루프로 보이게 만드는 첫 v1이다. full semantic agent나 background PR agent는 아직 아니지만, 새 사용자가 실제 repo를 열었을 때 다음 행동을 이해할 수 있는 최소 경쟁 루프는 갖췄다.

## 기준선 감사

| 항목 | 이전 문제 | 등급 | 처리 |
| --- | --- | --- | --- |
| Repo context | workspace를 선택해도 어떤 파일/테스트/스크립트를 AI 작업에 쓸지 보이지 않음 | P1 | `workspace/inspect`와 task panel context preview로 수정 |
| 작업 상태 | 채팅 텍스트에 계획과 상태가 묻혀 있고 복구 가능한 실패 상태가 약함 | P1 | Context/Plan/Review/Test 상태와 provider/workspace 복구 CTA 추가 |
| 테스트 루프 | 앱 내부에서 typecheck/lint/test 실행 상태와 exit code가 추적되지 않음 | P1 | allowlisted safe command runner와 결과 요약 추가 |
| Git handoff | branch/dirty files/commit 후보가 작업 루프와 연결되지 않음 | P1 | git summary와 Lore Commit Protocol commit candidate 추가 |
| 위험 작업 | 임의 shell/delete/push가 같은 UX로 오해될 수 있음 | P1 | safe command allowlist와 push/delete 자동 실행 금지 문구 강화 |
| Semantic intelligence | symbol graph, hunk lineage, task-level patch history는 아직 없음 | P2 | 다음 sprint 항목으로 유지 |

현재 P0/P1은 남기지 않았다. P2는 경쟁 제품 상위 기능으로 남아 있지만 v1 성공 조건의 blocker는 아니다.

## 구현 근거

- Main IPC: `workspace/inspect`, `workspace/run-safe-command` 추가.
- Preload API: renderer에서 repo context와 safe command result를 안전하게 호출.
- Renderer hook: workspace 변경 시 context refresh와 command result 상태 관리.
- Chat task panel: Context, Task status, Test/Git handoff를 같은 화면에 표시.
- i18n: 한국어-first 문구와 영어 문구 추가.
- Tests: renderer unit, main IPC unit, golden path e2e, axe e2e 보강.
- Docs: 5분 golden path, README, competitive roadmap 갱신.

## 검증 결과

| 검증 | 결과 | 비고 |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | TypeScript 통과 |
| `npm run lint` | exit 0 | 기존 unused eslint-disable warning 3건 유지 |
| `npx vitest run tests/renderer/CodingTaskPanel.test.tsx tests/main/ipc.workspace-files.test.ts` | exit 0 | 2 files, 24 tests 통과 |
| `npm test` | exit 0 | full Vitest 통과, real CLI smoke는 opt-in skip |
| `npm run pretest:e2e` | exit 0 | Vite build + Electron ABI 준비 통과 |
| `npm run test:e2e -- e2e/golden-path-coding-loop.spec.ts e2e/_drive18_axe.spec.ts` | exit 0 | 최종 7 passed, axe critical/serious 0 |
| localhost snapshot smoke | exit 0 | 1440/1100/760/390 스냅샷 저장, horizontal overflow 없음 |

스냅샷 산출물:

- `test-results/local-repo-loop-snapshots/desktop-1440.png`
- `test-results/local-repo-loop-snapshots/desktop-1100.png`
- `test-results/local-repo-loop-snapshots/tablet-760.png`
- `test-results/local-repo-loop-snapshots/mobile-390.png`
- `test-results/local-repo-loop-snapshots/layout.json`

## 최종 재평가

| 항목 | 점수 | 판단 |
| --- | ---: | --- |
| UI/UX 골격 | 90 | 작업 패널이 핵심 루프를 한 화면에서 연결한다 |
| 실제 AI 코딩 루프 | 90 | README 변경 golden path가 context/plan/diff/apply/test/git handoff까지 검증된다 |
| Repo intelligence | 82 | metadata/package/git/test 기반 preview는 충분하나 semantic ranking은 후속 |
| Test/terminal loop | 86 | safe runner/result UX는 통과, persistent job history는 후속 |
| Git handoff | 82 | branch/dirty/commit 후보는 보이나 AI/user patch lineage는 후속 |
| 실패 복구 UX | 90 | workspace/provider/test/risk 상태가 recoverable CTA로 노출된다 |
| 오픈소스 공개 신뢰도 | 86 | 문서와 검증은 강화됐지만 signed build, real provider smoke, `private: true` 결정은 후속 |
| 종합 경쟁 준비도 | 87 | local repo coding loop v1은 90점 기준 충족, 전체 플랫폼 경쟁력은 다음 sprint 필요 |

## 남은 리스크

- Real provider/CLI smoke는 인증, quota, local CLI 설치 상태에 의존하므로 기본 검증에서는 opt-in으로 남겼다.
- Repo intelligence는 아직 semantic symbol graph가 아니라 file metadata, package scripts, git status, test candidate 중심이다.
- Git handoff는 commit candidate 제안까지이며 실제 commit/push 자동화는 안전상 사용자 승인 뒤에만 진행해야 한다.
- Hunk-level accept/reject, task-level patch lineage, persistent terminal job history는 다음 sprint의 주요 경쟁력 과제다.
