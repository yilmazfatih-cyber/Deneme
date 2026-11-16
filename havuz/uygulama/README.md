# Tam yığın uygulama temeli (`uygulama`)

İnternetsiz de çalışan, cihazlar arasında eşitlenen, paylaşılabilen bir web uygulamasının **hazır temeli**.
Örnek olarak bir **görev ve liste** uygulaması içerir; kendi uygulamanızı bu örneği kopyalayıp uyarlayarak ya da
üreteçle yeni veri türleri ekleyerek kurarsınız.

- **Önce cihaz:** her yazma önce telefonda/bilgisayarda saklanır; internet gerekmez. Bağlantı gelince eşitlenir.
- **İki kip:** hesapsız (veriler yalnız bu tarayıcıda; sunucu gerekmez) ya da hesaplı (cihazlar arası eşitleme,
  paylaşımlı alanlar).
- **Kurulabilir uygulama (PWA):** ana ekrana eklenir, internetsiz açılır, yeni sürüm hazır olunca sorar.

## Belgeler

| Belge                                      | İçinde                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                   | model için: komutlar, harita, kurallar, tarifler               |
| [`docs/MIMARI.md`](docs/MIMARI.md)         | parçalar ve veri akışı                                         |
| [`docs/ESITLEME.md`](docs/ESITLEME.md)     | eşitleme protokolü sade Türkçeyle, sınırları                   |
| [`docs/KARARLAR.md`](docs/KARARLAR.md)     | web ve kök araçların teknoloji kararları                       |
| [`docs/API.md`](docs/API.md)               | bütün API uçları, örnekleriyle                                 |
| [`docs/GUVENLIK.md`](docs/GUVENLIK.md)     | oturum, şifre, CSRF, hız sınırı, CSP                           |
| [`docs/YAYINLAMA.md`](docs/YAYINLAMA.md)   | yayınlama (Docker, ters vekil, yedek); ortam değişkenleri §6   |
| [`docs/MEZAR_TASI.md`](docs/MEZAR_TASI.md) | silinen kayıtların ileride güvenle temizlenmesi (tasarım notu) |
| [`api/README.md`](api/README.md)           | API'yi tek başına çalıştırma ve komutları                      |
| [`api/HAZIR.md`](api/HAZIR.md)             | API'yi web ve testlerle bütünleştirme notları                  |
| [`api/TARIFLER.md`](api/TARIFLER.md)       | sunucuya uç / tablo / e-posta ekleme tarifleri                 |
| [`api/KARARLAR.md`](api/KARARLAR.md)       | API'nin teknoloji kararları                                    |

## 5 dakikada çalıştırma

Gereksinim: Node 22.18 ya da üstü (TypeScript'i doğrudan çalıştırır ve yerleşik SQLite'ı kullanır; bu temel
Node 22.23.4 ile denendi). Ortam değişkenlerinin listesi: [`docs/YAYINLAMA.md`](docs/YAYINLAMA.md) §6
(geliştirmede hiçbiri gerekmez).

```bash
cd havuz/uygulama
npm ci                 # bağımlılıklar (bir kez)
npm run dev            # API http://127.0.0.1:8310 + web http://localhost:5310 (Ctrl+C ikisini de kapatır)
```

Tarayıcıda **http://localhost:5310** adresini açın. Karşılama ekranında "Hesap oluştur" ya da "Hesapsız devam
et" seçin. Hazır bir deneme kullanıcısı isterseniz (ikinci bir pencerede):

```bash
npm run seed -w @uygulama/api -- --email deneme@ornek.com --password 'mavi-deniz-kenari-42'
```

Yalnız web'i sunucusuz denemek için: `npm run dev -w @uygulama/web -- --mode yerel` (hesap ekranları gizlenir).

## Neler var

| Bölüm                | Ne yapar                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Görevler ve listeler | Hızlı ekleme, ayrıntı/düzenleme formu, öncelik, son tarih ("Bugün", "Gecikti"), listelere göre gruplama, Türkçe'ye duyarlı arama, sıralama, silme + "Geri al", son silinenler          |
| Hesap                | Kayıt, giriş, şifremi unuttum, şifre sıfırlama (e-postadaki bağlantı), ad, şifre değiştir, verilerimi indir, çıkış ("bu cihazdaki veriyi de sil"), bütün cihazlardan çıkış, hesabı sil |
| Hesaba taşıma        | Hesapsız yazılan kayıtlar ilk girişte tek dokunuşla hesaba taşınır                                                                                                                     |
| Çalışma alanları     | Kişisel alan + paylaşımlı alanlar; üyeler ve roller (sahip / düzenleyen / izleyici), davet bağlantısı (kopyala/paylaş), alandan ayrılma; izleyici yazamaz                              |
| Eşitleme             | Çevrimdışı yazma, otomatik gönderme, anlık bildirim, çok sekme, red/erişim kaybı/sunucu yedekten dönme durumları, durum göstergesi                                                     |
| Ayarlar              | Tema (sistem/açık/koyu), yazı boyutu, yüksek karşıtlık, hareketi azalt; JSON dışa/içe aktarma; eşitleme durumu ve "Şimdi eşitle"; kalıcı depolama; yöneticiye kullanıcı yönetimi       |
| Bileşenler           | Düğme, form alanları, pencere, onay penceresi, bildirim (eylemli), menü, sekmeler, rozet, kart, boş durum, yükleniyor; canlı örnekler geliştirmede `/#/katalog`                        |
| Üreteçler            | `npm run gen -- entity …` (yeni veri türü uçtan uca), `page …`, `migration …`                                                                                                          |
| Testler              | Birim/bileşen (sahte sunucuyla), kural testleri, uçtan uca (gerçek API + derlenmiş web, üç ekran boyutu, erişilebilirlik taraması)                                                     |

Ekran görüntüleri: [`docs/ekran/`](docs/ekran) (390×844 ve 1280×800; açık ve koyu tema).

## İki kip, iki yayın biçimi

| Kip      | Derleme                                   | Nerede yayınlanır                                                         | Veri                            |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| Hesapsız | `npm run build:yerel` → `web/dist-yerel/` | Herhangi bir durağan barındırma (GitHub Pages, Netlify…), alt klasörde de | Yalnız o tarayıcıda (IndexedDB) |
| Hesaplı  | `npm run build` → `web/dist/` + API       | Tek servis: API web'i de sunar ([`docs/YAYINLAMA.md`](docs/YAYINLAMA.md)) | Sunucuda + her cihazda kopya    |

API başka bir alan adındaysa web'i `VITE_API_URL=https://api.ornek.com npm run build` ile derleyin; oturum o
zaman çerez yerine belirteçle taşınır (riskleri: [`docs/KARARLAR.md`](docs/KARARLAR.md) → Kimlik).

## Komutlar (bu klasörden)

| Komut                 | Ne yapar                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| `npm run dev`         | API + web geliştirme sunucuları (önekli çıktı, Ctrl+C ikisini kapatır) |
| `npm run build`       | Web'i derler (`web/dist`)                                              |
| `npm run build:yerel` | Hesapsız derleme (`web/dist-yerel`)                                    |
| `npm start`           | API'yi başlatır (üretim)                                               |
| `npm run check`       | Tip denetimi + lint + biçim + bütün birim testler (ağsız)              |
| `npm run e2e`         | İki derleme + uçtan uca testler (gerçek API, Chromium)                 |
| `npm run shots`       | `docs/ekran/` ekran görüntülerini yeniden üretir                       |
| `npm run gen -- …`    | Üreteç (bkz. AGENTS.md)                                                |
| `npm run test:gen`    | Üretecin kanıt testi (geçici kopyada üretir, derler, test eder)        |
| `npm run icons`       | `web/public/icon.svg` dosyasından PWA simgelerini üretir               |
| `npm run format`      | Bütün dosyaları biçimlendirir                                          |

Uçtan uca testler önceden kurulu bir Chromium ile: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chromium npm run e2e`.

## Klasörler

```
shared/     ortak sözleşme: varlık şemaları, API şemaları, eşitleme protokolü (sunucu ve web aynı kodu kullanır)
api/        sunucu: kimlik, alanlar, davetler, eşitleme, e-posta (Hono + node:sqlite) — api/README.md
web/        tarayıcı uygulaması (React + Vite + Dexie + Tailwind)
  src/app/        rotalar, kabuk, erişim denetimi
  src/features/   özellikler (görevler, hesap, alanlar, ayarlar, eşitleme, katalog)
  src/ui/         arayüz bileşenleri
  src/lib/        yerel depo, eşitleme motoru, oturum, API istemcisi, tarih, görünüm, PWA
  src/i18n/       arayüz metinleri (tr.json)
  test/           birim, bileşen ve kural testleri
e2e/        uçtan uca testler (Playwright)
scripts/    üreteç, geliştirme sunucusu, simge üretici
docs/       belgeler ve ekran görüntüleri
```

## Sınırlar

- **Denenmedi:** Safari, Firefox ve gerçek telefonlar (yalnız Chromium ile otomatik test edildi). iOS
  Safari'de IndexedDB ve servis çalışanı davranışı farklı olabilir (ör. uzun süre açılmayan sitenin verisini
  silebilir; Ayarlar → "Kalıcı depolama iste" bunu azaltır ama garanti etmez).
- **Belirteç kipi (API başka alan adında) uçtan uca test edilmedi**; birim testlerle denendi. Önerilen yayın tek
  servistir.
- **Aynı alana eşzamanlı yazmada biri kazanır** (alan düzeyinde son yazan kazanır); ortak metin düzenleme yok.
  Ayrıntı ve öteki sınırlar: [`docs/ESITLEME.md`](docs/ESITLEME.md) → "Sınırlar".
- **Sürükle-bırak sıralama yok;** yerine menüde klavyeyle de çalışan "Yukarı/Aşağı taşı" var (sıra numarası iki
  komşunun ortalamasıdır, yalnız taşınan kayıt değişir).
- **Fotoğraf eki ve son tarih hatırlatması (bildirim) yok.** Görevde yazılmadı; eklemek için önce API'de dosya
  ucu gerekir.
- **Her açık sekme kendi anlık bildirim bağlantısını tutar** (turlar yine de tek sekmede sırayla koşar).
- **Tarih kutusu tarayıcının kendi denetimidir;** biçimi (ör. `17.11.2026` ya da `11/17/2026`) tarayıcının
  diline göredir.
- **Paket boyutu:** derlenmiş JavaScript ~630 KB (gzip ~190 KB; `npm run build` çıktısından). İlk açılıştan sonra
  önbellekten gelir; daha küçük gerekiyorsa sayfalar tembel yüklemeye (`React.lazy`) çevrilebilir.
- **Koyu tema ilk boyamada:** "Koyu" elle seçildiyse sayfa açılırken bir an açık tema görünebilir (satır içi
  betik CSP yüzünden bilerek yok); "Sistem" seçiliyken görünmez.
