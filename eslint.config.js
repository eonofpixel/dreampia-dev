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
    // Playwright fixtures use `({}, use) => …` (empty destructure declares
    // no fixture deps) and a `use` callback that name-collides with React's
    // `use()` hook. Both are false positives in e2e/.
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'no-empty-pattern': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
