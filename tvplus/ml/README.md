# mediafm-mini — küçük, gerçekten eğitilmiş çok kipli çekim gömme modeli

Bu klasör TV+'ın çekim gömme soketine (docs/ICERIK_ZEKASI.md §8, §13.1) takılan **eğitilmiş** modeli üretir:
veri hattı, dondurulmuş kip kodlayıcıları, PyTorch ile eğitilen kaynaştırma dönüştürücüsü, başlığa göre ayrılmış
değerlendirme, sunucunun okuduğu biçimde dışa aktarma ve küçük bir model sunucusu.

**Ölçek hakkında açık konuşalım:** mediafm-mini, açık lisanslı bir avuç filmin (≈ 1 200 gerçek çekim) üzerinde, tek
bir paylaşımlı CPU'da birkaç dakikada eğitilen ≈ 0,6 milyon parametrelik bir kaynaştırma modelidir. Netflix'in
MediaFM'inde anlatılan mimarinin ve eğitim hattının **çalışan küçük bir örneğidir; bir temel model değildir** ve hiçbir
üretim modeliyle eşdeğerlik iddiası yoktur.

## Model ne yapıyor?

```
çekim ──► görüntü kodlayıcısı (CLIP ViT-B/32, dondurulmuş) ─┐
      ──► ses kodlayıcısı (CLAP HTSAT, dondurulmuş) ─────────┼─► kaynaştırma ─► [CLS] [GLOBAL] ç1 … çN ─► dönüştürücü ─► çekim vektörleri
      ──► metin kodlayıcısı (çok dilli CLIP, dondurulmuş) ───┘                     ▲                    (EĞİTİLEN)      yaprak / başlık vektörü
başlığın özeti (aynı metin kodlayıcısı) + geçerli etiketleri (öznitelik vektörü) ──┘ genel bağlam belirteci
```

- **Kip kodlayıcıları** önceden eğitilmiş açık ağırlıklardır, ONNX Runtime ile CPU'da çalışır ve eğitilmez.
  Her çekimin üç karesi, ses parçası (≤ 10 sn) ve o sırada söylenenler (altyazı) ayrı ayrı 512 boyutlu vektöre çevrilir.
  Olmayan kip (sözde çekimde ses, konuşmasız çekimde metin, sessiz filmde ses) **açıkça "yok" olarak işaretlenir** ve
  modele öğrenilmiş bir "kip yok" gömmesi olarak girer; sıfır vektörü veri gibi kullanılmaz.
- **Kaynaştırma dönüştürücüsü** eğittiğimiz parçadır. Hedef **maskeli çekim modelleme**: bir pencerede çekimlerin
  %20'si öğrenilmiş `[MASK]` ile değiştirilir, model gizlenen çekimin özgün üç kip vektörünü komşu çekimlerden ve genel
  bağlamdan tahmin eder; kayıp kosinüs uzaklığıdır (1 − cos). Ek olarak gizlenmemiş çekimlerde bazen tek bir kip
  gizlenip yalnız o kip tahmin edilir.
- **`[GLOBAL]` belirteci** başlığın özetinin metin vektöründen ve **geçerli etiketlerinden** (16 ölçek, niteleyiciler,
  yüz değerleri, tür, ruh hâli, etiket dayanağı) kurulur ve `[CLS]`'den hemen sonra gelir; her çekim ona dikkat eder.
  Etiket burada nihai sınıflandırma değil, modelin girdisidir: uygulamada bir başlığın etiketi değişince (http
  sağlayıcısıyla) o başlığın vektörleri de değişir.

### MediaFM'den ne alındı, ne doğrulanamadı?

MediaFM yazısı (Netflix TechBlog, Şubat 2026) bu makineden açılamadı (alan adı ağ izninde yok); ayrıntılar yazıyı
aktaran ikincil kaynaklardan ve bir arXiv makalesinin (2608.18322) özetlerinden derlendi. Bu kaynaklarda tutarlı
olanlar: temel birim çekimdir; çekim başına görüntü, ses ve zamanlı metin gömmeleri birleştirilip birim uzunluğa
getirilir; bir başlık en çok 512 çekimlik bir dizidir; BERT benzeri bir dönüştürücü (bir kaynakta 3 katman) diziyi
bağlamlar; `[CLS]`'den sonra başlık meta verisinden (özet, etiketler) kurulan ve izdüşürülen bir `[GLOBAL]` belirteci
gelir; çekimlerin %20'si öğrenilmiş `[MASK]` ile değiştirilir ve tahmin ile özgün (birleşik) gömme arasındaki kosinüs
uzaklığı en aza indirilir. Doğrulanamayan her ayrıntıda docs/ICERIK_ZEKASI.md §13.1 izlendi. Farklar: kodlayıcılar
burada küçük ve açık (SeqCLIP / wav2vec 2.0 / ticari metin gömmesi yerine CLIP, CLAP, çok dilli CLIP), hedef birleşik
vektör yerine kip başına kosinüs ortalamasıdır (eksik kipler kayba girmez), konum sinüs kodlamasıdır ve eğitim
penceresi 64 çekimdir.

### Kip kodlayıcıları ve neden bunlar

| kip | model | lisans | neden |
|---|---|---|---|
| görüntü | [openai/clip-vit-base-patch32](https://huggingface.co/openai/clip-vit-base-patch32) (ONNX: Xenova/clip-vit-base-patch32 `onnx/vision_model.onnx`, 352 MB) | MIT | küçük, CPU'da hızlı, genel amaçlı; metinle ortak uzay |
| metin | [sentence-transformers/clip-ViT-B-32-multilingual-v1](https://huggingface.co/sentence-transformers/clip-ViT-B-32-multilingual-v1) (`onnx/model.onnx` 539 MB + `2_Dense`) | Apache-2.0 | Türkçe dahil 50+ dil; çıktısı CLIP ViT-B/32 görüntü uzayına hizalı → "Türkçe ifadeyle çekim arama" |
| ses | [laion/clap-htsat-unfused](https://huggingface.co/laion/clap-htsat-unfused) (ONNX: Xenova/clap-htsat-unfused `onnx/audio_model.onnx`, 118 MB) | Apache-2.0 | genel ses (müzik, ortam, konuşma) için eğitilmiş; konuşmaya özel wav2vec'ten film sesine daha uygun |

Toplam indirme ≈ 1,0 GB. Ön işlemeler Hugging Face'teki `preprocessor_config.json` / `sentence_bert_config.json` /
`1_Pooling` / `2_Dense` yapılandırmalarından okunarak `mediafm_mini/encoders.py` içinde yazıldı (CLAP'ta özgün
rastgele kesme yerine tekrarlanabilirlik için ortadan kesme). ONNX giriş/çıkış adları (`pixel_values → image_embeds`,
`input_ids, attention_mask → last_hidden_state`, `input_features → audio_embeds`) dosyalardan doğrulandı.

## Kurulum

Python 3.11+ (3.13 ile denendi), ffmpeg/ffprobe, Node (çekim çözümlemesi ve sunucu için depo zaten kurulu olmalı).

```bash
cd ml
python -m venv .venv            # ya da: uv venv .venv
.venv/bin/pip install -r requirements.txt     # ya da: uv pip install -p .venv/bin/python -r requirements.txt
```

PyTorch'un varsayılan tekerleği büyüktür (CUDA kütüphaneleriyle ~5 GB) ama CPU'da çalışır; CPU'ya özel dizin
erişilebiliyorsa `--index-url https://download.pytorch.org/whl/cpu` ile daha küçük kurulur. `.venv/` ve `.cache/`
(medya, kodlayıcı ağırlıkları, öznitelik önbelleği, eğitim koşuları) git'e girmez (`ml/.gitignore`).

## Adım adım (hepsi `ml/` içinden; yeniden çalıştırmak önbellektekini yeniden hesaplamaz)

| adım | komut | ne yapar | süre (4 çekirdek paylaşımlı) |
|---|---|---|---|
| 1. medya | `.venv/bin/python -m data.fetch_media` | açık filmleri indirir (`mediafm_mini/sources.py` kaydı; sırayla, ≈ 1 istek/sn, 429'da bekler; Commons 360p VP9) | ~10 dk (Wikimedia kısıtlamasıyla) |
| 2. çekimler | `.venv/bin/python -m data.analyze_all` | her Commons filmi için **uygulamanın** çözümleyicisini çalıştırır: `npm run analyze:shots -- <id> --media <dosya> --note "<kaynak · lisans>"` → `content/shots/<id>.json` | ~5 dk |
| 3. girdiler | `cd .. && npx tsx ml/tools/dump-inputs.ts --out ml/.cache/inputs.json` | sunucunun sağlayıcıya göndereceği `EmbeddingInput`'ları (çekimler + özet + GEÇERLİ etiketler) aynen döker | 2 sn |
| 4. öznitelikler | `.venv/bin/python -m data.build_features` | kodlayıcıları ilk kullanımda indirir; çekim başına 3 kip vektörü + özet vektörleri → `.cache/features/` (KEYFRAMES kareleri i.ytimg.com'dan bir kez) | ~25 dk ilk sefer |
| 5. çapraz doğrulama | `.venv/bin/python train.py --cv 5` | başlığa göre 5 kat × (tam model, `[GLOBAL]`'sız ablasyon) | ~10 dk |
| 6. değerlendirme | `.venv/bin/python evaluate.py` | ayrılmış başlıklarda maskeli çekim bulma + temeller + ablasyonlar → `.cache/runs/cv/metrics.json` | ~2 dk |
| 7. son model | `.venv/bin/python train.py --final` | tüm açık filmlerle; dönem sayısı CV'den | ~1 dk |
| 8. dışa aktarma | `.venv/bin/python export.py` | tüm katalog → `content/models/mediafm-mini/` | ~1 dk |
| 9. sınamalar | `.venv/bin/python -m pytest` | saf parçaların birim sınamaları (ağsız, saniyeler) | 3 sn |

Tohumlar sabittir (eğitim 7, katlar 7, değerlendirme maskeleri 2026). Aynı önbellek + aynı tohum aynı ağırlıkları
verir (CPU'da `torch.set_num_threads(2)`).

## Çıktılar uygulamaya nasıl ulaşır?

1. **Depoda gelen vektörler (varsayılan):** `content/models/mediafm-mini/` — `manifest.json` (biçim
   `tvplus-embedding/1`, `id` = klasör adı), `vectors.jsonl` (ilk satır model satırı, sonra yaprak başına çekim vektörleri
   + havuz vektörü), ayrıca bilgi için `title-vectors.json`, ağırlıklar (`model.safetensors` + `config.json`),
   `metrics.json`, `model-card.md`. `TVP_EMBEDDING_PROVIDER` verilmemişse sunucu açılışta bu klasörü okur
   (`server/src/services/embeddings/models.ts`); çekim sayısı güncel çözümlemeyle uyuşmayan yapraklar taban
   sağlayıcıya düşer. `GET /api/studio/embeddings` → `provider: "dosya"`, `modelVersion: "mediafm-mini@<sürüm>"`.
2. **Canlı model sunucusu:** `.venv/bin/python serve.py --port 9100`, sonra depo kökünde
   `TVP_EMBEDDING_PROVIDER=http TVP_EMBEDDING_URL=http://127.0.0.1:9100/tvplus npm start`. Sunucu her yaprak için
   `{protocol, input}` gönderir; model sunucusu önbellekteki tek kipli öznitelikleri bulur (yoksa yerel medyadan
   hesaplar, ağa çıkmaz) ve **istekteki** özet + güncel etiketlerle kaynaştırma modelini çalıştırır.
   Ek uçlar: `GET /health`; `GET /search?q=karlı dağlar&k=10` (demo: çok dilli CLIP metin vektörüyle çekimlerin CLIP
   görüntü vektörleri arasında arama — bağlamsal vektörler değil, ortak uzaydaki tek kipli vektörler kullanılır).

## Sonuçlar

Güncel sayılar `content/models/mediafm-mini/metrics.json` ve `model-card.md` içindedir (dışa aktarmada üretilir).
Okuma kılavuzu:

- Değerlendirme yalnız **ayrılmış başlıklarda**dır (5 katlı başlık çapraz doğrulaması; bir başlığın hiçbir çekimi
  sınandığı katta eğitime girmez). Görev: çekimlerin %20'si gizlenir; her gizli çekimin tahmini, aynı maskedeki gizli
  çekimler arasında sıralanır.
- **Temeller:** en yakın görünür komşunun vektörü; soldaki ve sağdaki komşuların ortalaması. Komşu ortalaması bu
  görevde güçlü bir temeldir (ardışık çekimler çok benzer).
- **Ablasyonlar:** `[GLOBAL]`'sız ayrıca eğitilen model; aynı modele başka başlığın bağlamını (özet + etiket) vermek;
  bağlamı boşaltmak. Bağlamın katkısı küçükse bu tablolar onu gösterir.
- **Üst referans:** çekim gizlenmeden modelin aynı çekim için tahmini (yeniden kurma).

## Gerçek katalog ve GPU ile büyütme

- **Veri:** katalog medyasının tamamı (lisanslı içerik, şirket içinde) `npm run analyze:shots` ile çekimlere bölünür;
  `data/fetch_media.py` yerine depolama erişimi; altyazılar (Türkçe) metin kipini doldurur. Etiketleyici fişleri
  (CONSENSUS) arttıkça `[GLOBAL]` girdisi güçlenir.
- **Kodlayıcılar:** `encoders.py` içindeki üç sınıf aynı arayüzle daha güçlüleriyle değiştirilir (ör. zamansal video
  kodlayıcısı, konuşma için ayrı bir ASR + metin kodlayıcısı, 768–1024 boyutlu çok dilli metin modeli); öznitelik
  önbelleği yaprak başına `.npz` olduğundan iş parçalara bölünüp paralel çalıştırılabilir.
- **Model:** `ModelConfig` (d 512–768, 6–12 katman, `max_len` 512) ve `TrainConfig` (yığın 64–256, karışık duyarlık,
  GPU) — kod aynı; `torch.set_num_threads` yerine `cuda` cihazı eklenir.
- **Değerlendirme:** maskeli çekim bulmaya ek olarak aşağı akış görevleri (tür/ton/etiket tahmini için doğrusal
  yoklama, klip seçimi, izlenme tahmini) ve insan değerlendirmesi.
- **Servis:** dışa aktarma çevrimdışı toplu iş olarak kalır; canlı etiket değişikliği için `serve.py` bir GPU sunucusunda
  yığınlı çalıştırılır.

## Klasör

```
ml/
  README.md  requirements.txt  pytest.ini  .gitignore
  mediafm_mini/   paths, sources (film kaydı + indirme), media (ffmpeg), stills, encoders (ONNX), features (önbellek),
                  corpus, context (etiket öznitelikleri), dataset (bölme, maskeleme, collate), model, training, infer,
                  metrics, export_format, card, pipeline
  data/           fetch_media.py, analyze_all.py, build_features.py
  tools/          dump-inputs.ts (sunucunun girdilerini döker; sunucu kodunu yalnız okur)
  train.py  evaluate.py  export.py  serve.py
  tests/          pytest (saf parçalar)
```
