# dil-modeli — model talimatları

## Bu temel ne yapar

Sıfırdan yazılmış bir dil modeli yığını: bayt düzeyi BPE tokenizer → LLaMA uyumlu PyTorch modeli →
eğitim (sürdürülebilir) → üretim → sohbet/LoRA ince ayarı → dışa aktarım (kendi biçimi, Hugging
Face, tarayıcı, ONNX, GGUF) → OpenAI uyumlu sunucu → bağımlılıksız tarayıcı çalışma zamanı.
Sayısal her parça başka bir gerçeklemeyle (HF `tokenizers`/`transformers`, kaba kuvvet, JS)
karşılaştırılan testlerle korunur. Yeni işi var olan örneği kopyalayarak yapın.

## Komutlar

Hepsi bu klasörden çalışır; önce `source .venv/bin/activate`.

| Komut | Ne zaman |
| ----- | -------- |
| `uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev,sun,hf]"` | kurulum |
| `python scripts/check.py` | her değişiklikten sonra (ruff, biçim, mypy, pytest, JS) — ~1 dk |
| `python scripts/check.py --uzun` | büyük değişiklikte (+ tam Unicode taraması, ONNX, tarayıcı uçtan uca) |
| `python -m pytest tests/test_model.py -q` | tek dosyanın testleri |
| `node --test tarayici/` | JS testleri |
| `ruff format . && npx prettier --write tarayici` | biçimi düzelt |
| `python -m dil_modeli tokenizer-egit / veri-hazirla / egit / degerlendir / boyutlar` | veri ve eğitim |
| `python -m dil_modeli uret / sohbet / ince-ayar / disa-aktar / sun / rapor` | kullanım |
| `python scripts/tarayici_sinama.py` | Python davranışı değişince JS eşlik vektörlerini yenile |
| `python scripts/unicode_tablolari.py` | yalnız `tokenizers` güncellenip tablolar değişirse |
| `python scripts/ornek_model.py hazirla \| egit \| paketle` | örnek modeli baştan üret (~15 dk) |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| -------------------- | ---------- |
| Bayt ↔ karakter eşlemesi, ön-bölme kuralı | `dil_modeli/bytelevel.py` (+ `unicode_classes.py`, üretilir) |
| BPE kodlama/çözme, özel belirteçler, akışla çözme | `dil_modeli/tokenizer.py` |
| `tokenizer.json` okuma/yazma (HF alt kümesi) | `dil_modeli/tokenizer_format.py` |
| BPE eğitimi (saf Python + `--hizli`) | `dil_modeli/tokenizer_train.py` |
| Karakter tokenizer | `dil_modeli/tokenizer_char.py` |
| Tokenizer arayüzü ve türüne göre yükleme | `dil_modeli/tokenizer_api.py` |
| Türkçe büyük/küçük harf | `dil_modeli/text_tr.py` |
| Model ayarları, hazır boyutlar, parametre sayımı | `dil_modeli/config.py` |
| RMSNorm, RoPE, dikkat (GQA, KV önbelleği), SwiGLU, blok | `dil_modeli/layers.py` |
| Model gövdesi, maske, kayıp | `dil_modeli/model.py` |
| Derlem okuma (.txt/.jsonl, akış, parçalama) | `dil_modeli/corpus.py` |
| Metin → `.bin` parçaları + `meta.json` | `dil_modeli/data.py` |
| Eğitim/doğrulama yığınları (memmap) | `dil_modeli/batches.py` |
| Eğitim ayarları (TOML + `--ayar`) | `dil_modeli/train_config.py`, `yapilandirma/*.toml` |
| Eğitim döngüsü, denetim noktası, sürdürme | `dil_modeli/train.py`, `dil_modeli/train_state.py` |
| AdamW grupları, ısınma + kosinüs | `dil_modeli/optim.py` |
| Aygıt ve karışık duyarlık | `dil_modeli/device.py` |
| Şaşkınlık, karakter başına bit | `dil_modeli/evaluate.py` |
| Örnekleme kuralları | `dil_modeli/sampling.py` |
| Üretim döngüsü, akış, toplu üretim, durdurma | `dil_modeli/generate.py` |
| Sohbet şablonu, sohbet verisi şeması | `dil_modeli/chat.py` |
| LoRA | `dil_modeli/lora.py` |
| İnce ayar döngüsü | `dil_modeli/finetune.py` |
| Model klasörü kayıt/yükleme | `dil_modeli/model_io.py` |
| Hugging Face aktarımı | `dil_modeli/export_hf.py` |
| Tarayıcı aktarımı (float16/int8) | `dil_modeli/export_web.py` |
| ONNX aktarımı | `dil_modeli/export_onnx.py` |
| Sunucu uçları / istek şemaları | `dil_modeli/serve.py`, `dil_modeli/serve_schemas.py` |
| Sunucu deneme sayfası ve metinleri | `dil_modeli/web/deneme.html`, `dil_modeli/web/tr.json` |
| Eğitim raporu (HTML) | `dil_modeli/report.py` |
| Komut kayıt defteri | `dil_modeli/cli.py` (`__main__.py` yalnız onu çağırır) |
| Komutların kendisi | `dil_modeli/cli_data.py`, `cli_train.py`, `cli_generate.py`, `cli_finetune.py`, `cli_export.py`, `cli_serve.py`, `cli_report.py`, ortaklar `cli_common.py` |
| Tarayıcı: tokenizer / model / örnekleme / üretim / yükleme | `tarayici/tokenizer.js`, `model.js`, `sampler.js`, `generate.js`, `loader.js` (`index.js` dışa açar) |
| Tarayıcı gösterim sayfası | `tarayici/index.html`, `app.js`, `app.css`, metinler `tarayici/tr.json` |
| JS eşlik vektörleri | `tarayici/sinama/` (üreteci: `scripts/tarayici_sinama.py`) |
| GGUF / Ollama | `scripts/gguf_donustur.py`, `scripts/gguf_dogrula.py`, `docs/OLLAMA.md` |
| Örnek model hattı | `scripts/ornek_veri_indir.py`, `scripts/ornek_model.py`, `ornek-model/` |

## Değişmez kurallar

1. **Ön-bölme kuralı ve BPE birleştirme sırası değişmez** (Python = HF `tokenizers` = JS).
   Koruyan: `tests/test_tokenizer_parity.py`, `tests/test_unicode_classes.py`, `tarayici/tokenizer.test.js`.
2. **Parametre adları değişmez** (`blocks.{i}.attn.q_proj.weight` …): HF/tarayıcı/LoRA bunlara bağlı.
   Koruyan: `tests/test_export_hf.py`, `tests/test_browser_vectors.py`, `tarayici/model.test.js`.
3. **Özel belirteç adları yalnız ASCII ve sıraları sabit** (`<|bas|>`=0, `<|son|>`=1, `<|dolgu|>`=2,
   `<|sistem|>`, `<|kullanici|>`, `<|asistan|>`, `<|bitti|>`, `<|yedek1-9|>`). Kullanıcı metni
   özel belirteç üretemez (`allow_special=False` varsayılan). Koruyan: `tests/test_tokenizer.py`, `tests/test_chat.py`.
4. **Model sayısal olarak HF Llama ile aynı kalır**: önbellekli = önbelleksiz, nedensellik.
   Koruyan: `tests/test_model.py`, `tests/test_export_hf.py`.
5. **Eğitim bire bir sürdürülebilir**: rastgelelik adım numarasından türetilir; yeni durum
   `_state()`/`_restore()`'a eklenir. Koruyan: `tests/test_train.py::test_resume_is_bit_exact`.
6. **Python ve JS üretimi aynı bağlam kuralını izler** (dolunca son yarıyla yeniden başla).
   Koruyan: `tests/test_generate.py`, `tarayici/model.test.js`; değişirse `scripts/tarayici_sinama.py`.
7. **Kullanıcıya dönük metin Türkçe; arayüz metni sözlük dosyasında** (`tarayici/tr.json`,
   `dil_modeli/web/tr.json`). Koruyan: `tests/test_rules.py::test_every_ui_text_key_exists_in_its_dictionary`.
8. **Harf çevirme yalnız `text_tr.upper_tr/lower_tr`** (`.upper()` yasak). Koruyan: `tests/test_rules.py`.
9. **Her kaynak dosya ≤ 300 satır, başlık docstring'inde `Genişletme:` satırı.** Koruyan: `tests/test_rules.py`.
10. **Sınırda doğrulama**: sohbet verisi ve sunucu istekleri Pydantic şemasıyla; eğitim ayarları
    bilinmeyen anahtarı reddeder. Koruyan: `tests/test_chat.py`, `tests/test_serve.py`, `tests/test_train.py`.
11. **Örnek model dosyaları kayıtla aynı ve ≤ 16 MB.** Koruyan: `tests/test_rules.py::test_example_model_record_matches_files`.
12. Yeni komut `cli.py` kayıt defterine, belgelere (README, AGENTS) ve duman testine girer.
    Koruyan: `tests/test_cli.py`, `tests/test_rules.py::test_every_command_is_documented`.

## Tarifler

### 1. Kendi metninle eğit

Dosyalar: yeni bir `yapilandirma/benim.toml` (`cpu-deneme.toml`'u kopyala).

1. Metni `.txt` (tek belge ya da `--satir-belge` ile satır başına belge) veya `.jsonl`
   (`{"text": ...}`; alan adı farklıysa `--alan`) olarak koy. Eski Türkçe dosya: `--kodlama cp1254`.
2. `python -m dil_modeli tokenizer-egit --girdi veri/ham/ --cikti calisma/tok.json --sozluk 8192`
3. `python -m dil_modeli veri-hazirla --girdi veri/ham/ --tokenizer calisma/tok.json --cikti veri/hazir`
4. `.toml` içinde `data_dir`, `out_dir`, `preset`, `max_steps` ayarla; `python -m dil_modeli egit --yapilandirma yapilandirma/benim.toml`
5. Doğrula: `python -m dil_modeli rapor --egitim <out_dir>` ve `uret --model <out_dir>/en-iyi`.

### 2. Modeli büyüt

1. `python -m dil_modeli boyutlar --sozluk <sözlük>` ile hazır boyutlara bak.
2. `.toml`'da `preset = "kucuk"` ya da `[model]` tablosunda tek tek alan (`dim`, `n_layer`, `n_head`,
   `n_kv_head`, `max_seq_len`). Kural: `dim % n_head == 0`, `dim/n_head` çift, `n_head % n_kv_head == 0`.
3. Kalıcı yeni boyut: `dil_modeli/config.py` → `PRESETS`, "YENİ BOYUT BURAYA"; `tests/test_model.py::test_presets_have_expected_sizes`'a beklenen aralığı ekle.
4. Öğrenme oranını büyüdükçe düşür (bkz. `docs/EGITIM_REHBERI.md` tablosu). Doğrula: `python scripts/check.py`.

### 3. Yeni örnekleme yöntemi ekle (ör. min-p)

Dosyalar: `dil_modeli/sampling.py`, `tests/test_sampling.py`, `dil_modeli/cli_common.py`,
`dil_modeli/cli_generate.py`, (isteğe bağlı) `serve_schemas.py`, `tarayici/sampler.js`.

1. `SamplingConfig`e varsayılanı "kapalı" olan alan ekle (`min_p: float = 0.0`) ve `__post_init__`'te denetle.
2. `top_k_filter` gibi saf bir `min_p_filter(logits, p)` yaz.
3. `next_token` içinde "YENİ ÖRNEKLEME YÖNTEMİ BURAYA" satırının üstünde çağır.
4. Elle hesaplanmış küçük bir dağılımla test yaz (`test_top_p_keeps_smallest_set_reaching_p` örnek).
5. Komut satırı: `add_sampling_args` + `sampling_from_args`. Tarayıcı: `sampleToken` içindeki aynı satır + `sampler.test.js`.
6. Doğrula: `python scripts/check.py`.

### 4. Yeni dikkat/katman seçeneği ekle (ör. QK-norm)

1. `ModelConfig`e varsayılanı eski davranış olan alan (`qk_norm: bool = False`) + `__post_init__` denetimi.
2. `layers.py`'de o alana göre dallan; yeni parametre adları eski adları değiştirmesin.
3. `count_parameters`'ı güncelle; `tests/test_model.py`'ye seçenekli bir yapılandırma ekle
   (biçim, nedensellik, önbellek eşitliği, sayım testleri onu da sınasın).
4. HF Llama'da karşılığı yoksa `export_hf.hf_config` açık bir `ValueError` versin; tarayıcıda
   `tarayici/model.js` → `forward`'a ekle ve `python scripts/tarayici_sinama.py` ile vektör üret.
5. Doğrula: `python scripts/check.py`.

### 5. Sohbet verisiyle LoRA ince ayarı

1. Veri: her satır `{"messages": [{"role": "system"|"user"|"assistant", "content": "..."}]}`
   (en az bir `assistant`; `system` yalnız başta). **Kendin eğitim verisi yazma**: açık lisanslı
   bir veri kümesi kullan, lisansını kaydet.
2. `python -m dil_modeli ince-ayar --model <temel> --veri sohbet.jsonl --cikti calisma/ince --adim 300`
   (`--tam`: bütün ağırlıklar; `--lora-rank`, `--lora-hedefler q_proj,v_proj`).
3. Çıktı: `calisma/ince/adaptor/` (yalnız LoRA) ve `calisma/ince/birlesik/` (tek başına model).
4. Dene: `python -m dil_modeli sohbet --model calisma/ince/birlesik`.
5. Bağdaştırıcıyı başka bir kopyaya katmak: `disa-aktar --model <temel> --adaptor calisma/ince/adaptor --bicim kendi --cikti ...`.

### 6. Hugging Face'e ve Ollama'ya aktar

1. `python -m dil_modeli disa-aktar --model <model> --bicim hf --cikti calisma/hf`
   (`transformers.AutoModelForCausalLM/AutoTokenizer.from_pretrained("calisma/hf")` ile yüklenir).
2. GGUF ve Ollama: `docs/OLLAMA.md` (dönüştürme + `scripts/gguf_dogrula.py` ile doğrulama + `Modelfile`).

### 7. Tarayıcıda çalıştır

1. `python -m dil_modeli disa-aktar --model <model> --bicim tarayici --tur int8 --cikti <klasör>`
2. Klasörü bir statik sunucunun altına koy; sayfayı `tarayici/index.html?model=<klasör adresi>/` ile aç
   (varsayılan `../ornek-model/tarayici/`). Kendi sayfanda: `import { loadFromUrl, generateText } from './tarayici/index.js'`.
3. Doğrula: `node --test tarayici/` ve `npm run e2e`.

### 8. Sunucuyu `havuz/yz` gibi OpenAI uyumlu bir istemciye bağla

1. `python -m dil_modeli sun --model <model> --ad benim-modelim` (kapı 8430).
2. İstemcide taban adres `http://127.0.0.1:8430/v1`, model adı `benim-modelim`, anahtar boş ya da
   herhangi bir yazı. `havuz/yz` için: `YZ_TABAN_URL=http://127.0.0.1:8430/v1 YZ_MODEL=benim-modelim`
   (yz profilinde `yapili_kip: kapali` — `response_format` desteklenmez).
3. Ağa açarken: `DIL_MODELI_ANAHTAR=<gizli> python -m dil_modeli sun --adres 0.0.0.0 ...`; istemci
   `Authorization: Bearer <gizli>` gönderir. Tarayıcıdan başka kökenden çağrı: `--cors http://localhost:5310`.

### 9. Yeni komut ekle

`cli_report.py`'yi kopyala → `add_<kök>_args` + `run_<kök>`; `cli.py` → `COMMANDS`, "YENİ KOMUT
BURAYA"; README + AGENTS komut tablolarına ekle; `tests/test_cli.py`'ye duman testi.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| ------- | ----- | ----- |
| `Tokenizer sözlüğü (…) modelin sözlüğünden (…) farklı` | başka eğitimin `tokenizer.json`'ı | model klasörünü bütün olarak taşı (3 dosya) |
| `meta.json bulunamadı` | veri hazırlanmadı | `veri-hazirla` çalıştır |
| `bölümünde … belirteç var; … pencere için yetmiyor` | metin çok az | daha çok metin ya da `--ayar seq_len=64` |
| Kayıp NaN | öğrenme oranı yüksek / fp16 taşması | `learning_rate`'i düşür, `grad_clip=1.0`, bf16/fp32 |
| Eğitim kaybı iner, doğrulama yükselir | ezberleme | daha çok veri, daha küçük model, erken dur (`en-iyi/` zaten en iyiyi tutar) |
| JS testi "fark …" ya da üretim farklı | Python davranışı değişti, vektörler eski | `python scripts/tarayici_sinama.py`, JS'i aynı biçimde güncelle |
| `test_browser_vectors` kırıldı | yukarıdakiyle aynı | aynı |
| `test_example_model_record_matches_files` kırıldı | `ornek-model/` elle değişti | `python scripts/ornek_model.py paketle` |
| HF `AutoTokenizer` farklı kimlik veriyor | `tokenizer_config.json`'da `LlamaTokenizer` yazılmış | `disa-aktar --bicim hf` ile yeniden üret (`PreTrainedTokenizerFast` yazar) |
| `BPE pre-tokenizer was not recognized` (llama.cpp) | özet tanınmıyor | `scripts/gguf_donustur.py` kullan (`docs/OLLAMA.md`) |
| `node --test tarayici/` yeni testi çalıştırmıyor | `testler.js`'e eklenmedi | import satırı ekle |

## Bitti tanımı

- [ ] `python scripts/check.py` yeşil (ruff, biçim, mypy, pytest, prettier, `node --test`).
- [ ] Sayısal değişiklik bir başka gerçeklemeyle karşılaştırılan testle korunuyor.
- [ ] Python davranışı değiştiyse `scripts/tarayici_sinama.py` çalıştırıldı ve JS güncel.
- [ ] Yeni dosyanın Türkçe başlığı ve `Genişletme:` satırı var; ≤ 300 satır.
- [ ] Yeni komut/seçenek README ve AGENTS'ta; kullanıcı metni Türkçe ve sözlükte.
- [ ] Ölçüm veren her cümlenin yanında nasıl ölçüldüğü yazıyor; denenmeyen "doğrulanmadı" diye işaretli.
