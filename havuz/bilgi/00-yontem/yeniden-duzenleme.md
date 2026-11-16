---
baslik: Yeniden düzenleme
ozet: Davranışı koruyarak küçük adımlarla kod düzenleme; önce test ağı (karakterizasyon testi), sık dönüşümler, ne zaman yapılmayacağı ve büyük yeniden yazım tuzağı.
etiketler: [yontem, yeniden-duzenleme, refactoring, test, eski-kod]
duzey: orta
guncellik: 2026-11
---

# Yeniden düzenleme

> Bu notu ne zaman okumalı: bir özelliği eklemek mevcut kod yüzünden zorlaşıyorsa; bir model "kodu temizledim"
> dediğinde; eski, testsiz bir kodu değiştirmeniz gerektiğinde; ya da "baştan yazalım" fikri masaya geldiğinde.

## Temel fikir

Yeniden düzenleme (refactoring), **davranışı değiştirmeden yapıyı değiştirmektir.** Üç kuralı vardır:

1. **Önce test ağı.** Davranışı koruduğunuzu ancak testle kanıtlarsınız. Test yoksa önce şimdiki davranışı kayda
   geçiren bir karakterizasyon testi yazılır; tuhaflıkları da dahil.
2. **Küçük adım.** Her adım tek bir dönüşümdür; ardından testler çalışır. Kırmızıysa adım geri alınır, ortasında
   hata ayıklanmaz.
3. **Ayrı kayıt.** Düzenleme ile davranış değişikliği aynı kayıtta (commit) olmaz; olursa inceleyen davranış
   değişikliğini göremez.

Kalıp: **"Önce değişikliği kolaylaştır, sonra kolay değişikliği yap."** Yeni özellik zor ekleniyorsa önce kodu
özelliğin rahat gireceği hâle getirin (davranış aynı), sonra özelliği ekleyin (yapı aynı).

## Karar tablosu

| Durum                                                          | Düzenlenir mi?                     | Neden                                            |
| -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| Yeni özellik eklemek zor; kod engel oluyor                     | Evet: önce düzenle, sonra ekle     | Değişiklik küçülür ve güvenli olur               |
| Aynı dosyaya zaten dokunuyorsunuz, küçük bir karışıklık var    | Evet, küçük tutun                  | Bağlam taze, bedel düşük                         |
| Aynı mantık üçüncü kez kopyalanıyor                            | Evet                               | Değişim noktası artık belli                      |
| Test ağı yok ve kurmaya zaman yok                              | Hayır; önce karakterizasyon testi  | Davranışı koruduğunuzu kanıtlayamazsınız         |
| Kod yakında silinecek ya da yerine yenisi gelecek             | Hayır                              | Emek boşa gider                                  |
| Yayın arifesi                                                  | Hayır                              | Risk kazançtan büyük                             |
| Tek gerekçe zevk                                               | Hayır                              | Değer üretmez, inceleme yükü getirir             |
| Bir hata düzeltmesi yapılıyor                                  | Ayrı kayıtta, düzeltmeden önce ya da sonra | Davranış değişikliği görünür kalsın      |

## Önce test ağı: karakterizasyon testi

Eski, testsiz bir işlevi düzenleyecekseniz:

1. Bütün dalları ve sınırları kapsayan girdileri seçin (her `if` için iki taraf; eşik değerlerin bir altı, kendisi,
   bir üstü).
2. Şimdiki çıktıları kaydedin. Bu "altın örnek"tir (golden master); doğru olup olmadığı sorulmaz.
3. Düzenleyin, aynı girdilerle karşılaştırın. Her fark bir davranış değişikliğidir: durun.
4. Kayıt sırasında gördüğünüz tuhaflıkları not edin; düzeltmeleri **ayrı iş** olarak açın.

```python calistir
from itertools import product


def shipping_fee_old(total: int, city: str, express: bool) -> int:  # dokunulacak eski kod
    fee = 0
    if city == "İstanbul" or city == "Ankara" or city == "İzmir":
        if total >= 500:
            fee = 0
        else:
            if express:
                fee = 60
            else:
                fee = 30
    else:
        if total > 500:  # öteki dalda >=, burada > : tuhaf ama ŞU ANKİ davranış
            fee = 0
        else:
            fee = 45
            if express:
                fee = fee + 40
    return fee


BIG_CITIES = {"İstanbul", "Ankara", "İzmir"}
FEES = {(True, False): 30, (True, True): 60, (False, False): 45, (False, True): 85}


def shipping_fee_new(total: int, city: str, express: bool) -> int:
    big = city in BIG_CITIES
    free = total >= 500 if big else total > 500  # eski tuhaflık bilerek korundu; düzeltmesi ayrı iş
    return 0 if free else FEES[(big, express)]


def shipping_fee_tidy(total: int, city: str, express: bool) -> int:  # "temizlerken" davranışı değiştiren sürüm
    return 0 if total >= 500 else FEES[(city in BIG_CITIES, express)]


cities = ["İstanbul", "Ankara", "İzmir", "Bursa", "istanbul"]
grid = list(product([0, 1, 499, 500, 501, 10_000], cities, [False, True]))
golden = {args: shipping_fee_old(*args) for args in grid}  # şimdiki davranışın kaydı

assert all(shipping_fee_new(*args) == expected for args, expected in golden.items())
diffs = sorted({(a[0], a[1]) for a, expected in golden.items() if shipping_fee_tidy(*a) != expected})
print(len(grid), "girdi karşılaştırıldı; değişen davranış:", diffs)
```

```cikti
60 girdi karşılaştırıldı; değişen davranış: [(500, 'Bursa'), (500, 'istanbul')]
```

Ağ iki şeyi yakaladı: büyük şehir dışında 500 TL'lik siparişin ücreti değişiyor ve küçük harfle yazılmış
"istanbul" büyük şehir sayılmıyor. İkisi de belki hatadır; ama düzeltmeleri **ayrı bir karardır** (sahibine
sorulur, ayrı kayıtta yapılır, ayrı testle belgelenir). Düzenleme sırasında sessizce düzeltilirse kimse fark etmez;
fatura tutarları bir gün değişir.

## Sık dönüşümler

| Dönüşüm                         | Ne zaman                                    | Risk                                         | Güvenli yol                                             |
| ------------------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| İşlev çıkarma (extract)         | Uzun işlev; yorumla ayrılmış bölümler       | Yerel değişken ve erken `return` kayması      | Önce çıkar, sonra adlandır; test                         |
| Yeniden adlandırma              | Ad yanıltıcı                                | Metin içi kullanımlar: şablon, yapılandırma, belge, dinamik erişim | Editörün dil farkında adlandırması + metin araması |
| Taşıma                          | Dosya yanlış yerde                          | Kırılan içe aktarma, döngüsel bağımlılık      | Eski yerde geçici yeniden dışa aktarma bırakın           |
| Satır içine alma (inline)       | Yanlış ya da gereksiz soyutlama             | Çağıran çok ise uzun fark                    | Çağıranları tek tek, her birinden sonra test             |
| Koşulu tabloya çevirme          | İç içe `if`, kombinasyonlar                 | Atlanan kombinasyon                          | Bütün kombinasyonları karakterizasyonla karşılaştırın   |
| Parametre nesnesi               | Beş ve üstü parametre, hep birlikte geçen   | Varsayılan değerlerin kayması                | Önce nesneyi ekleyin, eski imza geçici dursun           |
| Aşamaları ayırma (split phase)  | Ayrıştırma ve hesap iç içe                  | Ara veri biçimi                              | Ara veriye tip verin; iki aşamayı ayrı test edin        |
| Sihirli sayıyı adlandırma       | `if total > 500`                            | Aynı sayının farklı anlamları                | Her anlam için ayrı sabit                               |

Adımın mekaniği: dönüşüm → testler → kayıt (ya da en azından ara kayıt). Test kırmızıysa geri alın ve daha küçük
adım deneyin. Düzenlemenin ortasında hata ayıklamak, iki işi birden yapmaktır.

## Büyük yeniden yazım tuzağı

"Bu kod berbat, baştan yazalım" önerisi cazip ve çoğu zaman yanlıştır:

- Eski kod yıllarca toplanmış uç durumları ve hata düzeltmelerini taşır; yenisi onları bir bir yeniden keşfeder.
- Yeniden yazım aylarca değer üretmez; eski sistem bu arada değişmeye devam eder (hareketli hedef).
- "İkinci sistem" her şeyi kapsamaya çalışır ve şişer.

Seçenek: **boğan incir (strangler fig)** yaklaşımı. Yeni kod, eski sistemin yollarını teker teker devralır; iki
sistem bir süre birlikte çalışır; mümkünse aynı girdide ikisinin çıktısı karşılaştırılır (gölge çalıştırma,
[farksal test](test-stratejisi.md)). Eski yol trafik almayınca silinir. Her adım geri alınabilir ve her adım
yayına çıkar.

Baştan yazım ancak şu durumda düşünülür: eski kod çok küçükse, davranışı tam olarak belgelenmişse (ya da
karakterizasyon testiyle yakalanmışsa) ve platform gerçekten değişiyorsa.

## Tuzaklar

| Belirti                                                       | Neden                                              | Çözüm                                                        |
| ------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| "Yalnız temizlik" yapıldı, bir hesap sonucu değişti           | Düzenleme sırasında davranış "düzeltildi"          | Karakterizasyon ağı; düzeltme ayrı kayıtta                   |
| Düzenleme sonrası testlerin yarısı kırıldı                    | Testler uygulama ayrıntısına bağlı (kırılgan test) | Testleri davranışa bağlayın; iç yapıyı sınamayın              |
| Yeniden adlandırma sonrası bir sayfa boş geliyor              | Metin içi kullanım (şablon, yapılandırma) atlandı  | Eski adı metin olarak da arayın                              |
| Tek kayıtta 40 dosya; inceleyen onayladı ama anlamadı         | Büyük patlama düzenlemesi                          | Tek dönüşüm türü, küçük kayıtlar                             |
| "Kullanılmayan" kod silindi, zamanlanmış iş bozuldu           | Dinamik ya da dış kullanım                         | Silmeden önce metin araması ve günlük; şüphede sahibine sorun |
| Tuhaf görünen satır silindi, eski bir hata geri geldi         | Çit neden orada, bilinmedi (Chesterton'ın çiti)    | `git blame` ile satırın neden eklendiğini okuyun              |
| Yeniden yazım altı aydır sürüyor, eskisi hâlâ yayında         | Büyük yeniden yazım                                | Boğan incir: yol yol devralma                                |

## Denetim listesi

- [ ] Değişiklikten önce test ağı vardı ve yeşildi (gerekiyorsa karakterizasyon testi yazıldı).
- [ ] Her dönüşümden sonra testler çalıştırıldı.
- [ ] Testlerin beklenen değerleri değişmedi.
- [ ] Davranış değişikliği yok; bulunan tuhaflıklar ayrı iş olarak yazıldı.
- [ ] Herkese açık adlar korunuyor ya da eski ad geçici takma ad olarak duruyor.
- [ ] Silinen kod için metin araması yapıldı.
- [ ] Biçim değişiklikleri ayrı kayıtta.
- [ ] Kayıt iletisi "davranış değişmedi" diyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Davranışı değiştirme. Yalnız şu dönüşümü yap: <dönüşüm>. Önce şimdiki davranışı yakalayan
  bir karakterizasyon testi yaz ve şimdiki kodla yeşil olduğunu göster. Her adımdan sonra testleri çalıştır.
  Testlerin beklenen değerlerine dokunma. Tuhaf bulduğun davranışı düzeltme; listele."
- **Modelin tipik hatası:** düzenlerken "iyileştirir": varsayılan değeri, hata iletisini, sıralamayı ya da
  yuvarlamayı sessizce değiştirir; herkese açık adları değiştirir; kullanılmıyor sandığı kodu siler; bütün dosyayı
  yeniden yazar; biçim değişikliğini asıl değişikliğe karıştırır.
- **Çıktıda denetleyin:** test dosyalarının farkı boş mu (ya da yalnız yeni test eklenmiş mi); karakterizasyon
  karşılaştırması yeşil mi; fark mekanik mi (taşıma, adlandırma) yoksa mantık mı değişmiş.

## İlgili

- [Test stratejisi](test-stratejisi.md): kırılgan test belirtileri ve farksal test.
- [Tasarım kararı](tasarim-karari.md): yanlış soyutlamayı geri açmak, üçüncü kez kuralı.
- [Kod inceleme](kod-inceleme.md): düzenleme değişikliğini incelemek.
- [Yabancı kod okuma](yabanci-kod-okuma.md): dokunmadan önce anlamak.
