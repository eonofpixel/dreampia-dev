---
title: F-025 — 통합 단축키 시스템 (20+)
parent: ../_index.md
priority: P0
phase: Phase 1
---

# F-025: 통합 단축키 시스템

> **한 줄 요약**: 20+ Ctrl+Alt 기반 단축키. 채팅 작업 + 패널 토글 + 모드 전환.

---

## 채팅 작업 단축키

| 단축키 | 동작 |
|--------|------|
| Ctrl+Alt+P | 채팅 고정 |
| Ctrl+Alt+R | 채팅 이름 바꾸기 |
| Ctrl+Shift+A | 채팅 보관 |
| Ctrl+Shift+C | 작업 디렉토리 복사 |
| Ctrl+Alt+I | 세션 ID 복사 |
| Ctrl+Alt+L | 딥링크 복사 |
| Alt+Ctrl+N | Quick Chat (새 채팅 빠르게) |

## 검색 / 네비

| 단축키 | 동작 |
|--------|------|
| Ctrl+1~9 | 1~9번째 채팅 점프 |
| Ctrl+K | 채팅 검색 팔레트 |
| Ctrl+P | 파일 quick open |
| Ctrl+Shift+P | Command palette |

## 패널 토글

| 단축키 | 동작 |
|--------|------|
| Ctrl+\ | 사이드바 토글 |
| Ctrl+J | 터미널 패널 토글 |
| Ctrl+Shift+E | 파일 트리 토글 |
| Ctrl+Shift+G | git diff 패널 |
| F11 | 전체화면 토글 |

## 모드 전환

| 단축키 | 동작 |
|--------|------|
| Ctrl+Shift+P (입력) | / 슬래쉬 명령 |
| Ctrl+Shift+A (입력) | @ 멘션 |
| Esc | 팔레트 취소 |

## 한국어 IME 충돌 회피

```
Codex 의 알려진 이슈:
  - 한글 모드에서 일부 단축키 인식 X
  - / @ 트리거 시 한글 변환 발생

Dreampia-Dev 차별화:
  - IME 모드 자동 감지
  - 단축키 입력 시 영문 강제 (또는 안내)
```

## 사용자 커스터마이즈

```
설정 → 단축키:
  각 액션마다 사용자 단축키 지정 가능
  충돌 감지
  Reset to defaults
```

## 출처

- [docs/findings/round4-context-menus.md](../../findings/round4-context-menus.md)
