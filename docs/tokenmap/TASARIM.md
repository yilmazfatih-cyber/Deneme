# TokenMap — yerel ürün analitiği düzlemi (tasarım)

**Amaç:** Mixpanel, Hotjar ve Sensor Tower verisini tek bir yerel depoda toplamak; her veri satırının
Claude için kaç token tuttuğunu (`token_count`) ve hangi satırlarla birlikte kullanıldığını (`token_map`)
çıkarmak; uygulama ekranlarını bu veriyle eşlemek; kampanya etkisini ölçmek ve yeni geliştirmeler için
kullanıcı simülasyonu çalıştırmak. Hepsi şirket Claude Code'una bir **MCP sunucusu** olarak bağlanır.

**Kritik şart:** Veri bilgisayardan çıkmaz. Depo, hesaplama ve arayüz tamamen yerelde çalışır.
Yalnızca iki şey dışarı konuşur: (1) üçüncü taraf API'lerden veri **çekme** (Mixpanel, Sensor Tower),
(2) Claude Code'un kendi model çağrısı. Claude'a yalnızca senin açıkça istediğin, bütçelenmiş özet gider.

---

## 1. Kavramlar

| Kavram          | Tanım                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **Veri satırı** | Mixpanel'deki bir olay (event), bir özellik (property), bir ekran, bir kampanya veya bir Hotjar kaydı.  |
| **Token**       | Satırın Claude'a gönderilecek serileştirilmiş halinin token sayısı (model bazlı, Opus 5.5 ölçeği).      |
| **token_count** | Satır başına: ham token, özet token, günlük toplam. Claude'un bağlam bütçesini planlamasını sağlar.      |
| **token_map**   | Satırlar arası ilişki çizgesi: aynı oturumda birlikte geçme, huni geçişi, ekran→olay, kampanya→olay.    |
| **Bağlam paketi** | Belirli bir token bütçesine (ör. 20k) sığacak şekilde önceliklendirilmiş, Claude'a verilecek özet.   |
| **Senaryo**     | Önerilen bir geliştirmenin davranış değişikliği varsayımı (ör. "ödeme ekranında bir adım azalır").       |

Neden token bazlı? Mixpanel'den ham veri milyonlarca satırdır. Claude'un bunu doğrudan okuması mümkün
değildir. TokenMap, her satırın maliyetini önceden bilir ve Claude'a "bu soruya cevap için şu 14 satır,
toplam 6.200 token yeter" diyebilir. Analiz böylece hızlanır ve ucuzlar.

---

## 2. Mimari

```
┌──────────────────────────── Bilgisayarın (localhost) ────────────────────────────┐
│                                                                                  │
│  Bağlayıcılar (ingest)           Depo                      Motorlar              │
│  ┌─────────────┐                 ┌────────────┐            ┌──────────────────┐  │
│  │ Mixpanel    │──raw events──▶  │ DuckDB     │ ◀────────▶ │ Token motoru     │  │
│  │ Hotjar      │──csv/png────▶   │ + Parquet  │            │ (count + map)    │  │
│  │ Sensor Tower│──json───────▶   │ data/      │            ├──────────────────┤  │
│  │ Ekranlar    │──png/json───▶   │            │            │ Etki motoru      │  │
│  └─────────────┘                 └────────────┘            │ (kampanya)       │  │
│                                         ▲                  ├──────────────────┤  │
│                                         │                  │ Simülasyon motoru│  │
│                                         │                  └──────────────────┘  │
│                                         │                                        │
│  ┌──────────────────────────┐    ┌──────┴───────┐    ┌───────────────────────┐  │
│  │ Yerel arayüz (web UI)    │◀──▶│ API (FastAPI)│◀──▶│ MCP sunucusu (stdio)  │  │
│  │ http://localhost:8787    │    │              │    │ ◀── Claude Code       │  │
│  └──────────────────────────┘    └──────────────┘    └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Teknoloji seçimi (önerilen):**

| Katman        | Seçim                                            | Gerekçe                                              |
| ------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Dil           | Python 3.12                                      | DuckDB, pandas, statsmodels; MCP SDK olgun.           |
| Depo          | DuckDB (tek dosya) + Parquet                     | Sunucusuz, sütunsal, milyonlarca olayda hızlı.       |
| MCP           | `mcp` paketi (FastMCP), stdio taşıma             | Claude Code `.mcp.json` ile doğrudan tanır.           |
| API + UI      | FastAPI + React/Vite (statik derlenir)           | Tek `python -m tokenmap serve` ile açılır.            |
| Ekran yakalama| Playwright (web) / Maestro veya Appium (mobil)   | Ekranların PNG'sini ve ekran adını otomatik alır.     |
| İstatistik    | statsmodels, `causalimpact` (BSTS)               | Kampanya etkisi için nedensel zaman serisi.           |
| Simülasyon    | numpy Markov zinciri + Monte Carlo               | Tamamen çevrimdışı; persona katmanı isteğe bağlı.     |
| Gizlilik      | `.env` yalnızca yerelde; `distinct_id` hash'lenir| Kişisel veri depoya ham girmez.                       |

Alternatif: Şirket yalnızca TypeScript kullanıyorsa aynı tasarım `@modelcontextprotocol/sdk` +
`@duckdb/node-api` ile yazılabilir. Yalnızca nedensel analiz için Python'a ihtiyaç kalır.

---

## 3. Klasör yapısı

```
tokenmap/
├── pyproject.toml
├── .env.example              # MIXPANEL_PROJECT_ID, MIXPANEL_SA_USER/SECRET, SENSORTOWER_TOKEN, ...
├── tokenmap.yaml             # proje ayarları: ekran eşleme kuralları, kampanya takvimi yolu, token bütçeleri
├── data/
│   ├── tokenmap.duckdb       # tek dosya depo
│   ├── raw/                  # Parquet: mixpanel/YYYY-MM-DD.parquet, sensortower/..., hotjar/...
│   ├── screens/              # PNG + screens.json (ekran adı, rota, olaylar)
│   └── campaigns.csv         # kampanya takvimi (ad, kanal, başlangıç, bitiş, bütçe, hedef ülke)
├── src/tokenmap/
│   ├── connectors/
│   │   ├── mixpanel.py       # Export API (ham olay), Query API (segmentasyon/huni), Lexicon (şema)
│   │   ├── hotjar.py         # CSV içe aktarma (anket, geri bildirim), ısı haritası PNG eşleme
│   │   ├── sensortower.py    # indirme/gelir tahmini, puan, anahtar kelime sırası, reklam zekâsı
│   │   └── screens.py        # Playwright/Maestro ile ekran yakalama ve ekran→olay eşleme
│   ├── store/
│   │   ├── schema.sql        # tablolar (bölüm 4)
│   │   └── db.py
│   ├── tokens/
│   │   ├── counter.py        # token_count: yerel tahminci + isteğe bağlı count_tokens kalibrasyonu
│   │   ├── mapper.py         # token_map: birlikte geçme, huni, ekran, kampanya kenarları
│   │   └── packer.py         # bağlam paketi: bütçeye göre satır seçimi
│   ├── impact/
│   │   └── campaign.py       # fark-içinde-fark + BSTS; Sensor Tower × Mixpanel birleştirme
│   ├── sim/
│   │   ├── markov.py         # olay dizilerinden geçiş matrisi (segment bazlı)
│   │   ├── scenario.py       # senaryo tanımı ve matris düzenleme
│   │   └── runner.py         # Monte Carlo koşusu, güven aralıkları
│   ├── mcp_server.py         # Claude Code'un gördüğü araçlar (bölüm 5)
│   ├── api.py                # FastAPI; UI ve MCP aynı servis katmanını kullanır
│   └── cli.py                # tokenmap sync | tokens | serve | sim | impact
├── ui/                       # React + Vite; derlenince src/tokenmap/static/ altına kopyalanır
└── tests/
```

---

## 4. Veri modeli (DuckDB)

```sql
-- Ham olaylar (Mixpanel Export API). distinct_id hash'li saklanır.
CREATE TABLE events (
  event_id      UBIGINT,          -- deterministik hash(insert_id)
  name          VARCHAR,
  ts            TIMESTAMP,
  user_hash     VARCHAR,          -- sha256(distinct_id + yerel tuz)
  session_id    VARCHAR,          -- 30 dk boşluk kuralıyla türetilir
  screen        VARCHAR,          -- $screen_name / current_url'den normalize edilir
  platform      VARCHAR,          -- ios | android | web
  country       VARCHAR,
  props         JSON              -- PII süzülmüş özellikler
);

-- Mixpanel Lexicon'dan olay ve özellik tanımları
CREATE TABLE lexicon (
  kind          VARCHAR,          -- event | property
  name          VARCHAR,
  description   VARCHAR,
  owner         VARCHAR,
  last_seen     DATE
);

-- Her veri satırı için token maliyeti
CREATE TABLE token_count (
  row_kind      VARCHAR,          -- event | property | screen | campaign | hotjar_item
  row_key       VARCHAR,          -- olay adı, "event.prop", ekran adı, kampanya id
  period        DATE,             -- günlük; NULL = tüm dönem
  rows_n        UBIGINT,          -- kaç kayıt
  tokens_raw    UBIGINT,          -- ham JSON satırlarının toplam tokeni
  tokens_summary UINTEGER,        -- özetin tokeni (Claude'a giden gerçek maliyet)
  tokens_per_row DOUBLE,          -- tokens_raw / rows_n
  model         VARCHAR,          -- sayımın kalibre edildiği model
  computed_at   TIMESTAMP
);

-- Satırlar arası ilişkiler
CREATE TABLE token_map (
  src_kind      VARCHAR, src_key VARCHAR,
  dst_kind      VARCHAR, dst_key VARCHAR,
  edge          VARCHAR,          -- cooccur | funnel | screen_event | campaign_lift | hotjar_screen
  weight        DOUBLE,           -- edge'e göre: lift (PMI), geçiş olasılığı, etki katsayısı
  support       UBIGINT,          -- kaç oturum/kullanıcı üzerinde
  tokens_joint  UBIGINT,          -- iki satırı birlikte anlatmanın token maliyeti
  period        DATE
);

-- Ekranlar
CREATE TABLE screens (
  name          VARCHAR PRIMARY KEY,
  route         VARCHAR,
  platform      VARCHAR,
  image_path    VARCHAR,          -- data/screens/<name>.png
  hotjar_heatmap VARCHAR,         -- isteğe bağlı ısı haritası PNG
  events        VARCHAR[]         -- bu ekranda tetiklenen olaylar
);

-- Sensor Tower günlük metrikleri
CREATE TABLE market_daily (
  date DATE, platform VARCHAR, country VARCHAR,
  downloads BIGINT, revenue_usd DOUBLE, rating DOUBLE,
  keyword VARCHAR, keyword_rank INTEGER
);

-- Kampanyalar ve ölçülen etkileri
CREATE TABLE campaigns (id VARCHAR PRIMARY KEY, name VARCHAR, channel VARCHAR,
  start_date DATE, end_date DATE, budget DOUBLE, country VARCHAR);

CREATE TABLE campaign_impact (
  campaign_id VARCHAR, metric VARCHAR,      -- downloads | signup | activation | d7_retention ...
  method VARCHAR,                            -- did | bsts
  effect DOUBLE, ci_low DOUBLE, ci_high DOUBLE, p_value DOUBLE,
  computed_at TIMESTAMP
);

-- Simülasyon
CREATE TABLE sim_runs (
  run_id VARCHAR PRIMARY KEY, scenario JSON, segment VARCHAR,
  n_users INTEGER, baseline JSON, result JSON, created_at TIMESTAMP
);
```

### 4.1 token_count nasıl hesaplanır

1. Satır serileştirilir: olay için `{name, ts, screen, props}` kompakt JSON; özellik için değer dağılımı özeti.
2. **Yerel tahminci** token sayar. Claude tokenizer'ı yerelde yoktur; bu yüzden karakter sınıfı bazlı
   bir tahminci kullanılır (ASCII ≈ 3,8 karakter/token, Türkçe ≈ 2,9, sayı/JSON noktalama ≈ 2,2).
3. **Kalibrasyon** isteğe bağlıdır ve internet ister: 200 örnek satır `count_tokens` ile sayılır,
   tahminciye düzeltme katsayısı yazılır. Bir kez yapılır, `model` sütununa işlenir. `tiktoken` kullanılmaz;
   Claude için yanlış sayar.
4. Günlük ve toplam düzeyde `token_count` tablosuna yazılır. Özet tokeni, `packer` modülünün ürettiği
   gerçek özet metninden sayılır.

### 4.2 token_map nasıl kurulur

| Kenar           | Hesap                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| `cooccur`       | Aynı oturumda geçen olay çiftleri; ağırlık = PMI (karşılıklı bilgi), destek = oturum sayısı. |
| `funnel`        | A'dan sonra 10 dk içinde B'ye geçiş olasılığı; `sim/markov.py` ile aynı matris.    |
| `screen_event`  | Ekranda tetiklenen olaylar; ağırlık = ekran görüntülenmesi başına olay oranı.      |
| `campaign_lift` | Kampanya döneminde olayın etkisi (`campaign_impact.effect`).                        |
| `hotjar_screen` | Hotjar anket/geri bildirim öğelerinin ekranla eşleşmesi (URL veya ekran adıyla).   |

"Bu veri satırı başka hangi satırlarla etkin kullanılıyor?" sorusu doğrudan `token_map` üzerinde
`src_key = X ORDER BY weight DESC` sorgusudur; her kenar `tokens_joint` taşıdığı için Claude cevabın
maliyetini de görür.

---

## 5. Claude Code entegrasyonu (MCP)

Depo köküne `.mcp.json` eklenir; şirketteki herkes aynı dosyayla aynı araçları görür:

```json
{
  "mcpServers": {
    "tokenmap": {
      "command": "python",
      "args": ["-m", "tokenmap.mcp_server"],
      "env": { "TOKENMAP_HOME": "${HOME}/tokenmap" }
    }
  }
}
```

Alternatif: `claude mcp add tokenmap -- python -m tokenmap.mcp_server`.

### 5.1 Araçlar

| Araç                     | Girdi                                              | Çıktı                                                        |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| `sync`                   | `source` (mixpanel/sensortower/hotjar/screens), tarih aralığı | Çekilen satır sayısı, süre, hata listesi            |
| `token_count`            | `row_kind?`, `row_key?`, `period?`, `top_n?`       | Satır başına token tablosu; toplam bütçe                     |
| `token_map`              | `row_key`, `edge?`, `min_weight?`, `limit?`        | İlişkili satırlar, ağırlık, destek, `tokens_joint`           |
| `context_pack`           | `question`, `budget_tokens`, `period?`             | Bütçeye sığan özet (satır seçimi açıklamasıyla)              |
| `query_events`           | DuckDB SQL (yalnızca SELECT)                       | En fazla N satır; satır sayısı ve token tahmini              |
| `funnel`                 | olay listesi, pencere, segment                     | Adım dönüşümleri, düşüş noktaları, ekran eşlemesi            |
| `screen_get`             | `screen_name`                                      | PNG (image içerik bloğu) + o ekranın olay/metrik özeti       |
| `screen_overlay`         | `screen_name`, `metric`, `period`                  | Üzerine metrik yazılmış PNG (dönüşüm, düşüş, Hotjar ısı)     |
| `campaign_impact`        | `campaign_id`, `metrics[]`, `method?`              | Etki, güven aralığı, kontrol serisi; grafik PNG              |
| `sim_run`                | `scenario`, `segment`, `n_users`, `horizon_days`   | Temel vs senaryo: dönüşüm, retention, güven aralıkları       |
| `sim_scenarios`          | —                                                  | Kayıtlı senaryolar ve sonuçları                              |

Kurallar:
- Her araç yanıtı başına `tokens_used` ve `tokens_available_next` alanı koyar. Claude bir sonraki
  adımı buna göre planlar.
- `query_events` yalnızca `SELECT` kabul eder; `user_hash` dışında kimlik alanı dönmez.
- Araç yanıtları varsayılan olarak 4k token ile sınırlıdır; daha fazlası için `context_pack` kullanılır.

### 5.2 Claude Code'daki kullanım örneği

```
> Ödeme ekranındaki düşüşü analiz et.
Claude → token_count(row_kind="screen", row_key="checkout")        # 1.1k token
Claude → token_map(row_key="checkout", edge="funnel")              # 2.4k token
Claude → screen_overlay("checkout", metric="dropoff", period=...)  # PNG
Claude → context_pack("checkout düşüş nedenleri", budget=12000)
```

Dört çağrı, toplam ~16k token. Ham veri hiç gönderilmez.

Şirket Claude'u için ayrıca `.claude/agents/analist.md` alt ajanı tanımlanır: yalnızca TokenMap
araçlarını kullanır, sonucu `docs/analiz/<tarih>-<konu>.md` dosyasına yazar.

---

## 6. Bağlayıcılar ve sınırlar

### Mixpanel
- **Export API** (`/api/2.0/export`): ham olaylar, gün gün Parquet'e yazılır. Hizmet hesabı ile kimlik.
- **Query API**: segmentasyon ve huni; saatte ~60 sorgu sınırı vardır, bu yüzden hesaplar yerelde DuckDB'de yapılır.
- **Lexicon Schemas API**: olay ve özellik tanımları `lexicon` tablosuna.
- Artımlı çekim: son çekilen gün `sync_state` tablosunda tutulur. İlk çekim büyükse gece çalıştırılır.

### Hotjar
- Hotjar'ın kayıt ve ısı haritaları için **resmî veri API'si yoktur**. Tasarım bunu varsayar:
  - Anket ve geri bildirim yanıtları: Hotjar'dan CSV dışa aktarım → `hotjar.py` içe aktarır.
  - Isı haritaları: Hotjar'dan PNG indirilir, `data/screens/heatmaps/<ekran>.png` olarak eşlenir.
  - Kayıt bağlantıları: Hotjar'a `user_hash` özniteliği gönderilirse (Identify API, istemci tarafı),
    Mixpanel oturumuyla eşleştirilebilir. Kaydın kendisi TokenMap'e girmez; yalnızca bağlantı tutulur.
- Bu, kabul edilmesi gereken bir sınırdır; Hotjar ileride API açarsa bağlayıcı değişir, model değişmez.

### Sensor Tower
- REST API (`api.sensortower.com/v1`), API token ile. İndirme ve gelir tahminleri, puanlar,
  anahtar kelime sıraları, reklam zekâsı (rakip kampanyaları).
- Günlük granülerlik; ülke ve platform bazında `market_daily`'ye yazılır.
- API erişimi plana bağlıdır; erişim yoksa CSV dışa aktarım aynı tabloya içe aktarılır.

### Ekranlar
- Web: Playwright ile rota listesi gezilir, her rota için PNG + ekran adı.
- Mobil: Maestro akışı veya Appium betiği ile emülatörde ekran ekran yakalama. Alternatif olarak
  tasarım ekibinden Figma dışa aktarımı `data/screens/` altına konur.
- Ekran→olay eşlemesi iki kaynaktan: Mixpanel `$screen_name`/`current_url` özelliği ve
  `tokenmap.yaml` içindeki elle yazılmış kurallar (regex → ekran adı).

---

## 7. Kampanya etki motoru

Soru: "X kampanyası neyi etkiledi?"

1. **Birleştirme:** `market_daily` (Sensor Tower indirme, sıralama) + Mixpanel günlük olay sayıları
   (kayıt, aktivasyon, D1/D7 retention) tek zaman serisine getirilir; ülke ve platform kırılımında.
2. **Kontrol serisi:** Kampanyanın dokunmadığı ülke/platform kontrol olarak seçilir (otomatik: kampanya
   öncesi korelasyonu en yüksek seri).
3. **Yöntem A — Fark-içinde-fark (DiD):** hızlı, yorumlaması kolay.
4. **Yöntem B — BSTS (CausalImpact):** kontrol serisiyle karşı-olgusal tahmin; güven aralığı verir.
5. Sonuç `campaign_impact`'e yazılır ve `token_map`'te `campaign_lift` kenarı olarak görünür.
   Böylece "kampanya → kayıt artışı → ama ödeme ekranında düşüş" zinciri tek sorguda okunur.

Çıktı: metrik başına etki (mutlak ve yüzde), güven aralığı, grafik PNG, 6 kelimelik Türkçe özet.

---

## 8. Kullanıcı simülasyonu

İki katman; birincisi tamamen çevrimdışı ve varsayılan:

### Katman 1 — Davranış modeli (çevrimdışı)
- Mixpanel oturumlarından segment bazlı **Markov geçiş matrisi** çıkarılır
  (durum = ekran veya olay; segment = platform × ülke × yeni/dönen).
- Senaryo, matris üzerinde düzenleme olarak tanımlanır:

```yaml
scenario: "tek adımlı ödeme"
segment: ios/TR/new
edits:
  - remove_state: checkout_address        # adım kaldırıldı
  - set_transition: {from: checkout_cart, to: checkout_pay, p: 0.78}  # tahmin, kaynak: benzer geçmiş değişiklik
  - scale_exit: {state: checkout_pay, factor: 0.9}
assumption_source: "2025-Q3 adres otomatik doldurma deneyi, +9 puan"
```

- **Monte Carlo:** 50.000 sanal kullanıcı, 30 günlük ufuk, 200 tekrar → dönüşüm, retention,
  gelir dağılımı ve %90 güven aralığı. Temel ile yan yana.
- Her senaryo varsayımının kaynağını zorunlu tutar (`assumption_source`). Kaynaksız varsayım uyarı üretir.

### Katman 2 — Persona ajanları (isteğe bağlı, Claude gerektirir)
- Claude Code, ekran PNG'leri ve senaryo ile 20–50 persona üretir ve her birini ekranlarda "yürütür";
  çıktı olay dizisidir ve Katman 1 matrisine önsel olarak katılır.
- Bu katman model çağrısı yaptığı için yalnızca ekran görüntüleri ve toplulaştırılmış istatistik gönderir;
  kullanıcı verisi gönderilmez.

### Doğrulama
- Geçmişte yapılmış bir geliştirme seçilir; öncesi verisiyle simülasyon koşulur; sonrası gerçek veriyle
  karşılaştırılır. Hata payı `docs/sim-kalibrasyon.md`'ye yazılır. Bu yapılmadan simülasyon sonuçları
  "tahmin" etiketiyle gösterilir.

---

## 9. Yerel arayüz

`tokenmap serve` → `http://localhost:8787`. Beş ekran:

1. **Harita:** `token_map` çizgesi; düğüm boyutu = token_count, kenar kalınlığı = ağırlık. Düğüme tıkla → satır detayı.
2. **Ekranlar:** Uygulama ekran galerisi; her ekranın üstünde dönüşüm, düşüş, Hotjar ısı katmanı (aç/kapa).
3. **Huni:** Olay zinciri seçimi, ekran görüntüleri adımların yanında.
4. **Kampanyalar:** Takvim + etki grafikleri; Sensor Tower ve Mixpanel serileri üst üste.
5. **Simülasyon:** Senaryo düzenleyici (YAML), koşu sonuçları, temel ile karşılaştırma.

Her ekranda "Claude'a gönder" düğmesi: seçili görünümü `context_pack` olarak panoya kopyalar
(`claude` oturumuna yapıştırılır). Böylece arayüz ve Claude Code aynı veriyi konuşur.

---

## 10. Gizlilik ve çevrimdışı garanti

- Dış ağ yalnızca `sync` komutunda ve yalnızca listedeki alan adlarına açılır
  (`mixpanel.com`, `api.sensortower.com`). Diğer her çağrı engellenir; test `tests/test_offline.py`.
- `distinct_id`, e-posta, IP, cihaz kimliği depoya girmeden hash'lenir veya silinir (`connectors/pii.py`).
- `.env` ve `data/` `.gitignore`'dadır. Depo dosyası isteğe bağlı olarak işletim sistemi disk şifrelemesine bırakılır.
- Claude'a giden her paket `logs/outbound/` altında kaydedilir; ne gittiği her zaman denetlenebilir.
- Kalibrasyon (`count_tokens`) kapalıdır; açılırsa yalnızca 200 örnek satır gider ve örnekler PII içermez.

---

## 11. Yol haritası

| Aşama | Süre   | Kapsam                                                                                     | Çıktı                            |
| ----- | ------ | ------------------------------------------------------------------------------------------ | -------------------------------- |
| 0     | 1 hafta| Depo, Mixpanel Export bağlayıcısı, `token_count`, MCP `sync` + `token_count` + `query_events` | Claude Code'dan ilk sorgu        |
| 1     | 2 hafta| `token_map` (cooccur, funnel), `context_pack`, Harita arayüzü                                | "Bu satır neyle kullanılıyor?"   |
| 2     | 2 hafta| Ekran yakalama, ekran→olay eşleme, `screen_overlay`, Hotjar CSV/PNG                          | Ekranlar + veri tek görünüm      |
| 3     | 2 hafta| Sensor Tower, kampanya takvimi, DiD + BSTS, Kampanyalar arayüzü                              | Kampanya etkisi raporu           |
| 4     | 3 hafta| Markov + Monte Carlo simülasyon, senaryo YAML, geçmiş deneyle kalibrasyon                    | İlk "ne olur" tahmini            |
| 5     | 1 hafta| Persona katmanı, `analist` alt ajanı, ekip kurulum belgesi                                   | Şirket geneline yayılım          |

Aşama 0 sonunda tek komutla kurulum: `pipx install tokenmap && tokenmap init && tokenmap sync mixpanel`.

---

## 12. Riskler ve kararlar

| Risk                                                   | Karar                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| Hotjar API'si yok                                      | CSV/PNG içe aktarım; eşleme ekran adıyla. Tasarım değişmez.           |
| Sensor Tower API plana bağlı                           | CSV yedek yolu aynı tabloya.                                          |
| Mixpanel Export büyük (GB)                             | Günlük Parquet, artımlı çekim, DuckDB sütunsal sıkıştırma.            |
| Token sayımı tahminî                                   | %±8 sapma kabul; isteğe bağlı kalibrasyon; tüm sayımlar `model` etiketli. |
| Simülasyon yanlış güven verir                          | Kaynaksız varsayım uyarısı; geçmiş deneyle zorunlu kalibrasyon; "tahmin" etiketi. |
| Claude Code internete çıkar                            | Kabul: model çağrısı için gerekli. Veri paketi denetim günlüğünde.    |
| İki dil (Python + React)                               | UI önceden derlenir; son kullanıcı yalnızca Python kurar.             |

Açık sorular (senin kararın):
1. Mobil ekranlar için emülatör mü, Figma dışa aktarımı mı? (İkisi de desteklenir; varsayılan Figma.)
2. Kampanya takvimi hangi kaynaktan gelecek? (Varsayılan: elle CSV; ileride reklam platformu API'si.)
3. Token sayımı için bir kerelik `count_tokens` kalibrasyonuna izin var mı? (Varsayılan: kapalı.)
