---
baslik: API tasarımı: kaynaklar, hatalar, sayfalama, sürümleme ve idempotentlik
ozet: Yıllarca bozulmadan büyüyen bir HTTP API için adlandırma, hata gövdesi, sayfalama, süzme, kısmi güncelleme, sürümleme, idempotentlik anahtarı ve uzun süren işlem kalıpları.
etiketler: [api, rest, sayfalama, idempotentlik, surumleme]
duzey: orta
guncellik: 2026-11
---

# API tasarımı: kaynaklar, hatalar, sayfalama, sürümleme ve idempotentlik

> Bu notu ne zaman okumalı: yeni bir uç ya da yeni bir API tasarlarken, bir alanı yeniden adlandırmak ya da
> silmek istediğinizde, "liste çok uzadı", "ödeme iki kez alındı" ya da "mobil uygulama güncellemeden sonra
> bozuldu" şikâyeti geldiğinde.

## Temel fikir

API, kodunuzdan uzun yaşayan bir **sözleşmedir**. Mobil uygulamanın eski sürümleri, başka ekiplerin betikleri,
bağladığınız servisler yıllarca aynı biçimi bekler. Bu yüzden ilk günden dört şey doğru kurulur, çünkü sonradan
değiştirmek kırıcıdır:

1. Her hata **makinece okunur bir kod** taşır (istemci metne değil koda göre davranır).
2. Her liste **sayfalanır** (bugün 20 kayıt, yarın 200 000).
3. Her oluşturma isteği **yeniden denenebilir** (ağ koptuğunda ikinci sipariş doğmaz).
4. Değişiklikler **eklemeli** yapılır: alan eklenir, var olan alanın anlamı değişmez.

## Kaynak adlandırma

| Kural                                             | Örnek                                          | Neden                                         |
| ------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Kaynak adı çoğul isim                             | `GET /invoices`, `GET /invoices/{id}`          | Liste ve tek kayıt aynı kökte                 |
| İç içelik en çok bir düzey                        | `GET /workspaces/{id}/members`                 | Derin yol, kimliği bilinen kaynağa gereksiz   |
| Durum değiştiren eylem alt kaynak olarak          | `POST /orders/{id}/cancel`                     | "İptal" bir alan güncellemesi değil, iş kuralı |
| Kimlikler metin                                   | `"id": "0193a5c8-…"`                           | Sayısal kimlik JS'de 2^53'te bozulur          |
| Zaman ISO 8601, UTC, `Z` ile                      | `"createdAt": "2026-11-16T09:00:00.000Z"`      | Saat dilimi tartışması biter                  |
| Para: küçük birim tamsayı + para birimi           | `{"amountMinor": 15000, "currency": "TRY"}`    | Ondalık sayı yuvarlama hatası yapar           |
| Alan adı biçimi tek (camelCase ya da snake_case)  | `createdAt` her yerde                          | İstemci dönüştürücü yazmasın                  |
| Mantıksal alan adı tek anlamlı                    | `disabled`, `emailVerified`; `notDisabled` yok | Çifte olumsuzluk hata doğurur                 |

Adres dili: kod tanımlayıcılarıyla aynı dil (havuzda İngilizce: `/api/workspaces`). Kullanıcı adresi görmez.

## Tutarlı hata gövdesi

Bütün hatalar tek biçimde döner. Havuzdaki API'nin biçimi (sözleşme:
[`shared/src/errors.ts`](../../uygulama/shared/src/errors.ts)):

```json
{ "error": { "code": "validation", "message": "Geçerli bir e-posta yazın.", "details": [{ "path": "email", "message": "Geçerli bir e-posta yazın." }] } }
```

| Alan      | Kim kullanır     | Kural                                                                 |
| --------- | ---------------- | --------------------------------------------------------------------- |
| `code`    | istemci kodu     | Sabit, İngilizce, küçük harf. **Bir kez yayınlanınca anlamı değişmez** |
| `message` | kullanıcı        | Türkçe, suçlamayan, ne yapılacağını söyleyen; değişebilir             |
| `details` | form             | Alan yolu → ileti; istemci hatayı doğru kutunun altına yazar          |

Standart bir biçim isteyen için RFC 9457 "problem details" (`application/problem+json`: `type`, `title`,
`status`, `detail`) vardır; seçim değil **tutarlılık** önemlidir. Yanıtta istek kimliği (`X-Request-Id`) olsun;
500'de ayrıntı yalnız günlükte ([Hata yönetimi ve günlükleme](hata-yonetimi-ve-gunlukleme.md)).

## Sayfalama

| Durum                                                         | Seçim                    | Neden                                                 |
| ------------------------------------------------------------- | ------------------------ | ----------------------------------------------------- |
| Yönetim paneli, toplam küçük (< birkaç bin), "5. sayfaya git" | Ofset (`page`, `limit`)  | Basit; sayfa numarası gösterilebilir                  |
| Akış, zaman çizelgesi, sürekli kayıt eklenen liste            | İmleç (keyset)           | Ekleme/silmede kayıt yinelenmez, atlanmaz             |
| Büyük tablo (yüz binler+)                                     | İmleç                    | `OFFSET 100000` atlanan satırları yine okur, yavaşlar |
| Dışa aktarım, eşitleme, toplu işleme                          | İmleç (artan kimlik/sürüm) | Kaldığı yerden devam edilebilir                     |

Ofsetin kusuru çalışırken görülür: kullanıcı ilk sayfayı okurken yeni kayıt gelir, ikinci sayfada bir kayıt
yinelenir (silme olsaydı biri atlanırdı).

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE ileti (id INTEGER PRIMARY KEY, metin TEXT)")
db.executemany("INSERT INTO ileti (metin) VALUES (?)", [(f"ileti {i}",) for i in range(1, 8)])


def ofsetle(sayfa: int, boyut: int = 3) -> list[int]:
    sql = "SELECT id FROM ileti ORDER BY id DESC LIMIT ? OFFSET ?"
    return [r[0] for r in db.execute(sql, (boyut, (sayfa - 1) * boyut))]


def imlecle(son_gorulen: int | None, boyut: int = 3) -> list[int]:
    if son_gorulen is None:
        return [r[0] for r in db.execute("SELECT id FROM ileti ORDER BY id DESC LIMIT ?", (boyut,))]
    sql = "SELECT id FROM ileti WHERE id < ? ORDER BY id DESC LIMIT ?"
    return [r[0] for r in db.execute(sql, (son_gorulen, boyut))]


ilk_ofset, ilk_imlec = ofsetle(1), imlecle(None)
assert ilk_ofset == ilk_imlec == [7, 6, 5]
db.execute("INSERT INTO ileti (metin) VALUES ('yeni')")  # kullanıcı okurken yeni ileti geldi
assert ofsetle(2) == [5, 4, 3]  # 5 İKİNCİ KEZ geldi
assert imlecle(ilk_imlec[-1]) == [4, 3, 2]  # imleç kaymaz
print("ofset yineledi, imleç yinelemedi")
```

```cikti
ofset yineledi, imleç yinelemedi
```

İmleç kuralları:

- Sıralama **tekil** olmalı. Tarihe göre sıralıyorsanız son anahtar olarak kimliği ekleyin; yoksa aynı saniyedeki
  kayıtlar sayfa sınırında kaybolur. Satır değeri karşılaştırması bunu tek koşulda yazar:

```sql calistir
CREATE TABLE siparis (id INTEGER PRIMARY KEY, olusturma TEXT NOT NULL);
INSERT INTO siparis VALUES (1, '2026-11-16T10:00Z'), (2, '2026-11-16T10:00Z'), (3, '2026-11-16T10:00Z'), (4, '2026-11-16T11:00Z');
-- İlk sayfa 4, 3 idi; imleç = son satırın (olusturma, id) çifti. Yalnız "olusturma <" yazsaydık 2 ve 1 kaybolurdu.
SELECT id FROM siparis WHERE (olusturma, id) < ('2026-11-16T10:00Z', 3) ORDER BY olusturma DESC, id DESC LIMIT 2;
```

```cikti
2
1
```

- İmleç istemciye **opak** metin olarak verilir (son anahtarın base64url JSON'u); istemci içini yorumlamaz.
  Kurcalama önemliyse imzalayın. Hazır yardımcı: [`kutuphane/py/kutuphane/sayfalama.py`](../../kutuphane/py/kutuphane/sayfalama.py)
  (TypeScript eşi `kutuphane/ts/src/sayfalama.ts`).
- Yanıt biçimi: `{ "items": [...], "nextCursor": "…" | null }`. `limit`'e üst sınır koyun (ör. 100); sınırsız
  `limit` tek istekle bütün tabloyu çeker.
- "Toplam kayıt sayısı" büyük tabloda pahalıdır (`count(*)` tam tarama). Gerekmedikçe vermeyin.
- Havuzdaki örnek: yönetim listesinde UUIDv7 kimlikle imleç ([`admin/repo.ts`](../../uygulama/api/src/modules/admin/repo.ts)),
  eşitlemede alan sürümüyle (`rev`) imleç ([`sync/repo.ts`](../../uygulama/api/src/modules/sync/repo.ts)).

## Süzme ve sıralama

- Süzgeç ve sıralama alanları **izin listesinden** gelir. SQL'de yer tutucu yalnız **değer** taşır; sütun adı,
  `ASC/DESC` taşıyamaz. `ORDER BY ?` hata vermez ama hiç sıralamaz; bunu gören model metne gömer ve SQL
  enjeksiyonu açar.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE urun (ad TEXT, fiyat INTEGER)")
db.executemany("INSERT INTO urun VALUES (?, ?)", [("simit", 15), ("çay", 10), ("poğaça", 20)])

# YANLIŞ 1: yer tutucu sütun adı değildir; sabit bir metne göre sıralar = hiç sıralamaz
assert [r[0] for r in db.execute("SELECT ad FROM urun ORDER BY ?", ("fiyat",))] == ["simit", "çay", "poğaça"]
# YANLIŞ 2: f"... ORDER BY {kullanici_girdisi}" → SQL enjeksiyonu
# DOĞRU: izin listesi; sütun adı koddan gelir, kullanıcıdan değil
SIRALAMA = {"fiyat": "fiyat ASC", "-fiyat": "fiyat DESC", "ad": "ad ASC"}


def listele(sira: str) -> list[str]:
    if sira not in SIRALAMA:
        raise ValueError(f"sıralama şunlardan biri olmalı: {', '.join(SIRALAMA)}")  # → 400
    return [r[0] for r in db.execute(f"SELECT ad FROM urun ORDER BY {SIRALAMA[sira]}, rowid")]


assert listele("-fiyat") == ["poğaça", "simit", "çay"]
try:
    listele("fiyat; DROP TABLE urun")
    raise AssertionError("reddedilmeliydi")
except ValueError:
    pass
print("tamam")
```

```cikti
tamam
```

- Biçim: `?status=open&sort=-createdAt` yeterlidir. Kendi sorgu dilinizi icat etmeyin; gerekirse arama ucu açın
  ([Arama](arama.md)).
- Metin süzgecinde Türkçe katlama: iki tarafı aynı işlevden geçirin ([Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)).

## Kısmi güncelleme (PATCH)

JSON Merge Patch (RFC 7396) kuralı basittir: **anahtar yoksa dokunma, `null` ise temizle, değilse yaz.** En sık
hata "değer doluysa yaz" kontrolüdür: `false`, `0`, `""` ve `null` hiç yazılamaz. İkinci hata izin listesi
olmamasıdır: istemci `role`, `ownerId` gönderir ve yazılır (toplu atama, mass assignment).

```js calistir
import assert from 'node:assert/strict'

const gorev = { baslik: 'Süt al', not: 'iki şişe', bitti: true, oncelik: 2 }

// YANLIŞ: "değer doluysa yaz"
function yamaYanlis(kayit, yama) {
  const sonuc = { ...kayit }
  for (const alan of ['baslik', 'not', 'bitti', 'oncelik']) if (yama[alan]) sonuc[alan] = yama[alan]
  return sonuc
}

// DOĞRU: anahtar varsa yaz (null = temizle); izin listesi dışı alan → 400
const IZINLI = new Set(['baslik', 'not', 'bitti', 'oncelik'])
function yamaDogru(kayit, yama) {
  const sonuc = { ...kayit }
  for (const [alan, deger] of Object.entries(yama)) {
    if (!IZINLI.has(alan)) throw new Error(`değiştirilemeyen alan: ${alan}`)
    sonuc[alan] = deger
  }
  return sonuc
}

const yama = JSON.parse('{"bitti": false, "oncelik": 0, "not": null}')
assert.deepEqual(yamaYanlis(gorev, yama), gorev) // hiçbir şey değişmedi!
assert.deepEqual(yamaDogru(gorev, yama), { baslik: 'Süt al', not: null, bitti: false, oncelik: 0 })
assert.throws(() => yamaDogru(gorev, { sahipId: 'baskasi' }), /değiştirilemeyen alan/)
console.log('tamam')
```

```cikti
tamam
```

Şema kitaplığında bunun karşılığı: alan **isteğe bağlı** (yoksa dokunma) ve **boş bırakılabilir** (null = temizle)
iki ayrı özelliktir; ikisini karıştırmayın. Eşzamanlı düzenlemede kayıp güncellemeye karşı `If-Match` + ETag ya da
sürüm alanı: [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md).

## Sürümleme ve geriye uyum

| Değişiklik                                                     | Kırıcı mı | Yol                                                          |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| Yanıta yeni isteğe bağlı alan                                  | Hayır     | Doğrudan                                                     |
| Yeni uç, yeni isteğe bağlı sorgu parametresi                   | Hayır     | Doğrudan                                                     |
| Alanı yeniden adlandırma, silme, türünü değiştirme             | **Evet**  | Yeni alanı ekle, ikisini birlikte döndür, eskiyi duyurup kaldır |
| İstekte yeni **zorunlu** alan                                  | **Evet**  | Varsayılanla isteğe bağlı başlat                             |
| Doğrulamayı sıkılaştırma (en çok 200 → 100 karakter)           | **Evet**  | Yalnız yeni kayıtlara uygula; eskileri okurken kabul et      |
| Var olan hata kodunun anlamını değiştirme                      | **Evet**  | Yeni kod ekle                                                |
| Sıralı bir alana (enum) yeni değer                             | Çoğu zaman | İstemciler "bilinmeyen değer"i baştan kaldıracak yazılmalı  |

- İstemci kuralı (hoşgörülü okur): bilinmeyen alanı yok say, bilinmeyen enum değerini "diğer" say.
- Sürüm yeri: küçük ekipte adreste ana sürüm (`/v1/`) yeterlidir; çoğu değişiklik eklemeli yapılır ve sürüm
  hiç artmaz. Kaldırma tarihini yanıtta `Sunset` başlığıyla (RFC 8594) ve sürüm notunda duyurun.
- Güncellenemeyen istemci için protokol sürümü: havuzdaki eşitleme her istekte `protocolVersion` taşır, uyuşmazsa
  `426 upgrade_required` ve "uygulamayı yenileyin" döner ([`sync/service.ts`](../../uygulama/api/src/modules/sync/service.ts)).

## İdempotentlik anahtarı

İstemci her **mantıksal işlem** için bir anahtar üretir (UUID) ve `Idempotency-Key` başlığında gönderir. Sunucu
anahtarı ilk yanıtla birlikte saklar; aynı anahtar yeniden gelirse işlemi yapmaz, **ilk yanıtın aynısını** döner.

| Gelen istek                              | Yanıt                                                  |
| ---------------------------------------- | ------------------------------------------------------ |
| Yeni anahtar                             | İşlemi yap, yanıtı anahtarla aynı işlemde sakla        |
| Bilinen anahtar, aynı gövde              | Saklanan yanıt (durum kodu dahil), işlem yok           |
| Bilinen anahtar, farklı gövde            | 422 (ya da 409): "aynı anahtar başka istekte kullanılmış" |
| Bilinen anahtar, ilk istek hâlâ sürüyor  | 409 + `Retry-After`                                    |

Anahtar kullanıcıya özeldir (iki kullanıcının aynı anahtarı çakışmaz); 24 saat gibi bir süre saklanır.

```python calistir
import hashlib
import json
import os
import sqlite3
import tempfile
import threading

YOL = os.path.join(tempfile.mkdtemp(), "odeme.db")
with sqlite3.connect(YOL) as kur:
    kur.execute("PRAGMA journal_mode = WAL")
    kur.execute("CREATE TABLE odeme (id INTEGER PRIMARY KEY, tutar_kurus INTEGER NOT NULL)")
    kur.execute(
        "CREATE TABLE idem (kullanici TEXT, anahtar TEXT, govde_ozeti TEXT NOT NULL,"
        " durum INTEGER NOT NULL, yanit TEXT NOT NULL, PRIMARY KEY (kullanici, anahtar))"
    )


def odeme_olustur(kullanici: str, anahtar: str, govde: dict) -> tuple[int, dict]:
    ozet = hashlib.sha256(json.dumps(govde, sort_keys=True).encode()).hexdigest()
    db = sqlite3.connect(YOL, timeout=10, isolation_level=None)
    try:
        db.execute("BEGIN IMMEDIATE")  # yazma kilidi baştan: aynı anahtarlı istekler sıraya girer
        eski = db.execute(
            "SELECT govde_ozeti, durum, yanit FROM idem WHERE kullanici = ? AND anahtar = ?",
            (kullanici, anahtar),
        ).fetchone()
        if eski:
            db.execute("COMMIT")
            if eski[0] != ozet:  # aynı anahtar, farklı istek
                return 422, {"error": {"code": "idempotency_key_reused"}}
            return eski[1], json.loads(eski[2])  # ilk yanıtın AYNISI
        satir = db.execute("INSERT INTO odeme (tutar_kurus) VALUES (?)", (govde["tutar_kurus"],))
        yanit = {"id": satir.lastrowid, "tutar_kurus": govde["tutar_kurus"]}
        db.execute(
            "INSERT INTO idem VALUES (?, ?, ?, ?, ?)", (kullanici, anahtar, ozet, 201, json.dumps(yanit))
        )
        db.execute("COMMIT")  # ödeme ve anahtar kaydı AYNI işlemde
        return 201, yanit
    finally:
        if db.in_transaction:
            db.execute("ROLLBACK")
        db.close()


sonuclar = []
ipler = [
    threading.Thread(target=lambda: sonuclar.append(odeme_olustur("ayse", "k-7f3a", {"tutar_kurus": 15000})))
    for _ in range(5)  # aynı istek 5 kez: çift tık + ağ kopunca yeniden deneme
]
for ip in ipler:
    ip.start()
for ip in ipler:
    ip.join()
assert len(sonuclar) == 5 and all(s == sonuclar[0] for s in sonuclar)
assert sonuclar[0] == (201, {"id": 1, "tutar_kurus": 15000})
with sqlite3.connect(YOL) as db:
    assert db.execute("SELECT count(*) FROM odeme").fetchone()[0] == 1
assert odeme_olustur("ayse", "k-7f3a", {"tutar_kurus": 99})[0] == 422
assert odeme_olustur("burak", "k-7f3a", {"tutar_kurus": 15000})[0] == 201  # anahtar kullanıcıya özel
print("5 istek → 1 ödeme, 5 aynı yanıt")
```

```cikti
5 istek → 1 ödeme, 5 aynı yanıt
```

Örnekteki sihir: yan etki (ödeme satırı) ile anahtar kaydı **aynı veritabanı işlemindedir**. Yan etki dışarıdaysa
(ödeme sağlayıcısını çağırmak, e-posta) aynı işleme sokulamaz; o zaman:

1. Anahtarı "sürüyor" durumuyla yazın ve işlemi kapatın (kısa işlem).
2. Dış servisi **aynı anahtarı ileterek** çağırın (sağlayıcı da idempotent olsun).
3. Sonucu anahtara yazın. Çökme olursa "sürüyor"da kalan anahtar, dış servisten durum sorgulanarak tamamlanır.

İşlem içinde dış çağrı yapılmaz: [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md). Aynı fikrin başka bir
biçimi: havuzdaki eşitlemede her cihaz artan bir değişiklik numarası (`mid`) gönderir; sunucu cihaz başına son
işlenen numarayı saklar ve yinelenenleri atlar ([`sync/service.ts`](../../uygulama/api/src/modules/sync/service.ts)).

## Uzun süren işlem

Yanıtı 10 saniyeden uzun sürebilecek iş (rapor, dışa aktarım, toplu e-posta) istek içinde yapılmaz; vekiller ve
mobil ağlar bağlantıyı keser, kullanıcı tekrar basar.

1. `POST /exports` → iş kaydı açılır, kuyruğa konur → `202 Accepted` + `Location: /exports/{id}`.
2. `GET /exports/{id}` → `{ "status": "queued" | "running" | "succeeded" | "failed", "progress": 40,
   "resultUrl": … , "error": … }`.
3. İstemci geri çekilmeyle yoklar ya da anlık bildirim bekler ([Gerçek zamanlı](gercek-zamanli.md)).
4. Oluşturma isteği de idempotentlik anahtarı alır; iş kuyruğu tarafı: [Arka plan işleri](arka-plan-isleri.md).

## Toplu işlem

- Üst sınır koyun (havuzdaki eşitleme: istek başına 100 değişiklik) ve sınırı belgeleyin.
- Önce karar verin: **ya hep ya hiç** (tek işlem; bir öğe bozuksa hepsi reddedilir) mi, **öğe öğe** mi?
  Öğe öğe ise yanıt her öğe için sonuç taşır: `{ "results": [{ "index": 0, "status": 201, "id": "…" },
  { "index": 1, "status": 400, "error": {…} }] }`. Genel durum kodu 200'dür; istemci öğelere bakar.
- Her öğe kendi idempotentlik kimliğini taşırsa yarıda kalan toplu istek güvenle yeniden gönderilir.
- Dosyayla toplu yükleme (CSV/Excel) ve indirme: [İçe ve dışa aktarım](ice-ve-disa-aktarim.md).

## API belgeleme

- Belge kodla birlikte değişmiyorsa yalan söyler. Havuzdaki API'de her uç [`docs/API.md`](../../uygulama/docs/API.md)'de
  belgelenir ve kural testi ([`rules.test.ts`](../../uygulama/api/test/rules.test.ts)) üç şeyi denetler: her uç
  belgede var, belgedeki her uç sunucuda var, belgedeki JSON örnekleri şemaya uyuyor.
- Her uç için: yöntem + adres, kimlik gereği, istek örneği, yanıt örneği, olası hata kodları, `curl` örneği.
- OpenAPI dosyası üretmek iyi bir seçenektir; yine de "belge ↔ kod" testini yazın.

## Tuzaklar

| Belirti                                                         | Neden                                                 | Çözüm                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Mobil uygulama güncellemeden sonra çöküyor                      | Alan yeniden adlandırıldı/silindi                     | Eklemeli değişiklik; eski alanı bir süre birlikte döndürün     |
| İstemci hata iletisinin metnine göre dallanıyor, çeviri bozdu   | Hata gövdesinde makine kodu yok                       | Sabit `code` alanı                                             |
| Liste ucu birkaç ay sonra zaman aşımına uğruyor                 | Sayfalama yok ya da `limit` sınırsız                  | İmleç + üst sınır                                              |
| Sonsuz kaydırmada aynı kayıt iki kez görünüyor                  | Ofset sayfalama + yeni kayıtlar                       | İmleç sayfalama                                                |
| Aynı saniyedeki kayıtlar sayfa sınırında kayboluyor             | İmleç tekil değil (yalnız tarih)                      | `(tarih, id)` çifti                                            |
| Kullanıcı kendine yönetici rolü verdi                           | PATCH gövdesi doğrudan kayda yazıldı                  | Alan izin listesi                                              |
| "Bitti" işareti kaldırılamıyor                                  | `if (yama.bitti)` denetimi                            | Anahtarın varlığına bakın, değerine değil                      |
| Ödeme/sipariş iki kez oluştu                                    | POST yeniden denendi, idempotentlik yok               | `Idempotency-Key` + yan etkiyle aynı işlemde saklama           |
| İdempotentlik var ama yine çift kayıt                           | "Var mı?" denetimi ile yazma ayrı işlemde (yarış)     | Tek işlem + anahtar üzerinde birincil anahtar/benzersizlik     |
| Sıralama parametresiyle veri sızdı                              | `ORDER BY` metne gömüldü                              | İzin listesi                                                   |
| Uzun rapor isteği 30-60 sn'de kesiliyor                         | İş istek içinde yapılıyor                             | 202 + iş kaydı + kuyruk                                        |
| Belgedeki örnek çalışmıyor                                      | Belge kodla birlikte güncellenmedi                    | Belgeyi testle koruyun                                         |

## Denetim listesi

- [ ] Her hata `{ error: { code, message, details? } }` biçiminde; kodlar bir listede ve belgelenmiş.
- [ ] Her liste ucu sayfalı; `limit` üst sınırlı; imleçte sıralama tekil.
- [ ] Süzme/sıralama parametreleri izin listesinden; SQL'e metin olarak giren kullanıcı girdisi yok.
- [ ] PATCH: yalnız izinli alanlar; "anahtar yok" ile "null" ayrılıyor; `false`/`0`/`""` yazılabiliyor.
- [ ] Para küçük birim tamsayı, zaman ISO UTC, kimlikler metin.
- [ ] Oluşturma ve ödeme gibi POST uçları `Idempotency-Key` kabul ediyor; anahtar yan etkiyle aynı işlemde.
- [ ] 10 sn'den uzun iş 202 + iş kaydıyla yapılıyor.
- [ ] Toplu uçlarda üst sınır ve öğe başına sonuç var.
- [ ] Her uç belgede; belge testle korunuyor.
- [ ] Kaldırılacak alan/uç için tarih duyuruldu; o tarihe kadar ikisi birlikte çalışıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Hata biçimi `{error:{code,message,details}}`; yeni hata kodu gerekiyorsa listeye ekle. Liste
  ucu imleçli sayfalı, `limit` en çok 100. PATCH yalnız şu alanları değiştirir: … POST ucu `Idempotency-Key`
  başlığını destekler. Var olan alanları yeniden adlandırma ya da silme."
- **Tipik hatalar:** sayfalamayı unutmak; `OFFSET` ile sayfalamak; `if (body.x)` ile kısmi güncelleme; gövdeyi
  doğrudan ORM'e vermek (`update(req.body)`); idempotentlik denetimini ayrı bir "var mı" sorgusuyla yapıp yarış
  bırakmak; hata iletisini İngilizce ve teknik yazmak.
- **Çıktıda denetleyin:** `ORDER BY ${`, `OFFSET`, `req.body` ile doğrudan yazma, `if (patch.`; yeni uç belgeye
  eklenmiş mi; olumsuz testler (400/401/403/404/409) var mı.
- **Örnek verin:** havuzdaki örnek modülü göstermek, kuralları anlatmaktan iyi çalışır:
  [`uygulama/api/src/modules/account/`](../../uygulama/api/src/modules/account/routes.ts) ve tarifi
  [`TARIFLER.md`](../../uygulama/api/TARIFLER.md).

## İlgili

- [HTTP temelleri](http-temelleri.md): yöntemler, durum kodları, önbellek başlıkları.
- [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md) · [Webhooklar](webhooklar.md) ·
  [Ödeme tümleştirme](odeme-tumlestirme.md) (idempotentliğin en çok gerektiği yer)
- [Yetkilendirme](yetkilendirme.md): liste uçlarında kiracı süzgeci. Toplu atama ve IDOR'un güvenlik yüzü:
  [Erişim denetimi açıkları](../50-guvenlik/erisim-denetimi-aciklari.md); sıralama parametresiyle enjeksiyon:
  [Enjeksiyon](../50-guvenlik/enjeksiyon.md); API'yi tüketen taraf: [Veri getirme](../20-web-onyuz/veri-getirme.md).
- Çalışan sözleşme: [`uygulama/shared/src/api.ts`](../../uygulama/shared/src/api.ts) (şemalar ve adresler),
  [`uygulama/docs/API.md`](../../uygulama/docs/API.md).
