# Risale-i Nur el yazmaları: bilinen metinli etiketleme kaynağı

Risale-i Nur'un el yazması nüshalarının metni bellidir. Bu yüzden etiketlerken satırı okuyup yazmanız gerekmez:
telefon sayfası satır görüntüsünün yanında bilinen metni gösterir, siz yalnızca satırın **bittiği kelimeye dokunursunuz**.
Model tahmini gerekmez, bu yüzden şu anki zayıf modelden bağımsız olarak gerçek etiket birikir.

Sayfa: <https://claude.ai/artifact/WfoJPfRokkckLaXtJYeha5>, "Kuyruk" seçicisinde **Risale-i Nur el yazmaları**.
Sayfa özeldir ve öyle kalmalıdır (aşağıda telif notuna bakın).

## Kuyruktaki el yazmaları (185 sayfa, 3.177 satır)

| Belge | archive.org kimliği | Görüntü | Kuyrukta | Satır | Bilinen metin (kelime aralığı) |
|---|---|---|---|---|---|
| 22. ve 23. Sözler, Milli Kütüphane arşivi | [`acrumiyyenahiv`](https://archive.org/details/acrumiyyenahiv) | 64 açılım, 3000 px | 120 sayfa (0001a–0062b) | 1.657 | `sozler.json` 74493–90719 |
| Asâ-yı Mûsâ, Milli Kütüphane arşivi | [`omernasuhibilmen2_201910`](https://archive.org/details/omernasuhibilmen2_201910) | 300 görüntü, ~1280 px | 65 sayfa (görüntü 2–66) | 1.520 | `asa.json` 69–20100 |

Eşleme gözle doğrulandı:

- **22. Söz** 0001a'da besmele ve "وَيَضْرِبُ اللّهُ اْلاَمْثَالَ…" ile başlar (kelime 74493). **23. Söz** 0062b'de
  "وَ آخِرُ دَعْوَيهُمْ اَنِ الْحَمْدُ لِلّهِ رَبِّ الْعَالَمِينَ" ile biter (kelime 90719). Sonraki iki satır kâtibin duasıdır
  ve basılı metinde yoktur, bu yüzden **Atla** ile geçin.
- 0000b kapak sayfasıdır, kuyruktan çıkarıldı. 0036–0037 açılımlarında metin yoktur: biri 23. Söz'ün kapağı, diğerinde
  "36-38 arası sayfalar yapışık olduğundan taranamadı" notu var. 22. Söz 0035b'de biter, 23. Söz 0038a'da başlar,
  aradan metin eksilmez.
- **Asâ-yı Mûsâ** görüntü 2 "Aziz, sıddık kardeşlerim… Madem Risale-i Nur makine ile…" mektubuyla başlar (kelime 69).
  Görüntü 3 "İmam-ı Ali (r.a.) Celcelutiye'sinde…" ile sürer. Görüntü 66'nın ilk satırı
  "Hem meleklere imanın saadet-i dünyeviyeye…" (kelime 19797), son satırı "…Otuzikinci Söz'ün âhirindeki
  müvazenede… izah edilmiş" (kelime 20099). Bu nüsha düşük çözünürlüklüdür (satır yüksekliği ~38 px). Her sayfanın
  ilk satırı çoğunlukla gürültüdür (üst kenar).

Kuyruğa alınmayanlar:

- `siyeri-nebi-osman-keskioglu`: Sözler, Diyanet arşivi, 388 görüntü. Sırası basılı metinden farklı: önsöz, fihrist,
  ardından 31. Söz. Sayfa→bölüm eşlemesi elle çıkarılmadan kullanılamaz.
- `sozlerelyazma`: Küçük Sözler, müellif hattı, 87 görüntü. Dalgalı satırlarda bölütleme zayıf kalıyor.

## Telefonda kullanım

1. Satır görüntüsü telefonda sağdan sola 2–3 parçaya bölünüp üst üste gösterilir. İlk satır en sağdaki parçadır;
   parçalar arasında %4 bindirme vardır.
2. A/B/C, bilinen metinden tahmini aralıklardır: k−1, k ve k+1 kelime. Son kelime kalın yazılır. Doğruysa seçin
   ya da 1/2/3 tuşuna basın.
3. Değilse alttaki metinde **satırın son kelimesine dokunun**, sonra **Kaydet**'e basın.
   - Başlangıç fazla ilerideyse daha önceki bir kelimeye dokunun; başlangıç oraya çekilir.
   - Başlangıcı ileri almak için **Başı seç**'e, sonra kelimeye dokunun.
   - ◀/▶ bir satırlık kaydırır; **Ara** metinde kelime bulur (ör. `havuzda`).
4. El yazması basılı metinden farklıysa D kutusundaki metni düzeltip Kaydet'e basın; kayıt `duzeltildi: true` olarak
   işaretlenir. Örnek: 0062b'de el yazması "وارحم حافظ على" der, baskıda "وَارْحَمْ رُفَقَائِى" yazar.
5. Kenar notu, sayfa kenarı ya da kâtip duası gibi metinde olmayan satırlar için **Atla**'ya basın; bunlar metin tüketmez.
   Kesimi bozuk satır için **Kesim bozuk**'a basın; o satırın metni tüketilmiş sayılır.
6. Sonraki satır, son etiketli satırın bittiği kelimeden başlar. Etiketlendikçe gerçek kelime/satır oranı öğrenilir,
   tahmin kendini düzeltir.

## Veri biçimi

- Sayfa belgesi (`sayfalar/<kimlik>`): `kaynak:'risale'`, `belge`, `belge_sira`, `metin_dosya`
  (`kuyruk/metin/<x>.json`), `metin_bas`/`metin_son`, `sprite_yol`, `yazi:'latin'`, satırlar:
  `{sira, y, w, h, kutu, durum, metin, secim, t_bas, t_len}`.
- Etiketli satır: `{durum:'etiketli', metin, secim:'A'|'B'|'C'|'D', bas, son, yazi:'latin', duzeltildi, etiket_zaman}`.
  `bas..son` metin dosyasındaki kelime aralığıdır. Metin dosyası değişirse bu indeksler bozulur.
- Metin dosyası: `{ad, kaynak, kelimeler[], paragraf[]}`. Sözler 230.240 kelime, Asâ-yı Mûsâ 73.835 kelime.

**Etiketler Latin harfli çeviriyazıdır.** Açık lisanslı, Arap harfli bir Risale metni bulunamadı. Arapça ibareler
metinde de el yazmasında da Arap harfiyle durur. Bu yüzden bu etiketler doğrudan Arap harfli CRNN'i eğitmez. Kullanmanın
iki yolu var:

- Görüntüden Latin harfli çeviriyazıya giden ikinci bir çıkış (CTC başlığı) eğitmek.
- Arap harfli metin bulunursa kelime düzeyinde eşleyip etiketleri ona çevirmek. Aday kaynaklar: Hayrat Risale-i Nur
  uygulaması (Osmanlıca/Latin) ve nur.gen.tr. Henüz doğrulanmadı; ağ izni gerektirir.

## Yeniden üretme

```bash
# 1) IIIF manifesti ve sayfa görüntüleri (archive.org; ağ izni: iiif.archive.org ve ia*.us.archive.org düğümleri)
curl -sL https://iiif.archive.org/iiif/3/acrumiyyenahiv/manifest.json -o veri/ham/risale/manifest_acrumiyyenahiv.json
python scripts/iiif_risale.py indir veri/ham/risale/manifest_acrumiyyenahiv.json veri/ham/risale/sayfa/acrumiyyenahiv --genislik 3000
curl -sL https://iiif.archive.org/iiif/3/omernasuhibilmen2_201910/manifest.json -o veri/ham/risale/manifest_omernasuhibilmen2_201910.json
python scripts/iiif_risale.py indir veri/ham/risale/manifest_omernasuhibilmen2_201910.json veri/ham/risale/sayfa/asa --genislik 3000 --sayfalar 0-66

# 2) Bilinen metin (RNK-EPUB, archive.org; Latin harfli)
python scripts/archive_indir.py RNK-EPUB "Sozler.epub" veri/ham/risale/RNK-EPUB
python scripts/archive_indir.py RNK-EPUB "Asayı musa.epub" veri/ham/risale/RNK-EPUB
python scripts/risale_metin.py veri/ham/risale/RNK-EPUB/Sozler.epub sozler "Sözler"
python scripts/risale_metin.py "veri/ham/risale/RNK-EPUB/Asayı musa.epub" asa "Asâ-yı Mûsâ"

# 3) Kuyruk: açılım bölme → satır bölme → sprite + sayfa belgesi (komutlar scripts/risale_kuyruk.py başında)
# 4) Yayım: web/kuyruk/ altına sprite'lar ve metin dosyaları kopyalanır, artifact files ile yayımlanır;
#    veri/risale_kuyruk/*.json belgeleri ArtifactData batch ile sayfalar koleksiyonuna yazılır (50'şerli).
```

## Telif ve gizlilik

Said Nursî 1960'ta vefat etti. Türkiye'de eserler sahibinin ölümünden itibaren 70 yıl korunur, yani metin
**2030 sonuna kadar** koruma altındadır. Görüntüler archive.org'daki "Milli Kütüphane arşivi" etiketli yüklemelerdir,
RNK-EPUB de bir archive.org yüklemesidir. Bu veriler yalnızca kişisel araştırma içindir:

- Artifact sayfası özel kalmalı.
- Sprite'lar, metin dosyaları ve etiketler git'e girmez (`web/kuyruk/`, `veri/` yok sayılır).
- Bu veriyle eğitilmiş bir model ya da veri seti, haklar netleşmeden yayımlanmamalı.
