---
baslik: Animasyon ve etkileşim
ozet: Hareketin amacı, süre ve eğri seçimi, yalnız transform/opacity canlandırma, düzen sarsıntısı ve FLIP, hareket azaltma, basılı/yükleniyor/başarı mikro etkileşimleri ve iskelet ile döndürücü seçimi.
etiketler: [animasyon, etkilesim, performans, erisilebilirlik, onyuz, css]
duzey: orta
guncellik: 2026-11
---

# Animasyon ve etkileşim

> Bu notu ne zaman okumalı: bir geçiş, açılır panel, yükleniyor göstergesi ya da "basınca tepki" eklerken;
> canlandırma telefonda takılıyorsa; arayüz "ölü" ya da tersine "fazla oynak" geliyorsa.

## Temel fikir

Hareketin bir **işi** olmalı: geri bildirim ("bastın, aldım"), yön ("panel aşağıdan geldi, aşağı gider"), süreklilik
("bu kart şu kartın büyümüş hâli") ya da nadiren dikkat ("kayıt başarısız"). Süs için hareket, yaşlı ve dikkat
güçlüğü yaşayan kullanıcıyı yorar, baş dönmesi yapabilir, telefonda pili ve akıcılığı yer.

Üç kural işin çoğunu çözer: **kısa** (çoğu 150–250 ms), **yalnız `transform` ve `opacity`** (tarayıcı bunları
düzen ve boyama yapmadan birleştirir), **hareket azaltmaya uyar** (sistem ayarı + uygulama içi ayar). Kullanıcı
canlandırma bitmeden bir sonraki işi yapabilmeli; hareket hiçbir zaman beklemeye dönüşmemeli.

## Süre ve eğri seçimi

| Hareket                                         | Süre (yaklaşık) | Eğri                         | Not                                          |
| ----------------------------------------------- | --------------- | ---------------------------- | -------------------------------------------- |
| Basılı durum, onay kutusu, renk değişimi        | 80–120 ms       | ease-out                     | Gecikme hissettirmemeli                      |
| İpucu balonu, bildirim (toast) girişi           | 150–200 ms      | ease-out (giriş)             | Çıkış biraz daha kısa                        |
| Açılır menü, küçük panel                        | 150–220 ms      | ease-out                     | Kaynağından (düğmeden) büyüsün               |
| Pencere, alt sayfa (bottom sheet)               | 200–300 ms      | ease-out giriş, ease-in çıkış | Çıkış girişin ~%75'i                        |
| Sayfa geçişi                                    | 200–300 ms      | ease-in-out                  | Yalnız yön anlatıyorsa; çoğu zaman gereksiz  |
| Ekranda yer değiştiren öğe (sıralama)           | 200–300 ms      | ease-in-out                  | FLIP ile (aşağıda)                           |
| Döndürücü, ilerleme çubuğu                      | Sürekli         | linear                       | Sürekli harekette yavaşlama-hızlanma olmaz   |

Bunlar sahadan gelen başlangıç değerleridir, kural değil; sürelerin ve eğrilerin tasarım belirteci olarak tek yerde
durması (`--duration-fast`, `--ease-out`) asıl kuraldır.

Neden giriş için ease-out: öğe yolun çoğunu baştan alır, gözün ilgisi hemen karşılanır; ease-in ise ilk anda neredeyse
kıpırdamaz ve "gecikti" hissi verir:

```js calistir
import assert from 'node:assert/strict'

// CSS cubic-bezier(x1, y1, x2, y2): zaman t için ilerlemeyi bul (önce x(u) = t çözülür, sonra y(u)).
function cubicBezier(x1, y1, x2, y2) {
  const coord = (u, a, b) => 3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3
  return (t) => {
    let [lo, hi, u] = [0, 1, t]
    for (let i = 0; i < 60; i++) {
      u = (lo + hi) / 2
      if (coord(u, x1, x2) < t) lo = u
      else hi = u
    }
    return coord(u, y1, y2)
  }
}
const easeOut = cubicBezier(0, 0, 0.2, 1)
const easeIn = cubicBezier(0.4, 0, 1, 1)
const percentAt = (curve, t) => Math.round(curve(t) * 100)

// Sürenin ilk çeyreğinde alınan yol:
assert.equal(percentAt(easeOut, 0.25), 58) // ease-out: yolun yarısından fazlası
assert.equal(percentAt(easeIn, 0.25), 10) // ease-in: neredeyse hiç (giriş için yanlış seçim)
assert.equal(percentAt(easeOut, 0.5), 84)
console.log('tamam')
```

```cikti
tamam
```

## Performanslı özellikler

| Canlandırılan özellik                                 | Tarayıcının işi                     | Telefonda                          |
| ----------------------------------------------------- | ----------------------------------- | ---------------------------------- |
| `transform` (translate, scale, rotate), `opacity`     | Yalnız birleştirme (compositing)    | Akıcı                              |
| `color`, `background-color`, `box-shadow`, `filter`   | Her karede boyama                   | Küçük alanda kabul edilir; büyük alanda takılır |
| `width`, `height`, `top`, `left`, `margin`, `padding` | Her karede düzen + boyama           | Takılır; çevredeki öğeleri de oynatır |

60 Hz ekranda kare başına ~16,7 ms, 120 Hz'de ~8,3 ms vardır; JavaScript bu sürenin bir kısmını zaten kullanır.

- Yükseklik açılıp kapanacaksa (`height: auto`'ya canlandırma): kabı `display: grid` yapıp `grid-template-rows`'u
  `0fr` → `1fr` geçirin ya da içeriği `transform: scaleY` + `opacity` ile gösterin.
- `will-change: transform`'u yalnız canlandırma süresince ve az öğede kullanın; her öğeye vermek belleği şişirir.
- Gölge canlandırmak yerine gölgeli bir sözde öğenin `opacity`'sini canlandırın.

## Düzen sarsıntısı ve FLIP

Döngü içinde stil yazıp hemen ardından ölçü okumak (`offsetHeight`, `getBoundingClientRect`) tarayıcıyı her adımda
yeniden düzen hesaplamaya zorlar (layout thrashing). Önce bütün okumaları, sonra bütün yazmaları yapın.

Öğenin ekrandaki yerini değiştiren bir canlandırma (liste sıralama, kartın büyümesi) için **FLIP**: ilk (First) ve
son (Last) kutuyu ölç, öğeyi dönüşümle eski yerinde göster (Invert), sonra dönüşümü kaldırıp canlandır (Play). Düzen
bir kez hesaplanır; hareket yalnız `transform`'dur.

```js calistir
import assert from 'node:assert/strict'

function invert(first, last) {
  return {
    x: first.left - last.left,
    y: first.top - last.top,
    scaleX: first.width / last.width,
    scaleY: first.height / last.height,
  }
}
const toCss = ({ x, y, scaleX, scaleY }) => `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`

const first = { left: 16, top: 400, width: 328, height: 72 } // listede 5. satır
const last = { left: 16, top: 112, width: 328, height: 72 } // sıralamadan sonra 1. satır
assert.deepEqual(invert(first, last), { x: 0, y: 288, scaleX: 1, scaleY: 1 })
// Bu dönüşümle başla, bir sonraki karede `transform: none`'a geçir → satır yukarı kayar
assert.equal(toCss(invert(first, last)), 'translate(0px, 288px) scale(1, 1)')
console.log('tamam')
```

Tarayıcının View Transitions API'si (`document.startViewTransition`) aynı fikri kendisi uygular; desteği tarayıcıya
göre değişir, algılayıp yoksa canlandırmasız geçin. React 19.3 bir `ViewTransition` bileşeni de dışa aktarıyor
(kurulu pakette görüldü); API'sini kullanmadan önce kurulu sürümün belgesini okuyun.

## Hareket azaltma

- Sistem ayarı: `@media (prefers-reduced-motion: reduce)`; JavaScript'te `matchMedia(...)`. Uygulama içinde ayrıca
  bir "hareketi azalt" anahtarı olsun (uygulama temelinde var; Köprü'de "Hareketi azalt" açıkken basılı tutma
  ilerleme çubuğu gizlenir ama seçim çalışır — `src/components/usePress.ts`).
- Azaltılmış kipte kayma, büyüme, sıçrama, paralaks yerine **anında geçiş ya da kısa bir solma**. Durum bilgisi
  (yükleniyor, başarı) korunur; yalnız hareket gider.
- Kendiliğinden oynayan, 5 saniyeden uzun süren hareket durdurulabilir olmalı; saniyede 3'ten çok yanıp sönme hiç
  olmamalı.
- Genel CSS kalıbı: [erişilebilirlik uygulaması](erisilebilirlik-uygulama.md#hareket-azaltma). JavaScript ile
  çalışan canlandırmalar (View Transitions dahil) bu CSS'ten etkilenmez; her birinde ayarı denetleyin.

## Mikro etkileşimler

| An           | Ne gösterilir                                                                   | Dikkat                                                  |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Basılı       | Hafif koyulaşma ya da `scale(0.97)`, 80–100 ms                                  | Dokunmatikte `:active` her cihazda görünmeyebilir; gerçek telefonda deneyin; gerekirse `pointerdown`/`pointerup` ile bir `data-pressed` özniteliği |
| Yükleniyor (düğmede) | Düğme içinde küçük döndürücü, metin "Kaydediliyor…", genişlik sabit, `aria-busy`, kilitli | Düğme boyu değişip yan öğeleri oynatmasın    |
| Başarı       | Kısa onay simgesi + `role="status"` iletisi; akış durmaz                         | Konfeti, "Harika!" ödülü yok (yetişkine saygı)          |
| Hata         | Sakin ileti + ne yapılacağı; alan çevresi vurgusu                               | Sallanma/kırmızı çarpı yok (Köprü ilke 8)               |
| Seçim        | Seçili durum renk + simge + kenar ile                                           | Yalnız renk değil                                       |
| Basılı tutma | Tutma süresini gösteren ilerleme çubuğu                                         | Titreyen elde yanlış seçimi önler (Köprü `usePress`)    |
| Titreşim     | `navigator.vibrate(10)` (algılayıp)                                             | iOS Safari desteklemez; asla tek geri bildirim olmasın  |

## İskelet ↔ döndürücü

| Durum                                                           | Gösterge                                              |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| İş genellikle 300 ms'den kısa                                   | Hiçbir şey (gösterge titreme gibi görünür)            |
| İçeriğin düzeni biliniyor (liste, kart), yükleme > 300 ms       | İskelet ekran (gerçek düzene benzeyen gri bloklar)    |
| Düzen bilinmiyor, kısa bekleme                                  | 300 ms gecikmeyle çıkan döndürücü                     |
| Düğmeyle başlatılan işlem                                       | Düğme içinde döndürücü                                |
| Uzun iş (> ~10 sn: içe aktarma, yükleme)                        | İlerleme çubuğu (yüzde ya da adım) + iptal            |
| Arka plan işi (eşitleme)                                        | Küçük, dikkat çekmeyen durum göstergesi               |
| Eldeki veri tazeleniyor                                         | Veri yerinde + küçük gösterge (iskelete dönmeyin)     |

Gösterge kısa işlerde hiç görünmesin, göründüyse bir an parlayıp kaybolmasın:

```js calistir
import assert from 'node:assert/strict'

function spinnerTimeline(durationMs, { delay = 300, minVisible = 500 } = {}) {
  if (durationMs <= delay) return { shown: false, hiddenAt: null }
  return { shown: true, hiddenAt: Math.max(durationMs, delay + minVisible) }
}

assert.deepEqual(spinnerTimeline(120), { shown: false, hiddenAt: null }) // hızlı iş: gösterge yok
assert.deepEqual(spinnerTimeline(350), { shown: true, hiddenAt: 800 }) // 50 ms'lik parlama değil, 500 ms
assert.deepEqual(spinnerTimeline(2000), { shown: true, hiddenAt: 2000 })
console.log('tamam')
```

İskelet, gerçek içerikle aynı boyutta olmalıdır; yoksa içerik gelince düzen kayar (CLS). Hareketli parıltı
(shimmer) azaltılmış hareket kipinde durur. Ekran okuyucuya iskelet değil, bölgedeki `aria-busy="true"` ve bir
"Yükleniyor" metni söylenir.

## Tuzaklar

| Belirti                                                      | Neden                                                  | Çözüm                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| Panel açılırken telefonda takılıyor                          | `height`/`top` canlandırılıyor                         | `transform`/`opacity`; yükseklik için grid `0fr → 1fr`      |
| Liste sıralanınca öğeler "ışınlanıyor"                       | Yer değişimi canlandırılmamış                          | FLIP ya da View Transitions                                 |
| Hızlı işlerde göz kırpar gibi döndürücü                      | Gösterge hemen çıkıyor                                 | 300 ms gecikme + en az 500 ms görünürlük                    |
| İçerik gelince sayfa zıplıyor                                | İskelet gerçek içerikten farklı boyutta                | Aynı boyut                                                  |
| Hareketi azalt açıkken hâlâ kayan paneller                   | JavaScript canlandırması ayara bakmıyor                | Her JS canlandırmasında ayarı denetleyin                    |
| Kullanıcı canlandırma bitmeden dokununca bir şey olmuyor     | Etkileşim canlandırma sonuna bağlanmış                 | Durum hemen değişsin; hareket yalnız görüntü                |
| Düğme yükleniyorken daralıp genişliyor                       | Metin değişince genişlik değişiyor                     | Sabit en küçük genişlik ya da metni yerinde tutup simge ekleyin |
| Ekran pil tüketiyor, ısınıyor                                | Sonsuz döngülü süs canlandırması                       | Kaldırın ya da görünür olduğunda ve kısa süre oynatın       |

## Denetim listesi

- [ ] Her canlandırmanın bir işi var (geri bildirim, yön, süreklilik); süs için hareket yok.
- [ ] Süreler ve eğriler belirteçlerden; çoğu 250 ms'nin altında.
- [ ] Yalnız `transform` ve `opacity` canlandırılıyor (küçük renk geçişleri hariç).
- [ ] Sistem "hareketi azalt" ayarı ve uygulama içi ayar her canlandırmada (JS dahil) uygulanıyor.
- [ ] Yükleniyor göstergesi 300 ms gecikmeli; düğme içi döndürücüde genişlik sabit.
- [ ] İskelet gerçek içerikle aynı boyutta; tazelemede veri yerinde kalıyor.
- [ ] Orta-alt düzey telefonda CPU yavaşlatmasıyla denendi, takılma yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yalnız `transform` ve `opacity` canlandır; süre 150–250 ms, eğri belirteçlerden. Hareket azalt
  ayarında hareketi kaldır, durumu koru. Yükleniyor göstergesini 300 ms gecikmeyle göster."
- **Modelin tipik hatası:** Her şeye `transition-all` ekler (genişlik, yükseklik, gölge de canlanır); 500 ms+ süreler
  seçer; `height` canlandırır; hareket azaltmayı yalnız CSS'te yapar, JS canlandırmalarını unutur; başarıya konfeti
  ya da sallanma ekler.
- **Çıktıda arayın:** `transition-all`, `transition: all`, `animate-bounce`, `animate-ping`, 400 ms üstü süreler,
  `height`/`top`/`left` canlandırmaları, `prefers-reduced-motion` denetimi olmayan JS canlandırmaları.
- **Doğrulama isteyin:** "Hareketi azalt açıkken ve kapalıyken aynı akışın kısa ekran kaydı ya da ekran görüntüleri."

## İlgili

- [Web performansı](web-performansi.md) — uzun görevler, CLS
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — hareket azaltma
- [Hata ve boş durumlar](hata-ve-bos-durumlar.md) — yükleniyor ve hata durumlarının metni
- [Tasarım sistemi](tasarim-sistemi.md) — hareket belirteçleri
- Çalışan örnek: [`Spinner.tsx`](../../uygulama/web/src/ui/Spinner.tsx), [`Toast.tsx`](../../uygulama/web/src/ui/Toast.tsx)
- [Dokunma ve işaretçi olayları](dokunma-ve-isaretci-olaylari.md) — basılı tutarak seçme, istemeden tekrar dokunma
- Başka kümelerde: [UX temelleri](../95-urun/ux-temelleri.md) (geri bildirim)
