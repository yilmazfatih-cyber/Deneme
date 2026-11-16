# Mimari

## Katmanlar

```
                 demo/gosterimler.json  (tek kayıt)
                 │         │            │                 │
                 ▼         ▼            ▼                 ▼
          index.html   vite.config.ts   e2e/*.spec.ts   test/kurallar.test.ts
          (dizin)      (derleme girişi) (tarayıcı testi) (yapı kuralları)

  demo/<sistem>/index.html + main.ts ──içe aktarır──► src/<sistem>/index.ts ◄── test/<sistem>/*.test.ts
          │                                                │
          └─ demo/metin.ts (Türkçe dinamik metin)           └─ src/<sistem>/*.ts (yalnız kendi klasörü)
          └─ demo/ortak/stil.css (tema)
```

- **Sistemler (`src/`)** birbirinden bağımsızdır. Tek bağımlılık oku: `yonlendirici/signal_adapter.ts → sinyal`.
- **Gösterimler (`demo/`)** yalnız sistemlerin `index.ts`'inden içe aktarır; birden çok sistemi birleştirebilir.
- **Testler**: birim testleri Node'da (vitest); DOM isteyenler dosya başındaki `@vitest-environment jsdom`
  yorumuyla jsdom'da. Tarayıcı testleri derlenmiş site üzerinde (Playwright + axe).

## Hangi sistem nerede çalışır?

| Sistem        | Node               | Tarayıcı | DOM'a dokunan dosyalar                                                  |
| ------------- | ------------------ | -------- | ----------------------------------------------------------------------- |
| sinyal        | ✓                  | ✓        | —                                                                       |
| sanal_dom     | jsdom ile          | ✓        | hepsi (çatı DOM yazar)                                                  |
| yonlendirici  | ✓ (bellek geçmişi) | ✓        | `history.ts` (tarayıcı kipleri), `links.ts`, `scroll.ts`, `dom_view.ts` |
| depo          | ✓                  | ✓        | — (`localStorage`/`BroadcastChannel` bağdaştırıcıyla)                   |
| form          | ✓                  | ✓        | `dom.ts`                                                                |
| tablo         | ✓                  | ✓        | —                                                                       |
| duzenleyici   | ✓                  | ✓        | — (görünüm gösterimde: `demo/duzenleyici/view.ts`)                      |
| oyun_motoru   | ✓ (mantık)         | ✓        | `input.ts` bağlayıcıları, `sprite.ts`, `audio.ts`, `game/render.ts`     |
| isin_izleyici | ✓                  | ✓        | `worker.ts` (Web Worker girişi)                                         |
| grafik        | ✓ (SVG dizgisi)    | ✓        | `interact.ts`                                                           |
| paketleyici   | ✓ (+ `cli.ts`)     | ✓        | —                                                                       |
| animasyon     | ✓ (`ManualClock`)  | ✓        | `flip.ts`, `motion.ts` (matchMedia)                                     |

## Ortak desenler

1. **Tek giriş noktası:** her sistemin `index.ts`'i dış yüzdür; iç dosyalar değişebilir.
2. **Saat ve rastgelelik dışarıdan:** `now`, `schedule`, `Clock`, `Rng(seed)` parametreleri; testler sahte verir.
3. **Saf çekirdek + ince bağdaştırıcı:** mantık DOM'suz (Node'da test edilir), DOM/ağ/depolama ince bir
   bağdaştırıcıda (`dom.ts`, `interact.ts`, `history.ts`, `StorageLike`, `ChannelLike`).
4. **Dış veri sınırda doğrulanır:** `localStorage` kaydı (`persist.ts`), sekmeden gelen ileti (`sync.ts`), oyun
   kaydı (`parseRecording`), form girdisi (şema).
5. **Türkçe kurallar tek yerde:** büyük/küçük harf `tr-TR`; İngilizce tanımlayıcılar için ASCII dönüşümü
   (`asciiLower`, `asciiUpper`); sayı/tarih biçimi `Intl` ile `tr-TR`.

## Derleme ve denetim akışı

```
npm run check  = tsc (src+test+demo+e2e+scripts) → eslint (tip bilgili) → prettier --check → vitest (birim + kural)
npm run build  = vite build  (index.html + 12 gösterim; işçi ayrı parça)
npm run e2e    = scripts/e2e.ts: boş kapı → vite build → playwright (vite preview, 2 işçi, 2 telefon boyutu)
```
