---
title: i18n — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Internationalization (i18n)

> **한 줄 요약**: 한국어 우선. 영어 fallback. IME 안전.

---

## 페이지

- [korean-first.md](./korean-first.md) — 한국어 우선 전략
- [locale-strategy.md](./locale-strategy.md) — 다국어 추가 방법
- [datetime.md](./datetime.md) — 날짜 / 시간 포맷
- [numbers.md](./numbers.md) — 숫자 / 통화 / 단위
- [ime.md](./ime.md) — 한국어 IME 처리
- [text-overflow.md](./text-overflow.md) — 한/영 길이 차이
- [keyboard-shortcuts.md](./keyboard-shortcuts.md) — 한글 모드 단축키
- [pluralization.md](./pluralization.md) — 단수/복수 (한국어는 단순)

---

## 핵심 원칙

```
1. 한국어 우선
   - 모든 string 한국어 먼저
   - 영어는 fallback
   - 자동 번역 X (수동 번역 품질 우선)

2. IME 안전
   - 단축키는 event.code 사용
   - composition events 처리
   - 한글 변환 시점 정확

3. Typography 한글 친화
   - Pretendard 우선
   - line-height 1.6+
   - 한글 자모 결합 NFC

4. Layout 한글 fit
   - 텍스트 길이 한/영 차이 고려
   - 영문 길이 = max-width 측정
```

---

## 지원 언어 (Phase 별)

```
Phase 1:   한국어 (ko-KR)
Phase 2:   + 영어 (en-US)
Phase 3:   + 일본어, 중국어, 베트남어 (옵션)
```

---

## 라이브러리

```
react-intl (FormatJS):
  ✓ ICU MessageFormat
  ✓ 날짜/숫자 포맷 통합
  ✓ Pluralization
  ✓ 시장 표준
  
또는:
  next-intl (Next.js 우선)
  i18next (가장 인기)

→ react-intl 권장 (Codex 도 사용).
```

---

## 관련

- [../design/typography/korean-first.md](../design/typography/korean-first.md)
- [../design/interaction/keyboard.md](../design/interaction/keyboard.md)
