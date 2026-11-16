---
baslik: Dağıtık sistem yanılgıları: ağ, saat, bölünme ve uzlaşma
ozet: Dağıtık hesaplamanın sekiz yanılgısı ve her birinin küçük bir üründeki somut sonucu; saatlere neden güvenilmez, bölünme senaryoları, çit jetonu, çoğunluk ve uzlaşmanın neden zor olduğu; çalışan örneklerle.
etiketler: [dagitik-sistem, ag, saat, bolunme, uzlasma, raft]
duzey: ileri
guncellik: 2026-11
---

# Dağıtık sistem yanılgıları: ağ, saat, bölünme ve uzlaşma

> Bu notu ne zaman okumalı: iki süreç, iki makine ya da istemci ile sunucu arasında ağ üzerinden veri taşıyan
> her tasarımda; sıralama ya da "son yazan kazanır" için zaman damgası kullanılırken; kilit, lider seçimi ya da
> "aynı işi tek makine yapsın" gereksinimi çıktığında; bir model kendi uzlaşma algoritmasını yazmayı önerdiğinde.

## Temel fikir

- Tek süreçte bir işlev çağrısının iki sonucu vardır: döndü ya da hata verdi. Ağ üzerindeki çağrının **üçüncü**
  sonucu vardır: **bilinmiyor** (zaman aşımı). İstek gitti mi, işlendi mi, yanıt mı kayboldu: bilemezsiniz.
  Dağıtık sistem tasarımının çoğu bu üçüncü durumu yönetmektir.
- Makinelerin saatleri **aynı değildir** ve **geri gidebilir**. Makineler arası olay sırası duvar saatiyle kurulmaz.
- Ağ bölünür (partition): iki taraf da çalışır ama birbirini görmez. Her taraf ötekini "ölü" sanabilir.
- Birden çok makinenin bir şeyde **anlaşması** (lider kim, kilit kimde, son değer ne) zordur; çözümü bilinen
  algoritmalardır (Raft, Paxos). Kendiniz yazmayın; hazır, sınanmış bir parça kullanın ya da tek yazara indirin.

## Sekiz yanılgı ve sahadaki karşılıkları

| Yanılgı                     | Küçük bir üründe somut sonucu                                               | Önlem                                                         |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Ağ güvenilirdir             | Ödeme isteği gitti, yanıt kayboldu; istemci yeniden denedi: çift ödeme       | Zaman aşımı + idempotentlik anahtarı; "bilinmiyor" durumunu sorgula |
| Gecikme sıfırdır            | Döngüde 100 API çağrısı: yerelde 50 ms, üretimde 5 sn (N+1 ağ üstünde)       | Toplu çağrı, birleştirme, paralel istek ([Kapasite tahmini](kapasite-tahmini.md)) |
| Bant genişliği sonsuzdur    | Mobil uygulama her açılışta 5 MB JSON indiriyor; kotalı kullanıcı kaçıyor    | Sayfalama, yalnız değişeni gönderme (imleç), sıkıştırma        |
| Ağ güvenlidir               | Servisler arası trafik şifresiz; iç ağa erişen biri oturum çerezini okur     | Her yerde TLS; servisler arası kimlik ([Kimlik ve yetki mimarisi](kimlik-ve-yetki-mimarisi.md)) |
| Topoloji değişmez           | Sabit IP yazılmış; sunucu taşınınca her şey koptu                            | DNS adı, yapılandırmayla verilen adres, sağlık denetimi        |
| Tek bir yönetici vardır     | E-posta sağlayıcısı sınırları değiştirdi, gönderimler sessizce düştü          | Dış bağımlılığın hatasını ölç ve uyar; sözleşmeyi belgele      |
| Taşıma maliyeti sıfırdır    | Bulutta bölgeler arası ve dışarı veri çıkışı faturası depolamayı geçti       | Kapasite hesabında çıkış trafiği satırı; CDN                   |
| Ağ türdeştir                | Bir operatörde WebSocket kesiliyor, şirket vekili SSE'yi tamponluyor          | Geri düşüş (yoklama), farklı ağlarda deneme                    |

## "Bilinmiyor" durumu

| Ne oldu                                  | İstemcinin gördüğü | Doğru davranış                                                    |
| ---------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| İstek sunucuya ulaşmadı                  | Zaman aşımı        | Yeniden göndermek güvenli                                         |
| İşlendi, yanıt yolda kayboldu            | Zaman aşımı        | Yeniden gönderim **yan etkiyi yineler**: idempotentlik anahtarı şart |
| İşleniyor, yavaş                         | Zaman aşımı        | Yeniden gönderim yükü artırır; durum sorgulanabilir olmalı         |

Üçünü istemci ayırt edemez; bu yüzden yan etkili her istek idempotent tasarlanır
([API tasarımı](../30-arkauc/api-tasarimi.md) → idempotentlik anahtarı). Havuzdaki eşitleme her değişikliğe cihaz
içinde artan bir numara verir; yanıt kaybolup aynı değişiklik yeniden gelirse sunucu atlar
([`ESITLEME.md`](../../uygulama/docs/ESITLEME.md) → "Onay ve yinelenen gönderim").

## Saatlere güvenmemek

| Ne ölçüyorsunuz                                 | Hangi saat                                         | Neden                                            |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Süre, zaman aşımı, hız sınırı penceresi         | Monotonik saat (`time.monotonic`, `performance.now`) | Duvar saati ayarlanınca geri/ileri atlar        |
| Kullanıcıya gösterilecek olay zamanı            | UTC duvar saati, **sunucuda** damgalanmış          | Cihaz saati elle değiştirilebilir                |
| Makineler arası olay sırası                     | Sunucunun verdiği sıra numarası ya da mantıksal saat | Saatler arası kayma milisaniyeden dakikalara    |
| Belirteç süresi (`exp`)                          | Duvar saati + birkaç saniyelik kayma payı           | Kayma kaçınılmaz                                 |
| "Her gün 09:00'da"                              | Yerel saat dilimi (`Europe/Istanbul`) ile takvim    | UTC 09:00 Türkiye'de 12:00'dir                   |

"Son yazan kazanır" kuralı cihaz saatiyle uygulanırsa saati geri olan cihaz **her zaman kaybeder**, saati ileri
olan **her zaman kazanır**:

```python calistir
# İki cihaz aynı notu düzenliyor. Telefonun saati 5 dk geride (elle ayarlanmış).
# (gerçek an sn, cihaz, cihazın damgası, değer) — telefon 1 dk SONRA yazdı ama damgası 4 dk önceyi gösteriyor
duzenlemeler = [(100, "bilgisayar", 100, "Süt al"), (160, "telefon", 160 - 300, "Süt ve ekmek al")]
kazanan = max(duzenlemeler, key=lambda d: d[2])[3]
assert kazanan == "Süt al"  # YANLIŞ: cihaz saatine göre "son yazan kazanır" son düzenlemeyi sildi


class Cihaz:
    """Lamport saati: her yazmada sayaç artar; başkasının yazmasını görünce sayaç onu geçer."""

    def __init__(self, ad: str) -> None:
        self.ad, self.sayac = ad, 0

    def yaz(self, deger: str) -> tuple[int, str, str]:
        self.sayac += 1
        return (self.sayac, self.ad, deger)  # (sayaç, cihaz adı) çifti tam sıra verir

    def gor(self, damga: tuple[int, str, str]) -> None:
        self.sayac = max(self.sayac, damga[0])


bilgisayar, telefon = Cihaz("bilgisayar"), Cihaz("telefon")
d1 = bilgisayar.yaz("Süt al")
telefon.gor(d1)  # telefon eşitledi, bilgisayarın notunu gördü, üstüne yazdı
d2 = telefon.yaz("Süt ve ekmek al")
assert max(d1, d2)[2] == "Süt ve ekmek al"  # DOĞRU: "önce gördü, sonra yazdı" ilişkisi korundu
print("cihaz saati: 'Süt al' kazandı (yanlış) | Lamport: 'Süt ve ekmek al' kazandı")
```

```cikti
cihaz saati: 'Süt al' kazandı (yanlış) | Lamport: 'Süt ve ekmek al' kazandı
```

- Lamport saati "A'yı görüp B'yi yazdım" ilişkisini korur. İki cihaz birbirini görmeden yazdıysa (eşzamanlı)
  sıra keyfidir ama herkes aynı keyfi sırayı seçer; bu bir **çakışmadır** ve ürün kararı ister
  ([Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md)).
- Melez mantıksal saat (hybrid logical clock), duvar saatine yakın kalıp mantıksal saatin sıra garantisini verir;
  okunur zaman damgası gerektiğinde kullanılır.
- En basit doğru çözüm çoğu zaman **tek sıralayıcı**dır: sunucu her değişikliğe artan numara verir. Havuzdaki
  eşitleme böyledir; istemci saati "yalnız bilgi içindir" ([`sync.ts`](../../uygulama/shared/src/sync.ts) → `at`).

## Bölünme senaryoları

| Bölünme                              | Ne olur                                                         | Tasarım cevabı                                              |
| ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| İstemci ↔ sunucu (telefon çevrimdışı) | Yazmalar gidemez; istemci bayat veri gösterir                   | Yerel yazma + giden kutusu + eşitleme; durum göstergesi      |
| Uygulama ↔ veritabanı                | Her istek zaman aşımına düşer                                   | Kısa zaman aşımı, devre kesici, salt okunur kip ([Dayanıklılık kalıpları](dayaniklilik-kaliplari.md)) |
| Birincil ↔ kopya                     | Kopya geride kalır; yük devrinde iki birincil (beyin bölünmesi) | Çoğunlukla seçim, çit jetonu; elle onaylı yük devri          |
| Servis ↔ servis (tek yönlü)          | A, B'yi görüyor; B, A'yı görmüyor; sağlık denetimi yanıltır     | Uçtan uca denetim; bağımlılık başına hata ölçümü             |
| Sunucu ↔ dış sağlayıcı               | Ödeme/e-posta sağlayıcısına ulaşılamıyor                        | Kuyruk + yeniden deneme + giden kutusu ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)) |

### Çit jetonu: "kilit bende" sanan eski sahip

Süreli kilit (kira) alan bir süreç uzun bir duraklamaya girebilir (çöp toplama, sanal makinenin dondurulması, ağ
kesintisi). Kira bu sırada dolar, kilit başkasına verilir; eski sahip uyanınca hâlâ kilidin kendisinde olduğunu
sanıp yazar. Kilit servisi her verilişte **artan bir jeton** verir; depo daha eski jetonla gelen yazmayı reddeder:

```python calistir
class KilitServisi:
    """Süreli kilit (kira): her verilişte artan bir çit jetonu (fencing token) döner."""

    def __init__(self) -> None:
        self.jeton, self.sahip, self.bitis = 0, None, 0.0

    def al(self, kim: str, simdi: float, sure: float = 10.0) -> int | None:
        if self.sahip is not None and simdi < self.bitis:
            return None
        self.jeton += 1
        self.sahip, self.bitis = kim, simdi + sure
        return self.jeton


class Depo:
    def __init__(self, citli: bool) -> None:
        self.citli, self.en_buyuk, self.yazilan = citli, 0, []

    def yaz(self, jeton: int, kayit: str) -> bool:
        if self.citli and jeton < self.en_buyuk:
            return False  # daha yeni bir sahip yazmış: eski sahibin yazması reddedilir
        self.en_buyuk = max(self.en_buyuk, jeton)
        self.yazilan.append(kayit)
        return True


for citli in (False, True):
    kilit, depo = KilitServisi(), Depo(citli)
    a = kilit.al("A", simdi=0)  # A kilidi aldı (jeton 1)...
    # ...ve 15 sn donup kaldı (çöp toplama, sanal makine duraklaması, ağ kesintisi). Kira 10. sn'de bitti.
    b = kilit.al("B", simdi=12)  # B kilidi aldı (jeton 2) ve yazdı
    depo.yaz(b, "B: fatura 1001 kesildi")
    depo.yaz(a, "A: fatura 1001 kesildi")  # A uyandı; hâlâ sahip olduğunu sanıyor
    print(f"{'çitli ' if citli else 'çitsiz'}: {depo.yazilan}")
    assert len(depo.yazilan) == (1 if citli else 2)
```

```cikti
çitsiz: ['B: fatura 1001 kesildi', 'A: fatura 1001 kesildi']
çitli : ['B: fatura 1001 kesildi']
```

Tek veritabanlı bir üründe aynı korumayı veritabanının kendisi verir: işin sahipliğini satırda tutun ve yazmayı
koşullu yapın (`UPDATE … WHERE is_id = ? AND sahip = ? AND kira_no = ?`).

## Uzlaşma neden zor

- Bir grup makinenin tek bir değerde anlaşması (lider kim, sıradaki kayıt ne) hem çökmelere hem bölünmeye karşı
  doğru olmalıdır. Asenkron bir ağda, tek bir makinenin çökebildiği durumda **her zaman** sonlanan belirlenimci
  bir uzlaşma algoritması olmadığı kanıtlanmıştır (FLP sonucu); pratik algoritmalar zaman aşımı ve rastgelelikle
  "çoğu zaman" ilerler, ama **güvenliği** (iki farklı karar asla) hiç bozmaz.
- Raft'ın özü: seçilmiş tek lider yazmaları sıraya koyar; bir yazma ancak **çoğunluk** kopyaya ulaşınca kesinleşir;
  her seçim bir dönem (term) numarası taşır, eski dönemin lideri reddedilir (çit jetonunun aynısı).
- Çoğunluk neden çalışır: iki çoğunluk her zaman en az bir düğümde kesişir; bu düğüm son kesin değeri bilir.

```python calistir
from itertools import combinations


def her_okuma_guncel_gorur(n: int, w: int, r: int) -> bool:
    """w kopyaya yazılıp r kopyadan okunursa, her okuma kümesi her yazma kümesiyle kesişir mi?"""
    dugum = range(n)
    return all(set(y) & set(o) for y in combinations(dugum, w) for o in combinations(dugum, r))


assert her_okuma_guncel_gorur(5, 3, 3)  # w + r > n: en az bir güncel kopya okunur
assert not her_okuma_guncel_gorur(5, 2, 2)  # w + r ≤ n: bayat okuma mümkün
for n in (3, 4, 5, 6):
    cogunluk = n // 2 + 1
    print(f"{n} düğüm: çoğunluk {cogunluk}, kaldırabildiği kayıp {n - cogunluk}")
```

```cikti
3 düğüm: çoğunluk 2, kaldırabildiği kayıp 1
4 düğüm: çoğunluk 3, kaldırabildiği kayıp 1
5 düğüm: çoğunluk 3, kaldırabildiği kayıp 2
6 düğüm: çoğunluk 4, kaldırabildiği kayıp 2
```

Çift sayıda düğüm, bir eksiğinden fazla kayba dayanmaz: 3 ya da 5 düğüm kurulur. İki düğümlü "ana + yedek"
düzeninde bölünmede kimin haklı olduğuna karar verecek çoğunluk yoktur; ya elle karar verilir ya da üçüncü bir
hakem gerekir.

**Pratik karar:** uzlaşma gerekiyorsa onu zaten yapan sınanmış bir parçayı kullanın (veritabanının kendi
yük devri, ya da etcd/ZooKeeper gibi koordinasyon servisleri) veya sorunu tek yazara indirin (tek birincil
veritabanı, tek iş çalıştırıcısı). Raft'ı anlamak için sıfırdan yazılmış küçük gerçeklemeler havuzun
`sifirdan/veri` temelindedir ([`sifirdan/veri/`](../../sifirdan/veri/pyproject.toml); Kasım 2026'da Raft modülü
henüz yazılıyordu).

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Zaman aşımından sonra yeniden deneme çift kayıt yarattı          | "Bilinmiyor" durumu "başarısız" sanıldı                       | İdempotentlik anahtarı; durum sorgulama ucu                 |
| Bir kullanıcının düzenlemeleri hep kayboluyor                    | Cihaz saati geride; son yazan kazanır cihaz saatiyle          | Sunucu sırası ya da mantıksal saat                          |
| Zaman aşımı yaz saati ya da NTP düzeltmesinde tetiklendi         | Süre duvar saatiyle ölçüldü                                   | Monotonik saat                                              |
| Yük devrinden sonra iki birincil yazmaya devam etti              | Beyin bölünmesi; eski lider kendini lider sanıyor             | Çoğunlukla seçim, dönem numarası, çit jetonu                |
| Kilit vardı ama iş iki kez yapıldı                               | Kira duraklama sırasında doldu                                | Çit jetonu ya da koşullu yazma; kira > en uzun duraklama    |
| Sağlık denetimi yeşil, kullanıcılar hata alıyor                  | Denetim yalnız "süreç ayakta mı" diye bakıyor                 | Bağımlılıkları da yoklayan ya da gerçek isteği izleyen denetim |
| Yerelde hızlı, üretimde yavaş                                    | Gecikme sıfır sanıldı: döngüde ağ çağrısı                     | Toplu çağrı; istek başına çağrı sayısını ölç                |
| "Kendi Raft'ımızı yazalım" önerisi                               | Uzlaşmanın zorluğu küçümsendi                                 | Hazır koordinasyon servisi ya da tek yazar                  |

## Denetim listesi

- [ ] Her ağ çağrısı için üç sonuç (başarılı, başarısız, bilinmiyor) ayrı ayrı ele alındı.
- [ ] Yan etkili çağrılar idempotent; "bilinmiyor"da durum sorgulanabiliyor.
- [ ] Süreler monotonik saatle ölçülüyor; olay zamanı sunucuda UTC damgalanıyor.
- [ ] Makineler arası sıra cihaz saatiyle kurulmuyor (sunucu sırası ya da mantıksal saat).
- [ ] Kilit/kira kullanan her yerde çit jetonu ya da koşullu yazma var.
- [ ] Yük devri ve lider seçimi hazır bir parçaya bırakıldı; çoğunluk düğüm sayısı tek.
- [ ] Bölünme senaryoları (çevrimdışı istemci, veritabanına ulaşılamıyor, dış sağlayıcı yok) için davranış yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ağ çağrısında zaman aşımı sonucunu 'başarısız' değil 'bilinmiyor' say; yeniden gönderim
  idempotentlik anahtarıyla olsun. Sıralama için cihaz saatini kullanma; sunucunun verdiği numarayı kullan.
  Süreleri `time.monotonic()` ile ölç. Kendi kilit ya da lider seçimi algoritmanı yazma."
- **Modelin tipik hatası:** `Date.now()`/`datetime.now()` farkıyla zaman aşımı ölçer; istemcinin gönderdiği
  zaman damgasına göre "son yazan kazanır" uygular; süreli kilidi çit jetonu olmadan kullanır; "dağıtık kilit"
  için yarım bir algoritma uydurur.
- **Çıktıda arayın:** `updatedAt` ya da `timestamp` karşılaştırmasıyla birleştirme; `time.time()` ile süre
  ölçümü; zaman aşımında doğrudan "başarısız" iletisi ve yeniden gönderim.
- **Test isteyin:** "saati 5 dakika geri olan cihaz" ve "yanıtı kaybolan istek" senaryoları.

## İlgili

- [Tutarlılık modelleri](tutarlilik-modelleri.md) (CAP/PACELC) · [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md) ·
  [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) · [Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md)
- Havuzda: sunucu sırasıyla çalışan eşitleme [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md);
  Türkiye saatiyle takvim ve iş günü [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py)
