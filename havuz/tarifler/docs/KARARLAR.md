# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi. Yeni karar en alta eklenir.

## K01 — Çalıştırıcı ve tarif betikleri yalnız standart kütüphane

`tarif.py`, `tarifcik/`, her tarifin `uygula.py` / `dogrula.py`'si ve tariflerin hedefe eklediği yardımcı
betikler (`hat/calistir.py`, `baglanti/dene.py`) yalnız Python standart kütüphanesini kullanır. Neden: sahibi bir
tarifi sanal ortam kurmadan, `python havuz/tarifler/tarif.py …` ile çalıştırabilmeli; tariflerin kurduğu
temellerin kendi ortamları zaten ayrı. `ruff`, `mypy`, `pytest` yalnız bu temelin hızlı denetimi içindir
(`pyproject.toml → dev`, kilit `requirements-dev.lock`). Elenen: `httpx`/`requests` (urllib yetiyor),
Playwright'ı Python'dan sürmek (temellerin kendi `@playwright/test` kurulumu var, aynısını kullanıyoruz).

## K02 — Tarif biçimi: `dosyalar/` = yeni dosya tam, değişiklik yama

Görev metninde kararlaştırılan biçim. Ayrıntılar:

- Var olan bir dosyanın **tam** hâli konmaz, yalnız birleşik fark (`.patch`): okunur (ne eklendiği görünür),
  küçüktür ve temel değişince **eskimesi yakalanır** (hızlı denetim her yamayı havuzun bugünkü hâline
  uygular). Tam dosya konsaydı temel ilerlediğinde tarif sessizce eski bir dosyayı geri getirirdi.
- Yama uygulayıcısı kendimiz (`tarifcik/yama.py`, ~140 satır): `patch`/`git apply` her makinede yok (Windows);
  bizimki katıdır (bağlam birebir tutmalı, satır kayması tolere edilir) ve tutmayan parçada ne yapılacağını
  Türkçe söyler. Gidiş-dönüş testleri `difflib` ile üretilen yamalarla sınar.
- `tarif.py yakala`: tarif yazarı (insan ya da model) değişikliği gerçek bir çalışma kopyasında yapar, temelin
  denetimini orada yeşile getirir, sonra yakalar; yama elle yazılmaz. Yakalama, `yeni_proje.py`'nin atladığı
  yerleri (node_modules, .venv, dist, .data…) ve temelin `kopyalamaHaric` listesini atlar; silinen dosyayı ve
  ikili dosyayı reddeder; `.sh` gibi dosyaların çalıştırma iznini korur.

## K03 — Bu temel kardeş temelleri okur (STANDARTLAR §2'den bilinçli sapma)

Öteki temeller tek başına kopyalanır; `tarifler` kopyalanmaz, çünkü görevi temelleri birbirine bağlamaktır:
`havuz/<temel>/`'i ve `havuz/araclar/yeni_proje.py`'yi okur (içe aktarmaz; alt süreç olarak çalıştırır).
`yeni_proje.py`'nin kopyalama kuralları ve `denetle.py`'nin Python kurulum kuralları `tarifcik/kurulum.py`'de
kaynağı yazılarak yinelenir. Havuz kökü başka yerdeyse `TARIF_HAVUZ` ortam değişkeni.

## K04 — Adlandırma

- `tarifler`'in kendi kodu `havuz/araclar` gibi Türkçe tanımlayıcı kullanır (araç kodu; komutlar Türkçe).
- Bir temele eklenen kod **o temelin** düzenine uyar: `ml-temel`'e eklenen servis İngilizce tanımlayıcılı
  (`PredictionService`, `InputSchema`), metinleri `messages.py`'de; `uygulama`'ya eklenen modüller onun
  kalıbında (routes.ts + service.ts + test + docs/API.md).
- Uç adları ve modül klasörleri görev metnindeki gibi Türkçe: `POST /api/sor` (`modules/sor/`),
  `POST /api/iletisim` (`modules/iletisim/`); sözleşmedeki adları İngilizce (`API_PATHS.ask`, `contact`,
  `askRequestSchema`). Uygulamanın öteki uçları İngilizce yolludur; bu fark bilinçli (görev metni).

## K05 — Sunucuları dogrula.py başlatır; boş kapı; her durumda kapanış

Playwright'ın `webServer`'ı yerine `tarifcik/sunucu.py → Surec` (bağlam yöneticisi): süreç kendi süreç
grubunda başlar, sağlık ucu beklenir, çıkışta SIGTERM → 10 sn → SIGKILL ve gruptaki artık süreçler de
öldürülür. Neden: (1) aynı sunuculara hem Playwright hem Python HTTP denetimleri (CORS, hız sınırı, posta kutusu)
bakar; (2) bir sunucu açılmazsa hata günlüğün son satırlarıyla raporlanır; (3) birden çok temelin sunucusu
tek yerden yönetilir. Kapılar `bos_kapi()` ile seçilir (STANDARTLAR §12). Tarayıcı testleri tek ya da iki
işçiyle koşar (makine paylaşımlı).

## K06 — Belgeye soru: tarayıcı → uygulama API → yz (vekillik)

- Tarayıcı yz'ye doğrudan bağlanmaz: anahtar tarayıcıya inmez, yz `127.0.0.1`'de kalır, oturum/hız sınırı/
  doğrulama uygulamanın kurallarıyla işler. yz anahtarsız da yalnız yerel çalışabilirdi; görev metni ve
  savunma derinliği için **anahtarlı** (`YZ_API_KEY` zorunlu, en az 16 karakter; üretimde düz http yalnız yerel adrese).
- yz'ye ulaşılamaması `500 internal` + özel Türkçe ileti döner, `502/503` değil: web istemcisi (`lib/api.ts →
  toError`) 502–504'ü "ağ hatası" sayar ve kullanıcıya yanlış ileti ("sunucuya ulaşılamadı") gösterirdi.
  Yeni hata kodu eklemek ortak sözleşmede üç yer + belge demekti; ileti yeterli.
- Aynı anda en çok 2 soru (fazlası 429): CPU'da tek model sunucusu boğulmasın. Kullanıcı başına 10 dakikada 20.
- Dış istek için `Deps.fetch` (isteğe bağlı) eklendi: testler gerçek ağa çıkmadan yz'yi taklit eder
  (`harness.ts`'in "yeni bağımlılık" genişletme notu bunu öngörüyor).
- Telefonda alt çubuk en çok 5 öğe (kural testi): Sor sayfası alt çubuğa konmadı, README nasıl konacağını yazar.

## K07 — İletişim formu: ayrı, çerezsiz CORS; CSRF muafiyeti yerine uçta köken denetimi

- `ALLOWED_ORIGINS` (genel CORS) çerezli istek izni verir; tanıtım sitesini oraya eklemek sitedeki bir açığı
  uygulamanın oturumlarına taşırdı. Bu yüzden yalnız bu uca, yalnız `POST`, **çerezsiz** ayrı CORS
  (`CONTACT_ORIGINS`), genel CORS bu adreste atlanır.
- CSRF ara katmanı bu adresi atlar; çünkü uç oturum kullanmaz ve JS kapalı tarayıcının düz form gönderimini
  (JSON değil) kabul eder. Yerine işleyici `Origin`'i kendisi denetler (yabancı site 403).
- İki hız sınırı: IP başına saatte 5 (insan), toplam saatte 100 (çok IP'li saldırı e-posta kotasını bitirmesin).
- İleti saklanmaz, yalnız e-posta: KVKK açısından en az veri. Saklama istenirse README yolu gösterir.

## K08 — Tahmin servisi: standart kütüphane `http.server`

Görev "stdlib ya da FastAPI — kararını yaz" dedi. `ml-temel`'in kuralı çalışma zamanında yalnız numpy
(kural testiyle korunuyor); FastAPI/Pydantic bunu bozardı. Girdi şeması zaten eğitilmiş modelden geliyor
(sütun adları ve türleri model dosyasında), yani sabit bir Pydantic sınıfı yazılamazdı; doğrulama şemadan
kurulur ve Pydantic'in varsayılanından sıkıdır (bilinmeyen alan red, eksik alan red, `NaN` red). `ThreadingHTTPServer`
+ kilit: aynı anda gelen istekler sırayla tahmin edilir. Kapı 8445: STANDARTLAR §12'de ml-temel için kapı yok,
`veri`'nin 8440'ından sonra boş.

## K09 — Kendi modelinle sohbet: yeni görev verisi YAZILMADI, temellere dokunulmadı

- Değerlendirmede yz'nin hazır `gorevler/siniflandirma.yaml` kümesi (`--sinir 5`) kullanıldı: kendi yazdığımız
  bir talimat-yanıt kümesi hem ekip kuralına (eğitim verisi yazma) hem yz'nin "örnek kümeler 10–20 örnek"
  kuralına takılırdı; amaç bağlantıyı ve ölçme hattını kanıtlamak.
- dil-modeli sunucusu `response_format`'ı sessizce yok sayıyor (araçları ise 400 ile reddediyor). Sunucuyu
  değiştirmek (reddetmek) daha doğru bir sözleşme olurdu ama temele dokunmak demekti; tarif bunu ölçüp belgeler
  ve yz profilinde `yapili_kip: kapali` kullanır.
- Ayar dosyasında `localhost` yerine `127.0.0.1`: bazı makinelerde `localhost` önce `::1`'e çözülür, sunucu
  yalnız IPv4 dinler (yz.ornek.yaml'daki `dil_modeli` profili `localhost` yazıyor).

## K10 — Tek sunucuda yayın: systemd + Caddy; doğrulanabilen kadarı doğrulanır

- systemd birimi uygulamayı **doğrudan node** ile başlatır (npm SIGTERM'i iletmeyebilir; uygulamanın kendi
  belgesi de böyle der); veritabanı `StateDirectory=uygulama` (`/var/lib/uygulama`), sertleştirme
  `ProtectSystem=strict` vb. `MemoryDenyWriteExecute` bilerek yok (V8 JIT'i bozar).
- Yedek: var olan `backup.ts`'e `--klasor` ve `--sakla` eklendi (saklama kuralı saf işlev, en yeni 3 yedek hep
  kalır; `Date.UTC`'nin taşan tarihleri kaydırması testle yakalandı ve reddediliyor). Geri yükleme betiği yazıldı,
  çünkü elle geri yüklemede `-wal`/`-shm` dosyalarını unutmak ya da sunucu çalışırken dosyayı değiştirmek veri
  kaybettirir; betik ikisini de engeller ve eski dosyayı silmez.
- Site: sürüm klasörleri + `current` sembolik bağlantısı (tek adımda geçiş, derlemesiz geri dönüş).
- Bu ortamda systemd PID 1 değil ve Caddy kurulamadı (paket deposuna erişim yok): birimler yalnız
  `systemd-analyze verify` ile, Caddyfile hiç doğrulanamadı; README ve DOGRULAMA.md bunları "denenmedi" yazar.

## K11 — Hız sınırı açıkken uçtan uca test

İletişim formu doğrulamasında API `RATE_LIMIT=on` ile çalışır (kötüye kullanım testi bunun için). Bütçe (IP
başına saatte 5) testler arasında paylaşıldığından Playwright tek projeyle ve tek işçiyle koşar, Python
denetimleri ardından gelir; dogrula.py başlığı bütçeyi yazar. Belgeye soru doğrulamasında da hız sınırı açıktır
(kayıt sayısı sınırın altında kalır).
