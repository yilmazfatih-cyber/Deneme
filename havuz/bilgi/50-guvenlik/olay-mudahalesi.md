---
baslik: Olay müdahalesi: sızıntı ya da ele geçirmede ilk saat
ozet: Sızıntı ya da hesap ele geçirme şüphesinde ilk saatin sıralı denetim listesi: kayıt aç, sınırla, kanıtı koru, sırları döndür, oturumları düşür, etkilenenleri bul, bildir; sonra kök neden ve senaryo tablosu.
etiketler: [guvenlik, olay-mudahalesi, sizinti, kvkk, kanit]
duzey: temel
guncellik: 2026-11
---

# Olay müdahalesi: sızıntı ya da ele geçirmede ilk saat

> Bu notu ne zaman okumalı: bir anahtarın sızdığı, bir hesabın ele geçirildiği, veritabanı ya da yedeğin
> başkasının eline geçtiği, üretimde açık bulunduğu ya da "tuhaf bir şeyler oluyor" denildiği **anda**; ve sakin
> bir günde, bu adımları bir kez denemek için.

> Hukuki danışmanlık değildir. Bildirim yükümlülükleri ve süreleri değişebilir; kişisel veri ihlalinde güncel
> kuralı kvkk.gov.tr'den doğrulayın ve gerekirse bir hukukçuya danışın.

## Temel fikir

Olay anında iki hata en pahalısıdır: **hiçbir şey yapmamak** ("emin olalım") ve **her şeyi silip yeniden kurmak**
(kanıt ve öğrenme yok olur). Doğru sıra: önce yazmaya başla, sonra kanamayı durdur, kanıtı koru, saldırganın
elindeki anahtarları geçersiz kıl, kimin etkilendiğini bul, bildir; ancak bunlardan sonra kök nedeni ara.

Küçük bir ekipte de rol ayrımı gerekir: **bir karar verici** (ne zaman kapatıyoruz, kime söylüyoruz), **bir
uygulayıcı** (komutları çalıştırır), **bir yazıcı** (zaman çizelgesi). Tek kişiyseniz üçünü sırayla yapın ama
yazmayı atlamayın.

## İlk saat: sıralı denetim listesi

| Dakika | Adım                     | Somut iş                                                                                                         |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 0–5    | **Kayıt aç**             | UTC saatle zaman çizelgesi başlat: ne görüldü, kim gördü. Saldırgan e-postayı okuyor olabilir: iletişim ayrı kanaldan |
| 5–15   | **Sınırla**              | Etkilenen hesabı kapat, sızan anahtarı iptal et, saldırgan IP'sini engelle, gerekirse özelliği kapat ya da bakım kipi |
| 5–15   | **Kanıtı koru**          | Silmeden ve yeniden başlatmadan önce: günlükleri kopyala, veritabanı/disk anlık görüntüsü, özet listesi (aşağıda) |
| 15–30  | **Sırları döndür**       | Etkilenen bileşenin okuyabildiği her sır: veritabanı parolası, API anahtarları, imza anahtarları, dağıtım belirteçleri |
| 15–30  | **Oturumları düşür**     | Etkilenen hesapların (gerekirse herkesin) oturumları; yenileme belirteçleri; açık anlık bağlantılar               |
| 30–50  | **Etkilenenleri belirle** | Zaman aralığı, IP'ler, hesaplar, okunan/dışa aktarılan veri (aşağıdaki sorgular)                                 |
| 50–60  | **Bildirim kararı**      | Kişisel veri etkilendi mi? Kime, ne zamana kadar? Kullanıcıya ne söylenecek? (aşağıda)                          |
| Sonra  | **Kök neden**            | Nasıl girdi? Aynı kalıp başka yerde var mı? Düzeltme + açığı yeniden üreten test                                |
| Sonra  | **Gözden geçirme**       | Suçlamasız toplantı; denetim listeleri, uyarılar ve testler güncellenir                                          |

Sınırlama ile kanıt korumanın çatıştığı yerde (ör. sunucuyu kapatmak bellek içindeki izleri siler) **etkin zarar
sürüyorsa önce sınırla**; sürmüyorsa önce anlık görüntü al.

Havuzdaki uygulama için hazır komutlar: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) §4
(hesabı kapatma ucu, bütün oturumları silme, denetim günlüğü sorgusu).

## Senaryo tablosu

| Senaryo                                   | İlk 15 dakika                                                                 | Sonra                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Anahtar depoya/istemciye sızdı            | Sağlayıcıda iptal + yeni anahtar                                              | Sağlayıcı günlüğünde kullanım; tarama ([Sır yönetimi](sir-yonetimi.md))        |
| Bir kullanıcı hesabı ele geçirildi        | Hesabı kapat (oturumları düşer)                                               | Denetim izi; kullanıcıyla başka kanaldan doğrulama; parola sıfırlama; ikinci etken |
| Yönetici hesabı ele geçirildi             | Bütün yönetici oturumlarını düşür, parolasını değiştir                        | **Kalıcılık ara:** yeni yönetici, yeni API anahtarı, webhook, rol değişikliği  |
| Veritabanı dosyası ya da yedeği sızdı     | Bütün oturumları sil; sızan dosyadaki sırları döndür                          | Parola değişimi iste; KVKK değerlendirmesi                                     |
| Üretimde XSS ya da yetki açığı bulundu    | Özelliği kapat ya da düzeltmeyi yayınla                                       | Saklanan yükleri temizle; açığın kullanıldığı kayıtları günlükten bul          |
| Bir bağımlılık kötü sürüm yayımladı       | Sürümü sabitle/geri al; CI ve dağıtımı durdur                                 | Kurulumun gördüğü bütün sırları döndür ([Tedarik zinciri](tedarik-zinciri.md)) |
| Sunucu fidye yazılımına yakalandı         | Ağdan ayır; yedeklerin erişilebilir ve sağlam olduğunu doğrula                | Temiz ortama yedekten dön ([Yedek ve fidye yazılımı](yedek-ve-fidye-yazilimi.md)) |
| Yapay zekâ ajanı beklenmedik işlem yaptı  | Aracı/ajanı kapat; ajanın anahtarlarını iptal et                              | İstem, getirilen belge ve araç çağrısı kayıtlarını incele ([YZ güvenliği](yapay-zeka-uygulama-guvenligi.md)) |

## Kanıtı korumak

Kanıt: erişim ve denetim günlükleri, veritabanı anlık görüntüsü, sunucu/disk görüntüsü, barındırıcı ve sağlayıcı
panellerindeki etkinlik kayıtları, ilgili e-postalar. Kurallar: **kopyala, değiştirme**; kopyanın özetini al;
kimin ne zaman aldığını yaz. Günlükler döndürülüp (rotation) silinmeden önce alınır.

```python calistir
import hashlib
import json
import pathlib
import tempfile

kanit = pathlib.Path(tempfile.mkdtemp())
(kanit / "erisim.log").write_text('{"ip":"203.0.113.66","route":"/api/account/export","status":200}\n')
(kanit / "uygulama.db").write_bytes(b"SQLite format 3\x00 ...")


def ozet_listesi(klasor: pathlib.Path) -> dict[str, dict]:
    return {
        p.name: {"sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bayt": p.stat().st_size}
        for p in sorted(klasor.iterdir())
        if p.is_file() and p.name != "OZETLER.json"
    }


alinan = ozet_listesi(kanit)
kayit = {"alindi_utc": "2026-11-16T09:41:00Z", "alan": "nöbetçi", "kaynak": "üretim sunucusu", "dosyalar": alinan}
(kanit / "OZETLER.json").write_text(json.dumps(kayit, ensure_ascii=False, indent=1))

# Sonra biri dosyalardan birini değiştirirse (bilerek ya da yanlışlıkla):
(kanit / "erisim.log").write_text("temizlendi\n")
degisen = [ad for ad, bilgi in ozet_listesi(kanit).items() if bilgi != alinan[ad]]
assert degisen == ["erisim.log"]  # TEST: bütünlük bozulması görünür
print("tamam")
```

```cikti
tamam
```

Özet listesini kanıttan **ayrı** bir yerde de saklayın (ör. olay kaydının içinde); yoksa ikisini birden değiştiren
fark edilmez.

## Etkilenenleri belirlemek

Denetim izi burada işe yarar ([Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)). Önce şüpheli kaynağın dokunduğu
hesaplar, sonra o hesaplarda yapılan hassas işlemler:

```sql calistir
CREATE TABLE audit_log (id INTEGER PRIMARY KEY, zaman TEXT, olay TEXT, kullanici TEXT, ip TEXT);
INSERT INTO audit_log (zaman, olay, kullanici, ip) VALUES
  ('2026-11-14T08:00:00Z', 'auth.login', 'u1', '198.51.100.4'),
  ('2026-11-14T09:12:00Z', 'auth.login_failed', 'u2', '203.0.113.66'),
  ('2026-11-14T09:13:00Z', 'auth.login', 'u2', '203.0.113.66'),
  ('2026-11-14T09:20:00Z', 'account.export', 'u2', '203.0.113.66'),
  ('2026-11-14T10:02:00Z', 'auth.login', 'u3', '203.0.113.66'),
  ('2026-11-14T10:05:00Z', 'auth.password_changed', 'u3', '203.0.113.66'),
  ('2026-11-15T07:00:00Z', 'auth.login', 'u1', '198.51.100.4');
-- 1) Şüpheli IP'nin dokunduğu hesaplar: ilk ve son görülme, olay sayısı
SELECT kullanici, MIN(zaman), MAX(zaman), COUNT(*) FROM audit_log
WHERE ip = '203.0.113.66' GROUP BY kullanici ORDER BY kullanici;
-- 2) Bu hesaplarda hassas işlemler (veri çıkışı, hesap değişikliği)
SELECT zaman, kullanici, olay FROM audit_log
WHERE kullanici IN (SELECT kullanici FROM audit_log WHERE ip = '203.0.113.66')
  AND olay IN ('account.export', 'auth.password_changed') ORDER BY zaman;
```

```cikti
u2|2026-11-14T09:12:00Z|2026-11-14T09:20:00Z|3
u3|2026-11-14T10:02:00Z|2026-11-14T10:05:00Z|2
2026-11-14T09:20:00Z|u2|account.export
2026-11-14T10:05:00Z|u3|auth.password_changed
```

Sonuç bir liste olmalıdır: hangi kişiler, hangi veri türleri (e-posta, ad, kayıtlar, parola özeti), hangi zaman
aralığı. Bu liste hem bildirimin hem de "yeterince sınırladık mı" sorusunun temelidir. Günlük yoksa bunu da yazın:
"belirlenemedi" de bir bulgudur ve daha geniş bildirim gerektirebilir.

## Bildirim

- **İçeride:** karar vericiye ve ekibe hemen; olay kaydına bağlantıyla.
- **Kişisel veri ihlalinde (genel bilgi):** KVKK'ya göre veri sorumlusu ihlali Kurul'a ve ilgili kişilere bildirir.
  Kurul'un 2019 tarihli ihlal bildirimi kararında Kurul'a "en kısa sürede ve en geç 72 saat içinde" bildirim
  öngörülür; bu süre ve usul **doğrulanmadı**, güncelini kvkk.gov.tr'den denetleyin. Veri işleyen (ör. size hizmet
  veren barındırıcı) durumundaysanız veri sorumlusuna gecikmeden haber verin. Ayrıntı: [KVKK pratiği](kvkk-pratik.md).
- **Kullanıcıya:** sade, suçlamasız, somut. Şablon:

```text
Konu: Hesabınızla ilgili güvenlik bildirimi

14 Kasım 2026'da 09.12–10.05 arasında, bir saldırgan hesabınıza giriş yaptı.
Bu sürede hesabınızdaki görev listeleri dışa aktarıldı.
Parolanız, banka ya da kart bilginiz sistemimizde tutulmadığı için etkilenmedi.
Hesabınızdaki bütün oturumları kapattık ve parolanızı sıfırladık.
Sizden istediğimiz: yeni parola belirleyin; aynı parolayı başka sitede kullanıyorsanız orada da değiştirin.
Sorularınız için: guvenlik@ornek.com
```

Şablonda olanlar: ne oldu, ne zaman, hangi veri, ne yaptık, kişiden ne istiyoruz, kime sorulur. Olmayanlar:
belirsiz ifadeler ("bir sorun yaşandı"), suçlama, doğrulanmamış tahmin.

## Kök neden ve gözden geçirme

- Kök neden **sınırlamadan sonra** aranır; ama kanıt korunmuş olmalıdır.
- "Nasıl girdi?" sorusunun cevabı bir açık sınıfıdır ([OWASP özeti](owasp-ozet.md)); aynı kalıbı bütün kodda arayın.
- Açığı yeniden üreten bir **test** yazın; düzeltme o testi geçirir; test kalıcı olarak kalır.
- Gözden geçirme suçlamasızdır: "kim hata yaptı" değil "hangi koruma eksikti". Çıktısı somut işlerdir:
  yeni uyarı kuralı, yeni denetim listesi maddesi, eksik testin eklenmesi, tehdit modelinin güncellenmesi
  ([Tehdit modelleme](tehdit-modelleme.md)).

## Tuzaklar

| Belirti                                                         | Neden                                                    | Çözüm                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Sunucu silinip yeniden kuruldu, nasıl girildiği hiç anlaşılmadı | Kanıt alınmadan temizlendi                              | Önce anlık görüntü ve günlük kopyası                            |
| Anahtar silindi ama saldırgan erişmeye devam ediyor             | Döndürme yerine silme; kalıcılık (yeni anahtar, yeni yönetici) | İptal + yeni anahtar; kalıcılık izlerini arayın             |
| Parola değişti, saldırgan hâlâ içeride                          | Oturumlar ve yenileme belirteçleri düşürülmedi           | Oturumları sunucuda silin                                       |
| Olay ekibi e-postayla haberleşti, saldırgan her şeyi okudu      | Ele geçirilen kanal kullanıldı                           | Ayrı iletişim kanalı                                            |
| Bildirim günler sonra yapıldı                                   | "Kesin bilgi" beklendi                                   | Bilinenle bildirin; yeni bilgiyle güncelleyin                   |
| Kimin etkilendiği belirlenemedi                                 | Denetim izi yok ya da çok kısa saklanıyor                | Olay kataloğu ve saklama süresi ([Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)) |
| Aynı açık bir ay sonra başka uçta kullanıldı                    | Yalnız tek yer düzeltildi                                | Kalıp araması + kural testi                                     |
| Zaman çizelgesi tutarsız                                        | Saatler farklı dilimde                                   | Her yerde UTC                                                   |

## Denetim listesi

- [ ] Olay kaydı (UTC zaman çizelgesi) ilk dakikalarda açıldı; rol dağılımı belli.
- [ ] Etkin zarar durduruldu (hesap kapatma, anahtar iptali, özellik kapatma).
- [ ] Kanıt değiştirilmeden kopyalandı ve özet listesi ayrı yerde.
- [ ] Etkilenen bileşenin görebildiği bütün sırlar döndürüldü; kalıcılık izleri (yeni yönetici, anahtar, webhook) arandı.
- [ ] İlgili oturumlar ve yenileme belirteçleri sunucuda düşürüldü.
- [ ] Etkilenen kişi, veri türü ve zaman aralığı listesi çıkarıldı (ya da "belirlenemedi" yazıldı).
- [ ] Bildirim kararı verildi ve kaydedildi; kullanıcı bildirimi şablona uygun.
- [ ] Kök neden bulundu; açığı yeniden üreten test eklendi; aynı kalıp başka yerde arandı.
- [ ] Gözden geçirmenin somut işleri birikim listesinde.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bir olay müdahalesi yapıyoruz. Komutları çalıştırmadan önce bana göster. Hiçbir dosyayı,
  günlüğü ya da veritabanı satırını silme veya değiştirme; önce kopyasını al ve SHA-256 özetini yaz. Her adımı
  UTC saatle olay kaydına ekle."
- **Modelin tipik hatası:** "temizlemek" için günlükleri ya da şüpheli dosyaları silmek; sırrı döndürmeden geçmişi
  yeniden yazmayı önermek; kök nedeni sınırlamadan önce aramaya dalmak; bildirimi "kesinleşince" diye ertelemek;
  hukuki süreler hakkında kesin hüküm vermek.
- **Çıktıda denetleyin:** önerilen komutlarda `rm`, `DELETE`, `TRUNCATE`, `git push --force` var mı; kanıt
  kopyası ve özet adımı önce mi geliyor; bildirim önerisi doğrulanmamış hukuki iddia içeriyor mu.
- **Test isteyin:** kök neden düzeltmesiyle birlikte "saldırgan denedi, olmadı" testi.

## İlgili

- Hazır komutlar: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) §4 · Yedekten dönme:
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Yedekleme ve geri yükleme"
- KVKK genel çerçeve: [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md) · [KVKK pratiği](kvkk-pratik.md)
- Öncesi: [Günlük ve izleme](gunluk-ve-izleme-guvenlik.md) · [Sır yönetimi](sir-yonetimi.md) ·
  [Yedek ve fidye yazılımı](yedek-ve-fidye-yazilimi.md)
