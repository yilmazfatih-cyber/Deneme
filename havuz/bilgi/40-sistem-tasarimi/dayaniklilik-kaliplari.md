---
baslik: Dayanıklılık kalıpları: zaman aşımı, yeniden deneme, devre kesici, bölme ve yük atma
ozet: Bağımlılık yavaşlayınca ya da çökünce sistemin ayakta kalması; zaman aşımı bütçesi, titremeli yeniden deneme ve bütçesi, yeniden deneme fırtınası, devre kesici, bölmeler, zarif bozulma ve yük atma; benzetimlerle.
etiketler: [dayaniklilik, zaman-asimi, yeniden-deneme, devre-kesici, yuk-atma, mimari]
duzey: ileri
guncellik: 2026-11
---

# Dayanıklılık kalıpları: zaman aşımı, yeniden deneme, devre kesici, bölme ve yük atma

> Bu notu ne zaman okumalı: başka bir servise, veritabanına, ödeme sağlayıcısına ya da dil modeli API'sine çağrı
> yazılırken; "bağımlılık birkaç saniye takıldı, bütün site çöktü" olayından sonra; bir model yeniden deneme
> döngüsü yazdığında.

## Temel fikir

- Arızaların çoğu **çökme** değil **yavaşlama**dır. Yavaş bağımlılık, Little yasası gereği içerideki istek sayısını
  patlatır (L = λ·W) ve bütün işçileri bekletir ([Kapasite tahmini](kapasite-tahmini.md)).
- Her ağ çağrısının bir **zaman aşımı** vardır ve iç katmanın sınırı dış katmanınkinden kısadır. Sınırsız bekleme,
  kesintinin yayılma yoludur.
- Yeniden deneme geçici hatayı gizler ama **yükü çarpar**. Titreme (jitter), bütçe ve tek katmanda deneme olmadan
  yeniden deneme, kısa bir aksaklığı kalıcı bir çöküşe (yeniden deneme fırtınası) çevirir.
- Kalıplar tek bir amaca hizmet eder: **arızayı sınırla**. Zaman aşımı süreyi, devre kesici çağrı sayısını, bölme
  kaynak payını, yük atma kabul edilen işi sınırlar.
- En iyi sonuç çoğu zaman "eksik ama hızlı cevap"tır (zarif bozulma): öneriler gelmezse sayfa önerisiz açılır.

## Karar tablosu

| Durum                                                         | Kalıp                                                      | Neden                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Her dış çağrı                                                 | Zaman aşımı (bağlantı + toplam); son tarihi aşağı taşı      | Sınırsız bekleme işçileri tüketir                     |
| Geçici hata (zaman aşımı, 429, 502/503/504, bağlantı koptu)   | Titremeli üstel geri çekilmeyle 2–3 deneme + bütçe          | Geçici hatayı gizler, yükü sınırlı tutar              |
| Kalıcı hata (400, 401, 403, 404, 422, doğrulama)              | Yeniden deneme yok                                         | Sonuç değişmez; yalnız yük ekler                      |
| Yan etkili çağrı (ödeme, e-posta, sipariş)                    | Yalnız idempotentlik anahtarıyla yeniden dene              | Yoksa çift ödeme ([API tasarımı](../30-arkauc/api-tasarimi.md)) |
| Bağımlılık art arda hata veriyor                              | Devre kesici                                               | Beklemeden başarısız ol; bağımlılığa nefes aldır      |
| Bir özelliğin bağımlılığı ötekileri de kilitliyor             | Bölme (ayrı işçi/bağlantı havuzu)                          | Bozuk özellik yalnız kendini batırır                  |
| Aşırı yük, kapasite yetmiyor                                  | Yük atma: düşük öncelikliyi ve süresi geçmişi reddet       | Herkese yavaş yerine çoğuna hızlı                     |
| Yardımcı veri gelmiyor (öneri, sayaç, avatar)                 | Zarif bozulma: varsayılan/önbellekteki değerle cevap ver   | Asıl iş (kaydet, öde) etkilenmez                      |
| Yanıtın bayatı kabul edilebilir                               | Bağımlılık çökünce son bilinen değeri sun                  | Erişilebilirlik ↔ tazelik bilinçli seçimi             |

## Zaman aşımı bütçesi

Kullanıcı isteğinin bir toplam bütçesi vardır (ör. 2 sn; çoğu zaman önündeki vekilin sınırı). Her alt çağrı kendi
sınırı ile **kalan bütçenin** küçüğünü alır; bütçe bitince iş durur ve eldekiyle cevap verilir:

```python calistir
def isle(son_tarihli: bool, cagrilar: list[tuple[str, float]], butce: float = 2.0) -> tuple[float, list[str]]:
    """Kullanıcı isteğinin toplam bütçesi 2 sn (vekil 2 sn'de keser). Her alt çağrının kendi sınırı 1 sn."""
    saat, sonuc = 0.0, []
    for ad, sure in cagrilar:
        sinir = 1.0
        if son_tarihli:
            kalan = butce - saat - 0.05  # yanıtı yazmak için pay
            if kalan < 0.1:
                sonuc.append(f"{ad}: atlandı")  # zarif bozulma: bu parça olmadan cevap ver
                continue
            sinir = min(sinir, kalan)
        saat += min(sure, sinir)
        sonuc.append(f"{ad}: {'tamam' if sure <= sinir else 'zaman aşımı'}")
    return saat, sonuc


cagrilar = [("profil", 0.9), ("siparisler", 0.9), ("oneriler", 0.9)]  # bağımlılıklar yavaşladı
sabit, sabit_sonuc = isle(False, cagrilar)
son, son_sonuc = isle(True, cagrilar)
print(f"sabit sınırlar : {sabit:.2f} sn {sabit_sonuc} → kullanıcı 2 sn'de gitti, 0,7 sn boşa iş")
print(f"son tarih taşı : {son:.2f} sn {son_sonuc}")
assert sabit > 2.0 and son <= 2.0 and son_sonuc[-1] == "oneriler: zaman aşımı"
```

```cikti
sabit sınırlar : 2.70 sn ['profil: tamam', 'siparisler: tamam', 'oneriler: tamam'] → kullanıcı 2 sn'de gitti, 0,7 sn boşa iş
son tarih taşı : 1.95 sn ['profil: tamam', 'siparisler: tamam', 'oneriler: zaman aşımı']
```

Kurallar:

- Sınırlar dıştan içe küçülür: istemci > yük dengeleyici/vekil > uygulama > veritabanı sorgusu. İçteki daha uzunsa
  dıştaki vazgeçer, içteki boşuna çalışmaya devam eder.
- Son tarih servisler arasında başlıkta taşınır (kalan süre ya da mutlak an); alan taraf onu aşmaz.
- İki ayrı sınır koyun: bağlantı kurma (kısa, ör. 1 sn) ve toplam yanıt.
- Yeniden denemeler de bütçenin içindedir: "3 deneme × 1 sn" bütçesi 2 sn olan bir isteğe sığmaz.

## Yeniden deneme: titreme, bütçe, tek katman

- **Üstel geri çekilme + tam titreme:** n. denemeden önce `rastgele(0, min(üst sınır, taban × 2ⁿ))` bekle. Titreme
  olmazsa kesintiden sonra bütün istemciler aynı anda yeniden dener ve sivri tepe yaratır.
- **`Retry-After`** başlığı varsa ona uyun (bir üst sınırla).
- **Bütçe:** yeniden denemeler toplam isteklerin küçük bir payını (ör. %10) geçemez. Arıza büyüdükçe deneme
  oranı kendiliğinden düşer.
- **Tek katman yeniden dener.** Üç katmanın her biri 3 kez denerse en alttaki servis 4 × 4 × 4 = **64** istek görür.
  Genellikle en dıştaki (istemci) ya da bağımlılığa en yakın katman dener; ötekiler hatayı hemen iletir.

Havuzda hazır gerçekleme (iptal, toplam süre, `Retry-After`, hangi hatada denenir):
[`kutuphane/py/kutuphane/yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py) ve
[TypeScript eşi](../../kutuphane/ts/src/yeniden_dene.ts); dil modeli sağlayıcılarına özel:
[`yz/yz/saglayici/yeniden_dene.py`](../../yz/yz/saglayici/yeniden_dene.py).

## Yeniden deneme fırtınası

Benzetim: saniyede 80 istek gelir, sunucu 100 işler (%80 dolu). 10. ile 15. saniye arasında sunucu durur (ör.
veritabanı yük devri). İstemci 1 saniyede cevap alamazsa vazgeçer ve yeniden dener; sunucu vazgeçilen isteği
bilmez, sırası gelince yine işler:

```python calistir
import random
from collections import deque


def benzet(geri_cekilme: bool, son_tarih: bool, sure_sn: int = 60) -> tuple[list[int], int]:
    """Saniye başına başarılı (zamanında dönen) istek sayısını ve sunucuya gelen toplam isteği döndürür."""
    rng = random.Random(1)
    kuyruk: deque[list] = deque()  # [giriş anı, deneme no, vazgeçildi, işlendi]
    izleme: deque[list] = deque()  # aynı kayıtlar, zaman aşımı sırasıyla
    planli: list[tuple[float, int]] = []  # (yeniden deneme anı, deneme no)
    jeton, basarili, toplam = 10.0, [0] * sure_sn, 0
    for adim in range(sure_sn * 10):  # 100 ms'lik adımlar
        t = adim / 10
        gelen = [1] * 8 + [d for z, d in planli if z <= t]  # 8 yeni istek + zamanı gelen yeniden denemeler
        planli = [(z, d) for z, d in planli if z > t]
        jeton = min(10.0, jeton + 0.8)  # bütçe: her yeni istek 0,1 yeniden deneme hakkı kazandırır
        toplam += len(gelen)
        for deneme in gelen:
            kayit = [t, deneme, False, False]
            kuyruk.append(kayit)
            izleme.append(kayit)
        kapasite = 0 if 10 <= t < 15 else 10
        while kapasite and kuyruk:
            kayit = kuyruk.popleft()
            if kayit[2] and son_tarih:
                continue  # sunucu, son tarihi geçmiş isteği işlemeden atar
            kapasite -= 1
            kayit[3] = True
            basarili[int(t)] += not kayit[2]  # vazgeçilmiş isteği işlemek boşa iştir
        while izleme and izleme[0][0] + 1.0 <= t:  # 1 sn doldu
            kayit = izleme.popleft()
            if kayit[3]:
                continue  # cevap zamanında geldi
            kayit[2] = True  # istemci vazgeçti
            if kayit[1] > 3:
                continue  # deneme hakkı bitti
            if not geri_cekilme:
                planli.append((t, kayit[1] + 1))  # hemen yeniden dene
            elif jeton >= 1:
                jeton -= 1
                planli.append((t + rng.uniform(0, min(8.0, 0.5 * 2 ** kayit[1])), kayit[1] + 1))
    return basarili, toplam


sonuc = {}
for geri, son in ((False, False), (True, False), (False, True), (True, True)):
    b, toplam = benzet(geri, son)
    toparlanma = next((s for s in range(15, 60) if min(b[s:]) >= 75), None)
    sonuc[geri, son] = toparlanma
    ad = f"geri çekilme+bütçe {'var' if geri else 'yok'}, son tarih {'var' if son else 'yok'}"
    ne_zaman = f"{toparlanma - 15:2} sn sonra" if toparlanma else "hiç (fırtına sürüyor)"
    print(f"{ad}: toparlanma {ne_zaman}; sunucuya gelen istek {toplam}")
assert sonuc[False, False] is None  # tetikleyici 5 sn sürdü, çöküş kalıcı oldu
assert sonuc[True, True] is not None and sonuc[True, True] <= 20
```

```cikti
geri çekilme+bütçe yok, son tarih yok: toparlanma hiç (fırtına sürüyor); sunucuya gelen istek 16272
geri çekilme+bütçe var, son tarih yok: toparlanma 29 sn sonra; sunucuya gelen istek 5073
geri çekilme+bütçe yok, son tarih var: toparlanma  0 sn sonra; sunucuya gelen istek 5694
geri çekilme+bütçe var, son tarih var: toparlanma  0 sn sonra; sunucuya gelen istek 4841
```

Okuma:

- Saf yeniden denemede tetikleyici 5 saniye sürdü ama sistem **hiç toparlanmadı**: sunucu, istemcilerin çoktan
  vazgeçtiği istekleri işlerken yeni istekler de zaman aşımına düşüyor ve yeniden deneniyor. Buna yarı kararlı
  çöküş (metastable failure) denir: sebep geçmiştir, çöküş kendini besler. Normalde 4800 olacak istek 16 272'ye çıktı.
- İstemci tarafı çare (geri çekilme + bütçe) yükü sınırlar; ama sunucu birikmiş bayat işi eritene dek (29 sn)
  kimse cevap alamaz.
- Sunucu tarafı çare (son tarihi geçmiş isteği işlememek, sınırlı kuyruk) en hızlısıdır. Gerçekte atmak da biraz
  iş ister (bağlantı, kimlik denetimi); bu yüzden ikisi **birlikte** kullanılır.
- Çıkış yolu çoğu zaman elle yük atmaktır: istemcilerin bir kısmını geri çevirip kuyruğu boşaltmak. Bunun için
  önceden bir anahtar (özellik bayrağı, hız sınırı ayarı) hazır olmalıdır.

## Devre kesici

Bağımlılık art arda hata veriyorsa her isteğin zaman aşımını beklemek hem kullanıcıyı bekletir hem de bağımlılığı
toparlanırken boğar. Devre kesici (circuit breaker) bir eşikten sonra çağrıyı **hiç yapmadan** reddeder, bir süre
sonra tek bir deneme isteği gönderir:

```python calistir
class DevreAcik(Exception):
    """Bağımlılık geçici olarak devre dışı: beklemeden başarısız ol."""


class DevreKesici:
    """kapalı --(art arda `esik` hata)--> açık --(`bekleme` sn)--> yarı açık --(deneme)--> kapalı / açık"""

    def __init__(self, esik: int, bekleme: float, saat) -> None:
        self.esik, self.bekleme, self.saat = esik, bekleme, saat
        self.durum, self.hata, self.acilis = "kapali", 0, 0.0

    def cagir(self, islev):
        if self.durum == "acik":
            if self.saat() - self.acilis < self.bekleme:
                raise DevreAcik("ödeme servisi şu an yanıt vermiyor")
            self.durum = "yari_acik"  # tek bir deneme isteğine izin ver
        try:
            sonuc = islev()
        except Exception:
            self.hata += 1
            if self.durum == "yari_acik" or self.hata >= self.esik:
                self.durum, self.acilis = "acik", self.saat()
            raise
        self.durum, self.hata = "kapali", 0
        return sonuc


saat = [0.0]
bosa_giden = []  # kesinti sırasında servise ulaşıp 2 sn bekleyen çağrılar


def bozuk_servis() -> str:  # 60. saniyeye dek her çağrı 2 sn bekleyip zaman aşımına düşer
    if saat[0] < 60:
        bosa_giden.append(saat[0])
        raise TimeoutError
    return "tamam"


kesici = DevreKesici(esik=5, bekleme=10.0, saat=lambda: saat[0])
hizli_red = 0
for i in range(200):  # 100 sn boyunca her 0,5 sn bir istek
    saat[0] = i * 0.5
    try:
        kesici.cagir(bozuk_servis)
    except DevreAcik:
        hizli_red += 1
    except TimeoutError:
        pass
print(f"kesintide servise giden çağrı {len(bosa_giden)} (kesicisiz 120); toplam boşa bekleme {len(bosa_giden) * 2} sn (kesicisiz 240)")
print(f"beklemeden reddedilen {hizli_red}; servis düzelince durum: {kesici.durum}")
assert len(bosa_giden) == 10 and kesici.durum == "kapali"
```

```cikti
kesintide servise giden çağrı 10 (kesicisiz 120); toplam boşa bekleme 20 sn (kesicisiz 240)
beklemeden reddedilen 114; servis düzelince durum: kapali
```

- Bedeli: servis düzeldikten sonra da kesici `bekleme` süresi kadar reddetmeye devam eder (yukarıda 4 istek).
- Kesici **bağımlılık başına** kurulur; tek kesici bütün dış çağrıları kesmez.
- Açıkken ne yapılacağı ürün kararıdır: önbellekteki değer, varsayılan, "şu an yapılamıyor, sonra deneyin"
  iletisi ya da işi kuyruğa alma.
- Çok süreçte her sürecin kendi kesicisi vardır; yarı açık durumda aynı anda tek deneme isteği gönderilmelidir.

## Bölmeler (bulkhead)

Geminin su geçirmez bölmeleri gibi: bir bağımlılığa giden çağrılar ayrı bir işçi ya da bağlantı havuzunu kullanır;
o bağımlılık takılınca yalnız kendi havuzu dolar. Benzetim: arama bağımlılığı bozuldu, her arama 5 sn takılıyor;
ödeme sağlıklı:

```python calistir
from collections import deque

SURE_MS = {"arama": 5_000, "odeme": 50}  # arama bağımlılığı bozuldu: her istek 5 sn takılıyor
ARALIK_MS = {"arama": 50, "odeme": 20}  # saniyede 20 arama, 50 ödeme isteği


def benzet(havuz_boyu: dict[str, int], havuz_of: dict[str, str]) -> dict[str, float]:
    """Her havuzun işçileri ve FIFO kuyruğu var; kuyrukta 1 sn'den çok bekleyen istek başarısız sayılır."""
    bitisler = {h: [] for h in havuz_boyu}
    kuyruk = {h: deque() for h in havuz_boyu}
    basari = {t: 0 for t in SURE_MS}
    toplam = {t: 0 for t in SURE_MS}
    for t in range(0, 30_000, 10):  # 30 sn, 10 ms adım
        for tur, aralik in ARALIK_MS.items():
            if t % aralik == 0:
                toplam[tur] += 1
                kuyruk[havuz_of[tur]].append((tur, t))
        for h, boyut in havuz_boyu.items():
            bitisler[h] = [b for b in bitisler[h] if b > t]
            while len(bitisler[h]) < boyut and kuyruk[h]:
                tur, gelis = kuyruk[h].popleft()
                if t - gelis > 1_000:
                    continue  # istemci vazgeçmiş
                bitisler[h].append(t + SURE_MS[tur])
                basari[tur] += 1
    return {tur: basari[tur] / toplam[tur] for tur in SURE_MS}


ortak = benzet({"ortak": 20}, {"arama": "ortak", "odeme": "ortak"})
bolmeli = benzet({"arama": 5, "odeme": 15}, {"arama": "arama", "odeme": "odeme"})
print(f"ortak havuz (20 işçi): arama %{ortak['arama'] * 100:.0f}, ödeme %{ortak['odeme'] * 100:.0f} başarılı")
print(f"bölmeli (5 + 15)     : arama %{bolmeli['arama'] * 100:.0f}, ödeme %{bolmeli['odeme'] * 100:.0f} başarılı")
assert ortak["odeme"] < 0.5 and bolmeli["odeme"] > 0.99
```

```cikti
ortak havuz (20 işçi): arama %19, ödeme %35 başarılı
bölmeli (5 + 15)     : arama %5, ödeme %100 başarılı
```

Bozuk arama zaten bozuktur; bölme onu kurtarmaz ama **ödemeyi** kurtarır. Tek süreçli bir uygulamada bölme
basitçe "bu bağımlılığa aynı anda en çok N çağrı" sınırıdır (semafor); havuzdaki
[`kuyruk`](../../kutuphane/py/kutuphane/kuyruk.py) modülünün eşzamanlılık sınırı bu iş için kullanılabilir.
Pahalı işler (PDF, dil modeli) için ayrı işçi süreci de bir bölmedir.

## Zarif bozulma ve yük atma

| Önce atılacak                                 | Korunacak                              |
| --------------------------------------------- | -------------------------------------- |
| Analitik ve izleme olayları (örneklenerek)    | Giriş, oturum                          |
| Öneriler, "benzer ürünler", sayaçlar          | Kaydetme, ödeme, sipariş               |
| Arka plan yenilemeleri, ön yüklemeler         | Kullanıcının az önce başlattığı iş     |
| Botlar, kimliksiz ve hız sınırını aşan istekler | Ücretli/kurumsal kiracıların istekleri |
| Süresi geçmiş (istemcinin vazgeçtiği) istekler | —                                     |

- Yük atma kararı **erken** verilir (kuyruğa almadan, pahalı işten önce) ve ucuz olmalıdır.
- Reddedilen isteğe 503 ya da 429 + `Retry-After` dönülür; istemci titremeli geri çekilir.
- Her bozulma kipi ölçülür ve panoda görünür ("öneriler kapalı: 12 dk"); yoksa geçici çare kalıcı olur.

## Tuzaklar

| Belirti                                                        | Neden                                                      | Çözüm                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Bağımlılık takılınca bütün site duruyor                        | Zaman aşımı yok ya da çok uzun; işçiler tükendi            | Her çağrıya sınır; bölme                                 |
| Kısa kesintiden sonra sistem saatlerce toparlanmıyor           | Yeniden deneme fırtınası                                   | Geri çekilme + titreme + bütçe; son tarihi geçmişi atma  |
| Kesintiden sonra düzenli aralıklarla sivri tepeler             | Titremesiz yeniden deneme: herkes aynı anda deniyor        | Tam titreme                                              |
| En alttaki servis 64 kat yük görüyor                           | Her katman ayrı yeniden deniyor                            | Tek katman dener; ötekiler hatayı iletir                 |
| Ödeme iki kez çekildi                                          | Yan etkili çağrı anahtarsız yeniden denendi                | İdempotentlik anahtarı; yoksa yeniden deneme yok         |
| Kullanıcı hata gördü ama iş arkada sürüyor ve bitiyor          | İç sınır dış sınırdan uzun                                 | Sınırlar dıştan içe küçülür; son tarih taşınır           |
| 404/400 hatası dakikalarca yeniden deneniyor                   | Kalıcı hata geçici sanıldı                                 | Yalnız geçici hata kodlarını dene                        |
| Devre kesici hiç açılmıyor ya da hep açık                      | Eşik/bekleme ölçümsüz seçildi; tek kesici her şeye          | Bağımlılık başına kesici; durumu panoda                  |
| Bozulma kipi aylar sonra hâlâ açık                             | Görünür değil                                              | Ölçüt + uyarı                                            |

## Denetim listesi

- [ ] Her ağ çağrısında bağlantı ve toplam zaman aşımı var; iç sınırlar dıştakilerden kısa.
- [ ] İstek bütçesi (son tarih) alt çağrılara taşınıyor; bütçe bitince eldekiyle cevap veriliyor.
- [ ] Yeniden deneme yalnız geçici hatalarda, titremeli üstel geri çekilmeyle, en çok 2–3 kez ve bir bütçeyle.
- [ ] Yan etkili çağrılar yalnız idempotentlik anahtarıyla yeniden deneniyor.
- [ ] Zincirde yalnız bir katman yeniden deniyor.
- [ ] Kritik bağımlılıklar için devre kesici; açıkken ne olacağı yazılı.
- [ ] Yavaşlayabilecek bağımlılıklar ayrı havuz ya da eşzamanlılık sınırıyla ayrılmış.
- [ ] Aşırı yükte ne atılacağı ve neyin korunacağı yazılı; atma anahtarı hazır.
- [ ] Bir bağımlılığı yapay olarak yavaşlatıp (ör. 5 sn gecikme) sistemin davranışı denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu dış çağrıya 1 sn bağlantı, 3 sn toplam zaman aşımı koy. Yalnız zaman aşımı, 429 ve
  502/503/504'te en çok 2 kez yeniden dene; titremeli üstel geri çekilme ve `Retry-After` için
  `kutuphane/yeniden_dene` modülünü kullan. Yan etkili çağrıda idempotentlik anahtarı gönder. Bağımlılık
  yanıt vermezse şu varsayılanla cevap ver: …"
- **Modelin tipik hatası:** zaman aşımı koymaz (kütüphanelerin çoğunda varsayılan sınırsızdır ya da çok uzundur);
  `while True` ile sabit aralıklı, titremesiz yeniden dener; her hatayı (400 dahil) yeniden dener; ödeme gibi
  yan etkili çağrıyı anahtarsız yeniden dener; aynı çağrıyı hem istemcide hem sunucuda yeniden dener.
- **Çıktıda arayın:** `timeout` parametresi olmayan HTTP/veritabanı çağrısı; `sleep(` sabit değerle döngü içinde;
  `except Exception` ile her şeyi yeniden deneyen blok; yeniden denenen POST'ta anahtar başlığı.
- **Test isteyin:** sahte saatle "bağımlılık 5 sn takılınca istek 3 sn içinde varsayılanla döner" ve "404'te
  yeniden deneme yok" testleri.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) (Little yasası) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) (geri basınç,
  ölü mektup) · [Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) · [Gözlemlenebilirlik](gozlemlenebilirlik.md)
- Yöntem düzeyi ("ne ters gidebilir" listesi, geri alma planı): [Güvenilirlik düşüncesi](../00-yontem/guvenilirlik-dusuncesi.md) ·
  istemci başına sınır: [Hız sınırı ve kötüye kullanım](../30-arkauc/hiz-siniri-ve-kotuye-kullanim.md)
- Havuzdaki gerçeklemeler: [`kutuphane/ts/src/yeniden_dene.ts`](../../kutuphane/ts/src/yeniden_dene.ts),
  [`kutuphane/ts/src/zamanlama.ts`](../../kutuphane/ts/src/zamanlama.ts) (`withTimeout`),
  [`kutuphane/py/kutuphane/hiz_siniri.py`](../../kutuphane/py/kutuphane/hiz_siniri.py) (jeton kovası);
  eşitleme motorunun geri çekilmesi: [`uygulama/shared/src/replica.ts`](../../uygulama/shared/src/replica.ts) → `syncBackoffMs`
