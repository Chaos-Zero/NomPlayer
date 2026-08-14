// Standalone eslint config for the browser extension, deliberately separate from
// the root eslint.config.js (which globally ignores this directory). Run from inside
// extension/ with `npx eslint .`.
import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.js'],
    ignores: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // WebExtension APIs, not part of eslint's `browser` globals set.
        browser: 'readonly',
        chrome: 'readonly',
      },
    },
  },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
]);
