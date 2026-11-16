# GGUF'a dönüştürme ve Ollama

Yol: bu paketin modeli → Hugging Face `LlamaForCausalLM` klasörü → llama.cpp dönüştürücüsü →
`.gguf` dosyası → Ollama (ya da doğrudan llama.cpp).

## Ne denendi, ne doğrulanmadı (16 Kasım 2026)

| Adım | Durum |
| ---- | ----- |
| `disa-aktar --bicim hf` → `transformers` 5.23 ile yükleme | **Doğrulandı**: logitler `allclose`, açgözlü üretim ve tokenizer kimlikleri aynı (`tests/test_export_hf.py`) |
| llama.cpp `convert_hf_to_gguf.py` (ana dal, betik SHA-256 `297502d1…`) ile f32 ve f16 GGUF | **Yapıldı**: örnek model → 5,45 MB (f32), 2,80 MB (f16), 38 tensör |
| GGUF içeriği (`scripts/gguf_dogrula.py`) | **Doğrulandı**: üst veri, 4.096 belirteç, 3.824 birleştirme aynı; GGUF ağırlıklarıyla llama.cpp'nin RoPE düzeninde numpy ileri geçişi bizim logitlerimizden en çok 4,5e-6 (f32) / 4,3e-3 (f16) farklı; 20 belirteçlik açgözlü üretim aynı |
| llama.cpp ikilisi (`llama-cli`, `llama-server`) ile çalıştırma | **Doğrulanmadı** (bu ortamda llama.cpp derlenmedi) |
| Ollama ile `ollama create` / `ollama run` | **Doğrulanmadı** (Ollama kurulu değil); aşağıdaki `Modelfile` belgelere göre yazıldı |

## 1. Hugging Face klasörü

```bash
python -m dil_modeli disa-aktar --model ornek-model --bicim hf --cikti calisma/hf-ornek
```

Klasörde `config.json`, `model.safetensors`, `tokenizer.json`, `tokenizer_config.json`,
`chat_template.jinja`, `generation_config.json` olur. Ollama bazı mimarilerde safetensors
klasörünü doğrudan da içe alabilir (`FROM ./calisma/hf-ornek`); bu yol denenmedi.

## 2. llama.cpp dönüştürücüsü

Normal bir bilgisayarda en kolayı depoyu klonlamaktır:

```bash
git clone --depth 1 https://github.com/ggml-org/llama.cpp ../llama.cpp
```

GitHub'a erişim yoksa (bu depo böyle bir ortamda yazıldı) aynı dosyalar
`https://raw.githubusercontent.com/ggml-org/llama.cpp/master/` altından tek tek indirilebilir:
`convert_hf_to_gguf.py`, `conversion/__init__.py`, `conversion/base.py`, `conversion/llama.py` ve
`gguf-py/gguf/` içindeki `__init__.py, constants.py, gguf_reader.py, gguf_writer.py, lazy.py,
metadata.py, quants.py, tensor_mapping.py, utility.py, vocab.py` (Kasım 2026 düzeni; dönüştürücü
değiştikçe bu liste değişebilir). İndirilen kodu ayrı bir klasöre koyun.

Dönüştürücü için ayrı bir sanal ortam önerilir:

```bash
uv venv calisma/gguf-venv
uv pip install --python calisma/gguf-venv/bin/python torch numpy transformers safetensors sentencepiece pyyaml tqdm requests
```

## 3. Dönüştürme

llama.cpp, tokenizer'ın ön-bölme kuralını bir sınama metninin özetinden tanır; bizim tokenizer'ın
özeti listede olmadığı için doğrudan çalıştırınca `BPE pre-tokenizer was not recognized` hatası
verir. Kuralımız birebir GPT-2 kuralıdır; sarmalayıcı betik yalnız bu durumda `gpt-2` yazar:

```bash
calisma/gguf-venv/bin/python scripts/gguf_donustur.py --donusturucu ../llama.cpp/convert_hf_to_gguf.py \
    calisma/hf-ornek --outfile calisma/ornek-f16.gguf --outtype f16
```

`--outtype`: `f32` (kayıpsız), `f16` (yarı boyut), `q8_0` (çeyreğe yakın; `gguf_dogrula.py`
nicemlenmiş dosyayı doğrulamaz).

## 4. Dosyayı doğrulama

```bash
pip install -e ".[gguf]"
python scripts/gguf_dogrula.py --gguf calisma/ornek-f16.gguf --model ornek-model
```

Beklenen çıktı: altı satırın hepsi "tamam" (mimari, ön-bölme, sözlük, birleştirmeler, logitler,
açgözlü üretim).

## 5. Ollama (doğrulanmadı)

`calisma/Modelfile`:

```
FROM ./ornek-f16.gguf

# Sohbet şablonu (Go şablonu). <|bas|> yazılmaz: GGUF'ta add_bos_token=true, llama.cpp ekler.
TEMPLATE """{{- range .Messages }}
{{- if eq .Role "system" }}<|sistem|>{{ .Content }}<|bitti|>
{{- else if eq .Role "user" }}<|kullanici|>{{ .Content }}<|bitti|>
{{- else if eq .Role "assistant" }}<|asistan|>{{ .Content }}<|bitti|>
{{- end }}
{{- end }}<|asistan|>"""

PARAMETER stop "<|bitti|>"
PARAMETER stop "<|son|>"
PARAMETER num_ctx 256
PARAMETER temperature 0.8
PARAMETER repeat_penalty 1.1
```

```bash
cd calisma
ollama create ornek -f Modelfile
ollama run ornek "Merhaba"
```

Notlar:

- GGUF'taki EOS `<|son|>`'dur; sohbet turu `<|bitti|>` ile biter, bu yüzden ikisi de `stop`'ta.
- Depodaki örnek model sohbet ince ayarı görmediği için sohbette anlamsız yanıt verir; şablonu
  ince ayarlı bir modelle (`ince-ayar` → `birlesik/`) kullanın. Temel model için ham tamamlama:
  Ollama API'sinde `"raw": true`.
- `num_ctx` modelin bağlamını (`max_seq_len`) aşmamalı.
