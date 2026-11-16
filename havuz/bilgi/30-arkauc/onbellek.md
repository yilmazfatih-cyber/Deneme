---
baslik: Önbellek: neyi, nerede, ne kadar ve nasıl geçersiz kılmalı
ozet: Önbellek eklemeden önce ölçmek, doğru katmanı ve süreyi seçmek, geçersiz kılma stratejileri, sürü etkisi, negatif önbellek ve kişisel veriyle zehirlenmeyi önlemek; çalışan örneklerle.
etiketler: [onbellek, performans, http, eszamanlilik]
duzey: orta
guncellik: 2026-11
---

# Önbellek: neyi, nerede, ne kadar ve nasıl geçersiz kılmalı

> Bu notu ne zaman okumalı: bir sayfa ya da uç yavaş olduğunda ve biri "önbellek ekleyelim" dediğinde; kullanıcı
> eski veriyi ya da **başkasının** verisini gördüğünde; önbellek süresi dolar dolmaz veritabanı yükü tavan
> yaptığında.

## Temel fikir

Önbellek, verinin **eskiyebilen bir kopyasıdır**. Hızı bedavaya vermez; karşılığında dört dert getirir: eski veri
gösterme, geçersiz kılma karmaşası, süre dolunca topluca gelen yük (sürü etkisi) ve yanlış anahtarla başkasının
verisini sunma. Bu yüzden sıra şudur:

1. **Ölçün:** hangi sorgu yavaş, dakikada kaç kez çağrılıyor, aynı sonuç kaç kez yeniden hesaplanıyor?
2. **Kökü düzeltin:** eksik dizin, N+1 sorgu, gereksiz veri çekme ([Veri erişim katmanı](veri-erisim-katmani.md)).
   Önbellek bunları saklar ama çözmez.
3. Hâlâ gerekiyorsa her önbellek için yazılı olarak şunları belirleyin: **anahtar** (yanıtı değiştiren her şey
   anahtarda mı), **süre** (en çok ne kadar eski olabilir), **geçersiz kılma** (veri değişince ne olur),
   **önbellek yokken** davranış (önbellek çökerse sistem ayakta kalır mı).

## Karar tablosu: neyi, nerede, ne kadar

| Veri                                                           | Nerede                                  | Süre                    | Not                                              |
| -------------------------------------------------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------ |
| Özetli adlı statik dosya (`app.3f9a1c.js`)                     | Tarayıcı + CDN                          | 1 yıl, `immutable`      | Ad içerikle değişir                              |
| `index.html`, servis çalışanı                                  | Tarayıcı, her açılışta sorarak          | `no-cache` + ETag       | Yeni sürüm hemen görünsün                        |
| Herkese açık, birkaç dakika eskiyebilir (katalog, döviz kuru)  | CDN/ters vekil ya da uygulama belleği   | 30 sn – 5 dk            | Süreyi ürün belirler                             |
| Pahalı ama kişisel olmayan hesap (günlük rapor, öneri listesi) | Uygulama belleği ya da ortak önbellek   | Dakikalar               | Tek uçuş + süre titremesi (aşağıda)              |
| Dış API yanıtı (ücretli, kotalı)                               | Uygulama                                | Sağlayıcının izni kadar | Sağlayıcının koşullarına bakın                   |
| Kullanıcıya özel veri                                          | Çoğu zaman **hiç**; gerekirse anahtarda kullanıcı | Kısa          | Zehirlenme riski                                 |
| Yetki, bakiye, stok, fiyatın ödeme anındaki değeri             | **Önbelleğe alınmaz**                   | —                       | Eski değer = yanlış karar                        |

| Katman                               | Artı                                    | Eksi                                                             |
| ------------------------------------ | --------------------------------------- | ---------------------------------------------------------------- |
| HTTP (tarayıcı, CDN)                 | Sunucuya istek bile gelmez              | Gönderilen yanıt geri alınamaz; kişisel veride en tehlikelisi    |
| Süreç belleği (bir sözlük, LRU)      | En hızlı, kurulum yok                   | Her kopyada ayrı ve tutarsız; yeniden başlayınca boş; bellek yer |
| Ortak önbellek (Redis gibi)          | Kopyalar arasında ortak                 | Ağ gidiş-dönüşü, ayrı servis, çökerse ne olacağı tasarlanmalı    |

## Geçersiz kılma

| Strateji                                  | Ne zaman                                        | Dikkat                                                          |
| ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Yalnız süre (TTL)                         | Eskilik süresi kabul edilebiliyor               | En basit ve en güvenli; en kötü eskilik = süre                  |
| Yazınca sil                               | Kullanıcı değişikliğini hemen görmeli           | **İşlem kaydedildikten sonra** silin; ayrıca kısa süre koyun    |
| Sürümlü anahtar (`urun:42:v7`)            | Kaydın sürüm alanı zaten var                    | Eski anahtarlar süreyle kendiliğinden düşer                     |
| Olayla (değişiklik yayını)                | Çok kopya, çok önbellek                         | Olay kaybolursa eski veri kalır → yine süre koyun               |

"Önce sil, sonra kaydet" sırası yanlıştır: silmeyle kayıt arasında gelen okuma, eski değeri veritabanından okuyup
önbelleğe **yeniden** yazar; sonra kimse silmez. Doğru sıra: kaydet → sil; güvenlik ağı olarak süre.

Okuduğunu-yazdığını-görme (read-your-writes): kullanıcı profilini güncelleyip sayfayı yenilediğinde eski hâli
görmemeli. Yazınca silin ya da yazan kullanıcının okumasını önbellekten geçirmeyin.

## Süreli önbellek ve negatif önbellek

Saat dışarıdan verilir ki test zamanı ileri sarabilsin. "Kayıt yok" sonucu da kısa süre saklanır: bir bot olmayan
kimlikleri sırayla isterse her istek veritabanına gitmesin.

```python calistir
YOK = object()  # "kayıt yok" bilgisini de saklayabilmek için işaret


class SureliOnbellek:
    def __init__(self, saat, sure: float, yok_suresi: float):
        self.saat, self.sure, self.yok_suresi = saat, sure, yok_suresi
        self.veri: dict[str, tuple[float, object]] = {}

    def getir(self, anahtar: str, yukle):
        simdi = self.saat()
        kayit = self.veri.get(anahtar)
        if kayit and kayit[0] > simdi:
            return None if kayit[1] is YOK else kayit[1]
        deger = yukle(anahtar)
        sure = self.sure if deger is not None else self.yok_suresi  # olmayan kayıt KISA süre
        self.veri[anahtar] = (simdi + sure, YOK if deger is None else deger)
        return deger

    def sil(self, anahtar: str) -> None:  # yazma kaydedildikten SONRA çağrılır
        self.veri.pop(anahtar, None)


zaman = [0.0]
db = {"urun:1": "Simit 15 TL"}
okuma: list[str] = []


def yukle(anahtar):
    okuma.append(anahtar)
    return db.get(anahtar)


c = SureliOnbellek(lambda: zaman[0], sure=60, yok_suresi=5)
assert c.getir("urun:1", yukle) == "Simit 15 TL"
assert c.getir("urun:1", yukle) == "Simit 15 TL" and okuma == ["urun:1"]  # ikincisi önbellekten
db["urun:1"] = "Simit 17,50 TL"  # fiyat değişti ama önbellek silinmedi
assert c.getir("urun:1", yukle) == "Simit 15 TL"  # 60 sn boyunca ESKİ fiyat
zaman[0] = 61
assert c.getir("urun:1", yukle) == "Simit 17,50 TL"  # süre doldu, tazelendi
for _ in range(100):  # bir bot olmayan kaydı 100 kez istiyor
    assert c.getir("urun:999", yukle) is None
assert okuma.count("urun:999") == 1  # negatif önbellek: veritabanına 1 kez gidildi
db["urun:999"] = "Poğaça 20 TL"
c.sil("urun:999")  # kayıt oluşunca negatif kaydı da silin; yoksa 5 sn "yok" denir
assert c.getir("urun:999", yukle) == "Poğaça 20 TL"
print("tamam")
```

```cikti
tamam
```

Hazır, iş parçacığı güvenli LRU + süre önbelleği: [`kutuphane/py/kutuphane/onbellek.py`](../../kutuphane/py/kutuphane/onbellek.py)
(TypeScript eşi `kutuphane/ts/src/onbellek.ts`). Dikkat: Python sürümünün `get_or_set` işlevi eşzamanlı
yüklemeleri teke indirmez (belgesinde yazar); sürü etkisine karşı aşağıdaki kalıp gerekir.

## Sürü etkisi (cache stampede)

Popüler bir anahtarın süresi dolduğu anda gelen istekler hep birlikte "yok" görür ve hepsi birden pahalı sorguyu
çalıştırır. Veritabanı tam önbelleğin korumak istediği anda çöker.

```python calistir
import threading
import time

yukleme = {"saf": 0, "tek_ucus": 0}


def pahali_sorgu(tur: str) -> str:
    yukleme[tur] += 1  # gerçekte saniyeler süren rapor sorgusu
    time.sleep(0.1)
    return "rapor"


class SafOnbellek:
    def __init__(self):
        self.veri = {}

    def getir(self, anahtar, yukle):
        if anahtar not in self.veri:  # 20 istek aynı anda "yok" görür, 20'si de yükler
            self.veri[anahtar] = yukle()
        return self.veri[anahtar]


class TekUcusOnbellek:  # aynı anahtar için tek yükleme; ötekiler onu bekler
    def __init__(self):
        self.veri, self.kilitler, self.ana_kilit = {}, {}, threading.Lock()

    def getir(self, anahtar, yukle):
        if anahtar in self.veri:
            return self.veri[anahtar]
        with self.ana_kilit:
            kilit = self.kilitler.setdefault(anahtar, threading.Lock())
        with kilit:
            if anahtar not in self.veri:  # kilidi bekleyen, girince bir daha bakar
                self.veri[anahtar] = yukle()
        return self.veri[anahtar]


def sina(onbellek, tur: str) -> None:
    engel = threading.Barrier(20)

    def istek():
        engel.wait()  # önbellek süresi tam doldu, 20 istek aynı anda geldi
        assert onbellek.getir("gunluk-rapor", lambda: pahali_sorgu(tur)) == "rapor"

    ipler = [threading.Thread(target=istek) for _ in range(20)]
    for ip in ipler:
        ip.start()
    for ip in ipler:
        ip.join()


sina(SafOnbellek(), "saf")
sina(TekUcusOnbellek(), "tek_ucus")
assert yukleme["saf"] > 1 and yukleme["tek_ucus"] == 1
print("tek uçuş: 1 yükleme")
```

```cikti
tek uçuş: 1 yükleme
```

Öteki önlemler:

- **Süre titremesi (jitter):** aynı anda doldurulan binlerce anahtar aynı anda dolmasın; süreye rastgele ±%10.
- **Bayatken sun, arkada tazele (stale-while-revalidate):** süre dolunca eski değeri hemen döndür, tek bir arka
  plan işi tazelesin. Kullanıcı hiç beklemez; eskilik bir tazeleme süresi kadar uzar.
- **Ortak önbellekte tek uçuş:** kilit de ortak olmalı (kısa süreli bir "yükleniyor" anahtarı); süreç içi kilit
  yalnız kendi kopyasını korur.
- **Önbellek çökerse:** bütün trafik veritabanına iner. Veritabanının önünde eşzamanlılık sınırı ya da hız sınırı
  tutun; önbelleğe bağlanamayınca isteği hızla başarısız etmek yerine veritabanından okuyun ama sınırlı sayıda.

## Önbelleği kişisel veriyle zehirlemek

En pahalı önbellek hatası eski veri değil, **başkasının verisini** göstermektir.

```python calistir
onbellek: dict = {}


def hesap_sayfasi(kullanici: str) -> str:
    return f"{kullanici}: bakiye 1.250 TL"


def isle_yanlis(adres: str, kullanici: str) -> str:  # anahtar yalnız adres
    if adres not in onbellek:
        onbellek[adres] = hesap_sayfasi(kullanici)
    return onbellek[adres]


def isle(adres: str, kullanici: str, dil: str) -> str:  # yanıtı değiştiren HER şey anahtarda
    anahtar = (adres, kullanici, dil)
    if anahtar not in onbellek:
        onbellek[anahtar] = hesap_sayfasi(kullanici)
    return onbellek[anahtar]


assert isle_yanlis("/hesabim", "ayse").startswith("ayse")
assert isle_yanlis("/hesabim", "burak").startswith("ayse")  # Burak, Ayşe'nin bakiyesini gördü
assert isle("/hesabim", "burak", "tr").startswith("burak")
print("tamam")
```

```cikti
tamam
```

- Anahtar, yanıtı değiştiren her şeyi içerir: kullanıcı, kiracı, rol (yönetici başka görüyorsa), dil, para birimi.
- HTTP katmanında kişisel yanıt `Cache-Control: no-store` ya da `private` taşır; CDN'de API yolları önbellek
  dışıdır. `Set-Cookie` taşıyan yanıt paylaşılan önbelleğe girmemelidir.
- **Önbellek aldatması (web cache deception):** CDN "`.css` ile biteni önbelleğe al" kuralıyla çalışıyorsa
  saldırgan kurbanı `/hesabim/x.css` adresine yönlendirir; uygulama bunu `/hesabim` gibi yanıtlarsa kişisel sayfa
  herkese açık önbelleğe girer. Önlem: CDN yalnız gerçek statik klasörü (`/assets/`) önbelleğe alsın; uygulama
  bilinmeyen uzantılı adrese 404 versin (havuzdaki sunucu böyle yapar: [`static.ts`](../../uygulama/api/src/http/static.ts)).
- Havuzdaki API her yanıta `Cache-Control: no-store` ekler ([`securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts)).

## Tuzaklar

| Belirti                                                       | Neden                                              | Çözüm                                                          |
| ------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Kullanıcı başkasının adını/bakiyesini gördü                   | Anahtarda kullanıcı yok ya da CDN kişisel yanıtı sakladı | Anahtara kullanıcı/kiracı; `no-store`/`private`          |
| Değişiklik "bazen" hiç görünmüyor                             | Silme kayıttan önce yapıldı; okuma eskiyi geri yazdı | Kaydet → sil; ayrıca süre                                    |
| Kullanıcı kaydettiği değişikliği görmüyor                     | Yazan da önbellekten okuyor                        | Yazınca silin                                                  |
| Saat başı veritabanı yükü tavan yapıyor                       | Anahtarlar aynı anda doluyor (sürü etkisi)         | Tek uçuş, süre titremesi, bayatken sun                         |
| Önbellek çökünce bütün site çöktü                             | Veritabanı önbelleksiz yükü kaldırmıyor            | Önbelleksiz davranışı tasarlayın ve sınayın                    |
| Silinen ürün hâlâ listeleniyor                                | Liste önbelleği silmede temizlenmiyor              | Liste anahtarlarını da silin ya da kısa süre                   |
| Yeni açılan kayıt birkaç saniye "bulunamadı"                  | Negatif önbellek oluşturmada silinmedi             | Oluşturunca negatif kaydı silin                                |
| Bellek sürekli büyüyor                                        | Sınırsız sözlük, süresi dolanlar silinmiyor        | Boyut sınırlı LRU + süre                                       |
| Kopyalar farklı veri gösteriyor                               | Süreç içi önbellek, yazınca yalnız bir kopya sildi | Ortak önbellek ya da kısa süre                                 |
| Önbellek eklendi ama hız değişmedi                            | Sorun önbellenen yerde değildi                     | Önce ölçün; isabet oranını izleyin                             |

## Denetim listesi

- [ ] Önbellekten önce yavaşlığın nedeni ölçüldü; dizin/N+1 düzeltmesi denendi.
- [ ] Her önbellek için anahtar, süre, geçersiz kılma ve "önbellek yokken" davranışı yazılı.
- [ ] Anahtar kullanıcı/kiracı/rol/dil gibi yanıtı değiştiren her şeyi içeriyor.
- [ ] Kişisel API yanıtlarında `no-store` (ya da bilinçli `private`); CDN API yollarını saklamıyor.
- [ ] Yazmadan sonra silme işlem kaydedildikten sonra yapılıyor; her anahtarın bir süresi var.
- [ ] Popüler anahtarlarda tek uçuş ya da bayatken sun; süreye titreme eklendi.
- [ ] Negatif önbellek kısa süreli ve oluşturmada siliniyor.
- [ ] Boyut sınırı var; isabet oranı ve bellek kullanımı izleniyor.
- [ ] Yetki, bakiye, stok gibi karar verileri önbellekten okunmuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önbellek eklemeden önce hangi sorgunun yavaş olduğunu ölçen bir not yaz. Önbellek
  gerekiyorsa: anahtar şu alanları içersin …, süre … sn, yazma işlemi kaydedildikten sonra anahtarı sil, aynı anahtar
  için eşzamanlı yüklemeyi teke indir. Kişisel yanıta `Cache-Control: no-store`."
- **Tipik hatalar:** anahtara kullanıcıyı koymamak; süresiz sözlük; silmeyi işlemden önce yapmak; önbelleği
  yetki kararında kullanmak; `public, max-age` başlığını kişisel uca yazmak; önbelleği N+1'i gizlemek için
  kullanmak.
- **Çıktıda arayın:** `cache.set(` / `Map` kullanılan yerlerde anahtarın içeriği; `max-age` olan yanıtların
  kişisel veri taşıyıp taşımadığı; `delete`/`invalidate` çağrısının işlem bloğunun içinde mi dışında mı olduğu.
- **Test isteyin:** "iki farklı kullanıcı aynı adresi ister, ikisi kendi verisini görür" ve "güncellemeden sonra
  okuma yeni değeri döndürür".

## İlgili

- [HTTP temelleri](http-temelleri.md) (önbellek başlıkları) · [Veri erişim katmanı](veri-erisim-katmani.md) (N+1) ·
  [Yetkilendirme](yetkilendirme.md) (kiracı yalıtımı) · [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md)
- Çalışan sunucu: statik dosyaların önbellek kuralları [`uygulama/api/src/http/static.ts`](../../uygulama/api/src/http/static.ts),
  gerekçeleri [`api/KARARLAR.md`](../../uygulama/api/KARARLAR.md) → "Yayın".
