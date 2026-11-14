# Gömme sağlayıcı protokolü (`tvplus-embedding/1`)

Gerçek bir çok kipli model TV+'a iki yoldan takılır: **`http`** (canlı model sunucusu) ya da **`dosya`** (başka yerde
üretilmiş vektörler). İkisi de yerleşik `taban` sağlayıcısıyla aynı girdiyi alır ve aynı biçimde çıktı verir; servis,
önbellek, komşu araması ve izdüşüm sağlayıcıdan bağımsızdır. Tanımlar: `provider.ts`.

> `taban` eğitilmemiş, elle kurulmuş deterministik bir kodlayıcıdır; hattı ve arayüzü çalışır tutar, bir temel modelin
> (foundation model) yerini tutmaz.

## Girdi: `EmbeddingInput` (yaprak = film ya da bölüm başına bir istek)

```jsonc
{
  "videoId": 80010001,
  "titleId": 80010001,
  "method": "SCENE_DETECT", // ya da "KEYFRAMES" (gömme başlıklar: birkaç hazır kare)
  "durationSec": 888.053, // bilinmiyorsa null
  "videoText": "", // bölüm / ek video özeti (filmde boş: özet bağlamdadır)
  "shots": [
    {
      "index": 0,
      "startSec": 0,
      "endSec": 6.25,
      "visual": {
        // null olabilir (görseli olmayan yapım)
        "hist": [/* 16 sayı: 12 ton + 4 açıklık, shared/shots-schema.ts */],
        "bright": 0.62,
        "contrast": 0.18,
        "sat": 0.21,
        "colorful": 0.15,
        "edges": 0.31,
        "motion": 0.04,
      },
      "audio": { "loud": -24.1, "silence": 0.1, "zcr": 0.08, "centroid": 1420 }, // null olabilir
      "text": "Bu bıçağın karanlık bir geçmişi var.", // çekim sırasında söylenenler; yoksa ""
    },
  ],
  "context": {
    // GENEL BAĞLAM — her çekime eklenmesi beklenir
    "titleId": 80010001,
    "type": "MOVIE",
    "title": "Sintel",
    "synopsis": "…",
    "genres": ["animasyon", "fantastik"], // shared/taxonomy GENRES anahtarları
    "moods": ["duygusal"], // shared/taxonomy MOODS anahtarları
    "keywords": [],
    "tags": {
      // geçerli etiketler (TaggingService.effective); yoksa basis "NONE", alanlar boş
      "basis": "CONSENSUS",
      "scales": { "romantizm": 2, "siddet": 3 }, // 0–5
      "facets": { "mekan": ["kir"] },
      "descriptors": ["gerilimli"],
    },
  },
}
```

Çekimler zaman sırasıyladır; model bağlamlamayı (komşu çekimler) kendisi yapar. Ham medya gönderilmez: model kendi
kare/ses kodlayıcısını kullanacaksa `content/shots/<videoId>.json` içindeki çekim sınırlarıyla aynı medyayı kendi
tarafında çözmelidir (çekim sırası ve sayısı bu dosyayla aynı kalmalıdır).

## Çıktı

Her yaprak için `shots.length` adet çekim vektörü ve bir havuz (yaprak) vektörü; hepsi aynı boyutta (`dims`), sonlu
sayılar. Sunucu vektörleri birim uzunluğa getirir (benzerlik kosinüstür). Dizi vektörü bölüm havuz vektörlerinin
ortalamasıdır (sunucuda hesaplanır).

## `http` sağlayıcısı

`TVP_EMBEDDING_PROVIDER=http` · `TVP_EMBEDDING_URL=http://model-sunucusu:9000/tvplus` (vekil ayarlarına —
`HTTPS_PROXY`, `NO_PROXY` — uyar).

| İstek        | Gövde                                                           | Yanıt (200, JSON)                                                                           |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET <url>`  | —                                                               | `{ "protocol": "tvplus-embedding/1", "model": { "id": "…", "version": "…", "dims": 768 } }` |
| `POST <url>` | `{ "protocol": "tvplus-embedding/1", "input": EmbeddingInput }` | `{ "videoId": 80010001, "shots": [[…], …], "pooled": […] }`                                 |

Denetimler (biri tutmazsa yaprak atlanır, `POST /api/studio/embeddings/rebuild` yanıtında `x-tvplus-embed-failed`
artar, sunucu günlüğüne yazılır): `protocol` eşleşir · `2 ≤ dims ≤ 4096` · `videoId` istekle aynı ·
`shots.length` = girdideki çekim sayısı · her vektörün uzunluğu `dims` · tüm değerler sonlu sayı.

Zaman aşımı 30 sn; ağ hatası, zaman aşımı, `429` ve `5xx` en çok 2 kez yeniden denenir (500 ms, 1 sn bekleme). `4xx`
ve geçersiz yanıt yeniden denenmez. Önbellek anahtarı `http:<id>@<version>` + girdi özetidir: model sürümü değişince
tüm yapraklar yeniden kodlanır; aynı sürümde yalnız girdisi (çekim dosyası, özet, **etiketler**) değişenler.

## `dosya` sağlayıcısı

`TVP_EMBEDDING_PROVIDER=dosya` · dosyalar: `<dataDir>/embeddings/import/*.jsonl` (ada göre sıralı okunur; aynı
`videoId` sonraki dosyada yeniden geçerse sonuncusu geçerlidir). Satır başına bir JSON:

```jsonl
{"kind":"model","id":"benim-modelim","version":"2026-11-01","dims":768}
{"kind":"video","videoId":80010001,"titleId":80010001,"shots":[[0.01,…],…],"pooled":[…]}
```

- Her dosyanın ilk satırı `model` satırıdır; dosyalar arasında `dims` aynı olmalıdır.
- `pooled` isteğe bağlıdır (yoksa çekim vektörlerinin ortalaması alınır); `titleId` bilgi içindir.
- Çekim sayısı `content/shots` çözümlemesindeki sayıyla aynı olmalıdır; değilse o yaprak hata sayılır.
- Dosyada olmayan yaprakların vektörü olmaz (başlık komşularında görünmez).
- Önbellek anahtarı `dosya:<id>@<version>#<dosyaların özeti>`: dosya değişince yeniden okunur.

`npm run embed:catalog -- --out vectors.jsonl` yapılandırılmış sağlayıcının vektörlerini bu biçimde dışa aktarır
(taban çıktısını gerçek bir modelinkiyle karşılaştırmak ya da bir modelin çıktısını içe almadan önce biçimi görmek için).

## Depoda gelen eğitilmiş vektörler (`content/models/<model-id>/`)

Bir model başka yerde (ör. `ml/` altında Python ile) eğitildiyse çıktısı depoya konabilir; sunucu açılışta okur.

```
content/models/<model-id>/
  manifest.json
  vectors.jsonl        (bir ya da birkaç .jsonl; yukarıdaki `dosya` biçimiyle aynı satırlar)
```

`manifest.json` (şema: `server/src/services/embeddings/models.ts` → `zModelManifest`):

```jsonc
{
  "format": "tvplus-embedding/1", // zorunlu, aynen
  "id": "mediafm-tr-v0", // zorunlu; klasör adıyla AYNI; [a-z0-9][a-z0-9._-]{0,63}
  "version": "2026-11-20", // zorunlu; 1–64 karakter
  "dims": 256, // zorunlu; 2–4096; JSONL'deki model satırıyla aynı
  "builtAt": "2026-11-20T10:00:00Z", // zorunlu; ISO 8601 (birden çok model varsa en yenisi seçilir)
  "modalities": ["VISUAL", "AUDIO", "TEXT", "CONTEXT"], // isteğe bağlı, bilgi için
  "files": ["vectors.jsonl"], // isteğe bağlı; verilmezse klasördeki tüm .jsonl (ada göre sıralı)
  "description": "eğitim verisi, kod sürümü…", // isteğe bağlı, ≤ 2000 karakter
}
```

JSONL: ilk satır `{"kind":"model","id":"<id>","version":"<version>","dims":<dims>}` — manifestle birebir aynı; sonra yaprak
başına `{"kind":"video","videoId":…,"titleId":…,"shots":[[…],…],"pooled":[…]}`. Her yaprakta `shots` sayısı ve sırası
`content/shots/<videoId>.json` (SCENE_DETECT) ya da `content/shots/keyframes.json` içindeki o yaprağın `shots` dizisiyle
aynı olmalıdır; `pooled` isteğe bağlıdır (yoksa çekim ortalaması). Vektörler sunucuda birim uzunluğa getirilir.

**Seçim kuralı** (`plugin.ts` → `providerFor`):

1. `TVP_EMBEDDING_PROVIDER=taban|http|dosya` verilmişse her zaman o kullanılır (depodaki model yok sayılır).
2. Verilmemişse ve `content/models/*/manifest.json` geçerliyse (şema, id = klasör adı, JSONL model satırı manifestle
   aynı, en az bir geçerli yaprak) o model kullanılır: `EmbeddingInfo.provider = "dosya"`,
   `modelVersion = "<id>@<version>"`. Geçersiz klasörler sunucu günlüğüne nedeniyle yazılır ve atlanır.
3. Modelin kapsamadığı yapraklar — dosyada olmayan ya da çekim sayısı güncel çözümlemeyle artık uyuşmayan — `taban`
   ile kodlanır. İki aile aynı matriste ayrık alt uzaylardadır: vektör = `[model (dims) | taban (192)]`, `info.dims =
dims + 192`. Model vektörleri yalnız birbiriyle, taban vektörleri yalnız birbiriyle benzeşir; aralarındaki kosinüs 0.
   Kapsama `GET /api/studio/embeddings` yanıtının `x-tvplus-embed-model-videos` ve `x-tvplus-embed-fallback-videos`
   başlıklarındadır (EmbeddingInfo'da alan yok). Bölümlerinin bir kısmı kapsanan dizinin vektörü iki ailenin
   ortalamasıdır.

## Çekim dizini olarak `content/shots` (model eğitimi için)

Model, çekim sınırlarını `content/shots/*.json` dosyalarından okur (şema: `shared/shots-schema.ts`). Uygulamada
YouTube'dan gömülen ama medyası başka yerde bulunan bir yapım için gerçek çekim çözümlemesi şöyle üretilir:

```
npm run analyze:shots -- <videoId> --media /yol/film.webm [--subs /yol/film.tr.srt] [--note "kaynak adresi, lisans"]
```

Sonuç normal bir `SCENE_DETECT` dosyasıdır (`media.source = "LOCAL"`, `media.note`, `media.sha256`); yaprak
`keyframes.json` içinden çıkarılır ve sonraki `all` çalıştırmaları onu geri eklemez. Altyazı dili dosya adından okunur
(`film.tr.srt` → `tr`; yoksa `und`).
