# API (`@uygulama/api`)

Hesap, oturum, çalışma alanı (paylaşım), eşitleme ve anlık bildirim sunucusu. Hono + Node'un yerleşik SQLite'ı
(`node:sqlite`); derleme adımı yok, TypeScript doğrudan çalışır. İstemci her şeyi yerelde yazar ve
`POST /api/sync` ile eşitler; sunucu bütün varlıkları tek `records` tablosunda JSON olarak saklar. İsterse
derlenmiş web uygulamasını da aynı adresten sunar (tek servis yayını).

## 5 dakikada çalıştırma

```bash
cd havuz/uygulama
npm ci                                   # bağımlılıklar (bir kez)
npm run dev -w @uygulama/api             # http://127.0.0.1:8310 — veritabanı api/.data/uygulama.db
npm run seed -w @uygulama/api            # deneme kullanıcısı + örnek görevler (şifreyi ekrana yazar)
curl -s http://127.0.0.1:8310/api/health
```

Gereksinim: Node ≥ 22.18 (bu ortamda 22.23.4 ile denendi).

## Komutlar (`npm run <ad> -w @uygulama/api`)

| Komut          | Ne yapar                                                             |
| -------------- | -------------------------------------------------------------------- |
| `dev`          | Sunucuyu dosya izleyerek başlatır                                    |
| `start`        | Sunucuyu başlatır (üretim: `NODE_ENV=production`)                    |
| `typecheck`    | TypeScript denetimi                                                  |
| `test`         | Bütün testler (ağsız; bu makinede ~13 sn)                            |
| `migrate`      | Bekleyen migrasyonları uygular (sunucu açılışta da yapar)            |
| `seed`         | Deneme kullanıcısı: `-- --email e@ornek.com --password '…'`          |
| `backup`       | Tutarlı yedek (`VACUUM INTO`): `-- [hedef.db]`                       |
| `create-admin` | Kullanıcıyı yönetici yapar / yönetici açar: `-- --email e@ornek.com` |

## Harita

| Yer                                       | Ne                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `src/index.ts`                            | Giriş: ayar → migrasyon → sunucu → düzgün kapanış                               |
| `src/app.ts`                              | `createApp(deps)`: ara katmanlar + modüller (YENİ MODÜL BURAYA)                 |
| `src/config.ts`                           | Ortam değişkenleri (Zod), Türkçe hata                                           |
| `src/context.ts`                          | Modüllere verilen bağlam (veritabanı, saat, postacı, hız sınırı…)               |
| `src/db/`                                 | SQLite sarmalayıcısı, migrasyon koşucusu                                        |
| `src/http/`                               | Ortak HTTP: gövde okuma, hatalar, CSRF, CORS, başlıklar, hız sınırı, web sunumu |
| `src/modules/account/`                    | **ÖRNEK MODÜL** — yeni uç yazarken kopyalanır                                   |
| `src/modules/auth/`                       | Kayıt, giriş, oturum, şifre işleri                                              |
| `src/modules/workspaces/`                 | Alanlar, üyeler, **yetki kuralları** (`permissions.ts`)                         |
| `src/modules/invites/`                    | Davetler                                                                        |
| `src/modules/sync/`                       | Eşitleme (shared'daki başvuru sunucusuyla birebir)                              |
| `src/modules/events/`                     | Anlık bildirim (SSE)                                                            |
| `src/modules/admin/`, `audit/`, `health/` | Yönetim, denetim günlüğü, sağlık                                                |
| `src/mail/`                               | Postacı (console / http) ve e-posta metinleri                                   |
| `migrations/`                             | `NNNN_ad.sql` dosyaları                                                         |
| `scripts/`                                | migrate, seed, backup, create-admin                                             |
| `test/`                                   | Testler; `test/support/` düzenek ve yardımcılar                                 |

Belgeler: `../docs/API.md` (uçlar), `../docs/GUVENLIK.md`, `../docs/YAYINLAMA.md`, `TARIFLER.md` (yeni uç,
tablo, ayar, e-posta, yetki kuralı), `KARARLAR.md`, `HAZIR.md` (web ekibi için başlatma notu).

## Sınırlar

- Tek süreç: SQLite + bellek içi hız sınırı ve anlık bildirim → tek sunucu kopyası (docs/YAYINLAMA.md §7).
- E-posta doğrulama, iki aşamalı doğrulama, dosya yükleme, "aktif cihazlarım" ekranı YOK.
- HTTP e-posta bağdaştırıcısı hiçbir gerçek sağlayıcıyla denenmedi; Docker görüntüsü bu ortamda derlenemedi
  (Docker sunucusu yok), Render ve ters vekil örnekleri denenmedi.
- Mezar taşları (silinmiş kayıtlar) hiç temizlenmez; tasarım notu: `../docs/MEZAR_TASI.md`.
- Arka plan işleri (e-posta) bellek içidir: sunucu tam o anda çökerse gönderilmemiş e-posta kaybolur.
- Kapasite ölçülmedi.
