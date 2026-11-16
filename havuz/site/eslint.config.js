/**
 * Kod kuralları (ESLint). `npm run lint` ile çalışır, `npm run check` içindedir.
 * - TypeScript önerilen kurallar, Astro önerilen kurallar, erişilebilirlik (jsx-a11y katı) kuralları.
 * - Türkçe kuralı: çıplak toUpperCase()/toLowerCase() YASAK; "i → İ" hatası yapar. src/lib/text.ts içindeki
 *   upperTr/lowerTr/upperFor/lowerFor yardımcılarını kullanın.
 * Genişletme: projeye özgü yeni bir yasak gerekiyorsa `no-restricted-syntax` listesine ileti ile ekleyin.
 */
import { defineConfig } from 'eslint/config'
import astro from 'eslint-plugin-astro'
import tseslint from 'typescript-eslint'

const caseRule = {
  selector: 'CallExpression[callee.property.name=/^to(Upper|Lower)Case$/]',
  message:
    "toUpperCase()/toLowerCase() Türkçe'de yanlış sonuç verir (i → I). src/lib/text.ts içindeki upperTr/lowerTr ya da upperFor/lowerFor yardımcılarını kullanın.",
}

const localeCaseRule = {
  selector: 'CallExpression[callee.property.name=/^toLocale(Upper|Lower)Case$/][arguments.length=0]',
  message:
    'toLocaleUpperCase()/toLocaleLowerCase() dil belirtilmeden kullanılamaz; src/lib/text.ts yardımcılarını kullanın.',
}

export default defineConfig(
  {
    ignores: ['dist/', 'dist-alt/', '.astro/', 'node_modules/', 'test-results/', 'playwright-report/'],
  },
  tseslint.configs.recommended,
  astro.configs['flat/recommended'],
  astro.configs['flat/jsx-a11y-strict'],
  {
    rules: {
      'no-restricted-syntax': ['error', caseRule, localeCaseRule],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Komut satırı betikleri ekrana yazar.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
