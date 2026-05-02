---
title: Components — Select
parent: ./_index.md
related:
  - dropdown.md
status: draft
last_updated: 2026-05-02
---

# Select

> **한 줄 요약**: Native-feel select. Dropdown.md 의 Select variant 와 동일.

---

상세는 [dropdown.md](./dropdown.md) 의 "Select 구현" 섹션 참고.

---

## 사용 예시

```tsx
<SelectField
  label="기본 열림 위치"
  value={openLocation}
  onChange={setOpenLocation}
  options={[
    { value: 'vscode', label: 'VS Code', icon: <VSCodeIcon /> },
    { value: 'visual_studio', label: 'Visual Studio' },
    { value: 'antigravity', label: 'Antigravity' },
    { value: 'cursor', label: 'Cursor' },
    { value: 'os_default', label: 'OS 기본' },
    { value: 'file_explorer', label: 'File Explorer' },
    { value: 'terminal', label: '터미널' },
    { value: 'gitbash', label: 'Git Bash' },
    { value: 'wsl', label: 'WSL' },
  ]}
/>
```

→ F-040 Multi-IDE 의 8가지 옵션.

---

## 관련

- [dropdown.md](./dropdown.md) — Dropdown / Select 통합 구현
