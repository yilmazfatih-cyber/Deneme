---
baslik: Ürün ölçütleri
ozet: Kuzey yıldızı ölçütü, ölçüt ağacı, etkin kullanıcı tanımının tuzakları, dönüşüm, tutma ve kayıp; tanımı yazılmamış ölçütün tehlikesi ve çalışan SQL hesapları.
etiketler: [veri, urun, olcut, analitik, sql, tutma]
duzey: orta
guncellik: 2026-11
---

# Ürün ölçütleri

> Bu notu ne zaman okumalı: bir ürün için "neyi ölçelim?" kararında; panoya ölçüt eklemeden önce; iki kişi aynı
> ölçüt için farklı sayı getirdiğinde; "etkin kullanıcı arttı" haberi geldiğinde ve buna sevinmeden önce.

## Temel fikir

**Ölçüt** (metric), tanımı yazılı bir sayıdır. Tanım: pay, payda, zaman penceresi, kim sayılır, kim sayılmaz,
hangi saat dilimi, hangi tablo. Tanım yazılı değilse iki kişi iki sayı getirir ve ikisi de "doğru"dur.

**Kuzey yıldızı ölçütü** (north star metric), ürünün kullanıcıya verdiği değeri en iyi yansıtan tek sayıdır;
gelirin öncü göstergesi olmalıdır ve ekiplerin etkileyebileceği **girdi ölçütlerine** ayrışır (**ölçüt ağacı**).
Her hedef ölçütün yanında bozulmaması gereken bir **koruma ölçütü** (guardrail) durur: iptal, şikâyet, hata oranı.

Hedef yapılan ölçüt bozulur: "uygulamayı açan kişi" hedeflenirse bildirim yağdırılır, sayı artar, değer artmaz.
Bu yüzden "etkin" kelimesi **çekirdek eylemle** (kullanıcının değer aldığı iş) tanımlanır, açılışla değil.

## Karar tablosu

| Ürün türü | Kuzey yıldızı adayı | Neden / tuzak |
| --- | --- | --- |
| Resimli iletişim ya da mesajlaşma | Haftada en az 3 gün iletişim kuran kişi | Açılış değil iletişim; sıklık bağımlılığı gösterir |
| Görev, üretkenlik | Haftalık tamamlanan (tekil) görev | Oluşturmak kolay, değer tamamlamada |
| E-ticaret | Haftalık teslim edilen ve iade edilmeyen sipariş | Ciro kampanyayla şişer, iade sonra gelir |
| Abonelikli video | Haftalık izlenen dakika ya da izleyen hane | Kayıt değil tüketim; ama "otomatik oynatma" ile şişer |
| Pazar yeri | Haftalık tamamlanan işlem | İlan sayısı arz tarafını gösterir, değeri değil |
| Öğrenme, alıştırma | Haftalık tamamlanan alıştırma oturumu | Uygulamada geçen süre zorluğu da ölçer, ilerlemeyi değil |

| Ölçüt sorusu | Doğru biçim | Yanlış biçim |
| --- | --- | --- |
| Büyüyor muyuz? | Etkin kullanıcı (çekirdek eylemle) | Toplam kayıtlı kullanıcı (yalnız artar) |
| Kullanıcı değer buluyor mu? | Tutma (retention) eğrisi, kohortla | Ortalama oturum süresi |
| Satış sayfası işliyor mu? | Pencereli dönüşüm (7 gün içinde) | "Bugüne kadar dönüşen" (son kohortu cezalandırır) |
| Aboneler kalıyor mu? | Dönem başı abonelerden ayrılan oranı | Ay içindeki iptaller / ay sonu abone |

## Ölçüt kartı

Her ölçüt panoya girmeden önce bir kart alır. Kart panoda tanım olarak da görünür ([pano tasarımı](pano-tasarimi.md)).

```markdown
**Ad:** Haftalık etkin kullanıcı (HEK, WAU)
**Soru:** Değer alan kaç kişi var?
**Tanım:** Pazartesi–Pazar haftası içinde en az bir `gorev_tamamlandi` olayı olan tekil kişi (kimlik birleştirmeden sonra)
**Hariç:** iç kullanıcılar, test hesapları, zamanı gelecekte olan olaylar
**Saat dilimi:** Türkiye (UTC+3); hafta Pazartesi 00:00'da başlar, Pazar 24:00'te biter
**Kaynak:** `olaylar_tekil` görünümü (olay_id ile tekilleştirilmiş)
**Sahibi:** ürün sahibi · **Sürüm:** v2 (2026-11-01: "uygulama_acildi" yerine "gorev_tamamlandi")
**Bilinen sınır:** çevrimdışı olaylar 3 güne kadar geç gelir; son 3 günün sayısı artabilir
```

## Etkin (aktif) kullanıcı: tanım sayıyı belirler

Aynı hafta, aynı veri, dört tanım:

```sql calistir
CREATE TABLE kullanici (kullanici_id TEXT, ic_kullanici INTEGER);
INSERT INTO kullanici VALUES ('u1', 0), ('u2', 0), ('u3', 0), ('u4', 1), ('u5', 0), ('u6', 0);
CREATE TABLE olay (kullanici_id TEXT, olay TEXT, gun TEXT);
INSERT INTO olay VALUES
  ('u1', 'gorev_tamamlandi', '2026-11-09'), ('u1', 'gorev_tamamlandi', '2026-11-10'),
  ('u1', 'gorev_tamamlandi', '2026-11-11'), ('u1', 'gorev_tamamlandi', '2026-11-12'),
  ('u1', 'gorev_tamamlandi', '2026-11-13'),
  ('u2', 'uygulama_acildi', '2026-11-09'), ('u2', 'uygulama_acildi', '2026-11-11'),
  ('u2', 'uygulama_acildi', '2026-11-13'),
  ('u3', 'uygulama_acildi', '2026-11-11'), ('u3', 'gorev_tamamlandi', '2026-11-11'),
  ('u4', 'gorev_tamamlandi', '2026-11-09'), ('u4', 'gorev_tamamlandi', '2026-11-12'),
  ('u4', 'gorev_tamamlandi', '2026-11-15'),
  ('u5', 'uygulama_acildi', '2026-11-14'),
  ('u6', 'gorev_tamamlandi', '2026-11-09'), ('u6', 'gorev_tamamlandi', '2026-11-14');
CREATE VIEW cekirdek AS
  SELECT o.kullanici_id, o.gun FROM olay o JOIN kullanici k USING (kullanici_id)
  WHERE o.olay = 'gorev_tamamlandi' AND k.ic_kullanici = 0;
SELECT 'herhangi bir olay', COUNT(DISTINCT kullanici_id) FROM olay;
SELECT 'çekirdek eylem', COUNT(DISTINCT kullanici_id) FROM olay WHERE olay = 'gorev_tamamlandi';
SELECT 'çekirdek eylem, iç kullanıcı hariç', COUNT(DISTINCT kullanici_id) FROM cekirdek;
SELECT 'haftada 3+ gün çekirdek eylem', COUNT(*) FROM
  (SELECT kullanici_id FROM cekirdek GROUP BY kullanici_id HAVING COUNT(DISTINCT gun) >= 3);
-- Günlük etkin kullanıcı (GEK) ortalaması: olaysız günler de sıfır olarak sayılmalı
SELECT 'GEK ortalaması, yalnız olaylı günler', round(AVG(n), 2)
FROM (SELECT gun, COUNT(DISTINCT kullanici_id) AS n FROM cekirdek GROUP BY gun);
WITH RECURSIVE takvim(gun) AS (
  SELECT '2026-11-09' UNION ALL SELECT date(gun, '+1 day') FROM takvim WHERE gun < '2026-11-15'
), gunluk AS (
  SELECT t.gun, (SELECT COUNT(DISTINCT c.kullanici_id) FROM cekirdek c WHERE c.gun = t.gun) AS n FROM takvim t
)
SELECT 'GEK ortalaması, takvimle', round(AVG(n), 2),
       'GEK/HEK', round(AVG(n) / (SELECT COUNT(DISTINCT kullanici_id) FROM cekirdek), 2) FROM gunluk;
```

```cikti
herhangi bir olay|6
çekirdek eylem|4
çekirdek eylem, iç kullanıcı hariç|3
haftada 3+ gün çekirdek eylem|1
GEK ortalaması, yalnız olaylı günler|1.33
GEK ortalaması, takvimle|1.14|GEK/HEK|0.38
```

"Etkin kullanıcı" 6, 4, 3 ya da 1. Hiçbiri yanlış değildir; yanlış olan, hangisi olduğunu yazmamaktır. GEK/HEK
oranı (DAU/WAU, yapışkanlık, stickiness) bir etkin kullanıcının haftanın kaç gününde değer aldığını özetler; günlük ortalama
olaysız günleri atlarsa oran olduğundan iyi görünür.

## Dönüşüm: pencere ve olgunlaşmamış kohort

Dönüşüm (conversion) = pencere içinde dönüşenler / dönüşme şansı olanlar. "Bugüne kadar dönüşen" yazarsanız eski kohortlar
hep daha iyi görünür; son kohortun henüz zamanı olmamıştır.

```sql calistir
CREATE TABLE uye (uye_id TEXT, kayit TEXT, ilk_odeme TEXT);
INSERT INTO uye VALUES
  ('a', '2026-10-26', '2026-10-28'), ('b', '2026-10-27', '2026-11-06'), ('c', '2026-10-28', NULL),
  ('d', '2026-10-29', '2026-11-03'), ('e', '2026-11-10', '2026-11-12'), ('f', '2026-11-11', NULL),
  ('g', '2026-11-13', NULL), ('h', '2026-11-14', '2026-11-15');
-- Bugün 2026-11-16. Pencere: kayıttan sonraki 7 gün.
SELECT date(kayit, '-6 days', 'weekday 1') AS kohort_haftasi,
       COUNT(*) AS uye,
       SUM(ilk_odeme IS NOT NULL) AS bugune_kadar,
       SUM(date(kayit, '+7 days') <= '2026-11-16') AS olgun_uye,
       SUM(date(kayit, '+7 days') <= '2026-11-16' AND ilk_odeme < date(kayit, '+7 days')) AS yedi_gunde
FROM uye GROUP BY kohort_haftasi ORDER BY kohort_haftasi;
-- Haftanın Pazartesisi: YANLIŞ formül Pazartesi günlerini bir hafta geri atar
SELECT 'Pazartesi 26 Ekim', date('2026-10-26', 'weekday 1', '-7 days'), date('2026-10-26', '-6 days', 'weekday 1');
```

```cikti
2026-10-26|4|3|4|2
2026-11-09|4|2|0|0
Pazartesi 26 Ekim|2026-10-19|2026-10-26
```

İlk kohort "bugüne kadar" 3/4, son kohort 2/4: son hafta kötü görünüyor. Oysa son kohortta penceresini
tamamlamış üye yok (`olgun_uye = 0`); yedi günlük oran yalnız ilk kohort için hesaplanabilir: 2/4. Kural: oranı
yalnız olgun üyelerden hesaplayın, olgun olmayanı panoda "henüz kesin değil" diye gösterin.

Kohort haftası `date(kayit, '-6 days', 'weekday 1')` ile bulunur: altı gün geri gidip ilk Pazartesiye ilerler.
Sık görülen `date(kayit, 'weekday 1', '-7 days')` Pazartesi günü kaydolanları bir önceki haftaya yazar (son satır).

## Tutma ve kayıp tanımları

| Ölçüt | Tanım | Ne zaman | Tuzak |
| --- | --- | --- | --- |
| Klasik N. gün tutma | Kaydın tam N. gününde etkin olanlar / kohort | Günlük alışkanlık ürünleri | Gürültülü; tek gün kaçıran "kaybedilmiş" sayılır |
| Sınırsız tutma (unbounded) | N. günde ya da sonrasında etkin olanlar / kohort | Seyrek kullanılan ürünler | Zamanla değişir: eski kohort "sonradan" yükselir |
| Aralık tutma (bracket) | N–M. günler arasında etkin olanlar / kohort | Haftalık ürünler (7–13. gün) | Aralık tanımı yazılmalı |
| Abone kaybı (logo churn) | Dönem başı abonelerden dönem içinde ayrılanlar / dönem başı abone | Abonelik | Paydaya dönem içinde gelenler konmaz |
| Gelir kaybı | Dönem başı abonelerin kaybedilen geliri / dönem başı gelir | Planlar farklı fiyatlıysa | Yükseltmeler net gelir tutmasında ayrıca sayılır |

Tutma eğrisinin SQL'i: [analitik SQL kalıpları](analitik-sql-kaliplari.md). Kayıp oranının paydası:

```sql calistir
CREATE TABLE abonelik (abone_id TEXT, baslangic TEXT, bitis TEXT);
INSERT INTO abonelik VALUES
  ('s1', '2026-08-01', NULL), ('s2', '2026-09-15', '2026-10-20'), ('s3', '2026-09-20', NULL),
  ('s4', '2026-06-01', NULL), ('s5', '2026-07-01', '2026-10-31'), ('s6', '2026-05-10', NULL),
  ('s7', '2026-10-01', '2026-10-05'), ('s8', '2026-10-10', NULL), ('s9', '2026-10-12', NULL),
  ('s10', '2026-10-20', NULL);
-- Ekim 2026. Dönem başı abone: 1 Ekim'den önce başlamış, 1 Ekim'den önce bitmemiş
WITH donem_basi AS (
  SELECT * FROM abonelik WHERE baslangic < '2026-10-01' AND (bitis IS NULL OR bitis >= '2026-10-01')
)
SELECT 'DOĞRU: dönem başından ayrılan / dönem başı',
       (SELECT COUNT(*) FROM donem_basi WHERE bitis < '2026-11-01') || '/' || (SELECT COUNT(*) FROM donem_basi);
SELECT 'YANLIŞ: bütün iptaller / ay sonu abone',
       (SELECT COUNT(*) FROM abonelik WHERE bitis >= '2026-10-01' AND bitis < '2026-11-01') || '/' ||
       (SELECT COUNT(*) FROM abonelik WHERE baslangic < '2026-11-01' AND (bitis IS NULL OR bitis >= '2026-11-01'));
```

```cikti
DOĞRU: dönem başından ayrılan / dönem başı|2/6
YANLIŞ: bütün iptaller / ay sonu abone|3/7
```

Doğru oran %33 (2/6), yanlış olan %43 (3/7). Ay içinde gelip ay içinde giden (s7) dönem başı kitlesinde değildir;
onu ayrıca "ilk ay kaybı" olarak izleyin. Payda değişince oran, davranış değişmeden zıplar.

## Ölçüt ağacı

```text
Haftalık tamamlanan görev (kuzey yıldızı)
├─ Haftalık etkin kullanıcı (HEK)
│  ├─ yeni etkinleşen: kayıttan sonraki 7 günde ilk görevini tamamlayan
│  ├─ devam eden: geçen hafta da etkin
│  └─ geri dönen: geçen hafta etkin değil, daha önce etkin
└─ Etkin kullanıcı başına tamamlanan görev
   ├─ kişi başı oluşturulan görev
   └─ tamamlama oranı
```

Kuzey yıldızı düşünce önce hangi dalın düştüğüne bakılır:

```python calistir
gecen = {"hek": 1000, "kisi_basi": 5.0}
bu = {"hek": 1100, "kisi_basi": 4.4}
for ad in gecen:
    print(f"{ad:10s} {gecen[ad]:>7g} → {bu[ad]:>7g}  değişim %{100 * (bu[ad] / gecen[ad] - 1):+.1f}".replace(".", ","))
toplam_gecen, toplam_bu = gecen["hek"] * gecen["kisi_basi"], bu["hek"] * bu["kisi_basi"]
print(f"{'toplam':10s} {toplam_gecen:>7g} → {toplam_bu:>7g}  değişim %{100 * (toplam_bu / toplam_gecen - 1):+.1f}"
      .replace(".", ","))
assert round(toplam_bu) == 4840
```

```cikti
hek           1000 →    1100  değişim %+10,0
kisi_basi        5 →     4,4  değişim %-12,0
toplam        5000 →    4840  değişim %-3,2
```

Kullanıcı sayısı artarken kuzey yıldızı düştü: sorun yeni kullanıcı kazanmakta değil, kişi başı kullanımda. Yeni
gelenlerin daha az kullanması (karışım etkisi) bunu tek başına açıklayabilir; ayrımı kohortla yapın.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Bildirim kampanyasında etkin kullanıcı fırladı, gelir kımıldamadı | "Etkin" = uygulamayı açan | Çekirdek eylemle tanımlayın |
| İki pano aynı ölçüte farklı sayı veriyor | Saat dilimi, iç kullanıcı, kimlik birleştirme farkı | Ölçüt kartı + tek görünüm; panolar oradan okusun |
| Son haftanın dönüşümü hep kötü | Olgunlaşmamış kohort | Oranı olgun üyelerden hesaplayın; sonu "kesin değil" diye gösterin |
| Günlük ortalama beklenenden yüksek | Olaysız günler ortalamaya girmedi | Takvim omurgası (tarih dizisi) ile sıfırları ekleyin |
| Kayıp oranı ay ay zıplıyor | Paydada ay içinde gelenler ya da ay sonu abone | Payda = dönem başı abone |
| Tutma eğrisi zamanla yükseliyor | Sınırsız tutma eski kohortlarda büyür; ya da klasik ile karıştı | Tanımı karta yazın; kohortları aynı yaşta karşılaştırın |
| Ölçüt iyileşti, ürün kötüleşti | Hedef ölçüt "oyunlandı"; koruma ölçütü yok | Her hedefin yanına koruma ölçütü |
| Oran arttı ama kimse bir şey yapmadı | Payda küçüldü | Oranı her zaman pay ve paydasıyla raporlayın |
| Tanım değişti, grafikte uçurum oluştu | Sürümsüz tanım | Kartta sürüm; grafikte işaret; bir süre iki tanımı paralel hesaplayın |
| "Toplam kullanıcı" hep artıyor, karar çıkmıyor | Birikimli (gösteriş) ölçüt | Etkin kullanıcı, tutma, kohort |

## Denetim listesi

- [ ] Her ölçütün kartı var: soru, tanım (pay, payda, pencere), hariç tutulanlar, saat dilimi, kaynak, sahibi, sürüm.
- [ ] "Etkin" bir çekirdek eylemle tanımlı; uygulama açma tek başına sayılmıyor.
- [ ] İç kullanıcılar, test hesapları, botlar hariç; sayım kimlik birleştirmeden sonra.
- [ ] Dönüşüm penceresi sabit; olgunlaşmamış kohortlar ayrı ve işaretli.
- [ ] Günlük ortalamalarda takvim omurgası kullanıldı.
- [ ] Kayıp oranının paydası dönem başı aktif kitle.
- [ ] Kuzey yıldızının ölçüt ağacı yazılı; düşüşte dal dal bakıldı.
- [ ] Her hedef ölçütün yanında en az bir koruma ölçütü var.
- [ ] Oranlar pay ve paydasıyla birlikte raporlanıyor.
- [ ] Tanım değişiklikleri sürümlenmiş ve grafikte işaretli.

## Küçük modele yaptırırken

- **İsteme yazın:** "Hesaplamadan önce ölçüt kartını doldur: tanım, pencere, hariç tutulanlar, saat dilimi, kaynak.
  Etkin kullanıcıyı çekirdek eylemle (`gorev_tamamlandi`) tanımla; iç kullanıcıları çıkar; günlük ortalamada
  takvim omurgası kullan; penceresini tamamlamamış kohortları ayrı göster; sonucu pay ve paydasıyla yaz."
- **Modelin tipik hatası:** her olayı etkinlik sayar; `AVG` ile yalnız olaylı günlerin ortalamasını alır; kayıp
  oranında ay sonu aboneyi payda yapar; son kohortu "bugüne kadar" oranıyla eskilerle kıyaslar; ölçüt tanımını
  sorguya gömer ve yazmaz.
- **Çıktıda denetleyin:** sorguda iç kullanıcı filtresi, `WITH RECURSIVE` takvimi, olgunluk koşulu
  (`date(kayit, '+7 days') <= bugun`) var mı; sayıların yanında pay/payda var mı; kart ile sorgu aynı şeyi mi söylüyor.
- **Sorun:** "Bu ölçütü artırmanın en ucuz, ama kullanıcıya değer katmayan yolu ne?" Yanıt kolaysa koruma ölçütü ekleyin.

## İlgili

- [Olay izleme planı](olay-izleme-plani.md) — ölçütün hammaddesi olan olaylar
- [Analitik veri modeli](analitik-veri-modeli.md) — olay tablosu, tanecik, saat dilimi
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — kohort tablosu, tutma eğrisi, huni
- [Pano tasarımı](pano-tasarimi.md) — ölçütü karşılaştırma bağlamıyla göstermek
- [A/B testi](ab-testi.md) — birincil ve koruma ölçütü seçimi
- [Betimsel istatistik](betimsel-istatistik.md) — oranların ortalaması ile toplamların oranı
- Kayıp oranı ve huni örnekleri (DuckDB, sınanmış): [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md)
  (12–14. tarifler); örnek küme: [`veri/ornekler/churn/`](../../veri/ornekler/churn/VERI_KARTI.md)
- [Ölçüm ve öğrenme](../95-urun/olcum-ve-ogrenme.md) — kuzey yıldızı seçimi, aktivasyon, ölçümden ürün kararına
- [Anket ve örneklem](anket-ve-orneklem.md) — ölçülemeyeni ankette sormak, NPS
