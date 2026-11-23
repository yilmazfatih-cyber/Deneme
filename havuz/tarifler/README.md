# Tarifler — temelleri birbirine bağlayan uçtan uca kurulumlar

Havuzdaki her temel tek başına çalışır ve testlidir. Asıl zorluk iki temeli **birbirine bağlamaktır**:
uygulamaya yapay zekâ özelliği eklemek, siteyi API'ye bağlamak, kendi modelini bir istemciye bağlamak.
Kapılar, kimlik, CORS, sözleşme ve sürüm uyumu en çok burada bozulur. Buradaki her tarif bir bağlantıyı bir
kez doğru kurar ve **gerçekten çalıştırılarak** kanıtlar: temeller geçici bir klasöre kopyalanır, tarifin
dosyaları eklenir, temellerin kendi denetimleri ve tarifin uçtan uca testi (gerçek süreçler, boş kapılar)
koşar. Var olan temellere (`havuz/<temel>/`) hiçbir tarif dokunmaz.

## Dizin

| Tarif | Temeller | Süre (doğrulama) | Zorluk | Ne kurar |
| --- | --- | --- | --- | --- |
| [belgeye-soru-uygulamasi](belgeye-soru-uygulamasi/) | uygulama + yz | ~1,5 dk | zor | Uygulamaya **Sor** sayfası: oturumlu, hız sınırlı `POST /api/sor` → yerel, anahtarlı yz RAG ucu; yükleniyor/hata/boş/çevrimdışı durumları |
| [site-iletisim-formu-api](site-iletisim-formu-api/) | site + uygulama | ~3 dk | orta | Sitenin iletişim formu → herkese açık `POST /api/iletisim`: köken izin listesi (CORS + Origin), bal küpü, hız sınırı, yöneticiye e-posta; JS kapalıyken de |
| [kendi-modelinle-sohbet](kendi-modelinle-sohbet/) | dil-modeli + yz | ~1 dk | kolay | dil-modeli'nin OpenAI uyumlu sunucusu ↔ yz istemcisi; `sohbet`, `degerlendir`, sözleşme ölçümü ve dürüst yorum |
| [csvden-tahmin-servisi](csvden-tahmin-servisi/) | veri + ml-temel | ~1 dk | orta | Kirli sentetik veri → profil → temizlik → sızıntısız model → pickle'sız, şema doğrulamalı HTTP tahmin servisi |
| [tek-sunucuda-yayin](tek-sunucuda-yayin/) | uygulama + site | ~2 dk | zor | systemd birimleri, Caddy, `VACUUM INTO` yedeği + saklama, geri yükleme betiği ve tatbikatı, sağlık denetimi, güncelleme |

Süreler bu makinede (4 çekirdek, paylaşımlı; npm/uv önbellekleri dolu) ölçülen tam doğrulama süreleridir
(kurulum + doğrulama): `docs/DOGRULAMA.md`. Önbellek boşken kurulum adımları uzar.

## Nasıl kullanılır

Yalnız Python standart kütüphanesi gerekir (depo kökünden):

```bash
python havuz/tarifler/tarif.py liste                                    # tarifler, temeller, süre, zorluk
python havuz/tarifler/tarif.py kur belgeye-soru-uygulamasi ~/projeler/sor   # yeni proje klasörüne uygula + kur
python havuz/tarifler/belgeye-soru-uygulamasi/dogrula.py ~/projeler/sor     # kurulan projeyi doğrula
python havuz/tarifler/tarif.py dogrula csvden-tahmin-servisi            # geçici klasörde kur + doğrula + sil
python havuz/tarifler/tarif.py dogrula --hepsi --json /tmp/tarif-sonuc.json   # bütün tarifler (~8 dk)
```

Tarayıcı isteyen doğrulamalar Chromium'u `PLAYWRIGHT_CHROMIUM_EXECUTABLE` değişkeninden (yoksa
`/opt/pw-browsers/chromium`) alır; bulunamazsa o adım "DENENMEDİ" yazılır. `dogrula` geçici klasörü
`--calisma <klasör>` (ya da `TARIF_CALISMA`) altında açar; `--tut` verilirse silmez.

Kurulan proje bir klasördür: içinde kopyalanan temeller (`uygulama/`, `yz/`…) ve tarifin eklediği klasörler
(`belgeler/`, `yayin/`…) durur. Her temel kendi README ve AGENTS dosyasıyla gelir; tarifin eklediği her şey
o temelin kurallarına uyar ve kendi denetimini geçer.

## Bir tarifin içi

```
<tarif>/
  README.md     amaç, temeller, ön koşullar, adım adım (komut + beklenen çıktı), doğrulama, sık sorunlar,
                küçük modele yaptırırken, "ne zaman YANLIŞ seçim", sınırlar
  tarif.json    ad, başlık, temeller, ek klasörler, süre, zorluk (tarif.py liste bunu okur)
  dosyalar/     <temel>/<yol>           eklenen dosyanın TAM hâli
                <temel>/<yol>.patch     var olan dosyaya birleşik fark (havuzun bugünkü hâline uygulanır)
                <ek-klasör>/<yol>       temel olmayan yeni klasörün dosyaları
  uygula.py     temelleri kopyalar (havuz/araclar/yeni_proje.py), dosyalar/'ı yerleştirir, kurar
  dogrula.py    temellerin denetimi + uçtan uca test; özet tablo (GEÇTİ / KALDI / DENENMEDİ)
```

Yamalar okunur: `dosyalar/uygulama/api/src/app.ts.patch` neyin nereye eklendiğini satır satır gösterir.
Hızlı denetim (`python scripts/check.py`) her yamanın havuzun **bugünkü** hâline uygulandığını sınar: bir
temel değişip tarif eskidiyse saniyeler içinde kırmızı olur.

Yeni tarif yazmak ya da eskiyen bir tarifi güncellemek: [`AGENTS.md`](AGENTS.md). Kararlar:
[`docs/KARARLAR.md`](docs/KARARLAR.md). Son doğrulama koşusu: [`docs/DOGRULAMA.md`](docs/DOGRULAMA.md).

## Denetim

```bash
cd havuz/tarifler
uv venv .venv && uv pip install --python .venv/bin/python -r requirements-dev.lock
uv pip install --python .venv/bin/python --no-deps -e .
.venv/bin/python scripts/check.py        # ruff + biçim + mypy + pytest (biçim kuralları, yama uygulanabilirliği)
```

Hızlı denetim ağsızdır ve tarifleri kurmaz (~5 sn). Uzun denetim (`havuz.json → uzunDenetim`):
`python tarif.py dogrula --hepsi` (ağ ister: `npm ci`, PyPI; bu makinede, paket önbellekleri doluyken ~8 dk).

## Sınırlar

- Tarifler bu ortamda (Linux, Node 22.23.4, Python 3.13, yalnız CPU, Chromium) doğrulandı; Windows ve macOS'ta
  **denenmedi** (süreç grupları ve `bash` betikleri POSIX varsayar).
- Gerçek dış hizmetler (e-posta sağlayıcısı, bulut model, alan adı + HTTPS, systemd'li sunucu, Caddy) kullanılmadı;
  her tarifin "Sınırlar" bölümü neyin denenmediğini tek tek yazar.
- `tarifler`, öteki temellerin aksine tek başına kopyalanmaz: kardeş temelleri ve `havuz/araclar/yeni_proje.py`'yi
  okur (görevi bu). Havuz kökü farklıysa `TARIF_HAVUZ` ortam değişkeniyle verilir.
- Bir temel değişirse yamalar eskiyebilir; hızlı denetim bunu yakalar ama düzeltmesi elle yapılır (AGENTS.md →
  "Eskiyen tarifi güncelle").
- Tarifler aynı temele ayrı ayrı uygulanır; ikisini aynı projede birleştirmek (ör. Sor sayfası + iletişim formu)
  **denenmedi**: ortak dosyalarda (`app.ts`, `config.ts`, `docs/API.md`) yamalar çakışabilir, elle birleştirilir.
