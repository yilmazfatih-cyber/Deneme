/**
 * Jest ayarı (jest-expo ön ayarı). Testler test/ altında; `@uygulama/shared` kopyası shared/ klasöründen gelir.
 * `vitest` adı Jest köprüsüne yönlenir (test/support/vitestShim.ts) ki ortak test yardımcıları değişmeden çalışsın.
 * İşçi sayısı 2: makine paylaşımlı.
 */
// node:sqlite "deneysel" uyarısı test çıktısını kirletmesin (işçi süreçleri bu ortamı devralır).
if (!String(process.env.NODE_OPTIONS ?? '').includes('--disable-warning=ExperimentalWarning')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --disable-warning=ExperimentalWarning`.trim()
}

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@uygulama/shared$': '<rootDir>/shared/index.ts',
    '^@uygulama/shared/testing$': '<rootDir>/shared/testing/index.ts',
    '^vitest$': '<rootDir>/test/support/vitestShim.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/test/support/setup.ts'],
  maxWorkers: 2,
  testTimeout: 30_000,
}
