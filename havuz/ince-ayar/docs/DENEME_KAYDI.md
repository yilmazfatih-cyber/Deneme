# Deneme kaydı

Bu temelde **gerçekten çalıştırılan** her şeyin kaydı. Burada yazmayan bir yol (GPU, GGUF, Ollama) denenmemiştir.

**Ortam (16 Kasım 2026):** Linux, 4 çekirdek, 15 GB bellek, **GPU yok**; Python 3.13.18, torch 2.15.0 (CPU),
transformers 5.23.0, peft 0.21.3, trl 1.18.0, datasets 5.2.0, sentence-transformers 6.3.0, onnx 1.23.2,
onnxruntime 1.32.0. Torch iş parçacığı 2 (paylaşımlı makine).

## 1. Ağsız denetim (`python scripts/check.py`)

ruff + biçim + mypy + pytest. Minik rastgele modellerle her görevin eğitim döngüsü 3 adım koşar.
Son temiz kurulum sonrası sonuç ve süre: bkz. bölüm 6.

## 2. Ağlı duman testi (`python scripts/duman_testi.py`, `tests/test_ag_duman.py`)

İki kez koşturuldu: 7/7 geçti, 73,7 sn ve (son kodla, modeller önbellekte) 47,7 sn. İki koşuda kayıplar ve
farklar birebir aynı çıktı (tohumlar çalışıyor). Ölçümler `ciktilar/duman_raporu.json` dosyasından:

| Deneme | Model | Sonuç |
| ------ | ----- | ----- |
| Sohbet kayıp maskesi | `HuggingFaceTB/SmolLM2-135M-Instruct` (gerçek tokenizer, ChatML) | Etiketlenen metin tam olarak `"Üç iş günü içinde.<\|im_end\|>\n"` |
| Sohbet LoRA eğitimi | aynı; r=8, yığın 2, 3 adım, CPU fp32 | 23,5 sn (ilk), 9,8 sn (ikinci); eğitim kaybı 3,52, doğrulama kaybı 2,71 (3 adım: kalite ölçüsü değildir) |
| Birleştirme | aynı, `--duyarlik fp32` | birleşik ↔ bağdaştırıcılı en büyük logit farkı **7,9e-05** |
| Birleştirme (elle, `oto` = bf16) | aynı | fark **1,0** — bf16 yuvarlaması; fp32'de 1,0e-04. Bu yüzden düşük duyarlıkta uyarı yazdırılıyor |
| Modelfile | aynı | şablon ailesi `chatml` tanındı; Ollama'nın `chatml.gotmpl` dosyası yazıldı |
| Sınıflandırma | `dbmdz/electra-small-turkish-cased-discriminator` | 3 adım 9,7 sn; ONNX fp32 farkı **6,0e-08**; int8 farkı 2,8e-03, 4 örnek metinde karar uyumu %75 (3 adımlık modelin olasılıkları neredeyse eşit; küçük fark kararı çeviriyor). Ayrı bir elle koşuda int8 farkı 1,2e-02, uyum %100. Boyut 56,7 MB → int8 14,0 MB |
| Gömme | aynı kodlayıcı + ortalama havuzlama | 3 adım 12,5 sn; ONNX farkı **3,8e-06**; önce/sonra ölçütleri 3 sorguluk derlemde aynı (3 adım; anlamlı değil) |
| GPU hazır ayarları, kuru çalıştırma | 4 görev × `colab-t4`, `tek-gpu-24gb` | 8/8 çalıştı (yapılandırma + tokenizer indirildi, ağırlık inmedi) |

Kuru çalıştırmanın bellek tahminleri (örnek veriyle; **ölçüm değil**, GPU'da doğrulanmadı):

| Görev | Hazır ayar | Taban | Tahmin |
| ----- | ---------- | ----- | ------ |
| sohbet | colab-t4 | Qwen/Qwen3-1.7B, LoRA r=16 (17,4 M eğitilen) | ≈ 3,4–5,9 GB → 15 GB'a sığar |
| sohbet | tek-gpu-24gb | Qwen/Qwen3-4B, LoRA r=16 (33,0 M eğitilen) | ≈ 6,8–11,8 GB → 24 GB'a sığar |
| sınıflandırma | colab-t4 / 24gb | bert-base-turkish-cased / 128k | ≈ 2,1–3,6 / 2,9–5,0 GB |
| gömme | colab-t4 / 24gb | multilingual-e5-base / bge-m3 (önbellekli MNRL) | ≈ 4,1–7,2 / 7,3–12,6 GB |

Örnek veri kısa olduğundan etkinleştirme belleği küçüktür; kendi verinizle `--kuru` yeniden çalıştırın.

## 3. Bellek tahmini ↔ ölçüm (CPU, tek veri noktası)

SmolLM2-135M-Instruct, LoRA r=8, yığın 2, en uzun örnek 103 belirteç, gradyan denetimi kapalı:
- Ölçülen en yüksek RSS (alt süreç, `resource.getrusage`): **2,00 GB** eğitim; **0,88 GB** yalnız kuru çalıştırma
  (Python + kütüphaneler + tokenizer).
- İlk tahmin 1,0–1,8 GB idi (sabit pay 0,5 GB) → ölçümün altında kaldı. Sabit pay 1 GB'a çekildi; yeni tahmin
  **1,4–2,4 GB** ölçümü kapsıyor. GPU belleği (VRAM) ile karşılaştırma **yapılmadı**.

## 4. Model indirme sorunu (Xet)

İlk denemede SmolLM2 ağırlıkları 4 dk 41 sn takılıp "Can't load the model" hatasıyla düştü. Aynı dosya
`HF_HUB_DISABLE_XET=1` ile 14 sn'de indi (269 MB). Hata iletisi ve AGENTS "Sık yapılan hatalar" bunu öneriyor.

## 5. Denenemeyenler

- **GGUF dönüştürme:** llama.cpp'nin `convert_hf_to_gguf.py` betiği (raw.githubusercontent.com'dan alınan alt küme)
  bu oturumda çalıştırılmak istendi; komut izin sisteminde reddedildi. Dönüştürme, `llama-quantize` ve GGUF ile
  çıkarım **doğrulanmadı**. GGUF başlık okuyucusu elle yazılmış bir GGUF v3 dosyasıyla test edildi.
- **Ollama:** kurulu değil; `ollama create/run` çalıştırılmadı.
- **GPU:** yok; fp16/bf16, 4-bit (bitsandbytes) ve hazır ayarlarla gerçek eğitim denenmedi.
- **Sentetik veri hattı:** gerçek bir öğretmen sunucusuyla denenmedi (sahte uç nokta + yerel HTTP sunucusuyla test edildi).
- **Katalogdaki diğer modeller:** yalnız lisans/parametre/erişim doğrulandı (`katalog/dogrulama-2026-11-16.json`);
  SmolLM2-135M-Instruct ve electra-small-turkish dışındakiler bu temelde eğitilmedi.

## 6. Temiz kurulum sonrası denetim

`.venv`, `.mypy_cache`, `.ruff_cache`, `__pycache__` silinip `requirements.lock` dosyasından yeniden kuruldu
(`uv pip install -r requirements.lock` + `--no-deps -e .`), sonra `python scripts/check.py` çalıştırıldı:

| Koşu | ruff | biçim | mypy | pytest | Toplam |
| ---- | ---- | ----- | ---- | ------ | ------ |
| 1. temiz kurulum | yeşil | yeşil | 81,3 sn (soğuk) | 302 geçti, 7 atlandı (ağ), 84,9 sn | 166 sn |
| 2. temiz kurulum (mypy ağır kütüphaneleri atlıyor) | yeşil | yeşil | 6,6 sn | 302 geçti, 7 atlandı, 31,9 sn | **39 sn** |

Paylaşımlı makinede süreler yüke göre değişir; pytest süresinin çoğu minik modellerle eğitim ve ONNX aktarımıdır.
