---
title: F-040 — Multi-IDE 열림 위치
parent: ../_index.md
priority: P2
phase: Phase 3
---

# F-040: Multi-IDE 열림 위치 (8가지)

> **한 줄 요약**: 파일 / 폴더 열 때 어떤 IDE 사용할지 선택.

---

## 8가지 열림 위치 (Codex 발견)

```
설정 → 일반 → 기본 열림 위치:

  ◉ VS Code            (가장 흔함)
  ○ Visual Studio
  ○ Antigravity        ← Codex 차별화 (??)
  ○ Default            (OS 기본 프로그램)
  ○ File Explorer       (Windows Explorer)
  ○ Terminal            (현재 shell)
  ○ Git Bash
  ○ WSL                 (Linux 환경)
```

## 발견 의미

```
Antigravity = Google 의 새 IDE
  C:\Users\creat\AppData\Local\Programs\Antigravity\

→ Codex 가 Google IDE 도 인식
→ 미래 멀티-IDE 시대 대응
```

## 동작

```
사용자가 [📁 폴더에서 열기] 클릭 →
  설정의 default 열림 위치 사용
  
또는 [▼] 클릭 →
  드롭다운으로 다른 IDE 선택 가능
```

## 자동 감지

```
앱 시작 시:
  Windows: 시작 메뉴 + Programs 폴더 스캔
  macOS: /Applications + Homebrew Cask
  Linux: $PATH + .desktop 파일
  
사용 가능한 IDE 목록 자동 생성
사용자가 그 안에서 선택
```

## Dreampia-Dev 매핑

```typescript
type OpenLocation =
  | { kind: 'vscode' }
  | { kind: 'visual_studio' }
  | { kind: 'antigravity' }
  | { kind: 'cursor' }              // 추가
  | { kind: 'windsurf' }            // 추가
  | { kind: 'jetbrains'; product: string }  // IntelliJ/WebStorm/etc
  | { kind: 'os_default' }
  | { kind: 'file_explorer' }
  | { kind: 'terminal'; shell: string }
  | { kind: 'custom'; command: string };
```

## CLI 호출

```typescript
async function openInIde(loc: OpenLocation, path: string) {
  switch (loc.kind) {
    case 'vscode':
      spawn('code', [path]);
      break;
    case 'cursor':
      spawn('cursor', [path]);
      break;
    case 'antigravity':
      spawn('C:\\Users\\...\\Antigravity\\antigravity.exe', [path]);
      break;
    case 'os_default':
      shell.openPath(path);
      break;
    // ...
  }
}
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
- 정적 분석 (locale 파일에서 IDE 이름 발견)
