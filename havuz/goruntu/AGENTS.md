# goruntu — model talimatları

## Bu temel ne yapar

Görüntüyle çalışan ürünler için temel: kullanıcı fotoğrafını güvenle açar (boyut/piksel sınırı, biçim beyaz
listesi, EXIF yönü), kişisel üst veriyi siler, algısal özetle kopya ve eğitim/test sızıntısı bulur, timm
modelleriyle sızıntısız sınıflandırma ince ayarı yapar (kalibrasyon, "emin değilim"), tek dosyalık ONNX
paketi üretir (torch'suz çıkarım), CLIP/SigLIP 2 ile görüntü ve metinle arama yapar, FastAPI sunucusu sunar.
Hepsi `python -m goruntu <komut>` ve TOML yapılandırmasıyla sürülür.

## Komutlar

Hepsi bu klasörden (`havuz/goruntu`) ve sanal ortamın Python'uyla (`.venv/bin/python`) çalışır.

| Komut | Ne yapar |
| --- | --- |
| `uv venv .venv && uv pip install --python .venv/bin/python -r requirements.lock && uv pip install --python .venv/bin/python --no-deps -e .` | kurulum (kilitten) |
| `python scripts/check.py` | ruff + biçim + mypy + pytest (ağsız, ~20 sn) |
| `python scripts/check.py --duzelt` | önce otomatik düzeltme, sonra denetim |
| `python scripts/duman_testi.py` | gerçek modellerle ağlı duman testi (~2,2 GB indirir, birkaç dk) |
| `python scripts/katalog_dogrula.py --yaz` | kataloğu Hugging Face API'siyle doğrular, JSON yazar |
| `python -m goruntu ornek-veri veri/sekiller` | programla deneme kümesi |
| `python -m goruntu egit --hazir cpu-deneme` (`--kuru`, `-D bolum.anahtar=deger`) | eğitim (hazır ayarlar: cpu-deneme, cpu-kucuk, colab-t4) |
| `python -m goruntu degerlendir --model CIKTI [--onnx] [--veri KLASOR]` | test raporu |
| `python -m goruntu disa-aktar --model CIKTI` | `CIKTI/paket/model.onnx` (+ int8) + paket.json |
| `python -m goruntu tahmin --model CIKTI --onnx foto.jpg` | tahmin |
| `python -m goruntu hazirla GIRDI CIKTI --boyut 512` / `temizle GIRDI --cikti KLASOR` | hazırlık / üst veri temizliği |
| `python -m goruntu kopya-bul KLASOR [--tasi KLASOR]` / `sizinti --egitim A --sinama B` | kopyalar / sızıntı |
| `python -m goruntu indeksle KLASOR --dizin D` / `ara METIN --dizin D` / `benzer FOTO --dizin D` | arama |
| `python -m goruntu sun --model PAKET --dizin D` | HTTP sunucusu (127.0.0.1:8465) |

## Harita

| Şunu değiştireceksen… | Şuraya bak |
| --- | --- |
| Yeni komut, komut seçenekleri | `goruntu/commands.py` (kayıt), `goruntu/komutlar/*.py` |
| Kullanıcıya görünen her metin, yardım | `goruntu/messages.py` (tek sözlük) |
| Görüntü açma, sınırlar, biçimler, renk kipleri | `goruntu/hazirlik/loader.py` |
| Üst veri bulma ve temiz kodlama | `goruntu/hazirlik/metadata.py`, toplu iş `hazirlik/batch.py` |
| Modele giren dizi (ön işleme) | `goruntu/hazirlik/model_input.py` (TEK tanım) |
| Algısal özetler, eşikler, gruplar | `goruntu/kopya/hashes.py`, `kopya/scan.py`, `kopya/groups.py` |
| Yapılandırma alanları, hazır ayarlar | `goruntu/siniflandirma/config.py`, `yapilandirma/siniflandirma/*.toml` |
| Veri keşfi, ayrım | `siniflandirma/dataset.py`, `prepare.py`, `split.py` |
| Model kurma, dondurma, kayıt | `siniflandirma/model.py` |
| Eğitim döngüsü, veri artırma | `siniflandirma/train.py`, `loop.py`, `data.py` |
| Ölçütler, kalibrasyon, rapor | `siniflandirma/metrics.py`, `calibration.py`, `evaluate.py`, `report.py` |
| Kuru çalıştırma kestirimi | `siniflandirma/plan.py` |
| ONNX aktarımı, int8, paket üst verisi | `disa_aktar/onnx_export.py`, `disa_aktar/bundle.py` |
| torch'suz çıkarım | `disa_aktar/runtime.py` |
| Gömme modelleri, dizin, arama ölçütleri | `arama/embedders.py`, `arama/index.py`, `arama/build.py`, `arama/evaluate.py` |
| Sunucu uçları ve güvenlik | `sunucu/app.py`, `sunucu/gate.py`, `sunucu/state.py` |
| Model kataloğu | `katalog/modeller.yaml`, `goruntu/catalog.py`, `scripts/katalog_dogrula.py` |
| Tarayıcı örneği | `ornekler/tarayici/index.html`, `docs/TARAYICI.md` |

## Değişmez kurallar

1. Görüntü yalnız `hazirlik/loader.py` ile açılır (`load_rgb`/`open_checked`); başka yerde `Image.open` yok. — `tests/test_rules.py::test_image_open_yalniz_guvenli_yukleyicide`
2. Modele giren dizi yalnız `model_input.prepare` ile üretilir; normalleştirme modelin/ONNX'in içindedir. — `tests/test_model_input.py` (timm ile birebir), `tests/test_onnx.py`
3. Kopyalar ve aynı grup anahtarı aynı ayrım parçasına düşer (sızıntı yok). — `tests/test_split.py`, `tests/test_training.py::test_kopyalar_parcalar_arasinda_bolunmez`
4. Temizlenen dosyada kişisel üst veri kalmaz (bayt düzeyinde denetlenir). — `tests/test_metadata.py`
5. ONNX çıktısı = PyTorch çıktısı (1e-4) ve çalışma zamanı torch yüklemez. — `tests/test_onnx.py`
6. Kullanıcıya görünen metin `messages.py`'de; kullanılan her anahtar var, kullanılmayan yok, yer tutucular uyumlu. — `tests/test_rules.py`
7. `.lower()/.upper()/.title()…` yasak; `text_tr.lower_tr/upper_tr/lower_ascii`. — `test_python_buyuk_kucuk_harf_cagrisi_yasak`
8. torch/timm/transformers/onnx modül başında içe aktarılmaz (yardım anında açılsın). — `test_agir_kutuphane_modul_basinda_ice_aktarilmaz`, `tests/test_cli.py`
9. Her kaynak dosya `Genişletme:` satırlı Türkçe başlıkla açılır, ≤ 300 satır (messages.py hariç), adı ASCII. — `test_kaynak_dosya_basligi_ve_uzunlugu`
10. Hazır ayarlar şemadan geçer, tabanları katalogdadır; katalog saklanan API doğrulamasıyla aynıdır. — `test_hazir_ayarlar_gecerli`, `tests/test_catalog.py`
11. Testler ağsızdır; ağ isteyen test `@pytest.mark.ag` ile işaretlenir (`GORUNTU_AG=1`). — `tests/conftest.py`
12. Yarım iş yok: `TODO`, boş `pass` gövdeli işlev bulunmaz. — `test_yarim_is_yok`
13. Görüntü verisi depoya girmez; örnekler `goruntu/synthetic.py` ile üretilir. — `.gitignore`
14. Arama dizini yalnız kurulduğu gömme modeliyle (ad + sürüm) sorgulanır; tutmazsa açık hata. Gömme tasarımı değişirse adındaki sürümü artırın (`histogram-v2`). — `tests/test_search.py::test_eski_surum_dizin_acik_hatayla_reddedilir`

## Tarifler

### 1. Kendi fotoğraf klasörünle sınıflandırıcı eğit
1. Düzen: `urunler/<sınıf>/*.jpg` (bkz. `docs/VERI_HAZIRLAMA.md`). Büyük fotoğrafları küçült:
   `python -m goruntu hazirla urunler urunler_512 --boyut 512 --bicim jpeg`
2. `python -m goruntu kopya-bul urunler_512` → kopyaları gör; aynı ürünün çok fotoğrafı varsa dosya adı
   kalıbını bul (ör. `urun12_on.jpg` → `-D veri.grup_deseni="^([^_]+)_"`).
3. `python -m goruntu egit --hazir cpu-kucuk -D veri.klasor="urunler_512" --kuru` → plan ve "SIĞAR".
4. Aynı komutu `--kuru` olmadan çalıştır. `ciktilar/cpu-kucuk/rapor.txt` ve `degerlendirme.json` →
   `en_emin_yanlislar` (etiket hatası adayları) incele.
Doğrulama: `rapor.txt` içinde makro F1; `ayrim.json` → `celiskiler` boş olmalı.

### 2. Yeni sınıf ekle
1. `urunler/<yeni_sınıf>/` klasörünü en az ~30 görüntüyle ekle (az ise uyarı çıkar).
2. Yeniden eğit (tarif 1, adım 3-4). Sınıf sırası değişir: eski `model.onnx` yeni etiketlerle KULLANILMAZ.
3. `python -m goruntu disa-aktar --model ciktilar/cpu-kucuk` ile paketi yeniden üret, uygulamadaki dosyayı değiştir.
Doğrulama: `paket.json` → `etiketler` yeni sınıfı içeriyor.

### 3. Başka model dene
1. `python -m goruntu modeller --gorev siniflandirma` → bir kimlik seç (ör. `timm/efficientnet_b0.ra_in1k`).
2. `python -m goruntu egit --hazir cpu-kucuk -D model.taban="timm/efficientnet_b0.ra_in1k" -D egitim.cikti="ciktilar/effnet" --kuru`
3. Kuru plan uygunsa çalıştır; iki çıktının `degerlendirme.json` → `makro_f1` değerlerini karşılaştır.
Katalogda olmayan bir timm modeli: `katalog/modeller.yaml`'a kayıt ekle → `python scripts/katalog_dogrula.py --yaz` → `python scripts/check.py`.
GPU'da tam ince ayar: `--hazir colab-t4` (kip `tam`, önce baş ısınması).

### 4. "Emin değilim" eşiğini ayarla
- Hedef doğruluğa göre: `-D esik.hedef_dogruluk=0.97` ile yeniden eğit (eşik doğrulamada seçilir; doğrulama ≥ 50 örnek olmalı).
- Sabit eşik: `-D esik.sabit_esik=0.8`. Eğitmeden değiştirmek için `model/model.json` → `esik` alanını düzenle, sonra `disa-aktar` ile paketi yeniden üret.
Doğrulama: `python -m goruntu degerlendir --model CIKTI --onnx` → "kapsama" ve "kapsanan örneklerde doğruluk" satırı.

### 5. ONNX ile uygulamaya göm
- Python (torch'suz): `pip install "havuz/goruntu[cikarim]"` (yalnız onnxruntime + pillow + numpy + pydantic +
  pyyaml kurulur; temiz ortamda ~164 MB, denendi — docs/DENEME_KAYDI.md):
  ```python
  from pathlib import Path
  from goruntu.disa_aktar.runtime import OnnxClassifier
  model = OnnxClassifier(Path("model.onnx"))          # etiketler ve ön işleme dosyanın içinde
  sonuc = model.predict_files([Path("foto.jpg")])[0]   # sonuc.etiket None → "emin değilim"
  ```
- HTTP: `python -m goruntu sun --model model.onnx` → `curl -F dosya=@foto.jpg http://127.0.0.1:8465/siniflandir`
- Tarayıcı: `docs/TARAYICI.md`.
Doğrulama: aynı görüntüde `python -m goruntu tahmin --model CIKTI --onnx foto.jpg` ile aynı etiket.

### 6. Kopyaları temizle
1. `python -m goruntu kopya-bul urunler --json kopyalar.json` → grupları incele (ilk satır TUT).
2. `python -m goruntu kopya-bul urunler --tasi yinelenenler` → fazlalar taşınır (silinmez); `yinelenenler/tasima_kaydi.json` geri alma listesidir (`nereye` → `nereden` taşı).
3. Hazır eğitim/test klasörlerinde: `python -m goruntu sizinti --egitim veri/egitim --sinama veri/test` (sızıntı varsa çıkış kodu 1).
Eşik: `--esik 6` daha katı, `--esik 10` daha gevşek (ölçümler `docs/DENEME_KAYDI.md`).

### 7. Fotoğraflardan kişisel veriyi temizle
1. `python -m goruntu temizle gelen --cikti temiz` → `temiz/temizlik_raporu.json` (GPS/kamera/yazar var mıydı).
2. Yerinde (önce yedek al): `python -m goruntu temizle gelen --yerinde` (BMP/TIFF/GIF yerinde temizlenmez).
3. Uygulama içinde: `load_rgb(baytlar)` + `hazirlik.metadata.encode_clean(goruntu, "jpeg")`.
Doğrulama: `tests/test_metadata.py` örneğindeki gibi çıktıda `getexif()` boş.

### 8. Benzer ürün araması kur
1. `python -m goruntu indeksle urunler --dizin dizinler/urunler --model siglip2` (artımlı: yeniden çalıştırınca yalnız yeni dosyalar).
2. `python -m goruntu benzer foto.jpg --dizin dizinler/urunler` ; `python -m goruntu ara "siyah sırt çantası" --dizin dizinler/urunler`
3. Kendi verinde model seçimi: `python -m goruntu arama-olc urunler --model siglip2` ve `--model clip --dil en`.
Doğrulama: `arama-olc` çıktısında `recall@1`, `isabet@1`.

### 9. Yeni komut ekle
`goruntu/commands.py` başlığındaki 4 adım. En yakın örnek: `komutlar/misc.py::ORNEK_VERI`.
Doğrulama: `python scripts/check.py` (yardım testi her komutu otomatik dener).

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "HEIC/HEIF biçimi desteklenmiyor" | iPhone fotoğrafı | Telefonda "En Uyumlu" (JPEG) seç ya da JPEG'e çevir |
| "görüntü çok büyük (… MP)" | 50 MP sınırı (bomba koruması) | Gerçekse `--azami-piksel 100000000` ya da önce küçült |
| Model indirmesi takılıyor | Xet aktarımı | `HF_HUB_DISABLE_XET=1` ile yeniden dene |
| "Veri 3 parçaya bölünemiyor" | Kopyalar/gruplar birleşince çok az grup | Daha çok görüntü; oranları küçült; `kopya_esigi`'ni düşür |
| Test doğruluğu şüpheli yüksek | Sızıntı (aynı ürün iki tarafta) | `grup_deseni` ver; `sizinti` çalıştır |
| "Sıcaklık arama sınırına dayandı" | Model öğrenmemiş ya da doğrulama çok küçük | Daha çok veri/dönem; `cpu-deneme` rastgele modeldir |
| "sıcaklık ölçekleme atlandı" | Doğrulama < 50 örnek | Görüntü ekle ya da `-D veri.dogrulama_orani=0.2` |
| `model.int8.onnx` yok | Evrişimli ağda int8 kazanç sağlamadı | fp32 `model.onnx` kullan (beklenen davranış) |
| "Bu dizin '…' modeliyle kurulmuş" | Dizin başka gömme modeliyle | Yeni `--dizin` klasörü ya da aynı model |
| "metinle arama yapamaz" | Dizin `histogram` ile kuruldu | `--model siglip2` ile yeniden indeksle |
| Uygulamada sonuçlar eğitimdekinden kötü | Ön işleme farkı | `OnnxClassifier` / `model_input.prepare` kullan; elle normalleştirme yapma |
| Sunucu 403 "yerel kipte" | Başka adla/bilgisayardan erişim | `GORUNTU_API_ANAHTARI` ver (docs/AYARLAR.md) |
| Sunucu 413 | Dosya sınırı aşıldı | `sun --azami-mb 50` |
| Eğitim çok yavaş | Büyük fotoğraflar her dönem çözülüyor | `hazirla --boyut 512`; `egitim.isci=2` |
| "-D değeri anlaşılamadı" | Yanlış biçim | `-D bolum.anahtar=deger` (metin değer tırnaklı) |

## Bitti tanımı

- [ ] `python scripts/check.py` yeşil (ruff, biçim, mypy, pytest)
- [ ] Yeni davranışın testi var (ağsız; görüntüler programla üretilir)
- [ ] Kullanıcı metinleri `messages.py`'de, Türkçe, suçlamayan ve ne yapılacağını söyleyen
- [ ] Görüntü okuma `load_rgb` ile; modele giriş `prepare` ile
- [ ] Yeni model katalogda ve `katalog_dogrula.py` temiz
- [ ] GPU'da ya da gerçek veriyle denenmeyen her şey README "Sınırlar"da
- [ ] Yeni karar `docs/KARARLAR.md`'de kısa kayıt olarak var
