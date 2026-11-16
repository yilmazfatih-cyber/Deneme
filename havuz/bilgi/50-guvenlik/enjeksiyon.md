---
baslik: Enjeksiyon: SQL, kabuk, şablon ve sorgu dilleri
ozet: Girdinin kod olarak yorumlandığı her yerde veri ile kodu ayırmak; çalışan SQL ve kabuk örnekleri, şablon enjeksiyonu, NoSQL/LDAP ve ORM kullanırken açık kalan ham sorgu ve sıralama.
etiketler: [guvenlik, enjeksiyon, sql, kabuk, orm, sablon]
duzey: orta
guncellik: 2026-11
---

# Enjeksiyon: SQL, kabuk, şablon ve sorgu dilleri

> Bu notu ne zaman okumalı: kodda SQL metni, `subprocess`/`child_process`, şablon motoru, `eval`, Mongo/LDAP sorgusu
> kuran bir satır yazılırken ya da incelenirken; ORM'in "ham sorgu" kapısı kullanılırken; bir girdide tırnak işareti
> beklenmedik hata verdiğinde.

## Temel fikir

Enjeksiyon, kullanıcının verdiği **verinin** bir yorumlayıcıda (SQL motoru, kabuk, şablon motoru, sorgu dili)
**kodun parçası** olarak okunmasıdır. Belirtisi hep aynıdır: metin birleştirerek komut kurmak. Çözüm de hep
aynıdır: veriyi ve kodu **ayrı kanallardan** göndermek.

- SQL: sorgu metni sabit, değerler parametre (`?`). Motor değeri asla SQL olarak ayrıştırmaz.
- Kabuk: komut ve argümanlar **liste**; arada kabuk yok (`shell=False`).
- Şablon: şablon geliştiricinindir; kullanıcı yalnız değişken değeri verir.

"Tehlikeli karakteri silmek" (kara liste) çözüm değildir: her yorumlayıcının özel karakteri farklıdır, kaçış
kuralları incedir ve meşru girdi (`O'Brien`, `%50 indirim`) bozulur.

## Karar tablosu: girdi nereye gidiyor

| Girdi nereye gidiyor                         | Doğru yol                                                   | Yaygın yanlış                                      |
| -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| SQL değeri (`WHERE`, `INSERT`, `UPDATE`)     | Yer tutucu: `?`, `:ad`, `$1`                                 | f-string, `%`, `+`, `.format`, şablon dizgisi      |
| SQL tanıtıcısı (sütun, tablo, `ASC/DESC`)    | İzin listesi sözlüğü: kullanıcı adı → koddaki sütun adı     | Yer tutucu (çalışmaz) ya da metne gömmek           |
| `LIKE` deseni                                | Yer tutucu + `%` ve `_` kaçışı + `ESCAPE`                   | Yalnız yer tutucu: `%` araması her şeyi getirir    |
| `IN (…)` listesi                             | Kodla üretilen `?,?,?` + değerler parametre                 | `",".join(idler)`                                  |
| Kabuk komutu                                 | Argüman listesi, `shell=False`, girdiden önce `--`          | `shell=True`, `os.system`, `exec(`…`)`              |
| E-posta/sayfa şablonu                        | Sabit şablon dosyası + değişken                              | Kullanıcı metnini şablon olarak derlemek           |
| Belge veritabanı (Mongo vb.)                 | Şemayla tür doğrulama: dizge beklenen yerde nesne reddi     | Gövdeyi doğrudan sorgu nesnesine koymak            |
| LDAP filtresi                                | RFC 4515 kaçışı ya da kitaplığın kaçış işlevi               | Metin birleştirme                                  |
| Kod (`eval`, `new Function`)                 | Hiç. Hesap gerekiyorsa küçük ayrıştırıcı                    | "Yalnız sayı girilir" varsayımıyla `eval`          |

## SQL enjeksiyonu

Neden açık: sorgu metni girdiyle birleşince tırnak işareti metni kapatır; sonrası SQL olarak çalışır. Python'un
`sqlite3` modülü tek çağrıda ikinci ifadeyi (`; DROP TABLE`) reddeder, ama bu **güvence değildir**: tek ifade
içinde koşulu değiştirmek ya da başka tabloyu okumak yeter.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE kullanici (id INTEGER PRIMARY KEY, eposta TEXT UNIQUE, parola_ozeti TEXT, rol TEXT);
INSERT INTO kullanici VALUES (1, 'ayse@ornek.test', 'scrypt$..a', 'uye'),
                             (2, 'yonetici@ornek.test', 'scrypt$..b', 'yonetici');
""")


# YANLIŞ: girdi SQL metninin parçası olur
def bul_yanlis(eposta: str) -> list:
    return db.execute(f"SELECT id, eposta FROM kullanici WHERE eposta = '{eposta}'").fetchall()


# DOĞRU: SQL metni sabit; girdi yalnız değer olarak gider
def bul(eposta: str) -> list:
    return db.execute("SELECT id, eposta FROM kullanici WHERE eposta = ?", (eposta,)).fetchall()


# TEST: açığı yakalayan girdiler — her parametreli uç için bunları deneyin
kosul = "x' OR '1'='1"
okuma = "x' UNION SELECT rol, parola_ozeti FROM kullanici --"
assert len(bul_yanlis(kosul)) == 2  # koşul her satırda doğru oldu
assert ("yonetici", "scrypt$..b") in bul_yanlis(okuma)  # başka sütun okundu
assert bul(kosul) == [] and bul(okuma) == []
try:
    bul_yanlis("o'brien@ornek.test")  # meşru tırnaklı girdi yanlış sürümü bozar
    raise AssertionError("hata bekleniyordu")
except sqlite3.OperationalError:
    pass
assert bul("o'brien@ornek.test") == []
print("tamam")
```

```cikti
tamam
```

Parametre **yalnız değer** taşır. Sütun ve tablo adı, `ASC/DESC` için izin listesi gerekir; çalışan örneği
[API tasarımı → Süzme ve sıralama](../30-arkauc/api-tasarimi.md) notunda. `LIKE` ve `IN` için:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("CREATE TABLE urun (ad TEXT); INSERT INTO urun VALUES ('%50 indirim'), ('çay'), ('kahve'), ('su_bardagi');")


def like_kacis(metin: str) -> str:
    return metin.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def ara_yanlis(metin: str) -> list[str]:  # parametreli ama joker karakterler serbest
    return [r[0] for r in db.execute("SELECT ad FROM urun WHERE ad LIKE ? ORDER BY ad", (f"%{metin}%",))]


def ara(metin: str) -> list[str]:
    sorgu = "SELECT ad FROM urun WHERE ad LIKE ? ESCAPE '\\' ORDER BY ad"
    return [r[0] for r in db.execute(sorgu, (f"%{like_kacis(metin)}%",))]


def getir(idler: list[int]) -> list[str]:
    if not idler:
        return []  # "IN ()" geçersiz SQL'dir
    yer = ",".join("?" * len(idler))  # f-string burada güvenli: içeriği koddan geliyor, kullanıcıdan değil
    return [r[0] for r in db.execute(f"SELECT ad FROM urun WHERE rowid IN ({yer}) ORDER BY rowid", idler)]


assert len(ara_yanlis("%")) == 4  # "%" araması her şeyi getirdi (büyük tabloda tam tarama)
assert ara("%") == ["%50 indirim"] and ara("_") == ["su_bardagi"]
assert getir([2, 3]) == ["çay", "kahve"] and getir([]) == []
print("tamam")
```

```cikti
tamam
```

## ORM kullanırken açık kalan yerler

ORM sorguyu parametreli kurar; açık, ORM'in **kaçış kapılarında** kalır. Aşağıdaki kod gösterim amaçlıdır
(kitaplık çağrıları ezberdendir; kendi sürümünüzün belgesinde doğrulayın):

```python
# SQLAlchemy
session.execute(text(f"SELECT * FROM fatura WHERE no = '{no}'"))           # YANLIŞ
session.execute(text("SELECT * FROM fatura WHERE no = :no"), {"no": no})   # DOĞRU
# Django
Fatura.objects.raw(f"SELECT * FROM fatura WHERE no = '{no}'")              # YANLIŞ
Fatura.objects.raw("SELECT * FROM fatura WHERE no = %s", [no])             # DOĞRU
Fatura.objects.filter(**request.GET.dict())                                # YANLIŞ: anahtar adı da girdidir
```

```ts
// Prisma
await prisma.$queryRawUnsafe(`SELECT * FROM fatura WHERE no = '${no}'`) // YANLIŞ
await prisma.$queryRaw`SELECT * FROM fatura WHERE no = ${no}` // DOĞRU: etiketli şablon değeri parametre yapar
```

| ORM kapısı                                    | Neden açık                                                                  | Önlem                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Ham sorgu (`raw`, `text`, `$queryRawUnsafe`)  | Metin birleştirme ORM'in dışında kalır                                      | Kitaplığın bağlı parametre sözdizimi                        |
| Sıralama/süzme alanını istekten almak         | Geçerli **her** alana (ör. `parola_ozeti`) göre sıralama, sonuç dizilişinden gizli alanı sızdırır | Kamuya açık ad → sütun izin listesi              |
| Süzgeç anahtarlarını istekten almak (`**params`) | Anahtar adındaki ilişki/arama sözdizimi başka tablolara uzanır           | Yalnız bilinen anahtarlar; değerleri şemayla doğrulayın    |
| Dinamik tablo/şema adı (kiracı başına tablo)  | Tanıtıcı parametre olamaz                                                    | Sıkı desen (`^[a-z_]{1,30}$`) + izin listesi               |
| "İkinci derece" enjeksiyon                    | Güvenle kaydedilen veri, sonra bir rapor/yönetim betiğinde metne gömülür    | Her sorguda parametre; "veritabanından geldi" güvenli değildir |

Model SQL'i kendisi yazıyorsa (araçlı sohbet) parametre mümkün değildir; güvenlik veritabanı motoru düzeyinde
kurulur: salt okunur bağlantı + yetkilendirici. Çalışan örnek: [`yz/yz/arac/hazir/sqlite.py`](../../yz/yz/arac/hazir/sqlite.py).

## Kabuk (komut) enjeksiyonu

Neden açık: `shell=True` ya da `exec` komut metnini bir kabuğa verir; `;`, `|`, `$( )`, ters tırnak yeni komut
başlatır. Kabuk olmasa bile `-` ile başlayan değer, programın **seçeneği** sanılabilir (argüman enjeksiyonu).

```python calistir
import subprocess

ad = "rapor.txt; echo ENJEKTE"

# YANLIŞ: kabuk ; işaretini yorumlar, ikinci komut çalışır
cikti = subprocess.run(f"echo {ad}", shell=True, capture_output=True, text=True).stdout
assert cikti.splitlines() == ["rapor.txt", "ENJEKTE"]

# DOĞRU: liste + kabuk yok; değer tek bir argümandır
cikti = subprocess.run(["echo", ad], capture_output=True, text=True).stdout
assert cikti == "rapor.txt; echo ENJEKTE\n"

# Argüman enjeksiyonu: "dosya adı" olarak gelen "--version" bir seçenek sayıldı
sonuc = subprocess.run(["cat", "--version"], capture_output=True, text=True)
assert sonuc.returncode == 0 and "cat" in sonuc.stdout
# DOĞRU: "--" seçeneklerin bittiğini söyler; sonrası hep dosya adıdır
sonuc = subprocess.run(["cat", "--", "--version"], capture_output=True, text=True)
assert sonuc.returncode != 0  # böyle bir dosya yok: beklenen davranış
print("tamam")
```

```cikti
tamam
```

Node'da aynı ayrım: `exec`/`execSync` kabuk kullanır, `execFile`/`spawn` (seçeneksiz) kullanmaz.

```js calistir
import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'

const ad = 'rapor.txt; echo ENJEKTE'
assert.equal(execSync(`echo ${ad}`).toString(), 'rapor.txt\nENJEKTE\n') // YANLIŞ
assert.equal(execFileSync('echo', [ad]).toString(), 'rapor.txt; echo ENJEKTE\n') // DOĞRU
console.log('tamam')
```

```cikti
tamam
```

Kabuk gerçekten şartsa (boru hattı vb.) her değeri `shlex.quote` ile tırnaklayın; daha iyisi işi Python/Node
içinde yapmak. Hiçbir zaman kullanıcıya program adı ya da seçenek seçtirmeyin; seçenekler koddaki bir sözlükten
gelsin. Dosya adı geliyorsa ayrıca yol geçişi denetimi: [Dosya yükleme](dosya-yukleme-guvenligi.md).

## Şablon enjeksiyonu

Neden açık: şablon motorları (Jinja2, Handlebars, EJS…) şablonu **koda derler**. Kullanıcının yazdığı metin şablon
olarak derlenirse nesnelere, özniteliklere ve çoğu motorda sunucuda kod çalıştırmaya uzanır. Python'un sıradan
`str.format`'ı bile öznitelik zinciriyle okuma yapar:

```python calistir
import string

GIZLI_ANAHTAR = "imza-anahtari-123"


class Kullanici:
    def __init__(self, ad: str) -> None:
        self.ad = ad


# YANLIŞ: kullanıcının kaydettiği "karşılama şablonu" str.format ile dolduruluyor
def karsilama_yanlis(sablon: str, kullanici: Kullanici) -> str:
    return sablon.format(k=kullanici)


# DOĞRU: yalnız düz adlar ve yalnız izinli değerler
def karsilama(sablon: str, kullanici: Kullanici) -> str:
    return string.Template(sablon).safe_substitute(ad=kullanici.ad)


ayse = Kullanici("Ayşe")
assert karsilama_yanlis("Merhaba {k.ad}", ayse) == "Merhaba Ayşe"
# TEST: öznitelik zinciri modül değişkenine uzandı
assert karsilama_yanlis("{k.__init__.__globals__[GIZLI_ANAHTAR]}", ayse) == GIZLI_ANAHTAR
assert karsilama("Merhaba $ad", ayse) == "Merhaba Ayşe"
assert GIZLI_ANAHTAR not in karsilama("${k.__init__} $ad", ayse)  # geçersiz yer tutucu olduğu gibi kalır
print("tamam")
```

```cikti
tamam
```

- Jinja2/Flask'ta `Template(kullanici_metni)` ve `render_template_string(istek_degeri)` aynı hatadır. Doğrusu
  sabit şablon dosyası + `render(ad=deger)`.
- Kullanıcıya şablon yazdırmak bir özellikse (e-posta metni özelleştirme): yalnız `$ad`, `$tarih` gibi düz yer
  tutucular; motorun korumalı (sandbox) kipi ikinci kattır, tek güvence değildir.
- Şablona giren değerin HTML kaçışı ayrı bir konudur: [XSS ve CSP](xss-ve-csp.md).

## NoSQL ve LDAP (kavram)

**Belge veritabanı:** sorgu bir nesnedir; JSON gövdeden gelen değer de nesne olabilir. Beklenen yerde dizge değil
`{"$ne": null}` gelirse koşul "eşit değil" olur ve her kaydı eşler. Önlem: gövdeyi şemayla doğrulamak
(dizge beklenen alanda nesne reddi), `$where` ve sunucu tarafı JavaScript'i kapatmak.

```js calistir
import assert from 'node:assert/strict'

// YANLIŞ: koleksiyon.findOne({ eposta: govde.eposta, parola: govde.parola }) — parola alanı operatör taşıyabilir
const govde = JSON.parse('{"eposta": "ayse@ornek.test", "parola": {"$ne": null}}')

// DOĞRU: sınırda tür doğrulama (gerçek projede Zod şeması)
function girisGovdesi(g) {
  if (typeof g?.eposta !== 'string' || typeof g?.parola !== 'string') throw new Error('geçersiz gövde')
  return { eposta: g.eposta, parola: g.parola }
}

assert.throws(() => girisGovdesi(govde), /geçersiz gövde/) // TEST: operatör taşıyan gövde reddedilir
assert.deepEqual(girisGovdesi({ eposta: 'a@b.c', parola: 'x' }), { eposta: 'a@b.c', parola: 'x' })
console.log('tamam')
```

```cikti
tamam
```

**LDAP:** filtre `(uid=<girdi>)` biçiminde kurulur; `*`, `(`, `)` filtreyi değiştirir. Kitaplığın kaçış işlevini
kullanın; yoksa RFC 4515'teki beş karakteri kaçışlayın: `\` → `\5c`, `*` → `\2a`, `(` → `\28`, `)` → `\29`,
NUL → `\00`. Ayırt edici ad (DN) kaçışı başka kuraldır (RFC 4514); ikisini karıştırmayın.

## Tuzaklar

| Belirti                                                                  | Neden                                                            | Çözüm                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `O'Brien` ya da `Ali'nin` yazınca 500 hatası                             | Sorgu metin birleştirmeyle kurulmuş                              | Yer tutucu; bu girdiyi teste ekleyin                                |
| "Tırnakları sildik/ikiledik, güvendeyiz"                                 | Kara liste; sayısal alan, ters eğik çizgi, kodlama farkı kaçar    | Parametre; kaçışı sürücüye bırakın                                  |
| `ORDER BY ?` hata vermiyor ama sıralamıyor; model metne gömüyor          | Yer tutucu tanıtıcı taşımaz                                      | Sıralama izin listesi ([API tasarımı](../30-arkauc/api-tasarimi.md)) |
| `%` ya da `_` araması bütün tabloyu getiriyor, sorgu yavaş               | `LIKE` jokerleri kaçışlanmamış                                   | `like_kacis` + `ESCAPE`                                             |
| "DROP TABLE çalışmadı, açık yok" denildi                                 | Sürücü çoklu ifadeyi reddetti; tek ifadede okuma yine mümkün     | Testte `OR` ve `UNION` girdilerini de deneyin                       |
| Güvenle kaydedilen ad, yönetim raporunda sorguyu bozuyor                  | İkinci derece enjeksiyon                                         | Raporda, betikte, göçte de parametre                                 |
| `subprocess.run(komut, shell=True)` "çünkü boru hattı lazım"             | Kabuk kolaylık için açılmış                                      | Adımları Python'da yapın ya da `shlex.quote`                        |
| Dosya adı `-` ile başlayınca araç tuhaf davranıyor                        | Argüman enjeksiyonu                                              | Girdiden önce `--`; adı sunucuda üretin                             |
| Kullanıcının "şablonu" sunucuda kod çalıştırıyor                          | Kullanıcı metni şablon olarak derlenmiş                          | Sabit şablon + düz yer tutucu (`string.Template`)                   |
| Giriş ucu `{"$ne": null}` parolasıyla açılıyor                            | Gövde türü doğrulanmamış                                         | Şema: dizge beklenen yerde nesne reddi                               |
| Model yazdığı SQL'le tablo sildi                                          | Araç tam yetkili bağlantıyla çalışıyor                           | Salt okunur bağlantı + yetkilendirici (yz `sqlite.py`)              |

## Denetim listesi

- [ ] Kodda SQL metnine kullanıcı verisi giren satır yok (`execute(f"`, `+`, `%`, `.format`, şablon dizgisi).
      Kalan f-string'lerin içeriği koddan geliyor ve yanında yorum var.
- [ ] Sıralama/süzme alanları ve tablo adları izin listesinden.
- [ ] `LIKE` aramalarında joker kaçışı ve `ESCAPE` var; `IN` listesi yer tutucuyla kuruluyor.
- [ ] ORM ham sorgularının hepsi bağlı parametre kullanıyor; istekten gelen anahtar doğrudan süzgece verilmiyor.
- [ ] `shell=True`, `os.system`, `exec(` yok; argümanlar liste, girdiden önce `--`.
- [ ] Kullanıcı metni hiçbir yerde şablon olarak derlenmiyor; `eval`/`new Function` yok.
- [ ] Gövdeler şemayla doğrulanıyor (dizge beklenen yerde nesne/dizi reddediliyor).
- [ ] Her arama/giriş ucunun testinde `'`, `' OR '1'='1`, `%`, `_`, `--version`, `{"$ne": null}` girdileri var.

## Küçük modele yaptırırken

- **İsteme yazın:** "SQL'i her zaman yer tutucuyla yaz; sütun/tablo/sıralama adını yalnız izin listesindeki
  sözlükten al. `shell=True`, `os.system`, `exec` kullanma; argümanları liste ver. Kullanıcı metnini şablon olarak
  derleme. Her yeni sorgu için tırnaklı girdi ve `' OR '1'='1` ile test yaz."
- **Modelin tipik hatası:** `ORDER BY ?` çalışmayınca f-string'e geçmek; "güvenli olsun diye" tırnakları
  `replace` ile silmek; ORM varken raporu ham SQL ile hızlıca yazmak; Node'da `exec` ile "küçük bir komut"
  çalıştırmak; `LIKE` kaçışını unutmak.
- **Çıktıda denetleyin:** `execute(f"`, `` `SELECT ``, `$queryRawUnsafe`, `.raw(f`, `text(f`, `shell=True`,
  `exec(`, `render_template_string`, `Template(` çağrılarını arayın. Her eşleşmenin girdisinin nereden geldiğini
  sorun.
- **Test isteyin:** "Bu uçta `o'brien` ile 200, `' OR '1'='1` ile boş sonuç, `%` ile yalnız yüzde içeren kayıt
  döner" testleri. Model kendi f-string'ini bu testle görür.

## İlgili

- Sıralama izin listesi ve PATCH alan izin listesi: [API tasarımı](../30-arkauc/api-tasarimi.md)
- Çıktı tarafı (HTML'e basma): [XSS ve CSP](xss-ve-csp.md) · Dosya adları: [Dosya yükleme](dosya-yukleme-guvenligi.md)
- Çalışan kod: uygulamada SQL'in tamamı parametreli ([`docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) →
  "Girdi ve çıktı"); güvenli imleç koşulu [`kutuphane/py/kutuphane/sayfalama.py`](../../kutuphane/py/kutuphane/sayfalama.py);
  model yazdığı SQL için motor düzeyinde koruma [`yz/yz/arac/hazir/sqlite.py`](../../yz/yz/arac/hazir/sqlite.py)
