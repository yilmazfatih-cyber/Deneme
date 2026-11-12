# API notları (Mixpanel, Hotjar)

Kaynak: resmi belgeler, 2026-11 itibarıyla (Mixpanel: `github.com/mixpanel/docs`, docs.mixpanel.com;
Hotjar: help.hotjar.com / support.contentsquare.com). Bir uç nokta hata verirse önce bu dosyaya, sonra belgeye bakın;
web'de aramak token harcar.

## Mixpanel

### Kimlik ve adresler

- **Service account** (önerilen): HTTP Basic `kullanıcı:secret` + her istekte `project_id`. Data Views kullanan
  projelerde `workspace_id` (ayarlar.json → `mixpanel.workspace_id`).
- **Proje API secret'ı** (eski): Basic `secret:` (şifre boş). **3 Mart 2027'de kalkıyor**; yeni projelerde yok.
- Lexicon şemaları yalnız service account ile okunur.

| API           | US                                         | EU                                            | Hindistan                                     |
| ------------- | ------------------------------------------ | --------------------------------------------- | --------------------------------------------- |
| Query         | `https://mixpanel.com/api/query`           | `https://eu.mixpanel.com/api/query`           | `https://in.mixpanel.com/api/query`           |
| Raw export    | `https://data.mixpanel.com/api/2.0/export` | `https://data-eu.mixpanel.com/api/2.0/export` | `https://data-in.mixpanel.com/api/2.0/export` |
| App (Lexicon) | `https://mixpanel.com/api/app`             | `https://eu.mixpanel.com/api/app`             | `https://in.mixpanel.com/api/app`             |

Test için adresler `MIXPANEL_QUERY_BASE`, `MIXPANEL_EXPORT_BASE`, `MIXPANEL_APP_BASE` ortam değişkenleriyle değişir.

### Sınırlar ve plan

- Query API: proje başına **saatte 60 sorgu, aynı anda 5**. Export: saatte 60, saniyede 3, aynı anda 100.
- **Query API Free planda yok** (Growth/Enterprise). Raw Export ve Engage her planda.
- 2026-07'den beri **`/segmentation` ve `/funnels` bakım modunda** (çalışıyor ama yeni kullanım önerilmiyor);
  JQL de bakım modunda. Kit bu yüzden filtresiz kırılımlarda `/events/properties` kullanır.
- TLS 1.2+ zorunlu (2026-04).

### Kitin kullandığı uç noktalar

| Komut                 | Uç nokta                                                                                      | Not                                |
| --------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
| `seri`, `kpi`         | `GET /events` (`event` JSON dizi, `type`, `unit` day/week/month)                              | Tek sorguda çok olay               |
| `kirilim`, `neden`    | `GET /events/properties` (`event`, `name`) — filtre varsa `GET /segmentation` (`on`, `where`) | `limit` 100                        |
| `ara`, `sozluk`       | `/events/names` (son 31 gün), `/events/properties/top`, Lexicon `GET /projects/{id}/schemas`  | Sözlük bir kez                     |
| `degerler`            | `/events/properties/values`                                                                   |                                    |
| `huni`                | `GET /funnels` (`funnel_id`, `interval` = gün sayısı → tek kova), `/funnels/list`             | `funnel_id` ≈ rapor URL'sindeki ID |
| `tutunma`             | `GET /retention` (`born_event`, `event`, `unit`, `interval_count`)                            | `counts[0]` = ilk 24 saat          |
| `kayitli`             | `GET /insights?bookmark_id=`                                                                  | Rapor URL'sindeki `report-<ID>`    |
| `huni-yerel`, `deney` | Raw export (`event` JSON dizi, `where`), gzip                                                 | `$insert_id` ile tekilleştirilir   |

Yanıt biçimleri (kısaltılmış):

```json
{"data": {"series": ["2026-11-01"], "values": {"Android": {"2026-11-01": 120}}}, "legend_size": 1}
{"meta": {"dates": ["2026-11-01"]}, "data": {"2026-11-01": {"steps": [{"count": 1000, "step_conv_ratio": 1, "overall_conv_ratio": 1, "avg_time_from_start": null, "event": "A"}], "analysis": {"worst": 1}}}}
{"2026-10-01": {"counts": [9, 7, 6], "first": 10}}
{"date_range": {"from_date": "…", "to_date": "…"}, "headers": ["$event"], "series": {"Logged in": {"2026-10-01T00:00:00+03:00": 9852}}}
```

- Hunide `on` kırılımı varsa her tarih altında `{"$overall": [adımlar], "Android": [adımlar], …}` gelir (belgede
  örnek yok; Mixpanel'in resmi Python SDK'sı böyle okur).
- Tutunmada `on` kırılımının biçimi belgelenmemiş; kit her iki biçimi de okur.
- Kayıtlı rapor 200 kodlu yanıtta `"error"` anahtarı da dönebilir; kit bunu hata olarak gösterir.
- Export'ta `time` 2023 sonrası projelerde UTC saniyedir; tarih aralığı UTC'dir. Kit aralığı bir gün geniş
  ister ve proje saatine göre süzer. Kimlik birleştirmede export, arayüzdeki kanonik `distinct_id`'yi verir.

### `where` / `on` ifadeleri

`properties["$os"] == "Android"`, `"5.2" in properties["surum"]`, `defined(properties["x"])`, `and`, `or`, `not`.
Tür uyuşmazlığında `==` yanlış döner; kit `--filtre kod=7` için hem sayı hem metin karşılaştırır.

### Mixpanel MCP sunucusu (resmi)

- Adres: `https://mcp.mixpanel.com/mcp` (EU: `mcp-eu.mixpanel.com/mcp`, Hindistan: `mcp-in.mixpanel.com/mcp`); OAuth.
- Claude Code: `claude mcp add --transport http mixpanel https://mcp-eu.mixpanel.com/mcp`, sonra `/mcp` ile giriş.
- Organizasyon yöneticisinin MCP'yi açması gerekebilir (Settings → Org). Sınır: kullanıcı başına saatte 600 istek.
- Başlıca araçlar: `Run-Query` (insights/funnels/retention/flows), `Get-Query-Schema`, `Get-Report`, `Get-Events`,
  `List-Properties`, `Get-Property-Values`, `Search-Entities`. Kayıtlı rapor için `Get-Report` en ucuzudur.

## Hotjar

### Durum (önemli)

- **Hotjar hesapları 26 Ağustos 2026'dan itibaren aşamalı olarak Contentsquare'e taşınıyor.** Geçişten sonra Hotjar
  salt-okunur olur ve bir süre sonra silinir (belgelerde 90 gün ve 12 ay geçiyor; 90 günle planlayın).
  **Anket ve geri bildirim verisi taşınır; geçmiş kayıtlar, ısı haritaları, huniler taşınmaz** — gerekenleri dışa aktarın.
- Taşınan hesapta `api.hotjar.io` erişiminin sürüp sürmediği belgelenmemiş.

### REST API (`https://api.hotjar.io`, v1)

- Jeton: `POST /v1/oauth/token`, gövde form (`grant_type=client_credentials`, `client_id`, `client_secret`) →
  `{"access_token", "token_type": "Bearer", "expires_in"}`. Anahtarlar 1 yıl geçerli; yalnız admin oluşturur
  (Settings → API).
- **Responses API yalnız Ask Scale planında.** Dakikada 3000 istek.
- `GET /v1/sites/{site_id}/surveys?limit=100&cursor=&with_questions=true`
- `GET /v1/sites/{site_id}/surveys/{survey_id}/responses?limit=100&cursor=` — en yeni önce; **tarih filtresi yok**
  (kit `--bas` tarihinden eskiye inince durur).
- Sayfalama: `{"results": [...], "next_cursor": "..."}`; son sayfada `next_cursor: null`.
- Yanıt alanları: `id, created_time, is_complete, device, browser, os, country, hotjar_user_id, recording_url,
response_origin_url, user_attributes[{name, value}], tags[{name}], answers[{question_id, answer, comment}]`.
  Çoklu seçimde her seçim ayrı `answers` öğesidir; kit bunları `|` ile birleştirir.
- Soru türleri: `nps`, `rating-1-5`, `rating-1-7`, `reaction`, `single-option`, `multiple-option`, `long-text`,
  `short-text`, `email`, `statement`, `thank-you`.
- API'de **olmayanlar**: kayıtlar, ısı haritaları, geri bildirim widget'ı, huniler, olaylar → arayüzden dışa aktarım.

### Arayüzden dışa aktarım

- Anket yanıtları: CSV/XLSX (yalnız filtrelenmiş yanıtlar; 10.000'e kadar doğrudan, fazlası e-postayla; saatler UTC).
  Eski dışa aktarımlarda çoklu seçim alt satırlara yazılır; kit bunları birleştirir.
- Isı haritası (tıklama): "Download CSV" → `Element CSS selector, Total # of clicks, Visible in image, % of total`.
  `hj.py ozet` / `ozet.py` bunu tanır.
- Kayıt listesi: CSV/XLSX (ilk sütun kayıt URL'si); videolar dışa aktarılmaz.

### Mixpanel ↔ Hotjar

- Hotjar'ın Mixpanel entegrasyonu istemci tarafı Mixpanel **olay adlarını** Hotjar'a gönderir (özellikler gitmez);
  kayıt/ısı haritası "Mixpanel olayı" filtresiyle süzülür.
- Kayıt filtreleri: ziyaret edilen/giriş/çıkış sayfası, tıklanan öğe, olay, rage click, u-turn, girilen metin, hata,
  yeni/dönen, ülke, süre, cihaz, tarayıcı, kullanıcı nitelikleri (Business/Scale).
- Hotjar yalnız web sitesini kaydeder; yerel mobil uygulama sorunları Hotjar'da görünmez.
