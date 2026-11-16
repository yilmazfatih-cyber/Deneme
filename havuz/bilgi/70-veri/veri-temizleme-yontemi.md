---
baslik: Veri temizleme yöntemi
ozet: Profil → kural → düzelt → kaydet → doğrula adımları; eksik değer stratejileri, aykırı değer kararı, yinelenen kayıt, birim ve biçim tutarlılığı, Türkçe kodlama ve ondalık virgül sorunları.
etiketler: [veri, temizleme, veri-kalitesi, turkce, csv, eksik-deger]
duzey: orta
guncellik: 2026-11
---

# Veri temizleme yöntemi

> Bu notu ne zaman okumalı: dışarıdan (Excel, form, başka sistem) gelen bir dosyayı analiz etmeden ya da
> yüklemeden önce; sayılar tuhaf çıktığında; Türkçe harfler bozuk göründüğünde; "şu satırları silelim mi?" diye
> sorulduğunda.

## Temel fikir

Temizleme, düzeltme değil **kayıtlı kararlar dizisidir**. Ham dosyaya dokunulmaz; temizleme bir betiktir (aynı
girdiden aynı çıktı), her değişiklik bir günlüğe yazılır, sonunda sonuç yeniden doğrulanır:

1. **Profil:** ne var? Tür, eksik oranı, tekil sayısı, en sık değerler, en küçük ve en büyük.
2. **Kural:** ne olmalı? Yazılı, temizlemeden önce (şema ya da denetim dosyası).
3. **Düzelt:** yalnız kurala göre. Doğrusu bilinmeyen değer uydurulmaz; eksik bırakılır ya da karantinaya gider.
4. **Kaydet:** her değişiklik (satır, sütun, eski, yeni, kural) ve sayılar.
5. **Doğrula:** kurallar yeniden; satır mutabakatı: giren = çıkan + karantina.

En tehlikeli temizlik sessiz olanıdır: satır silinir, değer doldurulur ve kimse bilmez.

## Karar tablosu: eksik değer

| Durum | Strateji | Neden |
| --- | --- | --- |
| Önce: `999`, `-1`, `0`, `yok`, `N/A`, `-`, boş metin | Hepsini eksiğe çevirin | Kod değerleri istatistiği bozar |
| Eksiklik az (%1–2) ve rastgele görünüyor | Analizden çıkarın, sayısını yazın | Yanlılık küçük |
| Eksiklik bir grupta yoğun (eski sürüm alanı göndermiyor) | "(bilinmiyor)" kategorisi; grubu ayrı raporlayın | Silmek o grubu yok eder |
| Eksikliğin kendisi bilgi (gelir boş = beyan etmedi) | Bayrak sütunu (`gelir_eksik`) + kategori | Doldurmak bu bilgiyi siler |
| Sayısal alan, model için | Ortanca + bayrak; doldurma değeri yalnız eğitim verisinden | Ortalama aykırıdan etkilenir; bütün veriden öğrenmek sızıntıdır |
| Zaman serisi: ölçüm yok (kur, stok) | `NULL` ya da ileri taşıma | Değer vardı, ölçülmedi |
| Zaman serisi: olay yok (satış) | 0 | Olmayan satış sıfırdır |
| Kategorik alan | "(bilinmiyor)" | En sık değerle doldurmak çoğunluğu şişirir |
| Kimlik, tutar, tarih gibi zorunlu alan | Doldurmayın: karantina + kaynağa sorun | Uydurulmuş değer yanlış veridir |

## Aykırı değer kararı

Sırayla sorun:

1. **Olabilir mi?** Negatif yaş, 200 yaş, gelecekte doğum tarihi, 31 Şubat → hata. Kaynaktan düzeltin ya da
   eksik yapıp kaydedin.
2. **Birim hatası mı?** Değer tam 100 ya da 1000 kat (kuruş ↔ TL, gram ↔ kilogram, ms ↔ s) → kuralla çevirin.
3. **Gerçek ama uç mu?** Kurumsal sipariş, çok sadık müşteri → **tutun**. Analizde ortanca ve yüzdelik kullanın;
   modelde gerekirse eğitim verisinden öğrenilmiş eşikle kırpın (winsorize).

İstatistiksel "aykırı" etiketi hata demek değildir. Tamamen geçerli ama çarpık bir veride (sepet tutarı gibi)
yaygın kurallar şunları işaretler:

```python calistir
import math
import random
import statistics as st

r = random.Random(8)
sepet = [r.lognormvariate(5, 1) for _ in range(10000)]  # hepsi GERÇEK değer; hata yok


def iqr_disi(x: list[float]) -> float:
    q1, _, q3 = st.quantiles(x, n=4, method="inclusive")
    alt, ust = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    return sum(v < alt or v > ust for v in x) / len(x)


ort, std = st.fmean(sepet), st.stdev(sepet)
for ad, pay in (("ortalama + 3 std dışı", sum(v > ort + 3 * std for v in sepet) / len(sepet)),
                ("IQR çitleri dışı", iqr_disi(sepet)),
                ("logaritmada IQR dışı", iqr_disi([math.log(v) for v in sepet]))):
    print(f"{ad:22s}: %{100 * pay:.1f}".replace(".", ","))
```

```cikti
ortalama + 3 std dışı : %1,7
IQR çitleri dışı      : %7,7
logaritmada IQR dışı  : %0,7
```

Bu satırları silmek gerçek müşterileri silmektir. Hata denetimi **kural** ile (olamaz değerler), inceleme listesi
**istatistik** ile yapılır; çarpık veride istatistiğe logaritmik ölçekte bakılır.

## Yinelenen kayıt

| Tür | Örnek | Ne yapılır |
| --- | --- | --- |
| Birebir aynı satır | Dosya iki kez yüklenmiş | Atın, sayısını yazın |
| Anahtar aynı, içerik farklı | Aynı müşterinin iki güncellemesi | Kural: en son güncelleme / en dolu kayıt / kaynak önceliği; kaydedin |
| Yakın yineleme | "Ayşe Yılmaz", "AYŞE YILMAZ ", "Ayse Yilmaz" | Türkçe katlanmış anahtarla karşılaştırın; emin olunmayanı insan onayına bırakın |

Büyük/küçük harf ve Türkçe karakter katlaması: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md).
SQL ile anahtar başına son sürüm: [analitik SQL kalıpları](analitik-sql-kaliplari.md).

## Birim ve biçim tutarlılığı

| Alan | Karışık gelen biçimler | Kural |
| --- | --- | --- |
| Para | `1.250,50`, `1250.5`, `125050` (kuruş), `₺1.250` | Tek birim (kuruş tam sayı ya da ondalık) + para birimi sütunu |
| Yüzde | `0,15`, `15`, `%15` | Tek biçim (oran 0–1); sütun adında belirtin |
| Tarih | `05.03.2026`, `2026-03-05`, `3/5/2026`, `46342` | ISO `YYYY-MM-DD`; gün/ay sırası kaynağa göre; Excel seri sayısı = 1899-12-30 + n gün |
| Telefon | `0532 …`, `+90532…`, `532…` | E.164: `+90532…` |
| Evet/hayır | `E/H`, `evet/hayır`, `1/0`, `true` | Mantıksal tür |
| Kod (posta, TCKN, IBAN) | `06100` → `6100`, `1,23E+15` | Her zaman metin; Excel'de açıp kaydetmeyin |

## Türkçe'ye özgü sorunlar

```python calistir
import csv
import io
from datetime import date, timedelta

dogru = "İstanbul, Şişli, Ağrı, Üsküdar"
bozuk = dogru.encode("utf-8").decode("cp1252")  # UTF-8 dosya Windows-1252 sanılarak okunmuş
print("bozuk kodlama :", bozuk)
print("onarım        :", bozuk.encode("cp1252").decode("utf-8"))

eski = "İstanbul Şişli".encode("cp1254")  # Windows-1254 (eski Türkçe Excel) dosyası
print("UTF-8 sanıp 'ignore' ile okumak:", repr(eski.decode("utf-8", errors="ignore")))
print("doğru kodlamayla               :", eski.decode("cp1254"))

bom_li = "\ufeffad;tutar\nAyşe;1.250,50\n".encode("utf-8")  # Excel'in "CSV UTF-8" çıktısı başta BOM taşır
for kod in ("utf-8", "utf-8-sig"):
    ilk = next(csv.reader(io.StringIO(bom_li.decode(kod)), delimiter=";"))[0]
    print(f"{kod:9s} ile ilk sütun adı:", repr(ilk))

print("Excel seri tarihi 46342 →", date(1899, 12, 30) + timedelta(days=46342))
```

```cikti
bozuk kodlama : Ä°stanbul, ÅžiÅŸli, AÄŸrÄ±, ÃœskÃ¼dar
onarım        : İstanbul, Şişli, Ağrı, Üsküdar
UTF-8 sanıp 'ignore' ile okumak: 'stanbul ili'
doğru kodlamayla               : İstanbul Şişli
utf-8     ile ilk sütun adı: '\ufeffad'
utf-8-sig ile ilk sütun adı: 'ad'
Excel seri tarihi 46342 → 2026-11-16
```

`errors="ignore"` hata iletisini susturur ve harfleri **sessizce siler**; `latin-1` ile okumak da hata vermez ama
yanlış harf üretir. Kodlamayı tahmin etmeyin: kaynağa sorun ya da birkaç bilinen sözcüğün ("İstanbul", "ş", "ğ")
doğru göründüğünü denetleyin. Dosyadan okurken `encoding="utf-8-sig"` BOM'u kendisi atar.

**Ondalık virgül ve binlik nokta:** `1.234` tek başına belirsizdir (1,234 mü 1234 mü?). Karar sütun düzeyinde
verilir: sütunda virgüllü bir değer varsa nokta binlik ayırıcıdır.

```python calistir
import re


def sutun_ayiraci(degerler: list[str]) -> str:
    """Sütunun ondalık ayırıcısını bütün değerlere bakarak seçer."""
    if any(re.search(r",\d{1,2}$", d) for d in degerler):
        return ","  # Türkçe yazım: 1.234,56
    if any(re.search(r"\.\d{1,2}$", d) for d in degerler):
        return "."  # İngilizce yazım: 1,234.56
    raise ValueError("ayırıcı belirsiz: kaynağa sorun, tahmin etmeyin")


def sayi(deger: str, ondalik: str) -> float:
    binlik = "." if ondalik == "," else ","
    temiz = deger.replace("\u00a0", "").replace(" ", "").replace(binlik, "").replace(ondalik, ".")
    return float(temiz)


tutar = ["1.234", "12,5", "1\u00a0250,75", "980"]
ayirac = sutun_ayiraci(tutar)
print(f"ayırıcı {ayirac!r}:", [sayi(d, ayirac) for d in tutar])
print("tek başına okunsaydı float('1.234') =", float("1.234"))
try:
    sutun_ayiraci(["1.234", "5.678"])
except ValueError as hata:
    print("belirsiz sütun:", hata)
```

```cikti
ayırıcı ',': [1234.0, 12.5, 1250.75, 980.0]
tek başına okunsaydı float('1.234') = 1.234
belirsiz sütun: ayırıcı belirsiz: kaynağa sorun, tahmin etmeyin
```

Diğer Türkçe tuzaklar: kopyala-yapıştırdan gelen bölünmez boşluk (`U+00A0`) sayıyı bozar; Excel `1,5` gibi bir
hücreyi tarihe çevirebilir; büyük harfe çevrilmiş adlarda `I`/`İ` karışır; `Mah.`, `Cad.`, `Sk.` kısaltmaları
eşleşmeyi engeller (bulanık eşleme öncesi açın).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Ä°stanbul", "ÅŸ" görünüyor | UTF-8 dosya Windows-1252/1254 sanılarak okunmuş | Doğru kodlamayla okuyun; onarım `encode("cp1252").decode("utf-8")` |
| Harfler eksik: "stanbul ili" | `errors="ignore"` ile okundu | Asla `ignore`; doğru kodlamayı bulun |
| İlk sütun adı "bulunamıyor" | BOM (`U+FEFF`) | `encoding="utf-8-sig"` |
| Tutarlar 1000 kat büyük ya da küçük | `1.234` satır satır farklı yorumlandı | Ayırıcıya sütun düzeyinde karar verin; kuralı yazın |
| Posta kodu `6100`, IBAN `1,23E+15` | Kod sütunu sayı olarak okundu | Kod sütunlarını metin okuyun; kaynağı Excel'de açıp kaydetmeyin |
| Tarihlerin bir kısmı ay/gün yer değiştirmiş | Kaynakta iki yerel ayar karışık | 12'den büyük günlü satırlarla sırayı bulun; kaynağa sorun |
| Tarih sütununda 46342 gibi sayılar | Excel seri tarihi | 1899-12-30 + n gün |
| "Temizlikten" sonra satır sayısı açıklanamıyor | Sessiz silme | Mutabakat: giren = çıkan + karantina; silinenler ayrı dosyada |
| Binlerce gerçek müşteri "aykırı" diye silindi | Çarpık veride 3σ ya da IQR kuralı | Kural tabanlı hata denetimi; istatistik yalnız inceleme listesi |
| Model şaşırtıcı iyi, canlıda kötü | Doldurma değeri bütün veriden hesaplandı | Doldurmayı eğitim verisinden öğrenin ([veri sızıntısı](../80-ml/veri-sizintisi.md)) |
| Aynı kişi iki kayıt | Büyük/küçük harf, boşluk, Türkçe karakter farkı | Türkçe katlanmış anahtar |

## Denetim listesi

- [ ] Ham dosya değiştirilmeden saklandı; temizleme yeniden çalıştırılabilen bir betik.
- [ ] Profil çıkarıldı ve okundu (tür, eksik oranı, tekil sayısı, en sık değerler, uçlar).
- [ ] Kurallar temizlemeden önce yazıldı (şema ya da denetim dosyası).
- [ ] Kodlama, ayırıcı ve ondalık işareti açıkça verildi; Türkçe harfler gözle denetlendi.
- [ ] Kod sütunları (posta kodu, TCKN, IBAN, telefon) metin olarak okundu.
- [ ] Eksik değer stratejisi sütun sütun yazıldı; doldurulan değerlerin bayrağı var.
- [ ] Aykırı değer kararları gerekçeli; gerçek uç değerler silinmedi.
- [ ] Her değişiklik günlükte; mutabakat sağlandı (giren = çıkan + karantina).
- [ ] Temizlenmiş veri kurallara karşı yeniden doğrulandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ham dosyayı değiştirme. Önce profil çıkar ve göster; kuralları ben onaylamadan temizleme.
  Kodlama `utf-8-sig`, ayırıcı `;`, ondalık `,`. Kod sütunlarını metin oku. Her değişikliği
  `degisiklikler.jsonl` dosyasına (satır, sütun, eski, yeni, kural) yaz. Satır silme; geçersiz satırları
  karantina dosyasına ayır. Sonunda giren, çıkan ve karantinadaki satır sayılarını yaz."
- **Modelin tipik hatası:** dosyayı varsayılan ayarlarla okur (posta kodu sayıya döner, ondalık virgül metin
  kalır); kodlama hatasını `errors="ignore"` ya da `latin-1` ile susturur; `dropna()` ile satır siler;
  `fillna(mean)` ile doldurur; yazım hatalarını tahminle "düzeltir"; 3σ dışını siler.
- **Çıktıda denetleyin:** satır mutabakatı; değişiklik günlüğünün varlığı; doldurulan değer sayısı; çıktıda "İ, ş,
  ğ" doğru mu; kod sütunlarında baştaki sıfırlar duruyor mu.
- Hazır araç varsa onu kullandırın: aşağıdaki `profil`, `temizle`, `dogrula` komutları bu adımları zaten uygular.

## İlgili

- Adımların hazır araçları: `python -m verihavuzu profil | temizle | dogrula` —
  [`veri/AGENTS.md`](../../veri/AGENTS.md) ("Bir CSV'yi profille ve temizle" tarifi)
- Temizleyici (bozuk kodlama, eksik işaretleri, tarih ve sayı biçimi, değişiklik kaydı):
  [`veri/verihavuzu/kalite/clean.py`](../../veri/verihavuzu/kalite/clean.py); Türkçe sayı okuma kuralları:
  [`veri/verihavuzu/kalite/values.py`](../../veri/verihavuzu/kalite/values.py)
- Alıştırma: kirli dosya, temiz karşılığı ve bozulma kaydı:
  [`veri/ornekler/kirli_faturalar/`](../../veri/ornekler/kirli_faturalar/VERI_KARTI.md)
- Bulanık yineleme (Türkçe normalleştirme, kısaltma açma):
  [`veri/verihavuzu/kalite/dedupe.py`](../../veri/verihavuzu/kalite/dedupe.py)
- Excel-TR CSV okuma/yazma: [`kutuphane/py/kutuphane/csv.py`](../../kutuphane/py/kutuphane/csv.py)
- [Veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md) — kuralları dosyaya yazmak ve hatta koymak
- [Betimsel istatistik](betimsel-istatistik.md) — aykırının ortalamaya etkisi
- [Veri ve etiket](../80-ml/veri-ve-etiket.md) — model verisinde etiket kalitesi
- [Unicode ve kodlama](../10-diller/unicode-ve-kodlama.md) — bozuk kodlama teşhis tablosu, normalleştirme
- [Veri biçimleri](../10-diller/veri-bicimleri.md) — CSV ve Türkçe Excel, ISO 8601
- [Türkçe sayı ve para](../97-turkce/turkce-sayi-ve-para.md) — binlik ve ondalık ayırıcı karışıklığı
- [Türkiye biçimleri](../97-turkce/turkiye-bicimleri.md) — TCKN, IBAN, telefon, posta kodu doğrulama
- [Aykırı değer ve anomali tespiti](../80-ml/aykiri-deger-ve-anomali.md) — sağlam z, çarpık veride IQR
- [İçe ve dışa aktarım](../30-arkauc/ice-ve-disa-aktarim.md) — uygulamaya dosya alırken doğrulama
- [Keşifsel veri analizi](kesifsel-veri-analizi.md) — profil adımının altı sorusu ve veri notu
