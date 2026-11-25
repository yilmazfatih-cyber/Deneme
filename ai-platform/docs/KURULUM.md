# Kurulum

## Önkoşullar

| | Sunucu | Çalışan bilgisayarı |
| --- | --- | --- |
| İşletim sistemi | Ubuntu 22.04+/Debian 12, Windows Server 2022, macOS 14+ | Windows 10/11, macOS 13+, Linux |
| Python | 3.11+ | 3.11+ |
| İsteğe bağlı | NVIDIA sürücü 550+ ve Docker (nvidia-container-toolkit) → vLLM; Ollama | — |
| Ağ | Yalnız kurulumda huggingface.co (veya şirket içi ayna `AIP_HF_ENDPOINT`) | Sunucuya HTTP |

## 0. En kolay yol: kurulum betiği (macOS / Linux)

```bash
cd ai-platform
./scripts/kur.sh            # ortam + bağımlılıklar + donanım taraması + testler
./scripts/kur.sh --demo     # + demo modülleri, sunucu ve tarayıcıda Demo ERP
./scripts/baslat.sh         # sonraki seferlerde yalnız başlatma
```

Seçenekler: `--testsiz`, `--tarayicisiz`, `--yardim`. Betik tekrar çalıştırılabilir; mevcut `.venv` yeniden
kullanılır. Her adımın ayrıntısı `kur.log` dosyasına yazılır, hata olursa son satırlar ekrana basılır.
Windows'ta şimdilik aşağıdaki elle kurulum adımları geçerlidir.

## 1. Sunucu (GPU veya CPU)

```bash
git clone <depo> && cd ai-platform
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[kvkk,belge,gomme,text2sql,erp-sql,dev]"
aiplatform probe                                      # donanım profili ve katman (T0-T3)
aiplatform serve --role server --host 0.0.0.0 --port 8080
```

Yönetim arayüzü: `http://<sunucu>:8080/`. **Mağaza** sayfasında modül kartları, her kartta "Kurulabilir /
CPU'da yavaş / Donanım yetersiz" rozeti; "Kur" düğmesi modeli indirir, bağımlılıkları kurar, LLM ise motoru
başlatır ve ilerlemeyi canlı gösterir.

Komut satırından aynı iş:

```bash
aiplatform check ana-model                 # gereksinim raporu (Türkçe)
aiplatform install kvkk-kalkani
aiplatform install ana-model               # Qwen3.5-35B-A3B indirir (23 GB), motoru başlatır
aiplatform plan ana-model fatura-cikarim bilgi-asistani konusma-metin   # toplu gereksinim
```

### Docker ile

```bash
cd docker
cp ornek.env .env            # AIP_DATA_DIR, ERP ayarları
docker compose --profile gpu up -d      # veya --profile cpu / --profile ollama
```

### LLM motoru

`AIP_LLM_ENGINE=auto` (varsayılan): NVIDIA GPU + Docker → vLLM; Ollama kuruluysa Ollama; aksi llama-server.
Elle seçmek için `AIP_LLM_ENGINE=llamacpp|vllm|ollama`. Motor adresi `AIP_LLM_BASE_URL`, varsayılan
`http://127.0.0.1:8001/v1`. Platform başlattığı motoru `~/.aiplatform/llm_engine.json`'a yazar ve yeniden
başlatmada okur.

llama-server için ya `llama.cpp` ikilisini PATH'e koyun ya da `pip install "aiplatform[llamacpp]"`
(CUDA için `CMAKE_ARGS="-DGGML_CUDA=on"`; Apple'da Metal otomatik).

### Kimlik doğrulama (sunucu ağa açıldığında zorunlu)

Platform yalnız `127.0.0.1`'e bağlıyken (tek kişilik laptop/demo) giriş istemez. `--host 0.0.0.0` ile ağa
açıldığı anda (`AIP_AUTH_MODE=auto`) her `/api` ve `/v1` isteği oturum veya API anahtarı ister. İlk yöneticiyi
sunucuda komut satırından oluşturun:

```bash
aiplatform user add fatih --role yonetici --display-name "Fatih Yılmaz"
aiplatform serve --role server --host 0.0.0.0 --port 8080
```

Sonraki kullanıcılar arayüzdeki **Kullanıcılar** sayfasından veya `aiplatform user add` ile eklenir.

| Rol | Yetki |
| --- | --- |
| Kullanıcı | modülleri çalıştırır, sonuçları görür, sohbet geçidini kullanır |
| Onaylayıcı | + ERP'ye yazan işlemleri onaylar/reddeder (kendi isteğini onaylayamaz: dört göz) |
| Yönetici | + modül kurar/kaldırır, ERP bağlantısı, kullanıcı ve anahtar yönetimi, denetim günlüğü |

ERP entegrasyonu ve betikler için API anahtarı (yalnız bir kez gösterilir):

```bash
aiplatform token create --user erp-servis --name erp-entegrasyon --days 365
curl -H "Authorization: Bearer aip_..." http://ai-sunucu:8080/api/catalog/modules
```

Parolalar scrypt ile özetlenir, anahtarlar yalnız SHA-256 özetiyle saklanır; tarayıcı oturumu HttpOnly +
SameSite=Strict çerezdir (varsayılan 12 saat). Aynı kullanıcı adı ve IP'den 5 hatalı denemede 5 dakika kilit.
Kullanıcı devre dışı bırakılınca açık oturumları ve anahtarları hemen geçersiz olur; her giriş, çıkış ve
yetki değişikliği denetim günlüğüne yazılır.

## 2. Çalışan bilgisayarı

Sunucuda kimlik doğrulama açıksa çalışan bilgisayarları için bir **istemci düğümü anahtarı** oluşturun. Bu
anahtar sunucuya çalışan adına gider ama yetkisi her zaman "Kullanıcı" ile sınırlıdır:

```bash
aiplatform user add muhasebe-pc-03 --role kullanici           # sunucuda, düğüm hesabı
aiplatform token create --user muhasebe-pc-03 --name muhasebe-pc-03 --delegate
```

```bash
pip install -e ".[kvkk,belge,gomme]"
export AIP_ROLE=client AIP_SERVER_URL=http://ai-sunucu.sirket.local:8080 AIP_SERVER_TOKEN=aip_...
aiplatform install kvkk-kalkani            # Presidio + GLiNER (1,2 GB), zorunlu
aiplatform serve --role client             # 127.0.0.1:8080
```

ERP istemcisi veya tarayıcı eklentisi yerel `http://127.0.0.1:8080/api/...` adresini çağırır; KVKK Kalkanı
metni maskeler, ağır işleri sunucuya iletir, yanıtı geri açar. Yerel küçük LLM istenirse `aiplatform install
yazma-asistani` (Qwen3.5-4B, 3,5 GB).

Toplu dağıtım: aynı komutlar Intune/GPO/Ansible betiğine konur; modeller bir kez indirilip paylaşılan
klasörden kopyalanabilir (`AIP_DATA_DIR` altındaki `models/`).

## 3. İnternetsiz (hava boşluklu) kurulum

1. İnternetli bir makinede `aiplatform install <modüller>` çalıştırın.
2. `~/.aiplatform/models/` ve pip tekerleklerini (`pip download`) taşıyın.
3. Hedefte `AIP_DATA_DIR` aynı yapıda; `HF_HUB_OFFLINE=1` ile çalıştırın. Kurulum motoru klasörde dosyalar
   varsa indirmeyi atlar.

## 4. Ayarlar (ortam değişkenleri, `AIP_` öneki)

| Değişken | Varsayılan | Anlam |
| --- | --- | --- |
| `AIP_ROLE` | server | server / client |
| `AIP_DATA_DIR` | ~/.aiplatform | modeller, veritabanı, günlükler |
| `AIP_SERVER_URL` | — | client rolünde sunucu adresi |
| `AIP_LLM_ENGINE` | auto | auto / llamacpp / vllm / ollama |
| `AIP_LLM_BASE_URL` | http://127.0.0.1:8001/v1 | OpenAI uyumlu motor |
| `AIP_LLM_CONTEXT_LENGTH` | 32768 | bağlam uzunluğu |
| `AIP_LLM_GPU_LAYERS` | -1 | llama.cpp: -1 hepsi GPU, 0 CPU |
| `AIP_ERP_DB_URL` | — | salt-okunur SQLAlchemy URL |
| `AIP_ERP_ALLOWED_TABLES` | [] | Text2SQL tablo beyaz listesi (JSON liste) |
| `AIP_ERP_API_BASE_URL`, `AIP_ERP_API_TOKEN` | — | ERP REST |
| `AIP_ERP_WEBHOOK_SECRET` | — | HMAC sırrı |
| `AIP_AUDIT_RETENTION_DAYS` | 30 | günlük ve eşleme saklama |
| `AIP_AUTH_MODE` | auto | auto: 127.0.0.1'de kapalı, ağa açıkken açık; on / off: zorla |
| `AIP_SESSION_HOURS` | 12 | tarayıcı oturumu süresi |
| `AIP_SERVER_TOKEN` | — | client rolünde sunucuya giderken istemci düğümü anahtarı |
| `AIP_APPROVAL_FOUR_EYES` | true | kimlik açıkken kişi kendi isteğini onaylayamaz |
| `AIP_HF_TOKEN`, `AIP_HF_ENDPOINT` | — | gated depo / şirket içi ayna |

## 5. Doğrulama

```bash
pytest -q                                   # ağsız birim testleri
python scripts/verify_models.py             # katalogdaki modelleri HF API ile doğrular (ağ gerekir)
curl -s localhost:8080/api/system/health | python -m json.tool
```
