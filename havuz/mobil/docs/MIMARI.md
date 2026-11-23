# Mimari

Tek uygulama, üç katman: arayüz (ekranlar) → yerel depo (SQLite) → eşitleme (API). Sözleşme `shared/`'dadır ve
sunucuyla (havuz/uygulama/api) AYNI koddur.

```
┌──────────────────────────── shared/ (havuz/uygulama/shared/src'nin kopyası, saf kod) ─────────────────────────────┐
│ varlık şemaları (entities/) · API şemaları ve adresleri (api.ts) · hata kodları (errors.ts)                       │
│ eşitleme protokolü + applyMutation (sync.ts) · uzlaştırma planı (replica.ts) · test: MemoryServer/Replica         │
└──────────────▲──────────────────────────────────────────────────────────────────────────▲──────────────────────────┘
               │ aynı kod                                                                  │ aynı kod
┌──────────────┴──────────────────── telefon (bu temel) ───────────────────┐   ┌────────────┴──── havuz/uygulama/api ──┐
│ Ekranlar (src/features) ◄── useRecords / useRecord (canlı okuma)          │   │ POST /api/sync → records tablosu      │
│      │ useWrite: create / update / remove / restore                        │   │ kimlik (belirteç kipi), alanlar       │
│      ▼                                                                    │   └──────────────▲────────────────────────┘
│ Yerel depo (src/lib/store)  — LocalDb: TEK sıra, BEGIN…COMMIT             │                  │
│   records (görünen + sunucu hâli) · outbox (AUTOINCREMENT mid) · meta     │                  │
│      ▲ planReconcile (tek işlem)       │ buildSyncRequest                 │                  │
│ Eşitleme motoru (src/lib/sync) ────────┴──── ApiClient (Bearer) ──────────┼──────────────────┘
│   tetikleyiciler: yazma · ağ geldi · ön plana geldi · 60 sn               │
│ Oturum (src/lib/session): hangi veritabanı, belirteç (güvenli depo)       │
└───────────────────────────────────────────────────────────────────────────┘
```

## Veri akışı: bir görevi işaretlemek

1. `TaskRow` onay kutusu → `useTaskActions().toggleDone` → `useWrite('tasks').update(id, { done: true })`.
2. `records.ts → updateRecord`: yalnız değişen alanı bulur (`diffPatch`), `applyMutation` ile doğrular ve uygular;
   **tek işlemde** görünen hâli `records`'a, değişikliği `outbox`'a yazar. Hesapsız alan (`local`) giden kutusuna girmez.
3. `LocalDb` COMMIT'ten sonra "records ve outbox değişti" der; `useLiveQuery` sorguyu yeniden çalıştırır, liste yenilenir.
4. `db.onLocalWrite` → tetikleyici 0,5 sn bekler → `engine.requestSync('push')`.
5. Motor isteği kurar (`readSyncRequest`), `POST /api/sync` gönderir (`ApiClient`, `Authorization: Bearer`).
6. Yanıt `applySyncResponse` içinde **tek işlemde** uygulanır: onaylananlar giden kutusundan düşer, gelen kayıtlar
   yeniden tabanlanır (sunucu hâli + bekleyen yerel değişiklikler), imleçler ve alan listesi saklanır.

Çevrimdışıyken 1–3 aynen çalışır; 5 ağ hatası verir, motor üstel geri çekilmeyle bekler; ağ gelince
(`expo-network`) ya da uygulama ön plana gelince (`AppState`) hemen yeniden dener.

## Veritabanları

| Ad                               | İçinde                                         | Kim kullanır                       |
| -------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `cihaz.db`                       | oturum kaydı (belirteç HARİÇ), tema, karşılama | `lib/device/deviceStore.ts`        |
| `yerel.db`                       | hesapsız kullanımın kayıtları (alan `local`)   | hesapsız kip                       |
| `kullanici-<kimlik>.db`          | o kullanıcının kayıtları, giden kutusu, meta   | hesaplı kip (her kullanıcıya ayrı) |
| güvenli depo (Keychain/Keystore) | oturum belirteci                               | `lib/session/tokenStore.ts`        |

`SessionProvider` açılışta `cihaz.db`'yi okur, belirteci güvenli depodan alır, hangi veri veritabanının açılacağına
karar verir; hesaplıysa eşitleme motorunu kurar ve tetikleyicilere bağlar. Sunucu 401 dönerse oturum "süresi
dolmuş" olur: veri silinmez, belirteç silinir, yeniden girişte bekleyen değişiklikler gönderilir.

## Gezinme

```
src/app/_layout.tsx            kök: oturum → tema → bildirim → onay penceresi → Stack
src/app/index.tsx              yönlendirme: karşılama ya da görevler
src/app/welcome|login|register|forgot-password|delete-account.tsx
src/app/(app)/_layout.tsx      karşılama geçilmediyse yönlendirir; StoreGate (veritabanı + seçili alan) + iç Stack
src/app/(app)/(tabs)/_layout   alt sekmeler: tasks · lists · settings
src/app/(app)/task/[id].tsx    görev ayrıntısı      src/app/(app)/list/[id].tsx   liste ayrıntısı
src/app/(app)/workspaces.tsx   alan değiştirici (modal)
src/app/+not-found.tsx         bilinmeyen adres
```

Her rota dosyası tek satırdır; ekranın kendisi `src/features/<ad>/<Ad>Screen.tsx`'tedir. Android geri tuşu yığında
bir önceki ekrana döner; onay penceresinde "Vazgeç" sayılır.

## Arayüz katmanları

| Katman      | Klasör              | Kural                                                                             |
| ----------- | ------------------- | --------------------------------------------------------------------------------- |
| Rotalar     | `src/app/`          | tek satır; ekranı features'tan alır                                               |
| Yerleşimler | `src/navigation/`   | kök yığın, sekmeler, hata ekranları                                               |
| Özellikler  | `src/features/<ad>` | ekran `…Screen.tsx`; saf mantık ayrı dosyada (`logic.ts`); eylemler `use…Actions` |
| Bileşenler  | `src/ui/`           | erişilebilir (rol + ad + durum), ≥ 48 dp, tema renkleri                           |
| Altyapı     | `src/lib/`          | depo, eşitleme, oturum, API, tarih, platform tamamlayıcıları                      |
| Metinler    | `src/i18n/tr.json`  | arayüz metni yalnız burada                                                        |

Durum yönetimi: sunucu verisi için ayrı önbellek YOK; tek doğruluk kaynağı yerel SQLite'tır. Arayüz durumu (form
değerleri, açık pencere) küçük ve yereldir (`useState`).

## Testler

| Düzey      | Nerede                                 | Ne kanıtlar                                                                   |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Depo       | `test/store/`                          | işlem/sıra, göçler, yazma kuralları, canlı okuma (gerçek SQLite: node:sqlite) |
| Eşitleme   | `test/sync/`                           | motor (MemoryServer'a karşı), tetikleyiciler, **eşdeğerlik**, uygunluk        |
| Ekranlar   | `test/features/`                       | gerçek rotalarla akışlar (hesapsız + sahte API'li hesaplı)                    |
| Bileşenler | `test/ui/`                             | roller, durumlar, ≥ 48 dp, bildirim, onay penceresi                           |
| Kurallar   | `test/rules/`                          | sözlük, gömülü metin, başlıklar, harf dönüşümü, karşıtlık, kopya, yapı        |
| Gerçek API | `test/integration/`, `e2e/api.spec.ts` | 17 uygunluk senaryosu + iki cihazlı akış (`npm run e2e:api`)                  |
| Web duman  | `e2e/yerel.spec.ts`                    | derlenmiş uygulama: ekle → tamamla → sil + geri al → yenilemede korunur       |
