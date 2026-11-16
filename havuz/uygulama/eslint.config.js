// Üç paketin (shared, api, web) ortak lint ayarı. Kurallar az ama anlamlıdır: her biri gerçek bir hata sınıfını yakalar.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Türkçe tuzağı: düz toUpperCase()/toLowerCase() "i/ı" harflerini bozar. shared/src/text.ts içindeki
// upperTr / lowerTr kullanılır. (İstisna gerekiyorsa satıra gerekçeli eslint-disable yorumu yazılır.)
const turkishCase = [
  {
    selector: "CallExpression[callee.property.name='toUpperCase']",
    message: "toUpperCase() Türkçede 'i' harfini bozar. upperTr() kullanın (@uygulama/shared).",
  },
  {
    selector: "CallExpression[callee.property.name='toLowerCase']",
    message: "toLowerCase() Türkçede 'I' harfini bozar. lowerTr() ya da foldTr() kullanın (@uygulama/shared).",
  },
]

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/dist-yerel',
      '**/dev-dist',
      '**/node_modules',
      '**/coverage',
      'playwright-report',
      'test-results',
      '.data',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-syntax': ['error', ...turkishCase],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Beklenmeyen söz (promise): unutulan `await` sessizce veri kaybettirir.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Web (React): kanca kuralları (React Compiler kuralları dahil: render sırasında yan etki, ref okuma vb.).
    files: ['web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Testlerde tip güvenliği kuralları gevşetilir: sahte nesneler ve bilerek bozuk girdiler kullanılır.
    files: ['**/test/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'e2e/**/*.ts', '**/src/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
