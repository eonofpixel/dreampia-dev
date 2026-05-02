import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],

  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {
      colors: {
        // Semantic tokens (Tier 2)
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          elevated: 'var(--color-bg-elevated)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
        },
        border: {
          primary: 'var(--color-border-primary)',
          focus: 'var(--color-border-focus)',
        },
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },

      fontSize: {
        // 한글 친화 line-height
        base: ['1rem', { lineHeight: '1.625rem' }],
      },
    },
  },

  plugins: [],
} satisfies Config;
