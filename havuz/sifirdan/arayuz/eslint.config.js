// Lint ayarı. Kurallar az ama her biri gerçek bir hata sınıfını yakalar.
// Türkçe tuzağı: düz toUpperCase()/toLowerCase() "i/ı" harflerini bozar; yerel kurallı
// toLocaleUpperCase('tr-TR') / toLocaleLowerCase('tr-TR') kullanılır.
// Genişletme: yeni bir yasak çağrı `turkishCase` dizisine eklenir; gerekçesi iletiye yazılır.
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const turkishCase = [
  {
    selector: "CallExpression[callee.property.name='toUpperCase']",
    message: "toUpperCase() Türkçede 'i' harfini bozar. toLocaleUpperCase('tr-TR') kullanın.",
  },
  {
    selector: "CallExpression[callee.property.name='toLowerCase']",
    message: "toLowerCase() Türkçede 'I' harfini bozar. toLocaleLowerCase('tr-TR') kullanın.",
  },
]

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'coverage'] },
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2024,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-syntax': ['error', ...turkishCase],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Testlerde sahte nesneler ve bilerek bozuk girdiler kullanılır; tip güvenliği kuralları gevşetilir.
    files: ['test/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
)
