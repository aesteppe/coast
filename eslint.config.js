/**
 * Minimal lint setup: the recommended rule set plus the small number of
 * globals this codebase actually uses. No style rules; CONTRIBUTING.md's
 * "read the neighbors" convention still governs formatting.
 */
import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  requestAnimationFrame: 'readonly',
  console: 'readonly',
  L: 'readonly',       /* Leaflet, loaded as a classic script */
  Chart: 'readonly'    /* Chart.js, loaded as a classic script */
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  globalThis: 'writable',
  fetch: 'readonly',
  URL: 'readonly'
};

export default [
  { ignores: ['node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  {
    files: ['test/**/*.js', 'e2e/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      /* e2e specs pass callbacks into page.evaluate, which run in the browser */
      globals: { ...nodeGlobals, document: 'readonly', window: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  }
];
