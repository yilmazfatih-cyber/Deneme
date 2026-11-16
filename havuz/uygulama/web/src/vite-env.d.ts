/**
 * Derleme zamanı tanımları: Vite ortam değişkenleri ve `vite.config.ts → define` ile gelen sabitler.
 * Genişletme: yeni bir `VITE_…` değişkeni eklerseniz buraya tipini, `lib/env.ts`'e okunuşunu yazın.
 */
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** API adresi: boş → aynı köken (`/api`), `none` → hesapsız (yalnız bu cihaz), tam adres → başka köken. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json sürümü (vite.config.ts → define). */
declare const __APP_VERSION__: string
