# minitransformers — Hugging Face Transformers'ın iskeletini sıfırdan yazmak

Transformers'ı güçlü yapan şey tek bir model değil, **her modelin aynı kalıba oturması**: bir yapılandırma
(`config.json`), bir model sınıfı, ortak `save_pretrained`/`from_pretrained`, model türünü adından bulan
**Auto** sınıfları, belirteçleyici, ortak `generate()` ve tek satırlık `pipeline()`. Bu mini, bu kalıbı numpy ile,
küçük bir GPT tarzı model üzerinde kurar. Eğitim bile var: PyTorch'un autograd'ı olmadığı için geri yayılımı
elle yazdık ve testte sonlu farklarla doğruladık.

## Gereksinimler

- Python 3.11+ ve numpy. İnternet gerekmez; "Hub" yerel bir klasördür.

## Çalıştırma

```bash
cd repo-atlasi/dallar/05-yapay-zeka-altyapisi/transformers/sifirdan
python3 ornek.py   # ~5-20 sn: BPE eğit -> GPT eğit -> yerel hub'a yayınla -> pipeline ile üret
```

Örnek çıktı (kısaltılmış; küçük model eğitim metnini ezberler, bu beklenen bir şey):

```text
sözlük: 400 | örnek belirteçler: [' k', 'ü', 'tü', 'p', 'h', 'an', 'eye', ' g', 'it', 't', 'im']
parametre sayısı: 40320
adım   1  kayıp=5.994
adım 300  kayıp=0.715
yayınlanan dosyalar: ['config.json', 'model.npz', 'tokenizer.json', 'tokenizer_config.json']
açgözlü : Vapurda eski vapurlar, dar sokaklar, dar sokaklar ve ahşap evler vardı.
```

## Test

`sifirdan` klasörünün içinden (yukarıdaki `cd` ile):

```bash
python3 -m unittest discover -s . -t .
```

23 test; başlıcaları:

- **Belirteçleyici gidiş-dönüş:** İ, ı, ğ, ş, Çince karakter ve emoji dahil `decode(encode(s)) == s`.
- **KV önbelleği = önbelleksiz:** ön ek + tek tek belirteç verilerek alınan logitler, tüm dizinin tek seferde
  verildiği logitlerle 1e-10 içinde aynı; `generate(use_cache=True)` ve `False` aynı belirteçleri üretir.
- **Kaydet/yükle gidiş-dönüş:** `save_pretrained` → `AutoModelForCausalLM.from_pretrained` aynı logitleri verir;
  eksik/fazla ağırlıklar raporlanır.
- **Elle geri yayılım:** her parametre tensöründen rastgele 3 öğenin gradyanı sonlu farklarla karşılaştırılır;
  eğitim kaybı düşer.

## Aşamalar

| Aşama | Dosya(lar)                                              | Ne öğretir                                                                                |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1     | `tokenization_bpe.py`                                   | Bayt düzeyinde BPE: ön-belirteçleme, birleştirme eğitimi, sıralı birleştirme ile kodlama  |
| 2     | `configuration_utils.py`, `modeling_utils.py`, `hub.py` | `config.json` + ağırlık dosyası sözleşmesi, sıkı/esnek yükleme raporu, yerel hub          |
| 3     | `models/gpt/configuration_gpt.py`, `modeling_gpt.py`    | Gömme, nedensel çok başlı dikkat, MLP (GELU), LayerNorm, bağlı LM başı, KV önbelleği      |
| 4     | `generation_utils.py`                                   | `generate()`: açgözlü/örnekleme, sıcaklık, top-k, top-p, eos, önbellekli adım             |
| 5     | `models/auto.py`, `pipelines.py`                        | Tembel Auto kaydı (`model_type` → sınıf adı → içe aktarma), `register()`, `pipeline()`    |
| 6     | `trainer.py`                                            | Ara değerleri saklayan ileri geçiş, zincir kuralıyla geri geçiş, AdamW, `Trainer.train()` |

Önerilen okuma sırası: `tokenization_bpe.py` → `models/gpt/modeling_gpt.py` → `tests/test_model.py`
(KV önbelleği testi) → `generation_utils.py` → `modeling_utils.py` + `models/auto.py` → `pipelines.py` →
`trainer.py` + `tests/test_trainer.py`.

## Mini'deki parça ↔ gerçek depo

| Mini'deki parça                        | Gerçek depodaki karşılığı (dosya yolu)                                                                                                       | Fark                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ByteLevelBPETokenizer`                | `src/transformers/models/gpt2/tokenization_gpt2.py` (Rust `tokenizers` kütüphanesinin BPE + ByteLevel'ı), `tokenization_utils_tokenizers.py` | Gerçekte bayt→Unicode eşlemesi, Rust hızında eğitim/kodlama, hizalama (offset) bilgisi, sohbet şablonu (`apply_chat_template`).   |
| özel belirteç ayırma (`_special_re`)   | `src/transformers/tokenization_python.py` (`Trie`)                                                                                           | Gerçek sürüm eklenmiş belirteçleri bir önek ağacıyla (trie) böler.                                                                |
| `PretrainedConfig`                     | `src/transformers/configuration_utils.py` (`PreTrainedConfig`)                                                                               | Gerçekte alt yapılandırmalar, RoPE ayarları, varsayılandan farkı yazma (`to_json_string(use_diff=True)`), Hub'a gönderme.         |
| `PreTrainedModel.save/from_pretrained` | `src/transformers/modeling_utils.py` (`save_pretrained`, `from_pretrained`), `core_model_loading.py`                                         | Gerçekte safetensors, parçalı (sharded) dosyalar, `device_map`, nicemleme, ağırlık adı/biçim dönüştürücüleri (`WeightConverter`). |
| `model.npz` + `allow_pickle=False`     | `model.safetensors` (`SAFE_WEIGHTS_NAME`, `src/transformers/utils/__init__.py`)                                                              | Aynı güvenlik fikri: yüklerken kod çalıştırmayan biçim.                                                                           |
| `hub.resolve`, `hub.publish`           | `src/transformers/utils/hub.py` (`cached_file`, `cached_files`, `PushToHubMixin`; `huggingface_hub`)                                         | Gerçekte HTTP indirme, önbellek, revizyon (commit/etiket), kimlik doğrulama.                                                      |
| `GPTForCausalLM.forward`               | `src/transformers/models/gpt2/modeling_gpt2.py` (`GPT2Attention`, `GPT2MLP`, `GPT2Block`, `GPT2LMHeadModel`)                                 | Gerçekte PyTorch modülleri, dikkat arka uçları (eager/sdpa/flash), dropout, dikkat maskesi, karışık duyarlık.                     |
| `past_key_values` (liste of `(k, v)`)  | `src/transformers/cache_utils.py` (`DynamicCache`, `DynamicLayer.update` → `torch.cat(..., dim=-2)`)                                         | Gerçekte statik, kayan pencere, nicemlenmiş önbellek türleri de var.                                                              |
| `generate()`                           | `src/transformers/generation/utils.py` (`GenerationMixin.generate`, `_sample`, `_beam_search`, `_assisted_decoding`)                         | Gerçekte demet arama, varsayımsal (assisted) çözme, akış (streamer), durdurma kriterleri, sürekli toplu işleme.                   |
| `Temperature/TopK/TopPLogitsWarper`    | `src/transformers/generation/logits_process.py`                                                                                              | Gerçekte onlarca işleyici (tekrar cezası, kelime yasaklama, zorunlu belirteç...).                                                 |
| `CONFIG_MAPPING_NAMES`, `_LazyMapping` | `src/transformers/models/auto/auto_mappings.py` (otomatik üretilir), `configuration_auto.py`, `auto_factory.py` (`_LazyAutoMapping`)         | Gerçekte yüzlerce model, görev başına eşleme (`MODEL_FOR_CAUSAL_LM_MAPPING_NAMES` ...), uzak kod (`trust_remote_code`).           |
| `pipeline()`, `TextGenerationPipeline` | `src/transformers/pipelines/__init__.py` (`SUPPORTED_TASKS`, `pipeline`), `pipelines/base.py`, `pipelines/text_generation.py`                | Gerçekte toplu işleme, cihaz seçimi, sohbet girdileri, çok kipli görevler.                                                        |
| `Trainer`, `loss_and_grads`, AdamW     | `src/transformers/trainer.py` (`train` → `_inner_training_loop` → `training_step` → `compute_loss`), `training_args.py`                      | Gerçek Trainer türevi autograd'a bırakır; dağıtık eğitim, karma duyarlık, geri çağrılar, değerlendirme, kontrol noktası yönetir.  |

## Bilerek dışarıda bırakılanlar

- Dikkat maskesi ile dolgu (padding) ve toplu farklı uzunluklar (testler tek uzunlukta çalışır).
- Demet arama (beam search), tekrar cezası, akış (streaming) çıktısı.
- Sohbet şablonu (Jinja) ve çok kipli işlemciler (görüntü/ses).
- Parçalı ağırlık dosyaları, `device_map`, nicemleme, uzak kod (`trust_remote_code`).
