---
baslik: E-posta ve bildirim: işlemsel ve toplu gönderim, teslim, abonelik
ozet: İşlemsel ve toplu e-postayı ayırmak, gönderici doğrulama kavramları, kuyrukla gönderme, düz metin + HTML şablon, geri dönen ve şikâyet yönetimi, abonelikten çıkma ve anlık bildirim yorgunluğu.
etiketler: [e-posta, bildirim, kuyruk, teslim, push]
duzey: orta
guncellik: 2026-11
---

# E-posta ve bildirim: işlemsel ve toplu gönderim, teslim, abonelik

> Bu notu ne zaman okumalı: şifre sıfırlama, davet, fatura, bülten ya da anlık bildirim gönderen bir özellik
> yazılırken; "e-postalar spama düşüyor", "kullanıcıya iki kez gitti" ya da "bildirimleri kapattılar" denildiğinde.

## Temel fikir

E-posta göndermek bir API çağrısıdır ama **teslim** (gelen kutusuna düşmek) sizin elinizde değildir: alıcının
posta sağlayıcısı, gönderen alan adınızın doğrulanmasına, geçmişteki şikâyet ve geri dönme oranınıza ve içeriğe
bakarak karar verir. Bu yüzden üç şey ayrı tutulur:

1. **İşlemsel** (kullanıcının eylemiyle tetiklenen: şifre sıfırlama, davet, makbuz) ve **toplu** (bülten,
   kampanya) e-posta ayrı akıştan, mümkünse ayrı alt alan adından gider. Bültenin spam şikâyetleri şifre
   sıfırlama e-postasını gelen kutusundan atmasın.
2. Gönderim **istek içinde ve veritabanı işlemi içinde yapılmaz**; kuyruğa konur, yeniden denenir.
3. Bir daha gönderilmemesi gereken adresler (geri dönen, şikâyet eden, abonelikten çıkan) bir **bastırma
   listesinde** tutulur ve her gönderimden önce bakılır.

## Karar tablosu: işlemsel ↔ toplu

| Konu                   | İşlemsel                                          | Toplu                                                     |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Örnek                  | Şifre sıfırlama, davet, sipariş onayı, güvenlik uyarısı | Bülten, kampanya, ürün duyurusu                     |
| Gerekçe                | Kullanıcının istediği işlemin parçası             | Açık izin (ticari ileti kuralları; aşağıda)               |
| Hız beklentisi         | Saniyeler                                         | Saatlere yayılabilir                                      |
| Abonelikten çıkma      | Gerekmez (içine pazarlama koymayın)               | Zorunlu; tek tıkla                                        |
| Gönderen               | `bildirim@ornek.com`                              | `bulten@haber.ornek.com` (ayrı alt alan adı)              |
| Başarısızlıkta         | Yeniden dene; sonunda kullanıcıya "gelmediyse yeniden gönder" | Sessizce atla, raporla                        |

Hukuki not (danışmanlık değildir): Türkiye'de ticari elektronik ileti için önceden onay alma ve kayıt yükümlülükleri
vardır; bülten başlatmadan önce güncel mevzuatı ve İYS gerekliliklerini doğrulayın. İşlemsel e-postaya kampanya
eklemek onu ticari iletiye çevirebilir.

## Teslim edilebilirlik kavramları

| Kavram              | Ne yapar                                                                     | Ne zaman ayarlanır                       |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| SPF                 | DNS'te "bu alan adı adına şu sunucular gönderebilir" listesi                 | Sağlayıcı seçilince                      |
| DKIM                | İletiyi alan adınızın anahtarıyla imzalar; açık anahtar DNS'te               | Sağlayıcının verdiği kayıtlarla          |
| DMARC               | SPF/DKIM tutmazsa ne yapılacağı politikası + rapor adresi; `From` ile hizalama | SPF ve DKIM'den sonra, önce `p=none`   |
| Ters DNS, ısınma    | Kendi sunucunuzdan gönderiyorsanız IP'nin itibarı                            | Hazır sağlayıcı kullanmak bu işi üstlenir |

- Büyük posta sağlayıcıları toplu gönderenlerden SPF + DKIM + DMARC ve tek tıkla abonelikten çıkma ister (2024'ten
  beri duyurulan kurallar; güncel eşikleri sağlayıcıların belgesinden doğrulayın).
- `From` alan adı, DKIM imzasının alan adıyla aynı olmalı (hizalama); başka bir alan adı adına göndermeyin.
- Kendi SMTP sunucunuzu kurmak yerine işlemsel e-posta sağlayıcısı kullanın; havuzdaki API bunu bir HTTP
  bağdaştırıcısıyla yapar ([`mailer.ts`](../../uygulama/api/src/mail/mailer.ts); hiçbir gerçek sağlayıcıyla
  denenmediği belgesinde yazar). Ayarlar: [`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "E-posta sağlayıcısı".

## Kuyrukla gönderme ve yeniden deneme

- E-posta, onu doğuran değişiklikle aynı işlemde **giden kutusuna** yazılır, işlem kaydedildikten sonra işçi
  gönderir ([İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md), [Arka plan işleri](arka-plan-isleri.md)).
- Sağlayıcı hatası: 429 ve 5xx → geri çekilmeyle yeniden dene; 400/401/422 → yeniden deneme, hata kaydı + uyarı.
  401 çoğu zaman anahtarın döndürüldüğünü ya da yanlış ortam anahtarını gösterir.
- Sağlayıcı idempotentlik anahtarı kabul ediyorsa mesaj kimliğini verin; etmiyorsa nadir çift gönderimi kabul edin
  ya da "gönderildi" kaydını hemen yazın.
- Gönderim kaydı tutun: alıcı, şablon adı, sağlayıcının ileti kimliği, durum, zaman. **Gövdeyi kaydetmeyin**:
  sıfırlama bağlantısı gibi belirteçler taşır.
- Yanıt süresinden hesap varlığı anlaşılmasın: "şifremi unuttum" e-postası her durumda arka planda gider, yanıt
  hep aynıdır ([Kimlik doğrulama](kimlik-dogrulama.md)). Havuzdaki örnek: `jobs.run(...)` ile arka plan gönderimi
  ([`background.ts`](../../uygulama/api/src/lib/background.ts); bellek içidir, sunucu çökerse e-posta kaybolur —
  kalıcı kuyruk gerektiğinde burası değişir).
- Geliştirmede e-posta gönderilmez, tabloya ve terminale yazılır; testler oradan okur (havuzda `MAIL_PROVIDER=console`
  → `mail_outbox` tablosu, test: [`mailer.test.ts`](../../uygulama/api/test/mailer.test.ts)).

## Şablon, düz metin sürümü ve başlıklar

- Her e-postanın **düz metin** ve HTML sürümü birlikte gider (`multipart/alternative`): bazı istemciler ve ekran
  okuyucular düz metni kullanır, yalnız HTML spam puanını artırır.
- Kullanıcıdan gelen her değer (ad, alan adı, yorum) HTML'e **kaçışlanarak** konur; yoksa e-postaya bağlantı ya da
  sahte form yerleştirilir.
- Metinler tek dosyada, Türkçe, kısa; bağlantılar mutlak adres (`APP_URL` + yol). Havuzdaki şablonlar:
  [`templates.ts`](../../uygulama/api/src/mail/templates.ts).
- Türkçe konu ve ad başlıkta ham UTF-8 olarak değil, kodlanarak gider; e-posta kitaplığı bunu yapar, elle
  birleştirilmiş başlıkta bozulur.

```python calistir
import html
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import make_msgid

BASTIRILMIS = {"yok@ornek.com"}  # kalıcı geri dönen, şikâyet eden, çıkan adresler


def bulten(alici: str, ad: str, iptal_adresi: str) -> EmailMessage | None:
    if alici.lower() in BASTIRILMIS:  # her gönderimden önce
        return None
    e = EmailMessage()
    e["From"] = "Örnek Dükkân <bulten@haber.ornek.com>"  # toplu gönderim ayrı alt alan adından
    e["To"] = alici
    e["Subject"] = "Kasım fırsatları: çay ve şeker"
    e["Message-ID"] = make_msgid(domain="haber.ornek.com")
    e["List-Unsubscribe"] = f"<{iptal_adresi}>"
    e["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"  # posta istemcisi tek tıkla POST eder
    e.set_content(f"Merhaba {ad},\n\nBu ayın fırsatları sitede.\n\nAbonelikten çık: {iptal_adresi}\n")
    e.add_alternative(
        f"<p>Merhaba {html.escape(ad)},</p><p>Bu ayın fırsatları sitede.</p>"
        f'<p><a href="{html.escape(iptal_adresi)}">Abonelikten çık</a></p>',
        subtype="html",
    )
    return e


assert bulten("yok@ornek.com", "X", "https://ornek.com/iptal?b=1") is None
e = bulten("ayse@ornek.com", "<script>Ayşe</script>", "https://ornek.com/abonelik/iptal?b=k7Qp")
ham = e.as_bytes(policy=policy.SMTP)
assert b"Subject: =?utf-8?" in ham  # Türkçe konu başlıkta kodlanır
geri = message_from_bytes(ham, policy=policy.default)
assert geri["Subject"] == "Kasım fırsatları: çay ve şeker"
assert [p.get_content_type() for p in geri.iter_parts()] == ["text/plain", "text/html"]
assert "&lt;script&gt;" in geri.get_body(("html",)).get_content()  # kullanıcı değeri kaçışlandı
print("tamam")
```

```cikti
tamam
```

## Geri dönen ve şikâyet

| Olay                                        | Anlamı                               | Ne yapılır                                                     |
| ------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Kalıcı geri dönme (adres yok, alan adı yok) | Bir daha asla ulaşmayacak            | Hemen bastırma listesine; kullanıcıya "e-postanızı güncelleyin" |
| Geçici geri dönme (kutu dolu, geçici red)   | Sonra ulaşabilir                     | Sağlayıcı yeniden dener; art arda tekrarlanırsa bastırın       |
| Şikâyet ("spam" işaretlendi)                | Kullanıcı bu iletiyi istemiyor       | Toplu listeden hemen çıkarın                                   |
| Abonelikten çıkma                           | Açık istek                           | Hemen ve kalıcı; kategori tercihine yazın                      |

Bu olaylar sağlayıcıdan webhook olarak gelir: imzasını doğrulayın, olay kimliğiyle yinelemeyi ayıklayın
([Webhooklar](webhooklar.md)). Bastırma listesi e-posta adresini **normalleştirilmiş** (küçük harf, ASCII kural)
biçimde tutar.

## Abonelikten çıkma

- Her toplu e-postada görünür bir "abonelikten çık" bağlantısı ve `List-Unsubscribe` +
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` başlıkları (RFC 8058: posta istemcisi tek tıkla POST eder).
- Bağlantı **giriş istemez**; kimin çıktığını imzalı bir belirteç söyler (imzalı adres kalıbı:
  [Dosya ve medya](dosya-ve-medya.md)).
- Bağlantının GET'i yalnız onay sayfası gösterir, çıkışı POST yapar: posta güvenlik tarayıcıları bağlantıları
  önceden açar ([HTTP temelleri](http-temelleri.md)).
- Kategori bazında tercih ("ürün haberleri: kapalı, fatura: açık") tek düğmeyle "hepsini kapat"tan iyidir; ama
  hepsini kapatma seçeneği de olmalıdır.

## Anlık bildirim: izin ve yorgunluk

- İzni **bağlam içinde** isteyin: kullanıcı "kargom yola çıkınca haber ver" dediği anda. İlk açılışta sormak
  reddedilme oranını artırır; tarayıcılar sık reddedilen istemleri sessizleştirebilir. Reddedilen izin bir daha
  kolay sorulamaz.
- Önce uygulama içi bir açıklama ("Neden bildirim istiyoruz?") ve "Şimdi değil" seçeneği; sistem istemi ancak
  "Evet" denince.
- Kategori seçimi, sessiz saatler (kullanıcının saat diliminde), günlük üst sınır, benzer bildirimleri tek özette
  birleştirme. Her bildirim tıklanınca ilgili ekrana götürür.
- Web anlık bildirimi servis çalışanı ve sunucu anahtarları (VAPID) ister; iOS'ta yalnız ana ekrana eklenmiş web
  uygulamalarında çalıştığı bilinir (Kasım 2026, doğrulanmadı). Abonelik süresi dolan ya da geçersizleşen uç
  noktalar gönderimde hata döner: silin.
- Bildirim e-postanın yerine geçmez: güvenlik uyarısı (yeni cihazdan giriş, şifre değişti) e-postayla da gider.

## Tuzaklar

| Belirti                                                        | Neden                                                 | Çözüm                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Şifre sıfırlama e-postaları spama düşmeye başladı              | Bülten ile aynı alan adı/akış; şikâyetler itibarı düşürdü | İşlemsel ve toplu akışı ayırın                         |
| E-postalar gelen kutusuna hiç ulaşmıyor                        | SPF/DKIM/DMARC yok ya da `From` hizalı değil          | Sağlayıcının DNS kayıtlarını ekleyin, DMARC raporlarına bakın |
| Kullanıcıya aynı e-posta iki kez gitti                         | En az bir kez teslim, idempotentlik yok               | Mesaj kimliği; sağlayıcıya idempotentlik anahtarı          |
| Kayıt isteği e-posta sağlayıcısı yavaşken 10 sn sürüyor        | Gönderim istek içinde                                 | Kuyruk / arka plan işi                                     |
| Olmayan sipariş için onay e-postası gitti                      | Gönderim işlem içinde, sonra geri alma                | Giden kutusu                                               |
| E-postada sahte bağlantı göründü                               | Kullanıcının adı HTML'e kaçışsız kondu                | `escapeHtml`                                               |
| Abonelikten çıkan kullanıcıya bülten gitmeye devam etti        | Bastırma listesine gönderimden önce bakılmıyor        | Her gönderimde liste denetimi                              |
| "Abonelikten çık" bağlantısı kullanıcı tıklamadan çalıştı      | GET işlem yapıyor; güvenlik tarayıcısı açtı           | GET onay sayfası, POST işlem                               |
| Konu satırı `Ä±` gibi bozuk                                    | Başlık elle UTF-8 olarak birleştirildi                | E-posta kitaplığının başlık kodlaması                      |
| Günlükte sıfırlama bağlantıları görünüyor                      | E-posta gövdesi günlüğe yazıldı                       | Yalnız şablon adı ve ileti kimliği                         |
| Bildirim izni oranı çok düşük                                  | İlk açılışta sistem istemi                            | Bağlam içinde, önce açıklama                               |

## Denetim listesi

- [ ] İşlemsel ve toplu gönderim ayrı akış/alt alan adı; işlemsel e-postada pazarlama yok.
- [ ] SPF, DKIM, DMARC kayıtları ayarlı; `From` hizalı; DMARC raporları okunuyor.
- [ ] Gönderim kuyrukla, işlem dışında; geçici hatada geri çekilmeli yeniden deneme.
- [ ] Her e-postada düz metin + HTML; kullanıcı değerleri kaçışlı; bağlantılar mutlak.
- [ ] Bastırma listesi her gönderimden önce denetleniyor; geri dönme ve şikâyet webhookları işleniyor.
- [ ] Toplu e-postada `List-Unsubscribe` + tek tık başlığı ve görünür bağlantı; çıkış girişsiz, POST ile.
- [ ] Gönderim kaydında gövde ve belirteç yok.
- [ ] Geliştirme ve testte gerçek gönderim yok (tablo/terminal).
- [ ] Anlık bildirim izni bağlam içinde; kategori, sessiz saat ve üst sınır var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni e-postayı `templates.ts`'e düz metin + HTML olarak ekle, kullanıcı değerlerini
  `escapeHtml` ile koy. Gönderimi işlem bittikten sonra arka plan işiyle yap (`ctx.jobs.run`). Testte
  `mail_outbox` tablosundan konu ve bağlantıyı denetle." (Tarif: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md)
  → "Yeni e-posta ekle".)
- **Tipik hatalar:** `await mailer.send()` ile yanıtı bekletmek; işlem bloğunun içinde göndermek; yalnız HTML;
  adı kaçışsız koymak; e-posta gövdesini `console.log` ile yazmak; bülteni işlemsel adresten göndermek; bastırma
  listesini unutmak.
- **Çıktıda arayın:** `transaction(` bloğunun içinde `send(`; şablonda `${` ile HTML'e giren ve `escapeHtml`'den
  geçmeyen değerler; günlük çağrılarında `text`/`html`/`link`.

## İlgili

- [Arka plan işleri](arka-plan-isleri.md) · [Webhooklar](webhooklar.md) · [Kimlik doğrulama](kimlik-dogrulama.md)
  (sıfırlama akışı) · [Zaman ve saat dilimi](zaman-ve-saat-dilimi.md) (sessiz saatler)
- Çalışan kod: [`uygulama/api/src/mail/`](../../uygulama/api/src/mail/mailer.ts) ve kullandığı servis
  [`auth/service.ts`](../../uygulama/api/src/modules/auth/service.ts).
- SPF/DKIM/DMARC kayıtlarının DNS'e girilmesi: [Alan adı ve DNS](../60-devops/alan-adi-ve-dns.md).
