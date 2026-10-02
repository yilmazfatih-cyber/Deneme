# ADR-001 — Teknoloji seçimi

Durum: Kabul edildi · 2 Ekim 2026

## Bağlam

Uygulama telefondan bağlantıyla açılmalı, ana ekrana eklenebilmeli, ilk açılıştan sonra internetsiz çalışmalı,
veriyi telefonda tutmalı ve mağaza onayı gerektirmemeli. Ajanlar her ekranı telefon boyutunda açıp ekran görüntüsü
alabilmeli.

## Karar

TypeScript (strict) + React + Vite ile kurulan bir PWA.

| Katman             | Seçim                                                                        | Not                                                                                   |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Arayüz             | React 19 + Vite 8                                                            | `npm create vite@latest` (react-ts) ile kuruldu                                       |
| Çevrimdışı/kurulum | vite-plugin-pwa (Workbox, generateSW)                                        | Semboller, yazı tipi ve tüm kod önbellekte                                            |
| Gezinme            | React Router 7, **HashRouter**                                               | Her statik barındırmada yenilemede 404 olmaz (GitHub Pages dahil)                     |
| Yerel veri         | IndexedDB + Dexie 4 (`dexie-react-hooks`)                                    | Fotoğraf ve ses Blob olarak                                                           |
| Durum              | Zustand 5                                                                    | Cümle şeridi ve bildirim                                                              |
| İçerik doğrulama   | Zod 4                                                                        | Yalnız derleme öncesi (`scripts/validate-content.ts`); çalışma zamanı paketine girmez |
| Yedek              | fflate                                                                       | Tek `.zip`, fotoğraf ve sesler dahil                                                  |
| Sesli okuma        | Hazır ses dosyası → Web Speech API                                           | Kişisel kayıt her zaman önce                                                          |
| Ses kaydı          | MediaRecorder                                                                | İzin ihtiyaç anında                                                                   |
| Test               | Vitest + Testing Library + fake-indexeddb; Playwright + @axe-core/playwright | 390×844 ve 360×800                                                                    |
| Kalite             | ESLint (typescript-eslint, react-hooks), Prettier, `tsc -b`                  | `npm run check`                                                                       |
| Yazı tipi          | Atkinson Hyperlegible Next (@fontsource)                                     | latin + latin-ext: Türkçe karakterler tam                                             |

**Sürümler** dokümana sabitlenmez; yükseltmeler yeni bir ADR ile yapılır. Not: TypeScript 7 (Go sürümü) çıkmış olsa da
typescript-eslint henüz desteklemediği için `~6.0` kullanılıyor.

## Sonuçlar

- Sunucu yok; KVKK açısından sağlık verisi cihazdan çıkmaz.
- Mikrofon ve service worker HTTPS ister: yerelde `npm run dev:https` (@vitejs/plugin-basic-ssl).
- İleride mağaza gerekirse aynı web kodu Capacitor ile paketlenebilir.
- Reddedilenler: SvelteKit (yedek), Next.js (sunucusuz uygulama için ağır), Flutter Web (tuval çizimi, ekran okuyucu zayıf).
