# Tarifler — model talimatları

## Bu temel ne yapar

Havuzdaki temelleri birbirine bağlayan uçtan uca tarifler (`<tarif>/`) ve ortak çalıştırıcı (`tarif.py`).
Bir tarif: temelleri yeni bir proje klasörüne kopyalar (`havuz/araclar/yeni_proje.py`), kendi dosyalarını
ekler/yamar, kurar ve gerçek süreçlerle doğrular. **Var olan temellere (`havuz/<temel>/`) asla dokunmaz.**
Çalıştırıcı ve tarif betikleri yalnız Python standart kütüphanesi kullanır (`tarifcik/` paketi).

## Komutlar

Hepsi bu klasörden (`havuz/tarifler/`).

| Komut | Ne zaman |
| --- | --- |
| `.venv/bin/python scripts/check.py` | Her değişiklikten sonra: ruff + biçim + mypy + pytest (~5 sn, ağsız) |
| `.venv/bin/python scripts/check.py --duzelt` | Biçim/lint hatasında önce bunu |
| `python tarif.py bicim` | Yalnız biçim kuralları (sanal ortamsız, saniyeler) |
| `python tarif.py liste` | Tarifleri gör |
| `python tarif.py kur <tarif> <klasör>` | Tarifi yeni bir klasöre uygula (çalışma kopyası) |
| `python <tarif>/dogrula.py <klasör>` | Kurulu çalışma kopyasını doğrula (uzun) |
| `python tarif.py yakala <tarif> <klasör>` | Çalışma kopyasındaki değişiklikleri `<tarif>/dosyalar/`'a yaz |
| `python tarif.py dogrula <tarif>` / `--hepsi` | Geçici klasörde kur + doğrula + sil (uzun; sonucu elle `docs/DOGRULAMA.md`'ye ekleyin) |

Tarayıcılı adımlar için: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Çalıştırıcı alt komutları | `tarif.py` (`KOMUTLAR`, `ayristirici_kur`) |
| Tarif kaydı (`tarif.json` alanları) | `tarifcik/yollar.py` (`Tarif`, `tarif_oku`) |
| Adım kaydı ve özet tablo, JSON çıktısı | `tarifcik/komut.py` (`Gunluk`) |
| Temel kopyalama, npm/uv kurulumu, temelin denetimi | `tarifcik/kurulum.py` |
| Yama üretme/uygulama | `tarifcik/yama.py` |
| `dosyalar/` yerleştirme ve yakalama | `tarifcik/yerlestir.py` |
| Sunucu süreçleri, boş kapı, HTTP istemcisi | `tarifcik/sunucu.py` (`Surec`, `bos_kapi`, `http_istek`) |
| Biçim kuralları | `tarifcik/bicim.py` (+ `tests/test_bicim.py`) |
| uygula.py / dogrula.py ortak kalıbı | `tarifcik/betik.py` |
| Bir tarifin kendisi | `<tarif>/README.md`, `uygula.py`, `dogrula.py`, `dosyalar/` |

## Değişmez kurallar

1. **Havuzdaki temellere dokunma.** Her değişiklik çalışma kopyasında yapılır, `tarif.py yakala` ile
   `dosyalar/`'a alınır. Korur: tarif yerleştirme yalnız hedef klasöre yazar; `tests/test_yerlestir.py`.
2. **Yeni dosya tam hâliyle, değişiklik yama olarak** (`<yol>.patch`). Havuzda var olan bir yolun tam hâli
   konmaz; her yama havuzun bugünkü hâline birebir uygulanmalı. Korur: `tests/test_bicim.py`.
3. **README'de zorunlu bölümler** (`tarifcik/bicim.py → ZORUNLU_BOLUMLER`), "Bu tarif ne zaman YANLIŞ
   seçimdir" dahil; `tarifler/README.md` dizini her tarifi tarif.json'daki süre ve zorlukla listeler.
   Korur: `tests/test_bicim.py::test_depodaki_tarifler_kurallara_uyar`.
4. **Eklenen kod, eklendiği temelin kurallarına uyar** (sözlük, başlık yorumu, kural testleri, test zorunluluğu)
   ve dogrula.py o temelin kendi denetimini koşar (`temeli_denetle`). Korur: her tarifin dogrula.py'si.
5. **Sunucular boş kapıda başlar ve her durumda kapanır** (`with Surec(...)`); sabit kapı yok. Korur: kod incelemesi
   + `tests/test_sunucu.py`.
6. **Sır yok.** Anahtarlar dogrula.py içinde üretilir (`secrets`), yalnız süreç ortamında yaşar; belgelerde yer
   tutucu (`<anahtar>`, `DEGISTIRIN`). `.env` dosyası taşınmaz. Korur: `tests/test_bicim.py` (`.env` yasak).
7. **Görünmez karakter yok** (bütün metin dosyalarında). Korur: `tests/test_bicim.py`.
8. **Yalnız standart kütüphane** (`tarif.py`, `tarifcik/`, betikler). `pyproject.toml → dependencies = []`.
9. **Dürüstlük:** yapılamayan adım `gunluk.atla(ad, neden)` ile "DENENMEDİ" yazılır, geçmiş sayılmaz; README
   "Sınırlar" bunu tekrar eder.

## Tarifler

### Yeni tarif ekle

1. Klasör ve kayıt: `<kisa-ad>/tarif.json` (bir tarifinkini kopyalayın; `ad` = klasör adı, `temeller`,
   `ekKlasorler`, `sure`, `zorluk`: kolay/orta/zor).
2. `uygula.py`: `csvden-tahmin-servisi/uygula.py`'yi kopyalayın; `isler` listesinde temel kopyalama, yerleştirme
   ve kurulum adımları (`node_kur`, `python_kur`).
3. Çalışma kopyası: `python tarif.py kur <kisa-ad> <scratch>/calisma` (dosyalar/ henüz boş, yalnız temeller).
4. Değişikliği **çalışma kopyasında** yapın; temelin kendi denetimini orada yeşile getirin
   (`npm run check` / `scripts/check.py`). Yeni klasörler (`belgeler/`, `yayin/`) `ekKlasorler`'de olmalı.
5. `python tarif.py yakala <kisa-ad> <scratch>/calisma` → `dosyalar/` yazılır (yeni dosyalar + yamalar).
6. `dogrula.py`: `site-iletisim-formu-api/dogrula.py` örnek: temelin denetimi + `with Surec(...)` ile gerçek
   sunucular + `with gunluk.adim(...)` içinde denetimler; ortamda olmayan araç için `gunluk.atla`.
7. `README.md` (zorunlu bölümler) ve `tarifler/README.md` dizinine satır.
8. `python tarif.py dogrula <kisa-ad>` → geçince sonucu `docs/DOGRULAMA.md`'ye ekleyin; `scripts/check.py` yeşil.

### Eskiyen tarifi güncelle (bir temel değişti, yama uygulanmıyor)

1. `scripts/check.py` hangi yamanın hangi parçasının tutmadığını söyler.
2. Temelin bugünkü hâlini kopyalayın: `python ../araclar/yeni_proje.py <temel> <scratch>/calisma/<temel>`
   (tarifin öteki temelleri ve ek klasörleri için de) ve tarifin değişikliğini bu kopyada elle yeniden yapın
   (eski yamayı okuyarak). Yeni dosyalar için `dosyalar/`'daki tam hâli kopyalayın.
3. Temelin denetimini çalıştırın, sonra `python tarif.py yakala <tarif> <scratch>/calisma` ve
   `python tarif.py dogrula <tarif>`.

### Bir tarife adım ekle

`dogrula.py`'de ilgili işleve `with gunluk.adim("ne denetleniyor"):` bloğu; başarısızlık `AssertionError`
fırlatır (ileti ne beklendiğini ve ne geldiğini yazar). README → "Nasıl doğrulanır" listesine satır.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `yama havuzun bugünkü hâline uygulanmıyor` | Temel değişti | "Eskiyen tarifi güncelle" |
| `havuzda bu yolda dosya var; … yama (.patch) olarak taşıyın` | Var olan dosyanın tam hâli konmuş | `tarif.py yakala` kullanın (yamayı kendisi üretir) |
| `yakala`: `… UTF-8 metin değil` | Çalışma kopyasında üretilmiş ikili dosya (veritabanı, görsel) | Silin ya da `tarifcik/yerlestir.py → ATLANAN_ADLAR` |
| `yakala`: `çalışma kopyasında silinmiş dosyalar var` | Tarif bir dosyayı silmiş | Tarifler silmez; dosyayı geri koyun |
| `… zaten var: tarif bu hedefe daha önce uygulanmış olabilir` | Dolu klasöre `kur` | Boş/yeni klasör verin |
| dogrula'da sunucu "kapandı. Günlüğün sonu: …" | Ayar ya da kapı sorunu | Günlük satırını okuyun; temelin README'sindeki ayar tablosu |
| Playwright adımı DENENMEDİ | Chromium bulunamadı | `PLAYWRIGHT_CHROMIUM_EXECUTABLE` verin |
| mypy "Duplicate module named uygula" | Bütün tariflerin betikleri tek seferde verildi | `scripts/check.py` her tarifi ayrı denetler; onu kullanın |

## Bitti tanımı

- [ ] `python tarif.py dogrula <tarif>` geçti; sonuç ve DENENMEDİ adımları `docs/DOGRULAMA.md`'de
- [ ] Eklenen kod temelin kendi denetiminden geçiyor (dogrula.py bunu koşar)
- [ ] `scripts/check.py` yeşil (biçim kuralları, yamaların uygulanabilirliği, görünmez karakter)
- [ ] README'de zorunlu bölümler; komutların beklenen çıktısı gerçek koşudan; "Sınırlar" dürüst
- [ ] `tarifler/README.md` dizini güncel; kalıcı karar `docs/KARARLAR.md`'de
