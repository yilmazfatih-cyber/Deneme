---
baslik: Arama: LIKE, tam metin arama ve Türkçe katlama
ozet: Basit LIKE aramasından tam metin aramaya ve ayrı arama motoruna geçiş ölçütleri, ilgi sıralaması, ön ek ve yazım hatası toleransı, Türkçe katlama ve ekler, dizin güncelliği; süzgeçle birleşen çalışan SQLite FTS5 örneği.
etiketler: [arama, fts, sqlite, turkce, veritabani]
duzey: orta
guncellik: 2026-11
---

# Arama: LIKE, tam metin arama ve Türkçe katlama

> Bu notu ne zaman okumalı: bir listeye arama kutusu eklenirken; "Iğdır yazınca çıkmıyor", "kitap yazınca
> kitaplarım bulunmuyor", "arama başkasının kaydını gösterdi" ya da "arama yavaşladı" denildiğinde.

## Temel fikir

Arama üç basamaklı bir merdivendir; bir üst basamağa ancak alttaki yetmediğinde çıkılır:

1. **Katlanmış sütunda `LIKE`:** kısa alanlarda (ad, e-posta, ürün adı) "içeren" arama. Küçük tablolarda yeter.
2. **Veritabanının tam metin araması** (SQLite FTS5, Postgres `tsvector`): uzun metin, sözcük araması, ilgiye
   göre sıralama, ön ek.
3. **Ayrı arama motoru:** yazım hatası toleransı, eş anlamlılar, yüzeyler (facet), milyonlarca belge, dile özel
   çözümleyiciler gerektiğinde. Bedeli: ikinci bir sistemin dizinini veritabanıyla eş tutmak.

Hangi basamakta olursanız olun Türkçe için bir kural değişmez: **aranan metin de dizine giren metin de aynı katlama
işlevinden geçer** (Türkçe kuralla küçült, işaretleri at). Veritabanları ve arama çözümleyicileri bunu kendiliğinden
doğru yapmaz.

## Karar tablosu

| Durum                                                                 | Seçim                                    | Neden                                                    |
| --------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Ad/e-posta gibi kısa alanda "içeren", kayıt sayısı on binler          | Katlanmış arama sütununda `LIKE '%…%'`   | Basit; baştaki `%` dizin kullanamaz ama bu boyutta önemsiz |
| Yalnız "ile başlayan" (kod, plaka, ad başı)                           | `LIKE 'abc%'` + dizin                    | Ön ek araması dizini kullanabilir                        |
| Not, açıklama, makale gibi uzun metinde sözcük araması                | Tam metin araması (FTS5 / `tsvector`)    | Sözcük dizini, ilgi sıralaması                           |
| Yazarken öneri                                                        | Tam metin + son sözcükte ön ek           | Hızlı, sıralı                                            |
| Yazım hatası toleransı küçük bir listede (şehirler, kategoriler)      | Bellekte bulanık eşleme                  | Birkaç bin öğe için yeterince hızlı                      |
| Büyük veride yazım hatası, eş anlamlı, yüzeyler, çok dil              | Ayrı arama motoru                        | Bunlar için yapılmıştır; dizin eşitleme işi gelir        |

## LIKE ile arama

- SQLite'ın `LIKE`'ı yalnız ASCII harflerde büyük-küçük harf duyarsızdır; `LOWER()` Türkçe harfleri hiç çevirmez.
  Güvenilir yol: uygulamada katlanmış bir **arama sütunu** (`ad_arama`) yazmak ve yalnız onda aramak
  ([Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)).
- Kullanıcı metnindeki `%` ve `_` joker karakterdir: kaçışlanmazsa "%" araması her şeyi getirir.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE urun (ad TEXT, ad_arama TEXT)")
db.executemany("INSERT INTO urun VALUES (?, ?)", [("%50 indirimli çay", "%50 indirimli cay"), ("Simit", "simit")])


def kacisla(metin: str) -> str:  # LIKE'ın özel karakterleri: % _ ve kaçış karakterinin kendisi
    return metin.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


aranan = "%"  # kullanıcı yalnız "%" yazdı
yanlis = db.execute("SELECT ad FROM urun WHERE ad_arama LIKE ?", (f"%{aranan}%",)).fetchall()
dogru = db.execute("SELECT ad FROM urun WHERE ad_arama LIKE ? ESCAPE '\\'", (f"%{kacisla(aranan)}%",)).fetchall()
assert len(yanlis) == 2  # "%" her şeyle eşleşti
assert dogru == [("%50 indirimli çay",)]
print("tamam")
```

```cikti
tamam
```

Havuzdaki yönetim aramasının yaptığı tam budur: `users.search_key = foldTr(ad + e-posta)`, aranan metin de
`foldTr`'den geçer, `%` `_` `\` kaçışlanır ([`admin/repo.ts`](../../uygulama/api/src/modules/admin/repo.ts),
katlama işlevi [`shared/src/text.ts`](../../uygulama/shared/src/text.ts)).

## Tam metin araması: süzgeçle birlikte, çalışan örnek

SQLite'ın FTS5 eklentisi Python ve Node'un SQLite derlemelerinde bulunur (bu ortamda ikisinde de denendi; kendi
ortamınızda `CREATE VIRTUAL TABLE … USING fts5` çalışmıyorsa derlemede yoktur). Örnek dört şeyi gösterir: Türkçe
katlama tuzağı, ön ekle ek sorunu, kiracı ve durum süzgeciyle birleşim, kullanıcı metnini güvenle sorguya çevirme.

```python calistir
import re
import sqlite3

KATLA = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def katla(metin: str) -> str:  # Türkçe kuralla küçült, işaretleri at (arama anahtarı; ekranda özgün metin)
    return metin.replace("İ", "i").replace("I", "ı").lower().translate(KATLA)


db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE belge (id INTEGER PRIMARY KEY, kiraci TEXT NOT NULL, durum TEXT NOT NULL, baslik TEXT NOT NULL, govde TEXT NOT NULL);
CREATE VIRTUAL TABLE ham_fts USING fts5(baslik, govde);                            -- YANLIŞ: özgün metin
CREATE VIRTUAL TABLE belge_fts USING fts5(baslik, govde, tokenize = 'unicode61');  -- katlanmış metin
""")
belgeler = [
    (1, "a", "yayinda", "Iğdır gezi notları", "Iğdır'da kayısı bahçeleri"),
    (2, "a", "yayinda", "Okuma önerileri", "Kitaplarımızdan seçtiklerimiz"),
    (3, "a", "taslak", "Iğdır kayısısı", "Taslak yazı"),
    (4, "b", "yayinda", "Iğdır otelleri", "Başka firmanın belgesi"),
    (5, "a", "yayinda", "Kayısı reçeli", "Malatya ve Iğdır kayısısıyla"),
]
for b in belgeler:
    db.execute("INSERT INTO belge VALUES (?, ?, ?, ?, ?)", b)
    db.execute("INSERT INTO ham_fts (rowid, baslik, govde) VALUES (?, ?, ?)", (b[0], b[3], b[4]))
    db.execute("INSERT INTO belge_fts (rowid, baslik, govde) VALUES (?, ?, ?)", (b[0], katla(b[3]), katla(b[4])))

# YANLIŞ: unicode61 "I"yı "i"ye çevirir ama "ı"yı çevirmez → "Iğdır" dizinde "igdır" olur, iki yazımla da bulunmaz
for yazim in ["ığdır", "igdir"]:
    assert db.execute("SELECT count(*) FROM ham_fts WHERE ham_fts MATCH ?", (yazim,)).fetchone() == (0,)


def sorgu(kullanici_metni: str) -> str:
    """Kullanıcı metnini FTS sözdizimine güvenle çevirir: her sözcük tırnaklı, sonuncusu ön ek (yazarken arama)."""
    sozcukler = re.findall(r"\w+", katla(kullanici_metni))[:8]
    if not sozcukler:
        raise ValueError("arama metni boş")
    return " ".join(f'"{s}"' for s in sozcukler[:-1]) + f' "{sozcukler[-1]}"*'


def ara(kiraci: str, metin: str) -> list[int]:
    return [
        r[0]
        for r in db.execute(
            """SELECT b.id FROM belge_fts JOIN belge b ON b.id = belge_fts.rowid
               WHERE belge_fts MATCH ? AND b.kiraci = ? AND b.durum = 'yayinda'
               ORDER BY bm25(belge_fts, 10.0, 1.0)  -- başlıktaki eşleşme gövdedekinden 10 kat değerli
               LIMIT 20""",
            (sorgu(metin), kiraci),
        )
    ]


assert ara("a", "IĞDIR") == ara("a", "igdir") == [1, 5]  # 3 taslak, 4 başka kiracı: süzgeç dışarıda bıraktı
tam = "SELECT count(*) FROM belge_fts WHERE belge_fts MATCH ?"
assert db.execute(tam, ('"kitap"',)).fetchone() == (0,)  # ekli sözcük tam eşleşmez
assert ara("a", "kitap") == [2]  # ön ek "kitap*" → "kitaplarımızdan" bulundu
try:  # ham kullanıcı metni MATCH'e verilirse tek bir tırnak sözdizimi hatası (500) doğurur
    db.execute("SELECT rowid FROM belge_fts WHERE belge_fts MATCH ?", ('kayısı"',)).fetchall()
    raise AssertionError("hata bekleniyordu")
except sqlite3.OperationalError:
    pass
assert ara("a", 'kayısı"') == [5, 1]  # temizlenmiş sorgu çalışır; başlıkta geçen (5) önce
print("tamam")
```

```cikti
tamam
```

- Süzgeç (kiracı, durum, yetki) **arama sorgusunun içinde** durur; "önce ara, sonra uygulamada süz" yapılırsa
  sayfalama bozulur ve süzgeç unutulduğu gün başkasının belgesi görünür ([Yetkilendirme](yetkilendirme.md)).
- Özel adlara kesme işaretiyle gelen ek ("Iğdır'da") sözcük ayırıcıda bölünür; kökü ayrıca bulunur.
- FTS5 dizini ayrı bir tablodur: belge yazılırken, güncellenirken ve silinirken **aynı işlemde** güncellenmelidir
  (uygulama kodunda ya da tetikleyiciyle). Katlama işlevi değişirse dizin baştan kurulur.

## İlgi sıralaması temelleri

- BM25 (FTS5'in `bm25()` işlevi, arama motorlarının çoğunun varsayılanı) üç şeye bakar: sözcük belgede kaç kez
  geçiyor, sözcük bütün belgelerde ne kadar nadir, belge ne kadar uzun. Nadir sözcük ve kısa belgedeki eşleşme
  öne çıkar.
- Alan ağırlığı: başlıkta geçen gövdede geçenden değerlidir (örnekte 10'a 1).
- Ürün kuralları ayrı katmandır: yeni olan biraz yukarı, stokta olmayan aşağı. Bunları ilgi puanına küçük
  çarpanlar olarak ekleyin ve sonuçları gerçek sorgularla gözden geçirin; tahminle ayar yapmayın.
- Sıralamayı değiştirince sık yapılan 20–30 aramanın ilk sonuçlarını önce/sonra karşılaştırın.

## Ön ek ve yazım hatası toleransı

| İhtiyaç                                    | Yol                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Yazarken öneri ("ist" → İstanbul)          | Son sözcükte ön ek (`"ist"*`); en az 2–3 karakterden sonra sorgula; 200–300 ms bekleme |
| Sözcüğün içinden eşleşme ("stanb")         | FTS5 `trigram` ayırıcısı ya da `LIKE`                                             |
| Küçük listede yazım hatası ("ankra")       | Bellekte bulanık arama: [`kutuphane/py/kutuphane/bulanik_arama.py`](../../kutuphane/py/kutuphane/bulanik_arama.py) |
| "Bunu mu demek istediniz?"                 | Dizindeki sözcük listesinden (FTS5 `fts5vocab`) en yakın sözcüğü önerin            |
| Büyük veride yazım hatası                  | Ayrı arama motoru                                                                 |

## Türkçe: katlama ve ekler

- **Katlama:** `İ→i`, `I→ı→i`, `ç→c`, `ğ→g`, `ö→o`, `ş→s`, `ü→u`, şapkalı harfler. Uygulamada tek işlev; dizine
  giden ve sorguya giden metin aynı işlevden geçer. Hazır: [`kutuphane/py/kutuphane/turkce.py`](../../kutuphane/py/kutuphane/turkce.py)
  → `normalize_for_search`.
- **Ekler:** Türkçe bitişken bir dildir; "kitap" araması "kitaplarımızdan"ı tam eşleşmeyle bulmaz. Pratik çözüm son
  sözcükte (ya da her sözcükte) ön ek aramasıdır. Kök bulucu (stemmer) daha iyi geri çağırma verir ama yanlış kök
  de üretir ("kara" ile "karar"); ayrı motorlarda Türkçe çözümleyici bulunabilir, davranışını kendi verinizle
  sınayın (doğrulanmadı).
- **Durma sözcükleri** ("ve", "ile", "bir"): atmak dizini küçültür ama "bir" gibi sözcükler ürün adının parçası
  olabilir; varsayılan olarak atmayın.
- Ekranda her zaman **özgün** metin gösterilir; katlanmış metin yalnız anahtardır.

## Dizini güncel tutma

| Arama yeri                         | Güncelleme                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Aynı veritabanında (arama sütunu, FTS5) | Yazmayla **aynı işlemde**; silmede dizinden de silin                         |
| Ayrı arama motoru                  | Giden kutusu → dizinleyici işçi (en az bir kez, idempotent `upsert`); düzenli tam yeniden dizinleme ve sayım karşılaştırması |
| Katlama/ayırıcı değişti            | Yeni dizini yanında kurun, doldurun, sonra geçin                                   |

Silinen ya da yetkisi değişen kaydın aramada görünmeye devam etmesi en sık güvenlik hatasıdır: yetki süzgecini
dizine bırakmayın, sorgu anında uygulayın.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| "Iğdır", "ılık", "ısparta" hiçbir yazımla bulunmuyor          | Ayırıcı `ı`'yı katlamıyor; `I`'yı `i` yapıyor            | Uygulamada katlanmış metni dizinleyin, sorguyu da katlayın |
| "çay" bulunuyor, "cay" bulunmuyor (ya da tersi)               | İki taraf farklı katlandı                                | Tek katlama işlevi                                         |
| "kitap" araması "kitaplarım"ı bulmuyor                        | Tam sözcük eşleşmesi; ekler                              | Ön ek araması                                              |
| Arama kutusuna tırnak yazınca 500                             | Kullanıcı metni doğrudan `MATCH`'e verildi               | Sözcüklere ayırıp tırnaklayın                              |
| "%" araması bütün kayıtları getiriyor                         | `LIKE` jokerleri kaçışlanmadı                            | `ESCAPE` ile kaçışlayın                                    |
| Arama başka firmanın belgesini gösterdi                       | Süzgeç arama sorgusunda değil                            | Kiracı/yetki koşulu sorgunun içinde                        |
| Silinen belge aramada çıkıyor                                 | Dizin silmede güncellenmiyor                             | Aynı işlemde dizinden silin                                |
| Arama ucu veritabanını yoruyor                                | Her tuşta sorgu, sınırsız uzunluk                        | Bekleme (debounce), en az uzunluk, üst uzunluk, hız sınırı |
| Sonuç sırası anlamsız                                         | Sıralama yok ya da yalnız tarih                          | `bm25` + alan ağırlıkları                                  |

## Denetim listesi

- [ ] Arama, yükü ve ihtiyaca göre doğru basamakta (LIKE → FTS → ayrı motor).
- [ ] Dizine giden ve sorguya giden metin aynı Türkçe katlama işlevinden geçiyor; ekranda özgün metin.
- [ ] Kullanıcı metni temizleniyor: `LIKE` jokerleri kaçışlı, FTS sözdizimi tırnaklı; uzunluk sınırlı.
- [ ] Kiracı/yetki/durum süzgeci arama sorgusunun içinde; iki kiracılı test var.
- [ ] Dizin, yazma ve silmeyle aynı işlemde (ya da giden kutusuyla) güncelleniyor.
- [ ] Sıralama tanımlı (ilgi + alan ağırlığı); sık aramalarla elle gözden geçirildi.
- [ ] Yazarken aramada bekleme, en az karakter ve hız sınırı var.
- [ ] Testte "İstanbul/istanbul/ISTANBUL", "Iğdır/igdir", "çay/cay" ve ekli sözcük örnekleri var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Arama için katlanmış bir sütun/FTS tablosu kullan; dizine ve sorguya aynı `foldTr` işlevini
  uygula. Kullanıcı metnini sözcüklere ayırıp tırnakla, son sözcüğe `*` ekle. Kiracı süzgecini sorgunun içine koy.
  Testte Iğdır/igdir ve kitap/kitaplarımız örnekleri olsun."
- **Tipik hatalar:** `LOWER(ad) LIKE LOWER(?)` ile Türkçe aramayı çözdüğünü sanmak; FTS ayırıcısının Türkçeyi
  bildiğini varsaymak; arama metnini doğrudan `MATCH`'e vermek; sonuçları uygulamada süzmek; dizini güncellemeyi
  unutmak.
- **Çıktıda arayın:** `LOWER(`, `UPPER(` içeren arama sorguları; `MATCH ?` öncesinde temizlenmemiş girdi;
  `LIKE` kalıbında kaçış; arama sorgusunda `kiraci`/yetki koşulu.

## İlgili

- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md) (katlama ve harmanlama) ·
  [API tasarımı](api-tasarimi.md) (süzme ve sayfalama) · [Veri erişim katmanı](veri-erisim-katmani.md) ·
  [Yetkilendirme](yetkilendirme.md) · [Hız sınırı ve kötüye kullanım](hiz-siniri-ve-kotuye-kullanim.md)
- Sorgu dili enjeksiyonu: [Enjeksiyon](../50-guvenlik/enjeksiyon.md); dizinler ve sorgu planı:
  [SQL performans ve işlem](../10-diller/sql-performans-ve-islem.md).
- Bir arama motorunun içi (ters dizin, BM25, ifade araması, "bunu mu demek istediniz", otomatik tamamlama, Türkçe
  `İ/ı`), sıfırdan ve çalışır hâlde: [`sifirdan/veri/arama_motoru/`](../../sifirdan/veri/arama_motoru/README.md).
