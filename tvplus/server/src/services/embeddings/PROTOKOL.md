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
        "hist": [
          /* 16 sayı: 12 ton + 4 açıklık, shared/shots-schema.ts */
        ],
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

| İstek             | Gövde                                              | Yanıt (200, JSON)                                                                           |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET <url>`       | —                                                  | `{ "protocol": "tvplus-embedding/1", "model": { "id": "…", "version": "…", "dims": 768 } }` |
| `POST <url>`      | `{ "protocol": "tvplus-embedding/1", "input": EmbeddingInput }` | `{ "videoId": 80010001, "shots": [[…], …], "pooled": […] }`                  |

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
