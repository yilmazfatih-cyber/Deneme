---
baslik: İşi parçalama
ozet: Büyük işi dikey dilimlere ve yürüyen iskelete bölmek; sıra ve bağımlılık, her dilimin bitti tanımı ve riskli kısmı öne alma.
etiketler: [yontem, planlama, dilimleme, yuruyen-iskelet, risk]
duzey: temel
guncellik: 2026-11
---

# İşi parçalama

> Bu notu ne zaman okumalı: bir iş bir oturumda ya da bir günde bitmeyecek kadar büyükse; "%90 bitti" uzun
> süredir değişmiyorsa; bir modele büyük bir özellik yaptıracaksanız ve nereden başlatacağınızı bilmiyorsanız.

## Temel fikir

Büyük iş, her biri **kendi başına çalışan ve doğrulanabilen** ince dilimlere bölünür. İki tür kesim vardır:

- **Yatay (katman katman):** önce bütün veritabanı, sonra bütün API, sonra bütün arayüz. Haftalarca hiçbir şey
  çalışmaz; parçalar en sonda birleşirken sorunlar birden çıkar.
- **Dikey (dilim dilim):** her dilim arayüzden veritabanına kadar her katmana **biraz** dokunur ve kullanıcının
  yapabildiği bir şeyle biter. Bütünleşme sorunu ilk dilimde çıkar, küçükken.

İlk dilim **yürüyen iskelettir** (walking skeleton): en ince uçtan uca yol, gerçek ortamda çalışır. Örneğin boş bir
sayfa, bir API ucundan tek bir kaydı okuyup gösterir ve bu hâliyle yayına çıkar. Sonraki her dilim iskelete et ekler.
Sıralama kuralı: **önce riskli olan**, sonra değerli olan, en son süs.

## Karar tablosu

| Durum                                          | Nasıl dilimlenir                                                   | Neden                                      |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Yeni ürün ya da yeni proje                     | Yürüyen iskelet → dikey dilimler                                   | Dağıtım ve bütünleşme sorunu ilk gün çıkar |
| Bilinmeyen teknoloji, dış servis, belirsiz performans | Önce zaman kutulu deney (spike), sonra dilim                | Riski ucuza öğrenmek                       |
| Var olan üründe yeni özellik                   | Mutlu yol → kural çeşitleri → hata yolları                         | Değer erken, ayrıntı sonra gelir           |
| Veri göçü, şema değişikliği                    | Genişlet → taşı → daralt (expand/contract); her adım ayrı dilim    | Her adım tek başına geri alınabilir        |
| Arayüz ağırlıklı iş                            | Sabit veriyle ekran → gerçek veri → boş/hata/yükleniyor durumları  | Görsel geri bildirim erken gelir           |
| Birden çok kişi ya da model paralel çalışacak  | Önce sözleşme (tipler, şema, API biçimi), sonra paralel dilimler   | Bekleme ve çakışma azalır                  |

## Nasıl yapılır

1. **Sonucu yazın:** iş bitince kullanıcı ne yapabilecek? Tek paragraf.
2. **Akışı yazın:** kullanıcının adımları, sırayla. Her adım bir dilim adayıdır.
3. **Riskleri işaretleyin:** yeni teknoloji, dış servis, ödeme, büyük veri, performans, hukuki konu, belirsiz kural.
4. **Yürüyen iskeleti tanımlayın:** en ince uçtan uca yol + dağıtım. Bu, ilk dilimdir.
5. **Dilimleri kesin:** her biri kullanıcıya görünür bir şeyle ya da riski düşüren bir bilgiyle biter.
6. **Her dilime bitti tanımı yazın** (aşağıdaki şablon). Tanımsız dilim bitmez.
7. **Sıralayın:** bağımlılık izin verdiği ölçüde önce riskli, sonra değerli.
8. **Ölçün:** bir dilim bir günü (modelle bir oturumu) aşıyorsa yeniden bölün.

## Örnek: harcama paylaşma uygulaması

| Sıra | Dilim                         | Kullanıcı ne yapabilir                              | Risk                              |
| ---- | ----------------------------- | --------------------------------------------------- | --------------------------------- |
| 0    | Yürüyen iskelet               | Adresi açar, "Gruplarım" başlığını görür (yayında)  | Dağıtım, veritabanı bağlantısı    |
| 1    | Banka ekstresi deneyi (spike) | Hiçbir şey; ekip bir dosyanın okunabildiğini öğrenir | Biçim belirsiz, en büyük bilinmeyen |
| 2    | Harcama ekle                  | Tek grupta, tek para biriminde harcama yazar, listeyi görür | Düşük                     |
| 3    | Eşit bölüştür                 | Harcamayı kişilere böler, paylar kuruşu kuruşuna tutar | Yuvarlama                      |
| 4    | Üye davet et                  | Bir arkadaşını bağlantıyla gruba çağırır            | Kimlik doğrulama                  |
| 5    | Borç sadeleştirme             | "Kim kime ne kadar öder" listesini görür            | Algoritma                         |
| 6    | Tema seçimi                   | Koyu tema seçer                                     | Yok (süs)                         |

Dikkat edin: "Veritabanı şeması" ya da "API katmanı" diye bir dilim yok. Şema, her dilimde ihtiyaç kadar büyür.

## Dilimi bölme kalıpları

Bir dilim büyük geldiyse şu eksenlerden birinde ikiye bölün:

| Eksen          | İlk dilim                        | Sonraki dilim                           |
| -------------- | -------------------------------- | --------------------------------------- |
| Yol            | Mutlu yol                        | Hata yolları, iptal, geri alma          |
| Kural          | Eşit bölüşüm                     | Oranlı bölüşüm, tutarla bölüşüm         |
| Veri           | Tek para birimi, tek dil         | Döviz, çok dil                          |
| Rol            | Tek kullanıcı                    | Davetli üye, yönetici                   |
| Otomasyon      | Yönetici elle yapar (bir betikle) | Ekrandan otomatik                      |
| Kaynak         | Sabit liste                      | Veritabanından, dış servisten           |
| Kalite         | Doğru çalışır                    | Hızlı çalışır, güzel görünür            |

**Deney (spike) ayrı bir dilim türüdür:** kod değil bilgi üretir, süresi baştan bellidir (ör. yarım gün) ve sonucu
bir karardır ("CSV okunabiliyor, PDF okunamıyor → yalnız CSV desteklenecek"). Deney kodu ürüne taşınmaz; gerekirse
dilim olarak yeniden yazılır.

## Bitti tanımı şablonu

```text
Dilim:              Eşit bölüştür
Kullanıcı yapabilir: Bir harcamayı seçili kişilere eşit böler, her kişinin payını görür.
Kabul örnekleri:    100,00 TL / 3 kişi → 33,34 + 33,33 + 33,33
                    0,01 TL / 2 kişi  → 0,01 + 0,00
Testler:            birim (bölüştürme işlevi), uçtan uca (harcama ekle → paylar ekranda)
Dışarıda kalan:     oranlı bölüşüm, döviz (ayrı dilimler)
Yayın:              yayında, bayrak (feature flag) arkasında
```

"Dışarıda kalan" satırı en çok atlanan satırdır. Yazılmazsa dilim, gelen her yeni istekle büyür ve hiç bitmez.

## Sıra ve bağımlılık

Dilimler bir bağımlılık grafiğidir. Grafiğin izin verdiği her an, hazır dilimlerden **en riskli** olanı seçin;
eşitlikte daha değerli olanı. Python'un standart kütüphanesindeki `graphlib` bunu birkaç satırda yapar ve
döngüsel bağımlılığı da yakalar:

```python calistir
from graphlib import CycleError, TopologicalSorter

# dilim: (bağımlı olduğu dilimler, risk 0-3, değer 0-3)
slices = {
    "iskelet": (set(), 2, 1),
    "harcama-ekle": ({"iskelet"}, 1, 3),
    "esit-bolustur": ({"harcama-ekle"}, 2, 3),
    "banka-deneyi": ({"iskelet"}, 3, 2),
    "davet": ({"iskelet"}, 1, 2),
    "tema": ({"iskelet"}, 0, 1),
}


def plan(items: dict[str, tuple[set[str], int, int]]) -> list[str]:
    sorter = TopologicalSorter({name: deps for name, (deps, _, _) in items.items()})
    sorter.prepare()  # döngü varsa burada CycleError
    ready, order = set(sorter.get_ready()), []
    while ready:
        best = min(ready, key=lambda n: (-items[n][1], -items[n][2], n))  # önce risk, sonra değer
        ready.remove(best)
        order.append(best)
        sorter.done(best)
        ready.update(sorter.get_ready())
    return order


assert plan(slices) == ["iskelet", "banka-deneyi", "harcama-ekle", "esit-bolustur", "davet", "tema"]

try:
    plan({"a": ({"b"}, 1, 1), "b": ({"a"}, 1, 1)})
    raise AssertionError("döngü yakalanmalıydı")
except CycleError:
    print("sıra hazır; döngü yakalandı")
```

```cikti
sıra hazır; döngü yakalandı
```

Döngü çıkarsa (A, B'yi; B, A'yı bekliyor) dilimler yanlış kesilmiştir: ikisinin ortak ihtiyacını ayrı, daha önce
gelen bir dilime çıkarın.

## Tuzaklar

| Belirti                                                        | Neden                                        | Çözüm                                                         |
| -------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Üç hafta geçti; "veritabanı bitti" ama kullanıcı hiçbir şey yapamıyor | Yatay dilimleme                       | Dikey dilim: ince ama uçtan uca                               |
| Son hafta parçalar birbirine uymuyor                           | Bütünleşme sona bırakıldı                    | Yürüyen iskelet ilk gün; her dilim uçtan uca çalışır          |
| "%90 bitti" iki haftadır değişmiyor                            | Dilim çok büyük, bitti tanımı yok            | Dilimi bölün; "bitti" yalnız kabul örnekleri geçince denir    |
| Ödeme ya da dış servis son hafta sorun çıkardı                 | Riskli kısım sona kaldı                      | En büyük bilinmeyeni ilk günlerde zaman kutulu deneyle sınayın |
| Dilimler birbirini bekliyor                                    | Sözleşme önceden yazılmadı                   | Önce tipler ve API biçimi; sonra paralel dilimler             |
| Deney kodu ürüne girdi, sonra hiç düzelmedi                    | Deney ile dilim karıştı                      | Deneyin çıktısı karardır; kod atılır ya da yeniden yazılır     |
| Dilim her gün biraz büyüyor                                    | "Dışarıda kalan" yazılmadı                   | Yeni istek yeni dilimdir; o dilimin listesine yazın            |
| İskelet çalışıyor ama yalnız geliştirici makinesinde           | İskelete dağıtım katılmadı                   | İskeletin bitti tanımına "yayında, adresi açılıyor" girer      |
| Sıra hep "kolay olan önce" ile kuruluyor                       | Rahatlık riskten önce geliyor                | Hazır dilimlerden en riskliyi seçin (yukarıdaki kural)        |

## Denetim listesi

- [ ] İşin sonucu tek paragrafta, kullanıcının yapabileceği şey olarak yazılı.
- [ ] İlk dilim yürüyen iskelet ve gerçek ortamda açılıyor.
- [ ] Hiçbir dilimin adı bir katman değil ("API katmanı", "veritabanı" yok).
- [ ] Her dilimin bitti tanımı, kabul örnekleri ve "dışarıda kalan" satırı var.
- [ ] En büyük bilinmeyen ilk üç dilim içinde, zaman kutulu bir deneyle sınanıyor.
- [ ] Hiçbir dilim bir günü (modelle bir oturumu) aşmıyor.
- [ ] Bağımlılıklar yazılı; döngü yok.
- [ ] Her dilim bitince program yayına çıkabilecek durumda (gerekirse bayrak arkasında).

## Küçük modele yaptırırken

- **İsteme yazın:** "Kod yazmadan önce bu işi en çok 8 dikey dilime böl. Her dilim için: kullanıcı ne yapabilir,
  kabul örnekleri, dışarıda kalan, risk. İlk dilim yürüyen iskelet olsun. Katman adıyla dilim yazma." Listeyi
  onaylayın, sonra **her istemde tek dilim** verin.
- **Modelin tipik hatası:** katman katman plan yapar ("1. şema, 2. API, 3. arayüz"); bütün özelliği tek seferde
  yazmaya girişir; istenmeyen özellik ekler; riskli parçayı "sonra bakarız" diye en sona koyar; "dışarıda kalan"
  satırını boş bırakır.
- **Çıktıda denetleyin:** her dilimin sonunda ekranda görülebilen ya da bir komutla doğrulanabilen bir şey var mı;
  dilim istenenden fazla dosyaya dokunmuş mu; bitti tanımındaki örnekler testlere girmiş mi.
- **Kalıp istem (dilim başına):** "Yalnız şu dilimi yap: <dilim>. Bitti tanımı: <şablon>. Dışarıda kalanlara
  dokunma. Bitince testleri çalıştır ve çıktıyı göster."

## İlgili

- [Problem çözme döngüsü](problem-cozme-dongusu.md): her dilimin içinde dönen döngü.
- [Tahmin ve planlama](tahmin-ve-planlama.md): dilimlerin süresini aralıkla tahmin etmek.
- [Tasarım kararı](tasarim-karari.md): deneyin sonunda verilen kararı kaydetmek.
- [Güvenilirlik düşüncesi](guvenilirlik-dusuncesi.md): genişlet–taşı–daralt ve geri alma planı.
- Diğer kümelerden: [MVP kapsamı](../95-urun/mvp-kapsami.md), [Migrasyonlar](../30-arkauc/migrasyonlar.md).
