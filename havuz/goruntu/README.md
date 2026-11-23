# goruntu — görüntü temeli

Ürünlerinizde görüntüyle çalışmanın zor ve ince kısımları hazır: **kullanıcı fotoğrafını güvenle açmak**
(sıkıştırma bombası, bozuk dosya, yan yatmış telefon fotoğrafı), **kişisel üst veriyi silmek** (GPS konumu,
cihaz seri numarası, EXIF içindeki küçük resim), **kopya ve sızıntı bulmak**, kendi fotoğraf klasörünüzle
**sınıflandırıcı eğitmek** (sızıntısız ayrım, kalibrasyon, "emin değilim"), **tek dosyalık ONNX paketi**
(torch'suz çalışır, tarayıcıda da) ve **benzer ürün / metinle arama** (CLIP, SigLIP 2; Türkçe sorgu).
Her şey CPU'da çalışır; GPU varsa kullanılır.

## 5 dakikada çalıştırma

```bash
cd havuz/goruntu
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.lock      # sürümleri sabit kurulum
uv pip install --python .venv/bin/python --no-deps -e .
.venv/bin/python -m goruntu --yardim
```

`uv` yoksa: `python3 -m venv .venv && .venv/bin/pip install -r requirements.lock && .venv/bin/pip install --no-deps -e .`
Aşağıda `python` = `.venv/bin/python`.

### Kendi fotoğraf klasörünüzle sınıflandırıcı

Klasör düzeni: sınıf başına bir klasör (`urunler/ayakkabı/*.jpg`, `urunler/çanta/*.jpg` …).
Deneme verisi yoksa önce üretin: `python -m goruntu ornek-veri veri/sekiller`.

```bash
python -m goruntu hazirla urunler urunler_512 --boyut 512 --bicim jpeg     # küçült + yön + üst veri temizliği
python -m goruntu kopya-bul urunler_512                                     # kopyaları görün (silmez)
python -m goruntu egit --hazir cpu-kucuk -D veri.klasor="urunler_512" --kuru   # plan, bellek, süre
python -m goruntu egit --hazir cpu-kucuk -D veri.klasor="urunler_512"          # dakikalar sürer
python -m goruntu disa-aktar --model ciktilar/cpu-kucuk                     # tek dosyalık ONNX paketi
python -m goruntu tahmin --model ciktilar/cpu-kucuk --onnx yeni_foto.jpg
```

Sonuç: `ciktilar/cpu-kucuk/rapor.txt` (doğruluk, makro F1, karışıklık matrisi, en çok karışan sınıflar,
kalibrasyon, "emin değilim" kapsaması). İlk koşu modeli indirir (~22 MB). Ağsız, saniyelik deneme:
`--hazir cpu-deneme` (rastgele minik model; hattın çalıştığını gösterir, öğrenmez).
GPU (Colab T4): `--hazir colab-t4` (tam ince ayar).

### Benzer ürün araması

```bash
python -m goruntu indeksle urunler_512 --dizin dizinler/urunler        # ilk koşu SigLIP 2'yi indirir (~1,5 GB)
python -m goruntu benzer musteri_fotografi.jpg --dizin dizinler/urunler -k 5
python -m goruntu ara "kırmızı deri çanta" --dizin dizinler/urunler     # Türkçe metinle arama
python -m goruntu sun --model ciktilar/cpu-kucuk/paket/model.onnx --dizin dizinler/urunler
#   → http://127.0.0.1:8465  POST /siniflandir, POST /ara, POST /benzer
```

### Fotoğraflardan kişisel veriyi silmek

```bash
python -m goruntu temizle gelen_fotograflar --cikti temiz     # rapor: kaç dosyada GPS vardı (değer yazmaz)
```

Denetim (her değişiklikten sonra): `python scripts/check.py` (ağsız, ~20 sn).

## Neler var

| Komut | Ne yapar |
| --- | --- |
| `hazirla`, `temizle` | güvenli açma, EXIF yönü, üst veri temizliği (yeniden kodlama), sığdır/kırp/doldur, küçük resim |
| `kopya-bul`, `sizinti` | aHash/dHash/pHash (sıfırdan; `imagehash` ile birebir), 5 kırpma varyantı, gruplar, iki küme arası sızıntı |
| `egit`, `degerlendir`, `tahmin` | timm modelleri; kopya- ve grup-farkında katmanlı ayrım; veri artırma yalnız eğitimde; baş / tam ince ayar; dengesizlik; erken durdurma; sıcaklık ölçekleme; "emin değilim"; `--kuru` plan + bellek/süre |
| `disa-aktar` | ONNX (+ int8 yalnız işe yarıyorsa), etiketler + ön işleme ONNX dosyasının içinde, PyTorch ile eşdeğerlik ölçümü |
| `indeksle`, `ara`, `benzer`, `sifir-atis`, `arama-olc` | CLIP / SigLIP 2 / modelsiz histogram gömmesi, numpy dizin, recall@k |
| `modeller` | Hugging Face API'siyle doğrulanmış model kataloğu (lisanslarıyla) |
| `sun` | FastAPI sunucusu: gövde sınırı okunmadan önce, piksel sınırı, yerel kip, API anahtarı |

Belgeler: [AGENTS.md](AGENTS.md) (tarifler), [docs/VERI_HAZIRLAMA.md](docs/VERI_HAZIRLAMA.md),
[docs/MIMARI.md](docs/MIMARI.md), [docs/KARARLAR.md](docs/KARARLAR.md),
[docs/DENEME_KAYDI.md](docs/DENEME_KAYDI.md), [docs/TARAYICI.md](docs/TARAYICI.md), [docs/AYARLAR.md](docs/AYARLAR.md).

## Sınırlar

Dürüst liste — burada yazanlar **denenmedi**, **eksik** ya da **yanılabilir**:

- **GPU'da hiç çalıştırılmadı.** CUDA, fp16/bf16 karma duyarlık ve `colab-t4` hazır ayarı yalnız kuru
  çalıştırmayla (plan) sınandı. Bellek ve süre kestirimi bir ölçüm değildir (CPU'da 3 modelle karşılaştırıldı).
- **Kalite iddiası yok.** Gerçek modellerle tek deneme sentetik şekil görüntülerindedir (docs/DENEME_KAYDI.md);
  gerçek ürün fotoğraflarında doğruluk, arama başarısı ve **Türkçe metinle arama ölçülmedi**. SigLIP 2
  Türkçe renk+şekil sorgularında başarılıydı, CLIP Türkçe'de rastgele düzeydeydi.
- **Kopya bulma:** döndürülmüş/aynalanmış kopyalar ve tek kenardan çok kırpılmış kopyalar yakalanmaz;
  aynı ürünün farklı çekimleri "kopya" değildir (grup deseni verin). Arama n²: 20 bin görüntü ~14 sn,
  yüz binlerce görüntü için uygun değil. Düz renkli basit görüntülerde farklı görüntüler kopya sayılabilir.
- **int8:** dinamik nicemleme yalnız MatMul/Gemm'e uygulanır; evrişimli ağlarda (MobileNet, EfficientNet,
  ResNet) kazanç olmadığından int8 dosyası yazılmaz. Statik (ölçüm verili) nicemleme yok.
- **Renk profili:** ICC profili korunur ama model girdisi için sRGB'ye dönüştürülmez (Display P3 fotoğraflarda
  küçük renk kayması). HEIC/HEIF desteklenmez (açık hata verir). Hareketli GIF/WebP'de yalnız ilk kare.
  Pillow'un kendi sınırı yüzünden 179 MP'den büyük görüntü hiç açılmaz.
- **Kalibrasyon:** doğrulama kümesi 50 örnekten küçükse sıcaklık ölçekleme atlanır; "emin değilim"
  eşiği az örnekle güvenilmezdir. Sıfır atış olasılıkları kalibre değildir.
- **Eğitim:** yarıda kalan eğitimi sürdürme, çoklu GPU, CSV/JSONL listesinden veri, çok etiketli
  sınıflandırma yok. Nesne bölgesi kırpma (ürünü fotoğraftan otomatik kesme) yapılmadı.
- **Sunucu:** tek süreç; hız sınırlama (rate limit) ve TLS yok (ters vekil arkasında çalıştırın); 1 MB'ı
  aşan yüklemeler istek süresince geçici dosyada tutulur.
- **Tarayıcı örneği** yalnız masaüstü headless Chromium'da denendi; telefon tarayıcıları, WebGPU denenmedi;
  yeniden boyutlandırmada tarayıcı ile Python arasında küçük farklar olur.
- **Lisans:** katalogdaki ağırlık lisansları doğrulandı, ama timm modelleri ImageNet ile eğitildi; ImageNet
  koşulları araştırma amaçlıdır. Bu bir hukuki görüş değildir; ticari üründe değerlendirin.
- Arama dizini gömme modelinin ADINI saklar, Hugging Face depo sürümünü (commit) saklamaz: depo aynı adla
  güncellenirse eski dizin fark edilmeden uyumsuz kalabilir; model değiştiğinde dizini yeniden kurun.
- Yüz/plaka bulanıklaştırma yok. Windows ve macOS'ta denenmedi.
- Hugging Face indirmesi Xet aktarımında takılırsa `HF_HUB_DISABLE_XET=1` verin.
