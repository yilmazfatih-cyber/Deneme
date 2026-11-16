---
baslik: Web performansı
ozet: Telefonda hızlı açılan ve hızlı tepki veren arayüz için temel web ölçümleri, paket boyutu ve kod bölme, görsel ve yazı tipi, kritik yol, uzun görevler, ölçme ve performans bütçesi.
etiketler: [performans, web-vitals, paket-boyutu, gorsel, onyuz, mobil]
duzey: orta
guncellik: 2026-11
---

# Web performansı

> Bu notu ne zaman okumalı: uygulama telefonda yavaş açılıyorsa, dokununca geç tepki veriyorsa, sayfa yüklenirken
> içerik zıplıyorsa; yeni bir kütüphane, büyük görsel ya da web yazı tipi eklemeden önce.

## Temel fikir

Performans, kullanıcının **hissettiği** üç şeydir: ana içerik ne zaman göründü (LCP), dokununca ekran ne çabuk
değişti (INP), sayfa yüklenirken içerik zıpladı mı (CLS). Geliştiricinin dizüstü bilgisayarı değil, **orta-alt düzey
bir Android telefon** ölçüttür: işlemcisi birkaç kat yavaştır ve JavaScript'in indirilmesi kadar ayrıştırılıp
çalıştırılması da zaman alır.

PWA'da iki ayrı açılış vardır: ilk ziyaret (her şey ağdan) ve sonraki açılışlar (servis çalışanı önbelleğinden).
Önbellek ağ süresini siler ama **ayrıştırma ve çalıştırma maliyetini silmez**; büyük paket önbellekten de yavaş açılır.

Kural: önce ölçün, en büyük kalemi düzeltin, yeniden ölçün. Tahminle optimizasyon zamanı yanlış yere harcar.

## Temel web ölçümleri

| Ölçüm | Ne ölçer                                           | İyi (75. yüzdelik) | Neyle bozulur                                                | Nasıl düzelir                                             |
| ----- | -------------------------------------------------- | ------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| LCP   | En büyük içerik öğesinin (görsel, başlık) çizimi   | ≤ 2,5 sn           | Büyük JS paketi, ağır ana görsel, tembel yüklenen ana görsel, yavaş sunucu | Paketi küçült, ana görsele öncelik, önbellek    |
| INP   | Dokunma/tıklama → sonraki çizim arası (en kötüler) | ≤ 200 ms           | Uzun görevler, her tuşta pahalı render, büyük DOM            | Görevi böl, render'ı ertele, listeyi sanallaştır          |
| CLS   | Beklenmeyen düzen kaymalarının toplamı             | ≤ 0,1              | Boyutsuz görsel, geç gelen yazı tipi, üste eklenen bildirim  | Yer ayır (`width`/`height`, `aspect-ratio`), alta ekle    |

Eşikler 2024'ten bu yana bu değerlerdedir (Kasım 2026'da yeniden doğrulanmadı). Yardımcı ölçümler: TTFB (sunucu
yanıtı), FCP (ilk içerik). Durağan barındırılan PWA'da TTFB genellikle sorun değildir; asıl yük JavaScript'tir.

## Paket boyutu ve kod bölme

| Durum                                                   | Yöntem                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Açılışta görünmeyen sayfalar (ayarlar, yönetim)         | Rota düzeyinde `lazy(() => import(...))` + `Suspense`               |
| Seyrek kullanılan ağır kütüphane (grafik, PDF, markdown) | Kullanılacağı an `await import(...)`                               |
| Tarih/sayı biçimleme kütüphanesi                        | `Intl` (yerleşik, 0 KB)                                             |
| Simge kütüphanesi                                       | Adlı içe aktarma (`import { X } from 'lucide-react'`), tamamı değil |
| "Her şeyi dışa aktaran" toplu dosya (barrel)            | Ağaç sallama (tree shaking) bozulursa doğrudan dosyadan içe aktarın |
| Satır içi büyük base64 görsel/veri                      | Ayrı dosya (`public/` ya da içe aktarılan varlık)                   |

```tsx
// Gösterim: rota düzeyinde bölme. lazy varsayılan dışa aktarım ister; adlı dışa aktarımı böyle sarın.
const SettingsPage = lazy(() => import('./features/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })))

<Suspense fallback={<PageSkeleton />}>
  <SettingsPage />
</Suspense>
```

Çevrimdışı PWA'da bölünen parçalar da önbelleğe alınmalıdır (servis çalışanının `globPatterns`'ı `js` dosyalarını
kapsar); yoksa çevrimdışıyken ilk kez açılan sayfa yüklenmez. Yayından sonra eski sürümün silinmiş parçasını isteyen
açık sekme "Failed to fetch dynamically imported module" hatası alır: [Vite ve derleme](vite-ve-derleme.md).

Derleme çıktısı her dosyanın ham ve sıkıştırılmış (gzip) boyutunu yazar; ilk okunacak yer orasıdır. Paket büyüdüyse
son eklenen bağımlılığa bakın.

## Görseller

```js calistir
import assert from 'node:assert/strict'

// Çözülmüş (decode) görsel, dosya boyutuna değil PİKSEL sayısına göre bellek yer: genişlik × yükseklik × 4 bayt.
const decodedMB = (w, h) => (w * h * 4) / 1024 / 1024
assert.equal(Math.round(decodedMB(4000, 3000)), 46) // 12 MP fotoğraf: dosya 3 MB olsa da bellekte ~46 MB
assert.equal(Math.round(decodedMB(1080, 720)), 3) // 360 px'lik yuvaya (3x ekran) yeten boyut

// srcset adayları: yuva genişliği × piksel yoğunluğu kadar ya da hemen üstü yeter (tarayıcılar yaklaşık böyle seçer).
function pickCandidate(widths, slotCssPx, dpr) {
  return widths.toSorted((a, b) => a - b).find((w) => w >= slotCssPx * dpr) ?? Math.max(...widths)
}
assert.equal(pickCandidate([480, 800, 1200, 1600], 360, 2), 800)
assert.equal(pickCandidate([480, 800, 1200, 1600], 360, 3), 1200)
assert.equal(pickCandidate([480, 800, 1200, 1600], 1200, 2), 1600)
console.log('tamam')
```

```cikti
tamam
```

| Kural                                                       | Neden                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| Her `<img>`'de `width` + `height` (ya da `aspect-ratio`)    | Tarayıcı yer ayırır; CLS olmaz                            |
| Ana (LCP) görselde `loading="lazy"` **yok**, `fetchpriority="high"` var | Tembel yükleme ana görseli geciktirir         |
| Ekran dışındaki görsellerde `loading="lazy"`                | Gereksiz indirme yok                                      |
| Fotoğraf için AVIF/WebP (`<picture>` ile yedek), simge/logo için SVG | Aynı kalitede daha küçük                         |
| `srcset` + `sizes` ile birkaç genişlik                      | Telefon masaüstü görselini indirmesin                     |
| Kullanıcının çektiği fotoğrafı **saklamadan önce** küçültün | 12 MP fotoğraf IndexedDB'yi ve belleği doldurur           |

Son satır kişisel fotoğraf saklayan uygulamalar (Köprü) için önemlidir: fotoğrafı `createImageBitmap` + `<canvas>`
ile uzun kenarı ~1024–1600 px olacak şekilde küçültüp WebP/JPEG olarak saklayın; özgün dosyayı saklamayın.

## Yazı tipleri

- Sistem yazı tipi yığını sıfır maliyettir (havuzdaki uygulama temeli böyle). Web yazı tipi gerçekten gerekiyorsa:
  WOFF2, en çok 2 ağırlık, kendi sunucunuzdan (çevrimdışı çalışır; üçüncü taraf yazı tipi sunucusu kullanıcının IP
  adresini görür).
- `font-display: swap` (metin hemen görünür, yazı tipi gelince değişir) ya da `optional` (yavaş ağda hiç değişmez,
  kayma olmaz). Kritik bir-iki dosyayı `<link rel="preload" as="font" crossorigin>` ile önceden isteyin.
- **Türkçe tuzağı:** "latin" alt kümesine (subset) indirilmiş yazı tipi ğ, ş, İ gibi harfleri içermeyebilir; o
  harfler yedek yazı tipiyle çizilir ve sözcüğün ortasında yazı tipi değişir. `unicode-range`'i denetleyin:

```js calistir
import assert from 'node:assert/strict'

function parseRange(range) {
  return range.split(',').map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, '').split('-').map((hex) => parseInt(hex, 16))
    return [start, end ?? start]
  })
}
// Metindeki hangi karakterler @font-face unicode-range'in DIŞINDA?
function uncovered(text, range) {
  const ranges = parseRange(range)
  const missing = new Set()
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (!ranges.some(([a, b]) => cp >= a && cp <= b)) missing.add(ch)
  }
  return [...missing].join('')
}

const sample = 'Çığ gibi İŞ: öğün, şükür, Üsküdar, Iğdır, Ağrı, Şişli'
assert.equal(uncovered(sample, 'U+0000-00FF'), 'ığİŞş') // Latin-1: ç ö ü var; ı ğ İ Ş ş yok
assert.equal(uncovered(sample, 'U+0000-00FF, U+0131'), 'ğİŞş') // yalnız ı eklemek yetmez
assert.equal(uncovered(sample, 'U+0000-00FF, U+0100-017F'), '') // + Latin Extended-A: tamam
console.log('tamam')
```

Kendi alt kümenizi üretiyorsanız Latin Extended-A (U+0100–017F) aralığını ekleyin; hazır servis kullanıyorsanız
"latin-ext" alt kümesinin de yüklendiğini ağ sekmesinde görün.

## Kritik işleme yolu

- CSS çizimi engeller: ilk ekranın CSS'i küçük olsun; `@import` zinciri kurmayın.
- `<script type="module">` ertelenmiş çalışır; `<head>`'de eşzamanlı (sync) betik koymayın. Tek istisna: tema
  sınıfını boyamadan önce yazan birkaç satırlık satır içi betik (koyu temada beyaz parlamayı önler).
- API başka kökendeyse `<link rel="preconnect" href="https://api…">`.
- Açılışta yapılan işleri sıralayın: kabuğu çiz → yerel veriyi oku → ağ işleri. Açılışta ağı bekleyen PWA
  çevrimdışında da yavaş açılır.

## Uzun görevler

Ana iş parçacığında 50 ms'yi aşan her iş bir **uzun görevdir**; o sürede dokunuşlar işlenmez ve INP bozulur.

```js calistir
import assert from 'node:assert/strict'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'

function work(i) { let x = 0; for (let k = 0; k < 2000; k++) x += (i * k) % 7; return x }

// YANLIŞ: tek uzun görev — arada gelen "dokunma" ancak iş bitince işlenir
function blocking(items, log) { for (const i of items) work(i); log.push('iş bitti') }
// DOĞRU: parçalara böl, aralarda olay döngüsüne söz ver (tarayıcıda scheduler.yield() ya da setTimeout)
async function chunked(items, log, size = 500) {
  for (let start = 0; start < items.length; start += size) {
    for (const i of items.slice(start, start + size)) work(i)
    await yieldToEventLoop()
  }
  log.push('iş bitti')
}

const items = Array.from({ length: 5000 }, (_, i) => i)
const log1 = []
setTimeout(() => log1.push('dokunma işlendi'), 0)
blocking(items, log1)
await new Promise((resolve) => setTimeout(resolve, 5))
assert.deepEqual(log1, ['iş bitti', 'dokunma işlendi'])

const log2 = []
const done = chunked(items, log2)
setTimeout(() => log2.push('dokunma işlendi'), 0)
await done
assert.deepEqual(log2, ['dokunma işlendi', 'iş bitti'])
console.log('tamam')
```

| Uzun görevin kaynağı                              | Çözüm                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Büyük veriyi tek döngüde işlemek (arama dizini, içe aktarma) | Parçalara bölün; çok ağırsa Web Worker                  |
| Her tuşta binlerce satırlık listeyi render etmek  | `useDeferredValue` / `startTransition`; listeyi sanallaştırın     |
| Yüzlerce satırlık liste, her satır ağır           | Sanallaştırma (yalnız görünen satırlar) ya da sayfalama           |
| Görsel işleme (küçültme, sıkıştırma)              | `createImageBitmap` + OffscreenCanvas ile Worker'da               |
| Açılışta büyük JSON ayrıştırma                    | Veriyi böl; gerekeni oku; IndexedDB'den parça parça               |

`scheduler.yield()` her tarayıcıda yoktur; `if ('scheduler' in globalThis && 'yield' in scheduler)` ile algılayıp
yoksa `setTimeout(0)`'a düşün.

## Ölçme: laboratuvar ↔ saha

| Ölçüm türü                          | Araç                                                      | Güçlü yanı                     | Zayıf yanı                                  |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| Laboratuvar (lab)                   | DevTools Performance (CPU 4–6x yavaşlatma), Lighthouse     | Tekrarlanabilir, nedeni gösterir | Gerçek kullanıcıyı temsil etmez; INP ölçemez (etkileşim yok) |
| Gerçek cihaz                        | Android telefon + USB ile uzaktan hata ayıklama           | Gerçek işlemci ve bellek       | Elle, yavaş                                  |
| Saha (field / RUM)                  | `web-vitals` kütüphanesiyle kendi sunucunuza ölçüm        | Gerçek kullanıcı dağılımı      | Sunucu gerekir; kişisel veri göndermeyin    |

Sunucusu olmayan yerel-önce uygulamada saha verisi olmayabilir; o zaman ölçüt: gizli pencerede, CPU yavaşlatmalı,
"yavaş 4G" ağ ayarlı Lighthouse + gerçek orta-alt düzey telefonda elle deneme. Her ölçümü aynı ayarla, en az 3 kez
yapıp ortancasını yazın; tek ölçüm gürültüdür.

## Performans bütçesi

Bütçe, aşılınca derlemeyi kıran sınırdır: "ilk yüklemedeki JS (gzip) ≤ 170 KB", "CSS ≤ 30 KB", "LCP (lab, yavaşlatmalı)
≤ 2,5 sn". Rakamlar ürüne göre seçilir; önemli olan **otomatik denetlenmesidir**:

```js calistir
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'

const budgetKb = { js: 170, css: 30 }
function overBudget(files) {
  const totals = { js: 0, css: 0 }
  for (const file of files) totals[file.kind] += gzipSync(file.content).length / 1024
  return Object.entries(totals).filter(([kind, kb]) => kb > budgetKb[kind]).map(([kind]) => kind)
}

let s = 42
const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0 }
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const code = 'export function f(x){return x+1}\n'.repeat(20000) // ~645 KB ham, çok tekrarlı
const inlinedPhoto = Array.from({ length: 300_000 }, () => alphabet[rand() % 64]).join('') // satır içi base64 görsel

const kb = (text) => gzipSync(text).length / 1024
assert.ok(kb(code) < 5) // tekrarlı kod çok iyi sıkışır: ham boyuta bakmak yanıltır
assert.ok(kb(inlinedPhoto) > 200) // base64 neredeyse hiç sıkışmaz (~293 KB → ~221 KB)
assert.deepEqual(overBudget([{ kind: 'js', content: code }, { kind: 'css', content: 'a{b:c}' }]), [])
assert.deepEqual(overBudget([{ kind: 'js', content: code + inlinedPhoto }]), ['js'])
console.log('tamam')
```

Havuzdaki site temeli üç kalemli (HTML, CSS, başlangıç betiği) bütçeyi her derlemede denetler:
[`budget.ts`](../../site/scripts/audit/budget.ts); gerekçesi aynı temeldeki yazıda:
[`hizli-site-icin-uc-butce.md`](../../site/src/content/blog/tr/hizli-site-icin-uc-butce.md).

## Tuzaklar

| Belirti                                                   | Neden                                                     | Çözüm                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Dizüstünde hızlı, telefonda yavaş                         | Ölçüm güçlü makinede yapılmış                             | CPU yavaşlatma + gerçek telefon                         |
| Önbellekten açılış da yavaş                               | Ayrıştırma/çalıştırma maliyeti; paket büyük               | Kod bölme, ağır kütüphaneyi tembel yükleme              |
| Ana görsel geç geliyor                                    | Ana görselde `loading="lazy"` ya da düşük öncelik         | `fetchpriority="high"`, tembel yükleme yok              |
| İçerik yüklenirken aşağı itiliyor                         | Boyutsuz görsel, üste eklenen şerit, yazı tipi değişimi   | Yer ayırın; şeridi yer tutucuyla; `font-display` ayarı  |
| Arama kutusunda yazmak takılıyor                          | Her tuşta büyük liste render                              | `useDeferredValue`, sanallaştırma, bekletme (debounce)  |
| Uygulama bir süre sonra çöküyor/yeniden yükleniyor        | Büyük görseller bellekte; sızıntı                         | Görseli küçültün; nesne URL'lerini `revokeObjectURL`    |
| Paket bir anda 300 KB büyüdü                              | Yeni bağımlılığın tamamı geldi (tarih, simge, yardımcı)   | Derleme çıktısına bakın; adlı içe aktarma ya da `Intl`  |
| Türkçe sözcüklerin ortasında yazı tipi değişiyor          | Yazı tipi alt kümesinde ğ, ş, İ yok                       | Latin Extended-A'yı ekleyin                             |
| Lighthouse puanı her seferinde farklı                     | Tek ölçüm, arka plan yükü                                 | 3+ ölçümün ortancası, gizli pencere                     |

## Denetim listesi

- [ ] Derleme çıktısında ilk yüklemedeki JS ve CSS'in gzip boyutu bütçenin altında; bütçe CI'da denetleniyor.
- [ ] Açılışta görünmeyen sayfalar ve ağır kütüphaneler ayrı parçada.
- [ ] Bütün görsellerde boyut var; ana görsel tembel değil; kullanıcı fotoğrafları saklanmadan önce küçültülüyor.
- [ ] Web yazı tipi varsa WOFF2, kendi sunucusundan, Türkçe harfleri kapsıyor, `font-display` ayarlı.
- [ ] CPU 4x yavaşlatmalı ölçümde 50 ms'yi aşan tekrarlayan görev yok; yazarken takılma yok.
- [ ] Orta-alt düzey bir Android telefonda ilk ve ikinci açılış süresi ölçülüp yazıldı (nasıl ölçüldüğüyle).
- [ ] Ölçümler 3+ kez, aynı ayarla yapıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni bağımlılık ekleme; önce yerleşik çözüm (`Intl`, `URL`, `structuredClone`) var mı bak. Ağır
  ekranı `lazy` ile böl. Her `<img>`'e `width`/`height` ver; ana görsel tembel olmasın. Değişiklikten önce ve sonra
  `npm run build` çıktısındaki boyutları yaz."
- **Modelin tipik hatası:** Küçük iş için büyük kütüphane ekler (tarih için moment, tek işlev için lodash'in
  tamamı); her şeye `useMemo` serpip asıl sorunu (büyük liste) çözmez; bütün görsellere `loading="lazy"` koyar.
- **Çıktıda arayın:** `package.json`'daki yeni bağımlılıklar; `import * as`; boyutsuz `<img>`; satır içi
  `data:image` dizgileri; render içinde büyük dizilerde `filter/map/sort` zincirleri.
- **Ölçüm isteyin:** "Önce/sonra derleme boyutunu ve DevTools'ta CPU yavaşlatmalı etkileşim süresini yaz." Ölçüm
  yoksa iyileşme iddiasını kabul etmeyin.

## İlgili

- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — önbellekten açılış
- [Vite ve derleme](vite-ve-derleme.md) — derleme çıktısını okuma, parça hataları
- [Animasyon ve etkileşim](animasyon-ve-etkilesim.md) — hangi özellikler ucuz canlandırılır
- [React etkileri ve kancalar](react-etkiler-ve-kancalar.md) — gereksiz `useMemo`
- Başka kümelerde: [Performans yöntemi](../00-yontem/performans-yontemi.md) (önce ölç, tek değişiklik, yeniden ölç)
