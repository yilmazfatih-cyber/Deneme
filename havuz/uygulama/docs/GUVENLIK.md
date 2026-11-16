# Güvenlik

Bu belge API'nin (`api/`) neye karşı korunduğunu, nasıl korunduğunu, yayına çıkmadan önce neyin denetleneceğini
ve bilinen sınırları anlatır. Her korumanın en az bir "saldırgan denedi, olmadı" testi vardır
(`api/test/security.test.ts`, `api/test/modules/*.test.ts`, `api/test/rules.test.ts`).

## 1. Tehdit modeli

Korunan varlıklar: kullanıcıların kayıtları (görevler, listeler ve sonradan eklenecek her varlık), hesap bilgileri
(e-posta, ad), oturumlar ve paylaşımlı alanların gizliliği.

| Saldırgan                         | Ne isteyebilir                                        | Başlıca önlem                                         |
| --------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| İnternetteki herhangi biri        | Parola deneme, hesap var mı öğrenme, sunucuyu yorma   | Hız sınırı, tek tip hata, scrypt, gövde sınırı        |
| Kötü niyetli bir web sitesi       | Kullanıcının tarayıcısına bizim adımıza istek attırma | SameSite çerez + köken denetimi + zorunlu JSON (CSRF) |
| Uygulamanın başka bir kullanıcısı | Başkasının alanını okuma/yazma, yetkisini büyütme     | Her uçta oturum + rol kuralları (permissions.ts)      |
| Paylaşımlı alandaki izleyici      | Yazma, üye ekleme, alanı silme                        | Rol tablosu; eşitlemede yazma yetkisi denetimi        |
| Veritabanı dosyasını ele geçiren  | Oturum çalma, parola öğrenme                          | Belirteçlerin yalnız SHA-256 özeti; parola scrypt'le  |
| Günlüklere erişen (barındırıcı)   | Parola, belirteç, e-posta görme                       | Günlüğe bunlar yazılmaz (testle korunur)              |

Kapsam dışı (bkz. §5): sunucunun kendisinin ele geçirilmesi, barındırma hesabının çalınması, kullanıcının
cihazındaki kötü amaçlı yazılım, dağıtık (çok IP'li) büyük ölçekli saldırılar.

## 2. Uygulanan önlemler

### Parola özeti

- Node'un yerleşik **scrypt**'i; parametreler özet dizgisinde: `scrypt$N$r$p$tuz$özet` (16 bayt tuz, 32 bayt özet).
- Parametre: **N=2^14, r=8, p=5** → özet başına ~16 MiB bellek, bu makinede ~150 ms. OWASP'ın (Password Storage
  Cheat Sheet) scrypt için verdiği eşdeğer seçenekler listesinden (2^17/8/1, 2^16/8/2, 2^15/8/3, 2^14/8/5,
  2^13/8/10) **en az bellek isteyenlerden biri** seçildi: 512 MB bellekli ücretsiz bir sunucuda da aynı anda
  birkaç girişi kaldırsın diye. Ayrıca aynı anda en çok 2 özet hesaplanır (bellek tavanı ~32 MiB). Kaynak notu:
  liste ezberden yazıldı; OWASP sayfası bu ortamdan açılamadığı için **doğrulanmadı**.
- Parametre yükseltilirse (`api/src/config.ts → DEFAULT_PASSWORD_HASH`) eski özetler çalışmaya devam eder;
  kullanıcı bir sonraki başarılı girişinde yeni parametrelerle yeniden özetlenir (testli).
- Karşılaştırma sabit zamanlı (`timingSafeEqual`). Parola özetlenmeden önce Unicode **NFC**'ye çevrilir: "ş"
  farklı cihazlarda farklı bayt dizileriyle gelebilir, giriş bozulmasın.
- E-posta kayıtlı değilse de bir sahte özet doğrulanır: yanıt süresinden hesabın varlığı anlaşılmasın.

### Şifre kuralları (NIST 800-63B çizgisi)

- 10–128 karakter (`shared → newPasswordSchema`); karakter türü zorunluluğu YOK.
- Reddedilenler (`api/src/lib/passwordPolicy.ts`): ~450 çok yaygın parola (`common-passwords.txt`; kaynak ve
  MIT lisansı dosyanın başında ve yanındaki `.LICENSE.txt`'te), "yaygın sözcük + rakam/işaret"
  (`Galatasaray1905!`, `Şifre2026`), tek/iki karakter yinelemesi ve düz diziler, hiç harf içermeyenler (telefon,
  doğum tarihi), kullanıcının adını ya da e-posta adını (4+ harf) içerenler. Karşılaştırma Türkçe harf ve
  büyük/küçük harf duyarsızdır.

### Oturum

- Belirteç: 32 bayt kriptografik rastgele (base64url, 43 karakter). Veritabanında yalnız **SHA-256 özeti**.
- Çerez: `HttpOnly; SameSite=Lax; Path=/`; üretimde ayrıca `Secure` ve **`__Host-` öneki** (`__Host-sid`):
  alt alan adından çerez yerleştirme ve `Domain` genişletme engellenir. Üretimde öneksiz `sid` kabul edilmez.
- Kayan süre: 30 gün (`SESSION_TTL_DAYS`); kalan süre yarıya inince istekle uzar. Kullanılmayan oturum düşer.
- Başka alan adındaki istemci için `X-Auth-Mode: token` → belirteç gövdede döner; `Authorization: Bearer`.
- **İptal:** şifre değişince öteki oturumlar, şifre sıfırlanınca bütün oturumlar, hesap kapatılınca/silinince
  bütün oturumlar silinir; bu oturumların açık anlık akışları (SSE) da sunucuca kesilir. Şifre (oturumla)
  değişince e-postadaki bekleyen sıfırlama bağlantıları da geçersiz olur: kutuya bir an erişip bağlantıyı alan
  biri, kullanıcı şifresini değiştirdikten sonra hesabı geri alamaz.

### Hesap varlığı sızıntısı (bilinçli seçimler)

| Uç               | Davranış                                                                                         | Neden                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Giriş            | Yanlış şifre ve olmayan e-posta: aynı ileti, aynı kod, eşit süre                                 | Parola denemesiyle hesap listesi çıkarılamasın                                                                                                                                                                                                                                                                |
| Şifremi unuttum  | Her durumda `{ ok: true }`; e-posta arka planda                                                  | Yanıt ve süre hesabın varlığını söylemesin                                                                                                                                                                                                                                                                    |
| Kayıt            | Alınmış e-postada `409 email_taken`                                                              | **Bilinçli ödün:** kullanıcıya "bu e-postayla hesabınız var, giriş yapın" demek kayıt akışının kullanılabilirliği için gerekli. Sızıntıyı sınırlamak için kayıt IP başına saatte 10 ile sınırlı. Gerekirse kayıt "e-postanıza bağlantı gönderdik" akışına çevrilir (e-posta doğrulama ile birlikte; bkz. §5). |
| Davet önizleme   | Bilinmeyen/kullanılmış/süresi dolmuş/daveti verenin sahipliği bitmiş: hepsi aynı `invalid_token` | Belirteç tahmini işe yaramaz (256 bit)                                                                                                                                                                                                                                                                        |
| Başkasının alanı | Her uçta `404` (403 değil)                                                                       | Alanın varlığı bile sızmasın                                                                                                                                                                                                                                                                                  |

### CSRF (siteler arası istek sahteciliği)

Üç katman birlikte: (1) çerez `SameSite=Lax`; (2) değiştirici isteklerde `Sec-Fetch-Site` / `Origin` denetimi —
yalnız aynı köken, `APP_URL` kökeni ve `ALLOWED_ORIGINS` (giriş isteği de: "login CSRF"); (3) gövdeli her uç
`Content-Type: application/json` ister (HTML formları JSON gönderemez). İki başlığı da göndermeyen istemci
tarayıcı değildir (curl, sunucu) ve geçer; tarayıcılar siteler arası isteklerde bu başlıkları hep gönderir.
`Authorization: Bearer` istekleri muaftır (belirteci tarayıcı kendiliğinden eklemez).

### CORS

Varsayılan **kapalı**. `ALLOWED_ORIGINS` (virgüllü köken listesi; `*` kabul edilmez) dolarsa yalnız o kökenlere
`Access-Control-Allow-Origin` + `Allow-Credentials` verilir.

### Yetki

Rol tablosu ve kurallar tek dosyada: `api/src/modules/workspaces/permissions.ts`. Özet: yazma `owner`/`editor`;
yeniden adlandırma, silme, davet, rol değiştirme, üye çıkarma yalnız `owner`; son sahip düşürülemez/ayrılamaz;
kişisel alan silinemez, paylaşılamaz, ondan ayrılınamaz; davetle `owner` verilmez. Davet yalnız onu oluşturan
kişi alanın **sahibi olduğu sürece** geçerlidir: alandan çıkarılan, rolü düşürülen ya da hesabını silen eski
sahibin önceden ürettiği bağlantı geçmez (yoksa çıkarılan kişi geri dönebilir, izleyici yapılan kişi ayrılıp
"düzenleyen" davetiyle yetkisini büyütebilirdi; davet listesi/iptali olmadığı için başka çaresi yoktu). Yönetim uçları yalnız `admin`;
yönetici kendi rolünü değiştiremez ve kendini kapatamaz. Kural testi, oturum istemeyen uçların yalnız bilinçli
listedekiler (`PUBLIC_ROUTES`) olduğunu ve öteki her ucun oturumsuz isteğe 401 verdiğini denetler.

### Hız sınırı

Bellek içi jeton kovası; sınırlar `api/src/http/rateLimit.ts → RATE_RULES` ve `docs/API.md` tablosunda. Yanıt
`429 rate_limited` + `Retry-After`. Giriş için iki anahtar var: IP (çok hesabı deneyen tek kaynak) ve IP+e-posta
(tek hesaba parola deneme). IP anahtarı `rateLimitKey` ile kurulur: IPv4 adresi olduğu gibi, **IPv6'da bütün
/64 bloğu tek kaynak** sayılır (bir abone ya da kiralık sunucu genelde bütün bir /64 alır; adrese göre saymak
2^64 adres arasında gezinerek sınırı atlatmaya izin verirdi). Kural testi, IP'ye göre sayan her kuralın bu
işlevden geçtiğini denetler. **Yalnız e-postaya göre kilit bilinçli olarak YOK:** başkası sizin e-postanızla
yanlış denemeler yaparak sizi kilitleyemesin. Şifremi unuttum ayrıca e-posta başına saatte 3 ile sınırlı
(birinin kutusunu doldurmayı önler).

**Gerçek IP ve `TRUST_PROXY`.** Önünüzde ters vekil (Render, Fly, nginx, Caddy) varsa `TRUST_PROXY=1` (vekil
sayısı) yazın: IP, `X-Forwarded-For`'un sağından o kadar içeriden okunur (soldaki değerleri istemci uydurabilir).
Yanlış ayarın riski:

- Vekil **yokken** `TRUST_PROXY>0`: saldırgan başlığı uydurup her denemede başka IP görünür, hız sınırı çöker.
- Vekil **varken** `TRUST_PROXY=0`: herkes vekilin IP'si sayılır; tek bir kötü kullanıcı herkesi kilitler.
  Sunucu üretimde bu durumda açılışta uyarı yazar.
- İki katmanlı vekilde (ör. Cloudflare + Render) `1` yazmak gerçek istemci yerine Cloudflare'in IP'sini verir;
  doğru sayı ortamınıza bağlıdır ve **bu ortamda hiçbir barındırıcıyla doğrulanmadı**.

### Anlık akış (SSE) kaynakları

Her olay, istemci okuyana dek sunucu belleğinde bekler. Okumayan (ya da TCP penceresini kapalı tutan) bir
istemcinin kuyruğu sınırsız büyüseydi, çok alanlı bir hesapla dakikada yüz binlerce dürtme üretip sunucuyu
bellekten düşürmek mümkündü (ölçüm: okumayan tek akışa 200 000 dürtme → yığın 16 MB'tan 328 MB'a çıktı).
Bu yüzden bağlantı başına en çok 256 okunmamış olay bekler (`SSE_MAX_PENDING_WRITES`); aşılınca akış kesilir,
tarayıcı yeniden bağlanır (`api/test/modules/events.test.ts`).

### Girdi ve çıktı

- Dışarıdan gelen her şey şemayla doğrulanır: gövdeler (`shared` şemaları), yol parametreleri (kimlik biçimi),
  sorgu dizgileri, ortam değişkenleri (Zod). SQL'in tamamı parametreli; `db.exec` yalnız migrasyonlarda.
- Gövde sınırı: 64 KiB, eşitlemede ~8 MiB → `413`. Kayıt başına 64 KiB, istek başına 100 değişiklik (`shared`).
- E-posta HTML'ine konan her kullanıcı değeri kaçışlanır.

### Güvenlik başlıkları

API yanıtları: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'…`, `Cache-Control: no-store`.
Web uygulaması (WEB_DIST): `script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'…`
(satır içi betik/stil yok). Hepsinde: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY`, `Permissions-Policy` (kamera, mikrofon, konum, ödeme… kapalı),
`Cross-Origin-Opener-Policy: same-origin`; üretimde `Strict-Transport-Security: max-age=31536000`
(`includeSubDomains` ve `preload` bilinçli olarak YOK: aynı alan adının alt alanlarını bozmasın).

### Günlük ve denetim

- Erişim günlüğü: tek satır JSON; istek kimliği, yöntem, adres **kalıbı** (`/api/invites/:token` — gerçek adreste
  belirteç olabilir), durum, süre, IP, kullanıcı kimliği. Sorgu dizgisi, gövde, çerez, belirteç, e-posta
  YAZILMAZ (test: `security.test.ts → günlükte parola, belirteç, çerez ya da e-posta geçmez`).
- Denetim günlüğü (`audit_log` tablosu): kayıt, giriş, başarısız giriş (nedeniyle), tüm cihazlardan çıkış, şifre
  değişimi/sıfırlama, hesap güncelleme/silme, alan oluşturma/adlandırma/silme, sahiplik devri, üye
  ekleme/rol/çıkarma, davet, yönetici işlemi. IP ve kullanıcı kimliğiyle; e-posta ve parola olmadan. 180 gün sonra
  bakım işi siler.

### Veri yaşam döngüsü

Bakım işi (saatte bir): süresi dolmuş oturumlar, 1 günü geçmiş sıfırlama belirteçleri, süresi 30 günü geçmiş
davetler, 180 günlük denetim kayıtları, 7 günlük geliştirme e-posta kutusu silinir. Hesap silme kişisel verileri
siler (bkz. docs/API.md → `DELETE /api/account`); denetim kayıtlarında silinen kullanıcının kimliği 180 gün kalır.

## 3. Yayına çıkmadan önce denetim listesi

- [ ] `NODE_ENV=production` ve `APP_URL=https://…` (sunucu aksi hâlde başlamaz); alan adı HTTPS ile açılıyor.
- [ ] `TRUST_PROXY` barındırıcınıza göre doğru (vekil varsa `1`). Denetim: iki farklı ağdan (ör. ev Wi-Fi ve
      telefon hattı) giriş yapın; günlükteki `"ip"` alanları farklı ve gerçek olmalı.
- [ ] `DATABASE_PATH` **kalıcı diske** işaret ediyor (geçici diskte her yeniden başlatmada veriler SİLİNİR).
- [ ] Yedek alınıyor ve bir kez **geri yükleme denendi** (docs/YAYINLAMA.md → "Yedekleme").
- [ ] `MAIL_PROVIDER=http` ayarlı ve "Şifremi unuttum" e-postası gerçekten geliyor (spam klasörüne de bakın);
      gönderen alan adında SPF/DKIM ayarlı.
- [ ] `ADMIN_EMAILS` yalnız sizin e-postanız; yönetici hesabınızı sunucuyu açar açmaz **kendiniz kaydettiniz**
      (açılış günlüğünde "ADMIN_EMAILS: … henüz hesabı yok" uyarısı YOK); şifresi güçlü ve başka yerde
      kullanılmıyor.
- [ ] `ALLOWED_ORIGINS` boş (ya da yalnız gerçekten gereken kökenler); `*` yok.
- [ ] `RATE_LIMIT` satırı yok ya da `on`.
- [ ] `.env` dosyası depoda değil (`git status` temiz); sırlar yalnız barındırıcının ayar panelinde.
- [ ] Sağlık ucu dışarıdan açılıyor: `curl https://alanadi/api/health`.
- [ ] Tarayıcı geliştirici araçlarında yanıt başlıkları: `__Host-sid` çerezi `Secure`, `Strict-Transport-Security`
      ve `Content-Security-Policy` var; konsolda CSP hatası yok.
- [ ] `npm audit --omit=dev` kritik açık göstermiyor.
- [ ] Gizlilik metni: hangi verinin saklandığı (e-posta, ad, kayıtlar, IP'li denetim kaydı 180 gün) yazıyor.

## 4. Bir şey ters giderse

- **Bir hesabın ele geçtiğinden şüphe:** yönetim ucundan hesabı kapatın
  (`PATCH /api/admin/users/:id` gövde `{"disabled":true}`; bütün oturumları düşer), denetim günlüğüne bakın
  (`SELECT * FROM audit_log WHERE target_id = '<kimlik>' ORDER BY id DESC`), kullanıcıya şifre sıfırlatın,
  sonra açın.
- **Herkesin oturumunu düşürmek:** sunucuyu durdurup `DELETE FROM sessions;` çalıştırın.
- **Veritabanı dosyası sızdı:** parolalar scrypt'li, belirteçler özetli; yine de bütün oturumları silin ve
  kullanıcılardan şifre değiştirmelerini isteyin.

## 5. Bilinen sınırlar

- **Tek süreç:** hız sınırı ve anlık bildirim bellek içidir; birden çok sunucu kopyasında her kopya ayrı sayar
  ve dürtmeler yalnız aynı kopyaya bağlı istemcilere gider (SQLite zaten tek kopya demektir).
- **E-posta doğrulama yok:** `emailVerified` hep `false`; kayıt olan kişinin e-postanın sahibi olduğu
  kanıtlanmaz. Şifre sıfırlama e-postası yalnız gerçek sahibine gittiği için hesap ele geçirmeye yol açmaz, ama
  başkasının e-postasıyla hesap açılabilir. **Sonucu:** `ADMIN_EMAILS`'te olup henüz hesabı olmayan bir adresle
  İLK kaydolan kişi yönetici olur (sahibi kaydolmadan önce ya da hesabını sildikten sonra). Sunucu açılışta
  böyle adres varsa uyarır (adresi değil sayıyı yazar). Gerçek çözüm e-posta doğrulamasıdır.
- **Kullanıcı başına depolama kotası ve yanıt bayt bütçesi yok:** oturumu olan herkes eşitlemeyle dakikada
  240 × 100 kayıt yazabilir (kayıt başına protokol sınırı 64 KiB; yerleşik görev varlığında ~10 KB) ve alan
  sayısı sınırsızdır. Tek eşitleme yanıtı alan başına 500 kayıt taşıdığı için alan sayısıyla büyür; dışa aktarma
  hiç sayfalanmaz. Ölçüm (bu ortamda): 4 alan × 500 dolu görev, 20 yazma isteği (4,5 sn) → tek eşitleme yanıtı
  ~11 milyon karakter (~21 MB); 100 alanda yüzlerce MB olur ve 512 MB'lık bir sunucu bellekten düşebilir, disk de
  dolabilir. Açık kayıtlı bir yayında kota (alan sayısı, alan başına kayıt/bayt) ve yanıt bayt bütçesi ekleyin
  (eşitleme davranışı `shared` başvuru sunucusuyla birlikte değişmeli; bkz. docs/ESITLEME.md).
- **Davet önizleme belirteci adreste:** `GET /api/invites/:token` belirteci URL yolunda taşır; uygulamanın kendi
  günlüğü yalnız kalıbı yazar ama önünüzdeki vekilin (nginx, Render) erişim günlüğü tam adresi yazabilir.
  Günlüğe erişen biri kullanılmamış daveti kabul edebilir. Vekil günlüğünü kısıtlayın ya da önizlemeyi POST'a
  taşıyın.
- **`MAIL_PROVIDER=console` üretimde:** e-postalar gönderilmez ama sıfırlama bağlantısı (belirteç dahil)
  `mail_outbox` tablosuna düz yazılır (7 gün). Veritabanı kopyasını alan biri 1 saatlik pencerede şifre
  sıfırlayabilir. Üretimde `MAIL_PROVIDER=http` kullanın (sunucu zaten uyarır).
- **Yavaş okuyan bağlantılar:** Node'un varsayılanında yanıtını okumayan bir bağlantı için yazma zaman aşımı
  yoktur; çok sayıda böyle bağlantı dosya tanıtıcılarını tüketebilir. Önünüzde zaman aşımı olan bir ters vekil
  (Caddy, nginx, Render) bulundurun.
- **İki aşamalı doğrulama (2FA), "aktif cihazlarım" ekranı, hesap kilitleme bildirimi yok.**
- **Dağıtık parola denemesi:** çok sayıda IP'den tek hesaba yavaş deneme yalnız güçlü şifre kuralıyla
  karşılanır (e-postaya göre kilit bilinçli olarak yok, bkz. §2).
- **Kayıt ucu hesap varlığını söyler** (bilinçli ödün, §2).
- **Denetim günlüğünün okunacağı bir ekran yok**; şimdilik veritabanından okunur.
- **Yedekler şifrelenmez**; yedek dosyasını güvenli yerde saklayın.
- **HTTP e-posta bağdaştırıcısı hiçbir gerçek sağlayıcıyla denenmedi** (yalnız sahte `fetch` ile).
- Bu belgede adı geçen barındırıcı davranışları (Render vekil zinciri, disk) **bu ortamda doğrulanmadı**.
