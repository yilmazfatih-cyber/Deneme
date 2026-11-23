/**
 * `vitest` → Jest köprüsü. Ortak sözleşmenin test yardımcıları (shared/testing/conformance.ts) `vitest`ten
 * `describe/it/expect` alır; bu temel Jest kullanır. jest.config.js ve tsconfig.json `vitest` adını bu dosyaya
 * yönlendirir; böylece kopya DEĞİŞTİRİLMEDEN çalışır.
 *
 * Genişletme: shared/testing yeni bir vitest işlevi kullanırsa (ör. `beforeEach`) buraya ekleyin.
 */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test } from '@jest/globals'
