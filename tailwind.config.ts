import type { Config } from 'tailwindcss';

/**
 * Tailwind v3 config — see .omc/DESIGN.md (v1.0).
 *
 * Strategy:
 *   - CSS variables (`--color-*`, `--radius-*`, …) live in src/renderer/index.css.
 *   - Tailwind utility classes resolve through `var(...)` so theme switch (light/dark)
 *     is a single attribute toggle on <html data-theme="...">.
 *   - Back-compat aliases (`bg.primary`, `border.primary`) kept until Stage 5 migration.
 */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],

  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {
      colors: {
        // ── Tier 1 (canonical, .omc/DESIGN.md) ─────────────────
        canvas: 'var(--color-canvas)',
        'canvas-soft': 'var(--color-canvas-soft)',
        surface: {
          card: 'var(--color-surface-card)',
          strong: 'var(--color-surface-strong)',
        },
        hairline: {
          DEFAULT: 'var(--color-hairline)',
          soft: 'var(--color-hairline-soft)',
          strong: 'var(--color-hairline-strong)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          soft: 'var(--color-accent-soft)',
        },
        semantic: {
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          danger: 'var(--color-danger)',
        },

        // ── Tier 2 (back-compat aliases — Stage 5 에서 제거 예정) ──
        bg: {
          primary: 'var(--color-canvas)',
          secondary: 'var(--color-canvas-soft)',
          tertiary: 'var(--color-surface-strong)',
          elevated: 'var(--color-surface-card)',
        },
        border: {
          primary: 'var(--color-hairline)',
          focus: 'var(--color-border-focus)',
        },
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },

      fontSize: {
        // .omc/DESIGN.md type scale — letter-spacing 은 utility 로
        'display-lg': ['36px', { lineHeight: '1.2', letterSpacing: '-0.72px', fontWeight: '600' }],
        'display-md': ['26px', { lineHeight: '1.25', letterSpacing: '-0.325px', fontWeight: '600' }],
        'display-sm': ['22px', { lineHeight: '1.3', letterSpacing: '-0.11px', fontWeight: '600' }],
        'title-md': ['18px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],
        'title-sm': ['16px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '1.625', letterSpacing: '0', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.55', letterSpacing: '0', fontWeight: '400' }],
        caption: ['13px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '400' }],
        'caption-uppercase': [
          '11px',
          { lineHeight: '1.4', letterSpacing: '0.88px', fontWeight: '600' },
        ],
        code: ['13px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        button: ['14px', { lineHeight: '1', letterSpacing: '0', fontWeight: '500' }],
        'nav-link': ['14px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],

        // 한글 base 가독성 (legacy — 기존 컴포넌트 호환)
        base: ['1rem', { lineHeight: '1.625rem' }],
      },

      borderRadius: {
        // CSS var 와 일치 — arbitrary radius 사용 금지
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },

      spacing: {
        // .omc/DESIGN.md spacing scale — semantic 별칭만 (4/8/12/16/20/24/32/48/80)
        // Tailwind default (1=4px, 2=8px, …) 는 그대로 유지 — 둘 다 사용 가능
        xxs: '4px',
        xs: '8px',
        sm: '12px',
        base: '16px',
        md: '20px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        section: '80px',
      },

      boxShadow: {
        flat: 'none',
        soft: 'var(--elev-soft)',
        card: 'var(--elev-card)',
        strong: 'var(--elev-strong)',
      },

      transitionDuration: {
        fast: 'var(--duration-fast)',
        DEFAULT: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },

      transitionTimingFunction: {
        out: 'var(--ease-out)',
        in: 'var(--ease-in)',
        inout: 'var(--ease-inout)',
      },
    },
  },

  plugins: [],
} satisfies Config;
