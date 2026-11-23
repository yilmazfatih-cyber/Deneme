---
baslik: Liste sanallaştırma: binlerce satırı yalnız görüneni çizerek göstermek
ozet: Sanallaştırmanın ne zaman gerektiği ve ne zaman zarar verdiği, sabit ve değişken yükseklik, kaydırma çapası, tarayıcının yükseklik sınırı, erişilebilirlik ve sayfa içi bul (Ctrl+F) sorunları; çalışan hesaplarla.
etiketler: [performans, liste, sanallastirma, erisilebilirlik, onyuz]
duzey: ileri
guncellik: 2026-11
---

# Liste sanallaştırma: binlerce satırı yalnız görüneni çizerek göstermek

> Bu notu ne zaman okumalı: uzun bir liste (günlük, sohbet, ürün, kayıt geçmişi) kaydırırken takılıyorsa; birisi
> "listeyi sanallaştıralım" ya da "sanallaştırma kitaplığı ekleyelim" dediğinde; sanallaştırılmış listede satırlar
> zıplıyor, odak kayboluyor ya da Ctrl+F bir şey bulamıyorsa.

## Temel fikir

Sanallaştırmada DOM'da yalnız görünen satırlar ve üstte/altta birkaç **yedek** (overscan) satır bulunur; kaydırma
çubuğunu doğru tutmak için toplam yükseklik kadar boşluk bırakılır. On bin satırlık liste DOM'da on iki satırdır.

Kazanç gerçektir (düğüm sayısı, düzen, bellek); bedeli de gerçektir: tarayıcının kendi yetenekleri — sayfa içi bul,
ekran okuyucunun bütün listeyi görmesi, metin seçme, yazdırma, çapa bağlantısı, geri gelince kaydırma konumu —
bozulur ve kod karmaşıklaşır. Bu yüzden ilk soru "nasıl" değil, **"gerekiyor mu"**dur. Yanıt ölçümle verilir
([React performansı](react-performans-profilleme.md)).

## Karar tablosu

| Durum                                                           | Seçim                                                       | Neden                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Birkaç yüz basit satır                                          | Düz liste                                                   | Bedeli kazancından büyük; önce satır render'ını ucuzlatın     |
| Uzun liste, kullanıcı çoğunlukla baştakilerle ilgileniyor       | Sayfalama ya da "daha fazla göster"                         | Bul, ekran okuyucu, geri düğmesi bozulmaz; yaşlı kullanıcıya anlaşılır |
| Uzun sayfa, ağır bölümler (görselli kartlar)                    | CSS `content-visibility: auto` + `contain-intrinsic-size`   | Öğeler DOM'da kalır; boyama ertelenir                         |
| Binlerce satır, hepsi aynı yükseklikte (günlük, tablo)          | Sabit yükseklikli sanallaştırma                             | Hesap basit ve kesin                                          |
| Binlerce satır, farklı yükseklik (sohbet, kart, uzun metin)     | Ölçen sanallaştırma: tahmin + ölçüm + kaydırma çapası       | Zor kısım çapadır; hazır kitaplık ya da `sanal_liste`         |
| Yüz binlerce satır                                              | Sanallaştırma + parça parça veri + yükseklik sınırı önlemi  | Tarayıcılar öğe yüksekliğini sınırlar                         |
| Kullanıcı aradığını süzgeçle buluyor                            | Önce süzgeç; sonuç listesi kısa kalır                       | Sanallaştırma çoğu zaman gereksizleşir                        |

`content-visibility: auto` bu makinedeki Chromium'da destekleniyor; öteki tarayıcılarda desteği denetleyin ve
desteklemeyen tarayıcıda liste yine düz liste olarak çalışsın (yalnız daha yavaş).

## Sabit yükseklik

```js calistir
import assert from 'node:assert/strict'

// Sabit yükseklikli sanal liste: görünür aralık + yedek satırlar; DOM'da yalnız [start, end) çizilir.
function visibleRange({ scrollTop, viewport, rowHeight, count, overscan = 3 }) {
  const first = Math.floor(scrollTop / rowHeight)
  const last = Math.ceil((scrollTop + viewport) / rowHeight)
  const start = Math.max(0, first - overscan)
  const end = Math.min(count, last + overscan)
  return { start, end, offsetTop: start * rowHeight, totalHeight: count * rowHeight }
}

const base = { viewport: 600, rowHeight: 72, count: 10_000 }
assert.deepEqual(visibleRange({ ...base, scrollTop: 0 }), { start: 0, end: 12, offsetTop: 0, totalHeight: 720_000 })
assert.equal(visibleRange({ ...base, scrollTop: 7200 }).start, 97) // 100. satır üstte, 3 yedek
assert.equal(visibleRange({ ...base, scrollTop: 719_400 }).end, 10_000) // sonda taşmaz
assert.equal(visibleRange({ ...base, scrollTop: 0, count: 0 }).end, 0) // boş liste

// Tarayıcının öğe yüksekliği sınırı: bu makinedeki Chromium'da 33.554.428 px (öteki tarayıcılarda farklı).
const CHROMIUM_MAX_PX = 33_554_428
const reachableRows = (rowHeight) => Math.floor(CHROMIUM_MAX_PX / rowHeight)
assert.equal(reachableRows(40), 838_860) // 1 milyon satırlık listede son ~160 bin satıra kaydırılamaz
console.log('tamam')
```

Yükseklik sınırı bu makinede ölçüldü: kaydırılan kabın içine 34 milyon ve 100 milyon piksellik öğe konunca
`scrollHeight` 33.554.428'de kaldı. Sınırı aşan listede ya kaydırma ölçeklenir (çubuk konumu satıra oranla
eşlenir; ince ayarı zordur) ya da liste sayfalara bölünür.

"Sabit" yükseklik varsayımı **yazı boyutu büyütülünce** bozulur: kullanıcı telefonda yazıyı %200'e çıkarınca 72 px
satıra sığmayan metin taşar ya da kesilir. Yüksekliği `rem` ile tanımlayıp yazı boyutu değişince yeniden hesaplayın
ya da ölçen sanallaştırmaya geçin.

## Değişken yükseklik: tahmin, ölçüm, çapa

Ölçülmemiş satır tahmini yükseklikle yer kaplar; çizilince `ResizeObserver` gerçek yüksekliği yazar. "Bu piksel
hangi satırda?" sorusu önek toplamı üzerinde ikili aramadır; her ölçümden sonra toplamları yeniden hesaplamamak için
Fenwick ağacı kullanılır (her işlem O(log n)). Zor kısım **kaydırma çapasıdır**: görünür alanın üstündeki bir satır
büyürse (görsel yüklendi, tahmin ölçümle değişti) altındaki her şey aşağı itilir ve kullanıcının okuduğu satır kayar.

```js calistir
import assert from 'node:assert/strict'

// Değişken yükseklik: ölçülmemiş satır tahminle yer kaplar; ölçülünce yükseklik dizini güncellenir.
class Heights {
  constructor(count, estimate) {
    this.h = Array(count).fill(estimate)
  }
  offsetOf(i) {
    let sum = 0 // gerçekte Fenwick ağacı: O(log n) (bkz. sanal_liste/height_index.ts)
    for (let k = 0; k < i; k++) sum += this.h[k]
    return sum
  }
  indexAt(px) {
    let lo = 0 // ikili arama: px hangi satırın içinde?
    let hi = this.h.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.offsetOf(mid) <= px) lo = mid
      else hi = mid - 1
    }
    return lo
  }
}

// Kaydırma çapası: görünür alanın ÜSTÜNDEKİ satır büyürse okunan satır yerinde kalsın diye scrollTop aynı farkla kayar.
function measure(heights, index, real, scrollTop) {
  const delta = real - heights.h[index]
  const bottomBefore = heights.offsetOf(index) + heights.h[index]
  heights.h[index] = real
  return bottomBefore <= scrollTop ? scrollTop + delta : scrollTop
}

const list = new Heights(1000, 50)
let scrollTop = list.offsetOf(100) // kullanıcı 100. satırı okuyor
assert.equal(list.indexAt(scrollTop), 100)

const noAnchor = new Heights(1000, 50)
noAnchor.h[10] = 150 // üstteki satırın görseli yüklendi, satır büyüdü; düzeltme yok
assert.equal(noAnchor.indexAt(scrollTop), 98) // okunan satır kaydı: kullanıcı yerini kaybetti

scrollTop = measure(list, 10, 150, scrollTop) // çapalı ölçüm
assert.equal(list.indexAt(scrollTop), 100) // aynı satır yerinde
assert.equal(measure(list, 100, 80, scrollTop), scrollTop) // görünen satır büyüyünce düzeltme yok
console.log('tamam')
```

- Görünür alandaki satırın büyümesi düzeltilmez: kullanıcı onu görüyor, aşağısının itilmesi doğaldır.
- Tarayıcının kendi kaydırma çapası (`overflow-anchor`) her tarayıcıda yoktur ve sizin düzeltmenizle birlikte çalışırsa
  **iki kez** düzeltir. Kendi çapanızı yazıyorsanız kapta `overflow-anchor: none` verin.
- Tahmin gerçek ortalamadan çok uzaksa kaydırma çubuğu hızlı kaydırmada boy değiştirir; tahmini ölçülen
  yüksekliklerin ortalamasıyla güncelleyin.
- Görsellere `width` ve `height` (ya da `aspect-ratio`) verin: satır yüksekliği görsel yüklenmeden doğru çıkar,
  çapaya iş kalmaz.
- Sohbet gibi **ters** listelerde (yeni öğe altta) "en alttaysa altta kal" kuralı ayrıca gerekir.

Sıfırdan yazılmış, Fenwick ağaçlı, çapalı ve erişilebilir bir gerçekleme:
[`sifirdan/arayuz/src/sanal_liste`](../../sifirdan/arayuz/src/sanal_liste/README.md). Fenwick ağacının kendisi ve
testleri: [`algoritma/veri_yapilari/fenwick_tree.py`](../../algoritma/algoritma/veri_yapilari/fenwick_tree.py).

## Erişilebilirlik

- Ekran okuyucu yalnız DOM'dakini görür. Satırlara `role="listitem"` ile `aria-setsize` (toplam) ve
  `aria-posinset` (sıra) verin: okuyucu "10.000 öğeden 5.000." diyebilsin.
- **Odaktaki satırı sökmeyin.** Kullanıcı sekme tuşuyla bir satırdaki düğmeye geldi, sonra kaydırdı: satır DOM'dan
  çıkarsa odak sayfanın başına düşer. Odaklı satırın sırasını tutun ve görünür aralığın dışında kalsa da çizin.
- Klavyeyle başa ve sona gidilebilmeli (`Home`/`End` ya da "başa dön" düğmesi + `scrollToIndex`).
- Dokunma hedefleri satır sanallaştırılsa da en az 72 px (Köprü) ya da 48 px kalır; sabit yükseklik bunu kolaylaştırır.
- Yükleniyor, "liste sonu" gibi durumları canlı bölgeyle duyurun ([Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md)).

## Tarayıcı yeteneklerinin kaybı

| Yetenek                                | Sanallaştırılmış listede                     | Çare                                                     |
| -------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Sayfa içi bul (Ctrl+F)                 | Yalnız çizili satırlarda bulur               | Uygulama içi arama: veride arar, sonuca `scrollToIndex`  |
| Ekran okuyucuyla listede gezinme       | Yalnız çizili satırlar                       | `aria-setsize`/`aria-posinset`; arama ve atlama düğmesi  |
| Metin seçme ve kopyalama               | Çizilmeyen satırlar seçilemez                | "Tümünü kopyala" ya da dışa aktarma eylemi               |
| Yazdırma                               | Yalnız görünen satırlar basılır              | Yazdırma için düz liste görünümü                         |
| Geri gelince kaydırma konumu           | Tarayıcı geri yükleyemez                     | En üstteki satırın sırasını saklayıp `scrollToIndex`     |
| Çapa bağlantısı (`#kayit-500`)         | Hedef DOM'da yok                             | Adresten sırayı okuyup `scrollToIndex`                   |

`content-visibility: auto` bu kayıpların çoğunu yaşatmaz, çünkü öğeler DOM'da kalır; yalnız ekran dışındakilerin
düzeni ve boyaması ertelenir. On binlerce satırda yine de DOM düğüm sayısı ve bellek sorun olur; orada gerçek
sanallaştırma gerekir.

## React'te dikkat

- `key` **kayıt kimliği** olmalı, görünür dilimdeki sıra (`index`) değil. Dilim kaydıkça aynı `index` başka kayda
  geçer; React bileşeni yeniden kullanır ve satırın iç durumu (açık menü, yazılmış taslak, onay kutusu) başka kayda
  taşınır.
- Satır bileşeni `memo`'lu ve prop'ları sabit olsun; yoksa her kaydırma karesinde bütün görünür satırlar yeniden
  render olur. Sanallaştırma satır render'ının pahalılığını çözmez.
- Yüksekliği render sırasında DOM'dan okumayın; ölçümü `ResizeObserver` ile yapın.
- Hazır kitaplık seçerken sorun: değişken yükseklik, ters liste, ızgara, yatay, odak ve erişilebilirlik desteği var
  mı; kitaplığın sürüm ve bakım durumunu kurulu paketten okuyun.

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Kaydırınca satırların taslakları/onay kutuları yer değiştiriyor | `key` görünür dilimdeki sıra                         | `key` = kayıt kimliği                                       |
| Okurken liste zıplıyor                                      | Üstteki satır ölçülünce ya da görsel yüklenince büyüdü   | Kaydırma çapası; görsellere boyut                           |
| Hızlı kaydırmada çubuk titriyor, boy değiştiriyor           | Tahmin gerçek ortalamadan çok farklı                     | Tahmini ölçülen ortalamayla güncelleyin                     |
| Son satırlara bir türlü inilemiyor                          | Tarayıcının öğe yüksekliği sınırı                        | Sayfalama ya da ölçekli kaydırma                            |
| Ctrl+F kaydı bulamıyor                                      | Satır DOM'da değil                                       | Uygulama içi arama                                          |
| Sekmeyle gezerken odak sayfanın başına düşüyor              | Odaktaki satır kaydırınca söküldü                        | Odaklı satırı her zaman çizin                               |
| Yazı büyütülünce satır metni kesiliyor                      | Sabit piksel yükseklik varsayımı                         | `rem` tabanlı yükseklik ya da ölçen sanallaştırma           |
| Geri gelince liste başa dönüyor                             | Kaydırma konumu saklanmadı                               | En üst satırın sırasını saklayın                            |
| Sanallaştırıldı, yavaşlık sürüyor                           | Asıl maliyet satır render'ı ya da veri işleme            | Profiler; `memo` + sabit prop'lar; süzmeyi önbellekleyin    |
| Satırlar iki kez kayıyor                                    | Tarayıcı çapası + kendi çapanız                          | `overflow-anchor: none`                                     |

## Denetim listesi

- [ ] Sanallaştırma kararı ölçümle verildi; sayfalama, "daha fazla göster" ve `content-visibility` tartıldı.
- [ ] `key` kayıt kimliği; satır bileşeni `memo`'lu ve prop'ları sabit.
- [ ] Değişken yükseklikte üstteki satır büyüyünce okunan satır yerinde kalıyor (birim testli).
- [ ] Toplam yükseklik tarayıcı sınırının altında ya da önlem alınmış.
- [ ] Liste rolleri, `aria-setsize`/`aria-posinset` var; odaklı satır sökülmüyor; klavyeyle başa ve sona gidiliyor.
- [ ] Sanallaştırılmış listede uygulama içi arama var.
- [ ] Yazı boyutu %200'de satırlar taşmıyor; 360 px genişlikte yatay kaydırma yok.
- [ ] Geri dönüşte kaydırma konumu korunuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sanallaştırmadan önce satır sayısını ve satır başına render süresini ölç; birkaç yüz satırda
  sanallaştırma, sayfalama ya da `content-visibility` öner. Sanallaştırırsan `key` kayıt kimliği olsun, odaklı satırı
  çizili tut, `aria-setsize`/`aria-posinset` ver, uygulama içi arama ekle, geri gelince konumu koru."
- **Modelin tipik hatası:** Kitaplık ekleyip görünür dilimdeki `index`'i anahtar yapar; değişken yükseklikli içeriğe
  sabit yükseklik verir; erişilebilirliği ve odağı unutur; yirmi satırlık menüyü bile sanallaştırır.
- **Çıktıda arayın:** sanal satırlarda `key={index}`/`key={i}`; metin içeren satırda sabit `height: …px`;
  `aria-setsize` yokluğu; kaydırma konumunu saklayan kod yokluğu; `overflow-anchor` ayarı.
- **Test isteyin:** "üstteki satır büyüyünce görünen satır değişmez" saf işlev testi (yukarıdaki gibi) ve klavyeyle
  sona gidilen, odak kaybolmayan bir uçtan uca test.

## İlgili

- [React performansı](react-performans-profilleme.md) — sanallaştırmadan önce ölçme, satır render maliyeti
- [Web performansı](web-performansi.md) — INP, uzun görevler, büyük DOM
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — odak yönetimi, canlı bölgeler
- [Yönlendirme ve URL](yonlendirme-ve-url.md) — kaydırma konumunu geri yükleme
- Sıfırdan gerçekleme: [`sanal_liste`](../../sifirdan/arayuz/src/sanal_liste/virtual_list.ts),
  [`range.ts`](../../sifirdan/arayuz/src/sanal_liste/range.ts) (görünür aralık ve çapa),
  [`height_index.ts`](../../sifirdan/arayuz/src/sanal_liste/height_index.ts) (Fenwick ağacı)
