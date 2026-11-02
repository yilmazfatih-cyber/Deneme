# Reklam Creative İstihbarat Pipeline'ı — Meta Ad Library + Google Ads

2 Kasım 2026 · Taslak tasarım · Köprü ve rakipleri için

Bu belge, Köprü'nün kendi reklamlarını ve rakiplerinin reklamlarını tek bir veri modelinde toplayan, her
creative'i (görsel, video, metin) otomatik etiketleyen ve haftalık karşılaştırmalı rapor üreten bir pipeline
tasarımıdır. Kod bu depoya değil, ayrı bir `kopru-ad-intel` deposuna girer; burada yalnızca tasarım durur.

---

## 1. Pipeline hangi sorulara cevap verir

| Soru                                                              | Nereden cevaplanır                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Rakipler bu hafta hangi yeni creative'leri yayına aldı?           | Günlük snapshot farkı (yeni `ad_id`'ler)                          |
| Hangi creative'ler uzun süre yayında kalıyor (kazanan proxy'si)?  | `days_active` ≥ 30 ve varyant sayısı                              |
| Hangi mesaj açıları (angle) ve kancalar (hook) kullanılıyor?      | Claude ile creative etiketleme                                    |
| Format karması nasıl (video / statik / karusel / UGC)?            | `format` etiketi + platform alanı                                 |
| Biz hangi açıları hiç kullanmıyoruz (boşluk analizi)?             | Bizim etiketler − rakip etiketler                                 |
| Bizim en iyi performanslı asset'lerimiz hangi etiketleri taşıyor? | Kendi performans verisi × etiketler                               |
| Rakipler hangi ülke ve platformlarda reklam veriyor?              | `publisher_platforms`, `reached_countries`, Google `regions`      |

---

## 2. Veri kaynakları ve erişim gerçekleri

Önce kötü haber: iki platformun da "rakip" tarafı resmî API ile sınırlı. Türkiye'yi hedefleyen ticari
reklamlar Meta'nın Ad Library API'sinden gelmez; Google Ads Transparency Center'ın resmî API'si yoktur.
Pipeline bu yüzden iki katmanlı kurulur: **resmî API** (bizim hesaplarımız + AB/İngiltere'deki rakipler)
ve **vekil toplayıcı** (Apify / SerpApi gibi üçüncü taraf) Türkiye ve diğer bölgeler için.

| Kaynak                            | Kapsam                                                   | Erişim                                                                   | Sınır                                                                         |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Meta Ad Library API**           | Rakip reklamlar: metin, snapshot URL, platform, tarihler | Graph API `ads_archive`, geliştirici hesabı + kimlik doğrulama           | Ticari reklamlar yalnızca AB/İngiltere'ye ulaşanlar; TR ticari reklamlar yok  |
| **Meta Ad Library (web)**         | Tüm aktif reklamlar, TR dahil                            | Apify "Facebook Ads Library Scraper" veya benzeri                        | Resmî değil, kırılabilir; ToS riski; medya indirmek ayrı adım                 |
| **Meta Marketing API**            | Bizim reklamlar + `insights` (CTR, CPM, dönüşüm)         | `act_<id>/ads`, `adcreatives`, `insights`                                | Sadece kendi hesabımız                                                        |
| **Google Ads API**                | Bizim kampanya/asset'ler + performans etiketi            | `ad_group_ad_asset_view.performance_label` (BEST / GOOD / LOW / LEARNING) | App ve Demand Gen için var; Responsive Display için yok                       |
| **Google Ads Transparency Center**| Rakip reklamlar: format, bölge, gösterim tarihleri       | SerpApi "Google Ads Transparency Center API" veya Apify actor            | Resmî API yok; AEA (EEA) için Google'ın ayrı veri erişimi var                 |
| **TikTok Commercial Content Library** (ops.) | Rakip TikTok reklamları                       | Resmî API                                                                | Yalnızca Avrupa                                                               |

**Pratik sonuç:** Rakip listesinde Avrupa'da reklam veren uluslararası AAC/afazi uygulamaları
(ör. Proloquo2Go, TouchChat, Avaz, Lingraphica, Constant Therapy, Tactus Therapy) varsa resmî Meta API
çalışır. Türkiye'deki rakipler için vekil toplayıcı şarttır. Rakip listesi `config/competitors.yaml`'da
durur ve her rakip için Meta `page_id`, Google `advertiser_id`, alan adı ve ülke listesi yazılır.

---

## 3. Mimari

```
                ┌──────────────────────────┐   ┌──────────────────────────┐
  Günlük 06:00  │ A. Toplayıcılar (ingest) │   │ B. Kendi hesaplarımız    │
                │  meta_adlib_api.py       │   │  meta_marketing.py       │
                │  meta_adlib_apify.py     │   │  google_ads.py           │
                │  google_atc_serpapi.py   │   │  (insights, asset label) │
                └───────────┬──────────────┘   └───────────┬──────────────┘
                            ▼                              ▼
                ┌──────────────────────────────────────────────────────────┐
                │ C. Normalize + ham arşiv                                 │
                │  raw/<kaynak>/<tarih>/*.json  →  ortak "ad" şeması       │
                │  medya indir (snapshot, video)  →  media/<sha256>.{jpg,mp4}│
                └───────────┬──────────────────────────────────────────────┘
                            ▼
                ┌──────────────────────────────────────────────────────────┐
                │ D. Zenginleştirme (yalnızca yeni creative'ler)           │
                │  1. perceptual hash → aynı görselin kopyalarını birleştir │
                │  2. video: 6 kare + ses → Whisper transkript             │
                │  3. OCR (görsel üstü metin)                              │
                │  4. Claude Opus 5.5 → yapılandırılmış etiket JSON        │
                │  5. embedding → mesaj kümeleri (angle cluster)           │
                └───────────┬──────────────────────────────────────────────┘
                            ▼
                ┌──────────────────────────────────────────────────────────┐
                │ E. Ambar: DuckDB (tek dosya) → istenirse Postgres        │
                │  advertiser · ad · creative · creative_tag · ad_snapshot  │
                │  own_performance · weekly_summary                        │
                └───────────┬──────────────────────────────────────────────┘
                            ▼
  Haftalık Pzt  ┌──────────────────────────┐   ┌──────────────────────────┐
                │ F. Rapor (Claude)        │   │ G. Pano (Evidence/Metabase)│
                │  haftalık özet .md       │   │  kazananlar, format karması│
                │  boşluk analizi          │   │  kadans, açı dağılımı    │
                └──────────────────────────┘   └──────────────────────────┘
```

Teknoloji seçimi: **Python 3.12** (pandas, DuckDB, httpx, Pillow, imagehash, faster-whisper),
`anthropic` SDK, orkestrasyon için başta **GitHub Actions cron** (sıfır altyapı), büyüdüğünde Prefect.
Medya ve DuckDB dosyası bir S3/R2 kovasında durur; secrets GitHub Actions secrets'ta.

---

## 4. Veri modeli

Her kaynak kendi alan adlarıyla gelir; normalize katmanı hepsini bu beş tabloya indirger.

```sql
-- Reklam veren (biz dahil)
create table advertiser (
  advertiser_id   text primary key,     -- 'meta:<page_id>' | 'google:<advertiser_id>'
  name            text,
  is_self         boolean,              -- Köprü ise true
  domain          text,
  country         text
);

-- Reklam kaydı (platformun ad_id'si). Aynı creative birden çok ad'de kullanılabilir.
create table ad (
  ad_id           text primary key,     -- 'meta:<id>' | 'google:<creative_id>'
  advertiser_id   text references advertiser,
  platform        text,                 -- meta | google
  first_seen      date,
  last_seen       date,
  start_date      date,                 -- platformun verdiği başlangıç
  end_date        date,                 -- null ise hâlâ yayında
  publisher_platforms text[],           -- facebook, instagram, messenger, audience_network / search, youtube, display
  reached_countries   text[],
  landing_url     text,
  body_text       text,
  headline        text,
  cta             text,
  creative_id     text references creative,
  eu_total_reach  integer,              -- Meta AB verisi varsa
  source          text                  -- adlib_api | adlib_apify | serpapi | marketing_api | google_ads_api
);

-- Tekilleştirilmiş medya
create table creative (
  creative_id     text primary key,     -- sha256(medya) ya da phash kümesi
  media_type      text,                 -- image | video | carousel | text_only
  media_path      text,
  width int, height int, duration_s real,
  phash           text,
  ocr_text        text,
  transcript      text,
  tagged_at       timestamp
);

-- Claude'un ürettiği etiketler (bir creative için bir satır, JSON şeması §5)
create table creative_tag (
  creative_id     text primary key references creative,
  tags            json,
  model           text,
  prompt_version  text
);

-- Günlük gözlem: "bugün hâlâ yayındaydı" → days_active buradan türetilir
create table ad_snapshot (
  ad_id text, seen_on date, is_active boolean,
  primary key (ad_id, seen_on)
);

-- Yalnızca kendi hesaplarımız
create table own_performance (
  ad_id text, date date,
  impressions bigint, clicks bigint, spend numeric, installs bigint, conversions bigint,
  asset_performance_label text,         -- Google: BEST/GOOD/LOW/LEARNING
  primary key (ad_id, date)
);
```

Türetilen alanlar (view): `days_active = last_seen − first_seen`, `variant_count` (aynı `creative_id`'yi
paylaşan `ad` sayısı), `relaunch_count` (end sonra tekrar start).

---

## 5. Creative analiz katmanı

### 5.1 Etiket taksonomisi

Her creative için **tek bir** yapılandırılmış JSON üretilir. Alanlar bilerek sınırlı tutulur; serbest metin
yalnızca `summary` ve `hook_text`'tedir, geri kalanı sayılabilir kategoridir.

| Alan                | Değerler                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `format`            | static_image, video_ugc, video_produced, screen_recording, carousel, text_only                |
| `hook_type`         | problem_statement, question, testimonial, before_after, demo, statistic, authority, humor, offer |
| `hook_text`         | İlk 3 saniyede / ilk satırda söylenen şey (aynen)                                            |
| `message_angle`     | independence, family_connection, clinical_proof, ease_of_use, price, speed_of_results, privacy, therapist_endorsed, personalization |
| `audience_persona`  | person_with_aphasia, caregiver_family, slp_therapist, clinic_buyer, general_public           |
| `proof_elements`    | liste: user_quote, expert_quote, number, award, app_store_rating, research_citation, none    |
| `cta_type`          | download, free_trial, learn_more, book_demo, watch_video, none                                |
| `offer`             | none, free_trial, discount, free_forever, bundle                                              |
| `shows_face`        | bool · `shows_product_ui`: bool · `shows_real_user`: bool                                    |
| `text_density`      | low, medium, high (görsel üstü metin oranı)                                                  |
| `tone`              | warm, clinical, urgent, playful, neutral                                                      |
| `language`          | ISO kodu (tr, en, de...)                                                                     |
| `adult_respect`     | 1–5 (Köprü ilkesi 6: çocuksu mu, yetişkine saygılı mı)                                        |
| `summary`           | ≤ 2 cümle                                                                                    |

`adult_respect` ve `audience_persona` Köprü'ye özgüdür: rakiplerin ne kadarının bakım verene, ne kadarının
afazili kişinin kendisine konuştuğunu görmek stratejik soru.

### 5.2 Etiketleme çağrısı (sketch)

Görsel + OCR metni + (video ise) 6 kare ve transkript tek istekte verilir. Claude Opus 5.5 ve yapılandırılmış
çıktı; şema Pydantic ile tanımlanır, bu yüzden geçersiz JSON gelmez. Günlük toplu iş olduğu için
**Message Batches API** kullanılır (yarı fiyat, 24 saat içinde döner).

```python
# enrich/tag_creative.py (sketch)
from enum import Enum
from pydantic import BaseModel
import anthropic, base64, json

class Format(str, Enum):
    static_image = "static_image"; video_ugc = "video_ugc"; video_produced = "video_produced"
    screen_recording = "screen_recording"; carousel = "carousel"; text_only = "text_only"

class CreativeTags(BaseModel):
    format: Format
    hook_type: str
    hook_text: str
    message_angle: list[str]
    audience_persona: str
    proof_elements: list[str]
    cta_type: str
    offer: str
    shows_face: bool
    shows_product_ui: bool
    shows_real_user: bool
    text_density: str
    tone: str
    language: str
    adult_respect: int
    summary: str

SYSTEM = open("prompts/tag_creative.v1.md").read()   # taksonomi + değer tanımları, sabit → önbelleğe alınır

def build_request(creative, frames: list[bytes], ocr: str, transcript: str, body_text: str):
    content = [{"type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg",
                           "data": base64.b64encode(f).decode()}} for f in frames]
    content.append({"type": "text", "text":
        f"Reklam metni:\n{body_text}\n\nGörsel üstü metin (OCR):\n{ocr}\n\nTranskript:\n{transcript}"})
    return {
        "model": "claude-opus-5-5",
        "max_tokens": 2048,
        "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": content}],
    }

# Tek creative için senkron sürüm (geliştirme sırasında):
client = anthropic.Anthropic()
resp = client.messages.parse(output_format=CreativeTags, **build_request(...))
tags = resp.parsed_output

# Üretimde: günün tüm yeni creative'leri tek batch'te
# client.messages.batches.create(requests=[{"custom_id": creative_id, "params": {...}}, ...])
```

Prompt sürümü (`tag_creative.v1.md`) `creative_tag.prompt_version` alanına yazılır; taksonomi değişince
eski etiketler toplu yeniden üretilir. Etiket kalitesi için 50 creative'lik elle etiketlenmiş bir altın
küme tutulur ve her prompt değişikliğinde uyum oranı ölçülür.

### 5.3 Mesaj kümeleme

`hook_text + summary + body_text` birleşimi embedding'e çevrilir (Voyage veya açık kaynak bir model),
HDBSCAN ile kümelenir. Küme adları Claude'a verdirilir ("Bu 14 reklamın ortak vaadi nedir?"). Böylece
taksonominin öngörmediği yeni açılar da yakalanır.

---

## 6. Performans proxy'leri

Rakip reklamların gerçek performansı görünmez; şu vekiller kullanılır:

| Vekil                  | Yorum                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `days_active`          | 30+ gün yayında kalan creative büyük olasılıkla kârlı                           |
| `variant_count`        | Aynı görselin çok metin varyantıyla test edilmesi = yatırım yapılan konsept    |
| `relaunch_count`       | Durdurulup tekrar açılan = sezonluk kazanan                                    |
| `eu_total_reach`       | Yalnızca AB verisi olan reklamlarda gerçek erişim                              |
| Platform yaygınlığı    | Hem Meta hem Google'da aynı konsept = ana mesaj                                 |

Kendi reklamlarımızda ise gerçek metrikler var: CTR, CPI, dönüşüm, Google'ın BEST/GOOD/LOW etiketi.
Haftalık raporun en değerli bölümü şudur: **bizim BEST asset'lerimizin etiket profili** ile **rakiplerin
uzun ömürlü creative'lerinin etiket profili** yan yana.

---

## 7. Raporlar

**Haftalık özet (Pazartesi, Markdown + e-posta):**

1. Yeni creative'ler: rakip başına sayı, format, baskın açı.
2. Kazananlar panosu: 30+ gün aktif creative'ler, etiketleriyle.
3. Boşluk analizi: rakiplerde ≥ 3 kez görülen, bizde 0 olan `message_angle` × `audience_persona` çiftleri.
4. Bizim taraf: BEST / LOW asset'ler ve ortak etiketleri; önerilen 3 yeni creative hipotezi.
5. Trend: son 8 haftada format karması ve ton değişimi.

Rapor metnini Claude yazar; girdi olarak yalnızca ambar sorgu sonuçları (JSON) verilir, ham reklamlar
verilmez. Böylece rapor kısa ve sayısal kalır. Rapor üretimi için seçenek: Managed Agents'ta haftalık
zamanlanmış dağıtım, DuckDB dosyasını okuyan tek bir araçla.

**Pano:** Evidence (statik, Markdown + SQL) ya da Metabase. Üç sayfa: Rakip genel bakış · Creative
galerisi (filtre: açı, format, persona) · Bizim performans × etiket.

---

## 8. Çalıştırma düzeni

| İş                     | Zaman        | Süre   | Not                                             |
| ---------------------- | ------------ | ------ | ----------------------------------------------- |
| `ingest` (tüm kaynak)  | Her gün 06:00| ~10 dk | Snapshot → `ad_snapshot`; yeni `ad_id` → kuyruk  |
| `media`                | 06:15        | ~15 dk | Yalnızca yeni creative; sha256 + phash          |
| `enrich`               | 06:30        | batch  | Whisper + OCR yerel; Claude batch'i akşam döner  |
| `report`               | Pzt 08:00    | ~5 dk  | Haftalık özet + boşluk analizi                  |
| `retag`                | Elle         | —      | Prompt sürümü değişince                         |

Hata politikası: bir kaynak düşerse diğerleri devam eder; düşen kaynak raporda "veri eksik" olarak
işaretlenir. Vekil toplayıcı (Apify/SerpApi) 3 gün üst üste boş dönerse uyarı.

---

## 9. Maliyet tahmini (10 rakip, ~600 aktif reklam, haftada ~80 yeni creative)

| Kalem                              | Aylık tahmin        |
| ---------------------------------- | ------------------- |
| Apify Meta Ad Library actor        | 5–20 $              |
| SerpApi Google ATC                 | 50 $ (giriş paketi) |
| Claude Opus 5.5 etiketleme (batch) | ~350 creative × ~3K giriş + 500 çıkış token ≈ 8–10 $ |
| Claude haftalık rapor              | < 2 $               |
| Whisper (yerel, CPU)               | 0 $                 |
| Depolama (R2, 20 GB)               | < 1 $               |
| GitHub Actions                     | ücretsiz kota içinde|
| **Toplam**                         | **~70–85 $ / ay**   |

İlk doldurma (geçmiş 365 gün, ~3 000 creative) tek seferlik ~60–80 $ Claude maliyeti.

---

## 10. Hukuki ve etik notlar

- Meta Ad Library API ve Google'ın AEA veri erişimi resmî yollardır; vekil toplayıcılar platform
  şartlarına aykırı sayılabilir. Karar: resmî veri yeterliyse vekil kapatılır; vekil kullanılırsa oran
  sınırlı, yalnızca herkese açık reklam verisi, yeniden yayımlama yok.
- Reklamlardaki kişi görüntüleri (hasta, bakım veren) kişisel veridir: medya yalnızca iç analiz için
  saklanır, 12 ay sonra silinir, raporlara yalnızca etiket ve snapshot bağlantısı girer.
- Sağlık kategorisi reklam politikaları (Meta "health" hassas kategori, Google sağlık politikası)
  rakiplerin ne iddia edemediğini de gösterir; `clinical_proof` açısı rakipte sıksa politika incelemesi
  yapılır. Köprü ilkesi 10 gereği bizim creative'lerimiz tedavi vaadi içermez; rapor bunu da denetler.

---

## 11. Uygulama planı

| Faz | Süre     | Çıktı                                                                                  | Bitti ölçütü                                          |
| --- | -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0   | 1 hafta  | Depo iskeleti, `competitors.yaml`, DuckDB şeması, kendi Meta + Google hesabından ingest | `own_performance` dolu, 1 haftalık veri                 |
| 1   | 1 hafta  | Meta Ad Library API + Apify toplayıcı, Google ATC (SerpApi), medya indirme, phash       | 10 rakip için günlük snapshot çalışıyor                |
| 2   | 2 hafta  | Whisper + OCR + Claude etiketleme (batch), altın küme, prompt v1                        | Altın kümede ≥ %85 uyum                               |
| 3   | 1 hafta  | Haftalık rapor + Evidence panosu                                                        | İlk rapor e-postayla geldi, boşluk analizi okunabilir  |
| 4   | sürekli  | Embedding kümeleri, uyarılar (yeni rakip, ani format değişimi)                          | Haftalık 1 yeni creative hipotezi üretiliyor            |

### Önerilen depo yapısı (`kopru-ad-intel`)

```
kopru-ad-intel/
  config/competitors.yaml        # page_id, advertiser_id, domain, countries
  ingest/meta_adlib_api.py       # Graph API ads_archive
  ingest/meta_adlib_apify.py     # vekil toplayıcı (TR)
  ingest/google_atc_serpapi.py   # Transparency Center
  ingest/meta_marketing.py       # kendi hesap + insights
  ingest/google_ads.py           # kendi hesap + asset performans etiketi
  normalize/schema.py            # ortak "ad" modeli (pydantic)
  media/fetch.py  media/hash.py  media/frames.py
  enrich/ocr.py  enrich/transcribe.py  enrich/tag_creative.py  enrich/cluster.py
  prompts/tag_creative.v1.md     # taksonomi + örnekler
  warehouse/ddl.sql  warehouse/views.sql
  report/weekly.py  report/templates/weekly.md.j2
  dashboard/ (Evidence)
  tests/golden/                  # 50 elle etiketli creative
  .github/workflows/daily.yml  weekly.yml
```

### İlk adımda netleşmesi gerekenler

1. Rakip listesi: hangi 5–10 uygulama? Türkiye'de reklam veren var mı, yoksa hepsi uluslararası mı?
2. Köprü'nün kendi reklam hesapları (Meta ad account id, Google Ads customer id) var mı; yoksa Faz 0
   yalnızca şemayı kurar.
3. Vekil toplayıcı kullanımına onay (hukuki not §10).
4. Raporun okuyucusu kim: tek kişi (Markdown yeter) mi, ekip (pano gerekir) mi?

---

## Kaynaklar

- Meta Ad Library API kapsamı (ticari reklamlar yalnızca AB/İngiltere): [metapi.io karşılaştırması](https://metapi.io/compare/facebook-ad-library-api), [get-ryze.ai](https://www.get-ryze.ai/blog/meta-ads-library-api), [adsuploader.com](https://adsuploader.com/blog/facebook-ad-library-api), [ppc.land](https://ppc.land/ads-library/), [adlibrary.com AB siyasi reklam notu](https://adlibrary.com/posts/meta-ad-library-eu-political-ads), [mida.so](https://www.mida.so/blog/meta-ads-library)
- Google Ads Transparency Center erişimi: [SerpApi duyurusu](https://serpapi.com/blog/serpapi-unveils-google-ads-transparency-api-empowering-developers-to-harness-ads-insights.md), [Apify actor (s-r)](https://apify.com/s-r/google-ads-transparency), [Apify actor (scrapesage)](https://apify.com/scrapesage/google-ads-transparency-scraper.md), [relevantaudience.com rehberi](https://www.relevantaudience.com/google-ads-en/google-ads-transparency-center-guide/), [dev.to yazısı](https://dev.to/devil_scrapes/google-ads-transparency-scraper-pull-any-competitors-ads-for-1201k-25fo), [SOURCE // LABS](https://openclaweco-website-build.pages.dev/news/google-ads-transparency-center-scraper/), [adtribute.io](https://www.adtribute.io/directory/google-ads-transparency-center)
- Google Ads API asset performans etiketi: [fetching assets](https://developers.google.com/google-ads/api/docs/assets/fetching-assets), [AdGroupAdAssetView v24](https://developers.google.com/google-ads/api/reference/rpc/v24/AdGroupAdAssetView?hl=ar), [App kampanyaları asset raporu](https://support.google.com/google-ads/answer/6310436), [AssetPerformanceLabel enum](https://developers.google.com/google-ads/api/diff-tool/v23/versus-v22/diffs/full/enums/asset_performance_label), [Ads Developer Blog Ocak 2026](https://ads-developers.googleblog.com/2026/01/), [Google Ads API forumu](https://groups.google.com/g/adwords-api/c/oTkrEulk_sE)
