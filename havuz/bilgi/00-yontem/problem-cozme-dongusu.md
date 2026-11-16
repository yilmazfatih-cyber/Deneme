---
baslik: Problem çözme döngüsü
ozet: Anla, planla, küçük adım at, doğrula döngüsü; belirsizlikte ne zaman sorulur, ne zaman varsayımla ilerlenir ve bilindiği sanılan şey nasıl sınanır.
etiketler: [yontem, problem-cozme, planlama, dogrulama, belirsizlik]
duzey: temel
guncellik: 2026-11
---

# Problem çözme döngüsü

> Bu notu ne zaman okumalı: yeni bir işe başlarken; bir işte takılıp aynı şeyi ikinci kez denerken; "neredeyse
> bitti" hissi günlerdir sürerken; ya da sahibine sormakla kendi başına karar vermek arasında kaldığınızda.

## Temel fikir

Her iş aynı dört adımlı döngüyle yürür ve döngü **kısa** tutulur:

1. **Anla:** Problemi kendi sözlerinizle yazın; örnek girdi ve beklenen çıktı üzerinde anlaşın.
2. **Planla:** Bir sonraki küçük adımı ve onu nasıl doğrulayacağınızı seçin.
3. **Küçük adım:** Yalnız o adımı yapın.
4. **Doğrula:** Sonucu, adımdan _önce_ yazdığınız beklentiyle karşılaştırın. Öğrendiğinizle 1'e dönün.

Deneyimli biriyle acemi arasındaki fark çoğu zaman döngünün boyudur. Acemi bir gün kod yazıp sonra çalıştırır;
hata çıkınca neyin bozduğunu bilemez. Deneyimli biri on dakikada bir doğrular; bir şey bozulunca son on dakikaya
bakar. Hataların çoğu bir adımı atlamaktan gelir: anlamadan kodlamak yanlış problemi çözer, doğrulamadan "bitti"
demek hatayı kullanıcıya bırakır.

## 1. Anla: problem kartı

Kod yazmadan önce şu kartı doldurun. Beş dakika sürer; günlerce yanlış işi önler.

```text
Problem:   Bir harcama, gruptaki kişilere kuruşu kuruşuna bölüştürülsün.
Neden:     Bakiyeler 1 kuruş tutmuyor; kullanıcılar uygulamaya güvenmiyor.
Örnekler:  100,00 TL, 3 kişi  → 33,34 + 33,33 + 33,33        (normal)
           0,01 TL, 2 kişi    → 0,01 + 0,00                   (sınır)
           50,00 TL, 0 kişi   → "En az bir kişi seçin" iletisi (hatalı girdi)
Bitti:     Her bölüşümde parçaların toplamı tutara eşit; üç örnek testte.
Kısıtlar:  Veritabanı şeması değişmeyecek. Bu hafta yayına çıkacak.
Varsayım:  Artan kuruş listedeki ilk kişilere yazılır → sahibine soracağım.
```

Kartın en değerli satırı **örneklerdir**. "Bölüştürsün" sözü üç kişiye üç ayrı anlam taşır; "100 TL, 3 kişi →
33,34 + 33,33 + 33,33" tek anlam taşır. Sahibinden örnekleri onaylamasını isteyin; onay gelmeden büyük işe girmeyin.

## 2. Belirsizlik: sor, varsay ya da dene

| Durum                                                                     | Ne yapılır                                  | Neden                                       |
| ------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Yanıt kodda, belgede ya da bir komutla bulunabilir                        | Bakın; sormayın                             | Soru sahibinin zamanını yer; yanıt elinizde |
| Yanıt on dakikalık bir deneyle öğrenilebilir                              | Deneyin                                     | Deney kesin yanıt verir, tahmin vermez      |
| Yanlış varsayımın bedeli küçük ve geri alınabilir                         | Varsayın, yazın, ilerleyin                  | Beklemek varsayımdan pahalıdır              |
| Yanıt yalnız sahibinde (iş kuralı, öncelik, beğeni) ve yanlışın bedeli büyük | Sorun; seçenekleri ve önerinizi de yazın | Kod yazıldıktan sonra dönmek daha pahalıdır |
| Geri dönüşsüz işlem: silme, gönderme, ödeme, yayımlama, kişisel veri      | Her zaman onay alın                         | Hata geri alınamaz                          |
| Aynı konuda ikinci kez takıldınız                                         | Durun, bildiklerinizi yazın, sonra sorun    | Döngüdesiniz; yeni bilgi gerekiyor          |

Varsayımla ilerlemek tembellik değildir; **yazılmamış** varsayım tembelliktir. Her varsayımı karar kaydına ya da
teslim raporuna "Varsayım: … Yanlışsa şu dosyada şu satır değişir." diye yazın.

İyi soru tek sözcükle yanıtlanabilir ve işi bekletmez:

```text
Bağlam:  Bölüş'te harcamayı kişilere bölüştürüyorum.
Soru:    100 TL üç kişiye bölünürken artan 1 kuruş kime yazılsın?
Seçenek: (a) ödeyene  (b) listedeki ilk kişiye  (c) en çok borcu olana
Önerim:  (b) — her zaman aynı sonucu verir, testi kolaydır.
Yanıt gelmezse: (b) ile ilerleyip karar kaydına yazacağım.
```

Kötü soru: "Kuruş meselesini nasıl yapalım?" Sahibine iş çıkarır, yanıt gelene kadar işi durdurur.

## 3. Bildiğimi sandığım şeyi sınama

Planın dayandığı her cümle bir varsayımdır. En pahalı hatalar, doğruluğundan hiç şüphe edilmeyen varsayımlardan
çıkar. Yöntem:

1. Planın dayandığı cümleleri yazın: "Bu liste sıralı gelir", "Bu işlev girdiyi değiştirmez", "Bu alan boş olmaz".
2. Her biri için **en ucuz sınamayı** seçin: bir satır `print`, bir `assert`, kaynağa bakmak, küçük bir deney.
3. Sınamayı çalıştırın. Çürüyen varsayım planı değiştirir; şimdi değiştirmek sonradan değiştirmekten ucuzdur.

Sık çürüyen "kesin bilgiler":

| Varsayım                                       | Gerçekte                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| "Tarih metinlerini sıralarsam tarih sırası çıkar" | Yalnız `YYYY-AA-GG` biçiminde; `5.11.2026` metin gibi sıralanır      |
| "Bu işlev girdimi değiştirmez"                 | `sort()`, `append`, nesne alanına yazma çağıranın verisini değiştirir |
| "Bu alan hiç boş gelmez"                       | Eski kayıtlar, içe aktarılan veri, el ile girilen satırlar boş olur  |
| "Kullanıcı adı İngilizce harflerden oluşur"    | "Çağrı", "Ayşe Nur", kesme imi, boşluk, emoji gelir                   |
| "Saat dilimi önemli değil"                     | Sunucu UTC'deyse gece 00:00–03:00 arası "bugün" dün olur             |
| "Bu kütüphanenin bu sürümünde X işlevi var"    | Ezberdeki sürüm kuruluyla aynı olmayabilir; kurulu paketten bakın    |

İlk ikisini sınamak iki dakika sürer:

```python calistir
# Varsayım 1: "Tarih metinlerini sıralarsam tarih sırası çıkar."
tr_dates = ["5.11.2026", "12.10.2026", "1.12.2026"]
iso_dates = ["2026-11-05", "2026-10-12", "2026-12-01"]
assert sorted(tr_dates) == ["1.12.2026", "12.10.2026", "5.11.2026"]  # YANLIŞ: metin sırası
assert sorted(iso_dates) == ["2026-10-12", "2026-11-05", "2026-12-01"]  # ISO biçimi doğru sıralanır


# Varsayım 2: "Bu işlev girdimi değiştirmez."
def top_two(items: list[int]) -> list[int]:
    items.sort(reverse=True)  # girdiyi yerinde değiştirir
    return items[:2]


scores = [3, 9, 5]
assert top_two(scores) == [9, 5]
assert scores == [9, 5, 3]  # çağıranın listesi bozuldu
print("iki varsayım da çürüdü")
```

```cikti
iki varsayım da çürüdü
```

Sınadığınız varsayımı kodda bırakın: `assert len(people) > 0, "bölüştürme en az bir kişi ister"`. Bir sonraki
okur aynı soruyu sormaz.

## 4. Küçük adım ve doğrulama

**Adımın ölçüsü:** tek cümleyle anlatılabilir, beş ile otuz dakika arası sürer, sonunda program yine çalışır ve
nasıl doğrulanacağı adımdan önce bellidir. Doğrulama yolunu söyleyemiyorsanız adım ya çok büyük ya da belirsizdir.

**Tek doğrulanmamış değişiklik kuralı:** Elinizde aynı anda en çok bir doğrulanmamış değişiklik olsun. İki
değişikliği birlikte denerseniz, sonuç kötü çıktığında hangisinin bozduğunu bilemezsiniz.

**Beklentiyi önceden yazın:** Çalıştırmadan önce "33,34 + 33,33 + 33,33 görmeliyim" diye yazın. Sonra çalıştırın.
Önceden yazılmayan beklenti, çıkan sonuca göre kendiliğinden "zaten bunu bekliyordum"a döner.

Doğrulamanın basamakları:

| Basamak                                       | Ne kanıtlar                            | Ne zaman yeter                         |
| --------------------------------------------- | -------------------------------------- | -------------------------------------- |
| Derlendi, tip denetimi geçti                  | Sözdizimi ve tipler tutarlı            | Hiçbir zaman tek başına                |
| Çalıştı, hata vermedi                         | Çökmüyor                               | Hiçbir zaman tek başına                |
| Önceden yazılan beklenen çıktıyı verdi        | Mutlu yol doğru                        | Küçük iç değişiklikte                  |
| Sınır ve hatalı örneklerde de doğru           | Davranış doğru                         | Çoğu işte                              |
| Otomatik teste dönüştü                        | Gelecekte bozulursa yakalanır          | Mantık değişikliğinde zorunlu          |
| Gerçek ortamda, gerçek kullanıcı akışında görüldü | Parçalar birlikte çalışıyor        | Arayüz, dağıtım, dış servis işlerinde  |

## 5. Takılınca: zaman kutusu

Otuz dakika yeni bilgi üretmeden geçtiyse yaklaşımı değiştirin:

1. Bildiklerinizi ve denediklerinizi beş satırda yazın. Yazarken boşluk çoğu zaman kendini gösterir.
2. Problemi küçültün: daha küçük girdi, tek kullanıcı, tek kayıt, tek dosya.
3. Başka yerden bakın: veriyi yazdırın, örneği değiştirin, bir önceki çalışan sürümle karşılaştırın.
4. Sorun. Sorunun içine bu beş satırı koyun.

Döngüde sıkıştığınızın belirtileri: aynı değişikliği ikinci kez yapmak; "belki bu olur" diye rastgele düzenleme;
hatanın nedenini değil belirtisini kovalamak; hata iletisini okumadan yeniden çalıştırmak.

## Tuzaklar

| Belirti                                                     | Neden                                              | Çözüm                                                       |
| ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| İki gün çalıştınız, sahibi "bunu istememiştim" diyor        | Anla adımı atlandı; örnekler üzerinde anlaşılmadı | Başlamadan üç örneği ve bitti ölçütünü onaylatın            |
| Bir hata çıktı; altı dosya değişmişti, hangisi bilinmiyor   | Adım çok büyük; doğrulama seyrek                   | Tek doğrulanmamış değişiklik; her adımda çalıştırın         |
| "Bitti" dendi, ilk gerçek kullanımda bozuldu                | Yalnız mutlu yol denendi                           | Sınır ve hatalı örnek de bitti tanımına girsin              |
| Aynı düzeltmeyi üçüncü kez deniyorsunuz                     | Hipotez yok; döngüde sıkıştınız                    | Zaman kutusu: yazın, küçültün, başka yerden bakın, sorun    |
| Her şey soruluyor, iş ilerlemiyor                           | Sorulacakla varsayılacak ayrılmamış                | Karar tablosu: ucuz ve geri alınabilirse varsayıp yazın     |
| Varsayımla ilerlendi, sonra kimse hatırlamıyor              | Varsayım yazılmadı                                 | Varsayımı karar kaydına ya da teslim raporuna yazın         |
| Çözüm çalışıyor ama neden çalıştığı bilinmiyor              | Doğrulama yerine şans                              | Değişikliği geri alıp hatanın döndüğünü görün               |
| Plan kusursuz, hiç çalışan kod yok                          | Çözümleme felci                                    | Yürüyen iskelet: en ince uçtan uca yolu bugün çalıştırın    |

## Denetim listesi

- [ ] Problem tek cümleyle yazılı ve sahibinin anladığıyla aynı.
- [ ] En az üç örnek (normal, sınır, hatalı) beklenen sonuçlarıyla yazılı.
- [ ] Bitti ölçütü gözle ya da komutla denetlenebilir.
- [ ] Varsayımlar listelendi; her biri ya sınandı ya da raporda "varsayım" diye işaretlendi.
- [ ] Her adımın sonunda program çalışır durumda ve testler yeşil.
- [ ] Sonuç, çalıştırmadan önce yazılan beklentiyle karşılaştırıldı.
- [ ] Geri dönüşsüz işlemler (silme, gönderme, ödeme, yayımlama) için onay alındı.
- [ ] Teslim raporunda neyin denenmediği açıkça yazıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** görevi tek cümleyle verin ve şu sırayı isteyin:

  ```text
  Önce kod yazma. Şunları yaz:
  1. Problemi kendi sözlerinle, tek cümle.
  2. Üç örnek (normal, sınır, hatalı) ve beklenen sonuçları.
  3. Varsayımların; her birini nasıl sınayacağın.
  4. İlk küçük adım ve onu doğrulayacak komut.
  Sonra yalnız ilk adımı yap, komutu çalıştır, çıktıyı olduğu gibi göster.
  ```

- **Modelin tipik hatası:** hemen kod yazar; görmediği dosyayı ya da işlevi var sanar; birden çok şeyi aynı anda
  değiştirir; çalıştırmadan "çalışıyor" der; tek başarısız denemeden sonra yaklaşımı baştan değiştirir ya da tersine
  aynı yaklaşımda direnir.
- **Çıktıda denetleyin:** "varsaydım", "muhtemelen", "çalışmalı" geçen cümleler; komut ve gerçek çıktı var mı;
  değişiklik kaç dosyaya yayılmış (tek adım için birkaç dosyadan fazlası kuşkuludur).
- **Takılınca:** modele "Bildiklerini ve denediklerini beş satırda yaz; sonra iki hipotez ve her biri için bir
  sınama öner" deyin. Yeni bir düzeltme istemeyin; önce yeni bilgi isteyin.

## İlgili

- [İşi parçalama](isi-parcalama.md): büyük işi küçük, doğrulanabilir dilimlere bölmek.
- [Hata ayıklama](hata-ayiklama.md): döngünün hata ararken uygulanışı.
- [Tasarım kararı](tasarim-karari.md): seçenekler arasında karar ve karar kaydı.
- [Öğrenme ve araştırma](ogrenme-ve-arastirma.md): küçük deneyle bilgi doğrulamak.
- Bitti tanımının işlenmiş bir örneği: [uygulama/AGENTS.md](../../uygulama/AGENTS.md) → "Bitti tanımı" bölümü.
- Diğer kümelerden: [Gereksinim yazma](../95-urun/gereksinim-yazma.md), [Küçük modeller için istem](../85-llm/kucuk-modeller-icin-istem.md), [Kodlama için dil modeli](../85-llm/kodlama-icin-llm.md).
