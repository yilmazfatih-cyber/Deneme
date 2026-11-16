# Bilgisayarınızı hazırlamak

Temelleri kendi bilgisayarınızda çalıştırmak için dört araç gerekir. Hepsi ücretsizdir ve bir kez kurulur.

| Araç    | Ne işe yarar                                    | Hangi temeller ister                           |
| ------- | ----------------------------------------------- | ---------------------------------------------- |
| Git     | Depoyu indirmek, değişiklikleri kaydetmek        | hepsi                                          |
| Node.js | JavaScript/TypeScript çalıştırmak (`npm`)        | uygulama, site, kutuphane (ts), sifirdan/arayuz |
| Python  | Python çalıştırmak                               | yz, dil-modeli, ince-ayar, ml-temel, veri, algoritma, sifirdan, bilgi araçları |
| uv      | Python paketlerini hızlı kurmak (isteğe bağlı)   | Python temelleri (yoksa `pip` kullanılır)       |

> Bu rehberdeki adımlar Linux'ta denendi; Windows ve macOS adımları resmî kurulum yollarına dayanır ama bu ortamda
> **denenmedi**. Bir adım farklı görünürse kurulum sayfasındaki güncel yönergeyi izleyin.

## 1. Kurulum

**Git** — git-scm.com adresinden işletim sisteminize uygun kurucuyu indirin. macOS'ta Terminal'de `git --version`
yazınca kurulum önerilir. Linux'ta paket yöneticinizle (`sudo apt install git`).

**Node.js** — nodejs.org adresinden **LTS** sürümünü indirin. Temeller en az Node 22.18 ister (site temeli biraz
daha yenisini: `havuz/site/havuz.json`). Linux ve macOS'ta sürüm yöneticisi (nvm, fnm) de kullanılabilir.

**Python** — python.org adresinden 3.11 ya da daha yeni bir sürümü indirin. **Windows'ta kurucunun ilk ekranında
"Add python.exe to PATH" kutusunu işaretleyin.**

**uv** (isteğe bağlı ama önerilir) — Python kurulduktan sonra:

```bash
python -m pip install uv
```

## 2. Doğrulama

Yeni bir terminal açın (kurulumdan önce açık olanlar yeni yolları görmez) ve şunları çalıştırın:

```bash
git --version
```

```bash
node -v
```

```bash
python --version
```

Her biri bir sürüm numarası yazmalıdır. `python` bulunamazsa `python3` deneyin (macOS ve Linux'ta ad budur);
Windows'ta `py` de çalışır. Bu rehberdeki ve temellerdeki `python` komutlarında aynı değişikliği yapın.

## 3. Depoyu indirmek

```bash
git clone https://github.com/<kullanıcı-adınız>/<depo-adı>.git
```

```bash
cd <depo-adı>
```

Depo gizliyse GitHub sizden giriş ister; tarayıcıdan giriş yapan "Git Credential Manager" Windows kurucusunda vardır.

## 4. İlk denetim

Her şeyin çalıştığını görmek için bir temeli kurup denetleyin (ilk kurulum internetten paket indirir; birkaç dakika
sürebilir):

```bash
python havuz/araclar/denetle.py kutuphane --kur
```

Sonda `Hepsi yeşil` yazmalıdır. Bütün temeller için `kutuphane` yerine bir şey yazmayın; Python temellerinin bazıları
(dil-modeli, ince-ayar) PyTorch indirir ve birkaç GB yer kaplar.

## 5. Bir temeli çalıştırmak

| Temel      | Komut (temelin klasöründe)                   | Sonra                                  |
| ---------- | -------------------------------------------- | -------------------------------------- |
| uygulama   | `npm ci` sonra `npm run dev`                 | tarayıcıda `http://localhost:5310`     |
| site       | `npm ci` sonra `npm run dev`                 | tarayıcıda `http://localhost:4410`     |
| yz         | README'deki kurulum, sonra `python -m yz sun --saglayici sahte` | tarayıcıda `http://127.0.0.1:8420` |

Python temellerinde sanal ortamı etkinleştirmek gerekir (her yeni terminalde bir kez):

```bash
source .venv/bin/activate
```

Windows'ta (PowerShell) bunun yerine `.venv\Scripts\Activate.ps1`. Komut istemi "betik çalıştırma kapalı" derse
PowerShell'de bir kez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` yazın.

## Sık sorunlar

| Belirti                                        | Neden                                        | Çözüm                                                            |
| ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `npm` / `node` bulunamadı                      | Kurulumdan önce açılmış terminal             | Terminali kapatıp açın; olmazsa bilgisayarı yeniden başlatın     |
| `EACCES` ya da izin hatası (`npm`)             | Sistem klasörüne kurmaya çalışıyor           | `sudo` kullanmayın; Node'u nodejs.org kurucusu ya da nvm ile kurun |
| `EADDRINUSE` / "adres kullanımda"              | Aynı kapıyı önceki bir çalıştırma tutuyor    | Öteki terminali kapatın ya da bilgisayarı yeniden başlatın       |
| Python paket kurulumu çok uzun sürüyor         | PyTorch gibi büyük paketler                  | Bekleyin; disk alanına bakın; `uv` daha hızlıdır                 |
| Windows'ta Türkçe karakterler bozuk görünüyor  | Terminal kodlaması                           | Windows Terminal kullanın; `chcp 65001` ile UTF-8'e geçin         |
| Dosya yolu çok uzun hatası (Windows)           | Windows'un eski yol sınırı                    | Depoyu kısa bir klasöre (ör. `C:\proje`) indirin                 |

## İlgili

- Küçük bir modelle çalışmak: [`KUCUK_MODELLE_CALISMA.md`](KUCUK_MODELLE_CALISMA.md)
- Hazır istemler: [`ISTEMLER.md`](ISTEMLER.md)
