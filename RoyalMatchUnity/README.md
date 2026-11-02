# Royal Match tarzı eşle-3 oyunu (Unity)

Royal Match'in oyun döngüsünü ve mekaniklerini bire bir hedefleyen, **Unity 2022.3 LTS** ile yazılmış
tam bir eşle-3 (match-3) oyunu. Görseller ve sesler dış dosya kullanmadan **kodla üretilir**; proje
yalnızca C# betikleri ve boş bir sahneden oluşur, Unity'de açıp Play'e basmak yeterlidir.

> **Telif notu:** Royal Match'in gerçek sanat dosyaları (karakter, taş, arayüz çizimleri) Dream Games'e
> aittir ve kopyalanmamıştır. Buradaki görseller aynı *stili* (parlak, yuvarlak hatlı, güçlü kontrastlı
> çizgi film görünümü; mavi şato arka planı; altın/ahşap arayüz) hedefleyen özgün, prosedürel çizimlerdir.
> Mekanikler telife konu değildir ve Royal Match ile aynıdır.

## Açma ve çalıştırma

1. Unity Hub → **Add project from disk** → bu klasörü (`RoyalMatchUnity`) seçin. Önerilen sürüm 2022.3.x.
2. `Assets/Scenes/Main.unity` sahnesini açın (sahne boştur; `Bootstrap` her şeyi çalışma anında kurar).
3. Game penceresini **dikey** bir çözünürlüğe alın (ör. 1080×1920 veya 9:16) ve **Play**'e basın.
4. Android/iOS için **File → Build Settings** → platformu seçin; `Player Settings → Default Orientation: Portrait`.

Giriş: fare veya dokunma. Taşı sürükleyin ya da iki komşu taşa sırayla dokunun. Güçlendiriciye
dokunup bırakmak onu yerinde patlatır (bir hamle harcar).

## Mekanikler (Royal Match ile aynı)

| Mekanik | Kural |
| --- | --- |
| Eşleme | Aynı renkten 3+ taşı yatay/dikey hizalayın. 6 renk (kırmızı, mavi, yeşil, sarı, mor, turuncu). |
| **Roket** | 4'lü düz eşleme. Eşlemeye dik yönde (yatay 4 → dikey roket) bir satır/sütunu temizler. |
| **TNT** | L veya T biçimli eşleme. 5×5 alanı patlatır. |
| **Işık Topu** | 5'li düz eşleme. Değiştirildiği taşın rengindeki tüm taşları temizler. |
| **Pervane** | 2×2 kare eşleme. Komşu 4 hücreyi vurur, sonra hedefe (engel/hedef renk) uçup vurur. |
| Roket + Roket | Satır ve sütun birlikte (haç). |
| Roket + TNT | 3 satır + 3 sütun. |
| TNT + TNT | 7×7 patlama. |
| Pervane + Pervane | 3 pervane havalanır, her biri 3×3 vurur. |
| Pervane + Roket/TNT/Işık Topu | Pervane güçlendiriciyi hedefe taşır ve orada patlatır. |
| Işık Topu + Roket/TNT/Pervane | En çok bulunan rengin tüm taşları o güçlendiriciye dönüşür ve patlar. |
| Işık Topu + Işık Topu | Tüm tahta temizlenir. |
| Zincirleme | Bir patlamanın vurduğu güçlendirici de patlar. |
| Engeller | **Kutu** (1–3 can), **Vazo** (2), **Tabak** (1–3 kat), **Yumurta** (2), **Kasa** (3), **Posta Kutusu** (3): komşu eşleme ve güçlendirici vuruşuyla hasar alır. **Çimen** (1–2 kat): üstündeki taş eşlenince temizlenir. **Zincir**: taşı kilitler; taş eşlenince kırılır. |
| Yer çekimi | Taşlar düz düşer; engelin altındaki boşluğa yan-üstten kayar; beslenemeyen hücre yerinde doğurur. |
| Hamle yoksa | Tahta otomatik karıştırılır. 4 sn hareketsizlikte ipucu titrer. |
| Seviye sonu bonusu | Hedefler bitince kalan her hamle bir taşı Roket/Pervane/TNT'ye çevirip patlatır. |
| Hamle bitti | 900 altına +5 hamle ile devam ya da vazgeç (seri sıfırlanır). |
| Oyun içi güçlendiriciler | **Çekiç** (tek hücre), **Ok** (satır), **Top** (sütun), **Soytarı Şapkası** (karıştır). Hamle harcamaz; biten 400 altına alınır. |
| Başlangıç güçlendiricileri | Seviye öncesi Roket / TNT / Işık Topu seçilir; biten 250 altın. |
| Kazanma serisi | 1 seri → Roket, 2 → +TNT, 3 → +Işık Topu ücretsiz başlangıç. |
| Can | 5 can, 30 dakikada bir yenilenir; 900 altına doldurulur. |
| Yıldız ve Şato | Her seviye 1 yıldız. Odalardaki her görev 1 yıldız, 3 stil seçeneği. Oda bitince yenisi açılır (6 oda). |
| Zorluk | Her 7. seviye **Zor** (mor), her 15. seviye **Çok Zor** (koyu kırmızı); hamle kısılır. |

Seviyeler `LevelGenerator` tarafından belirlenimci üretilir: engeller sırayla açılır (çimen 2, kutu 4,
vazo 8, tabak 12, yumurta 16, zincir 20, posta kutusu 26, kasa 32), tahta 7×7 → 8×8 → 9×9 büyür,
10. seviyeden sonra köşe kesikli şekiller gelir.

## Görsel tasarım ve animasyon

Ekran taslakları `Docs/taslak-*.png` dosyalarında (oyun, harita, seviye öncesi, kazanma, oda).
Görseller 256 px'de SDF boyamayla üretilir: dikey ışık geçişi, altta iç gölge, üstte kenar ışığı,
kalın koyu kenar, büyük yumuşak parıltı. Arayüz dili: ahşap çerçeve + altın şerit + parşömen pano,
koyu cam göstergeler, renkli kurdele başlıklar, alt kenarı koyu hacimli düğmeler.

Animasyonlar (hepsi kodla, dış paket yok):

- Taşlar yukarıdan sırayla düşer, yere inince ezilip toparlanır; geçersiz hamlede titrer.
- Hedefe sayılan her taş tahtadan üst panodaki simgeye kavisle uçar, varınca sayaç düşer ve simge zıplar.
- Güçlendirici oluşumunda taşlar merkeze toplanır, halka ve parıltıyla yeni taş yaylanarak belirir.
- Roket izi, TNT halkası + ekran sarsıntısı + beyaz flaş, Işık Topu şimşekleri, Pervane kavisli uçuş.
- Üst pano ve güçlendirici tepsisi ekrana yaylanarak girer; seçili güçlendirici nabız atar; hamle ≤ 5 iken kutu kızarır.
- Kazanma: konfeti, sırayla beliren üç yıldız, artan altın sayacı, yaylanan Devam düğmesi.
- Harita: Kral hafifçe sallanır, bulutlar kayar, seviye düğmesi nabız atar; tüm düğmeler basınca küçülür.
- Pencereler küçükten yaylanarak açılır, perde yumuşak belirir; odada yeni eşya yaylanarak yerleşir, boş yerler nabız atar.

## Kod yapısı

```
Assets/Scripts/
  Core/      Bootstrap (otomatik kurulum), GameManager (ekran akışı), SaveData (PlayerPrefs JSON), Tween, Enums
  Board/     BoardModel (saf oyun mantığı: eşleme, güçlendiriciler, kombolar, engeller, yer çekimi, karıştırma)
             BoardController (girdi, tur akışı, animasyon), BoardView (taş/efekt görünümleri), LevelData + LevelGenerator
  Art/       Painter (SDF tabanlı piksel boyama), ArtLibrary (taşlar, güçlendiriciler, engeller), ArtIcons (arayüz, kral, odalar)
  UI/        UiKit (uGUI kurucu), HudScreen, MapScreen (+ seviye öncesi, mağaza, ayarlar), RoomScreen
  Audio/     Sfx (sentezlenmiş sesler)
Docs/        Ekran taslakları ve üretilen görsellerin önizlemeleri
```

`BoardModel` Unity bileşeni değildir; `Clone()` ile kopyalanıp simülasyon yapılabilir. Geliştirme
sırasında 80 seviye bir adım ileri bakan açgözlü oyuncuyla oynatıldı: tüm kombolar, bonus turu ve
tahta tutarlılık denetimleri (boş hücre yok, engel+taş çakışması yok, hedef negatife düşmüyor) geçti;
kazanma oranı yaklaşık %56.

## Ayarlanabilir sabitler

- `Save.cs`: can sayısı/süresi, devam ve güçlendirici fiyatları.
- `LevelGenerator.Generate`: hamle formülü (`20 + engel×0.65 + renk×0.35`), zorluk çarpanları, engel açılış seviyeleri.
- `Art.*`: renk paleti (`PieceBase`) ve taş biçimleri (`PieceShape`).
