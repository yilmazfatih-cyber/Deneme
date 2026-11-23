# Yerel mobil uygulama temeli — model talimatları

## Bu temel ne yapar

Expo + React Native ile yazılmış, çevrimdışı-önce bir telefon uygulaması. Kullanıcı her şeyi önce telefondaki SQLite
veritabanına yazar; uygulama bağlantı olunca `havuz/uygulama`'nın API'siyle **aynı protokolle** eşitler. Hesapsız
(yalnız telefon) ve hesaplı iki kipi vardır. Örnek özellik "Görevler ve Listeler"dir; yeni veri türleri onu örnek
alarak (ya da üreteçle) eklenir. Varlık şemaları ve eşitleme mantığı `shared/` klasöründedir ve **orada değişmez**:
`havuz/uygulama/shared/src`'nin kopyasıdır.

## Komutlar

Hepsi `havuz/mobil/` klasöründen çalışır.

| Komut                                             | Ne zaman                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `npm ci`                                          | ilk kurulum (kilit dosyasından)                                   |
| `npm start`                                       | geliştirme (Expo Go ile telefonda; `w` tuşu tarayıcı)             |
| `npm run check`                                   | HER değişiklikten sonra: tip + lint + biçim + bütün Jest testleri |
| `npm run format`                                  | biçim hatası varsa önce bunu çalıştırın                           |
| `npx jest test/features/tasks.test.tsx`           | tek test dosyası                                                  |
| `npm run gen -- entity <koleksiyon> --etiket T,Ç` | shared'da TANIMLI varlık için ekranlar + sekme + sözlük + test    |
| `npm run gen -- screen <ad> --baslik "Başlık"`    | düz ekran (`--sekme` ile alt sekmeye de eklenir)                  |
| `npm run test:gen`                                | üreteci değiştirdiyseniz: ürettiği kodun geçtiğini kanıtlar       |
| `npm run shared:sync`                             | `../uygulama/shared/src` değişince kopyayı yenile                 |
| `npm run e2e`                                     | web derlemesi + Playwright duman testi (uzun)                     |
| `npm run e2e:api`                                 | gerçek API'yle bütünleşme (uzun; `../uygulama` gerekir)           |
| `npm run shots`                                   | `docs/ekran/` görüntülerini yenile                                |
| `npm run icons`                                   | simgeleri yeniden üret (`scripts/icons.ts`)                       |
| `npm run doctor`                                  | Expo paket sürümlerinin uyumu                                     |

## Harita

| Şunu değiştireceksen                         | Şuraya bak                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bir ekran                                    | `src/features/<ad>/<Ad>Screen.tsx` (örnek: `features/tasks/TasksScreen.tsx`)                  |
| Ekranın adresi                               | `src/app/…` (dosya adı = adres; dosyada tek satır: ekranı features'tan dışa aktarır)          |
| Alt sekmeler                                 | `src/navigation/TabsLayout.tsx` (`TABS` listesi)                                              |
| Arayüz metni                                 | `src/i18n/tr.json`                                                                            |
| Renkler, ölçüler, tema                       | `src/ui/palette.ts`, `src/ui/theme.tsx`                                                       |
| Düğme, metin alanı, seçim, bildirim, onay    | `src/ui/` (`index.ts`'ten içe aktarın)                                                        |
| Kayıt okuma/yazma kancaları                  | `src/lib/store/hooks.ts` (`useRecords`, `useRecord`, `useWrite`)                              |
| Yerel veritabanı tabloları (göç)             | `src/lib/store/schema.ts` (`MIGRATIONS`)                                                      |
| Eşitleme davranışı                           | önce `../uygulama/shared/src` (sync.ts, replica.ts) → `npm run shared:sync` → `src/lib/sync/` |
| Ne zaman eşitlenir                           | `src/lib/sync/triggers.ts`, süreler `src/lib/sync/timing.ts`                                  |
| API çağrısı                                  | `src/lib/api/client.ts` (`ApiClient`), adresler `shared/api.ts` → `API_PATHS`                 |
| Giriş/çıkış, oturum, hangi veritabanı        | `src/lib/session/SessionProvider.tsx`                                                         |
| Belirteç saklama                             | `src/lib/session/tokenStorage.ts` (telefon), `tokenStorage.web.ts` (web)                      |
| Cihaz ayarları (tema, karşılama)             | `src/lib/device/deviceStore.ts`                                                               |
| API adresi, uygulama adı, kimlikler, izinler | `app.config.ts` (+ `src/config.ts` okur)                                                      |
| Simgeler, açılış ekranı                      | `scripts/icons.ts` → `npm run icons`                                                          |
| Testler                                      | `test/` (yardımcılar `test/support/`), uçtan uca `e2e/`                                       |

## Değişmez kurallar

1. **`shared/` elle değiştirilmez.** Değişiklik `havuz/uygulama/shared/src`'de yapılır, sonra `npm run shared:sync`.
   Korur: `test/rules/shared-copy.test.ts`.
2. **Arayüz metni yalnız `src/i18n/tr.json`'da**, `t('anahtar')` ile; anahtar birleştirerek kurulmaz (açık eşlem:
   `features/tasks/labels.ts`). Korur: `test/rules/i18n.test.ts`, `test/rules/hardcoded-text.test.ts`, TypeScript.
3. **Her ekran `<Screen title={t('…')}>` ile sarılır; her rota dosyası yalnız bir `…Screen`'i dışa aktarır.**
   Korur: `test/rules/screens.test.ts`.
4. **Kayıtlar yalnız `useWrite` / `lib/store/records.ts` ile yazılır.** `INSERT INTO records` ile doğrudan yazmak giden
   kutusunu atlar: değişiklik sunucuya hiç gitmez. Korur: `test/store/records.test.ts`, `test/sync/`.
5. **Veritabanı işi `db.read`/`db.write` içinde, verilen `sql` ile yapılır;** işin içinden yeniden `db.read`/`db.write`
   çağrılmaz (sıra kendini bekler, kilitlenir). SQL her zaman parametreli (`?`). Korur: `test/store/localDb.test.ts`.
6. **Göçler yalnız sona eklenir;** yayınlanmış göç değiştirilmez; giden kutusu `AUTOINCREMENT` kalır (sıra numarası
   geri gitmez). Korur: `test/store/schema.test.ts`, `test/store/records.test.ts`.
7. **Büyük/küçük harf `upperTr`/`lowerTr`/`foldTr`** (`@uygulama/shared`); düz `toUpperCase()`/`toLowerCase()` yasak.
   Korur: lint + `test/rules/casing.test.ts`.
8. **`Alert.alert` kullanılmaz** (web'de düğmesiz çalışır): onay için `useConfirm`, bildirim için `useToast`. Korur: lint.
9. **Renkler yalnız `useTheme().colors`'tan;** yeni renk iki temaya birden eklenir ve karşıtlık testine yazılır.
   Korur: `test/rules/contrast.test.ts`.
10. **Dokunma hedefi ≥ 48 dp, her denetimin ekran okuyucu adı var** (`IconButton`'da `label` zorunlu; durum için
    `a11yState`). Korur: `test/ui/components.test.tsx`, e2e axe taraması.
11. **Silme geri alınabilir** ("Geri al" bildirimi) ya da geri alınamıyorsa onaylıdır (`useConfirm`).
    Korur: `test/features/tasks.test.tsx`, `test/features/settings.test.tsx`.
12. **Her özellik klasörünün testi var; her dosya Türkçe başlık yorumuyla açılır, ~300 satırı aşmaz.**
    Korur: `test/rules/structure.test.ts`.
13. **Veritabanı adları kısa kalır** (web'de yol ≤ 64 karakter). Korur: `test/store/schema.test.ts`.

## Tarifler

### 1. Yeni ekran

1. `npm run gen -- screen raporlar --baslik Raporlar` (alt sekmede görünsün isterseniz `--sekme`).
2. İçeriği yazın: `src/features/raporlar/RaporlarScreen.tsx` (bileşenler `src/ui`, veri `useRecords`).
3. Metinleri `src/i18n/tr.json`'a ekleyin (`raporlar.*`). 4. Testi genişletin: `test/features/raporlar.test.tsx`.
4. Başka ekrandan açmak: `router.push('/raporlar')`. 6. `npm run check`.

### 2. Yeni veri türü (varlık)

Şema sunucuyla ORTAKTIR; önce `uygulama`'da tanımlanır:

1. `cd ../uygulama && npm run gen -- entity notes --etiket Not,Notlar` → alanları `shared/src/entities/notes.ts`'te
   yazın (zorunlu tek metin alanı + ötekiler `.default(...)`), `npm run check` (uygulama'da).
2. `cd ../mobil && npm run shared:sync`.
3. `npm run gen -- entity notes --etiket Not,Notlar` → liste ekranı (sekme), ayrıntı ekranı, etiketler, rotalar,
   sözlük, test.
4. `src/i18n/tr.json` → `notes.field.*` ve seçenek adlarını Türkçeleştirin; ayrıntı ekranının başlığında "elle
   eklenecek alanlar" yazıyorsa (sayı, tarih) denetimini ekleyin (örnek: `features/tasks/DueField.tsx`).
5. `npm run check`. Sunucuda tablo/göç GEREKMEZ; telefonda da göç GEREKMEZ (kayıtlar JSON).

### 3. Var olan varlığa alan ekle (ör. görevlere "etiket")

1. `../uygulama/shared/src/entities/tasks.ts`: `tag: z.string().max(40, '…').default('')` (uygulama'nın tarifi).
2. `npm run shared:sync`. 3. Formu güncelleyin: `src/features/tasks/TaskEditScreen.tsx` (yeni `TextField`).
3. Listede göstermek için `TaskRow.tsx`. 5. Sözlüğe metin. 6. `npm run check`.

### 4. API adresini değiştir

1. Geliştirmede: `API_URL=http://192.168.1.20:8310 npx expo start --clear` (bilgisayarın yerel ağ adresi).
2. Mağaza derlemesinde: `eas.json` → `build.<profil>.env.API_URL` (https olmalı). 3. Değer `app.config.ts` →
   `extra.apiUrl` → `src/config.ts` → `API_CONFIG`. `none` ya da boş → hesapsız kip. Ayrıntı: `docs/AYARLAR.md`.

### 5. Mağazaya hazırlık

`docs/YAYINLAMA.md`: `app.config.ts`'teki "DEĞİŞTİRİN" satırları (ad, `bundleIdentifier`, `package`, `scheme`),
simgeler (`scripts/icons.ts` → `npm run icons`), `eas.json`, gizlilik bilgileri, hesap silme (var:
`/delete-account`). Bu ortamda yerel derleme denenmedi.

### 6. Ortak sözleşmeyi güncelle (uygulama/shared değişti)

1. `npm run shared:sync` (dosyaları kopyalar, başlık ve `shared/KAYNAK.json` özetlerini yeniler).
2. `npm run check`. Tip hatası çıkarsa neyin değiştiğini `../uygulama/shared/DEGISIKLIKLER.md`'de okuyun ve yeni
   adı/şemayı mobil kodda kullanın. `PROTOCOL_VERSION` arttıysa `src/lib/sync/` gözden geçirilir ve
   eski sürüm telefonlar "uygulamayı güncelleyin" uyarısı alır (`upgrade_required`).
3. `npm run e2e:api` ile gerçek API'ye karşı denetleyin.

### 7. Yeni göç (yerel veritabanına tablo/dizin)

1. `src/lib/store/schema.ts` → `MIGRATIONS` sonuna `{ version: <son+1>, description: '…', up: … }`.
2. Örnek ve test kalıbı: `test/store/schema.test.ts` ("örnek: 2. sürüm"). 3. `npm run check`.

### 8. Yeni sekme / sekme simgesi

`src/navigation/TabsLayout.tsx` → `TABS` (en çok 5). Simge adları `src/ui/Icon.tsx` → `ICONS` listesinden.

## Sık yapılan hatalar

| Belirti                                                      | Neden                                                     | Çözüm                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------- |
| `Argument of type '"x.y"' is not assignable to … MessageKey` | Anahtar sözlükte yok                                      | `src/i18n/tr.json`'a ekleyin                                   |
| "Kullanılmayan anahtarları … silin"                          | Metni kaldırdınız, anahtar duruyor                        | Anahtarı silin                                                 |
| "Metni src/i18n/tr.json'a ekleyip t('anahtar') ile okuyun"   | `.tsx`'e düz Türkçe yazıldı                               | Metni sözlüğe taşıyın                                          |
| "Kopya kaynaktan ayrılmış"                                   | `shared/` elle değişti ya da uygulama/shared değişti      | `npm run shared:sync`                                          |
| Test zaman aşımı, uygulama donuyor                           | `db.write` içinden `db.read` çağrıldı (kilitlenme)        | İçeride verilen `sql`'i kullanın                               |
| Yazdığım kayıt sunucuya gitmiyor                             | Tabloya doğrudan yazıldı                                  | `useWrite` / `writeRecord` kullanın                            |
| Telefonda "Sunucuya ulaşılamadı"                             | `API_URL` 127.0.0.1 ya da API yalnız 127.0.0.1'i dinliyor | Yerel ağ adresi + API'yi `HOST=0.0.0.0` ile başlatın           |
| Web derlemesinde eski API adresi                             | Metro önbelleği                                           | `--clear` ile derleyin (`npm run build:web` zaten yapar)       |
| Web'de "Uygulama açılamadı" (`sqlite3_open_v2`)              | Veritabanı adı çok uzun ya da sunucu COOP/COEP vermiyor   | Adı kısaltın; `scripts/serve-web.ts` başlıklarını kullanın     |
| Testte `Found multiple elements`                             | Aynı ad iki yerde (ör. düğme + onay penceresi)            | `within(screen.getByLabelText('Pencere başlığı'))`             |
| Testte `toBeOnTheScreen` tipi yok                            | `expect` `@jest/globals`'tan alındı                       | Testlerde Jest'in genel `expect`'ini kullanın (içe aktarmayın) |
| `Cannot find module 'expo-…'` (testte)                       | Paket `expo install` ile kurulmadı                        | `npx expo install <paket>`                                     |

## Bitti tanımı

- [ ] `npm run check` yeşil (tip, lint, biçim, bütün testler).
- [ ] Yeni ekranın testi var; metinler sözlükte; ekran `<Screen title>` ile sarılı; rota dosyası tek satır.
- [ ] Silme geri alınabilir ya da onaylı; izleyici rolünde yazma denetimleri kapalı.
- [ ] Çevrimdışıyken çalışıyor (yazma yerelde; bağlantı gelince gidiyor).
- [ ] Dokunma hedefleri ≥ 48 dp; açık ve koyu temada okunur; ekran okuyucu adları var (`npm run e2e` axe taraması).
- [ ] `shared/` değiştiyse kaynağı `uygulama`'da değişti ve `npm run shared:sync` çalıştı.
