---
baslik: Güvenilirlik düşüncesi
ozet: "Ne ters gidebilir" listesi çıkarma; zaman aşımı, yeniden deneme ve idempotentlik üçlüsü; zarif bozulma, güvenli varsayılan ve her değişiklik için geri alma planı.
etiketler: [yontem, guvenilirlik, yeniden-deneme, idempotentlik, zaman-asimi, geri-alma]
duzey: orta
guncellik: 2026-11
---

# Güvenilirlik düşüncesi

> Bu notu ne zaman okumalı: kod bir ağ çağrısı, ödeme, e-posta, dosya ya da başka bir servisle konuşuyorsa;
> yeniden deneme eklemek üzereyseniz; bir sürümü yayına çıkarmadan önce; ya da "bazen iki kez kaydediyor" gibi
> bir şikâyet geldiğinde.

## Temel fikir

Her bağımlılık bir gün bozulur: ağ yavaşlar, servis yanıt vermez, disk dolar, kullanıcı iki kez tıklar, süreç
işin ortasında ölür. Güvenilir kod bunları **varsayar** ve her biri için önceden karar verir. Dört alışkanlık:

1. **"Ne ters gidebilir" listesi:** akışın her adımı için yavaş, hata, bozuk yanıt, çift başarı, yarım kalma.
2. **Üçlü:** her dış çağrıda **zaman aşımı**; yalnız geçici hatada, sınırlı ve aralıklı **yeniden deneme**;
   yeniden denemeyi güvenli kılan **idempotentlik** (aynı isteği iki kez yapmak bir kez yapmakla aynı sonucu verir).
   Üçünden biri eksikse öteki ikisi zarar verir.
3. **Zarif bozulma ve güvenli varsayılan:** bir parça çökünce bütün ürün çökmesin; belirsizlikte zarar
   vermeyen taraf seçilsin.
4. **Geri alma planı:** yayına çıkan her değişiklik için "bozuk çıkarsa ne yaparım" sorusunun yanıtı önceden yazılı.

## Ne ters gidebilir: akış tablosu

Akışı adım adım yazın ve her adıma aynı soruları sorun. Örnek: sipariş verme.

| Adım           | Ne ters gidebilir                        | Etki                     | Nasıl anlarız          | Önlem                                                  |
| -------------- | ---------------------------------------- | ------------------------ | ---------------------- | ------------------------------------------------------ |
| Stok düş       | İki kişi son ürünü aynı anda alır        | Eksi stok                | Kısıt ihlali           | Koşullu güncelleme: `WHERE stok > 0`, etkilenen satır sayısı |
| Ödeme al       | Yanıt gelmez (zaman aşımı)               | Ödendi mi bilinmez       | Zaman aşımı günlüğü    | İdempotentlik anahtarı + ödeme durumu sorgusu          |
| Ödeme al       | Ödeme reddedilir                         | Stok boşuna düşmüş       | Hata kodu              | Telafi: stoku geri ver                                 |
| E-posta gönder | Servis çalışmıyor                        | Müşteri onay alamaz      | Kuyrukta biriken iş    | Kuyruğa yaz, ayrıca dene; sipariş yine tamamdır        |
| Bütün akış     | Süreç ortada ölür                        | Yarım iş, tutarsız veri  | Gece tutarlılık denetimi | Durum alanı (`odeme_bekliyor`, `odendi`…) + kaldığı yerden devam |
| Bütün akış     | Kullanıcı "Öde"ye iki kez basar          | Çift sipariş             | Aynı sepetten iki kayıt | Düğmeyi kilitle **ve** sunucuda idempotentlik           |

Her dış bağımlılık için hızlı soru listesi: **yavaşlarsa, hiç yanıt vermezse, hata verirse, bozuk ya da beklenmedik
veri dönerse, aynı işi iki kez yaparsa, yanıtlar sırasız gelirse, kota dolarsa, anahtar ya da sertifika süresi
dolarsa** ne olur?

## Zaman aşımı, yeniden deneme, idempotentlik

### Zaman aşımı

- Her ağ çağrısına açık bir zaman aşımı verin. Birçok HTTP istemcisinde varsayılan ya yoktur ya da dakikalarca
  sürer; asılı kalan istek, iş parçacığını ve kullanıcıyı da asar.
- Değeri normal yanıt süresine göre seçin (ör. %99'luk sürenin birkaç katı), tahminle değil.
- **Toplam bütçe** koyun: deneme sayısı × deneme zaman aşımı + beklemeler, kullanıcının sabrını aşmasın.

### Yeniden deneme

| Hata                                    | Yeniden dene?                             | Neden                                            |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| Zaman aşımı, bağlantı koptu             | Evet, **yalnız idempotentse**             | Geçici olabilir; ama işlem gerçekleşmiş olabilir |
| 429 (çok fazla istek)                   | Evet, `Retry-After` kadar bekleyerek      | Sınır geçicidir                                  |
| 502, 503, 504                           | Evet                                      | Ara katman ya da servis geçici olarak yok        |
| 500                                     | En çok bir kez                            | Çoğu zaman kalıcı bir hatadır                    |
| 400, 401, 403, 404, 422                 | Hayır                                     | Aynı istek aynı yanıtı alır                      |
| 409 (çakışma)                           | Hayır; durumu yeniden okuyup karar verin  | Veri değişmiş                                    |

Beklemeyi üstel artırın ve **rastgele sapma** (jitter) ekleyin; yoksa aynı anda hata alan binlerce istemci aynı
anda yeniden dener ve servisi yeniden düşürür. Yeniden denemeyi **tek bir katmanda** yapın: üç katmanın her biri
üç kez denerse bir istek 27 isteğe dönüşür.

```python calistir
import random


def backoff_delays(attempts: int, base: float = 0.5, cap: float = 8.0, rng: random.Random | None = None) -> list[float]:
    """Üstel geri çekilme + tam rastgele sapma (full jitter): i. bekleme [0, min(cap, base·2^i)] aralığında."""
    rng = rng or random.Random()
    return [rng.uniform(0, min(cap, base * 2**i)) for i in range(attempts)]


delays = backoff_delays(5, rng=random.Random(1))
assert all(0 <= d <= limit for d, limit in zip(delays, [0.5, 1, 2, 4, 8]))
print("beklemeler (sn):", [round(d, 2) for d in delays])

# Bütçe: 3 deneme × 2 sn zaman aşımı + aradaki en kötü iki bekleme, kullanıcının 10 saniyelik sabrını aşmasın
attempts, attempt_timeout, budget = 3, 2.0, 10.0
worst = attempts * attempt_timeout + sum(min(8.0, 0.5 * 2**i) for i in range(attempts - 1))
assert worst <= budget
print(f"en kötü durumda {worst} sn")
```

```cikti
beklemeler (sn): [0.07, 0.85, 1.53, 1.02, 3.96]
en kötü durumda 7.5 sn
```

### İdempotentlik

Zaman aşımı "işlem olmadı" demek değildir; "yanıtı alamadım" demektir. Para çekilmiş, yanıt yolda kaybolmuş
olabilir. Bu durumda körü körüne yeniden denemek müşteriden iki kez para alır:

```python calistir
class PaymentService:
    """Sahte ödeme servisi: ilk çağrının yanıtı yolda kaybolur, ama ödeme ALINMIŞTIR."""

    def __init__(self) -> None:
        self.charges: list[int] = []
        self.receipts: dict[str, str] = {}
        self.calls = 0

    def charge(self, kurus: int, key: str | None = None) -> str:
        self.calls += 1
        if key is not None and key in self.receipts:
            return self.receipts[key]  # aynı anahtar: yeni ödeme yok, ilk sonucu döndür
        self.charges.append(kurus)
        receipt = f"makbuz-{len(self.charges)}"
        if key is not None:
            self.receipts[key] = receipt
        if self.calls == 1:
            raise TimeoutError("yanıt gelmedi")  # para çekildi, istemci bilmiyor
        return receipt


def pay_with_retry(service: PaymentService, kurus: int, key: str | None = None, attempts: int = 3) -> str:
    for _ in range(attempts):
        try:
            return service.charge(kurus, key)
        except TimeoutError:
            continue
    raise RuntimeError("ödeme sonucu bilinmiyor: durum sorgusuyla öğrenin")


naive = PaymentService()
pay_with_retry(naive, 25_000)
assert naive.charges == [25_000, 25_000]  # müşteri iki kez ödedi

safe = PaymentService()
assert pay_with_retry(safe, 25_000, key="siparis-1042") == "makbuz-1"
assert safe.charges == [25_000]
print("anahtarsız yeniden deneme: 2 ödeme · anahtarlı: 1 ödeme")
```

```cikti
anahtarsız yeniden deneme: 2 ödeme · anahtarlı: 1 ödeme
```

Kurallar: anahtar **iş işleminden** türetilir (sipariş kimliği) ya da işlem başında bir kez üretilip saklanır;
her denemede yeniden üretilirse hiçbir işe yaramaz. Sunucu tarafında karşılığı: anahtara benzersizlik kısıtı ve
"varsa ilk sonucu döndür". Kuyruklar çoğu zaman bir iletiyi **en az bir kez** teslim eder; tüketici de aynı iletiyi
iki kez işlemeye hazır olmalıdır (ileti kimliğini kaydedip ikinciyi atlayarak).

## Zarif bozulma

Bir parça çökünce ürünün geri kalanı çalışmaya devam etsin:

- Öneri servisi yanıt vermezse sayfa önerisiz açılır; hata ekranı değil.
- Köprü'de ses önce kişisel kayıttan, yoksa hazır dosyadan, o da yoksa cihazın Türkçe sesinden gelir: her
  katman bir öncekinin yedeğidir.
- Bağlantı yoksa değişiklikler cihazda kuyruğa alınır, bağlantı gelince eşitlenir (havuzdaki uygulama temeli
  bunu yapar: [ESITLEME.md](../../uygulama/docs/ESITLEME.md)).
- Sorunlu bir özellik, yeni sürüm beklemeden bir bayrakla (kill switch) kapatılabilir.
- Aşırı yükte salt okunur kipe geçmek, tümden çökmekten iyidir.

Kural: zarif bozulma **görünür** olmalıdır. Kullanıcıya kısa bir ileti ("Öneriler şu an gösterilemiyor"), size bir
günlük satırı. Sessiz bozulma aylarca fark edilmez.

## Güvenli varsayılan

| Belirsiz durum                              | Güvenli seçim                                              |
| ------------------------------------------- | ---------------------------------------------------------- |
| Yetki denetimi hata verdi                   | Reddet (kapalı başarısızlık, fail closed)                  |
| Özellik bayrağı servisine ulaşılamadı       | Bayrağın güvenli değeri (çoğu zaman kapalı)                |
| Zorunlu yapılandırma eksik                  | Başlamayı reddet, ne eksik olduğunu yaz; sessiz varsayılan yok |
| Silme isteği                                | Yumuşak silme + geri alma süresi; kalıcı silme onayla      |
| Hata ayıklama kipi, CORS, yönetim ucu       | Kapalı                                                     |
| Para işleminin sonucu bilinmiyor            | Yeniden yapma; durumu sorgula, kullanıcıya bildir, kaydet  |

Güvenlik denetimleri kapalı başarısız olur (şüphede reddet); süs ve kolaylık özellikleri açık başarısız olabilir
(şüphede özelliği gizle, ürünü çalıştır).

## Geri alma planı

Her yayından önce dört satır yazın:

```text
Değişiklik:   Siparişlere "kargo_firmasi" sütunu ekleniyor.
Geri alma:    Önceki sürüme dön (yayın panelinden tek tık). Göç geriye uyumlu: yeni sütun boş olabilir,
              eski sürüm onu görmezden gelir.
Tetikleyici:  Sipariş hatası 15 dakikada 5'i geçerse ya da ödeme ekranında hata görülürse geri al.
Yedek:        Son yedek bu gece 03:00; geri yükleme en son 1 Kasım'da denendi ve 12 dakika sürdü.
```

- Veritabanı göçlerini **genişlet → taşı → daralt** sırasıyla yapın: önce yeni sütunu ekleyin (eski kod çalışmaya
  devam eder), sonra veriyi taşıyın, en son eskiyi kaldırın. Her adım ayrı yayındır ve geri alınabilir.
- Hiç geri yüklenmemiş yedek, yedek değildir. Geri yüklemeyi takvime bağlayın ve süresini ölçün.

## Tuzaklar

| Belirti                                                   | Neden                                              | Çözüm                                                        |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Müşteri iki kez ücretlendirildi                           | İdempotentliksiz yeniden deneme                    | İş işleminden türeyen anahtar + sunucuda benzersizlik        |
| Kısa bir kesinti sonrası servis bir saat ayağa kalkamadı  | Rastgele sapmasız yeniden deneme fırtınası         | Üstel bekleme + rastgele sapma; deneme sınırı                |
| Bir istek arka planda onlarca isteğe dönüştü              | Birden çok katmanda yeniden deneme                 | Yeniden deneme tek katmanda                                  |
| İstekler dakikalarca asılı kalıyor                        | Zaman aşımı verilmemiş                             | Her çağrıda açık zaman aşımı; toplam bütçe                   |
| Hata günlükte yok ama veri eksik                          | `try/except` hatayı yuttu                          | Yakaladığınız hatayı ya işleyin ya da günlüğe yazıp yükseltin |
| Sağlık denetimi "tamam", kullanıcılar hata görüyor        | Denetim yalnız sürecin ayakta olduğuna bakıyor     | Denetime veritabanı ve kritik bağımlılık bağlantısını katın  |
| Yedekten dönmek gerekti, yedek açılmadı                   | Geri yükleme hiç denenmemiş                        | Düzenli geri yükleme denemesi                                |
| Kuyruktan gelen iş iki kez işlendi                        | En az bir kez teslim                               | İleti kimliğiyle tekrarı atlayan tüketici                    |
| Yayın bozuk çıktı, geri dönüş saatler sürdü               | Geri alma planı yoktu, göç geri alınamıyordu       | Dört satırlık plan; genişlet → taşı → daralt                 |

## Denetim listesi

- [ ] Akışın "ne ters gidebilir" tablosu yazıldı; her satırın önlemi var.
- [ ] Her dış çağrının açık bir zaman aşımı var; toplam bütçe hesaplandı.
- [ ] Yeniden deneme yalnız geçici hatalarda, sınırlı sayıda, üstel bekleme ve rastgele sapmayla, tek katmanda.
- [ ] Yeniden denenen her yazma işlemi idempotent; anahtar iş işleminden türüyor.
- [ ] Çift tıklama ve çift teslim denendi.
- [ ] Bağımlılık çökünce ürün ne yapıyor, denendi; kullanıcı ve günlük bunu görüyor.
- [ ] Yetki denetimleri kapalı başarısız oluyor.
- [ ] Yayının geri alma planı ve tetikleyicisi yazılı; yedek geri yükleme denenmiş.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her dış çağrı için şunları yaz ve uygula: zaman aşımı değeri, hangi hatalarda yeniden
  deneneceği, kaç kez, nasıl bekleneceği, idempotentliğin nasıl sağlandığı. Önce bu akış için 'ne ters gidebilir'
  tablosu çıkar." Ödeme ve silme işlerinde ayrıca: "Sonuç bilinmiyorsa yeniden yapma; durumu sorgula."
- **Modelin tipik hatası:** yalnız mutlu yolu yazar; idempotentlik olmadan yeniden deneme ekler; anahtarı her
  denemede yeniden üretir; `except Exception: pass` ile hatayı yutar; zaman aşımını çok uzun verir ya da hiç
  vermez; 400'lü hataları da yeniden dener; `Retry-After` başlığını yok sayar.
- **Çıktıda denetleyin:** `fetch`, `httpx`, `requests` çağrılarında zaman aşımı var mı; yeniden deneme döngüsünde
  hangi hatalar yakalanıyor; anahtar döngünün içinde mi dışında mı üretiliyor; yakalanan hatalar günlüğe yazılıyor mu.

## İlgili

- [Hata sınıfları ve imzaları](hata-siniflari.md): yarış ve çift kayıt imzaları.
- [İşi parçalama](isi-parcalama.md): genişlet → taşı → daralt dilimleri.
- [Tasarım kararı](tasarim-karari.md): dış servisleri tek modülün arkasına almak.
- Havuzdaki örnekler: [hız sınırı](../../uygulama/api/src/http/rateLimit.ts), eşitleme protokolü
  [ESITLEME.md](../../uygulama/docs/ESITLEME.md).
- Diğer kümelerden: [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md), [Dağıtım stratejileri](../60-devops/dagitim-stratejileri.md), [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md).
