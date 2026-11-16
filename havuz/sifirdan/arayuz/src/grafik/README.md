# grafik — bağımlılıksız SVG grafik kütüphanesi

## Ne yapar

Veriden erişilebilir SVG grafikler üretir: çizgi, alan, sütun (gruplu), dağılım, pasta ve halka. Ölçekler
(doğrusal, zaman, kategorik) ve "güzel" eksen adımları, eksen ve ızgara, açıklama (lejant), ipucu, kap
genişliğine uyan boyut, koyu/açık tema, Türkçe sayı ve tarih biçimi; ekran okuyucu için başlık/açıklama,
veri tablosu yedeği ve klavyeyle gezinme. Çizim saf işlevdir (Node'da da çalışır); etkileşim tarayıcıdadır.

```ts
import { cartesianChart, mountChart, chartCss } from './index.ts'

document.head.append(Object.assign(document.createElement('style'), { textContent: chartCss }))
const tanim = {
  type: 'line' as const,
  title: 'Aylık gelir',
  x: { kind: 'category' as const, values: ['Oca', 'Şub', 'Mar'] },
  series: [{ name: 'Gelir', values: [1200, 1850, 2400] }],
}
mountChart(document.getElementById('kap')!, {
  title: tanim.title,
  build: (width) => cartesianChart({ ...tanim, width }),
})
```

## Nasıl çalışır

```
veri ─► ölçekler ─► koordinatlar ─► SVG dizgisi (kaçışlanmış)  ─┐
         │                                                      ├─► mountChart: figure + lejant + SVG
         └► eksen çizgileri ("güzel" adımlar, Türkçe etiket) ───┘     + ipucu + canlı bölge + veri tablosu
```

**Güzel adımlar (`ticks.ts`).** Ham adım = aralık / istenen çizgi sayısı; 10'un kuvvetine bölünür ve 1, 2, 5
ya da 10'a yuvarlanır (eşikler √2, √10, √50). Değerler `adım × tamsayı` olarak üretilip adımın ondalık
basamağına yuvarlanır: `0,1 × 3 = 0,30000000000000004` eksene sızmaz. `niceDomain([3, 97])` → `[0, 100]`.

**Ölçekler (`scales.ts`, `time.ts`).** Doğrusal ölçek eşler ve ters eşler (fare konumundan değer). Bant ölçeği
kategorilere eşit bantlar verir (iç/dış boşluk oranıyla). Zaman ölçeğinde çizgi adımı aralığa göre seçilir
(sn, dk, sa, gün, hafta, ay, çeyrek, yıl) ve ay/yıl adımları **takvimle** atılır (çeyrekler Oca/Nis/Tem/Eki).
Etiketler adıma uygun ayrıntıdadır: `14:05`, `16 Kas`, `Nis 2026`, `2030`. Hesaplar UTC takvimindedir.

**Türkçe biçim (`format.ts`).** `1.234.567,89`; eksende 10.000 ve üstü kısaltılır: `15,3 B`, `1,2 Mn`,
`3,4 Mr` (Intl, sayı ile kısaltma arasına bölünmez boşluk koyar); yüzde `%25,6`.

**Erişilebilirlik.**

- SVG `role="img"` + `aria-labelledby` ile `<title>` ve `<desc>`'e bağlıdır; açıklama verilmezse her serinin
  en düşük/en yüksek değeri otomatik özetlenir. SVG içinde odaklanılabilir öğe yoktur.
- Çizim alanı (`.grafik-cizim`) klavyeyle odaklanır: `←/→` noktalar, `↑/↓` seriler, `Home/End` uçlar,
  `Esc` gizle. Seçilen nokta vurgulanır, ipucunda görünür ve `aria-live` bölgesiyle duyurulur.
- Her grafiğin altında açılır **veri tablosu** vardır (`<details>`): grafiği göremeyen kullanıcı sayıları okur.
- Lejant HTML'dir (renk kutusu + ad), dar ekranda alt satıra kayar. Pasta dilimlerinde etiket yoktur (küçük
  dilimde okunmaz, renk karşıtlığı garanti edilemez); adlar ve paylar lejanttadır.
- Seri renkleri renk körlüğü düşünülerek seçildi; iki temada da zemine karşı en az 3:1 karşıtlık
  **hedeflendi** (otomatik axe taraması gösterimde çalışır; renk ölçümü ayrıca yapılmadı).

**Güvenlik.** Kullanıcı verisi (başlık, kategori, seri adı) SVG'ye ve tabloya her zaman `escapeXml` ile girer;
test, başlığı `<script>` olan bir grafiğin çözümlendiğinde hiç `<script>` öğesi içermediğini denetler.

**Tema.** Renkler CSS değişkenleridir (`--g-s1` … `--g-s6`, `--g-metin`…). `chartCss` sayfaya bir kez
eklenir; koyu tema `prefers-color-scheme` ya da `data-tema="koyu"` ile gelir. İndirilecek tek başına SVG için
`standaloneSvg` stili gömer.

## Dosya haritası

| Dosya          | Sorumluluk                                                  |
| -------------- | ----------------------------------------------------------- |
| `ticks.ts`     | Güzel adım, çizgi değerleri, güzel tanım aralığı            |
| `scales.ts`    | Doğrusal ve bant ölçekleri                                  |
| `time.ts`      | Zaman ölçeği, takvim çizgileri, Türkçe tarih etiketleri     |
| `format.ts`    | Türkçe sayı, kısaltma, yüzde, tarih                         |
| `svg.ts`       | Öğe kurucusu, XML kaçışı                                    |
| `axis.ts`      | Eksenler, ızgara, etiket seyreltme                          |
| `cartesian.ts` | Çizgi, alan, sütun, dağılım; otomatik özet                  |
| `pie.ts`       | Pasta/halka, yay yolu                                       |
| `table.ts`     | Lejant ve veri tablosu (HTML)                               |
| `theme.ts`     | CSS değişkenleri, koyu/açık tema, tek başına SVG stili      |
| `interact.ts`  | Yerleştirme, ipucu, klavye, canlı bölge, yeniden boyutlanma |
| `types.ts`     | Ortak türler                                                |

## Sınırlar

- Yığılmış sütun/alan, logaritmik ölçek, ikinci y ekseni, yakınlaştırma/kaydırma yoktur.
- Etiket genişliği yaklaşık hesaplanır (karakter × 6,6 px); çok uzun etiketler seyreltilir, kesilmez.
- Zaman ölçeği UTC'dir; yerel saat dilimiyle çizgi (ör. yerel gece yarısı) gerekiyorsa veri dönüştürülmeli.
- Binlerce noktada SVG ağırlaşır (ölçülmedi); büyük veri için Canvas çizimi gerekir.

## Buradan nereye

- Yığılmış sütun: `cartesian.ts`'te seri değerlerini toplayarak taban çizgisini kaydırmak.
- Logaritmik ölçek: `scales.ts`'e `logScale` + `ticks.ts`'e 1-2-5 dizisini her onlukta tekrarlayan `logTicks`.
- Kıvılcım çizgisi (sparkline): eksensiz küçük çizgi, metin içinde.
- CSV indirme: veri tablosunun satırlarından.
