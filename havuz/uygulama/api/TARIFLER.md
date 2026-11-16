# API tarifleri

Kök `AGENTS.md` bu tariflere bağlanır. Her tarif: dokunulacak dosyalar, adımlar, doğrulama komutu. Bütün
komutlar `havuz/uygulama/` klasöründen çalışır. Bitince HER ZAMAN: `npm run check`.

> Önce şunu sorun: **yeni bir veri türü mü ekliyorum (not, alışveriş kalemi, randevu…)?** O zaman sunucuya
> DOKUNMAYIN: varlık `shared/src/entities/` altına eklenir, bütün varlıklar tek `records` tablosunda eşitlenir;
> tablo, migrasyon, uç gerekmez (bkz. `shared/src/entity.ts`). Aşağıdaki tarifler eşitleme dışı sunucu işleri içindir.

## 1. Yeni uç nokta ekle

Örnek alınacak modül: `api/src/modules/account/` (routes.ts + service.ts) ve testi `api/test/modules/account.test.ts`.

1. **Şema ve adres** (`shared/src/api.ts`): istek/yanıt şemasını yazın (`fooRequestSchema`, `fooResponseSchema`),
   adresi `API_PATHS`'e `// YENİ ADRES BURAYA` satırının üstüne ekleyin. `shared/DEGISIKLIKLER.md`'ye bir satır.
2. **Kalıp** (`api/src/http/routes.ts`): `ROUTES`'a aynı anahtarla Hono kalıbı (`'/api/foo/:fooId'`). Eklemezseniz
   tip denetimi kırılır.
3. **İşleyici** (`api/src/modules/<modül>/routes.ts`): dört adım — `requireUser(c)` (yönetici için
   `requireAdmin`), `await readJson(c, şema)` / `readIdParam(c, 'fooId')`, servis çağrısı,
   `c.json({...} satisfies FooResponse)`. Gövdesiz başarı: `c.json(OK)`.
4. **Servis** (`service.ts`): iş kuralı. Birden çok yazma → `ctx.db.transaction(() => { … })` (içinde `await`
   YOK). Güvenlikle ilgiliyse `ctx.audit.record({ action: '…' })`; olay adını `AUDIT_ACTIONS` listesine
   (`modules/audit/repo.ts`) ekleyin. Kötüye kullanılabilirse hız sınırı:
   `ctx.limiter.consume(RATE_RULES.x, anahtar)`; kuralı `RATE_RULES`'a (`http/rateLimit.ts`) ekleyin.
5. **Yeni modülse** `api/src/app.ts`'te `// YENİ MODÜL BURAYA` satırına `app.route('/', fooRoutes(ctx))` ve
   `api/test/modules/<modül>.test.ts` (kural testi ister).
6. **Oturumsuz** çağrılacaksa (nadiren!) `api/test/rules.test.ts → PUBLIC_ROUTES`'a ekleyin.
7. **Belge** (`docs/API.md`): `### POST /api/foo` başlığı, açıklama, kimlik gereği, bilgi satırı
   `json fooRequestSchema` olan bir kod bloğu (örnek gövde), hatalar, `curl` örneği. Kural testi başlığı ve
   örneği denetler.
8. **Test**: mutlu yol + oturumsuz (401) + yetkisiz kişi (403/404) + doğrulama hatası (400).
9. İstemci çağrısı `web/src/lib/api.ts`'e eklenir (web tarafı).

Doğrulama: `npm run test -w @uygulama/api` (özellikle `rules.test.ts`), sonra `npm run check`.

## 2. Yeni tablo / migrasyon ekle

Örnek: `api/migrations/0002_workspaces.sql` (tablo + yabancı anahtar + dizin), SQL'i: `modules/workspaces/repo.ts`.

1. Sıradaki numarayla dosya açın: `api/migrations/0005_kisa_ad.sql` (dört hane, küçük harf, alt çizgi).
   İlk satır: `-- 0005 — Ne ve neden.`
2. `CREATE TABLE … ( … ) STRICT;` Zamanlar `TEXT` (ISO, `toISOString()`); mantıksal değerler
   `INTEGER CHECK (x IN (0, 1))`; kullanıcıya bağlı satır `REFERENCES users (id) ON DELETE CASCADE`.
   Sorgulanan sütunlara dizin.
3. Var olan tabloya sütun: `ALTER TABLE users ADD COLUMN takma_ad TEXT NOT NULL DEFAULT '';` (varsayılan şart).
4. Dosyada `BEGIN`/`COMMIT`, `VACUUM`, `PRAGMA journal_mode` YAZMAYIN (koşucu her dosyayı tek işlemde çalıştırır).
5. SQL'i modülün `repo.ts` dosyasına yazın: her sorgu parametreli (`db.get('… WHERE id = ?', id)`), satır türü
   `interface FooRow`.
6. **Uygulanmış bir migrasyonu ASLA değiştirmeyin**: sunucu özet uyuşmazlığında başlamaz. Düzeltme = yeni dosya.
7. Silinen kullanıcı/alan için bu tablodaki satırlar ne olacak? (`ON DELETE CASCADE` / `SET NULL`) Süresi dolan
   satır varsa temizliğini `api/src/maintenance.ts`'e ekleyin.

Doğrulama: `npm run migrate -w @uygulama/api` (yerel veritabanına uygular), `npm run test -w @uygulama/api`.

## 3. Yeni ayar (ortam değişkeni) ekle

Örnek: `SESSION_TTL_DAYS` (`api/src/config.ts`).

1. `envSchema`'ya alan: `FOO_BAR: z.string().regex(…, 'Türkçe, ne yazılacağını söyleyen ileti').optional()`.
2. `Config` arayüzüne karşılığı (`fooBar: number`) ve `buildConfig`'te dönüşüm + varsayılan.
3. Başka bir ayara bağlıysa ya da üretimde zorunluysa `crossCheck`'e kural (`'FOO_BAR: … yazın.'`).
4. `docs/YAYINLAMA.md → Ortam değişkenleri` tablosuna satır; gerekiyorsa `.env` örneğine.
5. `api/test/config.test.ts`'e varsayılan + hatalı değer testi.
6. Testte değiştirmek: `createTestServer({ env: { FOO_BAR: '…' } })`.

Doğrulama: `npm run test -w @uygulama/api -- config`.

## 4. Yeni e-posta ekle

Örnek: şifre sıfırlama (`mail/templates.ts → passwordResetMail`, `modules/auth/service.ts → forgotPassword`).

1. `api/src/mail/templates.ts`'e işlev: `export function fooMail(input): MailMessage` — konu, düz metin ve HTML;
   kullanıcıdan gelen her değer HTML'de `escapeHtml(…)` ile. Bağlantı gerekiyorsa
   `webUrl(ctx.config.appUrl, WEB_ROUTES.x, { token })` (yol `shared → WEB_ROUTES`'a eklenir).
2. Serviste yanıtı bekletmeden gönderin: `ctx.jobs.run('foo e-postası', () => ctx.mailer.send(fooMail({…})))`.
   (İşlem içinde çağırmayın; işlem bittikten sonra.)
3. Test: `await t.idle()` sonra `t.outbox()` (`mail_outbox` tablosu) → konu/metin/bağlantı denetimi.
4. Belirteç taşıyorsa: `newToken` + yalnız `hashToken` saklanır, süreli ve tek kullanımlık olur.

## 5. Yeni yetki kuralı ekle

Örnek: "davet yalnız sahip" (`modules/workspaces/permissions.ts → assertCanInvite`).

1. `permissions.ts`'e `assertCanFoo(membership)` yazın ve başlıktaki rol tablosuna satır ekleyin.
2. Servisin işlem bloğunun BAŞINDA çağırın: `assertCanFoo(requireMembership(ctx.db, workspaceId, auth.user.id))`.
3. Üye olmayan kişi her zaman `404` alır (`requireMembership`); üye ama yetkisizse `403` + `MESSAGES.x`
   (iletiyi `api/src/messages.ts`'e ekleyin).
4. Olumsuz testler: yetkisiz rolün denemesi (403) ve üye olmayanın denemesi (404) —
   `api/test/modules/workspaces.test.ts` ya da `api/test/security.test.ts`.
5. Kuralı `docs/GUVENLIK.md → Yetki` ve `docs/API.md`'deki uç açıklamasına yazın.

## 6. Küçükler

- **Hız sınırı kuralı:** `api/src/http/rateLimit.ts → RATE_RULES`'a satır + `docs/API.md` tablosu + testte 429.
- **Denetim olayı:** `api/src/modules/audit/repo.ts → AUDIT_ACTIONS`'a ad; serviste `ctx.audit.record(…)`;
  `details`'e kişisel veri koymayın.
- **Kullanıcıya dönük ileti:** `api/src/messages.ts` (Türkçe, suçlamayan, ne yapılacağını söyleyen).
- **Yeni hata kodu:** `shared/src/errors.ts`'te üç yer (kod, HTTP durumu, Türkçe ileti) + `docs/API.md` tablosu.

## Sık yapılan hatalar

| Belirti                                                  | Neden                                              | Çözüm                                                                        |
| -------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `db.transaction içinde await/Promise kullanılamaz`       | İşlem işlevi `async` ya da içinde `await`          | Parola özeti, e-posta gibi beklemeleri işlemden ÖNCE/SONRA yapın             |
| `rules.test.ts`: "… oturumsuz çağrılabiliyor!"           | İşleyicide `requireUser(c)` unutuldu               | İlk satıra `const auth = requireUser(c)`                                     |
| `rules.test.ts`: "… docs/API.md'de belgelenmemiş"        | Yeni uç belgede yok                                | `### YÖNTEM /api/…` başlığı ekleyin                                          |
| `rules.test.ts`: "… örneği şemaya uymuyor"               | Belgedeki JSON örneği eski                         | Örneği şemaya göre düzeltin                                                  |
| Sunucu açılmıyor: "… uygulandıktan sonra değiştirilmiş"  | Uygulanmış migrasyon dosyası düzenlendi            | Dosyayı geri alın, değişikliği yeni numaralı dosyaya yazın                   |
| `400 validation`: "İstek gövdesi JSON olmalı"            | İstemci `Content-Type` göndermedi                  | `Content-Type: application/json` ekleyin                                     |
| `403`: "İstek başka bir siteden geldiği için reddedildi" | Tarayıcı kökeni `APP_URL`/`ALLOWED_ORIGINS`'te yok | `APP_URL`'i web'in adresiyle aynı yapın                                      |
| Testte beklenmedik `429`                                 | Aynı testte çok istek (hız sınırı açık)            | `createTestServer({ env: { RATE_LIMIT: 'off' } })` ya da saati ileri sarın   |
| `weak_password` alınıyor ama şifre uzun                  | Şifre ad/e-posta parçası ya da "sözcük + yıl"      | Başka şifre (kural: `api/src/lib/passwordPolicy.ts`)                         |
| `toUpperCase() Türkçede 'i' harfini bozar` (lint)        | Düz büyük/küçük harf çevirisi                      | `upperTr`/`lowerTr`/`foldTr` (shared); ASCII için gerekçeli `eslint-disable` |
