---
baslik: "Örnek tasarım: haber akışı"
ozet: Takip edilenlerin gönderilerinden akış üretmek; okurken çekme, yazarken dağıtma ve melez yaklaşımın maliyet benzetimi, tek sunuculu başlangıç, imleçli sayfalama, silme ve gizlilik değişiklikleri, büyüyünce değişenler.
etiketler: [ornek-tasarim, haber-akisi, fan-out, sayfalama, olcekleme]
duzey: ileri
guncellik: 2026-11
---

# Örnek tasarım: haber akışı

> Bu notu ne zaman okumalı: takip, abonelik ya da "arkadaşların etkinlikleri" gibi kişiye özel bir akış
> tasarlanırken; akış sayfası yavaşladığında; popüler bir hesabın gönderisi sistemi zorladığında.

## Temel fikir

- Akış, kullanıcının takip ettiklerinin gönderilerinin birleşimidir. Hesabın **ne zaman** yapılacağı tek büyük
  karardır:
  - **Okurken çek** (fan-out on read): akış açılınca takip edilenlerin son gönderileri sorgulanır ve birleştirilir.
    Yazma ucuz, okuma pahalı.
  - **Yazarken dağıt** (fan-out on write): gönderi atılınca her takipçinin hazır akış listesine eklenir. Okuma ucuz,
    yazma pahalı; çok takipçili hesapta tek gönderi binlerce yazma demektir.
  - **Melez:** sıradan hesaplar yazarken dağıtılır, çok takipçili ("ünlü") hesaplar okurken çekilir.
- Doğru seçim takipçi dağılımına ve etkin kullanıcı oranına bağlıdır: **hesaplayın**, ezbere seçmeyin.
- Küçük ölçekte okurken çekmek, iyi bir dizinle tek bir sorgudur; başlangıç budur.

## Gereksinimler

| Tür              | Gereksinim                                                                         |
| ---------------- | ---------------------------------------------------------------------------------- |
| İşlevsel         | Takip et / bırak; akış: takip edilenlerin gönderileri, yeniden eskiye; sonsuz kaydırma |
| İşlevsel         | Gönderi silinince, takip bırakılınca, engellenince akıştan kalkar                  |
| İşlevsel olmayan | Akış ilk sayfa p95 < 300 ms; yeni gönderi takipçilere 1 dk içinde görünür           |
| Hedef dışı       | Kişiselleştirilmiş sıralama (ilk sürüm yalnız zaman sırası); öneri                  |

## Kaba hesap: üç yaklaşımın maliyeti

Benzetim: 5000 kullanıcı, takip sayısı 10–70, popülerlik ağır kuyruklu (birkaç hesabı neredeyse herkes izliyor);
kullanıcıların %30'u günlük etkin ve akışı günde 10 kez açıyor; herkes günde bir gönderi atıyor.

```python calistir
import itertools
import random

rng = random.Random(11)
N = 5_000
populerlik = [rng.paretovariate(1.3) for _ in range(N)]  # birkaç hesap çok popüler (ağır kuyruk)
birikimli = list(itertools.accumulate(populerlik))
takip = [set(rng.choices(range(N), cum_weights=birikimli, k=rng.randint(10, 70))) - {v} for v in range(N)]
takipci = [0] * N
for kume in takip:
    for u in kume:
        takipci[u] += 1
etkin = {v for v in range(N) if rng.random() < 0.3}  # günlük etkin kullanıcılar: akışı yalnız onlar okur
OKUMA, ESIK = 10, 200  # etkin kullanıcı günde 10 kez akış açar; herkes günde 1 gönderi; 200+ takipçi = "ünlü"
unlu = {u for u in range(N) if takipci[u] >= ESIK}

stratejiler = {  # (günlük akış yazması, tek gönderinin en büyük dağıtımı, günlük okuma işi = birleştirilen liste)
    "yazarken dağıt": (sum(takipci), max(takipci), len(etkin) * OKUMA),
    "okurken çek": (0, 0, sum(len(takip[v]) for v in etkin) * OKUMA),
    "melez": (
        sum(f for u, f in enumerate(takipci) if u not in unlu),
        max(f for u, f in enumerate(takipci) if u not in unlu),
        sum(1 + len(takip[v] & unlu) for v in etkin) * OKUMA,  # hazır akış + takip edilen ünlüler okurken
    ),
}
print(f"{len(unlu)} ünlü hesap, en çok takipçi {max(takipci)}, etkin kullanıcı {len(etkin)}")
for ad, (yazma, en_buyuk, okuma) in stratejiler.items():
    print(f"{ad:14}: yazma {yazma:6}/gün | tek gönderide en çok {en_buyuk:4} yazma | okuma işi {okuma:6}/gün")
yaz, cek, melez = stratejiler.values()
assert melez[1] < ESIK <= yaz[1] and melez[0] < yaz[0] and melez[2] < cek[2]
bosa = 1 - sum(len(takip[v]) for v in etkin) / yaz[0]  # hiç açılmayacak akışlara yapılan yazma
print(f"yazarken dağıtmada yazmaların %{bosa * 100:.0f} kadarı etkin olmayan kullanıcıların akışına")
assert bosa > 0.5
```

```cikti
81 ünlü hesap, en çok takipçi 4984, etkin kullanıcı 1478
yazarken dağıt: yazma 146501/gün | tek gönderide en çok 4984 yazma | okuma işi  14780/gün
okurken çek   : yazma      0/gün | tek gönderide en çok    0 yazma | okuma işi 430800/gün
melez         : yazma 104675/gün | tek gönderide en çok  197 yazma | okuma işi 137690/gün
yazarken dağıtmada yazmaların %71 kadarı etkin olmayan kullanıcıların akışına
```

Okuma:

- Yazarken dağıtmada okuma çok ucuzdur ama tek bir popüler gönderi ~5000 yazma, ve yazmaların çoğu hiç açılmayacak
  akışlara gider. Gerçek ünlülerde bu milyonlardır: gönderi dakikalarca "dağıtılıyor" kalır.
- Okurken çekmede yazma yoktur ama her akış açılışı onlarca listeyi birleştirir; okuma yazmadan çok sık olduğu için
  toplam iş en yüksektir.
- Melez, tek gönderinin dağıtımını sınırlar (operasyonel risk biter) ve okumayı makul tutar. Yazmayı daha da azaltmanın
  yolu **yalnız etkin kullanıcıların akışını üretmek**tir: uzun süre girmeyenin akışı ilk açılışta okurken çekilerek
  kurulur.

## İlk tasarım: tek sunucu

Küçük ölçekte **okurken çek** yeter: tek sorgu, iyi bir dizin.

```sql calistir
CREATE TABLE takip (takipci INTEGER, takip_edilen INTEGER, PRIMARY KEY (takipci, takip_edilen));
CREATE TABLE gonderi (id INTEGER PRIMARY KEY, yazar INTEGER NOT NULL, olusturma TEXT NOT NULL, metin TEXT,
                      silindi INTEGER NOT NULL DEFAULT 0);
CREATE INDEX gonderi_yazar_zaman ON gonderi (yazar, olusturma DESC, id DESC);
INSERT INTO takip VALUES (1, 2), (1, 3);
INSERT INTO gonderi (id, yazar, olusturma, metin) VALUES
  (10, 2, '2026-11-16T09:00:00Z', 'sabah'), (11, 3, '2026-11-16T10:00:00Z', 'öğle'),
  (12, 4, '2026-11-16T11:00:00Z', 'takip edilmeyen'), (13, 2, '2026-11-16T12:00:00Z', 'öğleden sonra');
-- İlk sayfa (2 gönderi), sonra imleçle ikinci sayfa: (olusturma, id) son görülenden küçük olanlar
SELECT g.id, g.metin FROM gonderi g JOIN takip t ON t.takip_edilen = g.yazar
 WHERE t.takipci = 1 AND g.silindi = 0 ORDER BY g.olusturma DESC, g.id DESC LIMIT 2;
SELECT g.id, g.metin FROM gonderi g JOIN takip t ON t.takip_edilen = g.yazar
 WHERE t.takipci = 1 AND g.silindi = 0 AND (g.olusturma, g.id) < ('2026-11-16T10:00:00Z', 11)
 ORDER BY g.olusturma DESC, g.id DESC LIMIT 2;
```

```cikti
13|öğleden sonra
11|öğle
10|sabah
```

- Sayfalama **imleçle** yapılır (`(olusturma, id)` çifti); ofsetle sayfalamada araya yeni gönderi girince aynı gönderi
  iki kez görünür ([API tasarımı](../30-arkauc/api-tasarimi.md) → sayfalama).
- Silinen gönderi, takibi bırakılan ve engellenen hesap **okuma anında** süzülür; hazır akış listesi kullanılsa bile
  süzgeç okumada uygulanır (liste yalnız aday üretir).
- Beğeni ve yorum sayıları akış sorgusunda canlı sayılmaz: ayrı sayaç sütunu, yaklaşık ve gecikmeli güncellenir
  ([Tutarlılık modelleri](tutarlilik-modelleri.md) → nihai tutarlılık).
- Takip sayısı çok büyük kullanıcılarda (binlerce) tek sorgu yavaşlar: takip başına son N gönderi sınırı ya da
  geçişin zamanı geldiğinin işareti.

## Büyüyünce ne değişir

| Eşik                                                | Değişiklik                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Akış sorgusu p95 hedefi aşıyor                      | Etkin kullanıcılar için hazır akış (yazarken dağıt), kullanıcı başına son 500 öğe |
| Çok takipçili hesapların gönderisi kuyruğu tıkıyor  | Melez: eşik üstü hesaplar okurken çekilir                                     |
| Akış tablosu dev                                    | Kullanıcı başına üst sınır; eskisi silinir, gerekirse okurken çekilir         |
| Dağıtım işi yetişmiyor                              | Kuyruk + işçi; gönderi kendi akışında hemen, takipçilerde birkaç saniye içinde ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)) |
| Sıralama kişiselleşecek                             | Aday üretimi (bu not) + sıralama modeli ([Öneri sistemleri](../80-ml/oneri-sistemleri.md)) |
| Okuma veritabanını boğuyor                          | Hazır akışları önbellekte (kullanıcı başına liste) tutmak; okuma kopyası      |

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Sonsuz kaydırmada aynı gönderi iki kez                      | Ofset sayfalama                                          | `(zaman, id)` imleci                                          |
| Popüler hesap paylaşınca sistem dakikalarca yavaşladı       | Yazarken dağıtma, sınırsız tek gönderi dağıtımı          | Melez; dağıtımı kuyruğa ve parçalara böl                     |
| Silinen gönderi bazı akışlarda duruyor                      | Hazır akış listesi temizlenmedi                          | Okumada süz (silindi, engel, takip)                           |
| Engellenen kişinin gönderisi görünüyor                      | Gizlilik değişikliği hazır listelere yansımadı           | Yetki/görünürlük süzgeci her okumada                          |
| Yazmaların çoğu boşa                                        | Etkin olmayan kullanıcıların akışı da üretiliyor         | Yalnız etkin kullanıcılar; ilk açılışta okurken kur          |
| Beğeni düğmesi popüler gönderide kilitleniyor               | Tek satırda sayaç, her beğenide güncelleme               | Toplu sayaç ya da parçalı sayaç ([Veritabanı ölçekleme](veritabani-olcekleme.md) → sıcak anahtar) |
| Akış "zaman sırası" ama saatler karışık                     | Gönderi zamanı istemci saatiyle                          | Zamanı sunucu yazar                                           |

## Denetim listesi

- [ ] Yaklaşım (çek / dağıt / melez) gerçek takipçi dağılımı ve etkin oranla hesaplanarak seçildi.
- [ ] Akış imleçle sayfalanıyor; imleç `(zaman, id)`.
- [ ] Silme, takip bırakma, engelleme ve gizlilik okuma anında süzülüyor.
- [ ] Tek gönderinin dağıtımı sınırlı ya da kuyrukta parçalı.
- [ ] Hazır akış yalnız etkin kullanıcılar için ve boyutu sınırlı.
- [ ] Sayaçlar ayrı, yaklaşık ve toplu güncelleniyor.
- [ ] Akış ilk sayfa p95'i ve dağıtım kuyruğu derinliği izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Akış okurken çekilsin: `takip` ile `gonderi` birleşimi, `(olusturma, id)` imleçli, `LIMIT`
  en çok 50. Silinmiş ve engellenmiş içerik sorguda süzülsün. Hazır akış tablosu ve dağıtım işi şimdilik yok."
- **Modelin tipik hatası:** `OFFSET` ile sayfalar; her gönderide bütün takipçilerin akışına senkron yazar; silinen
  gönderiyi yalnız `gonderi` tablosundan siler, hazır akışlardan değil; beğeni sayısını akış sorgusunda `COUNT(*)`
  ile hesaplar.
- **Çıktıda arayın:** `OFFSET`, döngü içinde takipçi başına `INSERT`, akış sorgusunda görünürlük süzgeci,
  `COUNT(*)` alt sorgusu.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) · [Veritabanı ölçekleme](veritabani-olcekleme.md) (sıcak anahtar) ·
  [Önbellek katmanları](onbellek-katmanlari.md) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md)
- [API tasarımı](../30-arkauc/api-tasarimi.md) (imleçli sayfalama) · [Öneri sistemleri](../80-ml/oneri-sistemleri.md)
  (sıralama ve geri besleme döngüsü)
- Havuzda imleç kodlama ve keyset koşulu: [`kutuphane/py/kutuphane/sayfalama.py`](../../kutuphane/py/kutuphane/sayfalama.py)
