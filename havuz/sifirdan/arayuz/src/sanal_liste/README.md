# sanal_liste — değişken yükseklikli sanallaştırılmış liste

## Ne yapar

On binlerce öğelik bir listeyi (sohbet geçmişi, kayıt günlüğü, ürün listesi) akıcı kaydırır: DOM'da yalnız
görünen öğeler ve üstte/altta birkaç yedek öğe bulunur. Öğeler farklı yükseklikte olabilir; ölçüldükçe dizin
güncellenir ve kullanıcının baktığı satır yerinden kaymaz.

```ts
import { VirtualList } from './index.ts'

const liste = new VirtualList(document.getElementById('kap')!, {
  count: 10_000,
  estimate: 56,
  label: 'Mesajlar',
  render: (i) => Object.assign(document.createElement('article'), { textContent: mesajlar[i] }),
})
liste.scrollToIndex(4999, 'center')
```

## Nasıl çalışır

```
kaydırma konumu ──► HeightIndex.indexAt(scrollTop)        (hangi öğe en üstte?)   O(log n)
                └─► görünür aralık [başlangıç − overscan, son + overscan)
                     └─► yalnız bu öğeler çizilir; liste translateY(offsetOf(başlangıç)) ile yerine kayar
ResizeObserver ──► gerçek yükseklik ──► HeightIndex.setHeight(i, h)                   O(log n)
                                     └─► öğe görünür alanın üstündeyse scrollTop += fark  (çapa)
```

**Fenwick ağacı (`height_index.ts`).** "i. öğe kaç pikselde başlar?" bir önek toplamıdır. Düz dizide her
yükseklik değişikliğinden sonra toplamları yeniden hesaplamak O(n) olurdu. İkili dizinli ağaçta her düğüm,
dizininin en düşük 1 bitinin uzunluğu kadar bir aralığın toplamını tutar: güncelleme ve önek toplamı
O(log n). "Şu piksel hangi öğede?" sorusu ağaçta ikili basamak inişiyle (en büyük 2 kuvvetinden başlayarak)
yine O(log n)'de yanıtlanır. Ağaç doğrusal zamanda kurulur. Test: 1.000 öğe, 2.000 rastgele güncelleme; her
100 adımda önek toplamı ve konum araması düz dizi modeliyle karşılaştırılır.

**Tahmin ve ölçüm.** Ölçülmemiş öğe tahmini yükseklikle yer kaplar; çizilince `ResizeObserver` gerçek
yüksekliği yazar. Toplam yükseklik (kaydırma çubuğu) ölçüm ilerledikçe gerçeğe yaklaşır.

**Kaydırma çapası (`range.ts`).** Görünür alanın **üstündeki** bir öğe büyürse altındaki her şey aşağı itilir ve
kullanıcının okuduğu satır kayar. Düzeltme: o öğenin eski alt kenarı kaydırma konumunun üstündeyse
`scrollTop`'a aynı fark eklenir. Görünür alandaki öğenin büyümesi düzeltilmez (kullanıcı onu görüyor).

**Erişilebilirlik.** Kaydırılan kap bir bölgedir (`role="region"` + ad) ve klavyeyle odaklanır; öğeler
`role="listitem"` ile `aria-setsize`/`aria-posinset` taşır: ekran okuyucu "10.000 öğeden 5.000." diyebilir.

## Dosya haritası

| Dosya             | Sorumluluk                                             |
| ----------------- | ------------------------------------------------------ |
| `height_index.ts` | Fenwick ağacıyla yükseklik dizini, konum araması       |
| `range.ts`        | Görünür aralık, kaydırma çapası (saf işlevler)         |
| `virtual_list.ts` | DOM denetleyicisi: çizim, ölçüm, çapa, `scrollToIndex` |
| `index.ts`        | Dışa açılan tek giriş noktası                          |

## Sınırlar

- Yalnız dikey liste; yatay ve iki boyutlu ızgara yoktur (tablo gösterimi sabit satır yüksekliği kullanır).
- Ekran okuyucu yalnız DOM'daki öğeleri görür; listenin tamamında "bul" (Ctrl+F) çalışmaz.
- Öğe DOM düğümleri yeniden kullanılmaz (her girişte `render` çağrılır); çok ağır öğelerde ölçülmedi.
- Kaydırma çapası tarayıcının kendi `overflow-anchor` davranışına güvenmez; ikisi birlikte açık bırakılmamalı
  (gösterimde kap `overflow-anchor: none`).

## Buradan nereye

- "Sona yapışık" sohbet listesi: yeni öğe gelince en alttaysa altta kal.
- DOM düğümü havuzu: kaybolan öğenin düğümünü yeni öğe için yeniden kullanmak.
- `sinyal` ile: öğe verisi sinyal olunca yalnız değişen satırı yeniden çizmek.
