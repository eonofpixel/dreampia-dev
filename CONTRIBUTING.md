# Contributing to Dreampia-Dev

> 한국어 우선 / 오픈소스 / Apache 2.0

---

## 시작하기

```bash
git clone https://github.com/dreampia-org/dreampia-dev.git
cd dreampia-dev
npm install
npm run dev
```

## 개발 흐름

1. **Issue 먼저** — 큰 변경은 issue 로 논의 후 진행
2. **Branch** — `feature/<issue번호>-<짧은-설명>` 또는 `fix/<...>`
3. **작업** — 위키 spec 따라 (`docs/` 참고)
4. **테스트** — `npm test` 모두 통과
5. **PR** — Draft 로 시작, 준비되면 Ready

## Spec 우선

```
구현 전 항상 docs/ 위키 확인:
  - docs/session/      세션 모델
  - docs/permission/   권한 모델
  - docs/tools/        도구 실행
  - docs/design/       디자인 시스템
  - docs/i18n/         한국어 우선
```

## 코딩 스타일

- **TypeScript strict** — `any` 금지 (warning)
- **Prettier** — `npm run format` 자동
- **ESLint** — `npm run lint`
- **함수형 컴포넌트** — class X
- **한국어 우선** — 사용자 보이는 string 모두 한국어 first

## Commit 메시지

```
feat: 새 기능
fix: 버그 수정
docs: 문서
style: 포맷
refactor: 리팩토링
test: 테스트
chore: 빌드 / CI

예:
  feat(session): SS-1 TypeScript types 추가
  fix(ime): 한글 모드에서 Ctrl+K 인식 안 되는 문제
  docs(design): 컴포넌트 button 변형 추가
```

## PR 체크리스트

- [ ] Issue 연결 (Closes #N)
- [ ] CI 통과 (lint / typecheck / test / build)
- [ ] spec 위키 업데이트 (필요 시)
- [ ] 한국어 string 자연스러움
- [ ] A11y 통과 (focus, contrast, keyboard)
- [ ] PR 설명 충분 (변경 이유, 영향 범위)

## 의문 / 질문

GitHub Discussions 활용. 한국어 또는 영어 모두 OK.

---

기여 감사합니다 🙏
