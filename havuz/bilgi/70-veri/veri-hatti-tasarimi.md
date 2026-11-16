---
baslik: Veri hattı tasarımı
ozet: Çek-dönüştür-yükle ile yükle-dönüştür seçimi, idempotent ve artımlı yükleme, geç gelen veri, şema değişikliği, karantina ve koşu günlüğü; çalışan SQLite ve Python örnekleriyle.
etiketler: [veri, veri-hatti, etl, idempotent, artimli-yukleme, sqlite]
duzey: orta
guncellik: 2026-11
---

# Veri hattı tasarımı

> Bu notu ne zaman okumalı: bir kaynaktan (API, dosya, başka veritabanı) düzenli veri çeken bir iş kurarken; hat
> iki kez çalışınca sayılar ikiye katlandığında; dünkü sayı bugün değiştiğinde; kaynak bir sütunu değiştirdiğinde.

## Temel fikir

Hat (pipeline): **çek** (extract) → **doğrula** → **dönüştür** (transform) → **yükle** (load), artı bir **durum**
(en son nereye kadar işlendi) ve bir **koşu günlüğü**. İki kural her şeyden önce gelir:

1. **İdempotent yükleme:** aynı koşuyu iki kez çalıştırmak bir kez çalıştırmakla aynı sonucu verir. Yol: anahtarla
   güncelle-ya-da-ekle (upsert) ya da o günün bölümünü silip yeniden yazmak. Böylece yeniden denemek hep güvenlidir.
2. **Durum yalnız başarıdan sonra ilerler:** yarıda kalan koşu, bir sonraki çalıştırmada aynı yerden başlar.

Artımlı (incremental) yükleme bir **filigranla** (watermark: en son işlenen zaman ya da kimlik) çalışır. Geç gelen
veri için filigranın gerisinde bir **geri bakış penceresi** bırakılır; idempotent yükleme sayesinde aynı kaydı
yeniden işlemek zararsızdır. Doğrulamadan geçemeyen kayıt silinmez, **karantinaya** gider; ham veri değişmeden
saklanır ki hata bulununca baştan işlenebilsin.

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Kaynak küçük (binlerce satır) ve ucuz | Her koşuda tam yükleme (tabloyu baştan yaz) | En basit; kendiliğinden idempotent |
| Kaynak büyük, kayıtların güncellenme zamanı var | Artımlı: filigran + geri bakış + upsert | Hızlı; geç gelen yakalanır |
| Kayıtlar değişmez, zamanla eklenir (olay günlüğü) | Gün bölümlü yükleme: o günün bölümünü sil, yeniden yaz | Tekrar çalıştırmak güvenli |
| Kaynak silmeleri bildirmiyor | Yumuşak silme alanı ya da dönemsel tam karşılaştırma | Artımlı yükleme silmeyi görmez |
| Dönüşüm kuralları sık değişiyor | Yükle-dönüştür (ELT): ham veriyi yükle, dönüşüm SQL'de | Kural değişince ham veriden yeniden hesap |
| Kişisel veri ham olarak bile saklanmamalı | Çek-dönüştür-yükle (ETL): yüklemeden önce maskele | Ham katmana girmesin |
| Kaynak API sınırlı ya da kırılgan | Ham yanıtı sakla; hız sınırı, geri çekilmeli yeniden deneme | Yeniden işlemek için yeniden çekmek gerekmesin |

## İdempotent yükleme

```sql calistir
CREATE TABLE siparis_ekle (siparis_id INTEGER, durum TEXT, tutar_kurus INTEGER);
CREATE TABLE siparis_upsert (siparis_id INTEGER PRIMARY KEY, durum TEXT, tutar_kurus INTEGER);
-- Birinci koşu
INSERT INTO siparis_ekle VALUES (1, 'odendi', 12050), (2, 'odendi', 9990);
INSERT INTO siparis_upsert VALUES (1, 'odendi', 12050), (2, 'odendi', 9990)
  ON CONFLICT (siparis_id) DO UPDATE SET durum = excluded.durum, tutar_kurus = excluded.tutar_kurus;
-- Aynı koşu yeniden denendi; bu arada 2 numaralı sipariş iptal edildi
INSERT INTO siparis_ekle VALUES (1, 'odendi', 12050), (2, 'iptal', 9990);
INSERT INTO siparis_upsert VALUES (1, 'odendi', 12050), (2, 'iptal', 9990)
  ON CONFLICT (siparis_id) DO UPDATE SET durum = excluded.durum, tutar_kurus = excluded.tutar_kurus;
SELECT 'yalnız ekleme', COUNT(*), SUM(tutar_kurus) FROM siparis_ekle;
SELECT 'anahtarla upsert', COUNT(*), SUM(tutar_kurus) FROM siparis_upsert;
SELECT 'upsert sonrası durum', siparis_id, durum FROM siparis_upsert ORDER BY siparis_id;
```

```cikti
yalnız ekleme|4|44080
anahtarla upsert|2|22040
upsert sonrası durum|1|odendi
upsert sonrası durum|2|iptal
```

Yalnız ekleyen hat her yeniden denemede ciroyu katlar ve iptali görmez. Anahtar, kaynağın kayıt kimliğidir
(sipariş no; kur için tarih + para birimi); anahtarı olmayan kaynakta bölüm sil-yaz kullanılır ve ikisi aynı
işlemde (transaction) yapılır, yoksa arada çöken koşu bölümü boş bırakır.

## Artımlı yükleme ve geç gelen veri

Çevrimdışı çalışan bir telefon, 1. günde oluşan olayı 3. günde gönderir. Filigran olay zamanında tutulursa bu olay
kaçar:

```python calistir
from datetime import datetime, timedelta

olaylar = [  # (olay_id, olay_zamani: cihaz, varis_zamani: sunucu)
    ("e1", "2026-11-01T09:00", "2026-11-01T09:00"), ("e2", "2026-11-01T18:00", "2026-11-01T18:01"),
    ("e3", "2026-11-02T10:00", "2026-11-02T10:00"), ("e4", "2026-11-01T20:00", "2026-11-03T08:30"),
    ("e5", "2026-11-03T09:00", "2026-11-03T09:00"), ("e6", "2026-11-03T21:00", "2026-11-03T21:02"),
]
kosular = ["2026-11-01T23:59", "2026-11-02T23:59", "2026-11-03T23:59"]  # her gece bir koşu


def gece_kosulari(alan: int, geri_bakis_gun: int = 0) -> tuple[int, int]:
    hedef, filigran, islenen = {}, "", 0
    for an in kosular:
        gorunen = [o for o in olaylar if o[2] <= an]  # o ana kadar sunucuya ulaşanlar
        sinir = filigran
        if filigran and geri_bakis_gun:  # tarih aritmetiği metinle değil datetime ile
            geri = datetime.fromisoformat(filigran) - timedelta(days=geri_bakis_gun)
            sinir = geri.isoformat(timespec="minutes")
        yeni = [o for o in gorunen if o[alan] > sinir]
        for o in yeni:
            hedef[o[0]] = o  # anahtarla upsert: yeniden işlemek yineleme üretmez
        islenen += len(yeni)
        filigran = max([filigran] + [o[alan] for o in yeni])
    return len(hedef), islenen


for ad, alan, geri in (("olay zamanı filigranı", 1, 0), ("varış zamanı filigranı", 2, 0),
                       ("olay zamanı + 3 gün geri bakış", 1, 3)):
    adet, islenen = gece_kosulari(alan, geri)
    print(f"{ad:31s}: hedefte {adet}/6 olay (işlenen satır {islenen})")
```

```cikti
olay zamanı filigranı          : hedefte 5/6 olay (işlenen satır 5)
varış zamanı filigranı         : hedefte 6/6 olay (işlenen satır 6)
olay zamanı + 3 gün geri bakış : hedefte 6/6 olay (işlenen satır 11)
```

| Filigran | Kaçırır mı | Bedeli |
| --- | --- | --- |
| Olay (cihaz) zamanı | Geç gelen olayları kaçırır | — |
| Sunucu varış zamanı | Hayır (sunucu saati tek ve ileri gider) | Kaynakta varış zamanı sütunu gerekir |
| Olay zamanı + geri bakış | Pencere içindekileri yakalar | Aynı kayıtlar tekrar işlenir; upsert şart |

Geç gelen veri raporu da değiştirir: dünkü sayı bugün artabilir. Panoda "son 3 gün kesinleşmedi" diye yazın
([pano tasarımı](pano-tasarimi.md)). Kaynak bir dönemi henüz yayımlamadıysa (boş yanıt, 404) o dönemi "işlendi"
sayıp filigranı ilerletmeyin: "veri yok" ile "henüz yok" ayrı durumlardır; filigran yalnız kesinleşmiş döneme kadar
ilerler.

## Durum, karantina ve koşu günlüğü

```python calistir
kaynak = [
    {"siparis_id": 1, "tutar_kurus": 12050, "varis": "2026-11-14T10:00"},
    {"siparis_id": 2, "tutar_kurus": "1.250,50", "varis": "2026-11-14T11:00"},  # tür bozuk
    {"siparis_id": 3, "tutar_kurus": 9990, "varis": "2026-11-15T09:00"},
]
hedef, durum, karantina, gunluk = {}, {"filigran": ""}, [], []


def kos(no: int, kopma: bool = False) -> None:
    kayit = {"kosu": no, "durum": "calisiyor", "eklenen": 0, "degismeyen": 0, "karantina": 0}
    try:
        yeni = [k for k in kaynak if k["varis"] > durum["filigran"]]
        for k in yeni:
            if not isinstance(k["tutar_kurus"], int):
                karantina.append({"kosu": no, "kayit": k, "sorun": "tutar_kurus tam sayı değil"})
                kayit["karantina"] += 1
                continue
            if kopma and kayit["eklenen"] == 1:
                raise ConnectionError("bağlantı koptu")
            alan = "degismeyen" if hedef.get(k["siparis_id"]) == k else "eklenen"
            hedef[k["siparis_id"]] = k
            kayit[alan] += 1
        durum["filigran"] = max([durum["filigran"]] + [k["varis"] for k in yeni])  # YALNIZ başarıdan sonra
        kayit["durum"] = "karantinali" if kayit["karantina"] else "basarili"
    except ConnectionError as hata:
        kayit["durum"] = f"hata: {hata}"
    finally:
        gunluk.append({**kayit, "filigran": durum["filigran"] or "-"})


kos(1, kopma=True)
kos(2)
kos(3)
for satir in gunluk:
    print(satir)
print("hedefteki sipariş:", sorted(hedef), "· karantina:", [k["kayit"]["siparis_id"] for k in karantina])
```

```cikti
{'kosu': 1, 'durum': 'hata: bağlantı koptu', 'eklenen': 1, 'degismeyen': 0, 'karantina': 1, 'filigran': '-'}
{'kosu': 2, 'durum': 'karantinali', 'eklenen': 1, 'degismeyen': 1, 'karantina': 1, 'filigran': '2026-11-15T09:00'}
{'kosu': 3, 'durum': 'basarili', 'eklenen': 0, 'degismeyen': 0, 'karantina': 0, 'filigran': '2026-11-15T09:00'}
hedefteki sipariş: [1, 3] · karantina: [2, 2]
```

Okuma: 1. koşu bir kayıt yazdıktan sonra koptu; filigran ilerlemediği için 2. koşu aynı yerden başladı, yazılmış
kaydı "değişmeyen" saydı (idempotent), bozuk kaydı yeniden karantinaya aldı. 3. koşu yeni bir şey bulmadı. Karantina
kaydı her koşuda yinelenmesin istiyorsanız kaynak kimliğiyle tekilleştirin; asıl iş kaynağı düzelttirmektir.

Koşu günlüğünde en az şunlar bulunur: hat adı, koşu kimliği, başlangıç ve bitiş, durum, çekilen, geçerli,
karantina, eklenen, güncellenen, değişmeyen, filigranın önceki ve sonraki değeri, hata iletisi. Kişisel veri yazılmaz.
Uyarılar bu günlükten üretilir: "üst üste iki koşuda 0 satır", "karantina oranı %1'in üstünde", "son başarılı koşu
26 saatten eski".

## Şema değişikliği

| Değişiklik | Belirti | Hattın tepkisi |
| --- | --- | --- |
| Yeni sütun eklendi | Fazladan alan | Devam et, uyar; sözleşmeye eklenene dek ham katmanda tut |
| Sütun kaldırıldı ya da adı değişti | Beklenen alan yok | **Dur** (hata); boş değerle doldurup devam etme |
| Tür değişti (sayı → `"1.250,50"`) | Dönüşüm başarısız | Satırı karantinaya al; oran yüksekse dur |
| Yeni kategori değeri (`durum = "kismi_iade"`) | İzinli listede yok | Karantina ya da "(bilinmeyen)" + uyarı |
| Birim değişti (TL → kuruş) | Değerler 100 kat | Hacim/dağılım denetimi yakalar ([veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md)) |

Sessiz şema değişikliği en pahalı hatadır: hat "başarılı" biter, sütun haftalarca boş dolar ve bunu panodaki
açıklanamayan düşüş haber verir.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Hat iki kez çalışınca sayılar ikiye katlandı | Yalnız ekleme | Anahtarla upsert ya da bölüm sil-yaz (tek işlemde) |
| Dünkü sayı bugün arttı | Geç gelen veri | Geri bakış penceresi; panoda "kesinleşmedi" etiketi |
| Çevrimdışı cihazların olayları hiç yok | Filigran cihaz zamanında | Varış zamanı filigranı ya da geri bakış |
| Hatadan sonra bir gün eksik kaldı | Durum, yükleme başarısız olsa da ilerletildi | Durumu yalnız başarıdan sonra yazın |
| Henüz yayımlanmamış dönem hiç gelmedi | Boş yanıt "veri yok" sayılıp filigran ilerletildi | "Henüz yok"u ayırın; filigranı kesinleşmiş döneme kadar ilerletin |
| Bir sütun haftalardır boş | Kaynak sütun adını değiştirdi; hat sessizce NULL doldurdu | Eksik sütun = hata, koşu durur |
| Geçersiz kayıtlar iz bırakmadan kayboldu | Doğrulama satırı atıp geçti | Karantina + günlükte sayı |
| Kaynakta silinen kayıt hedefte duruyor | Artımlı yükleme silmeyi görmez | Yumuşak silme alanı ya da dönemsel tam karşılaştırma |
| Yarım yazılmış dosya okundu | Yazma atomik değil | Geçici dosyaya yazın, sonra yeniden adlandırın |
| Hat üç gündür bir şey çekmiyor, kimse fark etmedi | Günlük var, uyarı yok | "0 satır" ve "son başarılı koşu" uyarıları |
| Gece yarısı koşusu yanlış günü işliyor | UTC ile Türkiye günü karıştı | İşleme gününü saat dilimiyle tanımlayın ([analitik veri modeli](analitik-veri-modeli.md)) |
| `except Exception: pass` sonrası her şey "başarılı" | Hata yutuldu | Hata günlüğe yazılır, koşu "hata" biter, durum ilerlemez |

## Denetim listesi

- [ ] Hat arka arkaya iki kez çalıştırıldı; hedef değişmedi (otomatik test var).
- [ ] Yükleme anahtarlı upsert ya da tek işlemde bölüm sil-yaz; anahtar yazılı.
- [ ] Durum yalnız başarılı yüklemeden sonra yazılıyor; yarıda kesilen koşu test edildi.
- [ ] Filigran varış zamanında ya da geri bakış penceresi var; süresi gerekçeli.
- [ ] "Henüz yayımlanmadı" ile "veri yok" ayrılıyor; filigran kesinleşmiş dönemi geçmiyor.
- [ ] Geçersiz kayıtlar karantinada; sayısı günlükte ve uyarıda.
- [ ] Şema denetimi: eksik sütun hata, yeni sütun uyarı, tür uyuşmazlığı karantina.
- [ ] Her koşu günlüğe yazılıyor; uyarılar (0 satır, karantina oranı, gecikme) tanımlı.
- [ ] Ham yanıtlar saklanıyor; saklama süresi belli.
- [ ] Geçmiş dönemi yeniden doldurmak (backfill) durumu bozmadan parametreyle yapılabiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni hattı `veri/verihavuzu/hat/examples/tcmb.py` kalıbıyla yaz: `fetch` (artımlı durum
  `ctx.state` içinde), `validate` (sorun listesi döndürür), `transform`, `SPEC` (tablo ve anahtar). Yükleme anahtarlı
  upsert olsun. Durumu yalnız başarıdan sonra ilerlet. Kayıtlı yanıtlarla çevrimdışı test yaz: iki kez çalıştırınca
  ikinci koşuda `degismeyen` = ilk koşunun `eklenen`i; bozuk kayıt karantinada; hata sonrası durum ilerlememiş."
- **Modelin tipik hatası:** `INSERT` ile ekler; filigranı yüklemeden önce yazar; geçersiz satırı sessizce atar;
  `except Exception: pass` yazar; boş yanıtı "veri yok" sayıp filigranı ilerletir; şema değişince NULL doldurur.
- **Çıktıda denetleyin:** testlerde "iki kez çalıştır" senaryosu var mı; durumun yazıldığı satır yüklemeden sonra
  mı; karantina dosyası ve günlük satırı üretiliyor mu; `except` blokları hatayı günlüğe yazıp yeniden fırlatıyor mu.

## İlgili

- Çalışan hat: [`veri/verihavuzu/hat/pipeline.py`](../../veri/verihavuzu/hat/pipeline.py) (çek → doğrula →
  dönüştür → yükle, karantina, durum, koşu günlüğü); anahtarlı upsert yapan JSONL, CSV, SQLite ve DuckDB depoları:
  [`veri/verihavuzu/hat/storage.py`](../../veri/verihavuzu/hat/storage.py); artımlı örnek:
  [`veri/verihavuzu/hat/examples/tcmb.py`](../../veri/verihavuzu/hat/examples/tcmb.py)
- İdempotentlik, karantina ve artımlılık testleri: [`veri/tests/test_hat.py`](../../veri/tests/test_hat.py);
  "Yeni hat ekle" tarifi: [`veri/AGENTS.md`](../../veri/AGENTS.md)
- Geri çekilmeli yeniden deneme: [`kutuphane/py/kutuphane/yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py)
- [Veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md) — beklentileri hatta koymak
- [Analitik veri modeli](analitik-veri-modeli.md) — olay ve varış zamanı, saat dilimi
- [Olay izleme planı](olay-izleme-plani.md) — istemcide üretilen `olay_id` ile tekilleştirme
- [Araç seçimi](arac-secimi.md) — ham ve ara katman için dosya biçimi
