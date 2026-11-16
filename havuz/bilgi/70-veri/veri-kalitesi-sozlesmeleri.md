---
baslik: Veri kalitesi sözleşmeleri
ozet: Tamlık, tekillik, geçerlilik, tutarlılık, tazelik ve hacim beklentileri; sözleşme dosyası, kalite denetimini hatta engelleyici ya da uyarıcı koymak, işe yarayan uyarı ve veri sözlüğü.
etiketler: [veri-kalitesi, sozlesme, veri, veri-hatti, sql, veri-sozlugu]
duzey: orta
guncellik: 2026-11
---

# Veri kalitesi sözleşmeleri

> Bu notu ne zaman okumalı: bir tabloyu başkalarının (pano, model, rapor) kullanımına açarken; panodaki bir sayı
> sessizce bozulduğunda; bir veri hattına denetim eklerken; "bu sütun ne demek?" sorusu ikinci kez sorulduğunda.

## Temel fikir

**Veri kalitesi sözleşmesi** (data contract), veriyi üreten ile kullanan arasındaki yazılı anlaşmadır: tanecik,
şema (sütun ve tür), beklentiler (kurallar), tazelik (ne zaman güncel), sahibi ve ihlalde ne olacağı.

Beklentiler altı türdür: **tamlık** (zorunlu alan boş değil), **tekillik** (anahtar benzersiz), **geçerlilik**
(tür, aralık, desen, izinli değer, yabancı anahtar), **tutarlılık** (tablolar arası: kalemlerin toplamı = sipariş
toplamı), **tazelik** (freshness: en son kayıt ne zaman geldi), **hacim** (satır sayısı beklenen aralıkta).

Denetim hattın içindedir: kullanıcıya ulaşmadan önce **engelleyici**, ulaştıktan sonra **izleyici**. En taşınabilir
denetim biçimi "**sıfır satır döndürmesi gereken sorgu**"dur. Uyarı eyleme dönüşmelidir: sahibine gider ve ne
yapılacağını söyler; gürültülü uyarı kısa sürede görmezden gelinir. Veri sözlüğü şemadan üretilir, elle ayrı tutulmaz.

## Karar tablosu

| Beklenti | Örnek kural | Ne yakalar | İhlalde |
| --- | --- | --- | --- |
| Tamlık | `musteri_id` boş değil; `eposta` boşluk oranı < %5 | Kopan birleştirme, değişen form | Zorunlu alan: dur; oran: uyar |
| Tekillik | `siparis_id` benzersiz; (`tarih`, `kod`) birlikte benzersiz | Çift yükleme, idempotent olmayan hat | Dur |
| Geçerlilik | `toplam ≥ 0`; `durum` izinli listede; `siparis_id` deseni; TCKN sağlaması | Biçim ya da kaynak değişikliği, elle giriş | Satırı karantinaya al; oran yüksekse dur |
| Bütünlük | Her `siparis.musteri_id` müşteri tablosunda var | Sıra dışı yükleme, silinmiş boyut | Uyar; olguyu "(bilinmeyen)"e bağla |
| Tutarlılık | Kalem toplamı = sipariş toplamı (±1 kuruş) | Dönüşüm ve yuvarlama hatası | Dur |
| Tazelik | En son varış zamanı 26 saatten yeni | Duran hat, kaynak kesintisi | Uyar; panoda "son güncelleme" |
| Hacim | Bugünkü satır, son 4 haftanın aynı günü ortancasının ×0,5–×1,5'i | Kısmi ya da çift yükleme | Uyar |
| Dağılım | Ortalama tutar ve kategori payları geçen haftaya yakın (PSI) | Birim değişikliği, sessiz anlam değişikliği | Uyar |

## Sözleşme dosyası

Kurallar kodun içine gömülmez; tek bir dosyada durur ve kod onu okur. `veri` temelinin biçimiyle bir örnek
(şema `*.sema.json` ayrı dosyadadır):

```json
{
  "tablo": "siparisler",
  "tanecik": "bir satır = bir sipariş",
  "sahibi": "ürün sahibi",
  "tazelik_saat": 26,
  "ihlal": { "benzersiz": "dur", "bos_olmayan": "dur", "izinli": "karantina", "hacim": "uyar" },
  "denetimler": [
    { "tur": "benzersiz", "sutun": "siparis_id" },
    { "tur": "bos_olmayan", "sutun": "musteri_id" },
    { "tur": "desen", "sutun": "siparis_id", "desen": "SP\\d{7}" },
    { "tur": "izinli", "sutun": "durum", "degerler": ["teslim_edildi", "iptal", "iade_edildi", "kismi_iade"] },
    { "tur": "aralik", "sutun": "toplam", "en_az": 0 },
    { "tur": "yabanci_anahtar", "sutun": "musteri_id", "hedef_dosya": "musteriler.csv", "hedef_sutun": "musteri_id" }
  ]
}
```

`tablo`, `tanecik`, `sahibi`, `tazelik_saat` ve `ihlal` alanları sözleşmenin insan için olan kısmıdır; `veri`
temelinin `dogrula` komutu yalnız `denetimler` listesini okur.

## Denetimleri SQL ile yazmak

Her denetim, ihlal eden satırları sayan bir sorgudur. Ekilmiş hatalarla:

```sql calistir
CREATE TABLE musteri (musteri_id TEXT);
CREATE TABLE siparis (siparis_id TEXT, musteri_id TEXT, durum TEXT, toplam_kurus INTEGER, varis TEXT);
CREATE TABLE kalem (siparis_id TEXT, tutar_kurus INTEGER);
INSERT INTO musteri VALUES ('M1'), ('M2');
INSERT INTO siparis VALUES
  ('SP0000001', 'M1', 'teslim_edildi', 15000, '2026-11-16T08:00:00Z'),
  ('SP0000002', 'M2', 'iptal', 4000, '2026-11-16T09:00:00Z'),
  ('SP0000002', 'M2', 'iptal', 4000, '2026-11-16T09:00:00Z'),
  ('SP0000003', NULL, 'teslim edildi', -500, '2026-11-16T10:00:00Z'),
  ('SP0000004', 'M9', 'teslim_edildi', 2000, '2026-11-16T11:00:00Z');
INSERT INTO kalem VALUES ('SP0000001', 10000), ('SP0000001', 5000), ('SP0000002', 4000), ('SP0000004', 1500);
WITH denetim(ad, ihlal) AS (
  SELECT 'tamlık: musteri_id', COUNT(*) FROM siparis WHERE musteri_id IS NULL
  UNION ALL SELECT 'tekillik: siparis_id', COUNT(*) - COUNT(DISTINCT siparis_id) FROM siparis
  UNION ALL SELECT 'geçerlilik: durum', COUNT(*) FROM siparis
    WHERE durum NOT IN ('teslim_edildi', 'iptal', 'iade_edildi', 'kismi_iade')
  UNION ALL SELECT 'geçerlilik: toplam ≥ 0', COUNT(*) FROM siparis WHERE toplam_kurus < 0
  UNION ALL SELECT 'bütünlük: müşteri var', COUNT(*) FROM siparis s
    WHERE s.musteri_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM musteri m WHERE m.musteri_id = s.musteri_id)
  UNION ALL SELECT 'tutarlılık: kalem toplamı', COUNT(*) FROM (SELECT DISTINCT siparis_id, toplam_kurus FROM siparis) s
    WHERE s.toplam_kurus <> COALESCE((SELECT SUM(k.tutar_kurus) FROM kalem k WHERE k.siparis_id = s.siparis_id), 0)
  UNION ALL SELECT 'tazelik: son varış 26 saatten yeni',
    (julianday('2026-11-16T14:00:00Z') - julianday(MAX(varis))) * 24 > 26 FROM siparis
)
SELECT ad, ihlal, CASE WHEN ihlal = 0 THEN 'geçti' ELSE 'KALDI' END FROM denetim;
```

```cikti
tamlık: musteri_id|1|KALDI
tekillik: siparis_id|1|KALDI
geçerlilik: durum|1|KALDI
geçerlilik: toplam ≥ 0|1|KALDI
bütünlük: müşteri var|1|KALDI
tutarlılık: kalem toplamı|2|KALDI
tazelik: son varış 26 saatten yeni|0|geçti
```

`'teslim edildi'` (alt çizgi yerine boşluk) gözle fark edilmez; izinli değer denetimi yakalar. Tutarlılık denetimi
iki siparişi buldu: biri negatif toplamlı ve kalemsiz, öteki kalemleri eksik yüklenmiş. Biçim denetimleri (tür,
desen) yalnız biçimi korur; **anlamı** tutarlılık, hacim ve dağılım denetimleri korur.

## Hacim eşiği: sabit değil, geçmişe göre

```python calistir
import statistics as st

gecmis = {"pazartesi": [1210, 1185, 1250, 1230], "cumartesi": [420, 455, 430, 410]}  # son 4 haftanın aynı günü
bugun = [("pazartesi", 580), ("cumartesi", 440), ("pazartesi", 2460)]
for gun, satir in bugun:
    oran = satir / st.median(gecmis[gun])
    sabit = "UYARI" if satir < 1000 else "tamam"
    gecmise_gore = "tamam" if 0.5 <= oran <= 1.5 else "UYARI"
    print(f"{gun:9s} {satir:5d} satır · sabit eşik (< 1000): {sabit:5s} · geçmişe göre (×{oran:.2f}): {gecmise_gore}"
          .replace(".", ","))
```

```cikti
pazartesi   580 satır · sabit eşik (< 1000): UYARI · geçmişe göre (×0,48): UYARI
cumartesi   440 satır · sabit eşik (< 1000): UYARI · geçmişe göre (×1,04): tamam
pazartesi  2460 satır · sabit eşik (< 1000): tamam · geçmişe göre (×2,02): UYARI
```

Sabit eşik cumartesi her hafta yanlış alarm verir ve iki kez yüklenmiş pazartesiyi (2.460 satır) kaçırır. Geçmişe
göre eşik ikisini de doğru değerlendirir: yarım kalmış yükleme (×0,48) ve çift yükleme (×2,02) uyarı alır.

## Denetimi hatta yerleştirmek

```text
çek → şema denetimi → satır denetimleri (bozuk satır → karantina)
    → hazırlık tablosuna yükle → tablo denetimleri (tekillik, tutarlılık, hacim)
    → GEÇTİYSE yayımla (hazırlık tablosunu canlı tabloyla tek adımda değiştir)
    → izleme: tazelik, dağılım (uyarı)
```

| Seviye | Ne zaman | Örnek |
| --- | --- | --- |
| Dur (yayımlama) | Kullanan yanlış karar verir | Tekillik, zorunlu alan, tutarlılık, şema |
| Karantina | Satır bozuk, geri kalanı sağlam | Geçersiz değer, tür uyuşmazlığı |
| Uyar | Olağan dışı ama yanlış olmayabilir | Hacim, tazelik, dağılım |
| Bilgi | Eğilim izleme | Eksik oranı, karantina oranı |

Bu düzenin adı "yaz, denetle, yayımla"dır (write-audit-publish): denetimden geçmeyen veri kullanıcıya hiç ulaşmaz;
dün yayımlanmış sağlam tablo yerinde kalır.

**İşe yarayan uyarı** dört şeyi söyler: ne bozuldu, ne kadar, hangi koşu, ne yapılır:

```text
[siparisler] tekillik KALDI: 1.204 yinelenen siparis_id (koşu 20261116T0300). Yayımlama durduruldu, dünkü tablo
yerinde. Olası neden: hat iki kez çalıştı. Yapılacak: hat günlüğünde aynı gün iki koşu var mı bakın.
```

Aynı sorun için tek uyarı gider, sürerse günde bir hatırlatma. Uyarılar haftada bir gözden geçirilir; kimsenin
bakmadığı uyarı ya düzeltilir ya silinir.

## Veri sözlüğü

| Sütun | Tür | Birim | Anlam | Kural | Kaynak | Kişisel veri |
| --- | --- | --- | --- | --- | --- | --- |
| `siparis_id` | metin | — | Siparişin kalıcı kimliği | benzersiz; `SP` + 7 rakam | sipariş servisi | hayır |
| `toplam` | ondalık | TL, KDV dahil | Kargo dahil ödenen tutar | ≥ 0 | ödeme servisi | hayır |
| `durum` | metin | — | Son durum | teslim_edildi, iptal, iade_edildi, kismi_iade | sipariş servisi | hayır |
| `musteri_id` | metin | — | Müşterinin iç kimliği | müşteri tablosunda var | kayıt servisi | takma ad (dolaylı) |

"KDV dahil mi?", "kargo dahil mi?", "hangi saat dilimi?" sorularının yanıtı sözlükte değilse, iki analist aynı
sütundan iki farklı sayı üretir. Sözlüğü şemadan üretin; anlam değişikliği sürümlenir ve kullananlara duyurulur.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Panodaki sayı sessizce düştü, hat "başarılı" | Hacim ve tazelik denetimi yok | Geçmişe göre hacim eşiği + tazelik uyarısı |
| Her gün onlarca uyarı, kimse bakmıyor | Sabit eşik, sahipsiz uyarı | Geçmişe göre eşik; her uyarıya sahip; haftalık gözden geçirme |
| Cumartesi her hafta alarm | Sabit eşik haftalık döngüyü bilmiyor | Aynı gün karşılaştırması |
| Bütün denetimler geçti, veri yine yanlış | Kurallar yalnız biçimi denetliyor | Tutarlılık, hacim ve dağılım denetimi |
| Kötü veri panoya düştükten sonra fark edildi | Denetim yayımladıktan sonra çalışıyor | Hazırlık tablosunda denetle, sonra yayımla |
| Sütunun anlamı değişti (KDV dahil → hariç) | Sözlükte birim ve anlam yok | Sözlük + sürümlü değişiklik duyurusu |
| Hata raporunda müşteri e-postası görünüyor | Rapor değeri yazıyor | Satır numarası ya da maskeli değer |
| Kod ile kural dosyası farklı şey söylüyor | Kural koda gömülü | Tek kaynak: sözleşme dosyası; kod onu okur |
| "Eksik oranı %0" ama hücrelerde `-` ve `yok` var | Eksik işaretleri çevrilmedi | Önce eksik işaretlerini çevirin ([veri temizleme](veri-temizleme-yontemi.md)) |
| Denetim hiç kalmıyor, gerçekten çalışıyor mu bilinmiyor | Denetimin kendisi sınanmamış | Her denetim için ekilmiş hatalı bir örnekle test |

## Denetim listesi

- [ ] Yayımlanan her tablonun sözleşmesi var: tanecik, sütunlar ve türler, beklentiler, tazelik, sahibi, ihlal davranışı.
- [ ] En az şu denetimler var: tekillik, zorunlu alanlar, izinli değerler, tazelik, hacim.
- [ ] Tutarlılık denetimi (tablolar arası toplamlar) yazıldı.
- [ ] Engelleyici denetimler yayımlamadan önce, hazırlık tablosunda çalışıyor.
- [ ] Hacim ve dağılım eşikleri geçmişe göre.
- [ ] Her denetim, ekilmiş bir hatayı yakaladığı bir testle korunuyor.
- [ ] Her uyarının sahibi, kanalı ve "ne yapılır" cümlesi var.
- [ ] Raporlarda kişisel veri değeri yok.
- [ ] Veri sözlüğü şemadan üretiliyor; anlam, birim, kaynak ve kişisel veri işareti var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu tablo için `denetimler.json` yaz (benzersiz, bos_olmayan, izinli, aralik, desen,
  yabanci_anahtar) ve `python -m verihavuzu dogrula tablo.csv --sema tablo.sema.json --denetim denetimler.json`
  ile çalıştır. Her denetim için bilerek bozulmuş bir örnek satırla test yaz. Hacim eşiğini son 4 haftanın aynı
  gününün ortancasına göre koy. Tekillik ya da zorunlu alan hatasında yayımlamayı durdur."
- **Modelin tipik hatası:** yalnız biçim denetimi yazar; sabit eşik koyar; uyarı metnine değeri basar; denetimi
  yayımlamadan sonra çalıştırır; kuralı koda gömer; denetimin kendisini sınamaz.
- **Çıktıda denetleyin:** kod kural dosyasını mı okuyor; her denetimin ekilmiş hatalı testi var mı; uyarı metni
  dört soruyu (ne, ne kadar, hangi koşu, ne yapılır) yanıtlıyor mu.

## İlgili

- Sözleşme ve doğrulama: [`veri/verihavuzu/kalite/schema.py`](../../veri/verihavuzu/kalite/schema.py) (şema →
  JSON Schema), [`veri/verihavuzu/kalite/checks.py`](../../veri/verihavuzu/kalite/checks.py) (tablo denetimleri),
  örnek denetim dosyası: [`veri/docs/ornek-denetimler.json`](../../veri/docs/ornek-denetimler.json)
- Dağılım kayması (PSI, KS): [`veri/verihavuzu/kalite/drift.py`](../../veri/verihavuzu/kalite/drift.py)
  (`python -m verihavuzu kayma eski.csv yeni.csv`)
- Şemadan veri sözlüğü: [`veri/verihavuzu/kalite/dictionary.py`](../../veri/verihavuzu/kalite/dictionary.py)
  (`python -m verihavuzu sozluk tablo.sema.json`)
- [Veri hattı tasarımı](veri-hatti-tasarimi.md) — karantina, koşu günlüğü, şema değişikliği
- [Veri temizleme yöntemi](veri-temizleme-yontemi.md) — kuralı yazmadan önce profil
- [Olay izleme planı](olay-izleme-plani.md) — olay verisine sözleşme
- [Pano tasarımı](pano-tasarimi.md) — tazeliği panoda göstermek
- [İzleme ve uyarı](../60-devops/izleme-ve-uyari.md) — gürültüsüz uyarı eşiği
- [Aykırı değer ve anomali tespiti](../80-ml/aykiri-deger-ve-anomali.md) — uyarı yorgunluğu, beklenene göre anomali
- [MLOps](../80-ml/mlops.md) — kayma ve başarım izleme
