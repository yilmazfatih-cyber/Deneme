# Mimari ve sözleşmeler

Platform iki rolde aynı Python paketiyle çalışır:

```
┌──────────────── Çalışan bilgisayarı (AIP_ROLE=client) ────────────────┐
│ aiplatform (FastAPI :8080)                                            │
│  ├─ KVKK Kalkanı (Presidio + GLiNER)  ← sunucuya giden HER metin      │
│  ├─ yerel modüller: sınıflandırma, NER, gömme(sorgu), hesap motoru,   │
│  │   Docling, Chronos, Piper, Splink, (ops.) Qwen3.5-4B llama-server  │
│  └─ vekil: ağır işler → sunucu /api/...   (maskeli)                   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTP (şirket ağı)
┌───────────────────────────────▼───── GPU sunucu (AIP_ROLE=server) ────┐
│ aiplatform (FastAPI :8080)  ── yönetim arayüzü, katalog, kurulum,     │
│  │                              iş kuyruğu, denetim günlüğü, ERP      │
│  ├─ /v1/chat/completions  → llama-server | vLLM | Ollama  (:8001)     │
│  ├─ OCR (PaddleOCR-VL), ASR (faster-whisper), gömme/reranker, guard   │
│  └─ ERP bağlayıcıları: salt-okunur SQL, REST araçları, webhook        │
└───────────────────────────────────────────────────────────────────────┘
                                │
                        ERP (mevcut sistem)
```

## Klasör sahipliği (paralel üretim için)

| Yol | Sahibi | İçerik |
| --- | --- | --- |
| `aiplatform/catalog/`, `catalog/*.yaml`, `config.py`, `db.py`, `modules/base.py`, `api/app.py` | mimar (Fable) | sözleşmeler — değiştirilmez, eksik varsa mimar düzeltir |
| `aiplatform/hardware/`, `aiplatform/installer/`, `aiplatform/cli.py`, `api/routers/{system,catalog,modules,jobs}.py`, `tests/test_hardware*.py`, `tests/test_installer*.py`, `tests/test_api_core*.py` | ajan **cekirdek** | donanım tarama, uygunluk, tek tık kurulum, iş kuyruğu, LLM motor başlatma |
| `aiplatform/kvkk/`, `aiplatform/runtimes/`, `aiplatform/modules/runtimes/`, `api/routers/{run,gateway}.py`, `tests/test_kvkk*.py`, `tests/test_modules*.py`, `tests/test_gateway*.py` | ajan **moduller** | maskeleme, denetim günlüğü, LLM istemcisi, 30 modülün çalışma zamanı, OpenAI geçidi |
| `aiplatform/erp/`, `aiplatform/web/`, `api/routers/{erp,audit,approvals}.py`, `tests/test_erp*.py`, `tests/test_web*.py` | ajan **erp-web** | ERP bağlayıcıları, onay kuyruğu, webhook, örnek ERP, yönetim arayüzü |
| `docker/`, `docs/*.md` (bu dosya hariç), `README.md`, `scripts/` | ajan **kurulum-dokuman** | compose, Dockerfile, kurulum/donanım/ERP/KVKK belgeleri |

Ortak dosyalara (pyproject, app.py, base.py) ihtiyaç duyan ajan değişikliği **önerir**, mimar uygular.

## Veri yolu ve KVKK kuralı

1. İstemci bir modül eylemi çağırır: `POST /api/modules/{id}/run/{action}`.
2. Modül `kvkk.masking_required` ise ve hedef sunucuysa, metin alanları **istemcide** maskelenir
   (`kvkk/mask.py`), eşleme `mask_mappings` tablosunda istemcide kalır; sunucuya `mapping_id` gitmez.
3. Sunucu işler, yanıt döner; istemci `unmask` ile geri açar.
4. Her çağrı `audit_log` tablosuna yazılır: zaman, kullanıcı, modül, eylem, maskelenen varlık sayısı,
   süre, model, hata. İçerik yazılmaz (yalnız özet ve hash).
5. ERP'ye **yazan** her eylem (`Action.human_approval=True`) `approvals` kuyruğuna düşer; `POST /api/approvals/{id}/decide`
   ile insan karar verir. Onaysız yazma yoktur.

## HTTP API sözleşmesi

Tüm yanıtlar JSON; hata gövdesi `{"error": {"code": str, "message": str, "hint": str|null}}`.

### Sistem (cekirdek)
| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| GET | `/api/system/probe` | `HardwareProfile`: os, cpu {model, cores, avx2, avx512}, ram_gb {total, available}, gpus [{vendor, name, vram_gb, driver, cuda}], disk_gb {total, free, path}, docker {available, gpu_runtime}, ollama {available, version}, npu {present, name}, role, tier (T0-T3), hostname |
| GET | `/api/system/capacity` | kurulu bileşenlerin toplam ram/vram/disk kullanımı ve kalan kapasite yüzdeleri |
| GET | `/api/system/health` | süreç, veritabanı, LLM sunucusu (`/v1/models`) durumu |

### Katalog (cekirdek)
| GET | `/api/catalog/modules` | modül kartları: id, niche_code, name, tagline, package, tier, status, installed(bool), compat (özet: ok/warn/fail) |
| GET | `/api/catalog/modules/{id}` | tam `ModuleSpec` + çözümlenmiş bileşenler (seçilen artifact, boyutlar) |
| GET | `/api/catalog/modules/{id}/requirements?target=server\|client\|auto` | `CompatibilityReport` (aşağıda) |
| GET | `/api/catalog/models` , `/api/catalog/models/{id}` | model kayıtları, kurulu artifact'ler |

`CompatibilityReport`:
```json
{
 "module_id": "fatura-cikarim", "target": "server", "status": "ok|warn|fail",
 "selected": [{"role": "ocr", "model": "paddleocr-vl-1.6", "artifact": "default", "runtime": "paddleocr", "disk_gb": 2, "ram_gb": 5, "vram_gb": 3, "shared_already_installed": false}],
 "totals": {"disk_gb": 25, "ram_gb": 8, "vram_gb": 29, "after_install": {"vram_used_gb": 31, "vram_total_gb": 48, "vram_pct": 65, "ram_pct": 40, "disk_pct": 12}},
 "checks": [{"id": "vram", "status": "ok|warn|fail", "message": "Türkçe açıklama", "required": 27, "available": 48}],
 "missing_dependencies": ["kvkk-kalkani"],
 "recommendation": "Türkçe tek cümle: kurulabilir / CPU'da yavaş çalışır / şu donanım gerekir"
}
```
Kurallar: `vram` kontrolü GPU yoksa ve bileşen `gpu_required` ise **fail**; GPU yok ama `gpu_required=false` ise **warn** + `cpu_note`.
`shared=true` ve aynı model/artifact zaten kuruluysa disk ve bellek **0** sayılır. KV önbellek payı: LLM bileşenleri için
`+0.25 GB × beklenen eş zamanlı kullanıcı (varsayılan 8)`. Toplam > %90 kapasite → fail, > %75 → warn.
Ek kurallar (uygulandı): modül biçimi belirtmemişse ve tercih edilen biçim %90 sınırını aşıyorsa sığan sonraki biçim seçilir
(48 GB GPU'da ana model fp8 yerine GGUF Q4); GPU'da çalışan bileşen RAM'e yalnız `ram_gb − vram_gb` yazar; Apple birleşik
bellekte RAM denetimi RAM + VRAM toplamıyla yapılır; `tier` denetimi (makine katmanı modül katmanından düşükse warn) ve
`runtime` denetimi (vLLM seçili ama NVIDIA/Docker GPU yoksa fail); eksik bağımlılık warn sayılır ve kurulum onları aynı
işte önce kurar. Rapor alanları ayrıca: `skipped_optional`, `profile_tier`, `module_tier`; `selected[]` içinde `delegated`,
`on_gpu`, `kv_cache_gb`, `optional`, `gpu_required`, `cpu_note`, `note`. Ek uçlar: `GET /api/catalog/plan?modules=a,b`,
`POST /api/modules/{id}/uninstall?force=true` (bağımlı modül varsa 409 `has_dependents`).

### Kurulum ve işler (cekirdek)
| POST | `/api/modules/{id}/install` | gövde `{"target": "auto|server|client", "artifacts": {"role": "artifact_id"}?, "with_optional": false}` → `202 {"job_id"}` |
| POST | `/api/modules/{id}/uninstall` | paylaşılan modelleri yalnız başka modül kullanmıyorsa siler |
| GET | `/api/modules` | kurulu modüller + durum (installed, enabled, running, health) |
| POST | `/api/modules/{id}/enable` / `disable` | |
| GET | `/api/jobs` , `/api/jobs/{id}` | `{id, kind, module_id, status: queued|running|done|failed|cancelled, progress: 0-100, step, log: [..son 50 satır..], started_at, finished_at, error}` |
| GET | `/api/jobs/{id}/events` | SSE akışı (text/event-stream): progress ve log satırları |
| POST | `/api/jobs/{id}/cancel` | |

Kurulum adımları (sırayla, her biri ilerleme yazar): bağımlılık modüllerini denetle → uygunluk (fail ise iptal) →
`pip install aiplatform[extras]` (alt süreç) → sistem paketi uyarısı (apt/brew komutu göster, otomatik kurmaz) →
`huggingface_hub.snapshot_download(repo, allow_patterns=hf_files, local_dir=models_dir/<model>/<artifact>)`
(ilerleme: indirilen bayt / toplam) → LLM ise motoru başlat (llama-server / vLLM docker / `ollama pull`) ve `/v1/models` bekle →
`installed_models`, `installed_modules` kaydı → modül `health()`.

LLM motoru seçimi (`installer/engine.py`): `AIP_LLM_ENGINE=auto` → NVIDIA GPU + Docker (gpu runtime) varsa **vLLM**
(`vllm/vllm-openai`), yoksa Ollama kuruluysa **Ollama** (`ollama pull <ollama_tag>`), yoksa **llama-server**
(`python -m llama_cpp.server` veya PATH'teki `llama-server`) GGUF ile. Hepsi OpenAI uyumlu `/v1` sunar; `AIP_LLM_BASE_URL`
buna göre güncellenir. Motor süreci `installer/process.py` ile yönetilir (başlat, durdur, log, otomatik yeniden başlat).

### Modül çalıştırma ve geçit (moduller)
| POST | `/api/modules/{id}/run/{action}` | JSON gövde veya `multipart/form-data` (dosya alanları `ctx.files`). Yanıt `{"result": {...}, "meta": {"module", "action", "model", "duration_ms", "masked_entities": n}}`. Kurulu değil → 409 `{"error": {"code": "not_installed", "hint": "POST /api/modules/{id}/install"}}`; hazır değil → 503. |
| POST | `/v1/chat/completions`, GET `/v1/models` | OpenAI uyumlu geçit: maskeleme (istemcide) + güvenlik denetimi (varsa) + model seçimi (`llm_model_priority` içinden kurulu ilk) + denetim günlüğü; vekil olarak LLM motoruna iletir, `stream: true` desteklenir |
| POST | `/api/kvkk/mask`, `/api/kvkk/unmask`, `/api/kvkk/scan` | KVKK Kalkanı kısa yolları (modül run ile aynı işlev) |

`runtimes/llm.py` — `LLMClient`: `chat(messages, *, json_schema=None, tools=None, temperature=0.2, max_tokens=None, model=None, images=None, preferred=None, extra=None) -> LLMResult(content, tool_calls, usage, model, raw, parsed, masked_entities, endpoint)`,
`stream_chat(...)`, `embed(texts, model_id)`, `available_models()`. İstemci rolünde sunucuya giden mesajlar maskelenir ve yanıt geri açılır
(akışta da); sunucuya ulaşılamazsa yerel küçük LLM'e düşer ve veri makineden çıkmadığı için maskelemez.

Uygulanan ek kurallar: istemci rolünde iletim, maskeleme zorunluysa **veya** zorunlu bileşenlerin hepsi sunucudaysa yapılır; iç içe tüm
metin alanları maskelenir (base64 ve dosya alanları atlanır); yüklenen dosyalar (görüntü/ses/PDF) maskelenemez → meta `files_unmasked`
uyarısı. Geçitte kurulu olmayan katalog modeli istenirse `auto`'ya düşülür ve `X-AIP-Model-Fallback: auto` başlığı döner. Kullanıcı
kimliği şimdilik `X-AIP-User` başlığından okunur (kimlik doğrulama katmanı bunun yerini alacak). 202 gövdesi `{"approval_id","message","meta"}`.
Ek hata kodları: `module_disabled` (409), `unknown_module` / `unknown_action` (404), `blocked_by_policy` (400, ek alan `risk`), `mapping_not_found` (404).
Veri klasörü (`AIP_DATA_DIR`) dosyaları: `platform.db`, `kvkk.key` (Fernet anahtarı), `vectors.db`, `evrak_siniflar.json`, `llm_engine.json`,
`webhook_routes.json`, klasörler `models/`, `logs/`, `classifiers/`, `tablo_ml/`, `glossaries/`, `sozlesme_kontrol/`, `sozlesme_standartlari/`.

### ERP, denetim, onaylar (erp-web)
| GET/POST | `/api/erp/connections` | salt-okunur SQL bağlantıları (URL gizlenir), tablo beyaz listesi; `POST .../{id}/test` |
| GET | `/api/erp/connections/{id}/schema` | izinli tabloların DDL özeti (Text2SQL istemine girer) |
| POST | `/api/erp/webhooks/{source}` | ERP'den olay (ör. yeni belge) — HMAC imza doğrulanır, `webhook_events` tablosuna yazılır, eşlenen modül eylemi iş olarak kuyruğa alınır |
| GET | `/api/approvals` , POST `/api/approvals/{id}/decide` `{"decision": "approve|reject", "note"}` | insan onayı kuyruğu |
| GET | `/api/audit?from&to&module&user&limit` , GET `/api/audit/summary` | denetim günlüğü ve KVKK raporu (maskelenen varlık sayıları, modül kullanımı) |
| GET | `/api/erp/tools` | iş akışı ajanının kullanabileceği araç tanımları (OpenAI function şeması): okuma araçları serbest, yazma araçları `human_approval` |

Uygulanan ek uçlar: `POST /api/erp/connections/demo` (örnek ERP'yi kurar), `PATCH`/`DELETE /api/erp/connections/{id}`,
`POST /api/erp/connections/{id}/query`, `POST /api/erp/tools/call` (okuma aracı çalışır, yazma aracı onaya düşer), `GET /api/erp/webhooks`.
Bağlantı türleri `sql | rest | mock` (yalnız mock'un yazma aracı vardır: `fatura_oneri_olustur`). Ortam değişkeni bağlantıları
`varsayilan` (AIP_ERP_DB_URL) ve `erp-api` (AIP_ERP_API_BASE_URL) kimliğiyle listelenir. Onay durumları `pending | approved | rejected |
executed | failed` (çalışırken hata → failed, hata `result.error`). Onay kaydı sözleşmesi: `module="erp"` ise `action` araç adı, payload
`{"connection_id","args"}`; katalog modülüyse modül `ctx.extra={"approved": True, "approval_id": ...}` ile yeniden çağrılır ve yalnız o zaman yazar.
Araç adları `erp_<bağlantı>__<araç>` ve `<modül>__<eylem>`; her araçta `human_approval` ve `source`. Geçersiz imzalı webhook gövdesi saklanmaz;
eşlenen eylem onaylıysa iş kuyruğu yerine onay kuyruğuna gider. `/api/audit` yanıtı `{items, total, limit, offset, modules, available}`.
Kullanıcı kimliği her yerde `X-AIP-User` başlığıdır; onay kararları için gerçek kimlik doğrulama katmanı gerekir (yol haritası).

`erp/connector.py` soyut sınıf: `ERPConnector.list_tools()`, `call_tool(name, args) -> dict`, `read_only: bool`.
Uygulamalar: `SQLReadOnlyConnector` (SQLAlchemy, yalnız beyaz liste tablolar, `SET TRANSACTION READ ONLY`/salt-okunur kullanıcı),
`RESTConnector` (OpenAPI'den araç üretir; `AIP_ERP_API_BASE_URL`), `MockERP` (SQLite örnek veri: cari, fatura, stok, satış — demo ve testler).

### Yönetim arayüzü (erp-web) — `aiplatform/web/` (derleme adımı yok: HTML + CSS + ES modülleri)
Sayfalar: **Mağaza** (modül kartları, uygunluk rozeti ok/warn/fail, "Kur" düğmesi, gereksinim paneli: gereken/mevcut VRAM-RAM-disk çubukları ve Türkçe öneri, kurulum ilerleme çubuğu SSE ile),
**Kurulu Modüller** (durum, etkin/pasif, sağlık, kaldır), **Sistem** (donanım profili, katman T0-T3, kapasite çubukları),
**Denetim** (günlük tablosu, KVKK özeti), **Onaylar** (bekleyen yazma işlemleri), **ERP** (bağlantılar, test, şema).
Tüm metinler Türkçe. Yalnız göreli `/api/...` çağrıları.

## Veritabanı tabloları
- `installed_models(model_id, artifact_id, path, size_gb, runtime, installed_at)` ; `installed_modules(module_id, target, enabled, installed_at, config_json)` ; `jobs(...)` — cekirdek
- `audit_log(id, ts, user, module, action, model, duration_ms, masked_entities, status, error, payload_hash)` ; `mask_mappings(mapping_id, created_at, mapping_json_encrypted)` — moduller
- `erp_connections`, `approvals(id, module, action, payload_json, requested_by, status, decided_by, decided_at, note)`, `webhook_events` — erp-web

## Test ilkeleri
- Model indirmeyen, ağa çıkmayan testler varsayılan (`pytest`); indirme gerektirenler `@pytest.mark.slow`.
- Donanım tarama testleri `psutil`/`nvidia-smi` çıktısını taklit eder; uygunluk hesapları sahte profillerle (T0 16 GB RAM GPU'suz, T1 RTX 4090, T2 48 GB) kontrol edilir.
- LLM istemcisi testleri `httpx.MockTransport` ile OpenAI uyumlu sahte sunucuya gider.
- Finans motoru testleri bilinen sonuçlarla (ör. 100 yatırım, 5×30 nakit akışı → basit geri ödeme 3,33 yıl).
- TCKN sağlama algoritması testleri geçerli/geçersiz örneklerle (gerçek kişi numarası kullanılmaz, algoritmayla üretilir).
