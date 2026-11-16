# Mimari

## Veri akışı

```
metin (.txt/.jsonl) ──corpus.py──> belge parçaları ──tokenizer_train.py──> tokenizer.json
        │                                                       │
        └────────────data.py (kodla, <|bas|>…<|son|>)───────────┘
                         │
                 egitim-000.bin, dogrulama-000.bin, meta.json   (np.memmap, uint16/uint32)
                         │ batches.py (rastgele pencereler; adım numarasından tohum)
                         ▼
             train.py (AdamW, ısınma+kosinüs, biriktirme, kırpma) ──> out_dir/{en-iyi,son}/
                                                                       config.json
                                                                       model.safetensors
                                                                       tokenizer.json
     ┌──────────────┬──────────────┬───────────────┬──────────────┬─────────────┐
 generate.py    finetune.py    export_hf.py    export_web.py   export_onnx.py   serve.py
 (uret/sohbet)  (LoRA, sohbet) (HF → GGUF)     (tarayici/)     (onnxruntime)    (OpenAI API)
```

## Tokenizer — `bytelevel.py`, `tokenizer.py`, `tokenizer_train.py`

- **Bayt ↔ karakter:** metin UTF-8 baytlarına çevrilir; her bayt görünür bir karaktere eşlenir
  (GPT-2 `bytes_to_unicode`: boşluk → `Ġ`, satır sonu → `Ċ`). 256 bayt sözlüğün tabanıdır, bu
  yüzden bilinmeyen belirteç yoktur.
- **Ön-bölme:** GPT-2 düzenli ifadesi `'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+`.
  Harf/sayı/boşluk sınıfları `unicode_classes.py` tablosundan gelir (HF `tokenizers` 0.23.3'ün
  davranışı bütün kod noktaları denenerek çıkarıldı; Unicode 16). Python `re`'nin `\p{L}`
  bilmemesi ve ortamların Unicode sürüm farkı böyle kapanır; JS de aynı tabloyu kullanır.
- **BPE eğitimi:** parça sıklıkları sayılır (`Counter`); her adımda en sık komşu çift
  birleştirilir. Çift sayımları **artımlı** tutulur: yalnız birleşen çiftin geçtiği parçalarda,
  yalnız sol/sağ komşu çiftlerin sayısı güncellenir; en sık çift tembel güncellenen bir öncelik
  kuyruğundan gelir. Eşitlikte küçük kimlikli çift önce (HF `BpeTrainer` ile aynı) → iki yol aynı
  sözlüğü üretir (test). Ölçüm (bu makine): 28 MB Türkçe Vikipedi, 4.096 sözlük ~16 sn, 8.192 ~16 sn.
  Özel belirteç yazısını üreten birleştirme öğrenilmez.
- **Kodlama:** her parçaya birleştirmeler sıra numarasına göre uygulanır; en küçük sıralı çift,
  eşitlikte en soldaki (`heapq`, O(n log n)) — HF `Word::merge_all` ile aynı. Parça sonuçları önbelleğe alınır.
- **Çözme:** kimlikler → baytlar → UTF-8 (`errors="replace"`); akışta `StreamDecoder` yarım
  karakteri bekletir.

## Model — `config.py`, `layers.py`, `model.py`

Girdi kimlikleri `x ∈ {0..V-1}^T`. Gömme `h₀ = E[x]` (E: V×d). Her blok (ön-norm, artık):

- **RMSNorm:** `RMSNorm(h) = h / sqrt(mean(h²) + ε) ⊙ g` (ortalama çıkarılmaz, yanlılık yok).
- **Dikkat:** `q = W_q a`, `k = W_k a`, `v = W_v a` (a = RMSNorm(h)); başlara bölünür
  (`n_head`, baş boyutu `d_h = d / n_head`). **GQA:** `n_kv_head < n_head` ise her K/V başı
  ardışık `n_head / n_kv_head` sorgu başına hizmet eder (K/V parametresi ve önbelleği küçülür).
- **RoPE:** konum `m`, boyut çifti `(i, i + d_h/2)` açısı `θ_i = m · base^(−2i/d_h)` kadar döndürülür:
  `x'_i = x_i cos θ_i − x_{i+d_h/2} sin θ_i`, `x'_{i+d_h/2} = x_{i+d_h/2} cos θ_i + x_i sin θ_i`
  (HF "yarıyı döndür" düzeni). Sonuç: `q_m · k_n` yalnız `m − n`'e bağlıdır (test).
- **Nedensel öz-dikkat:** `softmax(q kᵀ / sqrt(d_h) + M) v`, `M` geleceği −∞ yapar;
  `F.scaled_dot_product_attention` ile. Çıkış `W_o`.
- **SwiGLU:** `W_down (silu(W_gate a) ⊙ W_up a)`, ara boyut ≈ 8/3·d (32'nin katı).
- Son: `logits = W_head · RMSNorm(h_L)`; `tie_embeddings` ise `W_head = E`.

Parametre sayısı (`count_parameters`): `V·d + L·(2d² + 2d·d_kv + 3d·d_ff + 2d) + d (+ V·d ayrı çıkışta)`.
**KV önbelleği:** üretimde her adımda yalnız yeni belirteç işlenir, geçmiş K/V `KVCache`'ten okunur;
önbellekli ve önbelleksiz logitler eşittir (test). Toplu üretimde soldan dolgu + `key_mask`.

## Eğitim — `train.py`, `optim.py`, `batches.py`, `train_state.py`

- **Kayıp:** çapraz entropi `−mean log p(x_{t+1} | x_≤t)`; `IGNORE_INDEX` (−100) konumları sayılmaz.
- **AdamW:** `m ← β₁m + (1−β₁)g`, `v ← β₂v + (1−β₂)g²`, `θ ← θ − η(m̂/(sqrt(v̂)+ε) + λθ)`;
  ağırlık çürümesi yalnız matrislere (≥ 2 boyut), RMSNorm kazançlarına uygulanmaz.
- **Öğrenme oranı:** ısınma `η·(s+1)/S_w`, sonra kosinüs `η·(r + (1−r)·½(1+cos(π·p)))`, `r = min_lr_ratio`.
- **Gradyan biriktirme:** `grad_accum` küçük yığının kaybı `/grad_accum` ile toplanır (eşdeğerlik testi).
- **Kırpma:** `‖g‖ > c` ise `g ← g·c/‖g‖`.
- **Karışık duyarlık:** yalnız CUDA'da `torch.autocast` (bf16; destek yoksa fp16 + `GradScaler`). GPU'da denenmedi.
- **Bire bir sürdürme:** yığın seçimi `np.random.default_rng([tohum, adım, mikro])`, dropout
  `torch.manual_seed(tohum·1000003 + adım)`, öğrenme oranı adımın işlevi; durumda ağırlıklar,
  Adam momentleri, ölçekleyici, adım, en iyi kayıp, günlük penceresi var → N = N/2 + sürdür + N/2 (test).
- Ctrl+C bir bayrak kaldırır; adım bitince durum yazılır (yarım adım kaydedilmez).

## Üretim — `sampling.py`, `generate.py`

Sırayla: yineleme cezası (geçmişteki belirteçlerin logiti >0 ise `/p`, <0 ise `·p`) → sıcaklık
0 ise argmax → `logit/T` → top-k (k'inci değerden küçükler −∞) → top-p (olasılık sırasıyla,
kendinden öncekilerin toplamı `≥ p` olanlar −∞; ilki her zaman kalır) → `softmax` → çekiliş.
Bağlam dolunca son `max_seq_len/2` belirteçle önbellek yeniden kurulur (JS aynı kuralı izler).
Durdurma yazıları akışta, olası başlangıçları bekletilerek aranır.

## Sohbet ve LoRA — `chat.py`, `lora.py`, `finetune.py`

- Şablon: `<|bas|><|sistem|>…<|bitti|><|kullanici|>…<|bitti|><|asistan|>…<|bitti|>`; rol
  belirteçleri kimlik olarak eklenir, içerik sıradan metindir (enjeksiyon yok). Kayıp etiketi
  yalnız asistan içeriği ve onu kapatan `<|bitti|>`.
- **LoRA:** `y = W x + (α/r) · B(A x)`, A: r×giriş (Kaiming), B: çıkış×r (sıfır) → başlangıçta
  model değişmez; yalnız A, B eğitilir. Katma: `W' = W + (α/r)·BA` (çıktı aynı, test).

## Dışa aktarım

- **Kendi biçimi** (`model_io.py`): `config.json` + `model.safetensors` + `tokenizer.json`.
- **Hugging Face** (`export_hf.py`): yalnız ad eşlemesi (`blocks.i.attn.q_proj` →
  `model.layers.i.self_attn.q_proj` …); RoPE düzeni aynı olduğundan permütasyon yok.
  `tokenizer_class = PreTrainedTokenizerFast` (5.x: `TokenizersBackend`), sohbet şablonu Jinja.
  Logit ve açgözlü üretim eşliği `transformers` 5.23 ile test edildi.
- **GGUF** (`scripts/gguf_donustur.py`): llama.cpp dönüştürücüsü, ön-bölme adı `gpt-2`. llama.cpp
  LLaMA'da RoPE'yi komşu çiftlere uygular; dönüştürücü q/k satırlarını buna göre sıralar
  (`scripts/gguf_dogrula.py` bunu numpy ile doğrular).
- **Tarayıcı** (`export_web.py`): tek ikili dosya, her tensör 4 bayta hizalı; int8'de satır başına
  `s = max|w|/127`, `q = round(w/s)` (hata ≤ s/2, test). Normlar float32.
- **ONNX** (`export_onnx.py`): önbelleksiz `ids → logits`, dinamik yığın ve uzunluk.

## Tarayıcı çalışma zamanı — `tarayici/`

`tokenizer.js` (aynı tablo, aynı öncelik kuyruklu BPE), `model.js` (tek belirteçlik ileri geçiş,
Float32Array, KV önbelleği; float16/int8 yüklenirken açılır), `sampler.js` (aynı sıra; tohumlu
mulberry32), `generate.js` (aynı bağlam kuralı, akış geri çağrısı, `AbortSignal`), `loader.js`
(SHA-256 bütünlük denetimi). Eşlik: Python'un ürettiği `tarayici/sinama/` vektörleri; ölçülen en büyük
logit farkı 4,4e-5 (float16 sınama modeli) ve 7,3e-6 (int8 örnek model), açgözlü üretim bire bir.

## Sunucu — `serve.py`

FastAPI; istekler Pydantic şemasıyla doğrulanır, hatalar OpenAI biçiminde (`{"error": {...}}`, 400).
Üretim tek `asyncio.Lock` ile sırayla, model iş parçacığında (`anyio.to_thread`); akış SSE.
Varsayılan: yalnız 127.0.0.1, CORS kapalı; `DIL_MODELI_ANAHTAR` verilirse Bearer anahtarı zorunlu.
