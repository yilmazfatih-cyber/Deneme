---
baslik: Veri yaşam döngüsü: saklama, arşiv, silme talebi, yedek ve geri yükleme
ozet: Her veri türü için saklama süresi, partili silme işi, arşiv, KVKK silme talebinin bütün tablolarda uygulanması ve denetimi, yedek ile kopya farkı, RPO/RTO ve geri yükleme tatbikatı; çalışan örneklerle.
etiketler: [veri, saklama, kvkk, yedek, geri-yukleme, silme]
duzey: orta
guncellik: 2026-11
---

# Veri yaşam döngüsü: saklama, arşiv, silme talebi, yedek ve geri yükleme

> Bu notu ne zaman okumalı: yeni bir tablo, günlük ya da dosya türü eklenirken ("bu veri ne zaman silinecek?");
> bir kullanıcı hesabını ve verisini silmek istediğinde; yedekleme kurulurken; "kopyamız var, yedeğe gerek yok"
> denirken; veritabanı ya da günlükler kontrolsüz büyürken.

> Hukuk notu: KVKK ve vergi/ticaret mevzuatıyla ilgili satırlar genel ilkedir, **hukuki danışmanlık değildir**.
> Süreleri ve yükümlülükleri güncel mevzuattan ve bir hukukçudan doğrulayın (Kasım 2026, doğrulanmadı).
> Geliştiricinin KVKK denetim listesi (envanter, aydınlatma, açık rıza, yurt dışı aktarım, başvurular):
> [KVKK pratiği](../50-guvenlik/kvkk-pratik.md).

## Temel fikir

- Her veri türünün yazılı bir **yaşam döngüsü** vardır: ne için toplanır, ne kadar saklanır, sonra ne olur (silinir,
  anonimleştirilir, arşivlenir). Süresi yazılmamış veri sonsuza dek kalır ve hem maliyet hem hukuki risk olur.
- Silme **otomatiktir** (düzenli bakım işi), elle değil; küçük partiler hâlinde yapılır.
- Kişinin silme talebi **bütün** kopyalara uzanır: tablolar, dosyalar, önbellek, arama dizini, günlükler,
  analitik, yedekler. Bunun tek güvenilir yolu tablo tablo yazılmış bir **silme planı** ve onu denetleyen testtir.
- **Kopya yedek değildir.** Kopya (replication) hatayı da saniyeler içinde kopyalar; yedek geçmişe dönmeyi sağlar.
- Denenmemiş yedek, yedek değildir: geri yükleme düzenli **tatbik edilir** ve süresi ölçülür.

## Karar tablosu: veri türüne göre saklama

| Veri                                   | Saklama (örnek)                         | Sonra                                       | Not                                                     |
| -------------------------------------- | --------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Hesap bilgisi (ad, e-posta)            | Hesap açık olduğu sürece                | Hesap silinince sil                         | Silme talebi 30 gün içinde sonuçlanmalı (KVKK; doğrulayın) |
| Kullanıcı içeriği                      | Kullanıcı silene dek                    | Mezar taşı → süre sonra içeriği temizle     | Geri alma penceresi ([Çevrimdışı-önce](cevrimdisi-once-ve-esitleme.md)) |
| Oturum, sıfırlama/davet belirteci      | Süresi dolana dek + kısa pay            | Sil                                         | Havuz: [`maintenance.ts`](../../uygulama/api/src/maintenance.ts) `RETENTION` |
| Erişim günlüğü (IP içerir)             | 30–90 gün                               | Sil                                         | IP kişisel veridir                                      |
| Denetim günlüğü                        | 180 gün – birkaç yıl                    | Sil ya da arşivle                           | Güvenlik incelemesi için gereken süre kadar             |
| Ham analitik olaylar                   | Kısa (ör. 90 gün)                       | Toplulaştır, ham hâli sil                   | Toplu sayılar uzun yaşar, kişiye bağlı satır yaşamaz    |
| Fatura, ödeme kaydı                    | Yasal saklama süresi (yıllar)           | Süre dolunca sil                            | Hesap silinse de saklanır; hesapla bağı koparılır       |
| Yedekler                               | Döngüsel: günlük × 7, haftalık × 4, aylık × N | Süresi dolan yedek silinir             | Silme talepleri yedeklerde süreyle temizlenir           |
| Geliştirme/deneme verisi               | Hiç gerçek veri yok                     | —                                           | Üretim verisini geliştirmeye kopyalamayın; sentetik üretin |

Süreler ürünün amacına göre seçilir ve **kişisel veri saklama ve imha politikası** gibi tek bir belgede durur;
koddaki sabitler (`RETENTION`) o belgeyle aynı olmalıdır.

## Saklama işi: küçük partiler

Büyük bir tabloda tek seferde `DELETE` yazma kilidini uzun tutar, işlem günlüğünü şişirir, kopyayı geride bırakır.
Silme küçük partilerle, her parti kısa bir işlemde yapılır:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("CREATE TABLE erisim_gunlugu (id INTEGER PRIMARY KEY, zaman TEXT NOT NULL, ip TEXT)")
db.execute("CREATE INDEX erisim_gunlugu_zaman ON erisim_gunlugu (zaman)")  # silme sorgusu taramasın
db.executemany(
    "INSERT INTO erisim_gunlugu (zaman, ip) VALUES (?, ?)",
    ((f"2026-{1 + i % 11:02d}-15T10:00:00Z", "203.0.113.7") for i in range(25_000)),
)
SINIR = "2026-08-18T00:00:00Z"  # bugün 2026-11-16: 90 günden eskiler silinir (gerçekte saatten hesaplanır)
partiler = []
while True:
    db.execute("BEGIN IMMEDIATE")  # her parti kısa bir işlem: yazma kilidi uzun tutulmaz
    silinen = db.execute(
        "DELETE FROM erisim_gunlugu WHERE id IN (SELECT id FROM erisim_gunlugu WHERE zaman < ? LIMIT 5000)",
        (SINIR,),
    ).rowcount
    db.execute("COMMIT")
    if silinen == 0:
        break
    partiler.append(silinen)
assert db.execute("SELECT min(zaman) FROM erisim_gunlugu").fetchone()[0] >= SINIR
print(f"{len(partiler)} partide {sum(partiler)} satır silindi: {partiler}")
```

```cikti
4 partide 18184 satır silindi: [5000, 5000, 5000, 3184]
```

- Zaman sütununda dizin olsun; yoksa her parti tabloyu baştan tarar.
- İş silinen satır sayısını ve süreyi günlüğe yazar; hiç çalışmadığını fark etmek için ölü adam anahtarı
  ([Gözlemlenebilirlik](gozlemlenebilirlik.md) → uyarı tasarımı).
- Çok büyük olay tablolarında zamana göre bölümleme yapılır; eski bölüm tek komutla düşürülür
  ([Veritabanı ölçekleme](veritabani-olcekleme.md)).
- Dosyalar da veridir: veritabanı satırı silinince nesne deposundaki dosya, küçük resimleri ve CDN kopyaları da
  silinir ([Dosya paylaşımı örneği](ornek-dosya-paylasimi.md)).

## Arşiv

Arşiv, nadiren okunan veriyi ucuz depolamaya taşımaktır (ör. ay ay sıkıştırılmış dosyalar). Kurallar: arşiv de
silme talebine ve saklama süresine tabidir; arşivden geri getirme yolu yazılı ve denenmiş olmalıdır; arşivin biçimi
(şema sürümü) dosyanın yanında saklanır.

## Silme talebi (KVKK)

KVKK'nın genel ilkesi: işleme amacı ortadan kalkan kişisel veri silinir, yok edilir ya da anonim hâle getirilir;
ilgili kişi bunu talep edebilir ve başvuruya makul sürede (mevzuatta en geç 30 gün) cevap verilir. Pratikte:

1. **Veri envanteri:** kişisel veri taşıyan her tablo, dosya alanı, günlük ve dış hizmet listelenir.
2. **Silme planı:** her tablo için bilinçli karar — sil, hesapla bağı kopar (yasal saklama), anonimleştir.
3. **Uygulama:** tek işlemde (havuzda `DELETE /api/account`), ardından önbellek ve arama dizini temizliği.
4. **Denetim:** silmeden sonra kişinin bilinen değerleri (kimlik, e-posta, ad, telefon) bütün tablolarda aranır.
5. **Kayıt:** talebin ne zaman geldiği, ne zaman tamamlandığı; kişisel veri içermeyen biçimde.

Plan ve denetim, testle korunur. Yeni bir tablo eklenip plana yazılmazsa test kırılır; serbest metin alanına
yazılmış kişisel veri ise denetimde yakalanır:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE kullanici (id TEXT PRIMARY KEY, eposta TEXT, ad TEXT);
CREATE TABLE gorev (id INTEGER PRIMARY KEY, kullanici_id TEXT, baslik TEXT);
CREATE TABLE fatura (id INTEGER PRIMARY KEY, kullanici_id TEXT, alici_ad TEXT, tutar_kurus INTEGER);
CREATE TABLE erisim_gunlugu (id INTEGER PRIMARY KEY, kullanici_id TEXT, ip TEXT);
CREATE TABLE destek_notu (id INTEGER PRIMARY KEY, metin TEXT);
INSERT INTO kullanici VALUES ('u7', 'ayse@ornek.com', 'Ayşe Yılmaz');
INSERT INTO gorev (kullanici_id, baslik) VALUES ('u7', 'Kira öde');
INSERT INTO fatura (kullanici_id, alici_ad, tutar_kurus) VALUES ('u7', 'Ayşe Yılmaz', 49900);
INSERT INTO erisim_gunlugu (kullanici_id, ip) VALUES ('u7', '203.0.113.7');
INSERT INTO destek_notu (metin) VALUES ('ayse@ornek.com aradı, faturasını sordu');
""")
SILME_PLANI = {  # her tablo için bilinçli karar: sil, bağı kopar, ya da gerekçeli sakla
    "kullanici": "DELETE FROM kullanici WHERE id = :k",
    "gorev": "DELETE FROM gorev WHERE kullanici_id = :k",
    "fatura": "UPDATE fatura SET kullanici_id = NULL WHERE kullanici_id = :k",  # yasal saklama: hesapla bağı kopar
    "erisim_gunlugu": "DELETE FROM erisim_gunlugu WHERE kullanici_id = :k",
}
IZINLI = {"fatura.alici_ad": "fatura yasal süre boyunca saklanır; süre dolunca saklama işi siler"}


def kalan_izler(degerler: list[str]) -> set[str]:
    """Bütün tabloların bütün metin sütunlarında kişinin bilinen değerlerini arar."""
    bulunan = set()
    for (tablo,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall():
        sutunlar = [s[1] for s in db.execute(f"PRAGMA table_info({tablo})")]
        for satir in db.execute(f"SELECT * FROM {tablo}"):
            for sutun, deger in zip(sutunlar, satir):
                if isinstance(deger, str) and any(d in deger for d in degerler):
                    bulunan.add(f"{tablo}.{sutun}")
    return bulunan


tablolar = {t for (t,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
assert tablolar - set(SILME_PLANI) == {"destek_notu"}  # kural: planda olmayan tablo = karar verilmemiş veri
with db:
    for sql in SILME_PLANI.values():
        db.execute(sql, {"k": "u7"})
kalan = kalan_izler(["u7", "ayse@ornek.com", "Ayşe Yılmaz"]) - set(IZINLI)
print("silmeden sonra kalan izler:", sorted(kalan))
assert kalan == {"destek_notu.metin"}  # serbest metne yazılmış e-posta planın kör noktası
```

```cikti
silmeden sonra kalan izler: ['destek_notu.metin']
```

- Serbest metin alanları (destek notu, yorum, dosya adı) planın kör noktasıdır: mümkünse kişiye bağlı bir sütunla
  tutun ki silinebilsin; e-posta ve telefon serbest metne yazılmasın.
- Silme, **mezar taşlarının içeriğini** de temizler: kimlik ve "silindi" kalır, veri alanları boşaltılır.
- Silinen kullanıcı kimliği denetim günlüğünde belirli bir süre kalabilir (güvenlik amacıyla); bu bilinçli ve
  yazılı bir karar olmalıdır. Havuzdaki karar: 180 gün ([`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md)
  → "Veri yaşam döngüsü").
- Yedeklerdeki kopya, yedeğin saklama süresi dolunca kendiliğinden silinir. Yedekten geri yükleme yapılırsa
  **silme günlüğündeki** (silinen kullanıcı kimlikleri listesi) silmeler yeniden uygulanır.
- Kişinin "verilerimi ver" talebi de aynı envanteri kullanır (havuz: `GET /api/account/export`).

## Yedek ve kopya farkı

```python calistir
import sqlite3

birincil, kopya, yedek = (sqlite3.connect(":memory:") for _ in range(3))
for db in (birincil, kopya):
    db.execute("CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT)")


def yaz(sql: str, *p: object) -> None:  # birincile yaz; kopyalama aynı değişikliği hemen kopyaya uygular
    for db in (birincil, kopya):
        db.execute(sql, p)
        db.commit()


def say(db: sqlite3.Connection) -> int:
    return db.execute("SELECT count(*) FROM musteri").fetchone()[0]


for i in range(1, 101):
    yaz("INSERT INTO musteri VALUES (?, ?)", i, f"müşteri {i}")
birincil.backup(yedek)  # gece yedeği: tutarlı anlık kopya
yaz("INSERT INTO musteri VALUES (101, 'yeni müşteri')")  # yedekten sonraki yazma
yaz("DELETE FROM musteri")  # hatalı komut: WHERE unutuldu
assert say(birincil) == 0 and say(kopya) == 0  # kopya hatayı da kopyaladı
assert say(yedek) == 100  # yedekten dönülür; yedekten sonraki 1 kayıt kayıp (RPO)
print(f"birincil {say(birincil)} | kopya {say(kopya)} (hata da kopyalandı) | yedek {say(yedek)} (101. kayıt kayıp)")
```

```cikti
birincil 0 | kopya 0 (hata da kopyalandı) | yedek 100 (101. kayıt kayıp)
```

| Ölçüt                         | Yedek                                              | Kopya (replication)                          |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Neye karşı korur              | Hatalı komut, yazılım hatası, fidye yazılımı, bozulma | Makine/disk arızası, okuma yükü           |
| Yanlış `DELETE`               | Önceki yedekte durur                               | Saniyeler içinde kopyaya da gider            |
| RPO (en çok ne kadar veri kaybı) | Yedek aralığı (günlük yedek → 24 saate kadar)   | Kopya gecikmesi kadar                        |
| RTO (geri dönme süresi)       | Geri yükleme süresi (dakikalar–saatler)            | Yük devri (saniyeler–dakikalar)              |

- **RPO** (recovery point objective) ve **RTO** (recovery time objective) ürün kararıdır: "en çok bir saatlik veri
  kaybı ve iki saatlik kesinti kabul". RPO bir saatse günlük yedek yetmez: işlem günlüğünü sürekli dışarı akıtan
  bir yöntem gerekir. Zamanlama, saklama, şifreleme ve yedeği izleme: [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md).
- 3-2-1 kuralı: en az 3 kopya, 2 farklı ortam, 1'i başka bir yerde (başka hesap/sağlayıcı). Yedekler şifrelenir;
  yedeği silebilen kimlik bilgisi, sunucuda duran kimlik bilgisiyle aynı olmamalıdır (fidye yazılımı yedeği de siler:
  [Yedek ve fidye yazılımı](../50-guvenlik/yedek-ve-fidye-yazilimi.md)).
- SQLite'ta tutarlı yedek: çalışan sunucuda `VACUUM INTO` ya da yedekleme arayüzü; dosyayı düz `cp` ile kopyalamak
  işlem ortasında bozuk kopya verebilir. Havuzdaki yol: `npm run backup` (`VACUUM INTO` + `PRAGMA integrity_check`):
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Yedekleme ve geri yükleme".

## Geri yükleme tatbikatı

Takvimde düzenli (ör. üç ayda bir) yapılır ve sonucu yazılır:

1. En son yedeği **ayrı bir makineye** ya da klasöre indir (canlıya dokunma).
2. Bütünlük denetimi (`PRAGMA integrity_check`), tablo başına satır sayısı, en son kaydın zamanı (RPO'yu doğrular).
3. Uygulamayı bu veritabanıyla aç; giriş yap, bir kaydı oku, bir kayıt yaz.
4. Baştan sona geçen süreyi ölç: RTO hedefinin altında mı?
5. İstemcilerin eski bir sunucu hâliyle karşılaşınca ne yaptığını bil (havuzdaki eşitleme `reset` durumunu
   kullanıcıya sorar: [`ESITLEME.md`](../../uygulama/docs/ESITLEME.md) → "Reset").
6. Silme günlüğünü yeniden uygula; tatbikat notuna tarih, süre, sorunlar yazılır.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Veritabanı ve günlükler yıllar içinde dev boyuta ulaştı          | Saklama süresi yazılmamış                                | Veri türü başına süre + bakım işi                          |
| Saklama işi gece bütün siteyi kilitliyor                         | Tek seferde dev `DELETE`                                 | Küçük partiler, dizin, bölüm düşürme                       |
| Hesabı silinen kullanıcının e-postası destek notlarında duruyor  | Serbest metin silme planında yok                         | Kişiye bağlı sütun; kalan iz taraması                      |
| Silinen kullanıcı aramada hâlâ çıkıyor                           | Arama dizini/önbellek temizlenmedi                       | Silme planına dizin ve önbellek adımı                      |
| Yanlış `DELETE` sonrası "kopyadan döneriz" denince kopya da boş  | Kopya yedek değildir                                     | Ayrı, geçmişe dönülebilir yedek                            |
| Yedek var ama geri yükleme sırasında bozuk çıktı                 | Çalışan veritabanı düz kopyalandı, hiç denenmedi         | Tutarlı yedek yöntemi + düzenli tatbikat                   |
| Fidye yazılımı yedekleri de sildi                                | Yedek aynı kimlik bilgisiyle, aynı yerde                 | Ayrı hesap, değiştirilemez saklama, başka yerde kopya      |
| Geri yüklemeden sonra silinmiş kullanıcılar geri geldi           | Silme talepleri yedekten sonra yeniden uygulanmadı       | Silme günlüğü ve geri yükleme adımı                        |
| Geliştiricinin dizüstünde gerçek müşteri verisi                  | Üretim verisi test için kopyalandı                       | Sentetik veri; zorunluysa maskeleme                        |

## Denetim listesi

- [ ] Kişisel veri taşıyan her tablo, dosya alanı, günlük ve dış hizmet envanterde.
- [ ] Her veri türünün saklama süresi yazılı; kodda tek yerde (`RETENTION` gibi) ve belgeyle aynı.
- [ ] Bakım işi partili siliyor, sonucu günlüğe yazıyor; çalışmazsa uyarı var.
- [ ] Silme planı her tabloyu kapsıyor; "planda olmayan tablo" ve "kalan iz" testleri var.
- [ ] Silme önbelleği, arama dizinini, dosyaları ve mezar taşı içeriklerini de temizliyor.
- [ ] Yedek otomatik, şifreli, başka bir yerde; yedekleri silebilen kimlik bilgisi ayrı.
- [ ] RPO ve RTO yazılı; yedek yöntemi RPO'yu karşılıyor.
- [ ] Son geri yükleme tatbikatının tarihi ve süresi biliniyor; silme günlüğü yeniden uygulanıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni tabloyu silme planına ekle: kişisel veri içeriyor mu, saklama süresi ne, hesap silinince
  ne olacak (sil / bağı kopar / anonimleştir). Saklama işi 5000'lik partilerle, her parti ayrı kısa işlemde silsin.
  Planda olmayan tablo için test kırılsın."
- **Modelin tipik hatası:** yeni tabloyu silme ve dışa aktarma yollarına eklemeyi unutur; `DELETE FROM … WHERE
  zaman < ?` tek seferde yazar; kullanıcı silinince yalnız `kullanici` satırını siler; "kopya var" diye yedeği
  atlar; yedek betiğinde çalışan veritabanını `cp` ile kopyalar.
- **Çıktıda arayın:** yeni `CREATE TABLE` için silme planında ve dışa aktarımda satır var mı; saklama işinde
  `LIMIT` ve döngü var mı; yedek komutunda `VACUUM INTO`/yedekleme arayüzü ve bütünlük denetimi var mı.
- **Test isteyin:** "kullanıcı silindikten sonra kimliği, e-postası ve adı izinli istisnalar dışında hiçbir
  tabloda kalmaz" ve "yeni tablo plana eklenmezse test kırılır" testleri.

## İlgili

- [Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md) (mezar taşları) · [Veritabanı ölçekleme](veritabani-olcekleme.md)
  (bölüm düşürme, kopya) · [Çok kiracılık](cok-kiracilik.md) (kiracı başına silme ve geri yükleme)
- [KVKK pratiği](../50-guvenlik/kvkk-pratik.md) · [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md) ·
  [Yedek ve fidye yazılımı](../50-guvenlik/yedek-ve-fidye-yazilimi.md) · [Sır yönetimi](../50-guvenlik/sir-yonetimi.md)
  (yedek şifreleme anahtarları) · [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md)
- Havuzda: [`uygulama/api/src/maintenance.ts`](../../uygulama/api/src/maintenance.ts),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) (§5), [`uygulama/docs/MEZAR_TASI.md`](../../uygulama/docs/MEZAR_TASI.md)
