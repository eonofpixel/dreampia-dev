import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';

const sharedGlobals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  document: 'readonly',
  Electron: 'readonly',
  globalThis: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  NodeJS: 'readonly',
  process: 'readonly',
  requestAnimationFrame: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'out/**',
      'release/**',
      'docs/**',
      'captures/**',
      'playwright-report/**',
      'test-results/**',
      '.eslintrc.cjs',
      '*.config.js',
      '*.config.cjs',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: sharedGlobals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // v2.4.1 — emoji guard. UI-facing source must use Lucide icons (or
    // semantic SVG components), not emoji or symbol literals. This catches
    // re-introduction during PR review. Scoped to renderer/ only — main
    // process / IPC / tool definitions may include occasional symbols.
    //
    // Range covers:
    //   U+2600–U+27BF  : misc symbols & dingbats (⚠ ✓ ✕ ✖ ℹ ★ etc.)
    //   U+1F300–U+1FAFF: full emoji blocks (encoded as surrogate pairs)
    //
    // Decision doc: ../CODE_TAB_DECISION.md (트랙 B Phase 0d)
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['src/renderer/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/[\\u2600-\\u27BF\\uD83C-\\uDBFF\\uDC00-\\uDFFF]/]",
          message:
            'Avoid emoji/symbol literals in renderer source. Use Lucide icons (lucide-react) for UI affordances.',
        },
        {
          selector:
            "JSXText[value=/[\\u2600-\\u27BF\\uD83C-\\uDBFF\\uDC00-\\uDFFF]/]",
          message:
            'Avoid emoji/symbol in JSX text. Use Lucide icons (lucide-react).',
        },
        {
          selector:
            "TemplateElement[value.raw=/[\\u2600-\\u27BF\\uD83C-\\uDBFF\\uDC00-\\uDFFF]/]",
          message:
            'Avoid emoji/symbol in template literals returned to UI. Use Lucide icons or remove the symbol.',
        },
      ],
    },
  },
  {
    // Playwright fixtures use `({}, use) => …` (empty destructure declares
    // no fixture deps) and a `use` callback that name-collides with React's
    // `use()` hook. Both are false positives in e2e/.
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'no-empty-pattern': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    // Build-time CJS scripts (scripts/*.cjs) + v1.1.5 VCR fake CLI fixtures
    // (tests/fixtures/*.cjs) — Node CommonJS globals only. No TypeScript /
    // React rules, but enforce Node-aware global recognition.
    files: ['scripts/**/*.cjs', 'tests/fixtures/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...sharedGlobals,
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
      },
    },
  },
];
