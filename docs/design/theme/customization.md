---
title: Theme — Customization
parent: ../_index.md
related:
  - dark.md
  - light.md
  - ../../ux/patterns/F-034-settings.md
status: draft
last_updated: 2026-05-02
---

# Theme Customization

> **한 줄 요약**: 사용자가 색·글꼴·대비 변경. 가져오기/내보내기. F-034 의 모양 설정.

---

## 변경 가능 항목 (Codex 패턴)

```
색상:
  ✓ 액센트 색
  ✓ 배경색 (light + dark 별도)
  ✓ 전경색 (text)

글꼴:
  ✓ UI 글꼴
  ✓ 코드 글꼴

기타:
  ✓ 반투명 사이드바 toggle
  ✓ 대비 (contrast slider, 0-100)
  ✓ Density (compact/comfortable/spacious)
```

---

## UI

```
설정 → 모양:

┌─────────────────────────────────────────────────────┐
│ 테마                  [☼ 라이트] [☾ 다크] [🖥 시스템] │
│ 라이트, 다크, 또는 시스템에 맞춘 테마를 사용하세요   │
├─────────────────────────────────────────────────────┤
│ 라이브 미리보기:                                     │
│ ┌──────────────┐  ┌──────────────┐                  │
│ │ const x = 1  │  │ const x = 1  │                  │
│ │ // hello     │  │ // hello     │                  │
│ └──────────────┘  └──────────────┘                  │
│   라이트              다크                          │
├─────────────────────────────────────────────────────┤
│ 라이트 테마      [가져오기] [테마 복사] [Dreampia ▼] │
│   액센트          ▣ #2DA4D9                          │
│   배경색          ⬜ #FFFFFF                          │
│   전경색          ⬛ #1A1C1F                          │
│   UI 글꼴             [Pretendard ▼]                 │
│   코드 글꼴           [D2Coding Ligature ▼]          │
│   반투명 사이드바     [●] ON                         │
│   대비                ━━━━━●━━━━━ 70                  │
├─────────────────────────────────────────────────────┤
│ 다크 테마        [가져오기] [테마 복사] [Dreampia ▼] │
│   액센트          ▣ #339CFF                          │
│   ...                                                │
└─────────────────────────────────────────────────────┘
```

---

## 데이터 모델

```typescript
interface ThemeCustomization {
  preset?: 'dreampia' | 'codex' | 'minimalist' | 'high_contrast' | string;
  
  // Light theme overrides
  light?: {
    accent?: string;          // hex
    background?: string;
    foreground?: string;
  };
  
  // Dark theme overrides
  dark?: {
    accent?: string;
    background?: string;
    foreground?: string;
  };
  
  // 공통
  ui_font?: string;           // "Pretendard Variable" 등
  code_font?: string;         // "D2Coding Ligature" 등
  
  translucent_sidebar?: boolean;
  contrast?: number;          // 0-100 (slider)
  density?: 'compact' | 'comfortable' | 'spacious';
}
```

---

## 적용

```typescript
function applyCustomization(custom: ThemeCustomization) {
  const root = document.documentElement;
  
  // 색
  if (custom.light) {
    Object.entries(custom.light).forEach(([key, value]) => {
      root.style.setProperty(`--light-${key}`, value);
    });
  }
  
  // 글꼴
  if (custom.ui_font) {
    root.style.setProperty('--font-sans', `"${custom.ui_font}", var(--font-sans-fallback)`);
  }
  
  // Density
  if (custom.density) {
    document.body.dataset.density = custom.density;
  }
  
  // ... 등등
}
```

---

## 가져오기 / 내보내기

### Export (테마 복사)

```typescript
function exportTheme(theme: ThemeCustomization): string {
  return JSON.stringify(theme, null, 2);
}

// 사용자: 클립보드에 복사
navigator.clipboard.writeText(exportTheme(currentTheme));
```

### Import (가져오기)

```typescript
function importTheme(json: string): ThemeCustomization {
  const parsed = JSON.parse(json);
  return ThemeSchema.parse(parsed);   // Zod 검증
}

// UI: 텍스트박스에 붙여넣기 → "적용"
```

### 형식

```json
{
  "preset": "custom",
  "light": {
    "accent": "#2DA4D9",
    "background": "#FFFFFF",
    "foreground": "#1A1C1F"
  },
  "dark": {
    "accent": "#339CFF",
    "background": "#181818",
    "foreground": "#F4F5F7"
  },
  "ui_font": "Pretendard Variable",
  "code_font": "D2Coding Ligature",
  "translucent_sidebar": true,
  "contrast": 70,
  "density": "comfortable"
}
```

---

## Preset 목록

```typescript
const PRESETS: Record<string, ThemeCustomization> = {
  dreampia: { /* 기본 */ },
  
  codex: {
    light: { accent: '#2563eb', background: '#FFFFFF' },
    dark: { accent: '#339CFF', background: '#181818' },
  },
  
  minimalist: {
    light: { accent: '#000000', background: '#FFFFFF' },
    dark: { accent: '#FFFFFF', background: '#000000' },
    contrast: 100,
  },
  
  high_contrast: {
    light: { accent: '#0000FF', background: '#FFFFFF', foreground: '#000000' },
    dark: { accent: '#00FFFF', background: '#000000', foreground: '#FFFFFF' },
    contrast: 100,
  },
  
  github_dark: {
    dark: { accent: '#58A6FF', background: '#0D1117' },
  },
  
  one_dark: {
    dark: { accent: '#61AFEF', background: '#282C34' },
  },
};
```

---

## Theme Marketplace (Phase 2+)

```
사용자 만든 테마 공유:
  설정 → 모양 → 테마 마켓플레이스
  
  ┌─────────────────────────────────────────┐
  │ 이번 주 인기 테마                        │
  │  Dracula            ★ 4.8  📥 1.2K     │
  │  Solarized Light    ★ 4.6  📥 800      │
  │  Tokyo Night        ★ 4.7  📥 600      │
  └─────────────────────────────────────────┘
```

---

## 검증 (자동)

```typescript
// 사용자 색이 contrast 4.5:1 이상인지
function validateContrast(theme: ThemeCustomization): Issue[] {
  const issues: Issue[] = [];
  
  const lightContrast = getContrast(theme.light?.foreground, theme.light?.background);
  if (lightContrast < 4.5) {
    issues.push({
      severity: 'warning',
      message: `라이트 테마 contrast ${lightContrast.toFixed(1)}:1 (WCAG AA 미달)`,
    });
  }
  
  return issues;
}
```

UI:
```
액센트 #FFFF00 입력 →
  ⚠ 흰색 배경에서 contrast 1.07:1 (가독성 매우 낮음)
  [무시하고 적용] [수정]
```

---

## 관련

- [../../ux/patterns/F-034-settings.md](../../ux/patterns/F-034-settings.md)
- [dark.md](./dark.md), [light.md](./light.md)
- [../a11y/contrast.md](../a11y/contrast.md)
