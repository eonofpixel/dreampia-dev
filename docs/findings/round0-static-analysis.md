---
title: Round 0 — Static Analysis (asar)
parent: ./_index.md
related:
  - ../../codex-spec.md
status: complete
last_updated: 2026-05-02
---

# Round 0: 정적 분석 (asar)

> **방법**: codex.exe 의 asar 추출 + grep
>
> **결과**: 4,002줄 spec — 하지만 동적 동작은 못 봄.

---

## 발견된 정적 정보

```
Electron 41.x
Vite 6 build
React 18
Tailwind 3.4
Korean locale (12 locales 패턴)
OXC toolchain (oxlint + oxfmt)
Sandbox 3-tier 문자열
prompts:* string 발견
```

## 정적 분석의 한계

```
✓ 발견 가능: 라이브러리, locale, string, file structure
✗ 발견 불가: UX 흐름, 메뉴 동작, 권한 dropdown, 모달 내용
```

→ 다음 라운드로 라이브 UI 분석 진행.

---

## 상세

원본 분석 결과는 [codex-spec.md](../../../codex/codex-spec.md) (4,002줄) 참고.
