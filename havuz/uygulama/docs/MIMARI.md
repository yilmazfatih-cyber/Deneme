# Mimari

Üç paket, tek sözleşme:

```
┌────────────────────────── shared/ (ortak sözleşme, saf kod) ───────────────────────────┐
│ varlık şemaları (entities/) · API şemaları ve adresleri (api.ts) · hata kodları         │
│ eşitleme protokolü + applyMutation (sync.ts) · uzlaştırma mantığı (replica.ts)          │
│ test yardımcıları: MemoryServer, MemoryReplica, uygunluk testleri (testing/)            │
└──────────────▲─────────────────────────────────────────────────────▲───────────────────┘
               │ aynı kod                                             │ aynı kod
┌──────────────┴──────────── web/ (tarayıcı) ─────────┐   ┌───────────┴──── api/ (sunucu) ────┐
│ React arayüz (features/, ui/)                       │   │ Hono + node:sqlite                │
│   ▲ useLiveQuery (canlı okuma)    │ create/update…  │   │ kimlik, alanlar, davetler         │
│   │                               ▼                 │   │ POST /api/sync → records tablosu  │
│ Dexie / IndexedDB (lib/store/) ◄── tek doğruluk     │   │ GET /api/events (SSE "poke")      │
│   records · outbox (giden kutusu) · meta            │   │ e-posta (geliştirmede mail_outbox)│
│   ▲                         │                       │   └───────────────▲───────────────────┘
│   │ planReconcile (tek işlem) │ buildSyncRequest      │                   │
│ Eşitleme motoru (lib/sync/) ──── POST /api/sync ─────┼───────────────────┘
│   ◄── poke ─── GET /api/events ─────────────────────┼─── (anlık bildirim)
│ Servis çalışanı (PWA): uygulama kabuğu önbellekte   │
└─────────────────────────────────────────────────────┘
```

## Veri akışı: bir görevi işaretlemek

1. `TaskRow` kutusu → `useTaskActions().toggleDone` → `useWrite('tasks').update(id, { done: true })`.
2. `records.ts → updateRecord`: yalnız değişen alanı bulur (`diffPatch`), `applyMutation` ile doğrular ve
   uygular; **tek Dexie işleminde** görünen hâli `records` tablosuna, değişikliği `outbox`a yazar.
3. `useLiveQuery` değişikliği görür; liste kendiliğinden yenilenir (ağ beklenmez). Başka sekmeler de görür.
4. `db.onLocalWrite` → tetikleyici 0,5 sn bekler (art arda yazmalar birleşsin) → `engine.requestSync('push')`.
5. Motor eşitleme kilidini alır (tek sekme), `readSyncRequest` ile isteği kurar, `POST /api/sync` gönderir.
6. Yanıt `applySyncResponse` içinde **tek işlemde** uygulanır: onaylananlar giden kutusundan düşer, gelen
   kayıtlar yeniden tabanlanır, imleçler ve alan listesi güncellenir.
7. Sunucu aynı alandaki öteki kullanıcılara/cihazlara `poke` gönderir; onların motoru eşitler ve görür.

Çevrimdışıyken 1–3 aynen çalışır; 5 başarısız olur, motor üstel geri çekilmeyle bekler; bağlantı gelince
(`online` olayı) hemen yeniden dener. Ayrıntı: `docs/ESITLEME.md`.

## Oturum ve veritabanları

| Veritabanı (IndexedDB)          | İçinde                                        | Kim kullanır                       |
| ------------------------------- | --------------------------------------------- | ---------------------------------- |
| `havuz-uygulama.oturum`         | kim giriş yaptı, (belirteç kipinde) belirteç  | `lib/session/store.ts`             |
| `havuz-uygulama.yerel`          | hesapsız kullanımın kayıtları (`local` alanı) | hesapsız kip                       |
| `havuz-uygulama.kullanici.<id>` | o kullanıcının kayıtları, giden kutusu, meta  | hesaplı kip (her kullanıcıya ayrı) |

`SessionProvider` (`lib/session/SessionProvider.tsx`) oturum kaydını canlı izler: giriş/çıkış başka sekmede
olsa da bu sekme geçer. Hesaplı kipte eşitleme motorunu kurar ve tetikleyicileri bağlar. Sunucu 401 dönerse
oturum "süresi dolmuş" işaretlenir: veri silinmez, eşitleme yeniden girişe dek durur.

İlk girişte hesapsız alanda kayıt varsa "kayıtları hesaba taşı" adımı açılır (`lib/session/migrate.ts`):
kayıtlar aynı kimliklerle kişisel alana `put` olarak yazılır, sonra hesapsız veritabanından silinir.

## Arayüz katmanları

| Katman          | Klasör                     | Kural                                                                                        |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Uygulama kabuğu | `web/src/app/`             | rotalar (`routes.tsx`), kabuk (`Shell.tsx`), erişim denetimi (`App.tsx`)                     |
| Özellikler      | `web/src/features/<ad>/`   | özellik = klasör; sayfa `…Page.tsx`; saf mantık ayrı dosyada (`logic.ts`)                    |
| Bileşenler      | `web/src/ui/`              | erişilebilir, yerel öğeler (`<dialog>`, `popover`, `<details>`); canlı örnekler `/#/katalog` |
| Altyapı         | `web/src/lib/`             | depo, eşitleme, oturum, API istemcisi, tarih, görünüm, PWA                                   |
| Metinler        | `web/src/i18n/tr.json`     | arayüz metni yalnız burada; `t('anahtar')`                                                   |
| Görünüm         | `web/src/styles/index.css` | renk belirteçleri (açık/koyu/yüksek karşıtlık), Tailwind teması                              |

Durum yönetimi: sunucu verisi için ayrı önbellek YOK. Tek doğruluk kaynağı Dexie'dir; bileşenler
`useRecords`/`useRecord`/`useMeta` ile canlı okur. Arayüz durumu (açık pencere, form değerleri) küçük ve
yereldir (`useState`). Süzgeç ve sıralama gibi paylaşılabilir durum adres çubuğundadır (`?durum=…`).

## PWA

`vite-plugin-pwa` derlemede servis çalışanı üretir (`web/vite.config.ts`): html/js/css/simgeler önbelleğe
alınır, `/api/*` asla alınmaz. Yeni sürüm hazır olunca "Yeni sürüm hazır · Yenile" bildirimi çıkar
(`lib/pwa.ts`, `app/PwaNotices.tsx`). Göreli taban (`base: './'`) sayesinde aynı derleme alt klasörde de çalışır;
HashRouter sayesinde durağan barındırmada yenilemede 404 olmaz.

## Testler

| Düzey             | Nerede                               | Ne kanıtlar                                                          |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------- |
| Ortak sözleşme    | `shared/test/`                       | protokol, uzlaştırma, yakınsama (rastgele senaryolar)                |
| Web birim/bileşen | `web/test/` (jsdom + fake-indexeddb) | depo, motor (MemoryServer ile), eşdeğerlik, ekranlar, kural testleri |
| API               | `api/test/`                          | uçlar, güvenlik, uygunluk testleri gerçek API'ye karşı               |
| Uçtan uca         | `e2e/` (Playwright + axe)            | gerçek API + derlenmiş web; iki cihaz, çevrimdışı, davet, PWA        |
| Üreteç            | `scripts/test/`                      | üretilen kod derlenir, lint ve testten geçer                         |
