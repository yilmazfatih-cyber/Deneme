---
baslik: Hata yönetimi kalıpları
ozet: İstisna mı sonuç tipi mi, hata nerede yakalanır, sarmalama ve bağlam ekleme, hangi hatada yeniden denenir, kullanıcıya ve geliştiriciye dönük ileti, kaynak temizliği; TypeScript ve Python yan yana.
etiketler: [hata-yonetimi, typescript, python, yeniden-deneme, guvenilirlik]
duzey: orta
guncellik: 2026-11
---

# Hata yönetimi kalıpları

> Bu notu ne zaman okumalı: `try/catch`, `try/except` yazarken; bir işlev hata durumunda ne döndürmeli diye
> düşünürken; kullanıcıya hata iletisi gösterirken; ağ isteği ya da veritabanı işlemi için yeniden deneme eklerken;
> günlükte aynı hata üç kez görünüyorsa ya da hiç görünmüyorsa.

## Temel fikir

- İki tür hata vardır: **beklenen** (kullanıcı yanlış girdi, kayıt yok, ağ geçici olarak yok) ve **beklenmeyen**
  (programlama hatası, bozuk durum). Beklenen hata iş akışının parçasıdır ve ele alınır; beklenmeyen hata
  gizlenmez, en üst sınıra kadar yükselir, günlüğe yazılır.
- Hata **yalnız iki yerde** yakalanır: (1) onu gerçekten ele alabildiğiniz yerde (yeniden deneme, yedek değer,
  kullanıcıya soru), (2) **sınırda** (HTTP işleyicisi, komut satırı `main`, kuyruk işçisi, arayüz olay işleyicisi).
  Aradaki katmanlar ya bağlam ekleyip yeniden atar ya da hiç dokunmaz.
- Her hata **bir kez** günlüğe yazılır: sınırda. "Yaz ve yeniden at" her katmanda aynı hatayı çoğaltır.
- Kullanıcı iletisi ile geliştirici iletisi ayrıdır. Kullanıcı Türkçe, suçlamayan, ne yapacağını söyleyen bir ileti
  görür; geliştirici iz (stack trace), girdi, bağlam ve bir **olay kimliği** görür. İkisi aynı kimlikle bağlanır.
- Yeniden deneme yalnız **geçici** hatada ve yalnız **yan etkisiz** (idempotent) işlemde yapılır.

## Karar tablosu

| Durum                                                     | Seçim                                           | Neden                                              |
| --------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Çağıranın mutlaka ele alması gereken beklenen sonuç (ayrıştırma, doğrulama, "bulunamadı") | Sonuç tipi (`Result`)    | Tipte görünür; unutulamaz                         |
| Programlama hatası, imkânsız durum, bozuk ayar             | İstisna fırlat                                  | Ele alınamaz; erken ve gürültülü düşmeli           |
| Derin çağrı zincirinde G/Ç hatası (disk, ağ)               | İstisna; sınırda yakala                          | Her katmanda `Result` taşımak kodu boğar           |
| Form doğrulama                                            | Bütün alan hatalarını **birlikte** döndür        | Kullanıcı tek tek düzeltip yeniden göndermesin     |
| Toplu iş (100 satır içe aktarma)                          | Satır başına sonuç; sonunda rapor                | Bir satır bütün işi durdurmasın                   |
| Kritik olmayan yan iş (analitik olayı, önbellek yazma)     | Yakala, günlüğe yaz, devam et                    | Asıl işi bozmasın; ama sessiz de kalmasın          |

## Sonuç tipi ve istisna: TypeScript

```ts calistir
import assert from 'node:assert/strict'

type Sonuc<T, H> = { ok: true; deger: T } | { ok: false; hata: H }
const tamam = <T,>(deger: T): Sonuc<T, never> => ({ ok: true, deger })
const basarisiz = <H,>(hata: H): Sonuc<never, H> => ({ ok: false, hata })

type TutarHatasi = 'bos' | 'bicim' | 'negatif'

// Beklenen hatalar tipte: çağıran ele almadan değere ulaşamaz
function tutarOku(girdi: string): Sonuc<number, TutarHatasi> {
  const temiz = girdi.trim().replaceAll('.', '').replace(',', '.')
  if (temiz === '') return basarisiz('bos')
  const sayi = Number(temiz)
  if (!Number.isFinite(sayi)) return basarisiz('bicim')
  if (sayi < 0) return basarisiz('negatif')
  return tamam(Math.round(sayi * 100)) // kuruş
}

const ILETI: Record<TutarHatasi, string> = {
  bos: 'Tutar yazın.',
  bicim: 'Tutarı 1.250,50 biçiminde yazın.',
  negatif: 'Tutar sıfırdan küçük olamaz.',
}

function goster(girdi: string): string {
  const s = tutarOku(girdi)
  return s.ok ? `${s.deger} kuruş` : ILETI[s.hata]
}
assert.equal(goster('1.250,50'), '125050 kuruş')
assert.equal(goster('on lira'), 'Tutarı 1.250,50 biçiminde yazın.')
assert.equal(goster(' '), 'Tutar yazın.')

// Beklenmeyen durum: istisna (sonuç tipine sokmayın)
function oranHesapla(pay: number, payda: number): number {
  if (payda === 0) throw new Error('oranHesapla: payda 0 olamaz (çağıran denetlemeliydi)')
  return pay / payda
}
assert.throws(() => oranHesapla(1, 0), /payda 0/)
console.log('tamam')
```

`ILETI` tablosu `Record<TutarHatasi, string>` olduğu için yeni bir hata kodu eklenip iletisi unutulursa derleme
hatası çıkar. Havuzdaki tam gerçekleme: [`kutuphane/ts/src/sonuc.ts`](../../kutuphane/ts/src/sonuc.ts).

## Sarmalama, bağlam ve sınır

Alt katmanın hatası üst katmanın diliyle yeniden atılır, **asıl hata `cause` olarak saklanır**. Sınır, hatayı
kullanıcı iletisine ve günlük kaydına ayırır:

```ts calistir
import assert from 'node:assert/strict'

type HataKodu = 'bulunamadi' | 'gecici' | 'dogrulama'

class UygulamaHatasi extends Error {
  readonly kod: HataKodu // alan açıkça yazılır: kurucu parametre özelliği Node'da çalışmaz
  constructor(kod: HataKodu, ileti: string, secenekler?: { cause?: unknown }) {
    super(ileti, secenekler)
    this.name = 'UygulamaHatasi'
    this.kod = kod
  }
}

const KULLANICI_ILETISI = {
  bulunamadi: 'Aradığınız kayıt bulunamadı.',
  gecici: 'Şu an yanıt veremiyoruz. Birazdan yeniden deneyin.',
  dogrulama: 'Bilgileri denetleyip yeniden gönderin.',
  bilinmeyen: 'Beklenmedik bir sorun oldu. Sorun sürerse destek ekibine bu kodu iletin',
} as const

// Alt katman: veritabanı sürücüsünün hatası
function sorgula(): never {
  throw new Error('SQLITE_BUSY: database is locked')
}
// Orta katman: bağlam ekle, asıl hatayı cause'da sakla
function randevuGetir(id: string): never {
  try {
    sorgula()
  } catch (e) {
    throw new UygulamaHatasi('gecici', `randevu ${id} okunamadı`, { cause: e })
  }
}

// Sınır: tek yerde yakala, bir kez günlüğe yaz, kullanıcıya güvenli ileti ver
const gunluk: string[] = []
function isleyici(id: string, olayKimligi: string): { durum: number; govde: unknown } {
  try {
    randevuGetir(id)
    return { durum: 200, govde: {} }
  } catch (e) {
    const kod = e instanceof UygulamaHatasi ? e.kod : 'bilinmeyen'
    const neden = e instanceof Error && e.cause instanceof Error ? e.cause.message : ''
    gunluk.push(`[${olayKimligi}] ${kod}: ${e instanceof Error ? e.message : String(e)} | neden: ${neden}`)
    const durum = kod === 'gecici' ? 503 : kod === 'bulunamadi' ? 404 : kod === 'dogrulama' ? 422 : 500
    return { durum, govde: { hata: { kod, ileti: KULLANICI_ILETISI[kod], olayKimligi } } }
  }
}

const yanit = isleyici('r42', 'ab12')
assert.equal(yanit.durum, 503)
assert.doesNotMatch(JSON.stringify(yanit.govde), /SQLITE|locked/) // iç ayrıntı kullanıcıya sızmadı
assert.deepEqual(gunluk, ['[ab12] gecici: randevu r42 okunamadı | neden: SQLITE_BUSY: database is locked'])
console.log('tamam')
```

Havuzdaki API'nin hata sözleşmesi (kod + Türkçe ileti, tek sözlük): [`uygulama/shared/src/errors.ts`](../../uygulama/shared/src/errors.ts).

## Aynı kalıplar: Python

```python calistir
import traceback


class UygulamaHatasi(Exception):
    def __init__(self, kod: str, ileti: str) -> None:
        super().__init__(ileti)
        self.kod = kod


def ayar_oku(metin: str) -> int:
    try:
        return int(metin)
    except ValueError as hata:
        yeni = UygulamaHatasi("dogrulama", "Ayar okunamadı: ayar.toml")
        yeni.add_note("alan: zaman_asimi (saniye, tamsayı)")  # 3.11+: ize ek bilgi
        raise yeni from hata  # asıl hata __cause__ olarak korunur


try:
    ayar_oku("on beş")
except UygulamaHatasi as hata:
    iz = "".join(traceback.format_exception(hata))
    assert hata.kod == "dogrulama"
    assert isinstance(hata.__cause__, ValueError)
    assert "direct cause of the following exception" in iz and "alan: zaman_asimi" in iz

# YANLIŞ: her katmanda "yaz ve yeniden at" → aynı hata günlükte üç kez
gunluk: list[str] = []


def katman(ad: str, alt) -> None:
    try:
        alt()
    except Exception as hata:
        gunluk.append(f"{ad}: {hata}")
        raise


def en_alt() -> None:
    raise OSError("disk dolu")


try:
    katman("üst", lambda: katman("orta", lambda: katman("alt", en_alt)))
except OSError:
    pass
assert len(gunluk) == 3  # tek olay, üç kayıt: hangisi asıl? Sınırda bir kez yazın.
print("tamam")
```

`raise … from None` asıl hatayı gizler; yalnız asıl hata gerçekten anlamsızsa (ör. `KeyError` yerine anlamlı bir
"bulunamadı" hatası) kullanın.

## Yeniden deneme: hangi hatada, nasıl

| Hata                                                        | Yeniden dene? | Neden                                          |
| ----------------------------------------------------------- | ------------- | ---------------------------------------------- |
| Bağlantı koptu, zaman aşımı, DNS geçici hatası                | Evet          | Geçici                                         |
| HTTP 429 (çok fazla istek)                                  | Evet, `Retry-After` kadar bekleyerek | Karşı taraf yavaşlamanızı istiyor |
| HTTP 502, 503, 504 (ve 408)                                  | Evet          | Ara katman ya da sunucu geçici olarak yok       |
| HTTP 500                                                    | Dikkatle      | Kalıcı bir hata da olabilir; sınırlı deneyin    |
| HTTP 400, 401, 403, 404, 409, 422                            | **Hayır**     | Aynı istek aynı sonucu verir                    |
| SQLite `database is locked`, PostgreSQL serileştirme hatası    | Evet (işlemi baştan) | Eşzamanlılık çakışması                  |
| Doğrulama hatası, programlama hatası (`TypeError`)            | **Hayır**     | Kalıcı                                          |

Kurallar: üstel geri çekilme + **titreme** (jitter, aynı anda çöken istemciler aynı anda geri gelmesin), deneme sayısı
ve toplam süre sınırı, yan etkili işlemde (ödeme, e-posta) **idempotency anahtarı** olmadan yeniden deneme yok.

```python calistir
import random


class GeciciHata(Exception):
    pass


class KaliciHata(Exception):
    pass


def yeniden_dene(is_, *, deneme=4, taban=0.2, ust=5.0, uyu, rastgele):
    """Yalnız GeciciHata'da yeniden dener. uyu/rastgele dışarıdan verilir: test beklemeden koşar."""
    for n in range(1, deneme + 1):
        try:
            return is_()
        except GeciciHata:
            if n == deneme:
                raise
            uyu(rastgele.uniform(0, min(ust, taban * 2 ** (n - 1))))  # "tam" titreme


beklemeler: list[float] = []
cagri = {"n": 0}


def kararsiz_servis():
    cagri["n"] += 1
    if cagri["n"] < 3:
        raise GeciciHata("503")
    return "tamam"


rng = random.Random(42)  # tohumlu: test belirlenimci
assert yeniden_dene(kararsiz_servis, uyu=beklemeler.append, rastgele=rng) == "tamam"
assert cagri["n"] == 3 and len(beklemeler) == 2
assert 0 <= beklemeler[0] <= 0.2 and 0 <= beklemeler[1] <= 0.4  # üst sınır her denemede ikiye katlanır


def kalici():
    cagri["n"] += 1
    raise KaliciHata("422: doğrulama")


cagri["n"] = 0
try:
    yeniden_dene(kalici, uyu=beklemeler.append, rastgele=rng)
except KaliciHata:
    pass
assert cagri["n"] == 1  # kalıcı hatada tek deneme
print("tamam")
```

Tam gerçekleme (iptal, `Retry-After`, toplam süre sınırı, async biçim): [`kutuphane/py/kutuphane/yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py),
[`kutuphane/ts/src/yeniden_dene.ts`](../../kutuphane/ts/src/yeniden_dene.ts).

## Kullanıcıya dönük ve geliştiriciye dönük ileti

| Kullanıcı iletisi                                   | Geliştirici kaydı (günlük)                                   |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Türkçe, kısa, suçlamayan: "Bağlantı kurulamadı."     | Hata adı, ileti, iz, `cause` zinciri                         |
| Ne yapacağını söyler: "Birazdan yeniden deneyin."    | Girdi (kişisel veri ve sır **hariç**), kullanıcı kimliği      |
| Olay kimliği: "Destek için kod: ab12"                | Aynı olay kimliği, zaman, sürüm                              |
| İç ayrıntı **yok**: SQL, dosya yolu, iz, sunucu adı    | Bağımlı servisin yanıt kodu ve süresi                        |

Kötü kullanıcı iletileri: "Hata oluştu", "Geçersiz giriş!", "Error: ECONNREFUSED", "Yanlış şifre girdiniz" (suçlar;
güvenlik için de "e-posta ya da parola hatalı" deyin). Hata iletisi yazımı: [Arayüz dili](../97-turkce/arayuz-dili.md).

## Kaynak temizliği

```python calistir
from contextlib import ExitStack

olaylar: list[str] = []


class Kaynak:
    def __init__(self, ad: str) -> None:
        self.ad = ad
        olaylar.append(f"aç {ad}")

    def kapat(self) -> None:
        olaylar.append(f"kapat {self.ad}")


try:
    with ExitStack() as yigin:  # değişken sayıda kaynak; ters sırayla ve hata olsa da kapatır
        for ad in ("veritabanı", "dosya", "kilit"):
            kaynak = Kaynak(ad)
            yigin.callback(kaynak.kapat)
        raise RuntimeError("iş yarıda kaldı")
except RuntimeError:
    pass
assert olaylar == ["aç veritabanı", "aç dosya", "aç kilit", "kapat kilit", "kapat dosya", "kapat veritabanı"]
print("tamam")
```

TypeScript'te karşılığı `try { … } finally { kaynak.kapat() }`'tır. `using` bildirimi (TypeScript 5.2+) Node
22.23.4'te yerel olarak **çalışmaz** (sözdizimi hatası; denendi); derleyici dönüştürmeden kullanmayın. Temizlik kodu
kendi hatasını asıl hatanın üstüne yazmamalıdır: `finally` içinde atılan istisna asıl hatayı kaybettirir.

## Tuzaklar

| Belirti                                                       | Neden                                                  | Çözüm                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Hata yok ama veri yanlış ya da eksik                            | Boş `catch`, `except: pass`, `.catch(() => {})`         | Ya ele alın ya bağlamla yeniden atın; sınırda günlüğe yazın  |
| Aynı hata günlükte birçok kez                                   | Her katmanda "yaz ve yeniden at"                         | Yalnız sınırda yazın                                         |
| Günlükte "Error: undefined" ya da yalnız üst katmanın iletisi    | Sarmalarken asıl hata atıldı                            | `{ cause: e }` / `raise … from e`                            |
| Kullanıcı SQL, dosya yolu ya da iz görüyor                       | Ham hata iletisi yanıta konmuş                          | Kod → Türkçe ileti eşlemesi; ayrıntı yalnız günlükte         |
| Kullanıcı "hata oluştu" görüyor, ne yapacağını bilmiyor           | İleti kod başına yazılmamış                             | Her hata kodu için eylem söyleyen ileti                      |
| Ödeme ya da e-posta iki kez gitti                               | Yan etkili işlem kör yeniden denendi                    | Idempotency anahtarı; yalnız geçici hatada deneme            |
| Geçici kesintiden sonra sunucu çöktü                             | Bütün istemciler aynı anda, beklemeden yeniden denedi    | Üstel geri çekilme + titreme + üst sınır                     |
| Doğrulama hatası 5 kez yeniden denendi                           | Hata sınıfı ayrılmamış                                  | Geçici/kalıcı ayrımı; 4xx yeniden denenmez                   |
| `catch (e)` içinde `e.message` derlenmiyor                       | TypeScript'te `e` `unknown`                              | `e instanceof Error ? e.message : String(e)`                 |
| Form her gönderişte tek bir hata gösteriyor                      | İlk hatada durulmuş                                     | Bütün alan hatalarını birlikte döndürün                      |
| Temizlik sırasında asıl hata kayboldu                            | `finally` içinde ikinci istisna                          | Temizliği kendi `try`'ına alın; `ExitStack`                  |

## Denetim listesi

- [ ] Beklenen hatalar tipte (sonuç tipi ya da belgelenmiş istisna sınıfı); beklenmeyenler fırlatılıyor.
- [ ] Yakalama yalnız ele alınabilen yerde ve sınırda; boş `catch`/`except` yok.
- [ ] Sarmalanan her hata asıl hatayı `cause` / `from` ile taşıyor.
- [ ] Her hata bir kez, sınırda, olay kimliğiyle günlüğe yazılıyor; günlükte parola, belirteç, kişisel veri yok.
- [ ] Kullanıcı iletileri tek bir sözlükte, Türkçe, eylem söyleyen; iç ayrıntı içermiyor.
- [ ] Yeniden deneme yalnız geçici hatada, sınırlı, üstel + titremeli; yan etkili işlemde idempotency anahtarı var.
- [ ] Bütün kaynaklar `with` / `finally` / `ExitStack` ile kapanıyor.
- [ ] Testlerde hata yolları da var: geçici hata sonrası başarı, kalıcı hatada tek deneme, kullanıcıya sızmayan ayrıntı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Beklenen hataları sonuç tipiyle döndür, beklenmeyenleri fırlat. Hata yakalamayı yalnız sınırda
  yap ve orada bir kez günlüğe yaz. Sarmalarken `cause` kullan. Kullanıcı iletilerini hata kodundan sözlükle üret.
  Yeniden denemeyi yalnız geçici hatalarda, üstel bekleme ve titremeyle yap."
- **Modelin tipik hatası:** Her işlevi `try/catch` ile sarar ve `console.error(e)` ile yutar; hatayı yeni bir
  `Error(e.message)` ile atıp izi kaybeder; ham `e.message`'ı kullanıcıya gösterir; her hatayı yeniden dener;
  `except Exception: return None` yazar.
- **Çıktıda arayın:** `catch {`, `catch (e) {}` , `console.error(e)` ardından devam, `except Exception`, `return None`
  içeren `except`, `new Error(e.message)`, yanıt gövdesinde `e.message`, sınırsız `while True` yeniden deneme.
- **Test isteyin:** "Bağımlı servis önce iki kez 503, sonra 200 döndürsün; bir kez de 422 döndürsün. Deneme sayılarını
  ve kullanıcıya giden iletiyi doğrula."

## İlgili

- [JavaScript async kalıpları](javascript-async.md): Promise hataları, zaman aşımı
- [Python eşzamanlılık](python-eszamanlilik.md): iptal ve `CancelledError`
- [Python tuzakları](python-tuzaklar.md): istisna yutma
- [TypeScript tip sistemi](typescript-tip-sistemi.md): ayrık birleşim ve `never`
- Sonuç tipi (Python): [`kutuphane/py/kutuphane/sonuc.py`](../../kutuphane/py/kutuphane/sonuc.py)
- [Hata yönetimi ve günlükleme (arka uç)](../30-arkauc/hata-yonetimi-ve-gunlukleme.md): merkezi işleyici, istek kimlikli günlük
- [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md): zaman aşımı bütçesi, devre kesici, yeniden deneme bütçesi
- [Gözlemlenebilirlik](../40-sistem-tasarimi/gozlemlenebilirlik.md): günlük, ölçüt, iz ve uyarı
