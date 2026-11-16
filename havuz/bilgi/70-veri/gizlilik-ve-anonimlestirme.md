---
baslik: Gizlilik ve anonimleştirme
ozet: Takma ad ile anonim verinin farkı, birkaç sütunla yeniden tanımlama riski, k-anonimlik sezgisi, genelleştirme, toplulaştırma ve küçük hücre bastırma; KVKK için pratik notlar.
etiketler: [gizlilik, anonimlestirme, kvkk, kisisel-veri, veri, guvenlik]
duzey: orta
guncellik: 2026-11
---

# Gizlilik ve anonimleştirme

> Bu notu ne zaman okumalı: veriyi ekip dışına (ajans, danışman, yapay zekâ hizmeti, açık veri) verirken; "anonim"
> diye bir dosya hazırlarken; panoda küçük gruplara ait sayılar gösterirken; kullanıcı verisini analiz ya da model
> için kopyalarken.
>
> **Hukuki danışmanlık değildir.** Genel ilkeleri anlatır; KVKK'nın güncel metni ve Kurul kararları için
> kvkk.gov.tr'ye bakın, gerekirse bir hukukçuya danışın.

## Temel fikir

Ad, TCKN, telefon ve e-postayı silmek **anonimleştirme değildir**. Doğum tarihi, cinsiyet, ilçe, meslek, işlem saati
gibi **dolaylı tanımlayıcılar** birleşince kişiyi tekilleştirir; dışarıdaki bir listeyle (seçmen kaydı, sosyal
medya) eşleştirilen kişi geri tanınır.

**Takma ad** (pseudonymization): tanımlayıcının yerine belirteç koymak. Anahtarı ya da eşleme tablosu olan geri
bağlayabilir; bu yüzden takma adlı veri **hâlâ kişisel veridir**. Özet (hash) de bir takma addır ve olası değerler
azsa (doğum tarihi, telefon) hepsi denenerek geri bulunur.

**Anonim veri**, makul araçlarla kimseye bağlanamayan veridir. Satır düzeyinde bunu sağlamak zordur; güvenli yol
çoğu zaman **toplulaştırmadır** (sayı, oran) ve küçük hücreleri bastırmaktır. En iyi gizlilik, gerekmeyen veriyi
hiç toplamamaktır.

## Karar tablosu

| Amaç | Yöntem | Kalan risk |
| --- | --- | --- |
| Geliştirme, test, gösterim | Sentetik veri | Yok denecek kadar az |
| Ekip içi analiz, kişileri birleştirmek gerekiyor | Takma ad (gizli anahtarlı HMAC), erişim sınırlı | Anahtar sızarsa geri çözülür; kişisel veridir |
| Dış hizmete satır düzeyinde veri (ajans, yapay zekâ API'si) | Gereksiz sütunları silmek + takma ad + genelleştirme + sözleşme | Yeniden tanımlama; üçüncü taraf ve yurt dışı aktarım kuralları |
| Rapor, pano, sunum | Toplulaştırma + küçük hücre bastırma | Toplamdan ya da iki raporun farkından çıkarım |
| Açık veri olarak yayımlamak | Toplulaştırma, genelleştirme, k-anonimlik ölçümü + uzman görüşü | En yüksek; yayımlanan geri alınamaz |
| Serbest metin (destek talebi, not) | Önce tarayın; şüphede paylaşmayın | Ad, adres, sağlık bilgisi biçimsizdir, kolay bulunmaz |

## Özet, takma ad ve anonim

```python calistir
import hashlib
import hmac
from datetime import date, timedelta


def ozet(metin: str) -> str:
    return hashlib.sha256(metin.encode()).hexdigest()


paylasilan = ozet("1987-04-23")  # "anonim" diye paylaşılan doğum tarihi özeti
aday, deneme = date(1930, 1, 1), 1
while ozet(aday.isoformat()) != paylasilan:
    aday += timedelta(days=1)
    deneme += 1
print(f"özetten geri bulunan doğum tarihi: {aday} ({deneme} denemede)")

anahtar = b"ornek-anahtar-yalniz-gosterim"  # gerçek anahtar ortam değişkeninde ya da sır kasasında durur
belirtec = hmac.new(anahtar, b"1987-04-23", hashlib.sha256).hexdigest()[:16]
print(f"HMAC belirteci: {belirtec} (anahtarsız denenemez; anahtarı olan geri bağlar: takma ad)")
```

```cikti
özetten geri bulunan doğum tarihi: 1987-04-23 (20932 denemede)
HMAC belirteci: f1a9bf07e5cc7834 (anahtarsız denenemez; anahtarı olan geri bağlar: takma ad)
```

Yirmi bin deneme bir saniyenin çok altında biter. Telefon numarası ve TCKN gibi değerlerin uzayı da birkaç milyar
mertebesindedir ve bir ekran kartıyla kısa sürede denenir. Kural: tahmin edilebilir değerin düz özetini paylaşmayın;
eşleştirme gerekiyorsa gizli anahtarlı HMAC kullanın ve sonucu kişisel veri sayın.

## Yeniden tanımlama: birkaç sütun yeter

Orta büyüklükte bir ilçeler kümesinde 20.000 kişilik bir nüfus (uydurma). Hangi sütun birleşimi kaç kişiyi tek
başına tanınır kılıyor?

```python calistir
import random
from collections import Counter
from datetime import date, timedelta

r = random.Random(12)
ilceler = [f"ilçe{i}" for i in range(15)]
kisiler = [{"dogum": date(1945, 1, 1) + timedelta(days=r.randrange(62 * 365)),
            "cinsiyet": r.choice("KE"), "ilce": r.choice(ilceler)} for _ in range(20000)]


def risk(anahtar) -> tuple[float, float]:
    grup = Counter(anahtar(k) for k in kisiler)
    tek = sum(grup[anahtar(k)] == 1 for k in kisiler) / len(kisiler)
    kucuk = sum(grup[anahtar(k)] < 5 for k in kisiler) / len(kisiler)
    return tek, kucuk


for ad, anahtar in (
    ("doğum tarihi + cinsiyet + ilçe", lambda k: (k["dogum"], k["cinsiyet"], k["ilce"])),
    ("doğum ayı + cinsiyet + ilçe", lambda k: (k["dogum"].year, k["dogum"].month, k["cinsiyet"], k["ilce"])),
    ("doğum yılı + cinsiyet + ilçe", lambda k: (k["dogum"].year, k["cinsiyet"], k["ilce"])),
    ("10 yıllık yaş grubu + cinsiyet + ilçe", lambda k: (k["dogum"].year // 10, k["cinsiyet"], k["ilce"])),
):
    tek, kucuk = risk(anahtar)
    print(f"{ad:38s} tek başına tanınan %{100 * tek:5.1f} · 5'ten küçük grupta %{100 * kucuk:5.1f}".replace(".", ","))
```

```cikti
doğum tarihi + cinsiyet + ilçe         tek başına tanınan % 97,2 · 5'ten küçük grupta %100,0
doğum ayı + cinsiyet + ilçe            tek başına tanınan % 40,3 · 5'ten küçük grupta % 98,5
doğum yılı + cinsiyet + ilçe           tek başına tanınan %  0,0 · 5'ten küçük grupta %  0,7
10 yıllık yaş grubu + cinsiyet + ilçe  tek başına tanınan %  0,0 · 5'ten küçük grupta %  0,0
```

Ad ve kimlik numarası olmayan bir dosyada üç sütun, kişilerin neredeyse hepsini tekilleştiriyor. Genelleştirme
(tam tarih → yıl → yaş grubu) riski hızla düşürür. Bu benzetimde değerler düzgün dağıldı; gerçek veride kümeler
dengesizdir ve nadir birleşimler (yaşlı kadın, küçük ilçe, nadir meslek) daha çok tekil kalır. Bir sütun daha
eklemek (meslek, işlem saati) riski yeniden yükseltir.

## k-anonimlik ve genelleştirme

**k-anonimlik:** dolaylı tanımlayıcıların her birleşimi en az k kişide görülür (yukarıdaki "5'ten küçük grupta"
oranı sıfırsa veri 5-anonimdir). Araçları:

| Araç | Örnek | Bedeli |
| --- | --- | --- |
| Genelleştirme | Doğum tarihi → yaş grubu; ilçe → il; saat → gün | Analizde ayrıntı kaybı |
| Üstten kırpma | Gelir ≥ 50.000 → "50.000+" | Uçlarda bilgi kaybı |
| Bastırma | k'nin altındaki satırları ya da hücreleri çıkarma | Küçük gruplar görünmez olur |
| Gürültü ekleme | Sayılara kontrollü rastgelelik (farksal gizlilik) | Doğru uygulaması uzmanlık ister |

k-anonimlik sezgi için iyidir ama tek başına yetmez: bir gruptaki herkesin hassas değeri aynıysa (hepsi aynı tanı)
kişi tanınmadan bilgi öğrenilir. Hassas sütunlu veri dışarı çıkacaksa satır düzeyi yerine toplu tablo verin.

## Toplulaştırma ve küçük hücre bastırma

Küçük sayıları gizlemek yetmez; açık bırakılan toplamdan geri hesaplanırlar:

```sql calistir
CREATE TABLE talep (ilce TEXT, tur TEXT, adet INTEGER);
INSERT INTO talep VALUES ('Merkez', 'borç yapılandırma', 3), ('Merkez', 'iade', 40), ('Merkez', 'teslimat', 22),
  ('Sahil', 'borç yapılandırma', 2), ('Sahil', 'iade', 15), ('Sahil', 'teslimat', 9);
-- Yayımlanan tablo: 5'ten küçük hücre gizli, ilçe toplamı açık
SELECT ilce, tur, CASE WHEN adet < 5 THEN '<5' ELSE adet END AS adet,
       (SELECT SUM(adet) FROM talep t2 WHERE t2.ilce = t.ilce) AS ilce_toplami
FROM talep t ORDER BY ilce, tur;
-- Okuyan biri gizli hücreyi geri hesaplar: toplam − görünen hücreler
SELECT ilce, 'gizli hücre', SUM(adet) - SUM(CASE WHEN adet >= 5 THEN adet ELSE 0 END)
FROM talep GROUP BY ilce ORDER BY ilce;
```

```cikti
Merkez|borç yapılandırma|<5|65
Merkez|iade|40|65
Merkez|teslimat|22|65
Sahil|borç yapılandırma|<5|26
Sahil|iade|15|26
Sahil|teslimat|9|26
Merkez|gizli hücre|3
Sahil|gizli hücre|2
```

Çözümler: ikinci bir hücreyi de gizlemek (tamamlayıcı bastırma), toplamları da yuvarlamak ya da tabloyu daha kaba
gruplarla vermek. Aynı tuzak zamanda da vardır: dünkü ve bugünkü toplamın farkı "bugün eklenen tek kişi"yi
gösterebilir. Eşik (5 ya da 10) bir politika kararıdır; yazılır ve her raporda aynı uygulanır.

## KVKK için pratik notlar

- Kişisel veri tanımı geniştir: kimliği belirli **ya da belirlenebilir** kişiye ilişkin her bilgi. Takma adlı veri
  bu tanımın içindedir; anonim hâle getirilmiş veri ise dışında kalır. "Anonim" demenin ölçütü yüksektir:
  makul araçlarla geri bağlanamamalıdır.
- Sağlık, biyometrik, din gibi özel nitelikli veri çok daha sıkı kurallara bağlıdır; mümkünse hiç toplamayın.
- Yapay zekâ API'si dahil, veriyi üçüncü tarafa ve yurt dışındaki bir hizmete göndermek ayrı bir aktarımdır.
- Amaç, hukuki sebep, aydınlatma, saklama süresi ve imha için pratik denetim listesi:
  [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md). Silme, yok etme ve anonim hâle getirme için
  Kurul'un rehberlerine bakın (bu notta doğrulanmadı).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Ad ve TCKN'yi sildik, anonim" | Dolaylı tanımlayıcılar duruyor | k ölçümü; genelleştirme ya da toplulaştırma |
| Telefonun SHA-256 özeti paylaşıldı | Küçük değer uzayı, denemeyle geri bulunur | Gizli anahtarlı HMAC; yine kişisel veri sayın |
| Takma ad anahtarı depoda | Anahtar sızınca bütün belirteçler çözülür | Ortam değişkeni ya da sır kasası; anahtarı döndürme planı |
| Panoda "bu ilçede 2 kişi" | Küçük hücre | Bastırma eşiği + tamamlayıcı bastırma |
| Gizli hücre toplamdan bulundu | Yalnız birincil bastırma | İkinci hücreyi de gizleyin ya da toplamları yuvarlayın |
| İki raporun farkından bir kişi çıktı | Fark alma | Zaman serisinde küçük değişimleri de bastırın |
| Destek metinlerinde ad, adres, hastalık | Biçimsiz kişisel veri tarayıcıyı atlatır | Serbest metni paylaşmayın ya da elle inceleyin |
| Birkaç konum noktası ev ve iş adresini veriyor | Konum izi kişiye özgü | Konumu ızgaraya yuvarlayın ya da toplayın |
| Tek bir yüksek gelir kişiyi gösteriyor | Nadir değer | Üstten kırpma |
| Test ortamında gerçek müşteriler | Üretim verisi kopyalandı | Sentetik veri |
| Müşteri listesi bir sohbet botuna yapıştırıldı | Üçüncü tarafa ve yurt dışına aktarım | Maskeleyin ya da sentetik veri kullanın |

## Denetim listesi

- [ ] Paylaşımın amacı ve alıcısı yazılı; yalnız gereken sütunlar seçildi.
- [ ] Doğrudan tanımlayıcılar silindi ya da gizli anahtarlı takma ada çevrildi; anahtar depoda değil.
- [ ] Dolaylı tanımlayıcılar listelendi; birleşimlerinin en küçük grup büyüklüğü ölçüldü ve eşiğin üstünde.
- [ ] Nadir değerler üstten kırpıldı; tarih ve konum genelleştirildi.
- [ ] Toplu tablolarda küçük hücreler bastırıldı; toplamdan ve dönem farkından geri hesaplanamadığı denetlendi.
- [ ] Serbest metin alanları paylaşılmadı ya da elle incelendi.
- [ ] Takma adlı verinin kişisel veri olduğu alıcı sözleşmesine ve saklama süresine yansıdı.
- [ ] Üçüncü taraf ve yurt dışı aktarımı (yapay zekâ hizmetleri dahil) değerlendirildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Paylaşılacak dosyada: gereksiz sütunları sil; ad, telefon, e-posta ve TCKN'yi
  `python -m verihavuzu maskele --yontem takma_ad` ile değiştir (anahtar ortam değişkeninden); doğum tarihini
  10 yıllık yaş grubuna, ilçeyi ile genelleştir; (yaş grubu, cinsiyet, il) birleşimlerinin en küçük grup
  büyüklüğünü raporla. Toplu tablolarda 5'ten küçük hücreleri '<5' yap ve toplamdan geri hesaplanamayacak
  biçimde ikinci bir hücreyi de gizle."
- **Modelin tipik hatası:** SHA-256 özetini "anonim" sayar; anahtarı koda yazar; dolaylı tanımlayıcıları bırakır;
  küçük hücreyi gizleyip toplamı açık bırakır; serbest metni olduğu gibi gönderir; "anonimleştirildi, artık KVKK
  kapsamı dışında" diye yazar.
- **Çıktıda denetleyin:** en küçük grup büyüklüğü raporu var mı; gizlenen hücreler toplamdan bulunabiliyor mu;
  anahtar nereden okunuyor; serbest metin sütunu kaldı mı.

## İlgili

- Kişisel veri bulma, maskeleme, silme ve HMAC'li takma ad: [`veri/verihavuzu/kalite/pii.py`](../../veri/verihavuzu/kalite/pii.py)
  (`python -m verihavuzu maskele`); KVKK denetim listesi: [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md)
- Gösterimde maskeleme (`123******01`, `a***@ornek.com`): [`kutuphane/py/kutuphane/maske.py`](../../kutuphane/py/kutuphane/maske.py)
- [Olay izleme planı](olay-izleme-plani.md) — olaya kişisel veri girmez
- [Analitik veri modeli](analitik-veri-modeli.md) — hangi ham veri saklanır, ne kadar süre
- [Pano tasarımı](pano-tasarimi.md) — küçük grupları panoda göstermek
- [Veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md) — raporlara değer yazmamak
