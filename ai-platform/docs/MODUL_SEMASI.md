# Modül ve model katalog şeması

Kaynak: `aiplatform/catalog/schema.py`. Katalog iki YAML dosyasından oluşur ve yüklenirken çapraz
doğrulanır (bilinmeyen model, eksik bağımlılık, ticari kullanımı yasak model, tekrar eden niş kodu → hata).

## `catalog/models.yaml` — ModelSpec

| Alan | Anlam |
| --- | --- |
| `id` | katalog kimliği (`qwen3.5-4b`) |
| `name`, `developer` | görünen ad, geliştirici |
| `params_b`, `active_params_b` | toplam / aktif (MoE) parametre, milyar — HF safetensors sayımı |
| `license`, `license_class` | lisans ve sınıfı: `permissive` (Apache/MIT/BSD/CC-BY), `conditional` (Gemma Terms, Llama, CC-BY-SA, AGPL), `noncommercial` (kataloğa giremez) |
| `turkish` | güçlü / iyi / orta / zayıf / dil bağımsız / yok |
| `modalities`, `capabilities` | text/image/audio; chat, vision, tool_calling, json, embed, rerank, ocr, asr, tts, ner, classify, forecast, translate… |
| `verified_on`, `source_url` | HF API ile doğrulama tarihi ve kaynak |
| `artifacts[]` | indirilebilir biçimler (aşağıda) |

### ModelArtifact

| Alan | Anlam |
| --- | --- |
| `id` | biçim kimliği (`q4_k_m`, `fp8`, `safetensors`, `ct2`, `default`) |
| `runtime` | llamacpp, vllm, ollama, transformers, faster_whisper, paddleocr, gliner, presidio, chronos, piper, docling, python |
| `hf_repo`, `hf_files`, `hf_revision` | depo ve glob desenleri (boşsa tamamı) |
| `ollama_tag` | `hf.co/<depo>:<quant>` — Ollama doğrudan HF'den çeker |
| `pip_extras`, `system_packages` | `pyproject` ek grupları; sistem paketleri yalnız komut olarak gösterilir |
| `disk_gb`, `ram_gb`, `vram_gb` | yaklaşık kaynaklar |
| `gpu_required`, `cpu_note` | GPU şart mı; CPU'da çalışmanın bedeli |
| `context_length`, `notes` | |

## `catalog/modules.yaml` — ModuleSpec

| Alan | Anlam |
| --- | --- |
| `id`, `niche_code` | kimlik ve Excel haritasındaki niş kodu (N00-N29) |
| `name`, `tagline`, `description`, `package`, `roles` | mağaza metinleri ve rol paketi |
| `tier` | tam kalite için asgari katman (T0-T3) |
| `components[]` | bileşenler: `role`, `model`, `artifact` (boşsa donanıma göre seçilir), `target` (server/client/either), `shared`, `optional`, `pip_extras`, `ram_gb`, `note` |
| `actions[]` | `POST /api/modules/{id}/run/{action}` eylemleri: `id`, `name`, `description`, `input_schema`, `output_schema`, `human_approval` |
| `kvkk` | `data_categories`, `special_categories`, `masking_required`, `purpose`, `retention_days` |
| `depends_on` | önce kurulması gereken modüller |
| `erp_touchpoints` | ERP temas noktaları; "(öneri)" = onay kuyruğu, "db.readonly" = salt-okunur SQL |
| `kpis`, `status` | ölçütler; stable / beta / planned |

## Artifact seçimi

`artifact` boş bırakıldığında kurulum sihirbazı (`hardware/compat.py`):

1. hedef **sunucu** ve NVIDIA GPU + Docker (nvidia runtime) varsa `vllm` biçimi,
2. aksi halde `llamacpp` (GGUF),
3. yoksa ilk biçim.

`shared: true` bileşenler kurulu başka modülde varsa yeniden indirilmez ve bellekte bir kez sayılır.

## Yeni modül ekleme

1. `catalog/modules.yaml`'a kayıt ekleyin (gerekirse `models.yaml`'a model — önce HF'de doğrulayın:
   `python scripts/verify_models.py`).
2. `aiplatform/modules/runtimes/<id>.py` içinde `@register("<id>")` ile `ModuleRuntime` alt sınıfı yazın.
3. `pytest` — katalog testi tutarlılığı, çalışma zamanı testi eylemleri denetler.
4. Mağaza kartı otomatik görünür; arayüz değişikliği gerekmez.
