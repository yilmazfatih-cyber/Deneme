---
baslik: Dokunma ve işaretçi olayları
ozet: Telefonda dokunma, basılı tutma, kaydırma ve sürükleme için Pointer Events; tarayıcı hareketleriyle çakışma, titreyen el için tolerans, istemeden tekrar dokunma ve her hareketin düğme/klavye karşılığı.
etiketler: [dokunma, isaretci, mobil, erisilebilirlik, etkilesim, onyuz]
duzey: orta
guncellik: 2026-11
---

# Dokunma ve işaretçi olayları

> Bu notu ne zaman okumalı: tıklamadan başka bir hareket (basılı tutma, kaydırarak silme, sürükleyerek sıralama,
> çizim) yazmadan önce; "telefonda sayfa kaymıyor", "kaydırırken yanlışlıkla seçiliyor", "titreyen el yanlış
> düğmeye basıyor" şikâyetlerinde.

## Temel fikir

Basit dokunuş için doğru olay hâlâ **`click`**'tir (bir `<button>` üzerinde): fare, dokunma, kalem, klavye (Enter,
Boşluk) ve ekran okuyucu hepsi onu üretir. Özel bir hareket ancak gerçekten gerekiyorsa yazılır ve **her zaman** görünür
bir düğme ya da klavye karşılığıyla birlikte gelir (WCAG 2.5.1, 2.5.7). Gizli hareket, motor güçlüğü olan, ekran
okuyucu kullanan ya da hareketi hiç keşfetmeyen kullanıcı için yoktur.

Özel hareket yazılacaksa Pointer Events (`pointerdown/move/up/cancel`) kullanılır: fare, dokunma ve kalem tek
modelde gelir. Tarayıcı kaydırma ve yakınlaştırma hareketlerinin sahibidir; sizin hangi hareketi üstlendiğinizi CSS
`touch-action` ile **önceden** söylersiniz. Tarayıcı bir dokunuşu kaydırma sayarsa size `pointercancel` gönderir;
durumu orada sıfırlamayan kod "takılı kalmış" hareketler üretir.

Sahibin kullanıcıları arasında titreyen el ve yavaş hareket var (Köprü). Bu yüzden eşikler cömert, eylem bırakınca
(pointerup/click) gerçekleşir, istemeden yapılan tekrar dokunuş yok sayılır ve her eylem geri alınabilir.

## Karar tablosu: hangi etkileşim, hangi olay

| Etkileşim                                   | Nasıl yazılır                                                   | Zorunlu karşılık / not                                  |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| Dokunma, seçme                              | `<button onClick>`                                              | Klavye ve ekran okuyucu kendiliğinden çalışır          |
| Basılı tutarak seçme (yanlış dokunmayı önler) | `pointerdown` + zamanlayıcı; kayma/iptal/erken bırakmada vazgeç | İsteğe bağlı ayar olsun; klavye anında seçer (Köprü `usePress`) |
| Uzun basınca menü                           | Tek yol olmasın: görünür "…" (Diğer) düğmesi                    | Android'de uzun basma `contextmenu` olayı da üretir     |
| Kaydırarak silme/arşivleme                  | Pointer olayları + `touch-action: pan-y`                        | Satırda görünür "Sil" düğmesi + geri alma               |
| Sürükleyerek sıralama                       | Tutamaçta `touch-action: none` + `setPointerCapture`            | "Yukarı taşı / Aşağı taşı" düğmeleri (WCAG 2.5.7)       |
| Çizim, imza, tuval                          | Tuvalde `touch-action: none`                                    | Geri al ve temizle düğmeleri                            |
| Resimde iki parmakla yakınlaştırma          | Yalnız görüntüleyicide `touch-action: none`                     | "+ / −" düğmeleri                                       |
| Çift dokunma                                | Kullanmayın                                                     | Tarayıcının yakınlaştırmasıyla çakışır, keşfedilmez     |

## İşaretçi olaylarının sırası

Dokunmada tipik sıra: `pointerdown` → (`pointermove` …) → `pointerup` → `click`. Tarayıcı dokunuşu kaydırma ya da
yakınlaştırma olarak devralırsa `pointerup` yerine **`pointercancel`** gelir ve `click` gelmez.

| Ayrıntı                       | Ne yapılır                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `pointercancel`               | `pointerup` ile aynı temizliği yapın (zamanlayıcıyı durdur, durumu sıfırla)             |
| Parmak öğeden çıkıyor          | Sürüklemede `element.setPointerCapture(e.pointerId)`; hareketler öğede kalır            |
| Çoklu dokunma                 | `e.isPrimary` ile birinci parmağı izleyin; ikinciyi yok sayın ya da hareketi iptal edin |
| Fare/dokunma/kalem farkı      | `e.pointerType`; dokunmada eşikleri büyütün                                             |
| Sağ tık, orta tık             | `e.button !== 0` ise basılı tutma başlatmayın                                           |
| Dinleyici performansı         | `touchmove`/`wheel` dinleyicisi `{ passive: true }`; kaydırmayı engellemek için `preventDefault` yerine `touch-action` |

## Hareketi sınıflandırmak

Dokunuşla kaydırmayı ayıran şey **kayma toleransıdır** (slop): parmak birkaç piksel oynasa da dokunuş sayılır. Titreyen
el için bu tolerans geniş tutulur; çok dar tolerans dokunuşları "kaydırma"ya çevirip yutar.

```js calistir
import assert from 'node:assert/strict'

// İşaretçi örneklerinden ({ t, x, y }) hareketi sınıflandır.
function classify(samples, { slop = 10, longPressMs = 500, swipeMin = 60 } = {}) {
  const [first, last] = [samples[0], samples.at(-1)]
  const [dx, dy] = [last.x - first.x, last.y - first.y]
  const drift = Math.max(...samples.map((s) => Math.hypot(s.x - first.x, s.y - first.y)))
  if (drift <= slop) return last.t - first.t >= longPressMs ? 'basılı tutma' : 'dokunma'
  if (Math.abs(dx) >= swipeMin && Math.abs(dx) > 2 * Math.abs(dy)) return dx < 0 ? 'sola kaydırma' : 'sağa kaydırma'
  return 'belirsiz' // dikey ya da kararsız: tarayıcının kaydırmasına bırak
}

const tap = [{ t: 0, x: 100, y: 100 }, { t: 90, x: 103, y: 98 }]
const tremorTap = [{ t: 0, x: 100, y: 100 }, { t: 60, x: 107, y: 104 }, { t: 140, x: 96, y: 103 }] // titreyen el
const hold = [{ t: 0, x: 50, y: 50 }, { t: 650, x: 54, y: 52 }]
const swipe = [{ t: 0, x: 300, y: 200 }, { t: 120, x: 180, y: 210 }]
const scroll = [{ t: 0, x: 200, y: 400 }, { t: 150, x: 205, y: 250 }]

assert.equal(classify(tap), 'dokunma')
assert.equal(classify(tremorTap), 'dokunma') // 10 px tolerans: titreme dokunuşu bozmaz
assert.equal(classify(tremorTap, { slop: 4 }), 'belirsiz') // dar tolerans: titreyen elin dokunuşu kaybolur
assert.equal(classify(hold), 'basılı tutma')
assert.equal(classify(swipe), 'sola kaydırma')
assert.equal(classify(scroll), 'belirsiz') // dikey: sayfa kaydırması, sizin hareketiniz değil
console.log('tamam')
```

```cikti
tamam
```

Eşikler `pointerType`'a göre değişebilir (fare için küçük, dokunma için büyük) ve erişilebilirlik ayarlarına
bağlanabilir. Değerleri belirteç gibi tek yerde tutun.

## Basılı tutarak seçme

Titreyen elde yanlış seçimi önlemenin yolu: parmak bir süre (ör. 600 ms) basılı kalınca seçmek, bu sürede bir
ilerleme göstergesi çizmek. Kural: tolerans içindeki titreme iptal etmez; tolerans dışına kayma (kullanıcı aslında
sayfayı kaydırıyor), erken bırakma ve `pointercancel` iptal eder; klavye ve ekran okuyucu **beklemeden** seçer.

```js calistir
import assert from 'node:assert/strict'

// 'timer' olayı, pointerdown'da kurulan zamanlayıcının dolmasını temsil eder.
function holdToSelect(events, { holdMs = 600, slop = 12 } = {}) {
  let start = null
  for (const e of events) {
    if (e.type === 'down') { start = e; continue }
    if (!start) continue
    if (e.type === 'up' || e.type === 'cancel') { start = null; continue } // erken bıraktı ya da tarayıcı devraldı
    if (e.type === 'move' && Math.hypot(e.x - start.x, e.y - start.y) > slop) { start = null; continue }
    if (e.type === 'timer' && e.t - start.t >= holdMs) return 'seçildi'
  }
  return 'seçilmedi'
}

const down = { type: 'down', t: 0, x: 100, y: 100 }
assert.equal(holdToSelect([down, { type: 'move', t: 200, x: 106, y: 103 }, { type: 'timer', t: 600 }]), 'seçildi')
assert.equal(holdToSelect([down, { type: 'up', t: 300 }, { type: 'timer', t: 600 }]), 'seçilmedi') // erken bıraktı
assert.equal(holdToSelect([down, { type: 'move', t: 200, x: 100, y: 160 }, { type: 'timer', t: 600 }]), 'seçilmedi') // kaydırıyor
assert.equal(holdToSelect([down, { type: 'cancel', t: 150 }, { type: 'timer', t: 600 }]), 'seçilmedi') // pointercancel
console.log('tamam')
```

Bu kalıp bir **ayar** olmalıdır (varsayılan kapalı ya da kısa); herkes için zorunlu basılı tutma uygulamayı
yavaşlatır. Köprü'de "dokunmayı tutma süresi" ayarı 0'dan büyükse çalışır; ilerleme çubuğu CSS canlandırmasıdır ve
"hareketi azalt" açıkken gizlenir, seçim yine çalışır (`src/components/usePress.ts`).

## İstemeden tekrar dokunma

Titreyen el aynı düğmeye art arda iki kez dokunabilir: ses iki kez çalar, öğe iki kez eklenir. Kısa bir pencere
içindeki tekrarı yok sayın (bu, çift gönderim kilidinden ayrı bir korumadır; bkz. [formlar](formlar.md)):

```js calistir
import assert from 'node:assert/strict'

// Kabul edilen son dokunuştan sonraki windowMs içinde gelen etkinleştirmeleri yok say.
function createRepeatGuard(windowMs = 400) {
  let last = -Infinity
  return (t) => {
    if (t - last < windowMs) return false
    last = t
    return true
  }
}

const speak = createRepeatGuard()
assert.deepEqual([0, 120, 380, 900, 1000].map(speak), [true, false, false, true, false])
console.log('tamam')
```

Pencere kısa olmalı (300–500 ms); yoksa bilerek iki kez dokunmak isteyen kullanıcı engellenir. Düğmenin basıldığını
gösteren görsel geri bildirim her dokunuşta yine olsun.

## `touch-action` ile tarayıcıya söylemek

| Değer           | Tarayıcı ne yapar                                 | Nerede                                         |
| --------------- | ------------------------------------------------- | ---------------------------------------------- |
| `auto`          | Kaydırma, yakınlaştırma, çift dokunuşla büyütme   | Varsayılan                                     |
| `manipulation`  | Kaydırma + iki parmakla yakınlaştırma; çift dokunuş büyütmesi yok | Düğmeler, sık dokunulan alanlar  |
| `pan-y`         | Yalnız dikey kaydırma; yatay hareket sizin        | Yatay kaydırarak silinen satır                 |
| `pan-x`         | Yalnız yatay kaydırma                             | Dikey sürüklenen öğe (nadir)                   |
| `none`          | Hiçbir şey; bütün hareket sizin                   | Sürükleme tutamacı, tuval, harita, görüntüleyici |

`touch-action: none`'ı geniş bir alana (bütün liste, sayfa) vermeyin: kullanıcı o alandan sayfayı kaydıramaz. Yalnız
tutamaca verin. JavaScript'te `preventDefault` ile kaydırmayı durdurmaya çalışmak yerine bu özelliği kullanın;
tarayıcılar belge düzeyindeki dokunma dinleyicilerini performans için pasif sayabilir ve `preventDefault` sessizce
işe yaramaz.

## Telefona özgü ayrıntılar

- Uzun basmada iOS bağlantı/görsel menüsü ve metin seçimi açılır: denetimlerde `-webkit-touch-callout: none` ve
  `user-select: none` (yalnız düğme ve sürükleme tutamacında; okunacak metinde değil).
- `width=device-width` görünüm etiketi varken eski "300 ms tıklama gecikmesi" yoktur; `touch-action: manipulation`
  çift dokunuş büyütmesini de kapatır.
- Basılı görünüm (`:active`) her cihazda aynı davranmayabilir; gerçek telefonda deneyin, gerekirse `pointerdown`/
  `pointerup` ile bir `data-pressed` özniteliği kullanın.
- Kaydırarak silmede satır kaydırma bitince sayfanın dikey kaydırması hemen çalışmalı; yatay eşik dikey hareketi
  yutmamalı (yukarıdaki `2 × |dy|` koşulu).

## Erişilebilirlik kuralları

| WCAG maddesi                       | Ne ister                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 2.5.1 İşaretçi hareketleri (A)     | Yol çizen ya da çok parmaklı her hareketin tek dokunuşla karşılığı        |
| 2.5.2 İşaretçi iptali (A)          | Eylem bırakınca (up) olsun; parmak dışarı kayınca vazgeçilebilsin ya da eylem geri alınabilsin |
| 2.5.7 Sürükleme hareketleri (AA)   | Sürükleyerek yapılan her işin sürüklemesiz yolu (düğme)                   |
| 2.5.8 Hedef boyutu (AA)            | En az 24×24 px (ürün kuralı daha büyük olabilir: [duyarlı tasarım](duyarli-tasarim-ve-mobil.md)) |

`pointerdown`'da eylem yapmak 2.5.2'ye aykırıdır: kullanıcı yanlış düğmeye bastığını fark edip parmağını kaydırarak
vazgeçemez. Basılı tutarak seçme bilinçli bir istisnadır; bu yüzden isteğe bağlı ve geri alınabilir olmalıdır.

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Telefonda liste kaymıyor                                      | Geniş alanda `touch-action: none` ya da `preventDefault`  | `none` yalnız tutamakta; satırda `pan-y`                  |
| Kaydırırken öğeler yanlışlıkla seçiliyor                      | Eylem `pointerdown`'da; kayma toleransı yok               | Eylem bırakınca; tolerans dışı kaymada vazgeç             |
| Basılı tutma göstergesi bazen takılı kalıyor                  | `pointercancel` ele alınmamış                             | `pointercancel`'da da sıfırla                             |
| Sürüklenen öğe parmak hızlı gidince "düşüyor"                 | Hareket olayları öğeden çıkınca gelmiyor                  | `setPointerCapture`                                       |
| Titreyen elin dokunuşları hiç algılanmıyor                    | Tolerans çok dar                                          | Dokunmada geniş tolerans; ayara bağlayın                  |
| Ses iki kez çalıyor, öğe iki kez ekleniyor                    | İstemeden tekrar dokunma                                  | Kısa tekrar penceresi                                     |
| Uzun basınca iOS menüsü ya da metin seçimi açılıyor           | Varsayılan tarayıcı davranışı                             | Denetimlerde `-webkit-touch-callout: none`, `user-select: none` |
| Klavye ve ekran okuyucu kullanıcısı işi yapamıyor             | İş yalnız harekete bağlı                                  | Görünür düğme karşılığı                                   |
| Fare ile denerken çalışıyor, telefonda çalışmıyor             | `mouse*` olayları kullanılmış                             | `pointer*` olayları                                       |

## Denetim listesi

- [ ] Basit etkileşimler `<button onClick>`; özel hareket yalnız gerektiğinde.
- [ ] Her özel hareketin görünür düğme ve klavye karşılığı var.
- [ ] Eylemler bırakınca gerçekleşiyor; parmak kayınca vazgeçiliyor; `pointercancel` ele alınıyor.
- [ ] Dokunma toleransı ve basılı tutma süresi tek yerde, ayarlanabilir; titreyen elle denendi.
- [ ] `touch-action` yalnız gereken öğede; listeler ve sayfa telefonda rahat kayıyor.
- [ ] İstemeden tekrar dokunma, sonucu iki kez üretmiyor.
- [ ] Hareketle yapılan her iş geri alınabiliyor.
- [ ] Gerçek bir telefonda (dokunmatik) denendi; fareyle deneme yeterli sayılmadı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu etkileşimi önce düz bir `<button onClick>` ile yap. Hareket gerekiyorsa Pointer Events kullan,
  `pointercancel`'ı da ele al, eylemi bırakınca yap, `touch-action`'ı yalnız tutamakta `none` yap ve aynı işi yapan
  görünür bir düğme ekle."
- **Modelin tipik hatası:** `onMouseDown`/`onTouchStart` ile eylem yapar; bütün kaba `touch-action: none` verir;
  `pointercancel` yazmaz; kaydırarak silmeyi tek yol yapar; dokunma toleransı koymaz.
- **Çıktıda arayın:** `onMouseDown`, `onTouchStart`, `onPointerDown` içinde doğrudan eylem; `touch-action: none` /
  `touch-none` geniş kaplarda; `preventDefault` içeren `touchmove`; düğme karşılığı olmayan sürükleme.
- **Test isteyin:** Uçtan uca testte `hasTouch: true` telefon projesinde dokunma; birim testte yukarıdaki gibi
  olay dizileriyle (erken bırakma, kayma, iptal) sınıflandırma testi.

## İlgili

- [Duyarlı tasarım ve mobil](duyarli-tasarim-ve-mobil.md) — dokunma hedefi boyutu, iOS tuzakları
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — klavye kalıpları
- [Animasyon ve etkileşim](animasyon-ve-etkilesim.md) — basılı durum, hareket azaltma
- [Formlar](formlar.md) — çift gönderim kilidi
- Başka kümelerde: [UX temelleri](../95-urun/ux-temelleri.md) (Fitts sezgisi, hata önleme ve geri alma)
