---
baslik: İçe ve dışa aktarım: toplu veri yükleme ve indirme uçları
ozet: CSV/Excel içe aktarımda satır satır doğrulama, önizleme, satır numaralı hata raporu ve tekrar yüklemede kopya üretmeyen yazma; dışa aktarımda yetki süzgeci, akışla yazma, Türkçe Excel biçimi ve formül kaçışı.
etiketler: [ice-aktarim, csv, excel, api, turkce]
duzey: orta
guncellik: 2026-11
---

# İçe ve dışa aktarım: toplu veri yükleme ve indirme uçları

> Bu notu ne zaman okumalı: "Excel'den ürün/müşteri listesi yükleyelim" ya da "listeyi Excel'e indirelim"
> özelliği yazılırken; "aynı dosyayı iki kez yükledim, her şey ikilendi", "hangi satırda hata var anlamıyorum",
> "Excel'de Türkçe harfler bozuk" ya da "indirilen dosyada başkalarının kaydı var" denildiğinde.

## Temel fikir

İçe aktarım, internetten gelen **toplu ve güvenilmez girdidir**; dışa aktarım, sistemden **toplu kişisel veri
çıkışıdır**. İkisi de tek tek kayıt uçlarından daha dikkat ister:

- İçe aktarım her satırı doğrular, hataları **dosyadaki satır numarasıyla** bildirir, yazmadan önce önizleme
  sunar, varsayılan olarak **ya hep ya hiç** yazar ve aynı dosya ikinci kez yüklendiğinde kopya üretmez (doğal
  anahtara göre ekle-ya-da-güncelle).
- Dışa aktarım, liste ucuyla **aynı yetki ve kiracı süzgecinden** geçer, satırları belleğe toplamadan akışla
  yazar, Türkçe Excel'in açacağı biçimi üretir ve formülle başlayan metin hücrelerini etkisizleştirir.

Biçimin ayrıntısı (noktalı virgül, ondalık virgül, BOM, tarih yazımı) `10-diller` kümesindedir:
[Veri biçimleri](../10-diller/veri-bicimleri.md). Bu not akışı ve kararları anlatır.

## Karar tablosu

| Soru                                       | Varsayılan seçim                                     | Ne zaman başka                                            |
| ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| Hatalı satır varsa?                        | Hiçbir şey yazılmaz; satır numaralı hata raporu      | Kullanıcı açıkça "geçerlileri yükle" derse kısmi yazma    |
| Yazmadan önce?                             | Önizleme: kaç satır eklenecek/güncellenecek, hatalar | Çok küçük, geri alınabilir işlemlerde gerekmez            |
| Aynı dosya iki kez yüklenirse?             | Doğal anahtarla (ürün kodu, e-posta) ekle-ya-da-güncelle | Anahtar yoksa dosya özetiyle "bu dosya zaten yüklendi"  |
| Dosya büyükse (on binlerce satır)?         | Arka plan işi + ilerleme + sonuç raporu              | Birkaç yüz satır istek içinde yapılabilir                 |
| Dışa aktarım biçimi?                       | Excel kullanıcısına `;` + BOM'lu CSV ya da XLSX      | Makineye JSON (havuzdaki "verilerimi indir" gibi)         |
| Dışa aktarım büyükse?                      | Arka plan işi → kısa süreli imzalı indirme adresi    | Küçükse doğrudan akış yanıtı                              |

## İçe aktarım: doğrula, raporla, önizle, tekrarlanabilir yaz

```python calistir
import csv
import io
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("CREATE TABLE urun (kod TEXT PRIMARY KEY, ad TEXT NOT NULL, fiyat_kurus INTEGER NOT NULL CHECK (fiyat_kurus >= 0))")


def kurus(metin: str) -> int:  # "1.234,50" → 123450 (Türkçe yazım); kayan sayıya hiç uğramadan
    temiz = metin.strip().replace(".", "")
    lira, _, kurus_ = temiz.partition(",")
    if not lira.isdigit() or not (kurus_ == "" or (kurus_.isdigit() and len(kurus_) <= 2)):
        raise ValueError("fiyat 1.234,50 biçiminde olmalı")
    return int(lira) * 100 + int(kurus_.ljust(2, "0"))


def ice_aktar(dosya: str, deneme: bool) -> dict:
    okuyucu = csv.DictReader(io.StringIO(dosya.lstrip("﻿")), delimiter=";")
    if okuyucu.fieldnames != ["kod", "ad", "fiyat"]:
        return {"hata": f"başlık 'kod;ad;fiyat' olmalı, gelen: {okuyucu.fieldnames}"}
    gecerli, hatalar = [], []
    for no, satir in enumerate(okuyucu, start=2):  # Excel'deki satır numarası (1. satır başlık)
        try:
            if not satir["kod"].strip() or not satir["ad"].strip():
                raise ValueError("kod ve ad boş olamaz")
            gecerli.append((satir["kod"].strip(), satir["ad"].strip(), kurus(satir["fiyat"])))
        except ValueError as hata:
            hatalar.append({"satir": no, "neden": str(hata)})
    if deneme or hatalar:  # önizleme ya da hatalı dosya: hiçbir şey yazılmaz, rapor döner
        return {"yazilacak": len(gecerli), "hatalar": hatalar, "yazildi": False}
    db.execute("BEGIN IMMEDIATE")  # ya hep ya hiç; büyük dosyada partiler + iş kaydı
    db.executemany(
        """INSERT INTO urun VALUES (?, ?, ?)
           ON CONFLICT (kod) DO UPDATE SET ad = excluded.ad, fiyat_kurus = excluded.fiyat_kurus""",
        gecerli,
    )
    db.execute("COMMIT")
    return {"yazilacak": len(gecerli), "hatalar": [], "yazildi": True}


bozuk = "﻿kod;ad;fiyat\r\nS1;Simit;15,00\r\nC1;Çay;on lira\r\nP1;;20\r\n"
assert ice_aktar(bozuk, deneme=False) == {
    "yazilacak": 1,
    "hatalar": [{"satir": 3, "neden": "fiyat 1.234,50 biçiminde olmalı"}, {"satir": 4, "neden": "kod ve ad boş olamaz"}],
    "yazildi": False,
}
temiz = "﻿kod;ad;fiyat\r\nS1;Simit;15,00\r\nC1;Çay;1.234,5\r\n"
assert ice_aktar(temiz, deneme=True)["yazildi"] is False  # önizleme: yazmaz
for _ in range(2):  # aynı dosya iki kez yüklendi (çift tık, yeniden deneme)
    assert ice_aktar(temiz, deneme=False)["yazildi"]
assert db.execute("SELECT kod, fiyat_kurus FROM urun ORDER BY kod").fetchall() == [("C1", 123450), ("S1", 1500)]
print("tamam")
```

```cikti
tamam
```

Örneğin dışında kalan ama gereken adımlar:

- **Boyut ve satır sınırı** önce (ör. 5 MB, 10 000 satır); aşan dosya arka plan işine ya da reddedilir
  ([Dosya ve medya](dosya-ve-medya.md)).
- **Kodlama:** UTF-8 bekleyin, baştaki BOM'u atın. Eski Excel ve muhasebe yazılımları Türkçe dosyayı Windows-1254
  ile kaydedebilir; UTF-8 çözülemezse kullanıcıya "dosyayı UTF-8 olarak kaydedin" deyin ya da 1254'ü deneyip
  önizlemede gösterin. Sessizce yanlış çözmek "Ã§", "Ã¼" gibi bozuk harfleri kalıcı veriye yazar.
- **Ayırıcı:** Türkçe Excel `;` ile kaydeder; başka yerden gelen dosya `,` olabilir. İlk satıra bakarak seçin ve
  önizlemede gösterin. Hazır ayrıştırıcı (ayırıcı tespiti, akış, Türkçe Excel uyumu):
  [`kutuphane/py/kutuphane/csv.py`](../../kutuphane/py/kutuphane/csv.py) (TypeScript eşi `kutuphane/ts/src/csv.ts`).
- **Değer temizliği:** baş/son boşluk, Unicode NFC, e-postada küçük harf (ASCII kural), telefon ve kimlik
  numarasını **metin** olarak (Excel baştaki 0'ı siler), tarihi `GG.AA.YYYY`'den takvim gününe
  ([Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)).
- **Kiracı ve yetki:** her satır içe aktaranın kiracısına yazılır; dosyadaki "kiracı" ya da "sahip" sütunu yok
  sayılır ([Yetkilendirme](yetkilendirme.md)).
- **Büyük dosya:** iş kaydı (`bekliyor → isleniyor → bitti/hatali`), partiler hâlinde yazma, ilerleme yüzdesi, bitince
  hata raporu indirilebilir dosya olarak ([Arka plan işleri](arka-plan-isleri.md)).
- **Denetim kaydı:** kim, ne zaman, kaç satır ekledi/güncelledi.

## Dışa aktarım: süz, akışla yaz, formülü etkisizleştir

```python calistir
import csv
import io

FORMUL = ("=", "+", "-", "@", "\t", "\r")


def hucre(deger) -> str:
    if isinstance(deger, int):  # kuruş → Türkçe ondalık; sayı hücresi kaçışlanmaz
        return f"{deger // 100},{deger % 100:02d}" if deger >= 0 else "-" + hucre(-deger)
    metin = str(deger)
    return "'" + metin if metin.startswith(FORMUL) else metin  # formülle başlayan METİN etkisizleşir


def disa_aktar(satirlar):
    """Üreteç: dev tabloyu belleğe almadan parça parça yazar (yanıt akışı olarak gönderilir)."""
    tampon = io.StringIO()
    yazici = csv.writer(tampon, delimiter=";", lineterminator="\r\n")
    yield "﻿"  # Türkçe Excel UTF-8'i BOM ile tanır
    yazici.writerow(["Ad", "Not", "Bakiye"])
    for satir in satirlar:  # gerçekte: imleçli sorgudan gelen satırlar
        yazici.writerow([hucre(d) for d in satir])
        yield tampon.getvalue()
        tampon.seek(0)
        tampon.truncate()
    yield tampon.getvalue()  # satır hiç yoksa başlık yine yazılsın


assert "".join(disa_aktar([])) == "﻿Ad;Not;Bakiye\r\n"  # boş liste: yalnız başlık
veri = [("Ayşe", '=HYPERLINK("http://kotu.example","Tıkla")', 123450), ("Burak", "-5 indirim", -250)]
satirlar = "".join(disa_aktar(veri)).removeprefix("﻿").split("\r\n")
assert satirlar[0] == "Ad;Not;Bakiye"
assert satirlar[1] == 'Ayşe;"\'=HYPERLINK(""http://kotu.example"",""Tıkla"")";1234,50'  # formül çalışmaz
assert satirlar[2] == "Burak;'-5 indirim;-2,50"  # metin kaçışlandı, eksi tutar sayı olarak kaldı
print("tamam")
```

```cikti
tamam
```

- **Formül (CSV) enjeksiyonu:** kullanıcının yazdığı bir not `=`, `+`, `-`, `@` ile başlıyorsa Excel onu formül
  olarak çalıştırır (dış bağlantı, veri sızdırma). Metin hücrelerinin başına `'` koyun; sayı hücrelerine dokunmayın.
  Güvenlik yüzü: [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md).
- **Yetki:** dışa aktarım, ekrandaki listeyle **aynı** depo işlevini ve süzgeci kullanır; ayrı yazılmış "aktarım
  sorgusu" kiracı süzgecini unutmanın en sık yoludur.
- **Veri en azı:** yalnız gereken sütunlar; TC kimlik no, tam adres gibi alanlar ancak gerekçesi varsa. Kim, ne zaman,
  kaç kişinin verisini indirdi: denetim kaydına (KVKK).
- **Akış:** satırlar imleçli sorguyla parça parça okunur ve yanıta yazılır; büyük aktarım iş olarak üretilip kısa
  süreli imzalı adresle verilir ([Dosya ve medya](dosya-ve-medya.md)).
- **Başlıklar:** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment` + Türkçe ad için
  `filename*`, `Cache-Control: no-store`. Havuzdaki "verilerimi indir" ucu JSON ve tarihli dosya adıyla bunu yapar
  ([`docs/API.md`](../../uygulama/docs/API.md) → `GET /api/account/export`, [`account/service.ts`](../../uygulama/api/src/modules/account/service.ts)).
- **Geri yüklenebilirlik:** içe aktarım şablonu ile dışa aktarım çıktısı aynı sütunları kullanırsa kullanıcı
  indirip düzeltip yeniden yükleyebilir.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Aynı dosya iki kez yüklenince kayıtlar ikilendi                  | Düz `INSERT`; doğal anahtar yok                          | Doğal anahtarla ekle-ya-da-güncelle; ya da dosya özeti kaydı  |
| Dosyanın yarısı yüklendi, yarısı hatalı; kimse neyin girdiğini bilmiyor | Satır satır ayrı işlem, ilk hatada durdu          | Önce bütün dosyayı doğrula; ya hep ya hiç                     |
| "Hata var" deniyor ama hangi satır belli değil                   | Hata raporu satır numarası taşımıyor                     | Excel satır numarasıyla (başlık 1) rapor                      |
| Türkçe harfler `Ã§`, `ð`, `þ` olarak kaydedildi                  | Dosya Windows-1254, UTF-8 sanıldı (ya da tersi)          | Kodlamayı denetleyin; önizlemede gösterin                     |
| Telefon numaralarının başındaki 0 kayboldu                       | Excel sayıya çevirdi ya da kod sayıya dönüştürdü         | Metin olarak okuyun ve yazın                                  |
| 1.234,50 TL 1,23 TL olarak kaydedildi                            | Ondalık virgül/nokta karıştı, `float` kullanıldı         | Türkçe yazımı açıkça ayrıştırın; kuruş tamsayı                |
| İndirilen dosyada başka firmanın kayıtları var                   | Aktarım için ayrı sorgu yazıldı, süzgeç unutuldu         | Liste ucuyla aynı depo işlevi                                 |
| Dosyayı açan muhasebeci "dış bağlantı" uyarısı gördü             | Formül enjeksiyonu                                       | Formülle başlayan metin hücrelerine `'`                       |
| Büyük aktarım sunucu belleğini doldurdu                          | Bütün satırlar listeye toplanıp sonra yazıldı            | Akış; büyükse arka plan işi                                   |
| Excel dosyayı tek sütun gösteriyor                               | `,` ayırıcı ya da BOM yok                                | `;` + BOM ya da XLSX                                          |

## Denetim listesi

- [ ] İçe aktarım: boyut/satır sınırı, kodlama denetimi, başlık doğrulaması, satır satır şema doğrulaması.
- [ ] Hata raporu dosyadaki satır numarasını ve nedeni Türkçe veriyor.
- [ ] Önizleme var; varsayılan ya hep ya hiç; kısmi yazma yalnız açık seçimle.
- [ ] Yazma doğal anahtarla ekle-ya-da-güncelle; aynı dosyanın ikinci yüklenişi kopya üretmiyor (testli).
- [ ] Her satır içe aktaranın kiracısına yazılıyor; dosyadaki sahip/kiracı sütunları yok sayılıyor.
- [ ] Büyük dosyalar arka plan işinde, ilerleme ve sonuç raporuyla.
- [ ] Dışa aktarım liste ucunun yetki/süzgeç işlevini kullanıyor; gereksiz kişisel alan yok; denetim kaydı var.
- [ ] Dışa aktarım akışla yazılıyor; Türkçe Excel biçimi (`;`, BOM, ondalık virgül); formül kaçışı var.
- [ ] Yanıt başlıkları: doğru tür, `attachment` + `filename*`, `no-store`.

## Küçük modele yaptırırken

- **İsteme yazın:** "İçe aktarımda önce bütün dosyayı doğrula; hataları `{satir, neden}` listesiyle (Excel satır
  numarası) döndür; hata varsa hiçbir şey yazma. `dryRun` parametresi önizleme versin. Yazma `ON CONFLICT (kod) DO
  UPDATE` ile. Dışa aktarımda liste ucunun depo işlevini kullan, akışla yaz, `;` + BOM, formülle başlayan metne `'`."
- **Tipik hatalar:** satır satır `INSERT` edip ilk hatada durmak; hatayı "geçersiz dosya" diye tek cümleyle
  vermek; `parseFloat("1.234,50")`; telefonu sayıya çevirmek; aktarım için ayrı ve süzgeçsiz sorgu; bütün satırları
  belleğe almak; formül kaçışını unutmak; kodlamayı hiç düşünmemek.
- **Çıktıda arayın:** `parseFloat`/`float(` ile tutar okuma; içe aktarımda `ON CONFLICT`/upsert; hata raporunda satır
  numarası; aktarım sorgusunda kiracı koşulu; yazıcıda `﻿` ve `;`.
- **Test isteyin:** "aynı dosya iki kez → kayıt sayısı değişmez", "üçüncü satırdaki hatalı fiyat raporda satır 3
  olarak görünür ve hiçbir şey yazılmaz", "`=` ile başlayan not dışa aktarımda `'=` olur", "başka kiracının kaydı
  dışa aktarımda yok".

## İlgili

- [Veri biçimleri](../10-diller/veri-bicimleri.md) (CSV ve Türkçe Excel ayrıntısı) ·
  [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md) · [Dosya ve medya](dosya-ve-medya.md) ·
  [Arka plan işleri](arka-plan-isleri.md) · [Yetkilendirme](yetkilendirme.md) · [API tasarımı](api-tasarimi.md)
  (toplu işlem ve uzun süren işlem kalıbı)
