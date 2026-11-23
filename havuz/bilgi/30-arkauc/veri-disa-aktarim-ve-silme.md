---
baslik: "Veri dışa aktarma ve hesap silme: KVKK başvurusunu uçtan uca karşılamak"
ozet: Kişinin verisini dışa aktarma ve hesabını silme akışında kapsam, yeniden kimlik doğrulama, büyük paket, silmenin dış sistemlere yayılması, yedekten dönüşte silme günlüğü, makbuz ve geri alınamazlık uyarısı.
etiketler: [kvkk, gizlilik, disa-aktarim, hesap-silme, yedek, denetim]
duzey: orta
guncellik: 2026-11
---

# Veri dışa aktarma ve hesap silme: KVKK başvurusunu uçtan uca karşılamak

> Bu notu ne zaman okumalı: "verilerimi indir" ve "hesabımı sil" özellikleri yazılırken ya da incelenirken; bir
> kullanıcı e-postayla verisini ya da silinmesini istediğinde; yeni bir tablo, dosya türü ya da dış hizmet eklenirken
> (ikisine de girmesi gerekir).

> **Hukuki danışmanlık değildir.** KVKK'daki haklar, süreler (başvuruya en geç 30 gün içinde yanıt diye bilinir) ve
> yasal saklama yükümlülükleri genel çerçevedir, doğrulanmadı; kapsam kararlarını bir hukukçuyla verin.

## Temel fikir

- İki başvuru vardır: "verimi ver" (erişim ve taşınabilirlik) ve "beni sil". İkisi de aynı **veri envanterinden**
  beslenir. Envanter, silme planı ve "kalan iz" testi başka notlardadır ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md),
  [Veri yaşam döngüsü](../40-sistem-tasarimi/veri-yasam-dongusu.md)); bu not akışın kendisini anlatır.
- Dışa aktarma bir **sızıntı yoludur**: hesabı ele geçiren ilk iş olarak her şeyi indirir; başkalarının verisi ve
  sırlar yanlışlıkla pakete girer.
- Silme bir **dağıtık iştir**: veritabanındaki tek işlem işin yarısıdır. Dosyalar, arama dizini, e-posta ve analitik
  sağlayıcıları, yedekler ve kullanıcının öteki cihazları kalır. Her adım idempotent, durumu kayıtlı, bitişi ölçülür.
- Silme geri alınamaz; kullanıcı neyin silinip neyin kaldığını **önceden ve açıkça** görür.

Havuzda: `GET /api/account/export` eşzamanlı JSON verir (`format: "uygulama-disa-aktarim/1"`); `DELETE /api/account`
parolayla onaylanır, tek işlemde siler, ortak alanda sahipliği en eski üyeye devreder
([`docs/API.md`](../../uygulama/docs/API.md) → "Hesap", [`account/service.ts`](../../uygulama/api/src/modules/account/service.ts)).

## Karar tablosu: dışa aktarım paketine ne girer

| Veri                                                        | Pakete girer mi                    | Not                                                        |
| ----------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Hesap bilgisi (ad, e-posta, kayıt tarihi)                   | Evet                               |                                                            |
| Kişinin girdiği içerik (kayıt, not, dosya)                  | Evet; dosyalar özgün biçimde       |                                                            |
| Ortak alanda başkasının yazdığı kayıt                       | Karar verin                        | Havuz verir (üye olarak zaten gördüğü içerik); yazanın kimliğini vermez |
| Başka üyelerin adı ve e-postası                             | Hayır                              | Havuzda üye listesi pakette yok                            |
| Giriş geçmişi, cihazlar, IP adresleri                       | Evet                               | Kişiye aittir                                              |
| Rıza kayıtları (neye, ne zaman onay verdi)                  | Evet                               |                                                            |
| Faturalar                                                   | Evet                               | PDF ya da özet satırları                                   |
| Parola özeti, TOTP sırrı, kurtarma kodu, oturum belirteci, API anahtarı | **Asla**               | Paket çalınırsa hesap da çalınır                           |
| İç notlar, sahtecilik puanı, moderasyon kararı              | Hukukçuya sorun                    | Doğrulanmadı                                               |
| Kişiye bağlanamayan toplu istatistik                        | Hayır                              | Kişisel veri değildir                                      |

## Dışa aktarma akışı

| Durum                                                   | Yol                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Veri küçük (birkaç MB), sorgular saniyeler içinde biter | Eşzamanlı indirme (havuzdaki yol)                                |
| Dosyalar, yüz binlerce kayıt, dakikalar süren hazırlık  | Eşzamansız: iş kuyruğu + "hazır" bildirimi + süreli indirme adresi |

Eşzamansız akışın adımları:

1. **Yakın zamanda kimlik doğrulama:** son 10 dakikada parola ya da e-posta kodu. Oturumu açık telefonu eline alan
   herkes bütün veriyi indirememeli.
2. **Hız sınırı:** kullanıcı başına günde 1–2 istek; aynı gün ikinci istek aynı işi döndürür (idempotentlik anahtarı:
   [Kalıcı iş kuyruğu](kalici-is-kuyrugu.md)).
3. **Tutarlı anlık görüntü:** bütün sorgular tek bir okuma işleminde; yoksa paketin yarısı eski yarısı yeni olur.
4. **Paket:** `veri.json` (tam ve sürümlü biçim), tablo başına CSV (Excel için BOM, `;`, formül kaçışı:
   [İçe ve dışa aktarım](ice-ve-disa-aktarim.md)), `dosyalar/`, alanları Türkçe açıklayan `BENIOKU.txt`.
5. **Teslim:** şifreli depoda, süreli (ör. 7 gün), yalnız sahibinin oturumuyla açılan adres; e-postada **ek değil**,
   "paketiniz hazır" bildirimi.
6. **İz:** indirme denetim kaydına yazılır ve kullanıcıya "verileriniz indirildi" bildirimi gider (ele geçirilmiş
   hesabın ilk işareti budur). Süre dolunca paket silinir.

Havuzdaki uç eşzamanlıdır ve yalnız oturum ister; veri büyüdükçe ilk eksik 1, 2, 5 ve 6. adımlardır.

Pakete ne girdiğini kural testi korur: her tablo ya bir sorguyla dışa aktarılır ya gerekçeyle dışlanır; iki
kullanıcının ortak alanı olan bir veriyle başkasının verisinin ve sırların sızmadığı denetlenir:

```python calistir
import json
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE kullanici (id TEXT PRIMARY KEY, eposta TEXT, ad TEXT, parola_ozeti TEXT, totp_sirri TEXT);
CREATE TABLE uyelik (alan TEXT, kullanici TEXT, rol TEXT);
CREATE TABLE kayit (alan TEXT, id TEXT, veri TEXT, yazan TEXT);
CREATE TABLE oturum (id TEXT, kullanici TEXT, belirtec_ozeti TEXT);
CREATE TABLE giris_gecmisi (kullanici TEXT, zaman TEXT, ip TEXT);
INSERT INTO kullanici VALUES ('u1', 'ayse@ornek.com', 'Ayşe', 'scrypt$16384$x', 'JBSWY3DP'),
                             ('u2', 'can@ornek.com', 'Can', 'scrypt$16384$y', NULL);
INSERT INTO uyelik VALUES ('ortak', 'u1', 'owner'), ('ortak', 'u2', 'editor'), ('can-ozel', 'u2', 'owner');
INSERT INTO kayit VALUES ('ortak', 'k1', '{"baslik": "Kira öde"}', 'u1'),
                         ('ortak', 'k2', '{"baslik": "Su faturası"}', 'u2'),
                         ('can-ozel', 'k3', '{"baslik": "Doktor randevusu"}', 'u2');
INSERT INTO oturum VALUES ('s1', 'u1', 'ozet');
INSERT INTO giris_gecmisi VALUES ('u1', '2026-11-20T10:00:00Z', '203.0.113.7');
""")
DISA_AKTAR = {  # her tablo için bilinçli karar; sütunlar tek tek seçilir, SELECT * yok
    "kullanici": "SELECT id, eposta, ad FROM kullanici WHERE id = :k",  # özet ve TOTP sırrı ASLA
    "uyelik": "SELECT alan, rol FROM uyelik WHERE kullanici = :k",  # öteki üyeler yok
    "kayit": "SELECT k.alan, k.id, k.veri FROM kayit k JOIN uyelik u ON u.alan = k.alan WHERE u.kullanici = :k",
    "giris_gecmisi": "SELECT zaman, ip FROM giris_gecmisi WHERE kullanici = :k",
}
HARIC = {"oturum": "belirteç özeti dışarı çıkmaz; açık oturumlar hesap ekranında listelenir"}


def disa_aktar(kullanici: str) -> str:
    veri = {tablo: [list(s) for s in db.execute(sql, {"k": kullanici})] for tablo, sql in DISA_AKTAR.items()}
    return json.dumps({"format": "ornek-disa-aktarim/1", **veri}, ensure_ascii=False)


tablolar = {t for (t,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
assert tablolar == set(DISA_AKTAR) | set(HARIC), "yeni tablo: dışa aktarıma ekleyin ya da gerekçeyle dışlayın"
paket = disa_aktar("u1")
for olmamali in ("can@ornek.com", "Doktor randevusu", "scrypt$", "JBSWY3DP", "ozet"):
    assert olmamali not in paket, olmamali
assert "Su faturası" in paket  # ortak alandaki kayıt: üye olarak zaten gördüğü içerik
print("u1 paketinde başkasının e-postası, başkasının özel alanı ve sır yok")
```

```cikti
u1 paketinde başkasının e-postası, başkasının özel alanı ve sır yok
```

`SELECT *` yazılmaz: yarın eklenen `totp_sirri` gibi bir sütun kendiliğinden pakete girer. Havuzdaki karşılığı:
`accountExportSchema` alan alan tanımlıdır ([`service.ts`](../../uygulama/api/src/modules/account/service.ts)).

## Silme akışı

1. **Sonuçları göster** (metin şablonu aşağıda) ve "önce verilerimi indir" seçeneğini sun.
2. **Yeniden kimlik doğrula:** havuzda parola. Parolasız hesapta (yalnız e-posta bağlantısıyla giriş) e-posta kodu.
3. **Onay e-postasını silmeden önce kuyruğa koy:** adres silindikten sonra kime gönderileceği bilinmez.
4. **Yerel veriyi tek işlemde sil:** havuzda kişisel alan ve kayıtları, üyelikler, oturumlar, cihazlar; tek sahibi
   olunan ortak alanda sahiplik en eski üyeye geçer, başka üye yoksa alan silinir.
5. **Bütün oturumları ve açık bağlantıları kes:** havuzda `hub.disconnectUser`.
6. **Dış sistemler için kalıcı bir silme işi** başlat (aşağıda); bitince makbuzu yaz.

| Yaklaşım                     | Artısı                                       | Bedeli ve şartı                                                                |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Hemen silme (havuzdaki yol)  | Basit; "silindi" gerçekten silindi           | Ele geçirilmiş hesapla ya da anlık öfkeyle silme geri dönmez: yeniden doğrulama şart |
| Bekleme süreli (ör. 14 gün)  | Vazgeçme şansı; destek talebi azalır         | Hesap bu sürede herkese silinmiş görünmeli (profil gizli, e-posta gitmez); arıtma işi mutlaka çalışmalı ve izlenmeli; kullanıcıya kesin tarih verilir; sürenin yasal süreyle ilişkisi hukukçuya sorulur |
| Süre içinde girişle vazgeçme | Kolay geri dönüş                             | Hesabı ele geçiren de girer: vazgeçme de yeniden doğrulama ister               |

## Silmenin yayılması

| Yer                                         | Ne yapılır                                                              | Ne zaman biter          |
| ------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- |
| Veritabanı (kişisel tablolar)               | Silme planına göre sil ya da bağı kopar                                  | İstekte, tek işlemde    |
| Ortak alandaki içerik                       | İçerik kalır; yazan bilgisi boşaltılır ya da "silinmiş kullanıcı" olur  | İstekte                 |
| Dosya deposu (özgün + küçük resimler)       | Kullanıcı önekiyle sil                                                  | Silme işi               |
| Arama dizini, önbellek, CDN                 | Dizinden çıkar, önbelleği temizle                                       | Silme işi               |
| E-posta sağlayıcısının kişi listeleri       | Sağlayıcının silme arayüzü                                              | Silme işi               |
| Analitik, hata izleme                       | Sağlayıcının silme arayüzü; baştan kimliksiz gönderim en iyisi          | Silme işi + sağlayıcı süresi |
| Ödeme sağlayıcısı, faturalar                | Yasal süre saklanır; hesapla bağ kopar                                  | Yasal süre dolunca      |
| Günlükler                                   | Saklama süresiyle düşer                                                 | Günlük saklama süresi   |
| Yedekler                                    | Saklama süresiyle düşer; geri yüklemede silme günlüğü uygulanır         | Yedek saklama süresi    |
| Kullanıcının öteki cihazları                | Sunucu ulaşamaz; istemci "hesap silindi" yanıtında yerel veriyi siler   | Cihaz çevrimiçi olunca  |

- Havuzda ortak alandaki kayıtlarda `updated_by` yabancı anahtarsız bir kimlik olarak kalır (e-posta ya da ad değil);
  silen cihaz kendi yerel veritabanını siler, öteki cihazlarda oturum düşer.
- İstemci olağan bir 401'de yerel veriyi **silmez** (süresi dolan oturum çevrimdışı değişiklikleri yok eder); yalnız
  "hesap silindi" gibi ayrı bir yanıtta siler.
- E-posta bastırma listesi (geri dönen ve abonelikten çıkan adresler) tuzaktır: tamamen silerseniz eski bir listeden
  yeniden içe aktarmada kişiye yine e-posta gidebilir. Bazı ekipler yalnız adresin özetini bastırma için tutar; özet
  de kişisel veri sayılabilir, hukukçuya sorun.

Silme işi adım adım ilerler; her adım idempotenttir, geçici hata işi bitirmez, yeniden teslim zararsızdır:

```python calistir
class Gecici(Exception):
    pass


DIS = {  # dış kopyalar (gerçekte: nesne deposu, arama motoru, e-posta ve analitik sağlayıcıları)
    "dosyalar": {"u7/avatar.jpg", "u7/fatura-ek.pdf", "u9/avatar.jpg"},
    "arama": {"u7", "u9"},
    "eposta_listesi": {"ayse@ornek.com", "can@ornek.com"},
    "analitik": {"u7", "u9"},
}
ariza = {"analitik": 1}  # analitik sağlayıcısı ilk denemede 503 dönecek


def sil(sistem: str, oge: str) -> None:
    if ariza.get(sistem, 0) > 0:
        ariza[sistem] -= 1
        raise Gecici(f"{sistem}: 503")
    DIS[sistem].discard(oge)  # idempotent: zaten yoksa hata değil


ADIMLAR = {
    "dosyalar": lambda t: [sil("dosyalar", d) for d in sorted(DIS["dosyalar"]) if d.startswith(t["kullanici"] + "/")],
    "arama": lambda t: sil("arama", t["kullanici"]),
    "eposta_listesi": lambda t: sil("eposta_listesi", t["eposta"]),
    "analitik": lambda t: sil("analitik", t["kullanici"]),
}


def surdur(talep: dict) -> None:
    """Kuyruktan alınan silme işi: biten adımı atlar; geçici hata adımı bekletir, iş yeniden kuyruğa girer."""
    for ad, adim in ADIMLAR.items():
        if talep["adimlar"].get(ad) == "tamam":
            continue
        try:
            adim(talep)
            talep["adimlar"][ad] = "tamam"
        except Gecici as hata:
            talep["adimlar"][ad] = f"bekliyor: {hata}"
    if [talep["adimlar"].get(ad) for ad in ADIMLAR] == ["tamam"] * len(ADIMLAR):
        talep["eposta"] = None  # yalnız e-posta listesinden silmek için tutulmuştu
        talep["durum"] = "tamamlandi"


talep = {"id": "sil-3f9a", "kullanici": "u7", "eposta": "ayse@ornek.com", "adimlar": {}, "durum": "suruyor"}
surdur(talep)
assert talep["durum"] == "suruyor" and talep["adimlar"]["analitik"].startswith("bekliyor")
surdur(talep)  # geri çekilmeden sonra yeniden
surdur(talep)  # yinelenen teslim: zararsız
assert talep["durum"] == "tamamlandi" and talep["eposta"] is None
assert DIS == {"dosyalar": {"u9/avatar.jpg"}, "arama": {"u9"}, "eposta_listesi": {"can@ornek.com"}, "analitik": {"u9"}}
print({k: talep[k] for k in ("id", "durum", "adimlar")})  # makbuz: kişisel veri yok
```

```cikti
{'id': 'sil-3f9a', 'durum': 'tamamlandi', 'adimlar': {'dosyalar': 'tamam', 'arama': 'tamam', 'eposta_listesi': 'tamam', 'analitik': 'tamam'}}
```

Silme işinin "hiç bitmeyen" talebi izlenir: belirlenen sürede (ör. 7 gün) `tamamlandi` olmayan talep uyarı üretir.
Başvuruya yasal sürede yanıt vermek bu ölçüye bağlıdır.

## Yedekler: silme günlüğü veritabanının dışında durur

Yedeklere tek tek dokunulmaz (şifreli ve değiştirilemez olmalıdır); silinen kişi yedeğin saklama süresi dolunca
yedekten de çıkar. Bu sürede yedekten geri dönülürse silinmiş hesaplar geri gelir; bu yüzden geri yükleme tarifinde
"silme günlüğünü yeniden uygula" adımı vardır. Günlük, geri yüklenen veritabanının **içindeyse** o da geri sarılır:

```python calistir
import sqlite3

canli = sqlite3.connect(":memory:")
canli.executescript("""
CREATE TABLE kullanici (id TEXT PRIMARY KEY, eposta TEXT);
CREATE TABLE silme_gunlugu (kullanici TEXT, zaman TEXT);  -- YANLIŞ yer: geri yüklenen veritabanının içinde
INSERT INTO kullanici VALUES ('u7', 'ayse@ornek.com'), ('u9', 'can@ornek.com');
""")
canli.commit()
yedek = sqlite3.connect(":memory:")
canli.backup(yedek)  # gece yedeği

dis_gunluk: list[str] = []  # DOĞRU yer: ayrı dosya ya da nesne deposu; yalnız iç kimlik, e-posta değil
with canli:  # gün içinde u7 hesabını sildi
    canli.execute("DELETE FROM kullanici WHERE id = 'u7'")
    canli.execute("INSERT INTO silme_gunlugu VALUES ('u7', '2026-11-23')")
dis_gunluk.append("u7")

geri = sqlite3.connect(":memory:")
yedek.backup(geri)  # felaket: canlı veritabanı gitti, geceki yedekten dönüldü


def var_mi(db: sqlite3.Connection) -> bool:
    return db.execute("SELECT count(*) FROM kullanici WHERE id = 'u7'").fetchone()[0] == 1


assert var_mi(geri)  # silinen kişi geri geldi
assert geri.execute("SELECT count(*) FROM silme_gunlugu").fetchone()[0] == 0  # içerideki günlük de geri sarıldı
with geri:  # geri yükleme tarifinin zorunlu adımı
    for kimlik in dis_gunluk:
        geri.execute("DELETE FROM kullanici WHERE id = ?", (kimlik,))
assert not var_mi(geri)
print("içerideki silme günlüğü yedekle geri sarıldı; dıştaki günlük silmeyi yeniden uyguladı")
```

```cikti
içerideki silme günlüğü yedekle geri sarıldı; dıştaki günlük silmeyi yeniden uyguladı
```

Dış günlük en uzun yedek saklama süresi boyunca tutulur, sonra silinir. Geri yükleme adımları:
[Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md), [Veri yaşam döngüsü](../40-sistem-tasarimi/veri-yasam-dongusu.md).

## Yabancı anahtar silmeyi nasıl taşır

| Kural               | Ne zaman                                                        | Havuzdaki örnek                                  |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `ON DELETE CASCADE` | Kişiye ait, kişisiz anlamsız satır (oturum, cihaz, üyelik)       | `sessions`, `members`, `clients`                 |
| `ON DELETE SET NULL`| Satır kalmalı ama kişiyle bağı kopmalı (denetim kaydının aktörü)  | `audit_log.actor_id`, davetin `created_by`       |
| `RESTRICT` (varsayılan) | Unutulan tabloyu bağırarak göstersin: silme hata verir, test yakalar | —                                         |
| Yabancı anahtarsız kimlik | Yalnız bilgi; kişi silinse de kalabilir                    | `records.updated_by`                             |

SQLite'ta yabancı anahtarlar **varsayılan olarak kapalıdır**; her bağlantıda, ilk işlemden önce açılır (havuz:
[`database.ts`](../../uygulama/api/src/db/database.ts)). Kapalıyken `CASCADE` sessizce hiçbir şey yapmaz:

```sql calistir
CREATE TABLE kullanici (id TEXT PRIMARY KEY);
CREATE TABLE oturum (id TEXT, kullanici TEXT REFERENCES kullanici (id) ON DELETE CASCADE);
INSERT INTO kullanici VALUES ('u7');
INSERT INTO oturum VALUES ('s1', 'u7');
DELETE FROM kullanici WHERE id = 'u7';  -- foreign_keys kapalı (SQLite varsayılanı)
SELECT 'yetim oturum', count(*) FROM oturum;
```

```cikti
yetim oturum|1
```

```sql calistir
PRAGMA foreign_keys = ON;  -- bağlantı açılınca, ilk işlemden ÖNCE (işlem içinde etkisizdir)
CREATE TABLE kullanici (id TEXT PRIMARY KEY);
CREATE TABLE oturum (id TEXT, kullanici TEXT REFERENCES kullanici (id) ON DELETE CASCADE);
INSERT INTO kullanici VALUES ('u7');
INSERT INTO oturum VALUES ('s1', 'u7');
DELETE FROM kullanici WHERE id = 'u7';
SELECT 'yetim oturum', count(*) FROM oturum;
```

```cikti
yetim oturum|0
```

## Makbuz ve denetim kaydı

- **Yazılır:** talep numarası, tür (dışa aktarma / silme), geliş anı, kimlik doğrulama yöntemi, adımların durumu,
  bitiş anı. **Yazılmaz:** e-posta, ad, içerik.
- Kullanıcıya talep numarasıyla e-posta gider ("3f9a numaralı talebiniz tamamlandı"); sonradan gelen "verimi sildiniz
  mi?" sorusu talep numarasıyla yanıtlanır.
- Makbuzun saklama süresi, kanıt için gereken süre kadardır; hukukçuyla belirleyin.
- Havuzda `account.deleted` denetim kaydı yazılır; 180 gün sonra bakım işi siler, kayıtta e-posta yoktur
  ([`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Veri yaşam döngüsü").
- Dışa aktarma da kaydedilir: kim, ne zaman, hangi IP'den. Kısa sürede çok sayıda dışa aktarma bir alarmdır.

## Geri alınamazlık uyarısı: metin şablonu

```text
Başlık:    Hesabınız kalıcı olarak silinsin mi?
Silinir:   Kişisel alanınız ve içindeki bütün kayıtlar.
           Bütün cihazlardaki oturumlarınız.
Kalır:     Ortak alanlardaki kayıtlarınız alanda kalır.
           Sahibi olduğunuz ortak alanlar en eski üyeye geçer.
           Faturalarınız yasal süre boyunca saklanır.
Yedekler:  Yedeklerdeki kopyalar en geç 35 gün içinde silinir.
Uyarı:     Bu işlem geri alınamaz.
Onay:      Devam etmek için şifrenizi yazın.
Düğmeler:  [Önce verilerimi indir]   [Vazgeç]   [Hesabımı kalıcı olarak sil]
```

- Düğme eylemi söyler ("Hesabımı kalıcı olarak sil"; "Tamam" değil); yıkıcı düğme varsayılan odakta durmaz.
- Metindeki süreler gerçek ayarlarla aynıdır (yedek saklama 35 gün değilse 35 yazılmaz).
- Havuzdaki metin ("Bu işlem geri alınamaz. Onaylamak için şifrenizi yazın.") kalan veriyi ve sahiplik devrini
  söylemiyor; şablondaki "Kalır" satırları eklenebilir.

## Tuzaklar

| Belirti                                                        | Neden                                                     | Çözüm                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Dışa aktarım paketinde TOTP sırrı ya da parola özeti var       | `SELECT *`; yeni sütun kendiliğinden girdi                | Sütun sütun seçim; sır sızıntısı testi                       |
| Paket başka üyelerin e-postasını içeriyor                       | Ortak alanın üye listesi olduğu gibi kondu                | İki kullanıcılı sızıntı testi                                |
| Ele geçirilen hesabın bütün verisi indirildi                   | Dışa aktarma yalnız oturum istiyor; bildirim yok          | Yakın zamanda kimlik doğrulama, hız sınırı, "indirildi" e-postası |
| Paket e-posta ekiyle gitti, başkasının kutusunda duruyor        | Ekle gönderim                                             | Süreli, oturumla açılan indirme adresi                       |
| Silme onay e-postası hiç gitmedi                               | Adres silindikten sonra gönderilmeye çalışıldı            | Onayı silmeden önce kuyruğa koy                              |
| Silinen kişi aramada ve dosya adresinde duruyor                | Silme yalnız veritabanında yapıldı                        | Dış adımlı, idempotent silme işi                             |
| Silme talebi haftalardır "sürüyor"                             | Dış adım kalıcı hata veriyor, kimse bakmıyor              | Talep yaşı uyarısı; ölü mektup                               |
| Yedekten dönüşten sonra silinmiş hesaplar geri geldi           | Silme günlüğü yoktu ya da veritabanının içindeydi         | Veritabanı dışında günlük + geri yükleme adımı               |
| Hesap silindi ama oturumlar ve tablolar duruyor                | SQLite'ta `foreign_keys` kapalı, `CASCADE` çalışmadı      | Her bağlantıda `PRAGMA foreign_keys = ON`                    |
| Kullanıcının öbür telefonu çevrimdışı değişikliklerini yitirdi | İstemci her 401'de yerel veriyi siliyor                   | Yalnız "hesap silindi" yanıtında sil                         |
| Silinen kişiye pazarlama e-postası yine gitti                  | Eski listeden yeniden içe aktarıldı; bastırma kaydı da silinmişti | Bastırma politikası (hukukçuyla), içe aktarmada denetim |
| Kullanıcı sonuçlardan habersiz sildi, ortak alanı kayboldu      | Uyarı metni neyin kaldığını söylemiyordu                  | Şablondaki "Silinir / Kalır / Yedekler" satırları            |

## Denetim listesi

- [ ] Her tablo dışa aktarım sorgusunda ya da gerekçeli dışlama listesinde; kural testi var.
- [ ] Paket sütun sütun seçiliyor; sır (özet, TOTP, belirteç) ve başkasının kişisel verisi sızmıyor (iki kullanıcılı test).
- [ ] Dışa aktarma ve silme yakın zamanda kimlik doğrulama istiyor; dışa aktarmada hız sınırı ve "indirildi" bildirimi var.
- [ ] Büyük paket eşzamansız, süreli ve oturumla açılan adresle teslim ediliyor; süresi dolan paket siliniyor.
- [ ] Silme onay e-postası silmeden önce kuyruğa giriyor.
- [ ] Yerel silme tek işlemde; dış sistemler (dosya, arama, e-posta, analitik) idempotent adımlı silme işinde.
- [ ] Silme talebinin yaşı izleniyor; süresinde bitmeyen talep uyarı üretiyor.
- [ ] Silme günlüğü veritabanının dışında; geri yükleme tarifinde yeniden uygulama adımı var ve tatbikatta denendi.
- [ ] SQLite'ta her bağlantıda `foreign_keys` açık; her yabancı anahtarın `ON DELETE` kuralı bilinçli seçildi.
- [ ] Makbuz ve denetim kaydında kişisel veri yok; talep numarası kullanıcıya bildiriliyor.
- [ ] Uyarı metni neyin silinip neyin kaldığını ve yedek süresini doğru söylüyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dışa aktarımda her tabloyu ayrı sorguyla, sütunları tek tek seçerek al; sırları (parola özeti,
  TOTP, belirteç) asla koyma. İki kullanıcının ortak alanı olan bir test verisiyle başkasının e-postasının ve özel
  alanının sızmadığını test et. Silmeyi iki parçada yaz: yerel veri tek işlemde; dış sistemler için adımları
  idempotent, durumu kayıtlı bir silme işi. Onay e-postasını silmeden önce kuyruğa koy. Silme günlüğünü veritabanının
  dışına yaz."
- **Modelin tipik hatası:** `SELECT *` ile dışa aktarır; ortak alandaki üye listesini e-postalarıyla pakete koyar;
  hesabı yalnız `users` satırını silerek siler; dosyaları ve arama dizinini unutur; silme günlüğünü aynı
  veritabanına yazar; SQLite'ta `foreign_keys`'i açmaz; uyarı metninde "Tamam" düğmesi kullanır; hukuki süreleri
  kesin hüküm gibi yazar.
- **Çıktıda arayın:** dışa aktarım sorgularında `*`; paket kurulumunda sır alanları; silme işlevinde dosya/arama/
  dış hizmet adımları; onay e-postasının silmeden önce mi sonra mı kuyruğa girdiği; makbuzda e-posta.
- **Test isteyin:** "paket başkasının verisini ve sırları içermez", "silme işi yeniden teslimde zararsız ve geçici
  hatadan sonra tamamlanır", "yedekten dönüşte silme günlüğü silinmiş hesabı yeniden siler".

## İlgili

- [KVKK pratiği](../50-guvenlik/kvkk-pratik.md) (envanter, başvurular) ·
  [Veri yaşam döngüsü](../40-sistem-tasarimi/veri-yasam-dongusu.md) (silme planı, kalan iz testi, saklama)
- [İçe ve dışa aktarım](ice-ve-disa-aktarim.md) (CSV, Excel, akışla yazma) · [Kalıcı iş kuyruğu](kalici-is-kuyrugu.md) ·
  [Oturum güvenliği](../50-guvenlik/oturum-guvenligi.md) (yeniden kimlik doğrulama, oturum iptali)
- [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md) · [Yedek ve fidye yazılımı](../50-guvenlik/yedek-ve-fidye-yazilimi.md)
- Havuzda: [`uygulama/api/src/modules/account/service.ts`](../../uygulama/api/src/modules/account/service.ts),
  [`routes.ts`](../../uygulama/api/src/modules/account/routes.ts), testleri
  [`account.test.ts`](../../uygulama/api/test/modules/account.test.ts)
