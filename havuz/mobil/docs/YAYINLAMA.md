# Mağazaya hazırlık ve yayınlama

> **Önemli:** Bu ortamda Android SDK, Xcode, telefon ve Expo hesabı YOK. Yerel derleme (EAS Build, `expo run:*`),
> imzalama ve mağazaya gönderim **denenmedi**. Aşağıdaki adımlar Expo'nun ve mağazaların bilinen işleyişine göre
> yazıldı; "(doğrulanmadı)" işaretli ayrıntıları uygulamadan önce güncel belgeden okuyun (docs.expo.dev,
> developer.apple.com, support.google.com/googleplay). Kurallar sık değişir.

## 1. `app.config.ts` alanları

| Alan                                   | Şu an                     | Ne yapmalı                                                                           |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `name`                                 | `Yapıtaşı`                | Simgenin altındaki ad (~12 karakter). `src/i18n/tr.json` → `app.name` ile aynı tutun |
| `slug`                                 | `havuz-mobil`             | Expo/EAS proje adı (küçük harf, tire)                                                |
| `version`                              | `0.1.0`                   | Kullanıcının gördüğü sürüm; her mağaza yayınında artırın (1.0.0 → 1.0.1)             |
| `ios.bundleIdentifier`                 | `com.ornek.havuzmobil`    | **DEĞİŞTİRİN**: ters alan adı, dünyada tek; yayından sonra değişmez                  |
| `android.package`                      | `com.ornek.havuzmobil`    | **DEĞİŞTİRİN**: aynı kural                                                           |
| `scheme`                               | `havuzmobil`              | Derin bağlantı (`havuzmobil://tasks`)                                                |
| `icon`, `android.adaptiveIcon`         | `assets/*.png`            | `npm run icons` üretir (bkz. §3)                                                     |
| açılış ekranı (`expo-splash-screen`)   | `assets/splash-icon.png`  | Zemin rengi `BRAND_COLOR` (app.config.ts) = `BRAND` (scripts/icons.ts)               |
| `android.permissions`                  | `[]`                      | Tehlikeli izin yok. Yeni izin eklerseniz mağaza formlarını da güncelleyin            |
| `android.blockedPermissions`           | mikrofon, üstte çizim     | Bağımlılıkların istemeden eklediği izinleri engeller                                 |
| `ios.config.usesNonExemptEncryption`   | `false`                   | Yalnız HTTPS kullanılıyor; ihracat (şifreleme) sorusu için (doğrulanmadı)            |
| `ios.infoPlist.NSAppTransportSecurity` | `NSAllowsLocalNetworking` | Geliştirmede yerel ağdaki http API'ye izin; yayında API https olmalı                 |
| `extra.apiUrl`                         | `API_URL` ortamından      | Yayın derlemesinde `eas.json` → `env.API_URL` (https)                                |

Kimlikleri değiştirmenin kolay yolu: `havuz.json` → `yerTutucular` (`havuz-mobil`, `Yapıtaşı`,
`com.ornek.havuzmobil`, `havuzmobil`); yeni projeye kopyalarken `python havuz/araclar/yeni_proje.py mobil <hedef>`.

## 2. Sürüm ve derleme numarası

- `version` (ör. 1.2.0) kullanıcıya görünür. Her mağaza yüklemesinde ayrıca **derleme numarası** artmalıdır
  (iOS `buildNumber`, Android `versionCode`).
- `eas.json` → `"appVersionSource": "remote"` + `"autoIncrement": true`: derleme numaralarını EAS tutar ve artırır;
  `app.config.ts`'e yazmanız gerekmez (doğrulanmadı: ilk kullanımda EAS mevcut numarayı sorabilir).

## 3. Simgeler ve açılış görseli

`npm run icons` → `assets/` (çizim `scripts/icons.ts` içindeki SVG'dir; kopyalanmış görsel yok):

| Dosya                    | Boyut     | Kural                                                                         |
| ------------------------ | --------- | ----------------------------------------------------------------------------- |
| `icon.png`               | 1024×1024 | iOS: saydamlık OLMAZ (zemin dolu); köşeleri sistem yuvarlar                   |
| `adaptive-icon.png`      | 1024×1024 | Android ön plan; çizim ortadaki güvenli alanda (%62), zemin `backgroundColor` |
| `adaptive-icon-mono.png` | 1024×1024 | Android 13+ "temalı simge" (tek renk)                                         |
| `splash-icon.png`        | 512×512   | Açılış ekranının ortası; zemin rengi eklentide                                |
| `favicon.png`            | 48×48     | Yalnız web derlemesi                                                          |

Mağaza sayfası için ayrıca ekran görüntüleri gerekir (boyutları mağazaya göre değişir; doğrulanmadı).
`docs/ekran/` web derlemesinden alınmıştır; mağaza için gerçek telefon/simülatör görüntüsü kullanın.

## 4. EAS Build ve Submit (doğrulanmadı)

EAS, Expo'nun bulut derleme hizmetidir; bilgisayarınızda Xcode/Android Studio gerekmez. Ücretsiz katmanı vardır,
kuyruk süresi değişir.

```bash
npm install -g eas-cli          # ya da her seferinde: npx eas-cli@latest (bu tarihte 27.11.0)
eas login                       # Expo hesabı
eas init                        # projeyi EAS'a bağlar; verdiği projectId'yi app.config.ts → extra.eas.projectId'ye yazın
eas build --platform android --profile preview      # iç dağıtım için APK (telefona doğrudan kurulur)
eas build --platform ios --profile production       # App Store için (Apple geliştirici üyeliği gerekir)
eas submit --platform ios --profile production      # App Store Connect'e yükler
eas submit --platform android --profile production  # Google Play Console'a yükler (ilk yükleme elle yapılabilir)
```

`eas.json`'daki `API_URL` değerlerini kendi https adresinizle değiştirin. Geliştirme derlemesi (`expo-dev-client`)
kurulu değil; gerekirse `npx expo install expo-dev-client` + `eas.json`'a `development` profili.

## 5. İmzalama kavramları

- **Android:** uygulama bir **yükleme anahtarıyla** (keystore) imzalanır; Google Play "Play App Signing" ile kendi
  anahtarıyla yeniden imzalar. EAS anahtarı sizin için üretip saklayabilir (`eas credentials`). Anahtarı kaybetmek
  güncelleme yayınlayamamak demektir; yükleme anahtarı Google desteğiyle sıfırlanabilir (doğrulanmadı).
- **iOS:** ücretli **Apple Developer Program** üyeliği; dağıtım sertifikası + "provisioning profile". EAS bunları
  Apple hesabınızla oluşturup saklayabilir.
- **Sırlar depoya girmez:** `.gitignore` → `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `*.mobileprovision`, `.env`.

## 6. Gizlilik ve hesap silme

- **Hesap silme (zorunlu):** Hesap açılabilen uygulamada hesap **uygulamanın içinden** silinebilmelidir (Apple App
  Store İnceleme Kuralları 5.1.1(v); Google Play hesap silme politikası). Bu temelde var: Ayarlar → Hesap →
  "Hesabımı sil" (`/delete-account`, şifreyle onay; sunucu `DELETE /api/account`). Google Play ayrıca **web'den**
  silme isteği bağlantısı ister (doğrulanmadı): `havuz/uygulama` web uygulamasının hesap sayfasında hesap silme var;
  o adresi Play Console'a yazın.
- **Gizlilik politikası adresi:** her iki mağaza da hesap/veri toplayan uygulamada ister (doğrulanmadı). Politikayı
  web sitenizde yayınlayın (örnek şablon: `havuz/site`).
- **App Store "App Privacy" / Google Play "Data safety" formları** — bu temel için doğru yanıtlar (kendi
  değişikliklerinize göre güncelleyin):
  - Toplanan: ad ve e-posta (hesap için), kullanıcı içeriği (görevler/listeler; sizin sunucunuzda saklanır).
  - İzleme (tracking), reklam, konum, kişiler, kamera, mikrofon: **yok**. Üçüncü taraf analitik: **yok**.
  - Aktarımda şifreleme: API https ise **evet**. Hesapsız kipte veri telefondan çıkmaz.
- **iOS gizlilik bildirimi (PrivacyInfo.xcprivacy):** "gerekçe gerektiren API" kullanımları için Expo modülleri kendi
  bildirimlerini taşır; gerekirse `app.config.ts` → `ios.privacyManifests` (doğrulanmadı).

## 7. Güncellemeler

- **Mağaza güncellemesi:** `version` + derleme numarası artar, yeni derleme, gönderim, inceleme (iOS'ta genellikle
  1–3 gün; doğrulanmadı).
- **OTA (havadan) güncelleme — EAS Update / `expo-updates`:** yalnız JavaScript ve görsellerdeki değişiklikleri
  mağaza incelemesi olmadan telefonlara gönderir. **Sınırları:** yerel kod değişikliği (yeni yerel modül, yeni izin,
  `app.config.ts`'teki yerel ayarlar, Expo SDK yükseltmesi) OTA ile gönderilemez → mağaza güncellemesi gerekir;
  güncelleme yalnız aynı `runtimeVersion`'lı derlemelere gider; mağaza kuralları uygulamanın amacını OTA ile
  köklü değiştirmeyi yasaklar. Bu temelde **kurulu değil**: `npx expo install expo-updates` + `eas update:configure`.
- **Eşitleme protokolü:** sunucuda `PROTOCOL_VERSION` artarsa eski uygulamalar eşitleyemez ve "Uygulamanın yeni
  sürümü gerekiyor" uyarısı görür (veri telefonda kalır). Protokolü artırmadan önce yeni sürümü mağazaya çıkarın.

## 8. Yayın öncesi denetim listesi

- [ ] `app.config.ts` kimlikleri, adı, sürümü sizin; `eas.json` API adresi https.
- [ ] `npm run check`, `npm run e2e`, `npm run e2e:api` yeşil.
- [ ] Gerçek iPhone ve Android telefonda (Expo Go ya da iç dağıtım derlemesi) uçtan uca denendi: kayıt, çevrimdışı
      yazma, ağ gelince eşitleme, çıkış, hesap silme, büyük yazı boyutu, ekran okuyucu (VoiceOver/TalkBack).
- [ ] Gizlilik politikası yayında; mağaza gizlilik formları dolduruldu; web'den hesap silme bağlantısı hazır.
- [ ] Simgeler ve mağaza ekran görüntüleri hazır.
