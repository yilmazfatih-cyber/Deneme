---
baslik: Yetkilendirme: rol, kaynak düzeyi denetim ve çok kiracılı yalıtım
ozet: Kim neyi yapabilir sorusunun sunucuda doğru kurulması; rol ve öznitelik tabanlı model, IDOR açığı ve kapatılması, kiracı süzgeci, yetkiyi tek yerde toplama ve olumsuz testler.
etiketler: [yetki, guvenlik, idor, rbac, cok-kiracili]
duzey: orta
guncellik: 2026-11
---

# Yetkilendirme: rol, kaynak düzeyi denetim ve çok kiracılı yalıtım

> Bu notu ne zaman okumalı: adreste kimlik (`/faturalar/{id}`) alan her uç yazılırken; paylaşım, ekip, şirket
> hesabı, rol ya da yönetici paneli eklenirken; "başka bir kullanıcının verisini gördüm" bildirimi geldiğinde.

## Temel fikir

Kimlik doğrulama "kimsin", yetkilendirme (authorization) "bunu yapabilir misin" sorusudur. Uygulamalarda en sık
ve en pahalı güvenlik hatası ikincisinin **kaynak düzeyinde** unutulmasıdır: kullanıcı giriş yapmıştır, rolü de
uygundur, ama istediği kayıt **onun değildir**. Adresteki sayıyı 101'den 102'ye çeviren kişi başkasının faturasını
okur. Adı IDOR (Insecure Direct Object Reference) ya da BOLA'dır (Broken Object Level Authorization).

Dört kural:

1. Yetki **her istekte, sunucuda** denetlenir. Arayüzde düğmeyi gizlemek yetki değildir.
2. Kimlik ve kiracı **oturumdan** gelir; istek gövdesinden, adresten, belirteçteki rol alanından değil.
3. Kayıt sorgusu sahiplik koşulunu **sorgunun içinde** taşır (`WHERE id = ? AND kiraci = ?`).
4. Kurallar **tek dosyada** durur ve her kuralın "olmaz" testi vardır.

## Karar tablosu: hangi model

| Durum                                                            | Model                                   | Not                                                    |
| ---------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| Birkaç sabit rol (kullanıcı, yönetici)                           | Rol tabanlı (RBAC)                      | `user.role` ile yeter                                  |
| Yetki kaynağa üyeliğe bağlı (alan sahibi / düzenleyen / izleyici) | Kaynak düzeyinde rol (üyelik tablosu)  | Havuzdaki çalışma alanları böyle                       |
| Kural kaydın özelliğine bağlı (kendi şubesi, tutar < 10 000 ₺)   | Öznitelik tabanlı (ABAC)                | Kuralı işlev olarak yazın: `can(kullanici, islem, kayit)` |
| Tek tek kayıt paylaşımı (belge başına kişi listesi)              | Erişim listesi / ilişki tabanlı         | Paylaşım tablosu + kalıtım kuralları; karmaşıklık artar |
| Şirketler birbirinin verisini asla görmemeli                     | Çok kiracılı yalıtım + yukarıdakilerden biri | Kiracı süzgeci her sorguda zorunlu                |

Çoğu ürün "rol + kaynak üyeliği" ile başlar; ABAC'ı ancak somut bir kural istediğinde ekleyin.

## Kaynak düzeyinde denetim (IDOR)

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE fatura (id INTEGER PRIMARY KEY, kiraci TEXT NOT NULL, tutar_kurus INTEGER NOT NULL);
INSERT INTO fatura VALUES (101, 'firma-a', 50000), (102, 'firma-b', 990000);
""")


# YANLIŞ: kimlik adresten gelir, kimin sorduğuna bakılmaz → herkes sırayla 1, 2, 3… dener
def fatura_getir_yanlis(fatura_id: int):
    return db.execute("SELECT id, tutar_kurus FROM fatura WHERE id = ?", (fatura_id,)).fetchone()


# DOĞRU: kiracı OTURUMDAN gelir ve sorgunun içindedir; başkasının kaydı "yok" sayılır (404)
def fatura_getir(oturum: dict, fatura_id: int):
    return db.execute(
        "SELECT id, tutar_kurus FROM fatura WHERE id = ? AND kiraci = ?", (fatura_id, oturum["kiraci"])
    ).fetchone()


def fatura_sil(oturum: dict, fatura_id: int) -> bool:
    silinen = db.execute("DELETE FROM fatura WHERE id = ? AND kiraci = ?", (fatura_id, oturum["kiraci"]))
    return silinen.rowcount == 1  # 0 → 404; "önce oku, sonra sil" yarışı da yok


ayse = {"kullanici": "ayse", "kiraci": "firma-a"}
assert fatura_getir_yanlis(102) == (102, 990000)  # firma-a çalışanı firma-b'nin faturasını gördü
assert fatura_getir(ayse, 101) == (101, 50000)
assert fatura_getir(ayse, 102) is None  # → 404 (403 değil: varlığı da sızmasın)
assert fatura_sil(ayse, 102) is False and db.execute("SELECT count(*) FROM fatura").fetchone()[0] == 2
print("tamam")
```

```cikti
tamam
```

Gözden kaçan yerler — yetki yalnız "kaydı getir" ucunda değil, şunların hepsinde gerekir:

- **Liste, arama, sayım, dışa aktarım, rapor** uçları (süzgeç unutulursa toplu sızıntı olur).
- **Güncelleme ve silme**: koşul `UPDATE … WHERE id = ? AND kiraci = ?` içinde; etkilenen satır 0 ise 404.
- **İç içe adresler**: `PATCH /alanlar/A/gorevler/X` isteğinde X'in gerçekten A'ya ait olduğu denetlenir; yoksa
  A'nın üyesi, B'deki X'i değiştirir.
- **Gövdedeki yabancı kimlikler**: `{"projeId": 2}` gönderen kişinin proje 2'ye erişimi var mı?
- **Dosya adresleri**: tahmin edilebilir dosya adı ya da süresiz bağlantı ([Dosya ve medya](dosya-ve-medya.md)).
- **Arka plan işleri**: kullanıcının başlattığı iş, kullanıcının yetkisiyle çalışır; "sistem" yetkisiyle değil.
- **Önbellek**: anahtarında kullanıcı/kiracı yoksa yanıt başkasına gider ([Önbellek](onbellek.md)).

## Çok kiracılı yalıtım

Birden çok şirketin (kiracının, tenant) verisi aynı veritabanındaysa **her** sorgu kiracı süzgeci taşır. Bunu
insan dikkatine bırakmayın; yapıya gömün:

| Katman                    | Önlem                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Veri erişimi              | Depo nesnesi kiracıyla kurulur (`FaturaDeposu(kiraci)`); kiracısız sorgu yazılamaz         |
| Şema                      | Her tabloda `kiraci` sütunu; benzersizlikler kiracıya göre: `UNIQUE (kiraci, eposta)`     |
| Şema                      | Bileşik yabancı anahtar: başka kiracının kaydına bağlantı veritabanında reddedilir        |
| Veritabanı (Postgres)     | Satır düzeyi güvenlik (row level security) ikinci kat olarak; birinci kat yine uygulama  |
| Önbellek, arama, kuyruk   | Anahtar/dizin/iş yükü kiracı kimliğini taşır                                             |
| Test                      | İki kiracı kurulur; birinin kullanıcısı ötekinin her kaydına her uçtan 404 alır          |

Bileşik yabancı anahtar, uygulamadaki bir doğrulama unutulduğunda son savunmadır:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")  # SQLite'ta varsayılan KAPALI
db.executescript("""
CREATE TABLE proje (
  kiraci TEXT NOT NULL,
  id INTEGER NOT NULL,
  ad TEXT NOT NULL,
  PRIMARY KEY (kiraci, id)
);
CREATE TABLE gorev (
  kiraci TEXT NOT NULL,
  id INTEGER NOT NULL,
  proje_id INTEGER NOT NULL,
  baslik TEXT NOT NULL,
  PRIMARY KEY (kiraci, id),
  -- Görev yalnız KENDİ kiracısının projesine bağlanabilir
  FOREIGN KEY (kiraci, proje_id) REFERENCES proje (kiraci, id)
);
INSERT INTO proje VALUES ('firma-a', 1, 'Web sitesi'), ('firma-b', 2, 'Gizli proje');
""")
db.execute("INSERT INTO gorev VALUES ('firma-a', 10, 1, 'Ana sayfa')")
try:
    # Uygulama proje_id'yi doğrulamayı unuttu: firma-a'nın görevi firma-b'nin projesine bağlanmak isteniyor
    db.execute("INSERT INTO gorev VALUES ('firma-a', 11, 2, 'Sızma')")
    raise AssertionError("veritabanı reddetmeliydi")
except sqlite3.IntegrityError as hata:
    assert "FOREIGN KEY" in str(hata)
print("tamam")
```

```cikti
tamam
```

Kişisel uygulamada "kiracı" kullanıcının kendisi ya da üyesi olduğu alandır. Havuzdaki API'de bütün kayıtlar
`workspace_id` taşır, üye olmayan her istek 404 alır ([`permissions.ts`](../../uygulama/api/src/modules/workspaces/permissions.ts)
→ `requireMembership`); eşitlemede her değişiklik kendi alanındaki role göre ayrı ayrı denetlenir
([`sync/service.ts`](../../uygulama/api/src/modules/sync/service.ts)).

## Yetkiyi tek yerde toplama

- Kurallar bir dosyada: `can(kullanici, islem, kaynak)` ya da `assertCanX(uyelik)` işlevleri. Başında okunabilir
  bir rol tablosu. Servisler yalnız bu işlevleri çağırır; rotada, şablonda, SQL'in ortasında `if rol == 'admin'`
  dağınıklığı olmaz.
- Denetim, işlemin **başında** ve iş kuralıyla **aynı veritabanı işleminde** yapılır (rol arada değişmesin).
- Tanımsız işlem adı hata versin; yazım hatası sessizce "izin var" ya da "izin yok"a dönmesin.
- Varsayılan "hayır"dır: kural bulunamazsa reddedilir.
- Arayüz aynı kuralları göstermek için okuyabilir (düğmeyi gizlemek), ama karar sunucudadır.

Havuzdaki örnek: [`uygulama/api/src/modules/workspaces/permissions.ts`](../../uygulama/api/src/modules/workspaces/permissions.ts)
(başlıkta rol tablosu, her kural bir `assert…` işlevi, üye olmayana 404, son sahip düşürülemez).

## Yetki testleri

Her kural için **olumsuz** test: yetkisi olmayan rol denediğinde 403, üye olmayan denediğinde 404, oturumsuz
denediğinde 401. Kuralı tablo olarak testte ayrıca yazmak hem belge hem güvencedir:

```python calistir
# Yetki kuralları TEK yerde: (rol, işlem) → izin. Servisler yalnız `yapabilir` sorar.
KURALLAR = {
    "okumak": {"sahip", "duzenleyen", "izleyici"},
    "yazmak": {"sahip", "duzenleyen"},
    "davet_etmek": {"sahip"},
    "silmek": {"sahip"},
}


def yapabilir(rol: str | None, islem: str) -> bool:
    if islem not in KURALLAR:
        raise KeyError(f"tanımsız işlem: {islem}")
    return rol in KURALLAR[islem]


# Beklenen tablo testte AYRICA yazılır: her hücre, özellikle her "hayir" sınanır
BEKLENEN = """
islem        sahip  duzenleyen  izleyici  uye-degil
okumak       evet   evet        evet      hayir
yazmak       evet   evet        hayir     hayir
davet_etmek  evet   hayir       hayir     hayir
silmek       evet   hayir       hayir     hayir
"""
satirlar = [s.split() for s in BEKLENEN.strip().splitlines()]
roller = [None if r == "uye-degil" else r for r in satirlar[0][1:]]
sinanan = set()
for islem, *hucreler in satirlar[1:]:
    for rol, hucre in zip(roller, hucreler):
        assert yapabilir(rol, islem) == (hucre == "evet"), (rol, islem)
    sinanan.add(islem)
assert sinanan == set(KURALLAR), "tabloda olmayan kural var: testi güncelleyin"
olumsuz = sum(s[1:].count("hayir") for s in satirlar[1:])
print(f"{len(sinanan)} işlem, {olumsuz} olumsuz durum sınandı")
```

```cikti
4 işlem, 9 olumsuz durum sınandı
```

İşlev düzeyindeki test yetmez; uç düzeyinde de sınayın (uç işlevi çağırmayı unutmuş olabilir). Havuzdaki iki
güvence: [`rules.test.ts`](../../uygulama/api/test/rules.test.ts) herkese açık uçların bilinçli bir listede
olduğunu ve öteki **her** ucun oturumsuz isteğe 401 verdiğini denetler;
[`security.test.ts`](../../uygulama/api/test/security.test.ts) ve
[`workspaces.test.ts`](../../uygulama/api/test/modules/workspaces.test.ts) her rol kuralının olumsuz durumunu sınar.

## Yönetici işlemleri

- Yönetici uçları ayrı bir kapıdan geçer (`requireAdmin`) ve ayrı adres önekinde durur (`/api/admin/*`).
- Yönetici **kendi** rolünü değiştiremez, kendini kapatamaz; son yöneticiyi kaldırmak engellenir.
- Her yönetici işlemi denetim günlüğüne: kim, ne zaman, kime, ne yaptı ([`audit/repo.ts`](../../uygulama/api/src/modules/audit/repo.ts)).
- "Kullanıcı olarak gör" (impersonation) gerekiyorsa: süreli, varsayılan salt okunur, günlüğe yazılan ve
  kullanıcıya görünen bir oturum olsun; yöneticinin kendi oturumundan ayrı.
- En az yetki: destek ekibine "hesabı kapat/aç" yetkisi verip "rol değiştir" yetkisini vermemek gibi rolleri ayırın.
- Yönetici hesabında ikinci etken ve hassas işlemde yeniden parola.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Adresteki sayıyı değiştiren başkasının kaydını görüyor           | Sorguda sahiplik/kiracı koşulu yok                       | `WHERE id = ? AND kiraci = ?`; yoksa 404                        |
| Tekil uç korunuyor ama dışa aktarım herkesin verisini veriyor    | Yetki her uçta ayrı ayrı elle yazılmış                   | Kiracıyla kurulan depo; liste/aktarım testleri                  |
| Kullanıcı kendini yönetici yaptı                                 | Rol istek gövdesinden ya da belirteçteki alandan okundu  | Rol veritabanından; gövdede alan izin listesi                   |
| Başkasının alanına "erişim yok" yanıtı alanın varlığını söylüyor | Üye olmayana 403                                         | Üye olmayana 404; üye ama yetkisize 403                         |
| A alanındaki kişi B alanındaki görevi değiştirebiliyor           | İç içe adreste yalnız üst kaynak denetlendi              | Alt kaydın gerçek üst kaynağını da denetleyin                   |
| İzleyici rolü eşitleme/toplu uçtan yazabiliyor                   | Yazma yetkisi yalnız tekil uçta denetlendi               | Toplu işlemde her öğe için ayrı denetim                         |
| Yetki kaldırıldı ama kişi bir süre daha yazabiliyor              | Rol belirteçte ya da önbellekte saklı                    | Rolü her istekte veritabanından okuyun ya da önbelleği silin    |
| Arama sonuçlarında başka firmanın belgesi çıkıyor                | Arama dizini kiracı süzgeci olmadan sorgulanıyor         | Dizin sorgusuna kiracı koşulu; testte iki kiracı                |
| Silinen üyenin arka plan işi veriye dokunmaya devam ediyor       | İş "sistem" yetkisiyle, başlatan kullanıcıdan bağımsız   | İş, başlatanın kimliğini taşır ve çalışırken yetkiyi yeniden denetler |
| Yeni eklenen uç oturumsuz çağrılabiliyor                         | Kapı (`requireUser`) unutuldu                            | "Herkese açık uçlar listesi" kural testi                        |

## Denetim listesi

- [ ] Kimlik ve kiracı yalnız oturumdan okunuyor; istemcinin gönderdiği rol/sahip alanı yok sayılıyor.
- [ ] Kimlik alan her uçta (okuma, güncelleme, silme, liste, sayım, aktarım) sahiplik/kiracı koşulu sorguda.
- [ ] Üye olmayana 404, üye ama yetkisize 403, oturumsuza 401.
- [ ] İç içe adreslerde alt kaydın üst kaynağı denetleniyor; gövdedeki yabancı kimlikler de.
- [ ] Kurallar tek dosyada, başında tablo; servisler yalnız oradaki işlevleri çağırıyor.
- [ ] Her kural için olumsuz test var; iki kiracılı "çapraz erişim" testi var.
- [ ] Oturumsuz çağrılabilen uçlar bilinçli bir listede ve testle korunuyor.
- [ ] Yönetici işlemleri denetim günlüğünde; yönetici kendi rolünü değiştiremiyor.
- [ ] Önbellek anahtarları, arama dizini ve iş kuyruğu kiracı kimliğini taşıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yetki kuralını `permissions.ts`'e bir `assertCan…` işlevi olarak ekle, tabloya satır yaz;
  serviste işlemin başında çağır. Üye olmayana 404, yetkisize 403. Her kural için 'yetkisiz rol denedi' ve 'üye
  olmayan denedi' testlerini yaz." (Tarif: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni yetki kuralı".)
- **Tipik hatalar:** `SELECT … WHERE id = ?` yazıp kiracıyı unutmak; yetkiyi yalnız arayüzde (düğmeyi gizleyerek)
  yapmak; rolü istekten okumak; liste ucunu korumayı unutmak; olumsuz test yerine yalnız "mutlu yol" testi yazmak.
- **Çıktıda arayın:** kimlik parametresi alan her sorguda kullanıcı/kiracı koşulu var mı (`WHERE id = ?` tek başına
  şüphelidir); `req.body.role`, `req.body.userId`, `ownerId` okunuyor mu; yeni uçta `requireUser` var mı.
- **Doğrulama:** iki kullanıcı ve iki kiracı kuran bir test isteyin; model kendi açığını o testle görür.

## İlgili

- [Kimlik doğrulama](kimlik-dogrulama.md) · [Veritabanı tasarımı](veritabani-tasarimi.md) (kısıtlar) ·
  [Veri erişim katmanı](veri-erisim-katmani.md) (kiracıyla kurulan depo)
- Güvenlik kararlarının tamamı: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Yetki".
