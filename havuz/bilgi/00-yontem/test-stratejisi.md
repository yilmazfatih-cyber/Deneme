---
baslik: Test stratejisi
ozet: Hangi düzeyde ne test edilir, iyi testin özellikleri, sahte ve taklit ne zaman, kırılgan test belirtileri, özellik tabanlı test, başvuru gerçeklemesiyle farksal test ve testi gevşetme tuzağı.
etiketler: [yontem, test, ozellik-tabanli-test, farksal-test, sahte-nesne]
duzey: orta
guncellik: 2026-11
---

# Test stratejisi

> Bu notu ne zaman okumalı: bir özelliğin testini planlarken; testler çok yavaş ya da sık sık rastgele
> kırılıyorsa; bir model test yazacaksa; ya da kırmızı bir testi "düzeltmek" üzereyseniz.

## Temel fikir

Test, **para ile güven satın almaktır**: her testin yazma, çalıştırma ve bakım bedeli vardır; karşılığında
"bu davranış bozulursa haberim olur" güvenini verir. Strateji, en çok güveni en az bedelle almaktır:

- Saf mantık (hesap, ayrıştırma, biçimleme) **birim testiyle** ve çok sayıda girdiyle sınanır; ucuzdur.
- Sınırlar (veritabanı, HTTP, dosya) **bütünleşme testiyle** gerçeğe yakın sınanır; taklitle değil.
- Kritik kullanıcı yolculukları **az sayıda uçtan uca** testle sınanır; pahalı ve yavaştır.

İyi test yalnız davranış bozulunca kırılır. Uygulama ayrıntısı değişince kırılan test (kırılgan test) güven değil,
gürültü üretir ve sonunda kimse kırmızıya bakmaz.

## Karar tablosu: ne, hangi düzeyde

| Ne test ediliyor                                     | Düzey ve yöntem                                             | Neden                                         |
| ---------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Saf hesap: para, tarih, bölüştürme, ayrıştırma       | Birim + özellik tabanlı                                     | Hızlı; binlerce girdi denenebilir             |
| Türkçe metin, biçimleme                              | Birim, tablo güdümlü (girdi → beklenen)                     | Uç durumlar listelenebilir                    |
| SQL sorgusu, veri göçü                               | Bütünleşme: gerçek veritabanı (bellek içi SQLite, test kabı) | Taklit, SQL'in doğruluğunu sınamaz            |
| HTTP ucu: doğrulama, yetki, hata kodu                | Bütünleşme: test istemcisi + gerçek ara katmanlar           | Yetki hataları katmanların arasında doğar     |
| Dış servis: ödeme, e-posta, yapay zekâ               | Sınırda sahte (fake) + birkaç sözleşme testi                | Ağ yavaş, pahalı ve kararsız                  |
| Kritik yolculuk: kayıt, ödeme, ana iş akışı          | Uçtan uca, az sayıda, telefon boyutunda                     | Parçaların birlikte çalıştığını yalnız bu gösterir |
| Görsel düzen                                         | Ekran görüntüsü karşılaştırması, yalnız kritik ekranlar     | Kırılgandır; seçici kullanın                  |
| Eşzamanlılık                                         | Aynı anda N istek, tohumlu tekrar                           | Yarış yalnız yük altında çıkar                |
| Hızlı ama karmaşık bir gerçekleme                    | Farksal test: yavaş ve apaçık başvuruyla karşılaştırma      | Uç durumları sizin yerinize bulur             |

## İyi testin özellikleri

- **Doğru nedenle kırılır:** yalnız davranış bozulunca. İç yapı değişince kırılıyorsa davranışı değil ayrıntıyı
  sınıyordur.
- **Hızlı ve belirlenimci:** saat, rastgelelik ve ağ dışarıdan verilir; aynı girdi her seferinde aynı sonucu verir.
- **Bağımsız:** tek başına ve her sırada geçer; başka testin bıraktığı veriye dayanmaz.
- **Okunur:** adı davranışı söyler ("süresi dolmuş davet reddedilir"); gövde hazırla → çalıştır → doğrula düzenindedir.
- **Beklenen değer elle hesaplanmıştır:** testte uygulamanın formülü yinelenmez; yinelenirse ikisi birlikte yanılır.
- **Önce kırmızı görülmüştür:** test, hatalı kodda kırılmadıysa hiçbir şeyi kanıtlamaz.

## Sahte, taklit, koçan: hangisi ne zaman

| Tür                | Ne yapar                                              | Ne zaman                                                  |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| Koçan (stub)       | Sabit yanıt döndürür                                  | Bağımlılığın yalnız bir değer vermesi yetiyorsa           |
| Sahte (fake)       | Çalışan hafif gerçekleme (bellek içi depo, sahte sunucu) | Çoğu durumda ilk tercih                                |
| Taklit (mock)      | "Şu argümanla çağrıldı mı" beklentisini denetler      | Yalnız çağrının kendisi sonuçsa (ör. e-posta gönderildi mi) |

Kurallar: **sahip olmadığınız ve süreç dışında kalanı** (ağ, saat, rastgelelik, e-posta, ödeme) sınırda
değiştirin. **Sahip olduğunuzu** (kendi veri katmanınızı) gerçeğiyle sınayın. Taklit yerine sahte kullanın;
"nasıl çağrıldı"yı değil "sonuç ne"yi denetleyin.

Sahte, gerçeğinden ayrışırsa testler yalan söyler. Çözüm: **aynı senaryoları ikisine de koşturun.** Havuzdaki
uygulama bunu yapar: eşitleme protokolünün senaryoları
([conformance.ts](../../uygulama/shared/src/testing/conformance.ts)) hem bellek içi başvuru sunucusuna
([memoryServer.ts](../../uygulama/shared/src/testing/memoryServer.ts)) hem gerçek API'ye karşı koşar.

## Özellik tabanlı test

Tek tek örnek yerine **her girdide doğru olması gereken bir özellik** yazın ve yüzlerce rastgele girdiyle sınayın.
Bölüştürmenin özellikleri: hiçbir kuruş kaybolmaz ya da türemez; paylar en çok 1 kuruş farklıdır; fazlalık hep
öndekilere gider. Girdileri küçükten büyüğe denemek, bulunan karşı örneği okunur kılar:

```python calistir
import random


def split_naive(total: int, parts: int) -> list[int]:  # YANLIŞ: artan kuruş kayboluyor
    return [total // parts] * parts


def split_fair(total: int, parts: int) -> list[int]:  # en büyük kalan: artan kuruşlar ilk kişilere
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


def properties_hold(split, total: int, parts: int) -> bool:
    shares = split(total, parts)
    return (
        len(shares) == parts
        and sum(shares) == total  # kuruş kaybolmaz, türemez
        and max(shares) - min(shares) <= 1  # paylar en çok 1 kuruş farklı
        and shares == sorted(shares, reverse=True)  # fazlalık öndekilere
    )


def find_counterexample(split, runs: int = 1000, seed: int = 1) -> tuple[int, int] | None:
    rng = random.Random(seed)
    cases = [(rng.randint(0, 10 ** rng.randint(0, 7)), rng.randint(1, 12)) for _ in range(runs)]
    for total, parts in sorted(cases):  # küçük girdiler önce: ilk karşı örnek kolay okunur
        if not properties_hold(split, total, parts):
            return total, parts
    return None


print("saf bölme:", find_counterexample(split_naive))  # 1 kuruş, 2 kişi → [0, 0]
print("en büyük kalan:", find_counterexample(split_fair))
```

```cikti
saf bölme: (1, 2)
en büyük kalan: None
```

Python'da bunun olgun hâli `hypothesis` paketidir (karşı örneği kendisi küçültür); TypeScript'te `fast-check`.
Paket yoksa yukarıdaki elli satır da iş görür. Tohumu sabitleyin; kırmızı çıkan tohumu teste yazın.

## Farksal test: başvuru gerçeklemesiyle

Hızlı ve zekice yazılmış bir işlevi, **yavaş ama apaçık** bir başvuru gerçeklemesiyle rastgele girdilerde
karşılaştırın. Başvuru gerçeklemesinin doğruluğu göz kararıyla görülebilmelidir:

```python calistir
import random
from datetime import date, timedelta

DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]


def business_days_ref(start: date, end: date) -> int:
    """Başvuru: [start, end) aralığındaki hafta içi günleri tek tek sayar. Yavaş ama apaçık."""
    count, day = 0, start
    while day < end:
        count += day.weekday() < 5
        day += timedelta(days=1)
    return count


def business_days_buggy(start: date, end: date) -> int:  # hızlı; "artan günlerin ilki hafta içi" sanılmış
    weeks, rest = divmod((end - start).days, 7)
    return weeks * 5 + min(rest, 5)


def business_days_fast(start: date, end: date) -> int:
    weeks, rest = divmod(max((end - start).days, 0), 7)
    first = start.weekday()
    return weeks * 5 + sum((first + i) % 7 < 5 for i in range(rest))


def first_mismatch(fast, runs: int = 3000, seed: int = 3):
    rng = random.Random(seed)
    for _ in range(runs):
        start = date(2026, 1, 1) + timedelta(days=rng.randint(0, 365))
        end = start + timedelta(days=rng.randint(0, 40))
        if fast(start, end) != business_days_ref(start, end):
            return start, end, fast(start, end), business_days_ref(start, end)
    return None


start, end, got, expected = first_mismatch(business_days_buggy)
print(f"ayrışma: {start} ({DAYS[start.weekday()]}) → {end}: hızlı {got}, başvuru {expected}")
assert first_mismatch(business_days_fast) is None
print("düzeltilmiş sürüm 3000 girdide başvuruyla aynı")
```

```cikti
ayrışma: 2026-05-02 (Cumartesi) → 2026-06-08: hızlı 27, başvuru 25
düzeltilmiş sürüm 3000 girdide başvuruyla aynı
```

Aynı fikir büyük ölçekte: eski ve yeni sistemi aynı girdiyle çalıştırıp çıktıları karşılaştırmak (gölge
çalıştırma); ya da bir sayısal hesabı sonlu farkla, kaba kuvvetle ya da başka bir kütüphaneyle sınamak.

## Testi gevşetme tuzağı

Kırmızı test bir bilgidir. Onu susturmanın yolları cazip ve hepsi yanlıştır: testi silmek, atlamak (`skip`),
beklenen değeri çıkan değerle değiştirmek, toleransı büyütmek, "kararsız" diye yeniden denemeye bağlamak.
Doğru sıra:

1. Hata iletisini okuyun: beklenen ne, çıkan ne?
2. **Hangisi yanlış, karar verin ve yazın:** kod mu, test mi? Test yanlışsa nedenini kayıt iletisine yazın
   ("beklenen değer KDV'siz hesaplanmıştı; doğrusu KDV dahil").
3. Kod yanlışsa kodu düzeltin; test olduğu gibi kalır.
4. Kararsız (flaky) testi yeniden denemeyle gizlemeyin; nedenini bulun (saat, sıra, paylaşılan veri, ağ).

## Tuzaklar

| Belirti                                                   | Neden                                                 | Çözüm                                                        |
| --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| İç yapı değişince onlarca test kırılıyor                  | Testler uygulama ayrıntısını (özel işlev, çağrı sırası) sınıyor | Herkese açık davranışı sınayın                   |
| Test gece yarısı, ay sonunda ya da 29 Şubat'ta kırılıyor  | Gerçek saate bağlı                                    | Saati parametreyle verin; sabit "şimdi" kullanın             |
| Tek başına geçiyor, toplu koşuda kırılıyor                | Testler veri ya da durum paylaşıyor                   | Her test kendi verisini kursun ve temizlesin                 |
| Testler geçiyor, üretimde SQL hatası                      | Veritabanı taklit edildi                              | Gerçek (bellek içi) veritabanıyla bütünleşme testi           |
| Test hiç kırmızı olmadı, hata yine de kaçtı               | Beklenen değer uygulamanın formülüyle hesaplanmış     | Beklenen değeri elle hesaplayın; önce kırmızıyı görün        |
| Takım `sleep` ile dolu ve yavaş                           | Zamanlama beklemeyle çözülmüş                         | Koşulu bekleyen yardımcılar; sahte saat                      |
| Uçtan uca takımı 40 dakika sürüyor                        | Her şey uçtan uca sınanıyor                           | Mantığı birim düzeyine indirin; uçtan uca yalnız kritik yolculuk |
| Rastgele testin kırmızısı yeniden üretilemiyor            | Tohum yazılmamış                                      | Tohumu sabitleyin ya da kırmızıda yazdırın                   |

## Denetim listesi

- [ ] Her yeni saf işlevin birim testi var; sınır değerleri ve Türkçe girdiler dahil.
- [ ] Veritabanı ve HTTP davranışı gerçek bileşenlerle sınanıyor; taklit yalnız dış servis sınırında.
- [ ] Sahte bileşen varsa gerçeğiyle aynı senaryolardan geçiyor.
- [ ] Testte gerçek saat, gerçek ağ ve tohumsuz rastgelelik yok.
- [ ] Her yeni testin önce kırmızı olduğu görüldü.
- [ ] Beklenen değerler elle hesaplanmış sabitler; uygulama formülü testte yinelenmemiş.
- [ ] Kritik kullanıcı yolculuklarının uçtan uca testi var (telefon boyutunda).
- [ ] Hiçbir test silinmedi, atlanmadı ya da gerekçesiz gevşetilmedi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu işlev için test yaz. Beklenen değerleri elle hesapla ve hesabı yorumda göster; uygulama
  kodunu testte yineleme. Sınır değerleri ve Türkçe karakterli girdileri ekle. Önce testin kırmızı olduğunu göster
  (uygulamayı geçici olarak boz ya da testi uygulamadan önce yaz). Test kırmızı kalırsa beklenen değeri değiştirme;
  bana hangisinin yanlış olduğunu açıkla."
- **Modelin tipik hatası:** beklenen değeri aynı formülle hesaplar (totoloji); yalnız "hata fırlatmadı"yı denetler;
  her şeyi taklit eder; test kırmızı olunca beklenen değeri çıkan değerle değiştirir ya da testi atlar; gerçek saate
  bağlı test yazar.
- **Çıktıda denetleyin:** bir hata düzeltmesinde test dosyalarının farkı (beklenen değer değişmiş mi); testlerde
  `skip`, `only`, `sleep`, `Date.now`, `datetime.now`; taklit sayısı; beklenen değerlerin sabit olup olmadığı.

## İlgili

- [Hata ayıklama](hata-ayiklama.md): gerileme testi ve "düzeldi ama neden".
- [Yeniden düzenleme](yeniden-duzenleme.md): karakterizasyon testi.
- [Hata sınıfları ve imzaları](hata-siniflari.md): sınır değerleri ve saat dilimi testleri.
- Havuzdaki örnek: aynı senaryoların gerçek API'ye karşı koşusu
  [sync.conformance.test.ts](../../uygulama/api/test/sync.conformance.test.ts).
