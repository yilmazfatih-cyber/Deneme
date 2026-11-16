---
baslik: Önbellek katmanları: tarayıcıdan veritabanına
ozet: Tarayıcı, CDN, uygulama ve veritabanı önbelleğinden hangisinin seçileceği; isabet oranının yüke etkisi, bayat veri bedeli, sürü etkisi, ısınma ve geçersiz kılma; çalışan benzetimlerle.
etiketler: [onbellek, cdn, performans, tutarlilik, olcekleme]
duzey: orta
guncellik: 2026-11
---

# Önbellek katmanları: tarayıcıdan veritabanına

> Bu notu ne zaman okumalı: "şunu önbelleğe alalım" önerisi geldiğinde; kullanıcı "değiştirdim ama eski hâli
> görünüyor" dediğinde; bir dağıtımdan ya da yeniden başlatmadan hemen sonra veritabanı boğulduğunda; bir model
> Redis eklemeyi önerdiğinde.

## Temel fikir

- Önbellek, **tazeliği hıza ve kapasiteye** satar. Her önbellek bir kopyadır ve kopya bayatlayabilir. Önbellek
  eklemeden önce iki soru yazılı cevaplanır: "Ne kadar bayat kabul edilir?" ve "Değişince kopyayı kim siler?"
- İsabet oranı (hit rate) yükü doğrusal değil **ıska oranıyla** belirler: veritabanına giden yük = trafik ×
  (1 − isabet). %90'dan %99'a çıkmak veritabanı yükünü 10'da birine indirir.
- Sistem önbellek **boşken** de (yavaş ama) çalışmalıdır. Önbellek boşalınca çöken sistemde önbellek bir
  iyileştirme değil, gizli bir veritabanıdır ve tek arıza noktasıdır.
- En ucuz ve en etkili katmanlar en dıştakilerdir (tarayıcı, CDN); en tehlikelisi kişiye özel veriyi
  paylaşılan bir katmanda saklamaktır.

## Katmanlar

| Katman                         | Ne saklar                                   | Geçersiz kılma                          | Dikkat                                                                     |
| ------------------------------ | ------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Tarayıcı (HTTP önbelleği, servis çalışanı) | Statik dosya, herkese açık yanıt  | **Elinizde değil**: süre dolana dek      | Özetli dosya adı + uzun süre; HTML'e `no-cache`. Yanlış süre geri alınamaz |
| CDN / ters vekil               | Statik dosya, herkese açık sayfa, görsel    | Temizleme (purge) çağrısı ya da süre    | Kişiye özel yanıt asla; çerezli yanıtı önbelleğe almamasını sağlayın       |
| Süreç içi (bellekte LRU)       | Sık okunan küçük veri, ayar, sözlük         | Süre; kendi sürecinde silme             | Her süreçte ayrı kopya: sunucular farklı cevap verebilir; yeniden başlayınca boş |
| Paylaşılan (Redis, Memcached)  | Oturum, hesaplanmış sonuç, sayaç            | Yazınca sil; süre                       | Ayrı bir arıza noktası; ağ gidiş-dönüşü ekler                              |
| Veritabanı içi                 | Sayfa önbelleği; özet tablo, somutlaştırılmış görünüm | Veritabanı yönetir; özet tabloyu siz yenilersiniz | Pahalı toplamlar için; "tablo" olduğu için tutarlılığı işlemle korunabilir |

HTTP başlıklarının ayrıntısı (Cache-Control, ETag, Vary): [HTTP temelleri](../30-arkauc/http-temelleri.md).
Havuzdaki örnek: API, Vite'ın özetli adlı `/assets/` dosyalarını bir yıl değişmez, öteki her şeyi `no-cache`
olarak sunar ([`static.ts`](../../uygulama/api/src/http/static.ts)).

## Karar tablosu

| Durum                                                        | Seçim                                             | Neden                                                   |
| ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| JS/CSS/görsel dosyaları                                       | Özetli ad + tarayıcı/CDN'de uzun süre             | Ad değişince yeni dosya; geçersiz kılma sorunu yok      |
| Herkese açık, dakikada bir değişen sayfa                     | CDN'de kısa süre (30–60 sn) + bayat-sun            | Binlerce isteği tek isteğe indirir                      |
| Pahalı, sık okunan, nadir değişen veri (kategori listesi)    | Süreç içi LRU + kısa süre                         | Ağ yok, en hızlı; birkaç saniye bayatlık zararsız       |
| Birden çok sunucu aynı pahalı hesabı yapıyor                 | Paylaşılan önbellek                               | Hesap bir kez yapılır                                   |
| Pano toplamları (günlük satış, sayaç)                        | Özet tablo, işle birlikte ya da düzenli güncelleme | Tutarlılık veritabanı işlemiyle korunur                |
| Bakiye, stok, yetki: yanlışsa zarar var                      | Önbelleğe alma (ya da yazınca aynı işlemde sil)   | Bayatlığın bedeli hızın kazancından büyük               |
| Kişiye özel yanıt                                            | Ya hiç ya anahtarda kullanıcı/kiracı kimliğiyle   | Başkasının verisi başkasına gider                       |
| Yazma ağırlıklı veri                                         | Önbelleğe alma                                    | Silme/yenileme maliyeti kazancı yer                     |

## İsabet oranı ve ısınma

Okumaların çoğu az sayıda anahtara gider (popülerlik dağılımı). Benzetim, 10 000 anahtar üzerinde 100 000 okumayı
farklı boyutlu LRU önbelleklerden geçirir; sonra yeniden başlatılmış (boş) önbelleğin ilk isteklerine bakar:

```python calistir
import itertools
import random
from collections import OrderedDict

rng = random.Random(1)
ANAHTAR = 10_000
agirlik = [1 / (i + 1) ** 1.2 for i in range(ANAHTAR)]  # az sayıda anahtar çok okunur
istekler = rng.choices(range(ANAHTAR), cum_weights=list(itertools.accumulate(agirlik)), k=100_000)


def lru_isabetleri(boyut: int, akis: list[int]) -> list[bool]:
    lru: OrderedDict[int, None] = OrderedDict()
    sonuc = []
    for anahtar in akis:
        sonuc.append(anahtar in lru)
        lru[anahtar] = None
        lru.move_to_end(anahtar)
        if len(lru) > boyut:
            lru.popitem(last=False)  # en uzun süre kullanılmayanı at
    return sonuc


for boyut in (100, 500, 2_000):
    h = sum(lru_isabetleri(boyut, istekler)) / len(istekler)
    print(f"önbellek {boyut:5} anahtar: isabet %{h * 100:4.1f} → saniyede 1000 okumanın {1000 * (1 - h):3.0f}'ü VT'ye")

isabet = lru_isabetleri(1_000, istekler)
ilk, sonra = sum(isabet[:1_000]) / 1_000, sum(isabet[50_000:51_000]) / 1_000
print(f"yeniden başlatma sonrası ilk 1000 istek: isabet %{ilk * 100:.0f} (ısınmış: %{sonra * 100:.0f})")
assert (1 - ilk) / (1 - sonra) > 2  # soğuk önbellekte veritabanı yükü 2 katından fazla
```

```cikti
önbellek   100 anahtar: isabet %65.6 → saniyede 1000 okumanın 344'ü VT'ye
önbellek   500 anahtar: isabet %80.5 → saniyede 1000 okumanın 195'ü VT'ye
önbellek  2000 anahtar: isabet %90.0 → saniyede 1000 okumanın 100'ü VT'ye
yeniden başlatma sonrası ilk 1000 istek: isabet %66 (ısınmış: %87)
```

Dersler:

- Önbelleği 20 kat büyütmek isabeti %66'dan %90'a çıkardı ama veritabanı yükü 3,4 kat düştü: karar verirken
  isabete değil **ıskaya** bakın.
- Yeniden başlatmadan hemen sonra veritabanı, ısınmış hâlin 2–3 katı yük görür. Bütün sunucuları aynı anda
  yeniden başlatmayın (sırayla dağıtın); veritabanı **soğuk önbellek yükünü** taşıyabilmeli; gerekirse en
  popüler anahtarlar açılışta önceden yüklenir.

## Bayat veri: sil-ve-doldur yarışı

En yaygın kalıp "önbellek kenarda" (cache-aside): oku → yoksa veritabanından al → önbelleğe yaz; güncellemede
veritabanına yaz → önbelleği sil. Bu kalıbın bilinen bir yarışı vardır: yavaş bir okuyucu, siz sildikten **sonra**
eski değeri geri yazar ve değer süre dolana dek bayat kalır. Çözüm: ıskalayan okuyucuya bir **kira** (lease)
vermek; silme kirayı geçersiz kılar, geçersiz kirayla yazma reddedilir.

```python calistir
class Onbellek:
    """Kiralı önbellek: ıskalayan okuyucu kira alır; silme o anahtarın kiralarını geçersiz kılar."""

    def __init__(self) -> None:
        self.veri: dict[str, int] = {}
        self.kusak: dict[str, int] = {}

    def oku(self, k: str) -> tuple[int | None, int]:
        return self.veri.get(k), self.kusak.get(k, 0)  # (değer, kira)

    def doldur_yanlis(self, k: str, deger: int) -> None:
        self.veri[k] = deger  # kim, ne zaman okuduysa yazar

    def doldur(self, k: str, deger: int, kira: int) -> bool:
        if self.kusak.get(k, 0) != kira:  # okuduktan sonra silme oldu: elimdeki değer bayat
            return False
        self.veri[k] = deger
        return True

    def sil(self, k: str) -> None:
        self.veri.pop(k, None)
        self.kusak[k] = self.kusak.get(k, 0) + 1


for kirali in (False, True):
    vt = {"fiyat:42": 100}
    ob = Onbellek()
    _, kira = ob.oku("fiyat:42")  # 1) A ıskaladı, kira aldı
    a_okudu = vt["fiyat:42"]  # 2) A veritabanından 100 okudu (yavaş bir sorgu)
    vt["fiyat:42"] = 120  # 3) B fiyatı güncelledi
    ob.sil("fiyat:42")  # 4) B önbelleği sildi
    if kirali:  # 5) A elindeki eski değeri önbelleğe yazmaya çalışır
        ob.doldur("fiyat:42", a_okudu, kira)
    else:
        ob.doldur_yanlis("fiyat:42", a_okudu)
    print(f"{'kiralı ' if kirali else 'kirasız'}: önbellek {ob.oku('fiyat:42')[0]}, veritabanı {vt['fiyat:42']}")
    assert ob.oku("fiyat:42")[0] == (None if kirali else 100)  # kirasız: TTL dolana dek eski fiyat
```

```cikti
kirasız: önbellek 100, veritabanı 120
kiralı : önbellek None, veritabanı 120
```

Kira yoksa en azından: (1) **her** önbellek girdisine süre koyun (bayatlığın üst sınırı budur), (2) güncellemede
önbelleği **güncellemeyin, silin** (iki yazarın sırası karışınca eski değer kalır), (3) silmeyi veritabanı işlemi
**bittikten sonra** yapın, (4) yanlış değerin bedeli yüksekse o veriyi önbelleğe almayın.

## Sürü etkisi (cache stampede)

Sıcak bir anahtarın süresi dolduğunda, değer yeniden yüklenene kadar gelen **her** istek ıskalar ve veritabanına
gider. Sorgu pahalıysa veritabanı yavaşlar, yükleme uzar, daha çok istek ıskalar: kendini besleyen bir çöküş.

```python calistir
def benzet(kip: str, yukleme_ms: int = 80, sure_ms: int = 200) -> tuple[int, int]:
    """Sıcak anahtarın süresi t=0'da doldu; her ms bir istek gelir. (VT sorgusu, en uzun bekleme) döner."""
    sorgu, en_uzun, taze_an = 0, 0, None
    for t in range(sure_ms):
        if taze_an is not None and t >= taze_an:
            continue  # isabet: değer yenilenmiş
        if kip == "yalin" or taze_an is None:  # yalın: her ıskalayan sorgular; ötekiler: yalnız ilki
            sorgu += 1
            taze_an = taze_an if taze_an is not None else t + yukleme_ms
        bekleme = {"yalin": yukleme_ms, "tek_ucus": taze_an - t, "bayat_sun": 0}[kip]
        en_uzun = max(en_uzun, bekleme)
    return sorgu, en_uzun


for kip in ("yalin", "tek_ucus", "bayat_sun"):
    sorgu, bekleme = benzet(kip)
    print(f"{kip:9}: {sorgu:2} veritabanı sorgusu, en uzun bekleme {bekleme} ms")
assert benzet("yalin")[0] == 80 and benzet("tek_ucus")[0] == benzet("bayat_sun")[0] == 1
```

```cikti
yalin    : 80 veritabanı sorgusu, en uzun bekleme 80 ms
tek_ucus :  1 veritabanı sorgusu, en uzun bekleme 80 ms
bayat_sun:  1 veritabanı sorgusu, en uzun bekleme 0 ms
```

- **Tek uçuş** (single-flight, istek birleştirme): aynı anahtar için süren yükleme varsa yenisi başlamaz, herkes onu
  bekler. Havuzda hazır: [`kutuphane/ts/src/onbellek.ts`](../../kutuphane/ts/src/onbellek.ts) → `getOrSetAsync`
  (Python eşi bunu yapmaz; başlığında yazar). Tek süreç içindir; çok sunucuda her sunucu bir kez yükler.
- **Bayat-sun, arkada yenile** (stale-while-revalidate): süresi yeni dolmuş değeri hemen döndür, tek bir yenileme
  başlat. Kısa bayatlığın kabul edildiği her yerde en iyisi.
- **Erken yenileme:** süre dolmadan, son %10'luk dilimde rastgele bir istek yenilemeyi tetikler.

Aynı sorunun toplu hâli: dağıtımdan sonra binlerce anahtar **aynı süreyle** yazılırsa hepsinin süresi aynı saniyede
dolar. Süreye rastgele pay (titreme, jitter) ekleyin:

```python calistir
import random
from collections import Counter

rng = random.Random(3)
TTL = 300  # saniye; 10 000 anahtar dağıtımdan hemen sonra aynı anda dolduruldu
sabit = Counter(TTL for _ in range(10_000))
titremeli = Counter(int(TTL * rng.uniform(0.9, 1.1)) for _ in range(10_000))  # ±%10
print(f"sabit TTL    : en kötü saniyede {max(sabit.values()):5} anahtarın süresi doluyor")
print(f"titremeli TTL: en kötü saniyede {max(titremeli.values()):5} anahtarın süresi doluyor")
assert max(titremeli.values()) < max(sabit.values()) / 30
```

```cikti
sabit TTL    : en kötü saniyede 10000 anahtarın süresi doluyor
titremeli TTL: en kötü saniyede   194 anahtarın süresi doluyor
```

## Anahtar tasarımı

- Anahtar, yanıtı değiştiren **her** girdiyi taşır: kiracı, kullanıcı (kişiye özelse), dil, sayfa/süzgeç
  parametreleri, şema sürümü. Örnek: `v3:kiraci:17:urun-listesi:tr:sayfa=2`. Eksik girdi = başkasına yanlış yanıt
  ([Yetkilendirme](../30-arkauc/yetkilendirme.md) → önbellek).
- Önek sürümü (`v3:`) toplu geçersiz kılmanın en ucuz yoludur: şema değişince önek artar, eskiler süreyle ölür.
- **Yokluk önbelleği** (negative caching): "kayıt yok" yanıtını da kısa süre saklayın; yoksa var olmayan anahtarı
  soran her istek (ya da saldırgan) veritabanına gider.
- Boyut sınırı **bayt** olarak düşünülür: tek bir dev değer (10 MB'lık liste) önbelleği boşaltır.

## Tuzaklar

| Belirti                                                              | Neden                                                   | Çözüm                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Kullanıcı başkasının adını/sepetini görüyor                          | Kişiye özel yanıt paylaşılan katmanda, anahtarsız        | `Cache-Control: private`; anahtara kullanıcı/kiracı           |
| Güncelleme yapıldı, eski değer saatlerce görünüyor                   | Sil-ve-doldur yarışı ya da süresiz girdi                | Her girdiye süre; silme işlemden sonra; kira                  |
| Yeni sürüm yayında ama kullanıcılar eski JS'yi çalıştırıyor          | HTML uzun süre önbellekte                               | HTML `no-cache`; yalnız özetli adlı dosyalar uzun süreli      |
| Dağıtımdan hemen sonra veritabanı boğuluyor                          | Bütün süreç içi önbellekler aynı anda boşaldı           | Sırayla dağıtım; açılışta ön yükleme; soğuk yük kapasitesi    |
| Her 5 dakikada bir veritabanı sivri tepe yapıyor                     | Anahtarların süresi aynı anda doluyor                   | Süreye ±%10 titreme                                           |
| Popüler sayfanın süresi dolunca site kilitleniyor                    | Sürü etkisi                                             | Tek uçuş, bayat-sun, erken yenileme                           |
| Önbellek sunucusu çökünce site de çöktü                              | Sistem önbelleksiz yükü hiç taşıyamıyor                 | Soğuk yük testi; önbellek hatasında doğrudan veritabanına düş |
| Sunucular aynı soruya farklı cevap veriyor                           | Her sürecin kendi bayat kopyası                         | Kısa süre ya da paylaşılan önbellek; kritik veride önbellek yok |
| Var olmayan kayıt sorguları veritabanını yoruyor                     | Yokluk önbelleğe alınmıyor                              | Kısa süreli yokluk önbelleği                                  |
| İsabet oranı yüksek ama kazanç yok                                   | Ucuz sorguyu önbelleğe aldınız; asıl yavaş yer başka    | Önce ölç: hangi sorgu toplam süreyi yiyor                      |

## Denetim listesi

- [ ] Her önbellek için yazılı: ne saklanıyor, en çok ne kadar bayat olabilir, kim siliyor.
- [ ] Her girdinin süresi var; süreye titreme eklenmiş.
- [ ] Anahtar kiracı/kullanıcı/dil/sürüm gibi bütün girdileri taşıyor; kişiye özel yanıt paylaşılan katmanda yok.
- [ ] Güncellemede önbellek siliniyor (güncellenmiyor) ve silme işlem bittikten sonra yapılıyor.
- [ ] Sıcak anahtarlar için tek uçuş ya da bayat-sun var.
- [ ] Önbellek boşken (yeniden başlatma, önbellek sunucusu çökmesi) sistem yavaş ama çalışıyor; denendi.
- [ ] İsabet oranı ve ıska sayısı ölçülüyor; önbelleğin kazancı sayıyla biliniyor.
- [ ] HTML `no-cache`, özetli adlı dosyalar uzun süreli; servis çalışanı API yanıtlarını önbelleğe almıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önbellek eklemeden önce şunu yaz: hangi veri, en çok kaç saniye bayat olabilir, hangi
  yazma onu siler. Anahtara kiracı ve kullanıcı kimliğini koy. Her girdiye süre ve ±%10 titreme ekle.
  Güncellemede önbelleği sil, güncelleme. Aynı anahtar için eşzamanlı yüklemeyi teke indir."
- **Modelin tipik hatası:** önbelleği yazıp geçersiz kılmayı unutur; güncellemede silmek yerine yeni değeri
  yazar (yarış); anahtara kullanıcıyı koymaz; süresiz girdi bırakır; "performans için" ilk adım olarak Redis
  ekler ama asıl yavaş sorguya bakmaz.
- **Çıktıda arayın:** `set(` çağrılarının hepsinde süre var mı; her yazma yolunda ilgili `delete` var mı;
  anahtarda `kiraci`/`user` geçiyor mu; önbellek hatası yakalanıp veritabanına düşülüyor mu.
- **Test isteyin:** "Güncelledikten sonra okuma yeni değeri döndürür" ve "iki kullanıcı aynı uca istek atınca
  birbirinin verisini görmez" testleri.

## İlgili

- [Ölçekleme temelleri](olcekleme-temelleri.md) · [Tutarlılık modelleri](tutarlilik-modelleri.md) (bayat okuma ve
  kullanıcıya yansıması) · [Veritabanı ölçekleme](veritabani-olcekleme.md)
- [HTTP temelleri](../30-arkauc/http-temelleri.md) → önbellek başlıkları
- Havuzdaki LRU + süre + tek uçuş: [`kutuphane/ts/src/onbellek.ts`](../../kutuphane/ts/src/onbellek.ts),
  [`kutuphane/py/kutuphane/onbellek.py`](../../kutuphane/py/kutuphane/onbellek.py); veri yapısı olarak LRU:
  [`algoritma/algoritma/veri_yapilari/lru_cache.py`](../../algoritma/algoritma/veri_yapilari/lru_cache.py)
