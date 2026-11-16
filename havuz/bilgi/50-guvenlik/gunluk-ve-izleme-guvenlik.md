---
baslik: Güvenlik günlüğü, saptama ve denetim izi
ozet: Hangi güvenlik olaylarının hangi alanlarla kaydedileceği, günlük enjeksiyonu ve maskeleme, şüpheli örüntüleri yakalayan basit saptayıcı, uyarı eşikleri ve değiştirilemeyen denetim izi; çalışan örneklerle.
etiketler: [guvenlik, gunluk, izleme, denetim-izi, uyari]
duzey: orta
guncellik: 2026-11
---

# Güvenlik günlüğü, saptama ve denetim izi

> Bu notu ne zaman okumalı: giriş, yetki, yönetici işlemi ya da dışa aktarma ekleyen bir değişiklikte; uyarı
> kurulurken; bir olaydan sonra "ne oldu, ne zamandan beri" sorusuna cevap aranırken. Genel günlük düzeni (düzeyler,
> istek kimliği, günlüğe asla yazılmayanlar): [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md).

## Temel fikir

Güvenlik açısından günlüğün üç işi vardır:

1. **Saptama:** saldırı sürerken fark etmek (çok sayıda başarısız giriş, başkasının kayıtlarını deneme).
2. **Soruşturma:** olaydan sonra kim, ne zaman, neye erişti sorusunu cevaplamak.
3. **Hesap verebilirlik:** yönetici "ben yapmadım" diyemesin; kayıt sonradan değiştirilemesin.

Bunun için iki ayrı akış tutulur: **erişim/uygulama günlüğü** (her istek, kısa ömürlü, hacimli) ve **denetim izi**
(audit trail: güvenlikle ilgili olaylar, yapılandırılmış, uzun ömürlü, değiştirilemez). Günlük kendisi de bir
saldırı yüzeyidir: içine yazılan sır ya da kişisel veri, günlüğü okuyabilen herkese sızar.

## Karar tablosu: hangi olay, hangi alanlar

| Olay                                         | Örnek ad                    | Alanlar (kişisel veri olmadan)                          | Neden                               |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------- | ----------------------------------- |
| Giriş başarılı / başarısız                   | `auth.login`, `auth.login_failed` | kullanıcı kimliği (varsa), IP, neden kategorisi, ikinci etken | Kaba kuvvet ve ele geçirme izi |
| Hız sınırı aşıldı                            | `rate_limited`              | kural adı, anahtar türü, IP                             | Saldırı göstergesi                  |
| Parola, e-posta, ikinci etken değişti        | `auth.password_changed` …   | kullanıcı, IP                                           | Ele geçirmenin en net işareti       |
| Oturum iptali, "her yerden çık"              | `auth.logout_all`           | kullanıcı, kaç oturum                                   | Müdahale izi                        |
| Yetki reddi (403/404 başkasının kaydına)     | `authz.denied`              | kullanıcı, kaynak türü, kaynak kimliği                  | IDOR taraması                       |
| Rol ve üyelik değişikliği                    | `member.role_changed`       | yapan, hedef, eski/yeni rol                              | Yetki yükseltme                     |
| Yönetici işlemi                              | `admin.user_updated`        | yapan, hedef, değişen alan adları                        | İnkâr edilemezlik                   |
| Toplu dışa aktarma, rapor indirme            | `account.export`            | kullanıcı, kayıt sayısı                                  | Veri sızıntısı                      |
| API anahtarı oluşturma/silme, ayar değişikliği | `apikey.created`          | yapan, kapsam                                            | Kalıcı erişim bırakma               |
| İmza/belirteç doğrulama hatası (webhook vb.) | `webhook.bad_signature`     | kaynak IP, uç                                           | Sahte istek denemesi                |
| CSP ihlal raporu                             | `csp.violation`             | yönerge, engellenen kaynak                               | XSS denemesi ya da bozuk yayın      |

Havuzdaki uygulamanın denetim olayları ve alanları: [`audit/repo.ts`](../../uygulama/api/src/modules/audit/repo.ts)
→ `AUDIT_ACTIONS` (kişiyi kullanıcı kimliğiyle anar; e-posta ve parola yazmaz; 180 gün saklar).

Her kayıtta: UTC zaman, olay adı, yapan (kullanıcı kimliği), hedef, IP, istek kimliği, sonuç. Asla: parola
(yanlış girilen dahil), belirteç, çerez, `Authorization` başlığı, tam kart/IBAN, istek gövdesinin tamamı.

## Günlük enjeksiyonu ve maskeleme

Neden açık: düz metin günlüğe kullanıcı girdisi olduğu gibi yazılırsa satır sonu karakteri **sahte bir günlük
satırı** üretir; soruşturmayı yanıltır, günlük okuyan araçları kandırır. Yapılandırılmış (JSON) günlük her kaydı
tek satırda tutar ve özel karakterleri kaçışlar. Aynı yerde sır adlı alanlar maskelenir.

```python calistir
import io
import json
import logging
import re

kullanici_adi = "ayse\n2026-11-16 12:00:00 INFO giriş başarılı: yonetici"

# YANLIŞ: düz metin + girdi olduğu gibi
duz = io.StringIO()
duz_gunluk = logging.getLogger("duz")
duz_gunluk.addHandler(logging.StreamHandler(duz))
duz_gunluk.propagate = False
duz_gunluk.warning(f"giriş başarısız: {kullanici_adi}")
assert "giriş başarılı: yonetici" in duz.getvalue().splitlines()[1]  # sahte satır oluştu

# DOĞRU: tek satır JSON + sır adlı alanların maskelenmesi
GIZLI = re.compile(r"(?i)parola|password|token|secret|authorization|cookie|sifre")


class JsonBicim(logging.Formatter):
    def format(self, kayit: logging.LogRecord) -> str:
        alanlar = getattr(kayit, "alanlar", {})
        temiz = {k: ("***" if GIZLI.search(k) else v) for k, v in alanlar.items()}
        return json.dumps({"duzey": kayit.levelname, "olay": kayit.getMessage(), **temiz}, ensure_ascii=False)


cikti = io.StringIO()
isleyici = logging.StreamHandler(cikti)
isleyici.setFormatter(JsonBicim())
gunluk = logging.getLogger("guvenlik")
gunluk.addHandler(isleyici)
gunluk.propagate = False
gunluk.warning("auth.login_failed", extra={"alanlar": {"ad": kullanici_adi, "ip": "203.0.113.7", "authorization": "Bearer abc"}})

satirlar = cikti.getvalue().splitlines()
kayit = json.loads(satirlar[0])
assert len(satirlar) == 1 and kayit["ad"] == kullanici_adi  # TEST: tek satır, girdi veri olarak kaldı
assert kayit["authorization"] == "***" and "Bearer abc" not in cikti.getvalue()
print("tamam")
```

```cikti
tamam
```

Alan adına göre maskeleme son kattır; asıl kural sırrı günlüğe **hiç göndermemektir**. Serbest metinde sır ve
kişisel veri bulan maskeleyici: [`yz/yz/guvenlik/maske.py`](../../yz/yz/guvenlik/maske.py) → `gunluk_icin_maskele`.
Uygulamadaki test, bütün akışlardan sonra günlükte parola, belirteç, çerez ya da e-posta geçmediğini denetler:
[`security.test.ts`](../../uygulama/api/test/security.test.ts).

## Şüpheli örüntüler ve eşikler

| Örüntü                                            | Ne anlama gelir                         | Başlangıç eşiği (verinize göre ayarlayın) | Tepki                                         |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Tek hesapta art arda başarısız giriş              | Kaba kuvvet                             | 15 dk'da 10                               | Hız sınırı zaten keser; kullanıcıya bildirim  |
| Tek IP'den çok sayıda **farklı** hesaba başarısız | Parola püskürtme                        | 15 dk'da 5 farklı hesap                   | IP'yi yavaşlat; incele                        |
| Çok başarısızlıktan sonra başarılı giriş          | Deneme tuttu                            | 5 başarısızlık + başarı                   | Hemen: hesabı incele, kullanıcıya "siz miydiniz?" |
| Küresel başarısız giriş oranında sıçrama           | Sızmış parola listesiyle doldurma       | Haftalık ortalamanın 3 katı               | İkinci etken zorunluluğu, sızmış parola denetimi |
| Bir kullanıcıdan çok sayıda farklı kimliğe 403/404 | Kimlik taraması (IDOR)                  | 5 dk'da 20 farklı kimlik                  | Hesabı yavaşlat; kodda yetkiyi denetle        |
| Yönetici rolü verildi, denetim kaydı silinmek istendi | Kalıcılık ya da iz silme              | Her olay                                  | Hemen bildirim; ikinci kişi onayı             |
| Olağandışı dışa aktarma hacmi                     | Veri sızdırma                           | Kullanıcının olağan hacminin çok üstü     | İncele; gerekirse oturumu düşür               |
| Yayından sonra CSP ihlali sıçraması               | XSS denemesi ya da bozuk yayın          | Yayın öncesi seviyenin birkaç katı        | Yayını incele                                 |

Kural: nadir ve kesin olaylar (yönetici rolü, denetim izine dokunma) **her seferinde** uyarır; gürültülü olanlar
(başarısız giriş) **toplanıp** eşikle uyarır. Her uyarının "ne yapılır" notu olur; gereksiz uyarı, gerçek
uyarının yok sayılmasına yol açar.

```python calistir
from collections import defaultdict

PENCERE = 15 * 60
OLAYLAR = [  # (zaman sn, olay, ip, hesap)
    *[(i * 30, "auth.login_failed", "198.51.100.9", "ayse") for i in range(6)],
    (200, "auth.login", "198.51.100.9", "ayse"),
    *[(300 + i, "auth.login_failed", "203.0.113.5", h) for i, h in enumerate(["ali", "can", "ece", "naz", "oya"])],
    (400, "member.role_changed:admin", "192.0.2.1", "mert"),
]


def sapta(olaylar: list[tuple[int, str, str, str]]) -> list[str]:
    uyarilar = []
    hesap_hata: dict[str, list[int]] = defaultdict(list)
    ip_hesaplar: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for zaman, olay, ip, hesap in sorted(olaylar):
        if olay == "auth.login_failed":
            hesap_hata[hesap] = [t for t in hesap_hata[hesap] if zaman - t < PENCERE] + [zaman]
            ip_hesaplar[ip] = [(t, h) for t, h in ip_hesaplar[ip] if zaman - t < PENCERE] + [(zaman, hesap)]
            if len({h for _, h in ip_hesaplar[ip]}) == 5:
                uyarilar.append(f"{zaman}: {ip} 15 dk'da 5 farklı hesabı denedi (püskürtme)")
        elif olay == "auth.login" and len(hesap_hata[hesap]) >= 5:
            uyarilar.append(f"{zaman}: {hesap} {len(hesap_hata[hesap])} başarısızlıktan sonra girdi ({ip})")
            hesap_hata[hesap].clear()
        elif olay == "member.role_changed:admin":
            uyarilar.append(f"{zaman}: {hesap} yönetici yapıldı (her seferinde uyarı)")
    return uyarilar


for uyari in sapta(OLAYLAR):
    print(uyari)
```

```cikti
200: ayse 6 başarısızlıktan sonra girdi (198.51.100.9)
304: 203.0.113.5 15 dk'da 5 farklı hesabı denedi (püskürtme)
400: mert yönetici yapıldı (her seferinde uyarı)
```

Gerçek ortamda bu kuralları günlük toplama aracınızın sorgu/uyarı diline yazarsınız; mantık aynıdır. Saptayıcının
**testi** de olmalıdır: yukarıdaki gibi sentetik olay listesi, beklenen uyarı listesi.

## Değiştirilemeyen denetim izi

Saldırgan (ya da kötü niyetli bir yönetici) izini silmek ister. Üç kat:

1. **Uygulama düzeyi:** denetim tablosuna yalnız ekleme yapılır; güncelleme ve silme veritabanında reddedilir.
   Saklama süresi dolanların silinmesi ayrı, yetkili bir bakım işidir.
2. **Kurcalama tespiti:** her kayıt bir öncekinin özetini taşır (özet zinciri); aradan bir kaydın değiştirilmesi ya
   da silinmesi zinciri kırar.
3. **Sunucu dışı kopya:** kayıtlar düzenli olarak sunucunun silemeyeceği bir yere (yalnız yazma yetkili depolama,
   değiştirilemez nesne kilidi) gönderilir; sunucuyu ele geçiren geçmişi silemez.

```python calistir
import hashlib
import json
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE denetim (id INTEGER PRIMARY KEY, olay TEXT NOT NULL, yapan TEXT, onceki TEXT NOT NULL, ozet TEXT NOT NULL);
CREATE TRIGGER denetim_guncellenmez BEFORE UPDATE ON denetim BEGIN SELECT RAISE(ABORT, 'denetim kaydı değiştirilemez'); END;
CREATE TRIGGER denetim_silinmez BEFORE DELETE ON denetim BEGIN SELECT RAISE(ABORT, 'denetim kaydı silinemez'); END;
""")


def ekle(olay: str, yapan: str) -> None:
    satir = db.execute("SELECT ozet FROM denetim ORDER BY id DESC LIMIT 1").fetchone()
    onceki = satir[0] if satir else "0" * 64
    ozet = hashlib.sha256((onceki + json.dumps([olay, yapan], ensure_ascii=False)).encode()).hexdigest()
    db.execute("INSERT INTO denetim (olay, yapan, onceki, ozet) VALUES (?, ?, ?, ?)", (olay, yapan, onceki, ozet))


def zincir_saglam() -> int | None:
    """Bozuk ilk kaydın kimliğini döndürür; zincir sağlamsa None."""
    beklenen = "0" * 64
    for kimlik, olay, yapan, onceki, ozet in db.execute("SELECT id, olay, yapan, onceki, ozet FROM denetim ORDER BY id"):
        hesap = hashlib.sha256((onceki + json.dumps([olay, yapan], ensure_ascii=False)).encode()).hexdigest()
        if onceki != beklenen or ozet != hesap:
            return kimlik
        beklenen = ozet
    return None


for olay, yapan in [("auth.login", "u1"), ("member.role_changed:admin", "u1"), ("account.export", "u2")]:
    ekle(olay, yapan)
assert zincir_saglam() is None
# TEST 1: uygulama düzeyinde değiştirme ve silme reddedilir
for sql in ["UPDATE denetim SET yapan = 'u9' WHERE id = 2", "DELETE FROM denetim WHERE id = 2"]:
    try:
        db.execute(sql)
        raise AssertionError("reddedilmeliydi")
    except sqlite3.IntegrityError:
        pass
# TEST 2: veritabanına doğrudan erişen biri tetikleyiciyi kaldırıp kaydı değiştirse zincir kırılır
db.executescript("DROP TRIGGER denetim_guncellenmez; UPDATE denetim SET yapan = 'u9' WHERE id = 2;")
assert zincir_saglam() == 2
print("tamam")
```

```cikti
tamam
```

Özet zinciri kurcalamayı **gösterir**, engellemez: veritabanını tümden ele geçiren zinciri baştan yeniden de
hesaplayabilir. Son özeti düzenli olarak sunucu dışına (ayrı hesapta bir depolamaya) yazmak bunu da yakalar.

Saklama süresi bir ödünleşimdir: soruşturma için uzun, KVKK'nın "gerektiği kadar sakla" ilkesi için kısa. Süreyi
gerekçesiyle yazın (havuzda 180 gün; [KVKK pratiği](kvkk-pratik.md)).

## Tuzaklar

| Belirti                                                           | Neden                                                     | Çözüm                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Olay sonrası "kim girdi" sorusunun cevabı yok                     | Başarılı girişler ve IP kaydedilmiyor                     | Olay kataloğundaki her satır denetim izinde                     |
| Günlükte kullanıcıların yanlış parolaları duruyor                  | Başarısız giriş gövdesiyle birlikte yazıldı               | Gövde yazılmaz; yalnız neden kategorisi                         |
| Günlükte olmayan bir "başarılı giriş" satırı görülüyor             | Günlük enjeksiyonu (girdide satır sonu)                   | JSON günlük; girdi alan değeri olarak                           |
| Yüzlerce uyarı geliyor, kimse bakmıyor                            | Her başarısız girişe uyarı                                | Toplama + eşik; nadir olaylara anında uyarı                     |
| Saldırgan yönetici olup izlerini sildi                            | Denetim tablosu silinebilir; tek kopya sunucuda           | Ekleme-yalnız tablo, özet zinciri, sunucu dışı kopya             |
| Zaman çizelgesi tutmuyor                                          | Sunucular farklı saat dilimi ya da kaymış saat            | Her yerde UTC; saat eşitleme açık                               |
| Vekil arkasında bütün olaylar aynı IP'den görünüyor                | Gerçek istemci IP'si okunmuyor                             | `TRUST_PROXY` doğru ayar ([Parola ve hesap](parola-ve-hesap-guvenligi.md)) |
| Denetim izi yıllardır büyüyor, kişisel veri içeriyor               | Saklama süresi yok                                        | Süre + bakım işi; kişiyi kimlikle anın                          |

## Denetim listesi

- [ ] Olay kataloğundaki olaylar (giriş, başarısız giriş, hesap değişiklikleri, yetki reddi, rol, yönetici,
      dışa aktarma) denetim izine yazılıyor; alanlarda parola, belirteç, e-posta yok.
- [ ] Günlük yapılandırılmış (JSON, tek satır); sır adlı alanlar maskeleniyor; "günlükte sır yok" testi var.
- [ ] Saptama kuralları ve eşikleri yazılı; nadir olaylar anında, gürültülüler eşikle uyarıyor; her uyarının
      "ne yapılır" notu var.
- [ ] Denetim tablosu ekleme-yalnız; değiştirme/silme reddediliyor; özet zinciri ya da sunucu dışı kopya var.
- [ ] Bütün zamanlar UTC; saklama süresi gerekçeli ve bakım işiyle uygulanıyor.
- [ ] Saptayıcının sentetik olaylarla testi var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu işlemi denetim izine yaz: `ctx.audit.record({ action: '…', actorId, targetId })`; olay
  adını `AUDIT_ACTIONS`'a ekle. E-posta, parola, belirteç ya da gövde yazma. Günlük için yapılandırılmış
  günlükçüyü kullan; `console.log` ile metin birleştirme yok."
- **Modelin tipik hatası:** hata ayıklamak için isteğin tamamını günlüğe basmak; başarısız girişi e-posta adresiyle
  yazmak; olayı işlemin dışında kaydetmek (işlem geri alınınca kayıt kalır ya da tersi); her olaya ayrı uyarı
  önermek.
- **Çıktıda denetleyin:** `console.log(req`, `logger.info(body`, `password`, `token`, `email` geçen günlük
  satırları; yeni hassas işlemde denetim kaydı var mı; kayıt veritabanı işleminin içinde mi.
- **Test isteyin:** "işlemden sonra denetim izinde tek kayıt var ve e-posta içermiyor", "günlük çıktısında
  parola/belirteç geçmiyor", saptayıcı için sentetik olay testi.

## İlgili

- Genel günlük düzeni ve uyarı sinyalleri: [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md)
- Olay sırasında: [Olay müdahalesi](olay-mudahalesi.md) · Kişisel veri ve saklama: [KVKK pratiği](kvkk-pratik.md)
- Çalışan kod: [`uygulama/api/src/lib/logger.ts`](../../uygulama/api/src/lib/logger.ts) (yasaklı alanlar),
  [`http/requestLog.ts`](../../uygulama/api/src/http/requestLog.ts) (adres kalıbı, sorgu dizgisi yok),
  [`modules/audit/repo.ts`](../../uygulama/api/src/modules/audit/repo.ts) (denetim olayları)
