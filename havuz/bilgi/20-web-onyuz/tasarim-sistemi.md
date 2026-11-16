---
baslik: Tasarım sistemi
ozet: Renk, boşluk, yazı ölçeği, yarıçap ve gölge belirteçleri; anlamsal renk adları; koyu tema ve yüksek karşıtlık; bileşen API tasarımı; tutarlılık kuralları ve şablon gibi durmayan arayüz için somut ipuçları.
etiketler: [tasarim-sistemi, belirtec, tema, bilesen, css, onyuz]
duzey: orta
guncellik: 2026-11
---

# Tasarım sistemi

> Bu notu ne zaman okumalı: yeni bir uygulamanın görünümünü kurarken; yeni bir bileşen ya da renk eklemeden önce;
> "her ekran biraz farklı görünüyor", "koyu temada okunmuyor", "hazır şablon gibi duruyor" denince.

## Temel fikir

Tasarım sistemi üç şeydir: **az sayıda karar** (belirteçler: renk, boşluk, yazı, yarıçap, gölge, hareket), o
kararları uygulayan **bileşenler** ve kararların dışına çıkılmasını engelleyen **kurallar** (lint, kural testi,
katalog). Tutarlılık iradeyle değil kuralla sağlanır.

Belirteçler üç katmandır: ham değer (`#0e6157`) → **anlamsal ad** (`accent`, `danger`, `surface`, `ink`) → bileşen
(`Button` birincil = `bg-accent text-accent-ink`). Bileşenler yalnız anlamsal adları kullanır; ham renk ve hazır
palet (`blue-500`) bileşene hiç girmez. Böylece koyu tema, yüksek karşıtlık ya da marka değişikliği tek dosyada olur.

Havuzdaki uygulama temeli bu düzende kurulu: belirteçler [`index.css`](../../uygulama/web/src/styles/index.css)
(üç tema bloğu + Tailwind `@theme`), bileşenler `ui/`, canlı katalog `/katalog` (yalnız geliştirmede), karşıtlık
kural testi [`contrast.test.ts`](../../uygulama/web/test/rules/contrast.test.ts). Köprü'de belirteçler
`src/theme/tokens.ts` dosyasında ve tasarımcıya aittir.

## Belirteçler

| Tür       | Önerilen ölçek                                                        | Kural                                                    |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Renk      | Anlamsal adlar (aşağıda); her zemin renginin bir "üstündeki metin" eşi | Ham renk yalnız belirteç dosyasında                     |
| Boşluk    | 4 px tabanlı: 4, 8, 12, 16, 24, 32, 48, 64                            | Ölçek dışı değer (13 px, 27 px) yok                      |
| Yazı      | 5–7 boyut, 2–3 kalınlık; gövde satır yüksekliği ~1.5, başlık 1.1–1.25 | Her boyutun bir adı ve kullanım yeri                     |
| Yarıçap   | 2–3 değer (denetim, kart, hap)                                        | İç içe öğede iç yarıçap = dış − dolgu                    |
| Gölge     | 2–3 kademe (kart, açılır menü, pencere)                               | Koyu temada gölge yerine daha açık yüzey                 |
| Hareket   | 3 süre + 2 eğri                                                       | Ayrıntı: [animasyon](animasyon-ve-etkilesim.md)          |
| Katman    | Adlandırılmış z-index düzeyleri (içerik, çubuk, menü, pencere, bildirim) | Rastgele `9999` yok                                   |
| Dokunma   | En küçük hedef (ürün kuralı: 48 px, Köprü'de 72 px)                   | Bileşenin taban stilinde                                 |

Yazı ölçeğini elle değil orandan üretin; telefonda küçük oran (1.2), geniş ekranda biraz büyüğü (1.25) iyi durur:

```js calistir
import assert from 'node:assert/strict'

// Oranlı (modular) ölçek: taban × oran^adım, en yakın piksele yuvarlanmış.
const scale = (base, ratio, steps) => steps.map((step) => Math.round(base * ratio ** step))
assert.deepEqual(scale(16, 1.2, [-1, 0, 1, 2, 3, 4]), [13, 16, 19, 23, 28, 33]) // telefon
assert.deepEqual(scale(16, 1.25, [-1, 0, 1, 2, 3, 4]), [13, 16, 20, 25, 31, 39]) // geniş ekran
const toRem = (px) => `${px / 16}rem` // rem: kullanıcının yazı boyutu ayarına uyar
assert.equal(toRem(28), '1.75rem')
console.log('tamam')
```

```cikti
tamam
```

## Anlamsal renk adları

| Ad                         | Ne için                                      | Eşi / not                                         |
| -------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `canvas`                   | Sayfa zemini                                 | —                                                 |
| `surface`, `surface-2`     | Kart, alan; ikincil yüzey                    | Üstünde `ink` ve `muted` okunmalı                 |
| `ink`, `muted`             | Ana metin, ikincil metin                     | `muted` de 4.5:1 olmalı (soluk gri tuzağı)        |
| `line`, `line-strong`      | Ayırıcı; alan kenarı                         | Alan kenarı 3:1 (`line-strong`)                   |
| `accent`, `accent-ink`     | Birincil eylem zemini ve üstündeki metin     | Her zemin renginin `-ink` eşi vardır              |
| `accent-soft`, `accent-text` | Yumuşak vurgu zemini; zeminde vurgu metni  | `accent` metin olarak çoğu zaman yetersiz kalır   |
| `danger`, `warn`, `ok` (+ `-soft`) | Durum renkleri                       | Renk tek başına anlam taşımaz: simge + metin      |
| `focus`                    | Odak halkası                                 | Hem `canvas` hem `surface` üstünde 3:1            |

Tailwind'in hazır paletini kapatın (`@theme { --color-*: initial; }`); geliştirici `bg-blue-500` yazamasın.

## Koyu tema

- Ters çevirme değildir. Yüzeyler koyu ama siyah değil; **yükseklik açıklıkla** anlatılır (öne gelen yüzey biraz
  daha açık). Vurgu rengi koyu zeminde açılır ve doygunluğu azalır; `accent-ink` koyulaşır.
- Her belirteç her temada tanımlı olmalı; unutulan belirteç sessizce açık temanın değerini alır:

```js calistir
import assert from 'node:assert/strict'

const css = `
:root { --canvas: #f6f4ef; --surface: #ffffff; --ink: #1c2220; --muted: #575e5a; --accent: #0e6157; }
:root[data-theme='dark'] { --canvas: #111513; --surface: #191e1c; --ink: #e8ece9; --accent: #5cc3b2; }
`
function tokens(selector) {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return new Set([...body.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]))
}
const light = tokens(':root')
const dark = tokens(":root[data-theme='dark']")
// Koyu temada --muted unutulmuş: açık temanın koyu grisi koyu zeminde kullanılacak (okunmaz)
assert.deepEqual([...light].filter((name) => !dark.has(name)), ['muted'])
console.log('tamam')
```

- `color-scheme: light` / `dark` yazın: form denetimleri, kaydırma çubukları ve otomatik doldurma rengi temaya uyar.
- Tercih üç durumludur: Sistem / Açık / Koyu. Seçim boyamadan önce uygulanır (yoksa açılışta beyaz parlama olur).
- Karşıtlık testini **her tema için** koşun; koyu temada en sık kalan çift `muted / surface-2` ve `danger / danger-soft`'tur.

## Yüksek karşıtlık

| Durum                                   | Ne yapılır                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Kullanıcı sistemde "daha fazla karşıtlık" istedi (`prefers-contrast: more`) | `muted` → `ink`, ince çizgiler → güçlü çizgi |
| Windows zorunlu renkler (`forced-colors: active`) | Zemin rengi ve gölgeler kaybolur: sınırları `border` ile çizin, odağı `outline` ile gösterin, gerekirse sistem renkleri (`CanvasText`, `Highlight`) |
| Uygulama içi "yüksek karşıtlık" ayarı   | Aynı eşlemeyi `data-contrast="high"` ile (uygulama temelinde var)          |

Gölgeyle ayrılan kart, zorunlu renklerde görünmez olur; her kartın ince bir kenarı olsun (saydam bile olsa:
`border: 1px solid transparent` zorunlu renk kipinde görünür hâle gelir).

## Bileşen API tasarımı

| Kural                                                          | Neden                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| Görünüm için tek `variant` (sayılabilir değerler), boole yığını değil | `isPrimary isDanger isGhost` 8 birleşim üretir, çoğu anlamsız |
| Yerel öznitelikler geçer (`...rest`); `<button>`'da varsayılan `type="button"` | Formun içinde yanlışlıkla gönderim olmaz              |
| `className` kaçış kapısıdır, en sona eklenir                   | Yerleşim (genişlik, kenar boşluğu) dışarıdan verilebilir      |
| Bileşen dış kenar boşluğu (margin) koymaz                      | Aralığı ebeveyn `gap` ile verir; bileşen her yerde kullanılır |
| Erişilebilir ad zorunlu prop'tur (`IconButton` → `label`)      | Tip denetimi adsız düğmeyi derlemede yakalar                  |
| Yükleniyor durumu bileşende (`loading`)                        | Genişlik sabit kalır, `aria-busy`, çift tıklama kilidi her yerde aynı |
| Ad tutarlılığı: `value/onChange`, `open/onClose`, `checked/onChange` | Bir kez öğrenilir                                       |
| Karmaşık bileşende bileşim (slot: `icon`, `footer`; `children`) | Prop sayısı patlamaz                                         |

```ts calistir
import assert from 'node:assert/strict'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

// Record<Variant, …>: yeni değişken eklenip burası unutulursa tip denetimi kırılır.
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-surface text-ink border border-line-strong',
  ghost: 'bg-transparent text-ink',
  danger: 'bg-danger text-white',
}
const SIZE: Record<Size, string> = { md: 'min-h-12 px-4 text-base', lg: 'min-h-14 px-6 text-lg' }

function buttonClass({ variant = 'primary', size = 'md', className }: { variant?: Variant; size?: Size; className?: string }) {
  return ['inline-flex items-center justify-center gap-2 rounded-xl font-semibold', VARIANT[variant], SIZE[size], className]
    .filter(Boolean)
    .join(' ')
}

assert.equal(
  buttonClass({}),
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold bg-accent text-accent-ink min-h-12 px-4 text-base',
)
assert.match(buttonClass({ variant: 'danger', size: 'lg', className: 'w-full' }), /bg-danger text-white min-h-14 .* w-full$/)
console.log('tamam')
```

Uygulama temelinin düğmesi aynı kalıptadır: [`Button.tsx`](../../uygulama/web/src/ui/Button.tsx) (`variant`,
`loading`, `IconButton`'da zorunlu `label`). Not: `className` ile gelen `px-6`, bileşenin `px-4`'ünü **sıraya göre
ezmez**; hangisinin kazanacağını CSS dosyasındaki sıra belirler ([CSS mimarisi](css-mimarisi.md)).

## Tutarlılık kuralları

- Ekran başına **bir** birincil düğme (Köprü ilkesi: "bir ekranda bir iş").
- Aynı eylem her yerde aynı sözcük ve simgeyle: "Sil" bir yerde "Kaldır" olmaz; çöp kutusu simgesi yalnız silmede.
- Boşluk, yazı boyutu, yarıçap yalnız ölçekten; "bir kerelik" değer yok.
- Her yeni bileşen önce katalogda örneğiyle görünür; yeni ekran yazmadan önce katalog açılır.
- Kurallar testle korunur:

```js calistir
import assert from 'node:assert/strict'

// Kural testi: bileşen kaynağında ham renk ve hazır palet yasak; yalnız anlamlı belirteç adları.
const FORBIDDEN = [
  { re: /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, why: 'ham renk kodu' },
  { re: /\b(?:bg|text|border|ring|fill|stroke)-(?:red|blue|green|gray|slate|zinc|amber|yellow|purple|pink|indigo)-\d{2,3}\b/g, why: 'hazır palet' },
  { re: /\b(?:bg|text|border)-\[#/g, why: 'keyfi renk' },
]
const violations = (file, source) =>
  FORBIDDEN.flatMap(({ re, why }) => [...source.matchAll(re)].map((match) => `${file}: ${match[0]} (${why})`))

const good = `<button className="bg-accent text-accent-ink hover:bg-accent/90">Kaydet</button>`
const bad = `<p className="text-gray-500">Not</p><div style={{ color: '#ff0000' }} className="bg-[#123456]" />`
assert.deepEqual(violations('Iyi.tsx', good), [])
assert.deepEqual(violations('Kotu.tsx', bad), [
  'Kotu.tsx: #ff0000 (ham renk kodu)',
  'Kotu.tsx: #123456 (ham renk kodu)',
  'Kotu.tsx: text-gray-500 (hazır palet)',
  'Kotu.tsx: bg-[# (keyfi renk)',
])
console.log('tamam')
```

## "Şablon gibi durmayan" arayüz için somut ipuçları

1. **Nötrleri renklendirin.** Saf gri (#888) yerine markanın tonuna hafif çekilmiş nötrler (uygulama temelinde
   sıcak kâğıt zemini `#f6f4ef`). Saf beyaz kart + saf gri zemin şablon hissinin baş nedenidir.
2. **Tek vurgu rengi, az kullanın.** Vurgu yalnız birincil eylemde ve seçili durumda; her başlık ve simge vurgulanırsa
   hiçbiri vurgulanmaz. Mor-mavi gradyan, cam efekti ve her köşede gölge kullanmayın.
3. **Yazıyla hiyerarşi kurun.** Büyük başlıkta sıkı harf aralığı (`tracking-tight`) ve kalın ağırlık; gövde normal.
   Hiyerarşiyi renk ve kutuyla değil boyut, ağırlık ve boşlukla verin.
4. **Gerçek içerik.** Tasarımı "Lorem ipsum" ve "Kullanıcı 1" ile değil, gerçek uzunlukta Türkçe metinle yapın
   ("Annemin ilaç saatleri", "Torunumun doğum günü"); uzun sözcükler düzeni sınar.
5. **Tutarlı simge seti.** Tek kütüphane, tek çizgi kalınlığı, tek boy (ör. 20 px); emoji ile karıştırmayın.
6. **Yoğunluğu değiştirin.** Her bölüm ortalanmış kart değildir; liste ekranı sık, karşılama ekranı ferah olabilir.
7. **Ayrıntıya özen.** Sayılarda `tabular-nums`; odak halkası marka renginde; boş durumlarda düz "Veri yok" yerine
   ne yapılacağını söyleyen tek cümle + tek düğme; düğme metinleri eylem fiili ("Kaydet", "Davet gönder").
8. **Kenarlar ve köşeler bir aile.** Yarıçaplar tutarlı; iç içe köşelerde iç yarıçap küçük.
9. **Kişisel olan öne.** Köprü ilkesi: kullanıcının kendi fotoğrafları ve sözcükleri hazır içerikten önce gelir;
   kişisel öğe arayüzü kendiliğinden özgün yapar.
10. **Yetişkine saygı.** Çocuksu çizim, aşırı ünlem, konfeti, "Harika!" ödülleri yok; sakin ve net bir dil.

## Tuzaklar

| Belirti                                                      | Neden                                                     | Çözüm                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| Koyu temada bazı metinler okunmuyor                          | Belirteç koyu temada tanımlı değil ya da ham renk kullanılmış | Her temada aynı belirteç seti + karşıtlık testi        |
| Her ekranda biraz farklı boşluk ve yazı boyutu               | Ölçek dışı değerler                                       | Yalnız ölçek; kural testi/lint                            |
| `isPrimary`/`isLarge` gibi boole prop'lar çoğaldı            | Değişken yerine boole tasarımı                            | Tek `variant` + `size`                                    |
| Bileşen başka yerde kullanılınca boşluk bozuluyor            | Bileşen kendi `margin`'ini koyuyor                        | Aralığı ebeveynin `gap`'i versin                          |
| Açılışta beyaz parlama, sonra koyu tema                      | Tema React yüklendikten sonra uygulanıyor                 | `<head>`'de küçük betik ya da modül düzeyinde önce uygula |
| Windows yüksek karşıtlıkta kartlar ve odak görünmüyor        | Ayrım yalnız gölge/zemin rengiyle; `outline: none`        | Saydam kenar, `outline` ile odak                          |
| Marka rengi değişince düzinelerce dosya değişiyor            | Bileşenlerde ham renk                                     | Anlamsal belirteç katmanı                                 |
| Uygulama "hazır şablon" gibi duruyor                         | Saf griler, her yerde gölge ve gradyan, yer tutucu içerik | Yukarıdaki on ipucu                                       |

## Denetim listesi

- [ ] Ham renk kodu yalnız belirteç dosyasında; bileşenlerde hazır palet ve keyfi renk yok (kural testi var).
- [ ] Her anlamsal belirteç açık, koyu (ve varsa yüksek karşıtlık) temada tanımlı.
- [ ] Metin/zemin çiftleri 4.5:1, kenar ve odak 3:1; test her temada koşuyor.
- [ ] Boşluk, yazı, yarıçap değerleri ölçekten.
- [ ] Bileşenler `variant`/`size` ile; yerel öznitelikleri geçiriyor; dış boşluk koymuyor; erişilebilir ad zorunlu.
- [ ] Yeni bileşenin katalogda örneği var.
- [ ] Ekran başına bir birincil eylem; aynı eylem her yerde aynı ad ve simgede.
- [ ] `color-scheme` ayarlı; tema boyamadan önce uygulanıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yalnız `ui/` altındaki bileşenleri ve `index.css`'teki anlamlı renk adlarını kullan (`bg-surface`,
  `text-muted`, `bg-accent`…). Ham renk, `gray-500` gibi hazır palet, keyfi değer (`[13px]`) yazma. Yeni bir görünüm
  gerekiyorsa önce bana sor ya da bileşene `variant` ekle."
- **Modelin tipik hatası:** Tailwind'in hazır renklerini kullanır (`text-gray-500`, `bg-blue-600`); her karta gölge ve
  gradyan ekler; boole prop'larla bileşen genişletir; koyu tema için her yere `dark:` öneki serper (belirteçler zaten
  temaya göre değişir).
- **Çıktıda arayın:** `#` ile başlayan renkler, `-[` keyfi değerler, hazır palet adları, `dark:` önekleri, bileşen
  içinde `m-`/`mt-` kenar boşlukları, yeni `is…` boole prop'ları.
- **Görsel denetim:** değişiklikten sonra açık ve koyu temada 360 px ekran görüntüsü isteyin.

## İlgili

- [CSS mimarisi](css-mimarisi.md) — katmanlar, özgüllük, değişkenler, sınıf çakışması
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — karşıtlık hesabı
- [Animasyon ve etkileşim](animasyon-ve-etkilesim.md) — hareket belirteçleri
- Site temelinde markadan türetilen, karşıtlığı garanti eden tema: [`theme.ts`](../../site/src/lib/theme.ts)
- Renk dönüşümü ve karşıtlığa göre ayarlama: [`renk.ts`](../../kutuphane/ts/src/renk.ts)
