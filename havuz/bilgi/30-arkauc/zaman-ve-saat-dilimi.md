---
baslik: Zaman ve saat dilimi: an, duvar saati, takvim günü ve yaz saati
ozet: UTC'de saklayıp yerelde göstermek, an ile duvar saatini ve takvim gününü ayırmak, yaz saati tuzakları, zamanlanmış iş ve saat dilimi, saat kayması, Türkiye'nin sabit UTC+3 durumu ve testte saati enjekte etmek.
etiketler: [zaman, saat-dilimi, tarih, test, turkce]
duzey: orta
guncellik: 2026-11
---

# Zaman ve saat dilimi: an, duvar saati, takvim günü ve yaz saati

> Bu notu ne zaman okumalı: tarih ya da saat saklayan, gösteren, karşılaştıran ya da zamanlayan her kodda;
> "doğum günü bir gün kaymış", "gece raporu dünün verisini gösteriyor", "hatırlatma bir saat geç geldi" ya da
> "test gece yarısından sonra düşüyor" şikâyetlerinde.

## Temel fikir

Üç ayrı şey vardır ve hepsi "tarih" diye anılır:

| Tür                       | Örnek                                         | Saat dilimiyle ilişkisi                                         |
| ------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| **An** (instant)          | Ödeme alındı, kullanıcı giriş yaptı           | Dünyada tek bir nokta; her yerde aynı an, farklı gösterim       |
| **Duvar saati** (yerel)   | "Her gün 09:00", "3 Mart 14:00 randevu"       | Bir dilime göre anlamlı; o dilimin kuralı değişirse an da değişir |
| **Takvim günü** (tarih)   | Doğum günü, son ödeme günü, resmî tatil       | Dilimsizdir; ana çevrilirse **gün kayar**                       |

Kural: **anı UTC'de saklayın, kullanıcının diliminde gösterin; duvar saatini dilim adıyla birlikte saklayın;
takvim gününü hiç ana çevirmeyin.** Ve kodun içinde "şimdi"yi doğrudan okumayın: saat dışarıdan verilir ki testte
istenen ana (yaz saati gecesi, İstanbul gece yarısı) sarılabilsin.

## Karar tablosu

| Veri                                          | Saklama                                             | Gösterim / hesap                                  |
| --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Olay anı (oluşturma, ödeme, giriş)            | UTC an: ISO metin `…Z` ya da `timestamptz`          | Kullanıcının diliminde                            |
| Gelecekteki yerel randevu                     | Yerel tarih-saat + dilim adı (`Europe/Istanbul`)    | Ana çevirme **kullanım anında**                   |
| Tekrarlayan yerel olay (her gün 09:00)        | Saat + dilim adı                                    | Her seferinde o günün kuralıyla hesapla           |
| Takvim günü                                   | `date` / `YYYY-AA-GG` metni                         | Aynen; dilime sokmadan                            |
| Süre ("30 dakika", "3 gün")                   | Saniye; "1 ay" gibi takvim süresi ayrı              | "1 ay" 30 gün değildir                            |
| Kullanıcının dilimi                           | Dilim **adı** (IANA), sabit fark değil              | Yaz saati ve kural değişikliği kendiliğinden      |

Sabit fark (`+03:00`) yalnız bir anı yazarken kullanılır; bir **kişinin** ya da **işletmenin** dilimi her zaman
ad olarak saklanır.

## JavaScript'in iki ayrıştırma tuzağı

```js calistir
import assert from 'node:assert/strict'

const gun = (an, timeZone) => new Intl.DateTimeFormat('tr-TR', { timeZone, dateStyle: 'long' }).format(an)

// TUZAK 1: tarih-yalnız metin UTC gece yarısı sayılır; batıdaki kullanıcıya BİR GÜN ÖNCE görünür
const dogumGunu = new Date('1990-05-20')
assert.equal(dogumGunu.toISOString(), '1990-05-20T00:00:00.000Z')
assert.equal(gun(dogumGunu, 'America/New_York'), '19 Mayıs 1990')

// TUZAK 2: saatli ama dilimsiz metin makinenin YEREL saatiyle okunur: aynı kod iki makinede iki farklı an
const makineler = ['UTC', 'Europe/Istanbul'].map((tz) => {
  process.env.TZ = tz // Node çalışırken dilimi değiştirmeye izin verir; burada iki makineyi taklit ediyoruz
  return new Date('2026-11-16T09:00').toISOString()
})
assert.deepEqual(makineler, ['2026-11-16T09:00:00.000Z', '2026-11-16T06:00:00.000Z'])

// DOĞRU: an her zaman dilimle (Z ya da +03:00) yazılır; takvim günü metin olarak kalır
assert.equal(new Date('2026-11-16T09:00:00+03:00').toISOString(), '2026-11-16T06:00:00.000Z')
const [y, a, g] = '1990-05-20'.split('-')
assert.equal(`${g}.${a}.${y}`, '20.05.1990')

// An (UTC) her kullanıcıya kendi diliminde gösterilir
const odeme = new Date('2026-11-16T21:30:00Z')
assert.equal(gun(odeme, 'Europe/Istanbul'), '17 Kasım 2026') // İstanbul'da ertesi gün 00:30
assert.equal(gun(odeme, 'UTC'), '16 Kasım 2026')
console.log('tamam')
```

```cikti
tamam
```

Takvim günü için tarayıcıdaki `<input type="date">` zaten `YYYY-AA-GG` metni verir: onu `new Date(...)`'e sokmadan
saklayın. Havuzdaki görev şeması son tarihi (`dueDate`) bu yüzden metin olarak tutar.

## Sunucu UTC'de, işletme İstanbul'da

```python calistir
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

IST, BER = ZoneInfo("Europe/Istanbul"), ZoneInfo("Europe/Berlin")


def bugun_istanbul(simdi_utc: datetime) -> date:  # saat dışarıdan verilir: test edilebilir
    return simdi_utc.astimezone(IST).date()


# 1) "Bugün" kimin bugünü? Gece 00:00–03:00 arası sunucunun UTC günü İstanbul'un bir gün gerisindedir
simdi = datetime(2026, 11, 16, 22, 30, tzinfo=timezone.utc)
assert simdi.date() == date(2026, 11, 16)  # YANLIŞ: sunucunun UTC günü
assert bugun_istanbul(simdi) == date(2026, 11, 17)  # DOĞRU: İstanbul'da 01:30, gün değişti

# 2) Türkiye 2016'dan beri sabit UTC+3; öncesinde yaz saati vardı. Eski veride "+3" sabit yazılmaz.
assert datetime(2015, 1, 15, 12, tzinfo=IST).utcoffset() == timedelta(hours=2)
assert datetime(2026, 1, 15, 12, tzinfo=IST).utcoffset() == timedelta(hours=3)


# 3) Yaz saati olan dilimde "her gün 09:00" UTC'de sabit bir saat DEĞİLDİR
def yerel_9_utc(gun: date) -> int:
    return datetime(gun.year, gun.month, gun.day, 9, tzinfo=BER).astimezone(timezone.utc).hour


assert (yerel_9_utc(date(2026, 3, 1)), yerel_9_utc(date(2026, 4, 1))) == (8, 7)  # UTC cron "0 8" Nisan'da 10'da çalışır

# 4) Python TUZAĞI: aynı tzinfo içinde aritmetik DUVAR SAATİYLE yapılır; yaz saati gecesinde gün 23 saattir
cumartesi = datetime(2026, 3, 28, 12, tzinfo=BER)
ertesi = cumartesi + timedelta(days=1)  # duvar saati: pazar 12:00
assert ertesi.hour == 12 and ertesi.astimezone(timezone.utc) - cumartesi.astimezone(timezone.utc) == timedelta(hours=23)
tam_24 = (cumartesi.astimezone(timezone.utc) + timedelta(hours=24)).astimezone(BER)  # an aritmetiği UTC'de
assert tam_24.hour == 13

# 5) Var olmayan ve iki kez yaşanan yerel saatler
olmayan = datetime(2026, 3, 29, 2, 30, tzinfo=BER)  # ileri alınan gecede 02:30 yok
assert olmayan.astimezone(timezone.utc).astimezone(BER).hour == 3  # sessizce 03:30'a kayar
iki_kez = [datetime(2026, 10, 25, 2, 30, fold=f, tzinfo=BER).astimezone(timezone.utc).hour for f in (0, 1)]
assert iki_kez == [0, 1]  # aynı duvar saati, iki farklı an
print("tamam")
```

```cikti
tamam
```

## Türkiye'ye özgü

- Türkiye 2016'dan beri yaz saati uygulamaz; dilim adı `Europe/Istanbul`, bugünkü fark sabit UTC+3. Yine de
  **farkı değil adı** saklayın: kural bir kararla değişebilir, saat dilimi veritabanı (tzdata) güncellenince adla
  saklanan veri kendiliğinden doğru kalır. 2016 öncesi veride yaz saati vardır (örnek 2).
- Müşterileriniz yurt dışındaysa (Almanya'daki kullanıcı) onların dilimi yaz saatlidir; "hep +3" varsayımı bozulur.
- İş günü hesabı: hafta sonu + sabit tarihli resmî tatiller + her yıl kayan dinî bayramlar (ay takvimi; liste olarak
  dışarıdan verilir) + yarım günler (arife). Hazır yardımcı: [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py)
  (sabit tatiller, iş günü ekleme, Türkçe biçim "16 Kasım 2026 Pazartesi"; TypeScript eşi `kutuphane/ts/src/tarih.ts`).
- Gösterim: `Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' })` ya da kitaplığın Türkçe biçimi; ay ve gün
  adlarını elle yazmayın.

## Takvim aritmetiği: ay sonu

"Bir ay sonra" 30 gün değildir ve ay sonunda belirsizdir: 31 Ocak + 1 ay = 28 (ya da 29) Şubat. Kuralı (ayın son
gününe kırp) bir kez yazın ve tekrarlayan hesapta **çapa tarihten** hesaplayın; bir önceki sonuçtan değil:

```python calistir
import calendar
from datetime import date


def ay_ekle(gun: date, ay: int) -> date:
    toplam = gun.month - 1 + ay
    yil, yeni_ay = gun.year + toplam // 12, toplam % 12 + 1
    return date(yil, yeni_ay, min(gun.day, calendar.monthrange(yil, yeni_ay)[1]))  # ayın son gününe kırp


assert ay_ekle(date(2026, 1, 31), 1) == date(2026, 2, 28)
assert ay_ekle(date(2028, 1, 31), 1) == date(2028, 2, 29)  # artık yıl
assert ay_ekle(ay_ekle(date(2026, 1, 31), 1), 1) == date(2026, 3, 28)  # YANLIŞ: zincirleme hesap kaydı
assert ay_ekle(date(2026, 1, 31), 2) == date(2026, 3, 31)  # DOĞRU: çapadan (31 Ocak) hesap
print("tamam")
```

```cikti
tamam
```

Abonelik yenileme gibi para ilgilendiren tarihlerde sağlayıcının kuralı geçerlidir; kendi hesabınızı onunla
karşılaştırın ([Ödeme tümleştirme](odeme-tumlestirme.md)).

## Zamanlanmış iş ve saat dilimi

- "Her gün 09:00" kullanıcıya göre bir duvar saatidir. Zamanlayıcıya UTC saati yazarsanız yaz saatli dilimde yılın
  yarısı bir saat kayar (örnek 3). Ya zamanlayıcı dilim adını desteklemeli ya da bir sonraki çalışma anı her
  seferinde dilim kuralıyla hesaplanmalıdır.
- Yaz saati gecesi: ileri alınan saatte 02:30'a kurulu iş **hiç** çalışmayabilir; geri alınan gecede **iki kez**
  çalışabilir. Bu saatlere iş koymayın ya da "bu dönem çalıştı mı" kaydıyla tekilleştirin
  ([Arka plan işleri](arka-plan-isleri.md)).
- Günlük raporun "dönemi" işletmenin dilimindeki tarihtir (örnek 1).
- Sonraki çalışma anını sabit farkla hesaplayan yardımcı (Türkiye için yeterli, yaz saatli dilim için değil):
  [`kutuphane/py/kutuphane/cron.py`](../../kutuphane/py/kutuphane/cron.py).
- Kullanıcıya özel bildirim saatleri (sessiz saatler, "her sabah 8'de özet") kullanıcının dilim adıyla hesaplanır.

## Saat kayması ve süre ölçme

- Makinelerin saatleri saniyeler (bazen dakikalar) farklıdır. Güvenlik kararını istemcinin saatine bırakmayın;
  sunucunun saatini kullanın. İmzalı belirteçte `exp`/`nbf` denetimine birkaç saniyelik pay verin.
- Farklı makinelerden gelen olayları zaman damgasına göre sıralamak güvenilmezdir; sıra gerekiyorsa veritabanının
  artan sayacı ya da sürüm alanı kullanılır.
- **Süre ölçmek** için duvar saati değil tekdüze saat (monotonic): Python `time.monotonic()`, Node
  `performance.now()`. Duvar saati zaman eşitlemesiyle ileri geri atlayabilir; zaman aşımı ve hız sınırı yanlış
  çalışır.

## Testte saati enjekte etmek

- "Şimdi" bir parametre ya da saat nesnesidir: havuzdaki API'de `Clock` arayüzü bütün modüllere bağlamla gelir,
  testler ileri sarılabilen saat verir ([`random.ts`](../../uygulama/api/src/lib/random.ts)). Kitaplık işlevleri de
  `now` parametresi alır.
- Mutlaka sınanacak anlar: İstanbul'da 23:59 ve 00:01 (UTC'de 20:59 ve 21:01), ay sonu ve artık yıl, yaz saatli bir
  dilimde ileri ve geri alınan geceler, yıl dönümü.
- Küresel saati yamayan araçlar (her `now()` çağrısını taklit eden) kırılgandır; enjekte edilen saat daha
  güvenilirdir.
- Testlerin geçip geçmemesi makinenin dilimine bağlı olmamalı: CI'yı bir kez `TZ=America/New_York` ile de koşturun.

## Tuzaklar

| Belirti                                                         | Neden                                                   | Çözüm                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Doğum günü/son tarih bir gün önce görünüyor                     | Takvim günü UTC gece yarısı anına çevrildi              | `YYYY-AA-GG` metni olarak saklayın ve gösterin               |
| Gece 00:00–03:00 arası raporlar dünün verisini gösteriyor       | "Bugün" sunucunun UTC gününe göre                       | İşletme diliminde tarih                                      |
| Hatırlatma yaz saatinde bir saat geç/erken                      | Duvar saati UTC'de sabit saat olarak kuruldu            | Dilim adıyla, her seferinde hesap                            |
| Aynı kod sunucuda ve telefonda farklı an üretiyor               | Dilimsiz `"2026-11-16T09:00"` yerel saatle okunuyor     | Anı her zaman `Z` ya da farkla yazın                         |
| 2015 öncesi kayıtlarda bir saat kayma                           | Türkiye için sabit +3 varsayıldı                        | Dilim adıyla çevirin                                         |
| "1 gün sonra" bir saat erken/geç düşüyor                        | Python'da aynı dilimde aritmetik duvar saatiyle         | An aritmetiğini UTC'de yapın; niyeti açık yazın              |
| Abonelik tarihleri her ay bir gün geri kayıyor                  | Ay ekleme önceki sonuçtan zincirleme                    | Çapa tarihten hesap                                          |
| Testler gece yarısından sonra ya da başka makinede düşüyor      | Kodda `now()` doğrudan; makine dilimine bağımlı         | Saati enjekte edin; testi başka dilimle de koşun             |
| Zaman aşımı ara sıra hemen doluyor ya da hiç dolmuyor           | Süre duvar saatiyle ölçülüyor                           | Tekdüze saat                                                 |

## Denetim listesi

- [ ] Anlar UTC'de (`…Z` / `timestamptz`) saklanıyor; dilimsiz tarih-saat metni yok.
- [ ] Takvim günleri tarih olarak saklanıyor; hiçbir yerde ana çevrilmiyor.
- [ ] Kullanıcının ve işletmenin dilimi ad olarak saklanıyor; gösterim o dilimde.
- [ ] "Bugün", dönem, rapor günü işletmenin dilimine göre hesaplanıyor.
- [ ] Tekrarlayan yerel işler dilim adıyla hesaplanıyor; yaz saati gecelerine iş konmuyor ya da tekilleştiriliyor.
- [ ] Ay ekleme kuralı tek yerde; tekrarlarda çapadan hesaplanıyor.
- [ ] Kodda doğrudan `now()` yok; saat enjekte ediliyor; sınır anları testli.
- [ ] Süre ölçümü tekdüze saatle; belirteç süre denetiminde saat kayması payı var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Anı UTC ISO metin olarak sakla (`toISOString()`), takvim gününü `YYYY-AA-GG` metni olarak; ikisini
  karıştırma. 'Bugün'ü `Europe/Istanbul` diliminde hesapla. Saat parametre olarak gelsin; İstanbul 23:59/00:01 ve
  ay sonu için test yaz."
- **Tipik hatalar:** `new Date('2026-05-20')` ile doğum günü; `datetime.now()` (dilimsiz) ya da `date.today()`
  sunucuda; sabit `+3` saat eklemek; `setHours(0,0,0,0)` ile "günün başı" bulmak (makinenin diliminde çalışır);
  cron'u UTC saatiyle yerel saat sanmak; ay eklemeyi 30 gün eklemek.
- **Çıktıda arayın:** `new Date(` içine tarih-yalnız ya da dilimsiz metin, `date.today()`, `datetime.now()` (argümansız),
  `utcnow()`, `+ 3 * 60 * 60`, `setHours(0`, `timedelta(days=30)`.

## İlgili

- [Veritabanı tasarımı](veritabani-tasarimi.md) (zaman sütun türleri) · [Arka plan işleri](arka-plan-isleri.md)
  (zamanlanmış işler) · [Sunucu mimarisi](sunucu-mimarisi.md) (bağımlılıkları dışarıdan verme) ·
  [E-posta ve bildirim](e-posta-ve-bildirim.md) (sessiz saatler)
- Türkçe tarih biçimleri ve yerelleştirme denetimi: [Yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md).
- Makineler arası saat farkı ve sıralama: [Dağıtık sistem yanılgıları](../40-sistem-tasarimi/dagitik-sistem-yanilgilari.md).
