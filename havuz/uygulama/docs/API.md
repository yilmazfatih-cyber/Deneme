# API dökümü

Bu belge `api/` sunucusunun bütün uçlarını anlatır. İstek ve yanıt şemaları ortak sözleşmededir:
`shared/src/api.ts` (kimlik, hesap, alanlar, yönetim), `shared/src/sync.ts` (eşitleme), `shared/src/errors.ts`
(hatalar). Adresler `API_PATHS`'tan gelir; istemci adresi elle yazmaz.

> Bu belge testle korunur (`api/test/rules.test.ts`): her `### YÖNTEM /adres` başlığı sunucudaki bir uca karşılık
> gelmeli, sunucudaki her uç burada olmalı ve bilgi satırı `json <şemaAdı>` olan her kod bloğu o şemaya
> uymalıdır. Yeni uç eklediğinizde buraya da başlık ve örnek ekleyin; yoksa `npm run test -w @uygulama/api` düşer.

## Genel kurallar

**Adres.** Geliştirmede `http://127.0.0.1:8310`; tek servis yayınında web uygulamasıyla aynı köken
(`https://ornek.com/api/...`). Aşağıdaki `curl` örnekleri `API=http://127.0.0.1:8310` varsayar.

**Gövde.** Gövdeli her istek `Content-Type: application/json` olmalıdır; değilse `400 validation`. Gövde sınırı
64 KiB, eşitlemede ~8 MiB; aşılırsa `413 payload_too_large`.

**Kimlik.** Üç yol:

- Tarayıcı (aynı köken): giriş/kayıt yanıtı `sid` çerezini yazar (üretimde `__Host-sid`; `HttpOnly`,
  `SameSite=Lax`, `Path=/`, üretimde `Secure`). Sonraki isteklerde tarayıcı çerezi kendisi gönderir.
- Başka alan adındaki istemci: giriş/kayıt isteğine `X-Auth-Mode: token` başlığı eklenir; yanıt `token` alanını
  taşır, çerez yazılmaz. Sonraki isteklerde `Authorization: Bearer <token>`.
- `curl`: çerez kavanozu (`-c cerez.txt -b cerez.txt`) ya da belirteç kipi.

Oturum 30 gün geçerlidir (`SESSION_TTL_DAYS`); kalan süre yarıya inince her istekte kendiliğinden uzar.

**CSRF.** Çerezle yapılan değiştirici isteklerde (GET dışı) tarayıcının gönderdiği `Origin` / `Sec-Fetch-Site`
denetlenir: aynı köken, `APP_URL` kökeni ve `ALLOWED_ORIGINS` kabul edilir; başka köken `403 forbidden` alır.
Bu başlıkları hiç göndermeyen istemciler (curl, sunucular) ve `Authorization: Bearer` istekleri bu denetimden
muaftır.

**Başarı yanıtı.** Döndürecek nesnesi olmayan uçlar `200` ile şunu döner:

```json okResponseSchema
{ "ok": true }
```

**Hata yanıtı.** Her hata aynı biçimdedir; istemci `code`'a göre davranır, `message` kullanıcıya gösterilebilir:

```json errorBodySchema
{
  "error": {
    "code": "validation",
    "message": "Geçerli bir e-posta yazın.",
    "details": [{ "path": "email", "message": "Geçerli bir e-posta yazın." }]
  }
}
```

| Kod                   | HTTP | Ne zaman                                                                     |
| --------------------- | ---- | ---------------------------------------------------------------------------- |
| `validation`          | 400  | Gövde/parametre şemaya uymuyor (`details`: alan → ileti), JSON değil         |
| `weak_password`       | 400  | Şifre yaygın / tahmin edilir / kişisel bilgi içeriyor (`details[0].path`)    |
| `invalid_token`       | 400  | Davet ya da sıfırlama bağlantısı geçersiz, süresi dolmuş, kullanılmış        |
| `unknown_collection`  | 400  | (eşitlemede, `rejected` içinde) tanınmayan koleksiyon                        |
| `unauthorized`        | 401  | Oturum yok ya da düştü → istemci giriş ekranına döner                        |
| `invalid_credentials` | 401  | E-posta/şifre yanlış; şifre değiştir ve hesap sil formunda da (oturum SÜRER) |
| `forbidden`           | 403  | Yetki yok (rol yetmiyor, kişisel alan kuralı, başka siteden istek)           |
| `account_disabled`    | 403  | Hesap yönetici tarafından kapatılmış                                         |
| `not_found`           | 404  | Kayıt/alan yok ya da üyesi değilsiniz (varlığı sızmasın diye aynı yanıt)     |
| `conflict`            | 409  | (şu an kullanılmıyor; ayrılmış)                                              |
| `email_taken`         | 409  | Bu e-postayla hesap var                                                      |
| `payload_too_large`   | 413  | Gövde sınırı aşıldı                                                          |
| `upgrade_required`    | 426  | Eşitleme protokol sürümü uyuşmuyor → "uygulamayı yenileyin"                  |
| `rate_limited`        | 429  | Hız sınırı; `Retry-After` başlığı ve `details.retryAfter` (saniye)           |
| `internal`            | 500  | Beklenmeyen hata (ayrıntı yalnız sunucu günlüğünde, `X-Request-Id` ile)      |

**Hız sınırları** (bellek içi, tek süreç; IP `TRUST_PROXY`'ye göre bulunur; IPv6'da bütün /64 bloğu tek IP
sayılır):

| Kural         | Anahtar      | Sınır                |
| ------------- | ------------ | -------------------- |
| genel         | IP           | 600 / dakika         |
| giriş         | IP           | 30 / 15 dakika       |
| giriş (hesap) | IP + e-posta | 10 / 15 dakika       |
| kayıt         | IP           | 10 / saat            |
| şifre unuttum | IP; e-posta  | 10 / saat; 3 / saat  |
| şifre sıfırla | IP           | 20 / 15 dakika       |
| eşitleme      | kullanıcı    | 240 / dakika         |
| anlık akış    | kullanıcı    | 30 bağlantı / dakika |

Şifre değiştir ve hesap sil uçlarındaki şifre denetimi de "giriş (hesap)" kuralına sayılır.

**İstek kimliği.** Her yanıtta `X-Request-Id` vardır; sorun bildirirken bunu verin (günlükte aynı kimlik geçer).

## Sistem

### GET /api/health

Sunucu ve veritabanı ayakta mı. Kimlik gerekmez. Barındırma servisinin sağlık denetimi bunu çağırır.

```json healthResponseSchema
{ "ok": true, "version": "0.1.0", "time": "2026-11-16T09:00:00.000Z" }
```

Hatalar: `500 internal` (veritabanı yanıt vermiyor).

```bash
curl -s $API/api/health
```

## Kimlik

### POST /api/auth/register

Yeni hesap + kişisel alan ("Kişisel") + oturum açar. Kimlik gerekmez. `201` döner.

```json registerRequestSchema
{ "email": "ayse@ornek.com", "password": "mavi-deniz-kenari-42", "name": "Ayşe Yılmaz" }
```

E-posta kırpılır ve küçük harfe çevrilir. Şifre 10–128 karakter; ayrıca yaygın parolalar, "sözcük + rakam"
kalıpları, harfsiz şifreler ve ad/e-posta parçası içeren şifreler `weak_password` alır.

```json authResponseSchema
{
  "user": {
    "id": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d",
    "email": "ayse@ornek.com",
    "name": "Ayşe Yılmaz",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2026-11-16T09:00:00.000Z"
  }
}
```

`X-Auth-Mode: token` ile gelindiyse yanıtta ayrıca `"token": "…"` (43 karakter) bulunur ve çerez yazılmaz.

Hatalar: `400 validation`, `400 weak_password`, `403 forbidden` (başka siteden), `409 email_taken`,
`429 rate_limited`.

```bash
curl -s -c cerez.txt -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ayse@ornek.com","password":"mavi-deniz-kenari-42","name":"Ayşe Yılmaz"}'
```

### POST /api/auth/login

Oturum açar. Kimlik gerekmez.

```json loginRequestSchema
{ "email": "ayse@ornek.com", "password": "mavi-deniz-kenari-42" }
```

Yanıt kayıttakiyle aynı (`authResponseSchema`); belirteç kipinde `token` da döner:

```json authResponseSchema
{
  "user": {
    "id": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d",
    "email": "ayse@ornek.com",
    "name": "Ayşe Yılmaz",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2026-11-16T09:00:00.000Z"
  },
  "token": "I9Com79fa9alLs-l2TQHmFx-QElncW2Zx5UCIJxuucI"
}
```

Hatalar: `401 invalid_credentials` (e-posta yoksa da aynı yanıt), `403 account_disabled` (yalnız şifre doğruysa),
`400 validation`, `429 rate_limited`.

```bash
curl -s -c cerez.txt -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ayse@ornek.com","password":"mavi-deniz-kenari-42"}'
# Belirteç kipi:
TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -H 'X-Auth-Mode: token' \
  -d '{"email":"ayse@ornek.com","password":"mavi-deniz-kenari-42"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
```

### POST /api/auth/logout

Bu oturumu kapatır ve çerezi siler; bu oturumun anlık akışı da kesilir. Oturum yoksa da `200` döner. Gövde
gerekmez. Yanıt: `okResponseSchema`.

```bash
curl -s -b cerez.txt -c cerez.txt -X POST $API/api/auth/logout
```

### POST /api/auth/logout-all

Kullanıcının BÜTÜN oturumlarını (bütün cihazlar) kapatır. Oturum gerekir. Yanıt: `okResponseSchema`.
Hatalar: `401 unauthorized`.

```bash
curl -s -b cerez.txt -X POST $API/api/auth/logout-all
```

### GET /api/auth/me

Oturumu açık kullanıcı. Oturum gerekir.

```json meResponseSchema
{
  "user": {
    "id": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d",
    "email": "ayse@ornek.com",
    "name": "Ayşe Yılmaz",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2026-11-16T09:00:00.000Z"
  }
}
```

Hatalar: `401 unauthorized`, `403 account_disabled`.

```bash
curl -s -b cerez.txt $API/api/auth/me
curl -s -H "Authorization: Bearer $TOKEN" $API/api/auth/me
```

### POST /api/auth/password/change

Şifreyi değiştirir. Oturum gerekir. Bu oturum kalır, öteki bütün oturumlar kapanır; bekleyen şifre sıfırlama
bağlantıları da geçersiz olur; kullanıcıya "şifreniz değiştirildi" e-postası gider.

```json changePasswordRequestSchema
{ "currentPassword": "mavi-deniz-kenari-42", "newPassword": "yesil-orman-yolu-17" }
```

Yanıt: `okResponseSchema`. Hatalar: `401 invalid_credentials` (şu anki şifre yanlış;
`details[0].path = "currentPassword"`; oturum DÜŞMEZ), `400 weak_password` (`path: "newPassword"`),
`400 validation`, `401 unauthorized`, `429 rate_limited`.

```bash
curl -s -b cerez.txt -X POST $API/api/auth/password/change -H 'Content-Type: application/json' \
  -d '{"currentPassword":"mavi-deniz-kenari-42","newPassword":"yesil-orman-yolu-17"}'
```

### POST /api/auth/password/forgot

Şifre sıfırlama bağlantısı gönderir (1 saat geçerli, tek kullanımlık):
`APP_URL/#/sifre-sifirla?token=…`. Kimlik gerekmez. Hesap olsun olmasın **her zaman aynı** yanıtı verir
(`okResponseSchema`); e-posta arka planda gönderilir.

```json forgotPasswordRequestSchema
{ "email": "ayse@ornek.com" }
```

Hatalar: `400 validation`, `429 rate_limited`.

```bash
curl -s -X POST $API/api/auth/password/forgot -H 'Content-Type: application/json' -d '{"email":"ayse@ornek.com"}'
```

### POST /api/auth/password/reset

Bağlantıdaki belirteçle yeni şifre koyar. Kimlik gerekmez. Başarıda kullanıcının BÜTÜN oturumları kapanır
(yeniden giriş gerekir) ve kullanıcının öteki sıfırlama bağlantıları geçersiz olur. Yanıt: `okResponseSchema`.

```json resetPasswordRequestSchema
{ "token": "pQ3vX8rT2mN7kL1sY6wZ4bC9dF0gH5jA2eR8tU3iO6p", "newPassword": "yesil-orman-yolu-17" }
```

Hatalar: `400 invalid_token`, `400 weak_password`, `400 validation`, `429 rate_limited`.

```bash
curl -s -X POST $API/api/auth/password/reset -H 'Content-Type: application/json' \
  -d '{"token":"<e-postadaki belirteç>","newPassword":"yesil-orman-yolu-17"}'
```

## Hesap

### PATCH /api/account

Adı günceller. Oturum gerekir.

```json updateProfileRequestSchema
{ "name": "Ayşe Yılmaz Demir" }
```

Yanıt: `meResponseSchema` (güncel kullanıcı). Hatalar: `400 validation`, `401 unauthorized`.

```bash
curl -s -b cerez.txt -X PATCH $API/api/account -H 'Content-Type: application/json' -d '{"name":"Ayşe Yılmaz Demir"}'
```

### GET /api/account/export

Verilerimi indir: kullanıcı, üyesi olunan alanlar ve bu alanlardaki bütün kayıtlar (silinmişler dahil).
Başka üyelerin adı/e-postası konmaz. `Content-Disposition: attachment; filename="hesap-verileri-YYYY-AA-GG.json"`.
Oturum gerekir. Şema: `api/src/modules/account/service.ts → accountExportSchema`.

```json accountExportSchema
{
  "format": "uygulama-disa-aktarim/1",
  "exportedAt": "2026-11-16T09:00:00.000Z",
  "user": {
    "id": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d",
    "email": "ayse@ornek.com",
    "name": "Ayşe Yılmaz",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2026-11-16T09:00:00.000Z"
  },
  "workspaces": [
    {
      "id": "0193a5c8-4f2e-7c00-8000-000000000001",
      "name": "Kişisel",
      "kind": "personal",
      "role": "owner",
      "rev": 1,
      "memberCount": 1
    }
  ],
  "records": [
    {
      "workspaceId": "0193a5c8-4f2e-7c00-8000-000000000001",
      "collection": "tasks",
      "id": "0193a5c8-5000-7000-8000-00000000000a",
      "data": {
        "listId": null,
        "title": "Süt al",
        "note": "",
        "done": false,
        "dueDate": null,
        "priority": "normal",
        "order": 0
      },
      "deleted": false,
      "rev": 1,
      "createdAt": "2026-11-16T09:00:00.000Z",
      "updatedAt": "2026-11-16T09:00:00.000Z",
      "updatedBy": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d"
    }
  ]
}
```

Hatalar: `401 unauthorized`.

```bash
curl -s -b cerez.txt -OJ $API/api/account/export
```

### DELETE /api/account

Hesabı kalıcı olarak siler (şifre onayıyla). Oturum gerekir. Kişisel alan ve kayıtları silinir. Tek sahibi
olunan paylaşımlı alanda başka üye varsa sahiplik **en eski** üyeye geçer, yoksa alan kayıtlarıyla silinir.
Öteki alanlardan yalnız üyelik çıkar. Çerez silinir. Yanıt: `okResponseSchema`.

```json deleteAccountRequestSchema
{ "password": "mavi-deniz-kenari-42" }
```

Hatalar: `401 invalid_credentials` (`details[0].path = "password"`), `400 validation`, `401 unauthorized`,
`429 rate_limited`.

```bash
curl -s -b cerez.txt -X DELETE $API/api/account -H 'Content-Type: application/json' -d '{"password":"mavi-deniz-kenari-42"}'
```

## Çalışma alanları

Roller: `owner` (sahip), `editor` (düzenleyen), `viewer` (izleyici). Üyesi olmadığınız alan için her uç
`404 not_found` döner (alanın varlığı sızmaz).

### GET /api/workspaces

Üyesi olunan alanlar, oluşturulma sırasıyla. Oturum gerekir.

```json workspacesResponseSchema
{
  "workspaces": [
    {
      "id": "0193a5c8-4f2e-7c00-8000-000000000001",
      "name": "Kişisel",
      "kind": "personal",
      "role": "owner",
      "rev": 12,
      "memberCount": 1
    },
    {
      "id": "0193a5c8-4f2e-7c00-8000-000000000002",
      "name": "Ev",
      "kind": "shared",
      "role": "editor",
      "rev": 40,
      "memberCount": 3
    }
  ]
}
```

Hatalar: `401 unauthorized`.

```bash
curl -s -b cerez.txt $API/api/workspaces
```

### POST /api/workspaces

Paylaşımlı alan açar; açan sahip olur. Oturum gerekir. `201` döner.

```json createWorkspaceRequestSchema
{ "name": "Ev" }
```

```json workspaceResponseSchema
{
  "workspace": {
    "id": "0193a5c8-4f2e-7c00-8000-000000000002",
    "name": "Ev",
    "kind": "shared",
    "role": "owner",
    "rev": 0,
    "memberCount": 1
  }
}
```

Hatalar: `400 validation`, `401 unauthorized`.

```bash
curl -s -b cerez.txt -X POST $API/api/workspaces -H 'Content-Type: application/json' -d '{"name":"Ev"}'
```

### PATCH /api/workspaces/:workspaceId

Yeniden adlandırır. Yalnız sahip (kişisel alan da adlandırılabilir).

```json updateWorkspaceRequestSchema
{ "name": "Ev işleri" }
```

Yanıt: `workspaceResponseSchema`. Hatalar: `400 validation`, `401 unauthorized`, `403 forbidden` (sahip değil),
`404 not_found`.

```bash
curl -s -b cerez.txt -X PATCH $API/api/workspaces/<alanKimliği> -H 'Content-Type: application/json' -d '{"name":"Ev işleri"}'
```

### DELETE /api/workspaces/:workspaceId

Alanı bütün kayıtları, üyelikleri ve davetleriyle siler. Yalnız sahip; kişisel alan silinemez. Eski üyelere
`poke` gider (istemcileri alanı bırakır). Yanıt: `okResponseSchema`.
Hatalar: `401 unauthorized`, `403 forbidden`, `404 not_found`.

```bash
curl -s -b cerez.txt -X DELETE $API/api/workspaces/<alanKimliği>
```

### GET /api/workspaces/:workspaceId/members

Üyeler, katılma sırasıyla. Her üye görebilir.

```json membersResponseSchema
{
  "members": [
    {
      "userId": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d",
      "name": "Ayşe Yılmaz",
      "email": "ayse@ornek.com",
      "role": "owner",
      "joinedAt": "2026-11-16T09:00:00.000Z"
    },
    {
      "userId": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0e",
      "name": "Burak Kaya",
      "email": "burak@ornek.com",
      "role": "viewer",
      "joinedAt": "2026-11-16T10:00:00.000Z"
    }
  ]
}
```

Hatalar: `401 unauthorized`, `404 not_found`.

```bash
curl -s -b cerez.txt $API/api/workspaces/<alanKimliği>/members
```

### PATCH /api/workspaces/:workspaceId/members/:userId

Üyenin rolünü değiştirir (sahipliği devretmek için birini `owner` yapın). Yalnız sahip. Alanın en az bir sahibi
kalmalıdır: son sahip düşürülemez.

```json updateMemberRequestSchema
{ "role": "editor" }
```

```json memberResponseSchema
{
  "member": {
    "userId": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0e",
    "name": "Burak Kaya",
    "email": "burak@ornek.com",
    "role": "editor",
    "joinedAt": "2026-11-16T10:00:00.000Z"
  }
}
```

Hatalar: `400 validation`, `401 unauthorized`, `403 forbidden` (sahip değil / son sahip), `404 not_found`
(alan ya da üye yok).

```bash
curl -s -b cerez.txt -X PATCH $API/api/workspaces/<alan>/members/<kullanıcı> -H 'Content-Type: application/json' -d '{"role":"editor"}'
```

### DELETE /api/workspaces/:workspaceId/members/:userId

Üyeyi çıkarır. Kendi kimliğinizi verirseniz alandan **ayrılırsınız** (her rol ayrılabilir; son sahip ve kişisel
alan hariç). Başkasını yalnız sahip çıkarır. Çıkarılan kişiye `poke` gider. Yanıt: `okResponseSchema`.
Hatalar: `401 unauthorized`, `403 forbidden`, `404 not_found`.

```bash
curl -s -b cerez.txt -X DELETE $API/api/workspaces/<alan>/members/<kullanıcı>
```

## Davetler

### POST /api/workspaces/:workspaceId/invites

Tek kullanımlık, 7 gün geçerli davet oluşturur. Yalnız sahip; kişisel alana davet yok; davetle `owner` verilmez.
Davet, oluşturan kişi alanın sahibi olduğu sürece geçerlidir (çıkarılır, rolü düşer ya da hesabını silerse
bağlantısı `invalid_token` alır).
Belirteç YALNIZ bu yanıtta görünür (sunucu özetini saklar). Bağlantıyı istemci kurar:
`webUrl(location.origin, WEB_ROUTES.invite, { token })` → `https://ornek.com/#/davet?token=…`. `201` döner.

```json createInviteRequestSchema
{ "role": "editor" }
```

```json inviteResponseSchema
{
  "invite": {
    "token": "pQ3vX8rT2mN7kL1sY6wZ4bC9dF0gH5jA2eR8tU3iO6p",
    "role": "editor",
    "expiresAt": "2026-11-23T09:00:00.000Z"
  }
}
```

Hatalar: `400 validation`, `401 unauthorized`, `403 forbidden`, `404 not_found`.

```bash
curl -s -b cerez.txt -X POST $API/api/workspaces/<alan>/invites -H 'Content-Type: application/json' -d '{"role":"editor"}'
```

### GET /api/invites/:token

Davet önizleme. **Kimlik gerekmez** (giriş yapmamış alıcı da görür). Yanıt sarmalanmamıştır:

```json invitePreviewSchema
{ "workspaceName": "Ev", "role": "editor", "invitedBy": "Ayşe Yılmaz", "expiresAt": "2026-11-23T09:00:00.000Z" }
```

Hatalar: `400 invalid_token` (bilinmeyen, kullanılmış, süresi dolmuş, daveti verenin sahipliği bitmiş — hepsi
aynı).

```bash
curl -s $API/api/invites/<belirteç>
```

### POST /api/invites/accept

Daveti kabul eder; davet rolüyle üye olunur ve davet harcanır. Oturum gerekir. Zaten üyeyseniz rolünüz
değişmez ve davet HARCANMAZ.

```json acceptInviteRequestSchema
{ "token": "pQ3vX8rT2mN7kL1sY6wZ4bC9dF0gH5jA2eR8tU3iO6p" }
```

Yanıt: `workspaceResponseSchema` (katılınan alan). Hatalar: `400 invalid_token`, `400 validation`,
`401 unauthorized`.

```bash
curl -s -b cerez.txt -X POST $API/api/invites/accept -H 'Content-Type: application/json' -d '{"token":"<belirteç>"}'
```

## Eşitleme

### POST /api/sync

Tek eşitleme ucu: bekleyen değişiklikleri gönderir, imleçlerden sonraki kayıtları alır. Oturum gerekir.
Davranışın tanımı `shared/src/testing/memoryServer.ts` ve uygunluk testleridir (`shared/src/testing/conformance.ts`);
sunucu bunları birebir uygular, hepsini tek bir veritabanı işleminde yapar.

```json syncRequestSchema
{
  "protocolVersion": 1,
  "clientId": "0193a5c8-6000-7000-8000-0000000000c1",
  "cursors": { "0193a5c8-4f2e-7c00-8000-000000000001": 0 },
  "mutations": [
    {
      "mid": 1,
      "workspaceId": "0193a5c8-4f2e-7c00-8000-000000000001",
      "collection": "tasks",
      "recordId": "0193a5c8-5000-7000-8000-00000000000a",
      "at": "2026-11-16T09:00:00.000Z",
      "op": "put",
      "data": { "title": "Süt al" }
    }
  ]
}
```

```json syncResponseSchema
{
  "lastMutationId": 1,
  "rejected": [],
  "touched": [
    {
      "workspaceId": "0193a5c8-4f2e-7c00-8000-000000000001",
      "collection": "tasks",
      "id": "0193a5c8-5000-7000-8000-00000000000a",
      "data": {
        "listId": null,
        "title": "Süt al",
        "note": "",
        "done": false,
        "dueDate": null,
        "priority": "normal",
        "order": 0
      },
      "deleted": false,
      "rev": 1,
      "createdAt": "2026-11-16T09:00:00.000Z",
      "updatedAt": "2026-11-16T09:00:00.000Z",
      "updatedBy": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d"
    }
  ],
  "workspaces": [
    {
      "id": "0193a5c8-4f2e-7c00-8000-000000000001",
      "name": "Kişisel",
      "kind": "personal",
      "role": "owner",
      "rev": 1,
      "memberCount": 1
    }
  ],
  "changes": {
    "0193a5c8-4f2e-7c00-8000-000000000001": { "records": [], "cursor": 1, "more": false, "reset": false }
  }
}
```

Kurallar özeti: değişiklikler varış sırasıyla uygulanır (alan düzeyinde son yazan kazanır); bir cihazdan
işlenmiş `mid` yeniden gelirse uygulanmaz; reddedilen değişiklik `rejected`'ta döner ve yeniden denenmez
(`forbidden`, `validation`, `not_found`, `unknown_collection`, `payload_too_large`); alan başına sayfa 500 kayıt,
fazlası için `more: true`; istemcinin imleci sunucudan ilerideyse `reset: true`.

Hatalar (bütün istek): `400 validation` (bozuk istek, sırasız `mid`, 100'den çok değişiklik), `403 forbidden`
(cihaz kimliği başka kullanıcının), `413 payload_too_large`, `426 upgrade_required`, `401 unauthorized`,
`429 rate_limited`.

```bash
curl -s -b cerez.txt -X POST $API/api/sync -H 'Content-Type: application/json' \
  -d '{"protocolVersion":1,"clientId":"cihaz-1","cursors":{},"mutations":[]}'
```

### GET /api/events

Anlık dürtme akışı (Server-Sent Events, `text/event-stream`). Oturum gerekir. Akış:

```text
event: ready
data: {}
retry: 5000

event: poke
data: {"workspaceId":"0193a5c8-4f2e-7c00-8000-000000000001","rev":7,"clientId":"0193a5c8-6000-7000-8000-0000000000c1"}

: nabız
```

`poke` verisi:

```json pokeEventSchema
{ "workspaceId": "0193a5c8-4f2e-7c00-8000-000000000001", "rev": 7, "clientId": "0193a5c8-6000-7000-8000-0000000000c1" }
```

Bir alandaki kayıt eşitlemeyle değişince (ya da alan adı/üyelik değişince, `clientId: null`) alanın bütün
üyelerine gider; çıkarılan üyeye de gider. `clientId` sizin cihazınızsa yok sayın. 25 sn'de bir yorum satırı
(`: nabız`) bağlantıyı canlı tutar. Çıkış/şifre değişimi/hesap kapatılmasında sunucu akışı keser. Kullanıcı
başına en çok 10 açık akış (aşılırsa en eskisi kapanır). Okumayan istemcinin bağlantısı 256 okunmamış olayda
kesilir (bellek şişmesin; EventSource yeniden bağlanır). Tarayıcıda `new EventSource('/api/events')`;
`Authorization` başlığı gerekiyorsa EventSource kullanılamaz, akış `fetch` ile okunur.

Hatalar (akış açılmadan, JSON): `401 unauthorized`, `403 account_disabled`, `429 rate_limited`.

```bash
curl -s -N -b cerez.txt $API/api/events
```

## Yönetim

Yalnız `role: "admin"`. İlk yöneticiler `ADMIN_EMAILS` ayarından (kayıtta ve sunucu açılışında) ya da
`npm run create-admin -w @uygulama/api -- --email …` ile.

### GET /api/admin/users

Kullanıcılar, yeniden eskiye. Sorgu: `q` (ad/e-posta araması, Türkçe harf ve büyük/küçük harf duyarsız, en çok
100 karakter), `limit` (1–100, varsayılan 50), `cursor` (önceki yanıttaki `nextCursor`).

```json adminUsersResponseSchema
{
  "users": [
    {
      "id": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d",
      "email": "ayse@ornek.com",
      "name": "Ayşe Yılmaz",
      "role": "user",
      "emailVerified": false,
      "createdAt": "2026-11-16T09:00:00.000Z",
      "disabled": false,
      "lastSeenAt": "2026-11-16T12:00:00.000Z"
    }
  ],
  "nextCursor": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d"
}
```

Hatalar: `400 validation`, `401 unauthorized`, `403 forbidden`.

```bash
curl -s -b cerez.txt "$API/api/admin/users?q=ay%C5%9Fe&limit=20"
```

### PATCH /api/admin/users/:userId

Hesabı kapatır/açar ya da rolünü değiştirir. Kapatılan hesabın bütün oturumları ve anlık akışları kesilir.
Yönetici kendi rolünü değiştiremez ve kendini kapatamaz.

```json adminUpdateUserRequestSchema
{ "disabled": true }
```

```json adminUserResponseSchema
{
  "user": {
    "id": "0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0e",
    "email": "burak@ornek.com",
    "name": "Burak Kaya",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2026-11-16T09:00:00.000Z",
    "disabled": true,
    "lastSeenAt": null
  }
}
```

Hatalar: `400 validation` (boş gövde: "En az bir alan verin."), `401 unauthorized`, `403 forbidden`
(yönetici değil / kendine), `404 not_found`.

```bash
curl -s -b cerez.txt -X PATCH $API/api/admin/users/<kullanıcı> -H 'Content-Type: application/json' -d '{"disabled":true}'
```

### GET /api/admin/metrics

Sunucunun anlık durumu (yalnız yönetici): sürüm, çalışma süresi (sn), kullanıcı/alan/kayıt sayıları (silinmiş
kayıtlar ayrıca), geçerli oturum sayısı, açık anlık akış sayısı, veritabanı dosya boyutu (bayt).

```json adminMetricsResponseSchema
{
  "version": "0.1.0",
  "time": "2026-11-16T12:00:00.000Z",
  "uptimeSeconds": 10800,
  "users": 42,
  "disabledUsers": 1,
  "workspaces": 51,
  "records": 1830,
  "deletedRecords": 120,
  "activeSessions": 37,
  "liveConnections": 12,
  "databaseBytes": 2564096
}
```

Hatalar: `401 unauthorized`, `403 forbidden`.

```bash
curl -s -b cerez.txt $API/api/admin/metrics
```

## Web uygulamasının sunulması

`WEB_DIST` klasörü (varsayılan `web/dist`) hazırsa API dışındaki her `GET` adresi oradan sunulur: var olan dosya
(`/assets/*` bir yıl `immutable` önbellekle; öteki her şey `no-cache` + ETag), uzantısız bilinmeyen adres
`index.html` (SPA yedeği), uzantılı bilinmeyen adres `404`. Ayrıntı: `docs/YAYINLAMA.md`.
