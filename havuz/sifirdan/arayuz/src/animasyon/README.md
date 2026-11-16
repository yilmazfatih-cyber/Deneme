# animasyon — hareket kütüphanesi

## Ne yapar

Arayüz hareketinin yapı taşları: yumuşatma eğrileri (CSS `cubic-bezier` dahil), **yay fiziği** (kapalı
formül), ara değerleme (sayı, **algısal uzayda renk**, birimli dizgi, dönüşüm, dizi/nesne), zaman çizelgesi
ve kademeleme, tek paylaşılan `requestAnimationFrame` zamanlayıcısı (testte elle ilerletilen saat), FLIP
düzen geçişi ve `prefers-reduced-motion` saygısı.

```ts
import { tween, springAnimation, timeline, flip, cubic } from './index.ts'

tween({
  from: '#0969da',
  to: '#bf3989',
  duration: 400,
  easing: cubic.out,
  onUpdate: (c) => (kutu.style.background = c),
})
const yay = springAnimation({ from: 0, to: 300, onUpdate: (x) => (top.style.transform = `translateX(${x}px)`) })
yay.retarget(120) // hız korunarak yeni hedefe
flip([...liste.children] as HTMLElement[], () => liste.append(liste.firstElementChild!))
```

## Nasıl çalışır

**Yumuşatma (`easing.ts`).** Eğri, zamanı (0..1) ilerlemeye (0..1) çevirir. `in/out/inOut` aileleri tek bir
"in" eğrisinden türetilir. `cubicBezier(x1, y1, x2, y2)`: Bezier'in x(s) = t denklemi önce Newton-Raphson
ile, yakınsamazsa ikiye bölmeyle çözülür, sonra y(s) okunur (tarayıcıların yöntemi). Test: `ease` eğrisi
bağımsız bir ikiye bölme çözümüyle 6 basamak örtüşür.

**Yay (`spring.ts`).** Sönümlü harmonik salınıcı `m·x'' + c·x' + k·x = 0`; süre yoktur, hareket durulunca
biter. Konum her karede **kapalı formülden** okunur (kare hızından bağımsız, kesin):

| Sönüm oranı ζ = c / (2√(k·m)) | Davranış             | Formül                                           |
| ----------------------------- | -------------------- | ------------------------------------------------ |
| ζ < 1                         | salınır, hedefi aşar | e^(−ζω0t)·(x0·cos ωd t + (v0+ζω0x0)/ωd·sin ωd t) |
| ζ = 1                         | aşmadan en hızlı     | e^(−ω0t)·(x0 + (v0 + ω0x0)·t)                    |
| ζ > 1                         | ağır, yavaş yaklaşır | C1·e^(r1t) + C2·e^(r2t)                          |

Doğrulama: üç rejimin her biri dördüncü derece Runge-Kutta sayısal tümleviyle (dt = 0,5 ms) karşılaştırılır;
konum 6, hız 5 basamak örtüşür. `retarget` o anki hızı koruyarak yeni hedefe yeni bir yay başlatır.

**Renk (`color.ts`).** sRGB'de düz karıştırma ortada koyu/bulanık renk verir (mavi→sarı geçişi griye düşer).
Bu yüzden karıştırma **OKLab**'da yapılır: sRGB → doğrusal ışık → LMS → küp kök → OKLab; sonra geri.
Test: siyah–beyaz ortası `rgb(99, 99, 99)` (algısal orta gri); mavi–sarı ortası sRGB karışımından daha açık;
kırmızının OKLab değeri başvuru değerine (0,628 / 0,2249 / 0,1258) eşit.

**Ara değerleme (`interpolate.ts`).** Türe göre seçilir: sayı, renk, sayı içeren dizgi (`"10px 20px"` →
kalıp aynı, sayılar değişir), dizi, nesne. `toTransform({ x, y, scale, rotate })` CSS dönüşümü üretir.

**Oynatma (`player.ts`, `tween.ts`, `timeline.ts`).** Süreli her animasyon `Player`'dan türer: oynat,
duraklat, konuma git, ters çevir, iptal, `finished` sözü (bitince `true`, iptalde `false`). Zaman çizelgesinde
konum: sayı (mutlak), `'>'` (öncekinden sonra), `'<'` (öncekiyle birlikte), `'+=100'`/`'-=100'`. Geri sarmada
doğru durum için önce henüz başlamamış çocuklar başlangıç durumuna, sonra başlamışlar sırayla çizilir.

**Zamanlayıcı (`ticker.ts`).** Tüm animasyonlar tek bir rAF döngüsünü paylaşır; çalışan animasyon yokken
kare istenmez. Saat dışarıdan verilir: testlerde `ManualClock.advance(ms)` ile "100 ms sonra değer 50" kesin
sınanır. Node'da rAF yoksa ~60 Hz `setTimeout` kullanılır.

**FLIP (`flip.ts`).** İlk konumu ölç → DOM'u değiştir → son konumu ölç → farkı `transform` ile geri al →
dönüşümü sıfıra oynat. Düzen hesabı yalnız iki kez yapılır, animasyon yalnız `transform`'la yürür.

**Hareket azaltma (`motion.ts`).** Sistem "hareketi azalt" diyorsa (ya da uygulama `setMotionPreference
('reduce')` derse) ara değerleme ve yay anında son durumuna atlar, FLIP yalnız değişikliği yapar.

## Dosya haritası

| Dosya            | Sorumluluk                                          |
| ---------------- | --------------------------------------------------- |
| `easing.ts`      | Eğri aileleri, cubic-bezier, steps, ad tablosu      |
| `spring.ts`      | Kapalı formül yay, durulma, RK4 karşılaştırma adımı |
| `color.ts`       | Renk ayrıştırma/biçimleme, sRGB ↔ OKLab, karıştırma |
| `interpolate.ts` | Türe göre ara değerleyici, birimli dizgi, dönüşüm   |
| `ticker.ts`      | Paylaşılan kare döngüsü, el saati, sistem saati     |
| `player.ts`      | Oynat/duraklat/git/ters/iptal, `finished`           |
| `tween.ts`       | Süreli ara değerleme, yay animasyonu (`retarget`)   |
| `timeline.ts`    | Zaman çizelgesi, konum kuralları, kademeleme        |
| `flip.ts`        | FLIP düzen geçişi                                   |
| `motion.ts`      | Hareket azaltma tercihi                             |

## Sınırlar

- Tekrar (repeat/yoyo), oynatma hızı, etiketli konumlar ve yol (SVG path) biçim geçişi yoktur.
- Renk ayrıştırma `#…` ve `rgb()` ile sınırlıdır (`hsl()`, adlı renkler yok); geniş gamut (P3) yoktur.
- FLIP ölçeklenen öğenin içeriğini de ölçekler (basıklık); ters ölçek uygulanmaz.
- Web Animations API kullanılmaz; her kare JS ile stil yazılır (çok sayıda öğede ölçülmedi).

## Buradan nereye

- Tekrar/yoyo: `Player.tick`'te bitişte yönü çevirip sayaç azaltmak.
- Sürükle-bırak fırlatma: işaretçi hızını ölçüp `springAnimation({ velocity })` ile bırakmak.
- OKLCH ile ton yayı boyunca geçiş (`color.ts`'e `toOklch`).
- `sinyal` köprüsü: animasyonun değerini bir sinyale yazıp ince taneli çizim.
