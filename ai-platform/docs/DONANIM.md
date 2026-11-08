# Donanım rehberi

Platform iki yerde çalışır: **bir GPU sunucu** (ortak servisler) ve **çalışan bilgisayarları** (hafif
bileşenler). 30 modülün tamamı bu ikisiyle karşılanır; modeller modüller arasında paylaşıldığı için toplam
8 sunucu bileşeni ve 14 yerel bileşen vardır. `aiplatform probe` bilgisayarı tarar ve katmanını söyler;
`aiplatform check <modül>` bir modülün bu bilgisayarda çalışıp çalışmayacağını Türkçe açıklar.

## Katmanlar

| Katman | Tanım | Örnek | Neler çalışır |
| --- | --- | --- | --- |
| **T0** | GPU'suz bilgisayar | i5/i7, Ryzen 5/7, 16-32 GB RAM; Mac mini M4 | KVKK Kalkanı, sınıflandırma, NER, gömme (sorgu), hesap motoru, Docling, Chronos, Piper, Splink, LightGBM; isteğe bağlı 2-4B LLM (6-15 token/sn) |
| **T1** | Tek tüketici GPU | RTX 4060 Ti 16 GB / 4090 24 GB / 5090 32 GB; Mac Studio M4 Max 64 GB | Qwen3.5-9B ana model, OCR VLM, Whisper turbo, Text2SQL 7B, görsel 4B; 5090'da Qwen3.5-35B-A3B sığar (ses/gömme CPU'ya iner) |
| **T2** | Şirket sunucusu, profesyonel GPU | RTX 6000 Ada 48 GB / RTX PRO 6000 Blackwell 96 GB / H100 80 GB; Mac Studio M4 Ultra 128-256 GB | Qwen3.5-35B-A3B + tüm GPU servisleri eş zamanlı |
| **T3** | Çoklu GPU | 2-4 × 80-96 GB | Qwen3.5-122B-A10B, 100+ eş zamanlı kullanıcı |

Katman kuralı (`hardware/probe.py`): GPU yok → T0; tek GPU < 40 GB → T1; 40-100 GB → T2; > 100 GB veya 2+ GPU → T3;
Apple birleşik bellek ≥ 96 GB → T2.

## GPU sunucu bellek bütçesi (48 GB önerilen)

| Bileşen | Model | VRAM |
| --- | --- | --- |
| Ana model | Qwen3.5-35B-A3B Q4_K_M (GGUF 22 GB) | 24 GB |
| KV önbellek, 10-20 eş zamanlı kullanıcı | — | 10 GB |
| OCR | PaddleOCR-VL 1.6 | 3 GB |
| Konuşma → metin | Whisper large-v3-turbo | 2,5 GB |
| Gömme + yeniden sıralama | bge-m3 + bge-reranker-v2-m3 | 3 GB |
| Güvenlik denetimi | Granite Guardian 3.1 2B | 5,5 GB (CPU'ya alınabilir) |
| **Toplam** | | **≈ 48 GB** → 48 GB kartta güvenlik denetimi CPU'da; 96 GB kartta hepsi GPU'da |

Hesap kuralı: Q4 ağırlık (GB) ≈ parametre (milyar) × 0,6; KV önbellek için kullanıcı başına ≈ 0,25 GB (16K bağlam);
MoE modellerde toplam parametre belleği, aktif parametre hızı belirler. Uygunluk denetimi (`hardware/compat.py`)
toplam kullanım kapasitenin %75'ini aşınca uyarır, %90'ını aşınca kurulumu engeller.

### GPU seçimine göre ana model

| GPU | Ana model | Not |
| --- | --- | --- |
| 24 GB (RTX 4090) | Qwen3.5-9B veya gpt-oss-20B | 35B-A3B sığmaz |
| 32 GB (RTX 5090) | Qwen3.5-35B-A3B Q4 | OCR + KV sığar; ses/gömme/reranker CPU'da |
| 48 GB (RTX 6000 Ada, RTX PRO 5000) | Qwen3.5-35B-A3B Q4 | **önerilen paket**, tüm servisler |
| 80-96 GB (H100, RTX PRO 6000) | Qwen3.5-35B-A3B FP8 (vLLM) | daha isabetli, uzun bağlam, 30-100 kullanıcı |
| Mac Studio M4 Ultra 128-256 GB | Qwen3.5-35B-A3B hatta 122B-A10B | çok kullanıcılı verim NVIDIA + vLLM'nin gerisinde |

## Çalışan bilgisayarı

| Bileşen | RAM |
| --- | --- |
| KVKK Kalkanı (Presidio + GLiNER) | 1,0 GB |
| Sınıflandırıcılar (mDeBERTa / BERTurk, ONNX) | 0,6 GB |
| Gömme sorgu tarafı (multilingual-e5-small) | 0,4 GB |
| NER (GLiNER) | 0,7 GB |
| Docling + pdfplumber + Tesseract | 1,5 GB |
| Chronos-Bolt small, LightGBM, Splink, Piper | ≈ 1,5 GB |
| **Opsiyonel yerel LLM** Qwen3.5-4B / Gemma 4 E4B Q4 | 3,5-7 GB |

Asgari **16 GB RAM**, 4+ çekirdek (AVX2), 20 GB boş disk; önerilen 32 GB. Yerel LLM dahil edilirse 24 GB+.
Yeni alımlarda NPU'lu işlemciler (Intel Core Ultra, AMD Ryzen AI, Snapdragon X, Apple M) küçük modelleri hızlandırır.
Bileşenler aynı anda yüklü durmaz; ilk çağrıda yüklenir (`runtimes/lazy.py`).

## Sunucu paketi (şirket boyutuna göre)

| Paket | Çalışan / eş zamanlı | GPU | Sunucu | Kaba maliyet (USD, 2026) |
| --- | --- | --- | --- | --- |
| Başlangıç | 10-50 / 2-5 | RTX 5090 32 GB | 64 GB RAM, 12-16 çekirdek, 2 TB NVMe | 4.000-7.000 |
| Standart (önerilen) | 50-300 / 5-30 | RTX 6000 Ada 48 GB veya RTX PRO 5000 48 GB | 128 GB RAM, 16-24 çekirdek, 4 TB NVMe | 10.000-16.000 |
| Kurumsal | 300-1.000 / 30-100 | RTX PRO 6000 96 GB veya H100 80 GB | 256 GB RAM, 32 çekirdek, 8 TB NVMe | 18.000-40.000 |

Maliyetler tedarikçi ve kura göre değişir; teklif aşamasında güncellenir. Tüketici kartları 7/24 yükte soğutma ve
garanti açısından risklidir; sunucuda profesyonel kart tercih edin.

## Katmana göre LLM motoru

| Durum | Motor | Neden |
| --- | --- | --- |
| NVIDIA GPU + Docker (nvidia runtime) | **vLLM** | çok kullanıcılı toplu işleme, FP8, uzun bağlam |
| Ollama kurulu | **Ollama** | en kolay yönetim; `ollama pull hf.co/<depo>:<quant>` |
| Diğer (CPU, Apple, Windows) | **llama-server** (llama.cpp) | GGUF, her platformda, Metal/CUDA/CPU |

Üçü de OpenAI uyumlu `/v1` sunar; platform hangisini başlattığını `~/.aiplatform/llm_engine.json`'a yazar.
