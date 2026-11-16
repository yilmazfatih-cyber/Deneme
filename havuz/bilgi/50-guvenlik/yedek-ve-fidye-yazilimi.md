---
baslik: Yedek ve fidye yazılımına karşı hazırlık
ozet: Yedeği saldırgana karşı korumak: 3-2-1 ve değiştirilemez ya da çevrimdışı kopya, yalnız yazabilen kimlik, sunucunun çözemediği şifreleme, sağlam olmayan yedekte duran saklama işi ve hangi yedeğe dönüleceği.
etiketler: [guvenlik, yedek, fidye-yazilimi, geri-yukleme, en-az-yetki]
duzey: orta
guncellik: 2026-11
---

# Yedek ve fidye yazılımına karşı hazırlık

> Bu notu ne zaman okumalı: yedek yeri ve yedek kimliği seçilirken; "yedeğimiz var" denildiğinde ama saldırgan
> sunucuyu ele geçirse yedeklere ne olacağı bilinmediğinde; fidye yazılımı ya da sunucu ele geçirme şüphesinde.
> Yedeğin mekaniği (SQLite/PostgreSQL tutarlı yedek, zamanlama, saklama çizelgesi, geri yükleme tatbikatı, `age`
> komutları): [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md).

## Temel fikir

Kaza için alınan yedek ile saldırgana karşı alınan yedek aynı şey değildir. Fidye yazılımı ya da sunucuyu ele
geçiren biri önce **yedekleri arar**: sunucunun kimlik bilgisiyle erişebildiği her yedeği siler ya da şifreler,
sonra canlı veriyi şifreler. Bu yüzden güvenlik açısından dört soru:

1. **Silinebilir mi?** Üretim sunucusunun kimliği yedekleri silebiliyor, üzerine yazabiliyor mu?
2. **Okunabilir mi?** Yedek dosyası ya da yedek hesabı sızarsa içindeki veri açık mı?
3. **Bozuk veri sağlam yedeği kovalar mı?** Şifrelenmiş canlı veri yedeklenip saklama işi eski sağlam yedekleri
   siliyor mu?
4. **Hangi yedeğe döneceğiz?** Saldırganın bıraktığı arka kapı (yeni yönetici, API anahtarı) yedekte de var mı?

## Karar tablosu: neye karşı ne korur

| Tehdit                                        | Ne korur                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Yanlışlıkla silme, hatalı göç                 | Sık yedek; göçten önce anlık görüntü ([Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md)) |
| Disk, sunucu, barındırma hesabı kaybı         | Başka ortamda ve başka hesapta kopya                                           |
| Üretimi ele geçiren saldırgan, fidye yazılımı | Üretim kimliğiyle silinemeyen kopya: yalnız yazma yetkisi + nesne kilidi ya da çevrimdışı ortam |
| Yedek dosyasının ya da yedek hesabının sızması | Sunucuda açık anahtarla şifreleme; özel anahtar sunucuda yok                  |
| Şifrelenmiş/silinmiş veri haftalarca fark edilmeden yedeklenir | Yedek öncesi sağlamlık denetimi; denetim geçmezse saklama işi silmez |
| Saldırganın bıraktığı kalıcılık               | Olaydan önceki yedeği seçmek; geri yüklemeden sonra kalıcılık taraması         |

## 3-2-1, artı değiştirilemez kopya, artı sıfır hata

| Kural | Anlamı                                                 | Küçük bir uygulamada                                          |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------- |
| 3     | Verinin en az üç kopyası                               | Canlı veritabanı + günlük uzak yedek + aylık çevrimdışı kopya |
| 2     | İki farklı ortam türü                                  | Sunucu diski + nesne depolama                                 |
| 1     | Bir kopya başka yerde                                  | Başka sağlayıcı ya da en azından başka hesap                  |
| +1    | Bir kopya değiştirilemez ya da çevrimdışı               | Nesne kilitli kova ya da bağlantısı kesilen harici disk       |
| +0    | Son tatbikatta sıfır hata                              | Tatbikat kaydı: tarih, süre, kayıp penceresi                  |

## Saldırganın silemeyeceği kopya

- **Yalnız yazma:** üretimdeki yedek kimliği yeni nesne yükler; silemez, üzerine yazamaz, kilidi kaldıramaz.
  Silme ve saklama işi **ayrı bir kimlikte**, iki aşamalı doğrulamayla korunan ayrı bir hesapta çalışır.
- **Çekme düzeni:** daha da iyisi, yedek makinesi üretimden yedeği **çeker**; üretimde yedek deposunun hiçbir
  kimliği bulunmaz.
- **Sürümleme + nesne kilidi:** kilit süresince kimse nesneyi silemez. Sağlayıcıların kilit kipleri farklıdır
  (bazısında yetkili hesap kilidi aşabilir); belgesinde doğrulayın, süreyi saklama çizelgesiyle uyumlu seçin.
- **Çevrimdışı:** ayda bir harici diske alınıp bağlantısı kesilen kopya hâlâ en ucuz değiştirilemez ortamdır.

Kimlik yetkilerini kural testiyle denetleyin; yetki listesi (altyapı tanımı, politika dosyası) değiştikçe test
yakalar:

```python calistir
KIMLIKLER = {  # altyapı tanımından okunmuş yetkiler (gösterim için elle yazıldı)
    "uretim-yedek-yazici": {"nesne_yaz", "nesne_sil", "listele"},
    "tatbikat-okuyucu": {"oku", "listele"},
    "yedek-yoneticisi": {"oku", "listele", "nesne_sil", "kilit_kaldir"},
}
KURAL = {  # her kimliğin işi için gereken EN AZ yetki
    "uretim-yedek-yazici": {"nesne_yaz"},  # sunucuyu ele geçiren yedek silemesin
    "tatbikat-okuyucu": {"oku", "listele"},
    "yedek-yoneticisi": {"oku", "listele", "nesne_sil"},  # kilit kaldırma kimsede yok
}


def fazla_yetkiler(kimlikler: dict[str, set[str]], kural: dict[str, set[str]]) -> list[str]:
    sorunlar = []
    for ad, yetkiler in sorted(kimlikler.items()):
        fazla = yetkiler - kural.get(ad, set())
        if fazla:
            sorunlar.append(f"{ad}: fazla yetki: {', '.join(sorted(fazla))}")
    return sorunlar


for sorun in fazla_yetkiler(KIMLIKLER, KURAL):
    print(sorun)
```

```cikti
uretim-yedek-yazici: fazla yetki: listele, nesne_sil
yedek-yoneticisi: fazla yetki: kilit_kaldir
```

## Şifreleme: sunucu şifreler ama çözemez

- Yedek sunucudan **çıkmadan önce** şifrelenir; depolama sağlayıcısının sunucu tarafı şifrelemesi, hesabı ele
  geçirene karşı korumaz.
- Açık/özel anahtar ayrımı kullanılır: sunucuda yalnız **açık anahtar** durur; sunucuyu ele geçiren yeni yedekleri
  şifreleyebilir ama eski yedekleri **okuyamaz**. Komutlar: [Veritabanı yedekleme → Sunucu dışına kopya](../60-devops/veritabani-yedekleme.md).
- Özel anahtar yedekle aynı yerde ve aynı hesapta durmaz: parola yöneticisi + basılı bir kopya. Anahtar kaybı yedek
  kaybıdır; tatbikat şifre çözmeyi de dener. Kendi şifreleme biçiminizi yazmayın ([Kriptografi kullanımı](kriptografi-kullanimi.md)).

Havuzdaki uygulamanın yedekleri şu an şifrelenmiyor (bilinen sınır,
[`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) §5); açık anahtarla şifreleme bu boşluğu kapatır.

## Bozuk veri sağlam yedeği kovalamasın

Fidye yazılımı canlı veritabanını şifrelerse gece yedeği şifrelenmiş çöpü yedekler; saklama işi de "en yeni 7
günü tut" kuralıyla bir hafta içinde son sağlam yedekleri siler. Önlem: yedekten **önce** sağlamlık denetimi
(sonuç yedeğin yanına yazılır) ve saklama işinde sigorta: son yedekler sağlam ve tutarlı değilse **hiçbir şey
silinmez**, uyarı verilir.

```python calistir
import os
import pathlib
import sqlite3
import tempfile


def yedek_oncesi_denetim(db_yolu: pathlib.Path) -> dict:
    """Gece yedeğinden önce çalışır; sonuç yedeğin yanına (bildirim dosyası) yazılır."""
    if db_yolu.read_bytes()[:16] != b"SQLite format 3\x00":
        return {"saglam": False, "neden": "veritabanı başlığı yok: dosya şifrelenmiş ya da bozulmuş olabilir"}
    db = sqlite3.connect(db_yolu)
    try:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            return {"saglam": False, "neden": "bütünlük denetimi başarısız"}
        return {"saglam": True, "satir": db.execute("SELECT COUNT(*) FROM gorev").fetchone()[0]}
    finally:
        db.close()


def budanabilir_mi(bildirimler: list[dict]) -> bool:
    """Saklama işi eski yedekleri ancak son üç yedek sağlam ve birbiriyle tutarlıysa siler."""
    son = bildirimler[-3:]
    if len(son) < 3 or not all(b["saglam"] for b in son):
        return False
    return min(b["satir"] for b in son) >= 0.5 * max(b["satir"] for b in son)  # toplu silme de şüphelidir


canli = pathlib.Path(tempfile.mkdtemp()) / "uygulama.db"
db = sqlite3.connect(canli)
db.execute("CREATE TABLE gorev (id INTEGER PRIMARY KEY, baslik TEXT)")
db.executemany("INSERT INTO gorev (baslik) VALUES (?)", [(f"görev {i}",) for i in range(1000)])
db.commit()
db.close()

gecmis = [yedek_oncesi_denetim(canli) for _ in range(3)]
assert budanabilir_mi(gecmis)  # olağan gün: eski yedekler silinebilir

canli.write_bytes(os.urandom(64 * 1024))  # fidye yazılımı canlı dosyayı şifreledi
gecmis.append(yedek_oncesi_denetim(canli))
assert not gecmis[-1]["saglam"] and not budanabilir_mi(gecmis)  # TEST: saklama işi durdu, eski yedekler duruyor
print(gecmis[-1]["neden"])
```

```cikti
veritabanı başlığı yok: dosya şifrelenmiş ya da bozulmuş olabilir
```

Aynı denetim uyarı da üretir: "yedek öncesi denetim başarısız" en erken fidye yazılımı işaretlerinden biridir
([Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)). Yedeğin yaşı ve boyutunun izlenmesi:
[Veritabanı yedekleme → Yedeğin kendisini izlemek](../60-devops/veritabani-yedekleme.md).

## Hangi yedeğe dönülür

Saldırgan sistemdeyken alınan yedekler onun bıraktığı **kalıcılığı** da taşır: yeni yönetici hesabı, API anahtarı,
webhook, değiştirilmiş ayar. Kural: ele geçirmenin başladığı andan **önceki** son sağlam yedeği seçin (başlangıç
anı denetim izinden: [Olay müdahalesi](olay-mudahalesi.md)). Daha yeni bir yedeğe dönmek zorundaysanız geri
yükledikten sonra kalıcılık taraması yapın:

```sql calistir
CREATE TABLE kullanici (id TEXT, rol TEXT, olusturma TEXT);
CREATE TABLE api_anahtari (id TEXT, sahip TEXT, olusturma TEXT);
INSERT INTO kullanici VALUES ('u1', 'admin', '2025-03-02T10:00:00Z'), ('u7', 'uye', '2026-11-14T09:40:00Z'),
                             ('u9', 'admin', '2026-11-14T09:31:00Z');
INSERT INTO api_anahtari VALUES ('k1', 'u1', '2026-01-10T08:00:00Z'), ('k5', 'u9', '2026-11-14T09:35:00Z');
-- Olay başlangıcı (denetim izinden): 2026-11-14T09:12:00Z. Bu andan sonra doğan yetkili şeyler incelenir.
SELECT 'yönetici', id, olusturma FROM kullanici WHERE rol = 'admin' AND olusturma >= '2026-11-14T09:12:00Z'
UNION ALL
SELECT 'api anahtarı', id, olusturma FROM api_anahtari WHERE olusturma >= '2026-11-14T09:12:00Z'
ORDER BY 3;
```

```cikti
yönetici|u9|2026-11-14T09:31:00Z
api anahtarı|k5|2026-11-14T09:35:00Z
```

Geri yükleme **temiz bir ortama** yapılır (ele geçirilmiş sunucuya değil); dönüşten sonra bütün sırlar döndürülür,
çünkü saldırgan eski ortamdaki sırları okumuş olabilir ([Sır yönetimi](sir-yonetimi.md)).

## Kişisel veri

Hesabını silen kişinin verisi yedeklerde saklama süresi boyunca kalır; süre gizlilik metninde yazılır. Yedekten
dönüldüğünde, yedekten sonra silinmiş hesaplar yeniden silinir ([KVKK pratiği](kvkk-pratik.md)). Şifresiz bir yedeğin
sızması bir kişisel veri ihlalidir.

## Fidye yazılımına karşı kısa liste

- Yönetim panellerinde (barındırma, bulut, alan adı, Git, **yedek hesabı**) iki aşamalı doğrulama.
- Sunuculara anahtarla erişim; kullanılmayan erişimleri kapatma; düzenli güncelleme.
- Üretim ile yedek kimlikleri ayrı; üretimde silme yetkisi yok; yedek hesabının kurtarma e-postası ayrı.
- Olay anında: ağdan ayır; değiştirilemez kopyanın sağlamlığını doğrula; temiz ortama dön; sırları döndür. Fidye
  ödemek verinin geri geleceğini garanti etmez.

## Tuzaklar

| Belirti                                                          | Neden                                                      | Çözüm                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Saldırgan sunucuyla birlikte bütün yedekleri sildi                | Üretimdeki yedek kimliği silme yetkili; aynı hesap          | Yalnız yazma; ayrı hesap; nesne kilidi; çevrimdışı kopya       |
| Bir hafta sonra sağlam yedek kalmadı                             | Şifrelenmiş veri yedeklendi, saklama işi eskileri sildi     | Yedek öncesi denetim + saklama sigortası                       |
| Sızan yedekle bütün kullanıcı verisi açığa çıktı                  | Yedek düz metin ya da anahtar sunucudaydı                   | Açık anahtarla şifreleme; özel anahtar çevrimdışı              |
| Yedekler var ama anahtar kayıp                                   | Anahtar yalnız bir yerdeydi                                 | İki ayrı yerde (parola yöneticisi + basılı); tatbikatta çözme  |
| Geri dönüşten sonra saldırgan yine içeride                       | Olay sırasında alınmış yedeğe dönüldü; sırlar döndürülmedi  | Olay öncesi yedek ya da kalıcılık taraması; sırları döndürme   |
| Geri yükleme ele geçirilmiş sunucuya yapıldı                      | Temiz ortam kurulmadı                                       | Yeni ortam; eski sunucu kanıt olarak saklanır                  |
| Nesne kilidi var sanılıyordu, yetkili hesap silebildi             | Kilit kipi yanlış seçildi                                   | Kipi sağlayıcı belgesinde doğrulayın; silmeyi deneyerek sınayın |

## Denetim listesi

- [ ] 3-2-1: en az bir kopya başka hesapta/sağlayıcıda; en az bir kopya değiştirilemez ya da çevrimdışı.
- [ ] Üretimdeki yedek kimliği yalnız yazabiliyor (kural testi); silme ve saklama ayrı, iki aşamalı korunan kimlikte.
- [ ] Yedekler sunucuda açık anahtarla şifreleniyor; özel anahtar iki ayrı yerde ve sunucuda değil.
- [ ] Yedek öncesi sağlamlık denetimi var; başarısızlıkta uyarı veriyor ve saklama işi silmiyor.
- [ ] Hangi yedeğe dönüleceğinin kuralı ve kalıcılık taraması sorguları yazılı.
- [ ] Geri yükleme tatbikatı düzenli (mekaniği [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md)); şifre
      çözme ve temiz ortam da deneniyor.
- [ ] Yönetim ve yedek hesaplarında iki aşamalı doğrulama açık.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yedek betiği yedekten önce `integrity_check` ve satır sayısı denetimi yapsın, sonucu yedeğin
  yanına yazsın; yedeği açık anahtarla şifreleyip öyle göndersin. Gönderen kimliğe silme yetkisi verme. Saklama
  işi son üç yedek sağlam değilse hiçbir şey silmesin ve uyarı versin."
- **Modelin tipik hatası:** yedek kimliğine tam yetki vermek ("saklama işi de silebilsin"); özel anahtarı sunucuya
  koymak; saklama işini sağlamlık denetimi olmadan çalıştırmak; olaydan sonra en yeni yedeğe dönmeyi önermek.
- **Çıktıda denetleyin:** yedek kimliğinin yetki listesi (silme, üzerine yazma, kilit); anahtar dosyasının konumu;
  saklama işinde sigorta koşulu; geri yükleme planında "temiz ortam" ve "sırları döndür" adımları.
- **Test isteyin:** `fazla_yetkiler` kural testi; "şifrelenmiş canlı dosyada saklama işi durur" testi; kalıcılık
  taraması sorgusunun örnek verili testi.

## İlgili

- Mekanik: [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md) · çalışan betik
  [`uygulama/api/scripts/backup.ts`](../../uygulama/api/scripts/backup.ts) ve
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Yedekleme ve geri yükleme"
- [Olay müdahalesi](olay-mudahalesi.md) · [Sır yönetimi](sir-yonetimi.md) · [KVKK pratiği](kvkk-pratik.md)
