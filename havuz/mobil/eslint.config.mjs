// Lint ayarı. Kurallar az ama anlamlıdır: her biri gerçek bir hata sınıfını yakalar.
// shared/ denetlenmez: havuz/uygulama'dan birebir kopyadır, orada denetlenir (bkz. test/rules/shared-copy.test.ts).
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Türkçe tuzağı: düz toUpperCase()/toLowerCase() "i/ı" harflerini bozar. shared/text.ts → upperTr / lowerTr.
// Alert.alert web derlemesinde düğmesiz çalışır: ui/Confirm.tsx → useConfirm kullanılır.
const restricted = [
  {
    selector: "CallExpression[callee.property.name='toUpperCase']",
    message: "toUpperCase() Türkçede 'i' harfini bozar. upperTr() kullanın (@uygulama/shared).",
  },
  {
    selector: "CallExpression[callee.property.name='toLowerCase']",
    message: "toLowerCase() Türkçede 'I' harfini bozar. lowerTr() ya da foldTr() kullanın (@uygulama/shared).",
  },
  {
    selector: "CallExpression[callee.object.name='Alert'][callee.property.name='alert']",
    message: 'Alert.alert web derlemesinde çalışmaz. useConfirm() ya da useToast() kullanın (src/ui).',
  },
]

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      '.expo',
      'shared',
      'coverage',
      'playwright-report',
      'test-results',
      'android',
      'ios',
      '*.config.js',
      'expo-env.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-syntax': ['error', ...restricted],
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
    // React kancaları kuralları (React Compiler kuralları dahil: render sırasında yan etki, ref okuma vb.).
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Testlerde tip güvenliği kuralları gevşetilir: sahte nesneler ve bilerek bozuk girdiler kullanılır.
    files: ['test/**/*.{ts,tsx}', 'e2e/**/*.ts', 'scripts/**/*.ts'],
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
