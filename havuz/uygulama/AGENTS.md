# Tam yığın uygulama temeli — model talimatları

## Bu temel ne yapar

Çevrimdışı-önce bir web uygulaması (PWA) + API + ortak sözleşme. Kullanıcı her şeyi önce cihazına yazar
(IndexedDB), uygulama bağlantı olunca sunucuyla eşitler. Hesapsız (yalnız bu cihaz) ve hesaplı (cihazlar arası,
paylaşımlı alanlar) iki kipi vardır. Başvuru özelliği "Görevler ve Listeler"dir: yeni veri türleri onu örnek
alarak (ya da üreteçle) eklenir.

Sunucu belgeleri: `api/README.md` (çalıştırma), `api/HAZIR.md` (bütünleştirme notları), `api/TARIFLER.md`
(sunucu tarifleri), `api/KARARLAR.md`, `docs/API.md` (uçlar), `docs/GUVENLIK.md`, `docs/YAYINLAMA.md`
(yayın ve ortam değişkenleri §6), `docs/MEZAR_TASI.md` (silinenlerin temizliği, tasarım). Web/eşitleme:
`docs/MIMARI.md`, `docs/ESITLEME.md`, `docs/KARARLAR.md`.

## Komutlar

Hepsi `havuz/uygulama/` klasöründen çalışır.

| Komut                                                       | Ne zaman                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm ci`                                                    | ilk kurulum (kilit dosyasından)                                   |
| `npm run dev`                                               | API + web birlikte (http://localhost:5310)                        |
| `npm run dev -w @uygulama/web -- --mode yerel`              | yalnız web, sunucusuz                                             |
| `npm run check`                                             | HER değişiklikten sonra: tip + lint + biçim + bütün birim testler |
| `npm run format`                                            | biçim hatası varsa önce bunu çalıştırın                           |
| `npm run test -w @uygulama/web`                             | yalnız web testleri (~1 dk)                                       |
| `npx vitest run test/features/tasks.test.tsx` (web/ içinde) | tek test dosyası                                                  |
| `npm run e2e`                                               | uçtan uca (derler; gerçek API; uzun)                              |
| `npm run gen -- entity <ad> --etiket Tekil,Çoğul`           | yeni veri türü (shared + web + rota + sözlük + test)              |
| `npm run gen -- page <ad> --baslik "Ad"`                    | yeni sayfa                                                        |
| `npm run gen -- migration <ad>`                             | API'ye boş migrasyon dosyası (sıradaki numarayla)                 |
| `npm run test:gen`                                          | üreteci değiştirdiyseniz: ürettiği kodun derlendiğini kanıtlar    |
| `npm run shots`                                             | ekran görüntülerini yenile (`docs/ekran/`)                        |

## Harita

| Şunu değiştireceksen                        | Şuraya bak                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Veri türünün alanları                       | `shared/src/entities/<ad>.ts` (örnek: `tasks.ts`), kayıt: `entities/index.ts` |
| Bir ekran / özellik                         | `web/src/features/<ad>/` (örnek: `features/tasks/`)                           |
| Sayfa adresi, gezinme menüsü, sekme başlığı | `web/src/app/routes.tsx` (`ROUTES` listesi)                                   |
| Arayüz metni                                | `web/src/i18n/tr.json`                                                        |
| Renkler, tema, yazı                         | `web/src/styles/index.css`                                                    |
| Düğme, form alanı, pencere, menü…           | `web/src/ui/` (canlı örnekler: geliştirmede `/#/katalog`)                     |
| Kayıt okuma/yazma kancaları                 | `web/src/lib/store/hooks.ts` (`useRecords`, `useRecord`, `useWrite`)          |
| Yerel veritabanı tabloları / sürümleri      | `web/src/lib/store/schema.ts`                                                 |
| Eşitleme davranışı                          | `shared/src/sync.ts`, `shared/src/replica.ts` → sonra `web/src/lib/sync/`     |
| API çağrısı                                 | `web/src/lib/api.ts` (`ApiClient` yöntemleri), adresler `shared/src/api.ts`   |
| Giriş/çıkış, oturum                         | `web/src/lib/session/SessionProvider.tsx`                                     |
| Görünüm ayarları                            | `web/src/lib/appearance.ts` + `features/settings/AppearanceCard.tsx`          |
| Uygulama adı, renk, depolama öneki          | `web/src/app/config.ts`                                                       |
| PWA (önbellek, bildirim dosyası)            | `web/vite.config.ts`                                                          |
| Uçtan uca testler                           | `e2e/` (yardımcılar: `e2e/support/helpers.ts`)                                |

## Değişmez kurallar

1. **Arayüz metni yalnız `web/src/i18n/tr.json`'da**, `t('anahtar')` ile okunur. Anahtarı birleştirerek kurmayın
   (`t(\`a.${x}\`)`yasak); açık eşlem yazın (örnek:`features/tasks/labels.ts`).
Korur: `test/rules/i18n.test.ts`, `test/rules/hardcoded-text.test.ts`, TypeScript (`MessageKey`).
2. **Her sayfa `routes.tsx`'te kayıtlı ve başlığı sözlükte.** Korur: `test/rules/routes.test.ts`.
3. **Her özellik klasörünün testi var** (`web/test/features/<ad>.test.tsx`). Korur: `test/rules/structure.test.ts`.
4. **Her kaynak dosya Türkçe başlık yorumuyla açılır, ~300 satırı aşmaz.** Korur: `test/rules/structure.test.ts`.
5. **Kayıtlar yalnız `useWrite` / `lib/store/records.ts` ile yazılır.** `db.records.put` ile doğrudan yazmak
   giden kutusunu atlar: değişiklik sunucuya hiç gitmez. Korur: eşitleme testleri (`test/sync/`).
6. **Okuma yerel depodan:** ekranlar `useRecords`/`useRecord` kullanır; sunucu verisi için ayrı önbellek ya da
   durum deposu kurulmaz. Eşitlenmeyen sunucu verisi (üyeler gibi) `useRemote` ile okunur.
7. **Yeni alan `.default(...)` ile eklenir;** alan silinmez, türü değiştirilmez (eski kayıtlar bozulur).
   Korur: `shared/test/entities.test.ts`.
8. **Renkler yalnız anlamlı belirteçlerle** (`bg-surface`, `text-ink`, `text-muted`, `bg-accent`, `text-danger`…);
   Tailwind'in hazır paleti kapalıdır (`bg-red-500` çalışmaz). Korur: `test/rules/contrast.test.ts` (AA karşıtlık).
9. **Büyük/küçük harf `upperTr`/`lowerTr`** (`@uygulama/shared`); düz `toUpperCase()`/`toLowerCase()` yasak.
   Korur: lint (`eslint.config.js`).
10. **Yıkıcı işlem onaysız yapılmaz ya da geri alınabilir olur:** silme → "Geri al" bildirimi + "Son silinenler";
    geri alınamayan (hesap/alan silme) → `ConfirmDialog`. Korur: `test/features/tasks.test.tsx`.
11. **Dokunma hedefi ≥ 48 px, her düğmenin adı var** (simge düğmesinde `label`). Korur: e2e axe taraması.
12. **`shared/` sözleşmedir:** değiştirirseniz yalnız geriye uyumlu ekleme yapın, testini yazın ve
    `shared/DEGISIKLIKLER.md`'ye bir satır ekleyin.

## Tarifler

### 1. Yeni veri türü (varlık) — üreteçle (önerilen)

1. `npm run gen -- entity notes --etiket Not,Notlar` (ad: İngilizce, çoğul, küçük harf).
2. Alanları düzenleyin: `shared/src/entities/notes.ts` (her yeni alana `.default(...)`).
3. Liste ve ayrıntı ekranını alanlara göre güncelleyin: `web/src/features/notes/`.
4. `shared/test/entities.test.ts` içindeki en küçük örneği zorunlu alanlara göre güncelleyin.
5. Metinleri gözden geçirin: `web/src/i18n/tr.json` → `notes.*`.
6. `npm run check`.

Sunucuda tablo, migrasyon ya da uç GEREKMEZ: bütün varlıklar tek `records` tablosunda eşitlenir.

### 2. Yeni veri türü — elle

1. `shared/src/entities/<ad>.ts` → `tasks.ts`'i kopyalayın, `collection` ve alanları değiştirin.
2. `shared/src/entities/index.ts`: içe aktarın, `export *` satırı, `ENTITIES`'e `// YENİ VARLIK BURAYA` üstüne satır.
3. `shared/test/entities.test.ts`: `minimal` eşlemine en küçük geçerli kayıt.
4. `web/src/features/<ad>/<Ad>Page.tsx`: `features/tasks/TasksPage.tsx` örneğinden (okuma `useRecords('<ad>')`,
   yazma `useWrite('<ad>')`).
5. `web/src/app/routes.tsx`: içe aktarma + `// YENİ ROTA BURAYA` üstüne rota (`nav` verirseniz menüde görünür).
6. `web/src/i18n/tr.json`: kullandığınız anahtarlar. 7. `web/test/features/<ad>.test.tsx`. 8. `npm run check`.

### 3. Var olan varlığa alan ekle (ör. görevlere "etiket")

1. `shared/src/entities/tasks.ts`: `tag: z.string().max(40, 'Etiket en çok 40 karakter olabilir.').default('')`.
2. Formu güncelleyin: `web/src/features/tasks/TaskForm.tsx` (`TaskFormValues`, `toInput`, yeni `TextField`).
3. Listede göstermek isterseniz: `TaskRow.tsx`. 4. Sözlüğe etiket metni. 5. `npm run check`.

Eski kayıtlar yeni alanı okurken varsayılanı alır (`parseRow`); yerel veritabanı sürümü GEREKMEZ.

### 4. Yeni sayfa

1. `npm run gen -- page raporlar --baslik Raporlar`.
2. İçeriği yazın: `web/src/features/raporlar/RaporlarPage.tsx` (bileşenler `ui/`, veri `useRecords`).
3. Menüde görünmesin isterseniz `routes.tsx`'te `nav`ı silin; giriş gerektirecekse `access: 'account'`.
4. `npm run check`.

### 5. Yeni arayüz bileşeni

1. `web/src/ui/<Ad>.tsx` (başlık yorumu + kullanım örneği; dokunma hedefi ≥ 48 px; klavyeyle çalışsın).
2. `web/src/ui/index.ts`'ten dışa aktarın.
3. Katalog örneği: `web/src/features/catalog/CatalogPage.tsx`. 4. Test: `web/test/ui/components.test.tsx`.

### 6. Yeni görünüm ayarı

1. `web/src/lib/appearance.ts`: şemaya `.default(...)` ile alan; `applyAppearance` içinde `data-…` özniteliği.
2. `web/src/styles/index.css`: özniteliğin CSS karşılığı.
3. `web/src/features/settings/AppearanceCard.tsx`: denetim (`Switch` ya da `Choice`). 4. Sözlük. 5. `npm run check`.

### 7. Metin değiştir

`web/src/i18n/tr.json`'da değeri değiştirin. Anahtar adını değiştirirseniz kodda da değiştirin (TypeScript
gösterir). Testler bazı metinleri arar; kırılan testte metni güncelleyin. `npm run check`.

### 8. Yeni API ucu

Sunucu tarifi: `api/TARIFLER.md` → "Yeni uç nokta ekle". Web tarafı: `web/src/lib/api.ts`'te `ApiClient`'a
`// YENİ UÇ BURAYA` üstüne yöntem (şema `shared`dan). Ekranda `useRemote` ile okuyun (örnek:
`features/settings/MetricsCard.tsx`).

### 9. Yalnız-yerel (sunucusuz) yayın — GitHub Pages vb.

1. `npm run build:yerel` → `web/dist-yerel/`.
2. Klasörün içeriğini barındırmaya yükleyin (alt klasörde de çalışır: göreli taban + HashRouter).
3. Aynı alan adında başka bir uygulama da varsa `web/src/app/config.ts` → `APP.id`'nin benzersiz olduğundan emin
   olun (veritabanı adları ondan türer).

### 10. Tek servis yayın (API + web aynı adreste)

`docs/YAYINLAMA.md` (API ekibi). Kısaca: `npm run build`, API `WEB_DIST=../web/dist` ile başlatılır. Satır içi
betik/stil yazmayın (CSP `script-src 'self'; style-src 'self'`).

## Sık yapılan hatalar

| Belirti                                                        | Neden                                          | Çözüm                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `Argument of type '"x.y"' is not assignable to MessageKey`     | Anahtar sözlükte yok                           | `web/src/i18n/tr.json`'a ekleyin                                           |
| "Kullanılmayan anahtarları tr.json'dan silin"                  | Metni kaldırdınız ama anahtar duruyor          | Anahtarı silin                                                             |
| "Metni src/i18n/tr.json'a ekleyip t('anahtar') ile okuyun"     | `.tsx`'e düz Türkçe yazıldı                    | Metni sözlüğe taşıyın                                                      |
| "Sayfayı src/app/routes.tsx içindeki ROUTES listesine ekleyin" | `…Page` bileşeni rotasız                       | Rota ekleyin ya da `npm run gen -- page`                                   |
| Yazdığım kayıt başka cihaza gitmiyor                           | `db.records.put` ile doğrudan yazıldı          | `useWrite` / `createRecord` kullanın                                       |
| `useStore yalnız <StoreProvider> içinde…`                      | Bileşen kabuk dışında (oturum sayfası) çizildi | `useSession().state.db` kullanın ya da sayfayı `layout: 'app'` yapın       |
| `Module '"lucide-react"' has no exported member 'Trash2'`      | lucide 1.x'te ad değişti                       | `node_modules/lucide-react/dist/lucide-react.d.ts`'te arayın (ör. `Trash`) |
| Renk sınıfı (`bg-red-500`) etkisiz                             | Hazır palet kapalı                             | Belirteç kullanın (`bg-danger-soft text-danger`)                           |
| Testte `Unable to find role="menuitem"`                        | Menü açılmadan arandı                          | Önce düğmeye tıklayın, `findByRole` ile bekleyin                           |
| `npm run check` biçim hatası                                   | Prettier'dan geçmemiş dosya                    | `npm run format`                                                           |
| Giriş sonrası "Hazırlanıyor…" sürüyor                          | API'ye ulaşılamıyor (ilk eşitleme olmadı)      | `npm run dev` ile API'nin açık olduğunu denetleyin                         |

## Bitti tanımı

- [ ] `npm run check` yeşil (tip, lint, biçim, bütün testler).
- [ ] Yeni ekranın testi var; arayüz metinleri sözlükte; sayfa rotada ve başlığı var.
- [ ] Silme geri alınabilir ya da onaylı; izleyici rolünde yazma denetimleri kapalı.
- [ ] Çevrimdışıyken çalışıyor (veri yerelde yazılıyor, bağlantı gelince gidiyor).
- [ ] 360 px genişlikte yatay kaydırma yok; açık ve koyu temada okunur (`npm run e2e` erişilebilirlik testi).
- [ ] Varlık değiştiyse: yeni alanlar `.default(...)` ile; `shared/DEGISIKLIKLER.md` güncel.
