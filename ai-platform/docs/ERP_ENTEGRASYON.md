# ERP entegrasyonu

Platform ERP'nin **yanında** çalışır, içine gömülmez. ERP ile üç yoldan konuşur:

| Yol | Yön | Ne için | Nasıl |
| --- | --- | --- | --- |
| Salt-okunur SQL | platform → ERP DB | Doğal dil → SQL, zaman serisi, risk skorları, kayıt eşleştirme | `AIP_ERP_DB_URL` + tablo beyaz listesi; veritabanında **salt-okunur kullanıcı** |
| REST araçları | platform → ERP API | İş akışı ajanı, öneri kayıt açma | `AIP_ERP_API_BASE_URL` + token; OpenAPI belgesinden araçlar üretilir; yazma araçları onay kuyruğundan geçer |
| Webhook | ERP → platform | Yeni belge geldi, çağrı kaydı kapandı gibi olaylar | `POST /api/erp/webhooks/{source}`, HMAC-SHA256 imza |

ERP arayüzü ise platformu **HTTP ile** çağırır: `POST /api/modules/{modül}/run/{eylem}` veya OpenAI uyumlu
`POST /v1/chat/completions`. ERP eklentisi yalnız bu iki adresi bilir; model değişimi ERP'yi etkilemez.

## 1. Salt-okunur SQL bağlantısı

```bash
# ERP veritabanında (örnek PostgreSQL)
CREATE ROLE ai_readonly LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE erp TO ai_readonly;
GRANT USAGE ON SCHEMA public TO ai_readonly;
GRANT SELECT ON cari, fatura, fatura_kalem, stok, satis_aylik TO ai_readonly;
```

```bash
export AIP_ERP_DB_URL='postgresql+psycopg://ai_readonly:...@erp-db:5432/erp'
export AIP_ERP_ALLOWED_TABLES='["cari","fatura","fatura_kalem","stok","satis_aylik"]'
```

Platform ikinci bir savunma katmanı uygular: üretilen SQL `sqlglot` ile ayrıştırılır, yalnız tek `SELECT`
kabul edilir, beyaz liste dışı tablo reddedilir, `LIMIT` eklenir, zaman aşımı 15 sn. SQLite'ta `PRAGMA query_only`,
PostgreSQL'de `SET TRANSACTION READ ONLY` ayrıca zorlanır. MSSQL/MySQL'de salt-okunur kullanıcı şarttır.

Bağlantı yönetim arayüzünde **ERP** sayfasından eklenir ve "Test" ile denenir; `GET /api/erp/connections/{id}/schema`
Text2SQL istemine giren şema özetini gösterir (kişisel veri sütunlarının örnek değerleri maskelenir).

## 2. REST araçları ve onay kuyruğu

`AIP_ERP_API_BASE_URL` ve OpenAPI belgesi verildiğinde:

- `GET` uçları → **okuma araçları** (ajan serbestçe çağırır),
- `POST/PUT/PATCH/DELETE` uçları → **yazma araçları** (`human_approval=true`): ajan çağırmak istediğinde
  `approvals` kuyruğuna düşer, yönetim arayüzünün **Onaylar** sayfasında insan "Onayla" deyince çalışır.

Modüllerin ERP'ye yazan eylemleri de aynı kuyruktan geçer: `fatura-cikarim.propose_entry` ERP'de
"onay bekliyor" durumunda kayıt açar, muhasebeci ERP'de son onayı verir.

## 3. Webhook

ERP, olay olduğunda imzalı istek gönderir:

```
POST /api/erp/webhooks/evrak
X-Signature: sha256=<HMAC-SHA256(gövde, AIP_ERP_WEBHOOK_SECRET)>
{"event": "belge.yeni", "belge_id": 1234, "dosya_url": "...", "tur": "fatura"}
```

`~/.aiplatform/webhook_routes.json` olayı modül eylemine eşler:

```json
{"evrak": {"module": "evrak-siniflandirma", "action": "classify", "payload_map": {"file_url": "dosya_url"}}}
```

Eşleşen olay iş kuyruğuna alınır; sonuç `webhook_events` tablosunda ve denetim günlüğünde görünür.

## 4. ERP arayüzünden modül çağırma

```http
POST /api/modules/finans-hesap/run/payback
Content-Type: application/json

{"investment": 1200000, "cash_flows": [300000, 350000, 400000, 400000, 400000], "rate": 0.30}
```

```json
{"result": {"simple_years": 3.38, "discounted_years": null, "table": [...]},
 "meta": {"module": "finans-hesap", "action": "payback", "model": null, "duration_ms": 3, "masked_entities": 0}}
```

Dosya gerektiren eylemler `multipart/form-data` alır (`file` alanı). Uzun işler için `202 {"job_id"}` döner;
`GET /api/jobs/{id}` veya SSE `GET /api/jobs/{id}/events` ile izlenir.

OpenAI uyumlu geçit, ERP içindeki mevcut "sohbet" bileşenlerini tek satır değişiklikle platforma bağlar:

```python
from openai import OpenAI
client = OpenAI(base_url="http://ai-sunucu:8080/v1", api_key="yerel")
client.chat.completions.create(model="auto", messages=[{"role": "user", "content": "..."}])
```

## 5. Demo ERP

Gerçek ERP yokken `python -m aiplatform.erp.mock_erp ~/.aiplatform/mock_erp.db` sentetik cari, fatura, stok ve
aylık satış tabloları üretir (gerçek kişi veya şirket yok; VKN'ler sağlama algoritmasıyla üretilmiş sentetik).
Yönetim arayüzünde `sqlite:///.../mock_erp.db` bağlantısı eklenerek Text2SQL, zaman serisi ve onay akışı
uçtan uca denenir.

## Temas noktaları (katalogdan)

Her modülün `erp_touchpoints` alanı hangi ERP nesnelerine dokunduğunu söyler; "(öneri)" ibaresi onay kuyruğundan
geçtiğini, "db.readonly" salt-okunur SQL kullandığını belirtir. Tam liste: `GET /api/catalog/modules`.
