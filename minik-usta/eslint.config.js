import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer rules: docs/TECH_DESIGN.md §1.3.
// Flat config replaces (does not merge) the options of a rule when several blocks match the same file, so every
// layer block below repeats the shared patterns it still needs (debug/harness, extension rule).

/** R-20: debug panel and harness hooks are only loaded via an import.meta.env guarded dynamic import in main.ts. */
const DEBUG_HARNESS = {
  regex: '(^|/)(debug|harness)(/|\\.|$)',
  message: 'load debug/harness only via import.meta.env guarded dynamic import in main.ts',
};
/** TECH §12.1: code reachable from Node tools uses explicit `.ts` extensions in relative imports (type stripping). */
const TS_EXTENSION = {
  regex: '^\\.{1,2}/(?!.*\\.(ts|json)$)',
  message: 'relative imports need an explicit .ts extension (Node type stripping, TECH_DESIGN §12.1)',
};
const NO_PHASER = (message) => ({ name: 'phaser', message });
const NO_UPWARD = { regex: '(^|/)(scenes|ui)(/|\\.|$)', message: 'no upward imports' };

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'artifacts', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Browser code: no Node APIs, no static debug/harness imports.
    files: ['src/**/*.ts'],
    ignores: ['src/main.ts', 'src/debug/**', 'src/harness/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [DEBUG_HARNESS, { regex: '^node:', message: 'browser code: no Node APIs' }] },
      ],
    },
  },
  {
    // core is pure and deterministic: only zod/mini from outside.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            NO_PHASER('core is pure: no Phaser'),
            { name: 'zod', message: 'core uses zod/mini (bundle size, see TECH_DESIGN §8)' },
          ],
          patterns: [
            { regex: '^node:', message: 'core is pure: no Node APIs' },
            {
              regex: '(^|/)(scenes|ui|meta|services|theme|i18n|tools|debug|harness|config)(/|\\.|$)',
              message: 'core must not import outer layers',
            },
            TS_EXTENSION,
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'performance',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
        'fetch',
        'process',
        'console',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'use core/rng (seeded)' },
        { object: 'Date', property: 'now', message: 'core has no clock' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'core has no clock' },
        { selector: 'TSEnumDeclaration', message: 'erasable syntax only (Node type stripping)' },
      ],
    },
  },
  {
    files: ['src/meta/**/*.ts', 'src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [NO_PHASER('meta/services are engine-free')],
          patterns: [NO_UPWARD, DEBUG_HARNESS, { regex: '^node:', message: 'browser code: no Node APIs' }],
        },
      ],
    },
  },
  {
    // R-14, BUSINESS E8: the bot simulation must not see purchases, economy or save data.
    files: ['src/services/events/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [NO_PHASER('engine-free')],
          patterns: [
            {
              regex: '(^|/)(meta/economy|services/(save|iap|ads|analytics))(/|\\.|$)',
              message: 'bot sim must be independent of purchases/economy/save (E8)',
            },
            {
              regex: '(^|/)(save|iap|ads|analytics)(/|\\.|$)',
              message: 'bot sim must be independent of purchases/economy/save (E8)',
            },
            NO_UPWARD,
            DEBUG_HARNESS,
            { regex: '^node:', message: 'browser code: no Node APIs' },
          ],
        },
      ],
    },
  },
  {
    files: ['tools/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [NO_PHASER('tools run in Node')],
          patterns: [
            { regex: '(^|/)(scenes|ui)(/|\\.|$)', message: 'tools may import core and theme/draw only' },
            TS_EXTENSION,
          ],
        },
      ],
    },
  },
);
