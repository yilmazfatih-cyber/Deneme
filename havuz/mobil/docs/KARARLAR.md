# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi. Tarih: 23 Kasım 2026. Sürümler kurulu paketlerden
okundu (`npm ls`), ezberden yazılmadı.

## Çatı ve sürümler

- **Expo SDK 58** (`expo` 58.0.26, `react-native` 0.88.1, `react` 19.3.0). Sürümler `npx expo install` ile seçildi
  (çevrimdışı kipte `expo/bundledNativeModules.json`'dan; Expo'nun sunucusuna bu ortamdan ulaşılamıyor).
  `npx expo install --check` → "Dependencies are up to date".
- **TypeScript `~6.0.3`**: Expo 58'in kendi şablonu da `~6.0.3` kullanıyor; typescript-eslint 8.x 6.1'den yenisini
  desteklemiyor. TS 7 bu yüzden seçilmedi.
- **Expo Router** (dosya tabanlı gezinme): Expo'nun varsayılanı, derin bağlantıyı ve web'i kendisi çözer. Rota
  dosyaları TEK satırdır ve ekranı `src/features`'tan dışa aktarır: küçük model "ekran nerede" sorusunu hep aynı
  yerde yanıtlar; kural testi bunu korur. Rota adları İngilizce (`/tasks`): STANDARTLAR §3 kaynak dosya adlarını
  İngilizce ister ve Expo Router'da dosya adı = adres.
- **Alt sekmeler `expo-router/js-tabs`** (JavaScript sekmeleri). `NativeTabs` daha "yerel" görünür ama web'de ve
  testlerde farklı davranır, deneysel API'leri çoktur. Sekme etiketleri ekran okuyucu için Türkçeleştirildi
  (varsayılan iOS etiketi İngilizce "…, tab, 1 of 3").
- **React Compiler ve typedRoutes kapalı.** Derleyici bellekleme davranışını değiştirir, hata ayıklamayı zorlaştırır;
  typedRoutes `expo start` çalışmadan tip üretmez (denetim ağsız ve hızlı olmalı). Adresler düz metin.

## Yerel depo

- **expo-sqlite** (telefonda dosya, web'de OPFS). Web'de `.wasm` için `metro.config.js` ve sunucuda COOP/COEP
  başlıkları gerekir (`scripts/serve-web.ts` verir). Dexie/IndexedDB telefonda yok; AsyncStorage işlem (transaction)
  ve sorgu vermez.
- **Kendi iş sırası (`LocalDb`)**: expo-sqlite'ta aynı bağlantıda açık işlem varken başka yerden gelen sorgu o işleme
  katılır (paketin kendi belgesi uyarıyor). Bütün okuma/yazma tek sırada; yazmalar `BEGIN … COMMIT/ROLLBACK`.
  `withExclusiveTransactionAsync` web'de yok ve ikinci bağlantı açar; elendi.
- **Değişiklik bildirimi kendi**: yazılan tablolar SQL'den bulunur (`writtenTable`) ve COMMIT'ten sonra yayımlanır.
  expo-sqlite'ın `addDatabaseChangeListener`'ı satır düzeyinde, işlem sonu bilgisi vermez ve geri almayı bilmez.
- **Tablolar web'deki Dexie deposuyla aynı**: `records` (görünen hâl + sunucu anlık görüntüsü), `outbox`, `meta`.
  Varlık alanları JSON'dır: yeni varlık/alan göç istemez.
- **`outbox.mid` AUTOINCREMENT**: düz `INTEGER PRIMARY KEY`, tablo boşalınca 1'e döner; sunucu o numaraları "daha
  önce işlendi" sayıp ATLAR (veri kaybı). Testle korunur.
- **Göçler `PRAGMA user_version`** ile; her göç ve sürüm numarası tek işlemde (yarıda kalan göç geri alınır).
- **Veritabanı adları kısa** (`cihaz.db`, `yerel.db`, `kullanici-<32 hane>.db`): web'deki wa-sqlite yol uzunluğunu
  64 karakterle sınırlar ve `-journal` eki de sığmalıdır; ilk denemede uzun ad (`havuz-mobil.kullanici.<uuid>.db`)
  girişten sonra "sqlite3_open_v2" hatası verdi. Telefonda her uygulamanın kendi klasörü olduğu için önek gereksiz.
- **Kullanılmayan veritabanı kapatılır** (giriş/çıkışta): web'deki dosya havuzu 6 dosyadır.

## Eşitleme

- **Mantık `shared/`'dan, birebir**: `buildSyncRequest → affectedKeys → planReconcile` tek SQLite işleminde.
  Kanıt: `test/sync/equivalence.test.ts` (12 tohum × 220 adım; SQLite deposu ile `MemoryReplica` her adımda aynı;
  red, erişim kaybı, reset, sayfalama durumlarından geçtiği sayılarak denetlenir) ve `test/sync/conformance.test.ts`.
- **Motor web'deki motorun uyarlaması**; çok sekme kilidi yok (telefonda tek süreç, veritabanı sırası yeter).
- **Tetikleyiciler**: yerel yazma (0,5 sn gecikme), ağ geri gelince (expo-network), ön plana gelince (AppState),
  ön plandayken 60 sn'de bir. **Anlık bildirim (SSE) yok**: telefonda arka planda bağlantı tutmak pil ve işletim
  sistemi kısıtları yüzünden güvenilmez; ön plandaki yoklama + itme bildirimi (ileride) doğru yol. Sınırlar'da yazılı.
- **Gerçek API'ye karşı uygunluk**: 17 ortak senaryo mobilin `ApiClient`'ıyla HTTP üzerinden koşar
  (`test/integration`, `npm run e2e:api`) — 23 Kasım 2026'da 17/17 geçti.

## Oturum ve güvenlik

- **Belirteç kipi** (`X-Auth-Mode: token`, `Authorization: Bearer`): telefonda çerez kavanozu yok; yerel istemci
  `Origin` göndermediği için API'nin CSRF denetimi işi etkilemez.
- **Belirteç `expo-secure-store`'da**, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (kilitliyken okunmaz, yedekle başka telefona
  geçmez). Bellekte bir kopyası tutulur. iOS'ta uygulama silinip yeniden kurulunca Keychain kalabilir: açılışta
  oturum kaydı yoksa belirteç silinir.
- **Web derlemesinde belirteç `localStorage`'da** (`tokenStorage.web.ts`): güvenli depo tarayıcıda yok; web
  derlemesi yalnız deneme/test içindir. Yayında web için `havuz/uygulama` (HttpOnly çerez) kullanılır.
- **Oturum kaydı ayrı küçük veritabanında** (`cihaz.db`); her kullanıcının verisi ayrı veritabanında.

## Arayüz

- **Kendi küçük bileşenleri** (`src/ui`): hazır kütüphane (Paper, Tamagui…) ağır ve erişilebilirlik ayarları
  dağınık. Her denetimde rol + ad + durum; durum hem `accessibilityState` (telefon) hem `aria-*` (web) olarak verilir
  (`a11yState`): React Native Web `accessibilityState`'i okumaz.
- **Simgeler `@expo/vector-icons` (Ionicons)**: Expo Go'da hazır, web'de çalışır, adlar tipli. Simgeler ekran
  okuyucudan gizli; anlamı metin taşır.
- **Tarih seçimi**: hazır seçimler + elle yazma (`17.11.2026`). Yerel takvim seçici (`@react-native-community/
datetimepicker`) web'de ve testte farklı çalışır; eklenmek istenirse yeri `DueField.tsx`.
- **`Alert.alert` yasak** (web'de düğmesiz); yerine `useConfirm` (Modal, Android geri tuşu = Vazgeç).
- **Bildirim (toast) alt düğmeleri örtmez**: ekranın alt bölümü yüksekliğini bildirir (`useToastInset`).
- **Renk karşıtlığı testle**: her metin/zemin çifti ≥ 4,5:1, kenarlar ≥ 3:1 (açık ve koyu).

## Testler

- **Jest + jest-expo + @testing-library/react-native 14** (React 19 için asenkron `render`/`fireEvent`).
  Testlerde Jest'in genel `expect`'i kullanılır: RNTL eşleştiricilerinin tipleri `@jest/globals`'ın `expect`'inde
  görünmüyor.
- **Testte SQLite = Node'un `node:sqlite`'ı** (`process.getBuiltinModule`; Jest'in çözücüsü `node:sqlite` adını
  tanımıyor). `better-sqlite3` derleme ister (GitHub'dan ön derleme indirir; bu ortamda kapalı) — elendi.
- **`vitest` → Jest köprüsü** (`test/support/vitestShim.ts`): ortak sözleşmenin test yardımcısı `vitest`ten içe
  aktarır; köprü sayesinde kopya değiştirilmeden çalışır.
- **Ekran testleri gerçek rotalarla** (`expo-router/testing-library` → `renderRouter('./src/app')`); API sahte
  (`test/support/fakeApi.ts`, `MemoryServer` üstünde).
- **Web duman testi** Playwright ile `expo export` çıktısında; axe taraması (ciddi/kritik bulgu yok) ve 360 px'te
  yatay taşma denetimi. `expo export` her zaman `--clear` ile: Metro önbelleği eski `app.config` değerlerini
  (ör. API_URL) gömülü bırakabiliyor — bu ortamda yaşandı.
- **jest-expo `fetch`'i sahtesiyle değiştirir**: gerçek API testi düz Node ortamında ve `EXPO_PUBLIC_USE_RN_FETCH=1`
  ile koşar (Node'un kendi fetch'i kalır).

## Ortak sözleşme kopyası

- `havuz/uygulama/shared/src` → `shared/` **dosya dosya kopya**; her dosyanın ilk satırı kaynak + tarih;
  `shared/KAYNAK.json` içerik özetlerini tutar. Paket bağı (npm workspace / `file:`) STANDARTLAR §2'ye (bağımsızlık)
  aykırı; kopya, temel havuz dışına taşındığında da çalışır. Kural testi: havuz içindeyken kaynakla birebir aynı,
  dışındayken özetlerle aynı.

## Kapılar

STANDARTLAR §12'de mobil için kapı yok. Önerilen (çakışmasın diye): Metro/Expo 8081 (Expo varsayılanı, değiştirilmedi),
web önizleme `npm run serve:web` → **5320**. Testler boş kapı kullanır.
