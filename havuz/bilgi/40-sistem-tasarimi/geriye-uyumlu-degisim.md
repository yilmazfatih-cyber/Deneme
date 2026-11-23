---
baslik: "Geriye uyumlu değişim: eski istemciler yaşarken API, şema ve protokolü evriltmek"
ozet: Eski mobil ve çevrimdışı istemciler varken bilinmeyen alanı koruma, varsayılanı değiştirmeme, enum ekleme sırası, sürüm kapısı, eski istekleri yükseltme ve kademeli kaldırma; havuzdaki eşitleme protokolüyle.
etiketler: [geriye-uyumluluk, surumleme, api, esitleme, mobil, protokol]
duzey: ileri
guncellik: 2026-11
---

# Geriye uyumlu değişim: eski istemciler yaşarken API, şema ve protokolü evriltmek

> Bu notu ne zaman okumalı: bir varlığa alan eklenirken, bir alanın anlamı ya da varsayılanı değişirken, eşitleme
> protokolüne yeni bir işlem türü eklenirken; mobil uygulama mağazaya çıkmadan önce; "eski telefonda veri kayboldu",
> "yeni sürümden sonra eski uygulama açılmıyor", "uzun süre çevrimdışı kalan cihazın değişiklikleri reddedildi"
> durumlarında. Alan ekleme/silmenin kısa tablosu [API tasarımı](../30-arkauc/api-tasarimi.md) → "Sürümleme ve
> geriye uyum" bölümündedir; bu not eski istemcinin **yaşadığı süre** boyunca neyin bozulduğunu derinleştirir.

## Temel fikir

- **Uyum penceresi**, en eski istemcinin ne kadar eski kalabileceğidir: açık web sekmesi saatler, PWA günler, mağaza
  uygulaması aylar, çevrimdışı cihaz "geri gelene dek". Her değişiklik bu pencere boyunca **iki yönde** çalışmalıdır:
  eski istemci ↔ yeni sunucu ve (dağıtım ya da geri alma sırasında) yeni istemci ↔ eski sunucu.
- Üç yüzey vardır: API gövdesi, saklanan veri (sunucu veritabanı **ve** istemcinin yerel veritabanı), eşitleme
  protokolü (işlem türleri). Yeni istemcinin yazdığı kaydı eski istemci okur, değiştirir ve geri yazar: **yuvarlak
  yolculukta** bilinmeyen alan kaybolmamalıdır.
- Sunucu eski biçimi sınırda **yükseltir** (upcast); iş kuralları tek, güncel biçimle çalışır. Desteklenen her eski
  sürümün gerçek bir örnek isteği testte durur.
- Eski istemci zorla kapatılacaksa (en düşük sürüm), kullanıcının cihazdaki verisi **asla** silinmez; güncellemeden
  sonra kaldığı yerden gönderilir.

## Uyum penceresi: kim ne kadar eski kalır

| İstemci                                  | Ne kadar eski kalabilir                     | Ne yapılır                                                               |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| Açık web sekmesi                         | Saatler–günler (sekme kapanmaz)             | Her istekte sürüm; uyuşmazsa "yenile" bildirimi                          |
| PWA (servis çalışanı)                    | Günler; eski çalışan bütün sekmeler kapanana dek bekler | Güncelleme bildirimi ([PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md)) |
| Mağaza uygulaması                        | Haftalar–aylar; otomatik güncellemesi kapalı olan için süresiz | En düşük sürüm kapısı + mağaza bağlantısı                   |
| Çevrimdışı cihaz                         | Geri gelene dek; giden kutusunda eski biçimli yazmalar | Eski biçimi kabul edip yükselt; reddedeceksen veriyi koru   |
| Geri alınmış sunucu                      | Dakikalar–saatler                           | Yeni istemci eksik alanı tolere eder; şema yalnız genişletilir          |
| Başkasının entegrasyonu (açık API)       | Aylar–yıllar                                | Sürümlü uç, `Sunset` başlığı, kullanım ölçümü                            |

## Karar tablosu: değişiklik türüne göre yol

| Değişiklik                                       | Eski istemci için risk                                         | Yol                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Yeni isteğe bağlı alan                           | Bilmediği alanı okurken atar, bütün kaydı yazınca siler        | Varsayılanla ekle; istemciler bilinmeyeni korusun ya da yalnız değişeni yazsın |
| Alanın varsayılanını değiştirmek                 | Alanı olmayan eski kayıtların anlamı değişir; iki cihaz farklı görür | Değiştirme; gerekiyorsa önce eski kayıtlara açıkça yaz, sonra değiştir |
| Enum'a yeni değer                                | Doğrulama kaydı reddeder ya da ekran boş kalır                 | İki yayın: önce herkes "bilinmeyen"i işlesin, en düşük sürüm geçince yazmaya başla |
| Alanın anlamı/birimi (dakika → saniye)           | Eski istemci yanlış hesaplar, hata vermez                      | Yeni adla yeni alan; eski alanı bir süre birlikte yaz                     |
| Doğrulamayı sıkılaştırmak (200 → 100 karakter)   | Çevrimdışı giden kutusundaki eski yazmalar reddedilir          | Yalnız yeni kayıtlarda uygula; eskiyi okurken kabul et                    |
| Yeni işlem türü (`op`)                           | Eski sunucu tanımaz; eski istemci gönderemez                   | Protokol sürümü artar; sunucu eski sürümleri yükseltir                    |
| Uç ya da alan kaldırmak                          | Eski istemci hata alır                                         | Ölç → duyur → uyar → en düşük sürüm → kaldır (takvim aşağıda)            |

## Bilinmeyen alanı korumak

Yeni istemci kayda `etiketler` ekledi. Eski telefon kaydı okuyup görevi bitirdi ve geri yazdı:

```python calistir
ESKI_SEMA = {"baslik", "tamam"}  # eski istemcinin bildiği alanlar
VARSAYILAN = {"etiketler": []}  # sunucu eksik alanı varsayılanla doldurur (Zod .default())


def calis(okuma: str, yazma: str) -> list[str]:
    sunucu = {"baslik": "Kira öde", "tamam": False, "etiketler": ["ev", "fatura"]}  # yeni istemci etiket ekledi
    if okuma == "atarak":  # Zod z.object (varsayılan), Pydantic varsayılanı, elle alan kopyalama
        yerel = {k: v for k, v in sunucu.items() if k in ESKI_SEMA}
    else:  # koruyarak: Zod .loose(), Pydantic extra="allow"
        yerel = dict(sunucu)
    yerel["tamam"] = True  # eski telefonda kullanıcı görevi bitirdi
    if yazma == "put":  # bütün kaydı yaz
        sunucu = {**VARSAYILAN, **yerel}
    else:  # patch: yalnız değişen alan
        sunucu = {**sunucu, "tamam": yerel["tamam"]}
    return sunucu["etiketler"]


assert calis("atarak", "put") == []  # YANLIŞ: eski istemci bilmediği alanı sessizce sildi
assert calis("koruyarak", "put") == ["ev", "fatura"]
assert calis("atarak", "patch") == ["ev", "fatura"]  # yalnız değişeni gönderen eski istemci zararsız
print("bilinmeyen alanı atan eski istemci 'put' ile yeni alanı sildi; koruyan ya da 'patch' gönderen silmedi")
```

```cikti
bilinmeyen alanı atan eski istemci 'put' ile yeni alanı sildi; koruyan ya da 'patch' gönderen silmedi
```

- Zod 4'te `z.object` bilinmeyen anahtarı **atar**, `.loose()` korur (havuzdaki `zod@4.6.7` ile denendi). Pydantic
  varsayılanı da atar. Okuma şemanız "atıyorsa" istemci yazarken bütün kaydı göndermemelidir.
- Havuzdaki kural: düzenlemeler `patch` ile gider, yalnız değişen alanı taşır ([`shared/src/sync.ts`](../../uygulama/shared/src/sync.ts)).
  Bütün kaydı yeniden yazan yollar dikkat ister: eşitlemede "buradakini gönder" (reset) yerel **görünümü** `put` eder;
  görünüm, bekleyen bir düzenlemesi olan kayıtta varlık şemasından geçtiği için bilinmeyen alanı atmış olabilir
  ([`memoryReplica.ts`](../../uygulama/shared/src/testing/memoryReplica.ts) → `resolveReset`). Yeni alan eklerken bu
  yolu bir eski-istemci testiyle sınayın.

## Varsayılanı değiştirmemek

Havuzdaki kural "yeni alan `.default(...)` ile eklenir" ([`entity.ts`](../../uygulama/shared/src/entity.ts), kural
testi [`entities.test.ts`](../../uygulama/shared/test/entities.test.ts)). Varsayılan **okurken** uygulanır: alanı
olmayan her eski kayıt, o günkü varsayılanı gösterir. Varsayılanı sonradan değiştirmek geçmişi yeniden yazar:

```python calistir
KAYITLAR = [{"baslik": "eski görev"}, {"baslik": "yeni görev", "oncelik": "yuksek"}]  # ilki alan eklenmeden önce


def oku(kayit: dict, varsayilan: str) -> str:  # varsayılan OKURKEN uygulanır (Zod .default() gibi)
    return {"oncelik": varsayilan, **kayit}["oncelik"]


eski_telefon = [oku(k, "normal") for k in KAYITLAR]
yeni_telefon = [oku(k, "dusuk") for k in KAYITLAR]  # YANLIŞ: yeni sürümde varsayılan "dusuk" yapıldı
assert eski_telefon == ["normal", "yuksek"] and yeni_telefon == ["dusuk", "yuksek"]  # aynı kayıt iki cihazda farklı

for kayit in KAYITLAR:  # DOĞRU: önce eski kayıtlara bugünkü varsayılanı AÇIKÇA yaz (göç), sonra değiştir
    kayit.setdefault("oncelik", "normal")
assert [oku(k, "normal") for k in KAYITLAR] == [oku(k, "dusuk") for k in KAYITLAR] == ["normal", "yuksek"]
print("varsayılanı değiştirmek eski kayıtların anlamını değiştirdi; önce açıkça yazınca değiştirmedi")
```

```cikti
varsayılanı değiştirmek eski kayıtların anlamını değiştirdi; önce açıkça yazınca değiştirmedi
```

Çevrimdışı istemcinin yerel kopyaları da eski kayıttır: sunucuda yapılan göç onlara ancak eşitlemeyle ulaşır. Bu
yüzden açıkça yazma göçü, değişikliği yapan yayından **önce** ve ayrı bir yayında olur.

## Enum'a yeni değer: iki yayın

Havuzda `priority: z.enum(['low', 'normal', 'high'])` gibi bir alana `'urgent'` eklemek: eski istemcinin şeması bu
değeri reddeder ([`tasks.ts`](../../uygulama/shared/src/entities/tasks.ts)). Sıra:

1. **Yayın A:** bütün istemciler bilinmeyen değeri görüntüleyebilir ("Diğer" etiketi), korur ve geri yazarken
   bozmaz. Henüz kimse `'urgent'` yazmaz.
2. En düşük desteklenen sürüm A'ya ulaşınca (telemetriyle ölçülür) **Yayın B:** arayüz `'urgent'` yazmaya başlar
   (tercihen özellik bayrağıyla).

Sunucu yeni değeri kabul etse bile istemcilerin hepsi A'ya geçmeden yazdırmayın; yazan yeni istemci değil, onu
okuyan eski istemci bozulur.

## Sürüm kapısı ve en düşük sürüm

İstemci her istekte iki şey gönderir: **protokol sürümü** (gövde biçimi) ve **uygulama sürümü** (`1.9.3`). Sunucu
desteklemediğinde `426 Upgrade Required` döner; istemci eşitlemeyi durdurur, yerel veriyi ve giden kutusunu korur,
güncelleme ekranı gösterir:

```python calistir
def surum(metin: str) -> tuple[int, ...]:
    return tuple(int(parca) for parca in metin.split("-")[0].split("."))  # "1.10.0-beta" → (1, 10, 0)


assert "1.10.0" < "1.9.3"  # YANLIŞ: metin karşılaştırması 1.10'u eski sanar
assert surum("1.10.0") > surum("1.9.3")

PROTOKOLLER, EN_DUSUK, ONERILEN = {2, 3}, surum("1.8.0"), surum("1.10.0")


def kapi(istemci: str, protokol: int) -> tuple[int, str]:
    if protokol not in PROTOKOLLER or surum(istemci) < EN_DUSUK:
        return 426, "güncelleme gerekli: mağaza bağlantısı + 'verileriniz bu cihazda duruyor'"
    if surum(istemci) < ONERILEN:
        return 200, "çalışır; ekranda güncelleme önerisi"
    return 200, "tamam"


assert kapi("1.7.2", 2)[0] == 426 and kapi("1.9.3", 3) == (200, "çalışır; ekranda güncelleme önerisi")
assert kapi("1.10.0", 1)[0] == 426 and kapi("1.10.0", 3) == (200, "tamam")

# En düşük sürümü yükseltmeden önce: son 7 günde eşitleme yapan cihazların sürüm dağılımı
TELEMETRI = {"1.7.2": 40, "1.8.0": 160, "1.9.3": 1300, "1.10.0": 8500}
toplam = sum(TELEMETRI.values())
for aday in ("1.8.0", "1.9.0", "1.10.0"):
    pay = sum(n for v, n in TELEMETRI.items() if surum(v) < surum(aday)) / toplam
    print(f"en düşük {aday} olursa güncellemeye zorlanan cihaz: %{pay * 100:.1f}")
```

```cikti
en düşük 1.8.0 olursa güncellemeye zorlanan cihaz: %0.4
en düşük 1.9.0 olursa güncellemeye zorlanan cihaz: %2.0
en düşük 1.10.0 olursa güncellemeye zorlanan cihaz: %15.0
```

- Kural örneği: en düşük sürümü, etkilenen cihaz %1'in altına inince **ve** yeni sürüm en az 30 gün yayındayken
  yükseltin. Eşik ürün kararıdır; ölçmeden yükseltmeyin.
- Telemetri sürümü ve son eşitleme gününü tutar; kişisel veri gerekmez.
- 426 yanıtı ne yapılacağını söyler (mağaza bağlantısı) ve **güvence verir**: "Değişiklikleriniz bu cihazda duruyor."

## Eski istekleri yükseltmek ve altın örnekler

Üç ay çevrimdışı kalan telefon döndüğünde giden kutusunda 1. protokol sürümünün biçimiyle yazılmış değişiklikler
vardır. Sunucu desteklediği her eski sürümü sınırda güncele çevirir; desteklenen her sürümden **gerçek** bir istek
testte durur:

```python calistir
import json

ONCELIK = {1: "dusuk", 2: "normal", 3: "yuksek"}


def v1_v2(d: dict) -> dict:  # v2: öncelik sayıdan adlandırılmış değere geçti
    return {**d, "data": {**d["data"], "oncelik": ONCELIK[d["data"]["oncelik"]]}}


def v2_v3(d: dict) -> dict:  # v3: "tamam" bayrağı "durum" alanına taşındı
    veri = dict(d["data"])
    veri["durum"] = "tamam" if veri.pop("tamam", False) else "acik"
    return {**d, "data": veri}


YUKSELT, GUNCEL = {1: v1_v2, 2: v2_v3}, 3


def kabul_et(protokol: int, degisiklik: dict) -> dict:
    """Sunucu sınırı: eski sürümü güncele yükseltir; iş kuralları tek biçimle çalışır."""
    if not 1 <= protokol <= GUNCEL:
        raise ValueError("426: desteklenmeyen protokol")
    while protokol < GUNCEL:
        degisiklik, protokol = YUKSELT[protokol](degisiklik), protokol + 1
    return degisiklik


ALTIN = {  # her desteklenen sürümden gerçek bir istek; destek bitene dek testte durur
    1: '{"op": "put", "data": {"baslik": "Kira", "oncelik": 3, "tamam": true}}',
    2: '{"op": "put", "data": {"baslik": "Kira", "oncelik": "yuksek", "tamam": true}}',
    3: '{"op": "put", "data": {"baslik": "Kira", "oncelik": "yuksek", "durum": "tamam"}}',
}
beklenen = json.loads(ALTIN[3])
for protokol, govde in ALTIN.items():
    assert kabul_et(protokol, json.loads(govde)) == beklenen, protokol
try:
    kabul_et(4, beklenen)
except ValueError as hata:
    print("gelecekten gelen istek:", hata)
print("v1, v2 ve v3 istekleri aynı v3 kaydına dönüştü")
```

```cikti
gelecekten gelen istek: 426: desteklenmeyen protokol
v1, v2 ve v3 istekleri aynı v3 kaydına dönüştü
```

- Yükseltici **saf** işlevdir ve tek yönlüdür; veritabanına dokunmaz. Eski sürümün desteği bitince yükseltici ve
  altın örneği birlikte silinir.
- İstemcinin yerel giden kutusu da eski biçimde durur. Protokol sürümü artarken yeni istemci, açılışta yerel
  veritabanı göçüyle bekleyen değişiklikleri de yükseltmelidir; yoksa yenilenen sayfa onları **yeni** sürüm
  numarasıyla gönderir ve sunucu reddeder. Yerel şema yükseltme: [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md).
- Gelecek sürümle gelen istek (yeni istemci, geri alınmış sunucu) 426 değil, "sunucu güncelleniyor, sonra dene"
  anlamında 503 de olabilir; istemci bunu kalıcı hata saymamalıdır.

## Havuzda durum

- Eşitleme protokolü tek sürümlüdür: `PROTOCOL_VERSION = 1`; uyuşmazsa `426 upgrade_required` ve "sayfayı yenileyin"
  ([`sync.ts`](../../uygulama/shared/src/sync.ts), [`ESITLEME.md`](../../uygulama/docs/ESITLEME.md) → "Sınırlar").
  Web için yeterlidir: yenileme yeni kodu getirir.
- Mağaza uygulaması için yetmez: yazılmakta olan mobil temel protokolün bir kopyasını taşır (`havuz/mobil/shared/sync.ts`).
  Sürüm artınca telefondaki her kurulum, mağaza güncellemesi gelene dek eşitleyemez. Mobil yayından önce sunucuya
  en az bir önceki protokol sürümünü yükselterek kabul etme ve sürüm kapısı ekleyin.
- Geri alma da bir uyum yönüdür: havuzdaki migrasyon koşucusu, kendisinden yeni bir veritabanında açılmaz
  ([`migrate.ts`](../../uygulama/api/src/db/migrate.ts)); sonuçları: [Uygulama yayın tarifi](../60-devops/uygulama-yayin-tarifi.md).

## Kaldırma takvimi

| Aşama       | Ne yapılır                                                        | Bitti sayılır                                        |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Ölç      | Eski uç/alan/sürüm kullanımı sayılır (istemci sürümüyle)           | Kimin kullandığı biliniyor                           |
| 2. Duyur    | Sürüm notu; yanıtta `Sunset` tarihi (RFC 8594); açık API'de e-posta | Duyuru tarihi + en az bir sürüm döngüsü              |
| 3. Uyar     | Eski istemcide güncelleme önerisi                                 | Kullanım eşiğin altına indi                          |
| 4. Zorla    | En düşük sürüm yükselir; eski istemci 426 alır, verisi korunur    | Destek talepleri sakin                               |
| 5. Kaldır   | Kod, yükseltici, altın örnek, sütun (daraltma göçü)               | Testler yeşil; geri dönüşte gerekmeyeceği kesin      |

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Eski telefonda düzenlenen kayıtların yeni alanı boşaldı           | Eski istemci bilinmeyeni attı ve bütün kaydı yazdı            | Yalnız değişeni yaz (`patch`) ya da bilinmeyeni koru            |
| Hiç kimse dokunmadan binlerce kaydın önceliği değişti            | Varsayılan değiştirildi; varsayılan okurken uygulanıyor       | Önce açıkça yaz (göç), sonra varsayılanı değiştir               |
| Eski uygulamada liste boş, konsolda doğrulama hatası             | Enum'a yeni değer yazıldı, eski şema reddetti                 | İki yayın: önce "bilinmeyen"i işle, sonra yaz                   |
| "1.10" sürümü güncelleme ekranına düştü                          | Sürümler metin olarak karşılaştırıldı                         | Sayı demeti olarak karşılaştır                                  |
| Uzun süre çevrimdışı kalan cihazın değişiklikleri reddedildi      | Sunucu yalnız güncel protokolü kabul ediyor                   | Desteklenen eski sürümleri sınırda yükselt                      |
| Güncellemeden sonra cihazdaki bekleyen değişiklikler kayboldu     | Yerel giden kutusu yükseltilmedi; yeni sürüm numarasıyla gitti | Yerel veritabanı göçünde giden kutusunu da yükselt             |
| 426 alan uygulama yerel veriyi sildi                              | İstemci 426'yı "çıkış yap" gibi işledi                        | 426'da dur, veriyi koru, güncelleme ekranı                      |
| Birim değişti (dk → sn), eski istemci 60 kat yanlış gösteriyor    | Aynı alanın anlamı değişti                                    | Yeni adla yeni alan                                             |
| Uzunluk sınırı düşürülünce eski kayıtlar düzenlenemez oldu        | Sıkı doğrulama eski veriye de uygulandı                       | Yalnız yeni kayıtta uygula                                      |
| Geri alınan sunucu, yeni istemcilerin isteklerini anlamadı         | Yeni istemci yeni alanı zorunlu varsaydı                      | Yeni istemci eksik alanı tolere eder; önce sunucu, sonra istemci |

## Denetim listesi

- [ ] Her istemci türü için uyum penceresi yazılı (web, PWA, mağaza, çevrimdışı).
- [ ] Yeni alanlar varsayılanla eklendi; hiçbir varsayılan değiştirilmedi (değişecekse önce açıkça yazan göç).
- [ ] İstemciler ya yalnız değişen alanı gönderiyor ya bilinmeyen alanı koruyor; eski-istemci yuvarlak yolculuk testi var.
- [ ] Yeni enum değerleri iki yayında açıldı; eski istemci bilinmeyen değeri gösterebiliyor.
- [ ] İstek protokol ve uygulama sürümünü taşıyor; sunucuda sürüm kapısı ve en düşük sürüm var; sürümler sayı demeti.
- [ ] Desteklenen her eski protokol sürümü için yükseltici ve gerçek bir altın örnek testte.
- [ ] 426'da istemci verisini ve giden kutusunu koruyor; güncellemeden sonra kaldığı yerden gönderiyor.
- [ ] Protokol sürümü artarken yerel giden kutusu da yükseltiliyor.
- [ ] Sürüm dağılımı telemetrisi var; en düşük sürüm kararı ölçümle veriliyor.
- [ ] Kaldırmalar takvimle yapılıyor; `Sunset` duyurusu ve kullanım ölçümü var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu alanı geriye uyumlu ekle: `.default(...)` ver; mevcut varsayılanlara dokunma. Düzenlemeleri
  `patch` ile, yalnız değişen alanla gönder. Eski istemcinin bu kaydı okuyup geri yazdığı bir test yaz: yeni alan
  kaybolmamalı. Protokol biçimi değişiyorsa `PROTOCOL_VERSION`'ı artır, sunucuya eski sürümü yükselten saf bir işlev
  ve her sürüm için altın örnek ekle; istemcinin yerel giden kutusunu da yükselt."
- **Modelin tipik hatası:** alanı yeniden adlandırıp eskisini aynı yayında siler; varsayılanı "daha mantıklı" diye
  değiştirir; enum'a değer ekleyip hemen yazdırır; sürümleri metin olarak karşılaştırır; 426'da yerel veriyi temizler;
  protokol sürümünü artırıp yalnız sunucuyu günceller.
- **Çıktıda arayın:** silinen ya da yeniden adlandırılan alanlar; `.default(` değeri değişen satırlar; `put` ile bütün
  kaydı gönderen düzenleme yolları; `<` ile karşılaştırılan sürüm dizgileri; `upgrade_required` dalında veri silme.
- **Test isteyin:** "eski istemci yuvarlak yolculukta yeni alanı korur", "v1 altın örneği güncel kayda dönüşür",
  "426 alan istemcinin giden kutusu dolu kalır".

## İlgili

- [API tasarımı](../30-arkauc/api-tasarimi.md) (sürümleme tablosu) · [Migrasyonlar](../30-arkauc/migrasyonlar.md)
  (genişlet-geçir-daralt) · [Dağıtım stratejileri](../60-devops/dagitim-stratejileri.md) (iki sürüm birlikte, geri alma)
- [Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md) · [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md)
  · [Kalıcı iş kuyruğu](../30-arkauc/kalici-is-kuyrugu.md) (kuyruktaki işlerin yük sürümü)
- Havuzda: [`uygulama/shared/src/sync.ts`](../../uygulama/shared/src/sync.ts),
  [`uygulama/shared/src/entity.ts`](../../uygulama/shared/src/entity.ts),
  [`uygulama/shared/DEGISIKLIKLER.md`](../../uygulama/shared/DEGISIKLIKLER.md) (ortak sözleşme günlüğü),
  [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md)
