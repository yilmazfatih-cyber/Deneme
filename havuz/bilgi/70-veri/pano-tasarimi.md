---
baslik: Pano tasarımı
ozet: Panonun sorusu ve okuru, üst sıradaki ölçütler, karşılaştırma bağlamı (önceki dönem, hedef), yarım dönem tuzağı, filtreler, aşırı yükleme ve tanımların panoda görünmesi.
etiketler: [pano, gorsellestirme, olcut, analitik, urun, raporlama]
duzey: temel
guncellik: 2026-11
---

# Pano tasarımı

> Bu notu ne zaman okumalı: yeni bir pano (dashboard) kurarken ya da modele kurdururken; panoya "bir grafik daha"
> eklemeden önce; panodaki sayı "düştü" göründüğünde ve alarm vermeden önce; kimsenin bakmadığı bir panoyu elden
> geçirirken.

## Temel fikir

Pano bir **soruya** ve bir **okura** göre kurulur: "Ürün geçen hafta büyüdü mü, nerede sorun var? — proje sahibi,
her pazartesi." Soru ve okur yazılamıyorsa elinizdeki şey pano değil, grafik yığınıdır.

Okuma sırası önem sırasıdır: en üstte 3–5 ana ölçüt (değer + karşılaştırma + küçük eğilim), altında onları
açıklayan kırılımlar, en altta ayrıntı. **Bağlamsız sayı yorumlanamaz**: her ölçütün yanında aynı uzunlukta önceki
dönem, geçen yılın aynı dönemi ya da hedef durur.

Bitmemiş dönemi bitmiş dönemle karşılaştırmak (**yarım dönem tuzağı**) her pazartesi sahte bir düşüş üretir.
Tanımlar panoda görünür: ölçütün tanımı, son güncelleme, saat dilimi, kesinleşmemiş günler. Pano izlemek içindir;
bozulmayı panoya bakarak değil, uyarıyla yakalarsınız ([veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md)).

## Karar tablosu

| Okur | Pano türü | Sıklık | İçerik |
| --- | --- | --- | --- |
| Proje sahibi, yönetici | Durum panosu | Haftalık | 3–5 ana ölçüt, hedefe göre, eğilim |
| Ürün ekibi | Analitik pano | Günlük, haftalık | Ölçüt ağacının dalları, kohort, huni, segment filtreleri |
| Operasyon (destek, veri hattı) | İşletim panosu | Saatlik | Kuyruk, hata oranı, tazelik; eşik renkleri |
| Tek seferlik soru | Pano değil, analiz raporu | Bir kez | [Analiz raporu yazma](analiz-raporu-yazma.md) |

| Ölçütün yapısı | Karşılaştırma | Neden |
| --- | --- | --- |
| Haftalık döngüsü var (etkinlik, sipariş) | Geçen haftanın aynı günleri ya da son 4 haftanın ortalaması | Gün gün karşılaştırma hafta içi/sonu farkına takılır |
| Yıllık mevsimi var (bayram, okul dönemi) | Geçen yılın aynı dönemi | Geçen ay yanıltır |
| Hedefi var | Hedefe göre ilerleme, geçen süreye oranla | "%30'a ulaştık" ayın üçte biri geçtiyse iyi haberdir |
| Yeni ürün, geçmiş yok | Önceki haftaların eğilimi | Karşılaştırılacak yıl yok |

## Ölçüt kutusunun yapısı

```text
Haftalık etkin kullanıcı  (i)            ← ad; (i) tanım kartını açar
1.240                                     ← değer, Türkçe biçim, anlamlı basamak
▲ %6 · geçen haftanın aynı günleri 1.170  ← yön + değişim + karşılaştırılan değer
Hedef 1.300 · planın %95'i                ← hedefe göre ilerleme
▁▂▃▃▅▆▇▆  son 8 hafta                     ← küçük eğilim çizgisi
Son güncelleme 16 Kas 09:10 · son 3 gün kesinleşmedi
```

Rengi işarete göre değil **anlama** göre verin: iptal oranındaki düşüş iyi haberdir. Rengi yalnız başına
bırakmayın; ok ve sözcük de söylesin. Yüzde değişim ile yüzde puan farkını karıştırmayın ("dönüşüm %4'ten %5'e"
= +1 puan, göreli +%25; [analiz raporu yazma](analiz-raporu-yazma.md)).

## Yarım dönem tuzağı

Bugün 18 Kasım Çarşamba, saat 10:00. Bu haftanın Pazartesi ve Salı günleri bitti, Çarşamba yeni başladı:

```sql calistir
CREATE TABLE gunluk (gun TEXT, siparis INTEGER);
INSERT INTO gunluk VALUES ('2026-11-09', 100), ('2026-11-10', 105), ('2026-11-11', 98), ('2026-11-12', 110),
  ('2026-11-13', 130), ('2026-11-14', 90), ('2026-11-15', 80),
  ('2026-11-16', 104), ('2026-11-17', 108), ('2026-11-18', 25);
-- YANLIŞ: bitmemiş bu hafta ↔ bitmiş geçen hafta
SELECT 'bu hafta ↔ geçen hafta', SUM(siparis) FILTER (WHERE gun >= '2026-11-16'),
       SUM(siparis) FILTER (WHERE gun < '2026-11-16'),
       round(100.0 * SUM(siparis) FILTER (WHERE gun >= '2026-11-16') / SUM(siparis) FILTER (WHERE gun < '2026-11-16') - 100, 1)
FROM gunluk;
-- DOĞRU: yalnız biten günler, geçen haftanın aynı günleriyle
SELECT 'Pzt–Sal ↔ geçen Pzt–Sal', SUM(siparis) FILTER (WHERE gun IN ('2026-11-16', '2026-11-17')),
       SUM(siparis) FILTER (WHERE gun IN ('2026-11-09', '2026-11-10')),
       round(100.0 * SUM(siparis) FILTER (WHERE gun IN ('2026-11-16', '2026-11-17'))
             / SUM(siparis) FILTER (WHERE gun IN ('2026-11-09', '2026-11-10')) - 100, 1)
FROM gunluk;
-- Aylık hedef 3.000 sipariş; 30 günlük ayın 10. günü bitti, 920 sipariş var
SELECT 'hedefin yüzdesi', round(100.0 * 920 / 3000, 1), 'planın yüzdesi (geçen süreye göre)',
       round(100.0 * 920 / (3000 * 10.0 / 30), 1);
```

```cikti
bu hafta ↔ geçen hafta|237|713|-66.8
Pzt–Sal ↔ geçen Pzt–Sal|212|205|3.4
hedefin yüzdesi|30.7|planın yüzdesi (geçen süreye göre)|92.0
```

Pano "%67 düşüş" derken gerçek durum %3 artış. Bugünü (yarım günü) karşılaştırmaya hiç katmayın ya da geçen
haftanın aynı saatine kadar olan kısmıyla karşılaştırın. Hedef için de aynı mantık: "hedefin %31'i" kötü görünür,
ama ayın üçte biri geçtiğine göre plan %92 tutturulmuş. Hafta içi ve sonu farklıysa düz oran yerine geçen ayın
günlük dağılımına göre plan eğrisi kullanın.

## Filtreler

- **Az ve gerekli:** tarih aralığı, platform, plan, bölge gibi 3–5 filtre. Varsayılan, en sık bakılan görünümdür
  (ör. son 8 hafta, hepsi).
- **Durum görünür:** seçili filtreler başlıkta yazar ("Mobil · Son 8 hafta"); ekran görüntüsü paylaşıldığında
  bağlam kaybolmaz.
- **Tutarlı:** filtre bütün kutulara uygulanır; uygulanmayan kutu açıkça işaretlenir.
- **Küçük grup:** filtre kombinasyonu az veriye inerse "n = 12, az veri" uyarısı verin; 5'ten küçük hücreleri
  gizleyin ([gizlilik](gizlilik-ve-anonimlestirme.md)).
- Filtre ölçütün tanımını sessizce değiştirmemeli (ör. "yalnız ödeme yapanlar" filtresi dönüşüm oranının
  paydasını değiştirir).

## Aşırı yükleme ve tanımlar

- Tek ekranda en çok 7–9 kutu; fazlası varsa panoyu soruya ya da okura göre bölün.
- Her kutu için "hangi kararı değiştirir?" sorusu yanıtlanır; yanıtı olmayan çıkarılır. Toplam kayıtlı kullanıcı
  gibi yalnız artan (gösteriş) ölçütler kutu değil, dipnot olur.
- Zaman ekseni bütün grafiklerde aynı aralıkta; aynı kategori her grafikte aynı renkte.
- "Veri yok" ile sıfır ayrı gösterilir; kesinleşmemiş son günler soluk ya da kesikli çizilir.
- Bilinen olaylar (sürüm, kampanya, kesinti, bayram) zaman ekseninde işaretlenir; bir sıçramanın nedeni orada durur.
- Her ölçütün tanımı panodan bir tıkla açılır ([ölçüt kartı](urun-olcutleri.md)); saat dilimi ve kaynak yazar;
  tanım değişince panoya not düşülür.

## Pano tasarım kartı

```markdown
**Pano:** Haftalık ürün sağlığı
**Okur ve sıklık:** proje sahibi · her pazartesi 10:00
**Yanıtladığı soru:** Ürün geçen hafta büyüdü mü, nerede sorun var?
**Verdirdiği karar:** bu haftanın önceliği (büyüme, tutma ya da hata)
**Üst sıra (en çok 5):** haftalık etkin kullanıcı, yeni etkinleşen, 4. hafta tutma, hata oranı, gelir
**Karşılaştırma:** geçen haftanın aynı günleri, son 4 hafta ortalaması, hedef
**Kırılımlar:** platform, kayıt kaynağı, plan
**Filtreler:** tarih (varsayılan son 8 hafta), platform
**Tanımlar:** ölçüt kartlarına bağlantı; saat dilimi Türkiye (UTC+3); son 3 gün kesinleşmedi
**Tazelik:** her gün 06:00 güncellenir; 26 saatten eskiyse uyarı
**Sahibi:** ürün sahibi
```

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Her pazartesi "büyük düşüş" | Bitmemiş hafta bitmiş haftayla karşılaştırılıyor | Biten günleri geçen haftanın aynı günleriyle karşılaştırın |
| Sayı var, iyi mi kötü mü bilinmiyor | Karşılaştırma bağlamı yok | Önceki dönem, hedef, eğilim |
| Kırmızı ok iyi haberi gösteriyor | Renk işarete göre | Renk anlama göre; ok ve sözcükle birlikte |
| Panoda 25 grafik, kimse bakmıyor | Soru ve okur yok | Tasarım kartı; 7–9 kutu; panoyu bölün |
| Dünkü sayı bugün değişti, güven sarsıldı | Geç gelen veri | "Kesinleşmedi" işareti; geri bakışlı hat |
| Pano iki gündür güncellenmiyor, kimse fark etmedi | Tazelik görünmüyor | Son güncelleme zamanı + bayatlık uyarısı |
| Filtreli görünümde "%100 dönüşüm" | n çok küçük | n'yi gösterin; az veri uyarısı |
| İki pano aynı ölçüte farklı sayı veriyor | Her biri kendi sorgusunu yazmış | Tek ölçüt görünümü; panolar oradan okur |
| Yanıt süresi "iyi" ama şikâyet çok | Ortalama gösteriliyor | p90 ya da p95 |
| Grafik ölçeği her yenilemede zıplıyor | Otomatik eksen | Sabit eksen ya da değişimi açıkça belirtin |
| Gün sayıları raporla tutmuyor | Pano UTC, rapor Türkiye günü | Tek gün tanımı ([analitik veri modeli](analitik-veri-modeli.md)) |

## Denetim listesi

- [ ] Tasarım kartı yazılı: okur, sıklık, soru, verdirdiği karar.
- [ ] Üst sırada en çok 5 ölçüt; her birinde aynı uzunlukta karşılaştırma ya da hedef ve eğilim var.
- [ ] Bitmemiş dönem, bitmiş dönemle karşılaştırılmıyor.
- [ ] Her ölçütün tanımına panodan ulaşılıyor; saat dilimi ve kaynak yazılı.
- [ ] Son güncelleme zamanı görünüyor; bayatlık uyarısı tanımlı; kesinleşmemiş dönem işaretli.
- [ ] Renkler anlama göre ve yalnız renge dayanmıyor.
- [ ] Filtre durumu başlıkta; küçük n uyarısı ve küçük hücre gizleme var.
- [ ] Her kutunun değiştirdiği karar yazılı; karar değiştirmeyen kutu yok.
- [ ] Panodaki sayılar, aynı ölçütün bağımsız bir sorgusuyla bir kez karşılaştırıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Panoyu şu tasarım kartına göre kur. Üst sırada en çok 5 ölçüt kutusu: değer, geçen haftanın
  aynı günlerine göre değişim, hedefe göre ilerleme (geçen süreye oranla), son 8 haftanın küçük çizgisi. Bugünü
  karşılaştırmaya katma. Her kutuda tanım bağlantısı; sayfada son güncelleme zamanı ve 'son 3 gün kesinleşmedi'
  notu. Sayıları Türkçe biçimde yaz."
- **Modelin tipik hatası:** bu haftanın kısmi toplamını geçen haftanın tamamıyla karşılaştırır; hedefin yüzdesini
  geçen süreyi hesaba katmadan verir; artışı her zaman yeşil boyar; her şeyi panoya koyar; tanım, tazelik ve n
  eklemez; aynı ölçütü her kutuda farklı sorguyla hesaplar.
- **Çıktıda denetleyin:** karşılaştırılan dönemler eşit uzunlukta mı; bugün dahil mi; son güncelleme ve tanımlar
  görünüyor mu; kutu sayısı; sayı biçimi.
- **Sorun:** "Bu panoya bakan kişi pazartesi sabahı hangi kararı verecek?"

## İlgili

- [Ürün ölçütleri](urun-olcutleri.md) — ölçüt kartı, kuzey yıldızı, ölçüt ağacı
- [Görselleştirme seçimi](gorsellestirme-secimi.md) — grafik türü, renk ve erişilebilirlik
- [Veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md) — tazelik ve hacim uyarıları
- [Veri hattı tasarımı](veri-hatti-tasarimi.md) — geç gelen veri ve kesinleşmeyen günler
- [Analiz raporu yazma](analiz-raporu-yazma.md) — yüzde ve yüzde puan, yuvarlama
- [Gizlilik ve anonimleştirme](gizlilik-ve-anonimlestirme.md) — küçük hücre bastırma
- Panoya konabilecek sınanmış sorgular (aylık ciro, kampanya günleri, kayıp oranı):
  [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md)
- Kontrast denetimi ve okunur metin rengi: [`kutuphane/ts/src/renk.ts`](../../kutuphane/ts/src/renk.ts)
- [Gözlemlenebilirlik](../40-sistem-tasarimi/gozlemlenebilirlik.md) — işletim panosu, SLO ve uyarı
- [İzleme ve uyarı](../60-devops/izleme-ve-uyari.md) — sağlık ve erişilebilirlik izleme
