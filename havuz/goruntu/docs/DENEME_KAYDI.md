# Deneme kaydı

Bu temelde **gerçekten çalıştırılmış** her şey ve ölçümü burada. Burada yazmayan (GPU, gerçek ürün
fotoğrafları, Windows/macOS, tarayıcıda çalıştırma) DENENMEDİ — README "Sınırlar".

## Ortam (23 Kasım 2026)

- Linux, 4 çekirdek, 15 GB bellek, GPU yok. **Paylaşımlı makine**: ölçümler sırasında yük ortalaması 4–9
  arasıydı (başka işler koşuyordu); süreler bu yüzden olduğundan uzun olabilir.
- Python 3.13.18; torch 2.15.0 (CPU), torchvision 0.29.2, timm 1.0.31, transformers 5.24.0, onnx 1.23.2,
  onnxruntime 1.32.0, onnxscript 0.7.2, pillow 13.0.0, numpy 2.5.5 (`requirements.lock`).
- Hugging Face indirmeleri `HF_HUB_DISABLE_XET=1` ile yapıldı.

## Hızlı denetim (ağsız)

`python scripts/check.py` → ruff + biçim + mypy + **272 test geçti, 6 ağ testi atlandı**, toplam ~20 sn
(sıcak önbellekle). Temiz kurulumdan ölçüm için bkz. son bölüm.

## Ağlı duman testi (`python scripts/duman_testi.py`, GORUNTU_AG=1)

6 test geçti, 137 sn (modeller önbellekteyken; ilk koşu ~2,2 GB indirir, 31 MB/sn ağda ~1,5 dk ek).
Ham sonuç: `ciktilar/duman_raporu.json` (depoya girmez). Veri: `goruntu.synthetic` ile üretilmiş
3 sınıf (daire/kare/üçgen) × 40 görüntü, 160 px, %10 yakın kopya → 137 görüntü; ayrım 96/20/21.
**Sentetik düz şekiller kolaydır; aşağıdaki doğruluklar gerçek ürün fotoğrafları için kalite iddiası değildir.**

### Sınıflandırma (cpu-kucuk hazır ayarı: yalnız baş eğitimi, 8 dönem, 2 iş parçacığı)

| Taban | Eğitim süresi | Test doğruluk / makro F1 | ONNX fp32 en büyük logit farkı | int8 |
| --- | ---: | --- | ---: | --- |
| timm/mobilenetv3_large_100.ra_in1k | 51,5 sn* | 0,952 / 0,952 | 2,5e-5 | yazılmadı (yalnız %2,5 küçülüyor) |
| timm/vit_tiny_patch16_224.augreg_in21k_ft_in1k | 19,2 sn (erken durdu, 5. dönem) | 1,000 / 1,000 | 8,6e-6 | 23,3 MB → 6,3 MB (%73), 16 örnekte karar uyumu %100, en büyük logit farkı 1,08 |

\* Aynı eğitim ilk koşuda 21,9 sn sürdü; fark makine yükünden.
ONNX paketiyle test kümesi yeniden ölçüldüğünde doğruluk PyTorch'la aynı çıktı (0,952 ve 1,000).

### Bulgu 1 — evrişimleri dinamik int8'e çevirmek MobileNetV3'ü bozuyor

İlk koşuda `quantize_dynamic` bütün işlemleri nicemliyordu: MobileNetV3'te 16 örnekte karar uyumu
**%62,5**, en büyük logit farkı 10,4 çıktı. Ayrı denemede (48 sentetik görüntü, ImageNet ağırlıklı
MobileNetV3 + rastgele baş):

| Nicemleme | Karar uyumu | En büyük logit farkı | Boyut |
| --- | ---: | ---: | ---: |
| bütün işlemler, tensör başına QInt8 | %39,6 | 17,5 | 4,6 MB |
| bütün işlemler, kanal başına QInt8 | %39,6 | 17,5 | 4,6 MB |
| bütün işlemler, kanal başına QUInt8 | %29,2 | 18,3 | 4,6 MB |
| yalnız MatMul/Gemm | %100 | 0,15 | 17,3 MB (küçülme yok) |

Karar: yalnız MatMul/Gemm nicemlenir; %20'den az küçültüyorsa int8 dosyası yazılmaz; uyum %98'in
altındaysa paket "önerilmez" diye işaretlenir (docs/KARARLAR.md K08).

### Bulgu 2 — az doğrulama verisiyle sıcaklık ölçekleme kalibrasyonu bozabiliyor

İlk koşuda 20 doğrulama görüntüsüyle öğrenilen sıcaklık T = 1,67, testte ECE'yi **0,125 → 0,167**, NLL'yi
0,216 → 0,238 kötüleştirdi. Karar: doğrulama 50 örnekten azsa sıcaklık öğrenilmez (T = 1) ve uyarı yazılır
(K09). İkinci koşuda uyarı çıktı, ECE 0,125'te kaldı. 21 test örneğiyle ECE'nin kendisi de gürültülüdür.

### "Emin değilim" eşiği (hedef doğruluk 0,95)

MobileNetV3: doğrulamada eşik 0,978 seçildi → testte kapsama %57,1, kapsanan örneklerde doğruluk 1,0.
ViT-Tiny: eşik 0,583 → kapsama %100. İkisinde de "yalnız 20 örnekle seçildi, güvenilirliği düşük" uyarısı çıktı.

### Kuru çalıştırma: colab-t4 (indirme yok)

efficientnet_b0, tam ince ayar, yığın 64: tahmini bellek 3,7–9,4 GB → "15 GB'a SIĞAR"; 4.011.391
parametre; 0,77 GFLOP/görüntü. **T4'te çalıştırılmadı**; bellek aralığı bir kestirimdir.

### Gömme ve arama (60 görüntü: 3 şekil × 4 renk × 5; 224 px)

| Ölçüt | CLIP ViT-B/32 (laion) | SigLIP 2 base/32-256 |
| --- | ---: | ---: |
| Görüntü→görüntü recall@1 (sınıf = şekil) | 1,000 | 1,000 |
| Görüntü→görüntü recall@1 (sınıf = renk) | 0,967 | 1,000 |
| **Türkçe** metin ("kırmızı daire") isabet@1 / kesinlik@5 | 0,333 / 0,300 | **1,000 / 1,000** |
| İngilizce metin ("a red circle") isabet@1 / kesinlik@5 | 1,000 / 1,000 | 1,000 / 1,000 |
| Sıfır atış, şekil, Türkçe etiket + şablon | 0,333 (rastgele düzey) | 0,667 |
| Sıfır atış, şekil, İngilizce etiket + şablon | 1,000 | 1,000 |
| Görüntü başına gömme süresi (CPU, 2 iş parçacığı, yüklü makine) | 0,045–0,067 sn | 0,054–0,109 sn |

Yorum (dürüst): SigLIP 2 Türkçe renk+şekil sorgularını bu kolay kümede doğru buldu; CLIP'in metin
kodlayıcısı Türkçe'yi anlamıyor. Türkçe tek sözcüklük şekil etiketlerinde ("kare", "daire") SigLIP 2'nin
sıfır atış başarısı İngilizceden düşük (0,667). **Gerçek ürün fotoğraflarında ve uzun Türkçe sorgularda
ölçülmedi.** Komut satırından `indeksle --model siglip2` + `ara "kırmızı üçgen"`: ilk iki sonuç kırmızı
üçgen, üçüncüsü kırmızı kare.
Uyarı (zararsız): SigLIP 2 yüklenirken transformers "bos_token_id … between 0 and 31999" uyarısı yazıyor;
depodaki `config.json` metin yapılandırmasında yalnız `vocab_size` var, sonuçlar etkilenmedi.

## Algısal özet: eşik seçimi deneyi

60 sahne (`synthetic.scene_image`, 320×240) ve 60 şekil görüntüsü; her birine dönüşüm uygulanıp özgün
özetle Hamming uzaklığı ölçüldü (en büyük / %95'lik).

| pHash | Farklı görüntüler en küçük | ½ küçültme | JPEG q30 | %5 kırpma (her kenar) | %10 kırpma | tek kenardan %10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tek özet, sahneler | 14 | 2 | 2 | **20** | 32 | 24 |
| 5 kırpma varyantı (1,0/0,95/0,9/0,85/0,8), sahneler | 12 | 0 | 0 | 0 | 0 | 16 |

Karar: 5 merkez-kırpma varyantı, "birinin tamamı ↔ ötekinin herhangi bir kırpması"nın en küçüğü, eşik 8
(K04). Testler: `tests/test_hashes.py` (kopyalar ≤ 8, 40 farklı sahne > 8). Düz renkli sentetik
şekillerde farklı görüntüler 0–2 bite kadar inebiliyor (gerçekten neredeyse aynı görünüyorlar); duman
testinde 3 farklı sınıf çifti bu yüzden "çelişkili kopya" diye raporlandı.
Özetlerimiz `imagehash` 4.3.2 ile 15 görüntüde birebir aynı (aHash, dHash, pHash).
Süre: 20 000 rastgele özet × 5 varyant, eşik altı çift arama **14,2 sn** (tek iş parçacığı numpy).

## torch'suz kurulum (`goruntu[cikarim]`)

Temiz bir sanal ortama yalnız `pip install "havuz/goruntu[cikarim]"`: onnxruntime, Pillow, numpy, pydantic,
pyyaml kuruldu (torch, timm, transformers, onnx YOK), ortam 164 MB. `OnnxClassifier(...).predict_files`
ve `python -m goruntu tahmin --onnx` çalıştı.

## Tarayıcı örneği

Headless Chromium 153 + onnxruntime-web 1.31.1: yeniden boyutlandırmasız görüntüde Python ONNX ile
olasılık farkı 1,7e-8, küçültme gereken görüntülerde 1,6e-6–7,7e-6 (minik test modeli). Ayrıntı:
docs/TARAYICI.md, betik `scripts/tarayici_esdegerlik.py`.

## Ön işleme birebirliği

`tests/test_model_input.py`: bizim `prepare` + modelin içindeki normalleştirme, timm'in `create_transform`
çıktısıyla 4 yapılandırma × 5 en-boy oranında (kare olmayan hedef ve ezme kipi dahil) en büyük fark
< 1e-5. EXIF yönünün 8 değeri, EXIF standardına göre numpy ile kurulmuş beklentiyle piksel piksel aynı.

## Bellek kestirimi (kuru çalıştırma formülü) — ölçümle karşılaştırma

CPU'da tepe RSS artışı (/proc VmHWM), 2 adım, 224 px:

| Model, kip, yığın | Ölçülen artış | Katman çıktıları toplamı × yığın | Oran |
| --- | ---: | ---: | ---: |
| mobilenetv3_large_100, tam, 32 | 1678 MB | 2029 MB | 0,83 |
| mobilenetv3_large_100, baş, 32 | 385 MB | 2029 MB | 0,19 |
| efficientnet_b0, tam, 16 | 1533 MB | 1456 MB | 1,05 |
| vit_tiny_patch16_224, tam, 16 | 597 MB | 944 MB | 0,63 |

Formül: tam kipte çıktı toplamı × 1,0, baş kipinde × 0,2; aralık −%40 / +%50 (K10). GPU belleğiyle
karşılaştırılmadı.

## Temiz kurulumdan doğrulama

`.venv`, önbellekler ve `goruntu.egg-info` silinip depo kökünden `python3 havuz/araclar/denetle.py goruntu
--kur`: uv ile `requirements.lock`'tan kurulum + `python scripts/check.py` → **"Hepsi yeşil"**, toplam
38,4 sn (mypy soğuk önbellekle 8,1 sn; pytest 272 geçti, 6 ağ testi atlandı, 24,8 sn). uv paketleri
önbellekten kurdu; önbelleksiz ilk kurulum (torch + CUDA kitaplıkları ~3 GB) çok daha uzun sürer.
