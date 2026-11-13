# Mixpanel verisini TV+'a bağlamak

Bu belge izleme verisinin TV+ arka ucuna nasıl girdiğini anlatır: Mixpanel'den ham olay dışa aktarımı, eşleme dosyası,
içe aktarma raporu, zamanlanmış çekim ve gizlilik. Genel tasarım: `docs/ICERIK_ZEKASI.md` §5. Tel sözleşmesi:
`shared/intelligence.ts` ("İzleme verisi ve kaynaklar"). Eşleme şeması: `shared/mixpanel-mapping.ts`.

## 1. Veri nereden girer?

| Kaynak      | Nereden                                                        | Nasıl                                                                          |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `MIXPANEL`  | Mixpanel ham dışa aktarımı (JSONL ya da `.gz`) veya Export API | `npm run mixpanel:import`, `POST /api/studio/sources/mixpanel/import`, `/pull` |
| `TVPLUS`    | Uygulamanın kendi olayları (`POST /log/web/cl/1`)              | Kendiliğinden: olay servisine abone köprü çevirir                              |
| `SYNTHETIC` | Tohumlu üreteç (**gerçek değildir**)                           | Depo boşsa açılışta arka planda; `POST /api/studio/sources/synthetic/generate` |

Hepsi aynı kanonik olaya (`ViewingEvent`) çevrilir. Hangi kaynakların analize girdiğini `activeSources()` belirler:

- **Gerçek kaynaklarda (MIXPANEL + TVPLUS birlikte) özeti olan en az `TVP_REAL_DATA_MIN_VIEWERS` (varsayılan 50)
  tekil izleyici varsa SENTETİK veri analizlerden çıkar**; silinmez, `GET /api/studio/sources` içinde `active: false`
  görünür. Özet: en az bir oynatma, izleme, liste ya da beğeni; yalnız gösterim/tıklama/arama sayılmaz.
- Eşiğin altında SENTETİK veri gerçek kaynaklarla **birlikte** etkin kalır. Böylece bir geliştiricinin kendi
  tıklamaları 1.500 izleyicilik örneği kapatmaz, profilin kendi TVPLUS özeti de tahminlerinde sayılır.
- Sentetik veri yoksa yalnız gerçek kaynaklar kullanılır.

İsterseniz `DELETE /api/studio/sources/SYNTHETIC` ile silin.

## 2. Hazırlık

1. **Servis hesabı:** Mixpanel'de _Organization Settings → Service Accounts_ altında, projeye en az okuma yetkisiyle
   bir servis hesabı açın. Kullanıcı adı ve gizli değer bir kez gösterilir.
2. **Proje kimliği:** _Project Settings → Overview_ içindeki sayısal _Project ID_.
3. **Veri bölgesi:** Projeniz hangi veri merkezinde? ABD (varsayılan) `us`, AB `eu`, Hindistan `in`.
4. **Ortam değişkenleri** (yalnız sunucunun ortamına; dosyaya, depoya, sohbete yazılmaz):

   ```bash
   export MIXPANEL_SERVICE_ACCOUNT_USERNAME=…      # servis hesabı kullanıcı adı
   export MIXPANEL_SERVICE_ACCOUNT_SECRET=…        # servis hesabı gizli değeri
   export MIXPANEL_PROJECT_ID=1234567
   export MIXPANEL_REGION=eu                       # us | eu | in
   export TVP_STUDIO_KEY=$(openssl rand -hex 24)   # betiklerin/zamanlanmış işlerin stüdyo anahtarı
   ```

   `GET /api/studio/sources` → `mixpanel.configured: true` olmalı (değerler asla dönmez).

5. **Katalog kimlikleri:** Mixpanel olaylarınızdaki içerik kimliği (ör. `content_id: "cnt_48213"`) katalogdaki başlığa
   bağlanmalı. En sağlamı başlık dosyasına (`content/titles/*.json`) yazmaktır:
   `"externalIds": { "mixpanel": "cnt_48213" }`. Yazılmamışsa sırayla sayısal `videoId`, `slug` ve başlık adı denenir.

## 3. Eşleme dosyası

Varsayılan: `content/analytics/mixpanel-mapping.json`. Stüdyodan `PUT /api/studio/sources/mixpanel/mapping` ile
kaydedilen kopya `TVP_DATA_DIR/viewing/mixpanel-mapping.json`'a yazılır ve **depodaki dosyanın önüne geçer**
(`GET …/mapping` yanıtındaki `x-tvplus-mapping-origin` başlığı hangisinin geçerli olduğunu söyler: `override` | `repo`).
Sunucudaki kopyayı silerseniz depodaki dosyaya dönülür. **Yeni bir olay adı bağlamak için yalnız bu JSON düzenlenir.**

| Alan                                             | Varsayılan                         | Anlamı                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                                        | `1`                                | Şema sürümü                                                                                                                                 |
| `viewerProperty`                                 | `distinct_id`                      | İzleyici kimliğinin özelliği. Girişte takma kimliğe çevrilir                                                                                |
| `insertIdProperty`                               | `$insert_id`                       | Yinelenme anahtarı. Yoksa satırın özeti kullanılır                                                                                          |
| `time.property`                                  | `time`                             | Olay anı                                                                                                                                    |
| `time.unit`                                      | `auto`                             | `s` saniye, `ms` milisaniye, `auto`: 10¹¹'den büyükse ms. ISO metni de okunur                                                               |
| `time.offsetMinutes`                             | `0`                                | `time` UTC değil de proje saat diliminde yazılmışsa o dilimin UTC farkı (İstanbul: `180`). Bkz. §7                                          |
| `events`                                         | —                                  | Mixpanel olay adı → `IMPRESSION`, `CLICK`, `PLAY_START`, `PLAY_PROGRESS`, `PLAY_END`, `ADD_TO_LIST`, `REMOVE_FROM_LIST`, `RATING`, `SEARCH` |
| `events.<ad>.properties`                         | —                                  | O olaya özgü özellik adları (genelin önüne geçer). Ör. oturum sonu olayı izlenen süreyi başka adla taşıyorsa                                |
| `properties.contentId`                           | `content_id`, `video_id`           | İçerik kimliği. Tek ad ya da sırayla denenen adlar listesi                                                                                  |
| `properties.contentTitle`                        | `content_title`                    | Kimlik eşleşmezse başlık adıyla eşleme                                                                                                      |
| `properties.watchedSeconds`                      | `watched_seconds`                  | **Bu olayın eklediği** izleme süresi. Toplam süreyi her kalp atışında tekrar gönderiyorsanız yalnız son olaya bağlayın, yoksa çift sayılır  |
| `properties.positionSeconds` / `durationSeconds` | `position` / `duration`            | Konum ve süre                                                                                                                               |
| `properties.completed`                           | `completed`                        | `true`/`1`/`"true"`. Yoksa `PLAY_END`'de konum/süre ≥ `completionThreshold`                                                                 |
| `properties.rating`                              | `rating`                           | Değer `ratingMap` ile −1 / 0 (temizle) / 1 / 2'ye çevrilir                                                                                  |
| `properties.query`                               | `search_query`                     | Arama metni (80 karaktere kısaltılır)                                                                                                       |
| `properties.device`                              | `platform`, `$os`                  | Değer küçük harfle `deviceMap`'te aranır → `TV` / `MOBILE` / `WEB`; bulunamazsa `OTHER`                                                     |
| `properties.country`                             | `mp_country_code`                  | ISO 3166-1 iki harf (Mixpanel'in kendi coğrafi zenginleştirmesi)                                                                            |
| `durationUnit`                                   | `s`                                | `s` / `ms` / `min` — izlenen süre, konum ve süre için                                                                                       |
| `completionThreshold`                            | `0.9`                              | 0.5–1                                                                                                                                       |
| `deviceMap`, `ratingMap`                         | (dosyada)                          | Küçük harfli değer → sınıf                                                                                                                  |
| `titleMatch.order`                               | `externalId, videoId, slug, title` | İçerik kimliğinin katalogla eşlenme sırası                                                                                                  |
| `titleMatch.namespace`                           | `mixpanel`                         | `externalIds.<ad alanı>`                                                                                                                    |

Örnek — kendi adlarınızla iki olay ve oturum sonu süresi:

```json
{
  "version": 1,
  "events": {
    "Oynatma Başladı": "PLAY_START",
    "Oynatma Bitti": { "type": "PLAY_END", "properties": { "watchedSeconds": "session_watch_sec" } },
    "Listeye Eklendi": "ADD_TO_LIST"
  },
  "properties": { "contentId": "icerik_id", "device": ["cihaz_tipi", "$os"], "country": "mp_country_code" },
  "deviceMap": { "smarttv": "TV", "ios": "MOBILE", "android": "MOBILE", "web": "WEB" }
}
```

Eşlemede adı geçmeyen **hiçbir özellik okunmaz ve saklanmaz** (e-posta, ad, IP, `$device_id`, URL…).

## 4. İlk deneme: bir günlük dosya

1. Mixpanel arayüzünden ya da Export API'den bir günü indirin (`.jsonl` ya da `.jsonl.gz`).
2. **Deneme** (depoya yazmaz, raporu gösterir):

   ```bash
   npm run mixpanel:import -- --file ~/indirilen/2026-10-01.jsonl.gz --dry-run
   ```

   Depodaki küçük örnekle hemen deneyebilirsiniz: `--file content/analytics/ornek-mixpanel.jsonl` (SENTETİK; kenar
   durumları içerir: boş satır, bozuk satır, eşlenmeyen olay, bilinmeyen içerik, ms ve ISO zaman, yinelenen satır).

3. **Raporu okuyun:**
   - `satır / kabul / yinelenen / reddedilen` — reddedilen: JSON bozuk, `event`/`properties` yok, izleyici kimliği yok
     ya da zaman okunamadı.
   - **Eşlenmeyen olaylar** — eşlemede olmayan olay adları ve adetleri. İzlemeyle ilgili olanları `events`'e ekleyin;
     ilgisizler (ör. `App Open`, `Page View`) yok sayılır, zararı yoktur.
   - **Katalogda bulunamayan içerik kimlikleri** (en sık 50) — bu kimlikleri ilgili başlığın `externalIds.mixpanel`
     alanına yazın. Bu olaylar sayılır ama izleyici × başlık özetine girmez.
4. Eşlemeyi düzeltip denemeyi tekrarlayın; rapor temizlenince `--dry-run` olmadan çalıştırın. **Yeniden çalıştırmak
   güvenlidir**: aynı olay ikinci kez `yinelenen` sayılır.

## 5. Komut, sunucu ve bayat özetler

- `npm run mixpanel:import -- --file <yol>` **doğrudan kip**tir: depoyu (`TVP_DATA_DIR/viewing`) bu süreçte açar.
  Sunucu çalışıyorsa depo kilitlidir (`viewing/LOCK`) ve komut reddeder; çünkü çalışan sunucunun bellekteki özetleri
  dosyaya başka süreçten eklenenleri görmez (bayat kalır) ve iki süreç aynı günlüğe yazar.
- Sunucu çalışırken **`--server` kipi**ni kullanın: dosya akış olarak sunucuya gider, özetler anında güncellenir.

  ```bash
  TVP_STUDIO_KEY=… npm run mixpanel:import -- --file ekim.jsonl.gz --server http://127.0.0.1:8787
  TVP_STUDIO_KEY=… npm run mixpanel:import -- --from 2026-10-01 --to 2026-10-07 --server http://127.0.0.1:8787
  ```

- Doğrudan kip sunucuyla **aynı `TVP_DATA_DIR`** (ya da aynı `TVP_SECRET`) ile çalıştırılmalıdır: takma kimlikler
  sunucunun gizli anahtarından türer; farklı anahtarla aynı kişi iki farklı izleyici olur.
- HTTP ucu: `POST /api/studio/sources/mixpanel/import` gövdesi ham dosyadır (JSONL ya da gzip; tür başlığı önemsiz,
  gzip sihirli baytlardan anlaşılır), akış olarak işlenir, en çok 1 GB. `?dryRun=1` deneme.
  `curl -H "x-tvplus-studio-key: $TVP_STUDIO_KEY" --data-binary @ekim.jsonl.gz http://127.0.0.1:8787/api/studio/sources/mixpanel/import`

## 6. API ile çekme ve zamanlama

`POST /api/studio/sources/mixpanel/pull` `{ "from": "2026-10-01", "to": "2026-10-07" }` ya da
`npm run mixpanel:import -- --from … --to …`. Kullanılan uç:

```
GET https://data.mixpanel.com/api/2.0/export?project_id=<id>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
    (eu: data-eu.mixpanel.com · in: data-in.mixpanel.com)
Authorization: Basic base64(<kullanıcı adı>:<gizli>)      Accept-Encoding: gzip
```

- Aralık 7 günlük parçalara bölünüp sırayla çekilir (en çok 366 gün). Mixpanel bu uç için saatte 60 / saniyede 3 sorgu
  sınırı koyar; büyük geçmişi birkaç parti hâlinde çekin.
- `429` ve `5xx` yanıtlarında `Retry-After`'a uyulur, yoksa 2 → 4 → 8 → 16 sn beklenip 5 kez denenir. `401/403` hemen
  "kimlik bilgileri reddedildi" hatası döner.
- **Zamanlama** (ör. her gece dünü çek): sunucu makinesinde cron —
  `15 4 * * * cd /srv/tvplus && TVP_STUDIO_KEY=… npm run -s mixpanel:import -- --from $(date -d yesterday +\%F) --to $(date -d yesterday +\%F) --server http://127.0.0.1:8787`.
  Mixpanel geç gelen olayları sonradan işleyebildiği için son 2–3 günü her gece yeniden çekmek güvenlidir: yinelenenler
  sayılmaz.

## 7. Zaman ve saat dilimi

- Mixpanel ham dışa aktarımında `properties.time` varsayılan olarak **saniye** cinsinden Unix zamanıdır (API'de
  `time_in_ms` ile milisaniye istenebilir). `time.unit: "auto"` ikisini de doğru okur.
- 1 Ocak 2023'ten sonra açılan projelerde değerler UTC'dir. Daha eski projelerde dışa aktarılan `time` proje saat
  diliminde olabilir: öyleyse `time.offsetMinutes` alanına o dilimin farkını yazın (İstanbul `180`). Emin değilseniz
  bilinen bir olayın (ör. kendi izlemenizin) saatini rapordan karşılaştırın.
- Aylık ve günlük toplamlar **İstanbul** takvimine göredir (`Europe/Istanbul`, 2016'dan beri sabit UTC+3).

## 8. Gizlilik

- `distinct_id` sunucuya girerken `v_` + HMAC-SHA256 (`deriveKey(config, 'viewer-id')`) ile **geri çevrilemez** takma
  kimliğe çevrilir; ham kimlik diske, günlüğe, yanıta yazılmaz (testle doğrulanır: içe aktarmadan sonra veri klasöründe
  ham `distinct_id` aranır ve bulunmaz). Uygulama profilleri de aynı yolla (`viewerIdOfProfile`) takma kimlik alır.
- Yinelenme anahtarı da HMAC özetidir (`$insert_id` + olay + kimlik + zaman); ham değerleri içermez.
- Ham satır hiçbir yerde saklanmaz ve günlüğe yazılmaz; yalnız eşlenmiş alanlar kanonik olay olarak tutulur.
- Kimlik bilgileri yalnız ortam değişkenlerinden okunur; yanıtlara, günlüklere, hata metinlerine, dosyalara girmez.
- Silme: `DELETE /api/studio/sources/MIXPANEL` o kaynağın tüm günlüğünü ve özetlerini siler.

## 9. İlgi puanı (engagement)

Her izleyici × başlık özeti 0–1 bir ilgi puanı taşır (zevk topluluklarının girdisi):

```
oran  = min(1, izlenen sn / referans sn)     referans: film süresi; dizide ortalama bölüm × min(3, bölüm sayısı);
                                              künyede süre yoksa olaylarda görülen süre, o da yoksa 30 dk
puan  = 0.60·oran + 0.15·[en az bir tamamlama] + 0.10·[listede] + 0.05·[2+ oynatma]
        + 0.20 [çok beğendi] | + 0.10 [beğendi] | × 0.3 [beğenmedi]          → 0–1 aralığına kırpılır
```

Gösterim, tıklama ve arama özet üretmez (kaynak sayaçlarına girer). Liste ve beğeni durumu zaman damgasına göre en son
olaydır; özetler geliş sırasından bağımsızdır.

## 10. Bu dosya tabanlı deponun sınırları

Depo (`TVP_DATA_DIR/viewing/`): kaynak ve gün başına eklemeli NDJSON günlüğü + bellekteki özetler + anlık görüntü.

- Ölçülen (bu makinede): 1 milyon olay ≈ 11 sn'de içe aktarılır; süreç belleği ≈ 290 MB; günlük diskte ≈ 240 MB.
  Yeniden açılışta anlık görüntüden yüklenir, yalnız sonradan eklenen kuyruk oynatılır.
- Bellekte ham olay tutulmaz; ama **izleyici × başlık özetleri ve olay kimliği özetleri (olay başına 16 bayt)
  bellektedir**. Onlarca milyon olay ve yüz binlerce izleyicide bu tek süreç yetmez.
- Tek yazar: aynı depoyu aynı anda yalnız bir süreç açar (kilit dosyası).
- Gerçek ölçekte yerini bir veri ambarı alır (BigQuery / ClickHouse / Snowflake; Mixpanel'in kendi veri hattı
  ambarına doğrudan aktarabilir): kanonik olay tablosu (`ViewingEvent` sütunları, `id` tekil anahtar), izleyici ×
  başlık özetleri ve gün × başlık toplamları için artımlı görünümler. `ViewingService` arayüzü aynı kalır; yalnız
  `services/viewing/store.ts`'in yerine ambar sorguları gelir.
