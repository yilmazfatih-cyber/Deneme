# API hazır: web ekibi için başlatma notu

Durum (16.11.2026, son güncelleme): API tamam ve yeşil (`typecheck`, `eslint`, `prettier`, 182 test). Uçların
tamamı bağlı; uygunluk testleri (17 senaryo) gerçek API'ye HTTP üzerinden karşı geçiyor. Uçların dökümü:
`docs/API.md`; güvenlik: `docs/GUVENLIK.md`; yayın: `docs/YAYINLAMA.md`.

## 1. Sunucuyu başlatma

Geliştirme (dosya değişince yeniden başlar):

```bash
npm run dev -w @uygulama/api          # http://127.0.0.1:8310, veritabanı api/.data/uygulama.db
```

Vite proxy hedefi **`http://127.0.0.1:8310`** olsun (`localhost` bazı makinelerde IPv6 `::1`'e çözülür; API
yalnız 127.0.0.1'i dinler). Proxy üzerinden tarayıcı isteği "aynı köken" görür (`Sec-Fetch-Site: same-origin`),
köken denetimi (CSRF) sorun çıkarmaz; `changeOrigin` ayarı fark etmez. `APP_URL` tarayıcıdaki web adresi olmalı
(varsayılan `http://localhost:5310`): e-postadaki bağlantılar onunla kurulur.

Uçtan uca test (Playwright `webServer`):

```ts
{
  command: 'npm run start -w @uygulama/api',
  url: 'http://127.0.0.1:8312/api/health',
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    NODE_ENV: 'test',              // çerez Secure değil, e-postalar yalnız mail_outbox tablosuna
    PORT: '8312',
    HOST: '127.0.0.1',
    DATABASE_PATH: '.data/e2e.db', // api/ klasörüne göre; her koşudan önce silin
    APP_URL: 'http://localhost:5311', // e-posta bağlantıları ve köken denetimi için web'in adresi
    RATE_LIMIT: 'off',             // aynı IP'den çok kayıt/giriş yapılacak (üretimde kapatılamaz)
    // Tek servis denemesi (web'i API sunsun): WEB_DIST: '../web/dist'
  },
}
```

Sağlık: `GET /api/health` → `200 {"ok":true,"version":"0.1.0","time":"…"}`.

## 2. Deneme kullanıcısı

```bash
DATABASE_PATH=.data/e2e.db npm run seed -w @uygulama/api -- --email e2e@ornek.com --password 'uzun-deneme-parolasi-42'
```

Kullanıcı + kişisel alan + örnek veri (1 liste "Ev", 3 görev) açar. Kullanıcı zaten varsa yalnız şifresini
günceller. Şifre verilmezse rastgele üretip ekrana yazar. Testte kayıt ekranından yeni kullanıcı açmak da olur
(her testte `uniq@ornek.com`). Şifre kuralı: 10–128 karakter, en az bir harf, yaygın/tahmin edilir olmayacak,
ad ya da e-posta adını içermeyecek (ör. `mavi-deniz-kenari-42` geçer, `galatasaray1905` geçmez).

## 3. E-postalar (şifre sıfırlama) testte nasıl okunur

`MAIL_PROVIDER` varsayılanı `console`: e-posta gönderilmez, `mail_outbox` tablosuna yazılır (geliştirmede
ayrıca terminale basılır). Playwright'tan:

```ts
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('api/.data/e2e.db')
const mail = db
  .prepare('SELECT text_body FROM mail_outbox WHERE to_address = ? ORDER BY id DESC LIMIT 1')
  .get('e2e@ornek.com')
const link = /https?:\/\/\S+/.exec(String(mail?.text_body))?.[0] // http://localhost:5311/#/sifre-sifirla?token=…
```

## 4. Web'in bilmesi gerekenler

- **Kimlik:** tarayıcıda çerez (`sid`; üretimde `__Host-sid`, HttpOnly). Başka alan adındaki istemci:
  giriş/kayıt isteğine `X-Auth-Mode: token` → yanıt `{ user, token }`, sonra `Authorization: Bearer <token>`.
- **Durum kodları:** kayıt, alan oluştur, davet oluştur `201`; öteki başarılar `200`. Gövdesiz başarı her yerde
  `{ "ok": true }` (çıkış, tüm cihazlardan çıkış, şifre değiştir/unuttum/sıfırla, alan sil, üye çıkar, hesap sil).
- **401 ayrımı:** yalnız `code: 'unauthorized'` "oturum yok/düştü" demektir. `invalid_credentials` (401) şifre
  yanlış demektir — şifre değiştir ve hesap sil formunda da bu gelir; oturumu düşürmeyin, alana hata yazın
  (`details: [{ path: 'currentPassword' | 'password', message }]`).
- **Diğer kodlar:** `account_disabled` (403, hesap kapatıldı), `weak_password` (400, `details[0].path` =
  `password` ya da `newPassword`), `rate_limited` (429 + `Retry-After` başlığı + `details.retryAfter` sn),
  `payload_too_large` (413; eşitlemede daha küçük parti gönderin), `invalid_token` (400; davet/sıfırlama
  bağlantısı geçersiz ya da kullanılmış).
- **Davet önizleme** (`GET /api/invites/:token`) oturum İSTEMEZ ve yanıtı sarmalanmamıştır: doğrudan
  `invitePreviewSchema` (`{ workspaceName, role, invitedBy, expiresAt }`). Kabul (`POST /api/invites/accept`)
  oturum ister, `{ workspace }` döner. Zaten üye olan biri kabul ederse davet harcanmaz.
- **Gövde:** gövdeli her istek `Content-Type: application/json` olmalı (değilse 400 `validation`).
- **CSRF:** çerezle yapılan değiştirici isteklerde tarayıcının gönderdiği `Origin`/`Sec-Fetch-Site` denetlenir;
  aynı köken, `APP_URL` kökeni ve `ALLOWED_ORIGINS` kabul edilir. `Authorization: Bearer` istekleri muaftır.
- **SSE:** `new EventSource('/api/events')` (çerezle, aynı köken). Olaylar: `ready` (bağlandı), `poke`
  (`data` = `pokeEventSchema`; `clientId` kendi cihazınızsa yok sayın). Nabız: 25 sn'de bir yorum satırı.
  Çıkış/şifre değişiminde sunucu akışı keser; EventSource yeniden dener ve 401 alınca kapanır.
  Bearer kullanan istemci EventSource kullanamaz (başlık gönderemez): akışı `fetch` ile okumalı.
- **Kişisel alan** her kullanıcıda bir tanedir, adı "Kişisel"; silinemez, paylaşılamaz, ondan ayrılınamaz.
- **Yetki:** yeniden adlandırma, silme, davet, rol değiştirme, üye çıkarma yalnız `owner`. Üye olmadığınız alan
  `404` döner (varlığı sızmaz). Son sahip düşürülemez/ayrılamaz (`403`).
- **Hesap dışa aktarma** (`GET /api/account/export`) `Content-Disposition: attachment` ile JSON döner; tarayıcıda
  indirmek için `<a href="/api/account/export" download>` yeter (çerezle, aynı köken).
- **Yönetim:** `GET /api/admin/users?q=&limit=&cursor=`, `PATCH /api/admin/users/:id`, ve yeni
  `GET /api/admin/metrics` (`adminMetricsResponseSchema`, shared'a eklendi; DEGISIKLIKLER.md).
- **`.env`:** sunucu önce çalışma klasöründeki (`api/`), yoksa `havuz/uygulama/` klasöründeki `.env`'i okur.

## 5. Tek servis yayınında (WEB_DIST) web için kurallar

- **CSP:** `script-src 'self'; style-src 'self'; connect-src 'self'` — satır içi `<script>`, `<style>` ve
  `style="…"` özniteliği index.html'de KULLANILMAZ. vite-plugin-pwa için `injectRegister: 'script'` (ya da
  `virtual:pwa-register` içe aktarması) kullanın, `'inline'` değil. Dış CDN/yazı tipi yok; gerekiyorsa
  `api/src/http/securityHeaders.ts` → `WEB_CSP` değişmeli (bize söyleyin).
- **Önbellek:** `/assets/*` 1 yıl `immutable`; `index.html`, `sw.js`, manifest ve öteki her şey `no-cache`.
- Uzantısız bilinmeyen adres `index.html` döner (SPA yedeği; HashRouter'la zaten gerekmez); uzantılı bilinmeyen
  adres 404'tür.

## 6. Değişiklik günlüğü

- 16.11.2026 — İlk sürüm: bütün zorunlu uçlar, SSE, web sunumu, betikler.
- 16.11.2026 — `GET /api/admin/metrics` eklendi (shared'da `API_PATHS.adminMetrics`). `HEAD /api/events` artık
  akış açmıyor. `.env` kökte de aranıyor.
