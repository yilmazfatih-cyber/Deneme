---
baslik: Tasarım kararı
ozet: Seçenekleri karşılaştırma, geri alınabilir ve alınamaz kararı ayırma, karar kaydı şablonu, işe yarayan en basit şey, erken soyutlama ve erken en iyileme tuzakları, üçüncü kez kuralı.
etiketler: [yontem, tasarim, karar-kaydi, soyutlama, mimari]
duzey: orta
guncellik: 2026-11
---

# Tasarım kararı

> Bu notu ne zaman okumalı: iki yol arasında kaldığınızda (kütüphane, veritabanı, veri modeli, mimari); bir model
> size "esnek" bir yapı önerdiğinde; ya da aynı konu üçüncü kez tartışılıyorsa (karar kaydı yok demektir).

## Temel fikir

Karara harcanan emek, **yanılmanın bedeliyle** orantılı olmalıdır. Kararlar iki türlüdür:

- **İki yönlü kapı (geri alınabilir):** iç işlev adı, dosya düzeni, tek yerde kullanılan bir kütüphane. Hızlı
  karar verin, deneyin, gerekirse dönün.
- **Tek yönlü kapı (geri alınamaz ya da pahalı):** veri modeli, para ve tarih saklama biçimi, herkese açık API,
  kişisel veri toplama. Yavaş karar verin, deneyle sınayın, kayda geçirin.

İki varsayılan kural çoğu tartışmayı bitirir: **işe yarayan en basit şeyi** yapın; soyutlamayı **üçüncü
tekrara**, en iyilemeyi **ölçüme** kadar erteleyin. Esneklik bedavaya gelmez: her katman, okunacak, test
edilecek ve yanlış tahmin edildiyse sökülecek bir koddur.

## Karar tablosu

| Karar                                                       | Geri alma bedeli             | Ne kadar düşünülür                 | Kayıt               |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------- | ------------------- |
| İç işlev adı, dosya düzeni, bir ekranın yerleşimi           | Düşük                        | Dakikalar; deneyin                 | Gerekmez            |
| Tek yerde kullanılan kütüphane                              | Orta                         | Bir saat; iki seçeneği deneyin     | Kısa not            |
| Veritabanı, çatı (framework), programlama dili              | Yüksek                       | Gün; zaman kutulu deney            | Karar kaydı         |
| Veri modeli: birincil anahtar türü, para tipi, saat saklama | Çok yüksek (veri birikir)    | Gün; örnek veriyle deneyin         | Karar kaydı         |
| Herkese açık API biçimi, URL yapısı, dosya biçimi           | Çok yüksek (dışarıda kullanan var) | Gün; sürümleme planıyla      | Karar kaydı         |
| Kişisel veri toplama, silme, üçüncü tarafa gönderme         | Geri alınamaz                | Hukuki bakışla birlikte            | Karar kaydı + onay  |

Bir kararın tek yönlü olduğunu gösteren işaretler: yeni biçimde **veri birikecek**; dışarıda (müşteri, başka
servis, arama motoru) ona **bağlanan** olacak; **duyurulacak**; bir şey **silinecek ya da gönderilecek**.

## Seçenekleri karşılaştırma

1. En az iki gerçek seçenek yazın; üçüncüsü her zaman "şimdilik hiçbir şey yapma / ertele"dir.
2. Ölçütleri problemden çıkarın, zevkten değil; üç-beş tane yeter.
3. Puanlayın, ağırlıklandırın, toplayın.
4. **Duyarlılığa bakın:** hangi ağırlık biraz oynayınca kazanan değişiyor? Kararı o ölçüt belirliyor; araştırmanız
   ya da sahibine sormanız gereken soru odur.
5. Fark küçükse daha basit ve daha geri alınabilir olanı seçin; geri dönüş koşulunu kayda yazın.

```python calistir
weights = {"geri_alinabilirlik": 0.25, "basitlik": 0.25, "maliyet": 0.20, "olceklenme": 0.20, "ekip_bilgisi": 0.10}
options = {  # puanlar 1-5
    "SQLite": {"geri_alinabilirlik": 4, "basitlik": 5, "maliyet": 5, "olceklenme": 2, "ekip_bilgisi": 3},
    "PostgreSQL": {"geri_alinabilirlik": 4, "basitlik": 3, "maliyet": 3, "olceklenme": 5, "ekip_bilgisi": 4},
    "Belge veritabanı": {"geri_alinabilirlik": 2, "basitlik": 3, "maliyet": 3, "olceklenme": 4, "ekip_bilgisi": 2},
}


def score(name: str, w: dict[str, float]) -> float:
    return sum(w[k] * options[name][k] for k in w)


def winner(w: dict[str, float]) -> str:
    return max(options, key=lambda name: score(name, w))


def nudged(criterion: str, delta: float) -> dict[str, float]:
    w = dict(weights)
    w[criterion] = max(0.0, w[criterion] + delta)
    total = sum(w.values())
    return {k: v / total for k, v in w.items()}  # ağırlık toplamı yine 1


print("kazanan:", winner(weights), {name: round(score(name, weights), 2) for name in options})
flips = [(c, d) for c in weights for d in (-0.15, 0.15) if winner(nudged(c, d)) != winner(weights)]
print("kazananı değiştiren oynamalar:", flips)
assert ("olceklenme", 0.15) in flips  # karar "ölçeklenme gerekecek mi?" sorusuna bağlı
```

```cikti
kazanan: SQLite {'SQLite': 3.95, 'PostgreSQL': 3.75, 'Belge veritabanı': 2.85}
kazananı değiştiren oynamalar: [('basitlik', -0.15), ('maliyet', -0.15), ('olceklenme', 0.15)]
```

Sonuç bir sayı değil, bir sorudur: "Bir yıl içinde birden çok sunucu aynı veriye yazacak mı?" Yanıt "hayır"sa
SQLite; standart SQL'de kalındıkça sonradan PostgreSQL'e geçmek iki yönlü bir kapıdır. Puanlar uydurma
kesinlik taşır; tabloyu düşünmeyi düzenlemek için kullanın, kararı ona devretmeyin.

## Karar kaydı şablonu

Kısa tutun; yarım sayfa yeter. Depoda `docs/KARARLAR.md` ya da `docs/kararlar/NNN-ad.md` olarak durur.

```markdown
## KK-007: Para tutarları tam sayı kuruş olarak saklanır

Tarih: 2026-11-16 · Durum: kabul edildi (önceki: yok)

**Bağlam:** Bakiyeler bazen 1 kuruş tutmuyor; tutarlar `REAL` sütununda ve hesaplar `float` ile yapılıyor.

**Seçenekler:**
1. Olduğu gibi bırak — göç yok; hata sürer.
2. Ondalık metin ("12.50") — doğru; her hesapta ayrıştırma gerekir, sıralama metin gibi olur.
3. Tam sayı kuruş (1250) — doğru ve hızlı; giriş ve gösterimde çeviri gerekir.

**Karar:** 3. Çeviri tek yardımcı dosyada (`para.ts`) yapılır; başka yerde `parseFloat` yok.

**Sonuçlar:** (+) Toplamlar her zaman tutar. (−) Bir veri göçü gerekiyor. (−) Kuruştan küçük birim desteklenmez.

**Yeniden düşünme koşulu:** Kuruştan küçük birimle fiyat gerekirse (ör. litre fiyatı).
```

En değerli iki satır "Seçenekler" (elenenler neden elendi) ve "Yeniden düşünme koşulu"dur. Bunlar yoksa aynı
tartışma altı ay sonra baştan yapılır.

## İşe yarayan en basit şey

| İhtiyaç                   | Önce bununla başlayın                     | Şu olunca büyütün                                              |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Veri saklama              | SQLite ya da tek dosya                    | Birden çok sunucu aynı veriye yazacaksa                        |
| Arka plan işi             | Zamanlanmış görev (cron)                  | İşler birikiyor, yeniden deneme ve sıra gerekiyorsa → kuyruk   |
| Canlı güncelleme          | Aralıklı sorgulama (ör. 30 saniyede bir)  | Gecikme kullanıcıyı gerçekten rahatsız ediyorsa → SSE/WebSocket |
| Arama                     | `LIKE` + katlanmış arama sütunu           | On binlerce kayıt, alaka sıralaması gerekiyorsa → tam metin dizini |
| Ayar                      | Ortam değişkeni                           | Sahibi çalışma sırasında değiştirmek isterse → yönetim ekranı  |
| Mimari                    | Modüllere bölünmüş tek uygulama           | Bağımsız ölçeklenme ya da ayrı ekip gerekirse → ayrı servis    |
| Kimlik doğrulama, kripto  | Bakımı yapılan hazır çözüm                | Büyütmeyin; kendi algoritmanızı yazmayın                       |

"Büyütün" sütunu bir **tetikleyicidir**: olmadan büyütmek, gelmeyebilecek bir gelecek için bugün bedel ödemektir.

## Erken soyutlama ve üçüncü kez kuralı

Soyutlama, neyin değişeceğini bildiğinizde doğru kurulur; bunu ancak tekrarlar gösterir.

1. **Birinci kez:** doğrudan yazın.
2. **İkinci kez:** kopyalayıp uyarlayın; yanına "benzeri: x.ts" notu düşün.
3. **Üçüncü kez:** artık neyin sabit, neyin değişken olduğunu görüyorsunuz; şimdi ortak parçayı çıkarın.

Örnek: siparişleri CSV'ye aktaran kod yazdınız. İlk günden "her biçime aktarıcı eklentisi" kursaydınız, değişim
noktasını yanlış tahmin ederdiniz: üçüncü örnek (faturalar) gelince değişenin biçim değil **sütun listesi ve tarih
biçimi** olduğu görülür. Doğru soyutlama `export_csv(rows, columns)` olur; eklenti sistemi gerekmez.

Erken soyutlamanın işaretleri: tek gerçeklemesi olan arayüz; hep aynı değerle çağrılan parametre; kimsenin
değiştirmediği yapılandırma seçeneği; `Manager`, `Factory`, `Provider` adlı ince sarmalayıcılar; her çağıran için
bir `if (tür === …)` dalı biriktiren ortak işlev. Son durumda soyutlamayı geri açın (inline) ve yeniden çıkarın;
**yanlış soyutlama, tekrardan pahalıdır.**

İstisna: **dış bağımlılığın sınırı.** Ödeme sağlayıcısı, e-posta gönderici, yapay zekâ servisi gibi dış
servisleri ilk günden ince bir modülün arkasına koyun. Bu bir tahmin değil, bir yalıtımdır: test ederken sahtesini
takarsınız, servis değişince tek dosyaya dokunursunuz.

**Erken en iyileme** aynı ailedendir: ölçmeden hızlandırmak kodu karmaşıklaştırır ve çoğu zaman yanlış yeri
hızlandırır. Önce ölçeği bilin (1000 kullanıcı × 100 kayıt = 100 bin satır; SQLite bunu rahat taşır), sonra
[Performans yöntemi](performans-yontemi.md) ile ölçün.

## Tuzaklar

| Belirti                                                    | Neden                                           | Çözüm                                                           |
| ---------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Bir işlev adı için yarım gün tartışıldı                    | İki yönlü kapıya tek yönlü kapı muamelesi       | Hızlı seçin; yanlışsa yeniden adlandırma ucuzdur                |
| Para `float` saklandı, iki yıl sonra göç pahalı            | Tek yönlü kapıdan aceleyle geçildi              | Veri modeli kararlarını örnek veriyle deneyin, kayda geçirin    |
| Aynı karar üçüncü kez tartışılıyor                         | Karar kaydı yok ya da elenen seçenekler yazılmamış | Kayda "Seçenekler" ve "Yeniden düşünme koşulu" yazın         |
| Yeni ve popüler bir kütüphane seçildi, sonra terk edildi   | Seçim yenilik için yapıldı                      | Ölçüt listesine "bakımı yapılıyor mu, ekip biliyor mu" ekleyin  |
| 20 satırlık özellik için beş katman, üç arayüz             | Erken soyutlama                                 | En basit hâline indirin; üçüncü tekrarı bekleyin                |
| Ortak işlev her çağırana bir bayrak alıyor                 | Yanlış soyutlama                                | Geri açın (inline), tekrarlar netleşince yeniden çıkarın        |
| Dış servis kodu her yere dağılmış, değiştirmek imkânsız    | Sınırda yalıtım yapılmamış                      | Servisi tek modülün arkasına alın                               |
| Karar tablosu puanlarına göre seçildi, sonuç kötü          | Puanlar kesinlik sanıldı                        | Duyarlılığa bakın; kararı belirleyen soruyu yanıtlayın          |

## Denetim listesi

- [ ] Kararın tek yönlü mü iki yönlü mü olduğu yazıldı.
- [ ] En az iki seçenek ve "ertele" seçeneği değerlendirildi.
- [ ] Kararı belirleyen ölçüt (duyarlılık) bulundu ve o soru yanıtlandı.
- [ ] Tek yönlü kararlar için karar kaydı var: bağlam, seçenekler, karar, sonuçlar, yeniden düşünme koşulu.
- [ ] Yeni bağımlılık ya da yeni soyutlama katmanı varsa gerekçesi kayıtta.
- [ ] Dış servisler tek bir modülün arkasında.
- [ ] Kişisel veriyle ilgili kararlar için sahibinin onayı alındı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu konuda en az iki seçenek sun. Her biri için: geri alınabilirlik, basitlik, bedeli.
  Hangisi en basit? Önerin ve hangi koşulda değişeceği. Yeni bağımlılık ve yeni soyutlama katmanı ekleme;
  eklemen gerekiyorsa gerekçesini ayrıca yaz."
- **Modelin tipik hatası:** küçük bir iş için katman katman yapı kurar (arayüz + fabrika + yapılandırma); yeni ve
  popüler kütüphaneyi seçer, sonra onun API'sini ezberden (çoğu zaman yanlış) yazar; tek seçeneği tek doğru gibi
  sunar; ödünleşimleri yazmaz; basit bir iş için yeni paket ekler.
- **Çıktıda denetleyin:** `package.json` / `pyproject.toml` farkı (yeni bağımlılık var mı); tek gerçeklemeli yeni
  arayüzler; kimsenin ayarlamadığı yeni seçenekler; "ileride gerekebilir" diye yazılmış kod.
- Kararı modele değil, kayda bırakın: modelden karar kaydı taslağı isteyin, son sözü sahibi versin.

## İlgili

- [Problem çözme döngüsü](problem-cozme-dongusu.md): sor, varsay ya da dene.
- [Yeniden düzenleme](yeniden-duzenleme.md): yanlış soyutlamayı güvenle geri açmak.
- [Performans yöntemi](performans-yontemi.md): erken en iyilemenin panzehiri.
- [Teknik yazı](teknik-yazi.md): karar kaydını okunur yazmak.
- Havuzdaki karar kayıtları: [uygulama/docs/KARARLAR.md](../../uygulama/docs/KARARLAR.md).
- Diğer kümelerden: [Monolit ve servisler](../40-sistem-tasarimi/monolit-ve-servisler.md).
