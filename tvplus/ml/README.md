# mediafm-mini — küçük, gerçekten eğitilmiş çok kipli çekim gömme modeli

Bu klasör TV+'ın çekim gömme soketine (docs/ICERIK_ZEKASI.md §8, §13.1) takılan **eğitilmiş** modeli üretir:
veri hattı, dondurulmuş kip kodlayıcıları, PyTorch ile eğitilen kaynaştırma dönüştürücüsü, başlığa göre ayrılmış
değerlendirme, sunucunun okuduğu biçimde dışa aktarma ve küçük bir model sunucusu.

**Ölçek hakkında açık konuşalım:** mediafm-mini, açık lisanslı bir avuç filmin (≈ 1 200 gerçek çekim) üzerinde, tek
paylaşımlı bir CPU'da dakikalar içinde eğitilen ≈ 1,0 milyon (989 955) parametrelik bir kaynaştırma modelidir. Netflix'in
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
  bağlamdan tahmin eder; kayıp kosinüs uzaklığıdır (1 − cos), hedefler kip başına eğitim ortalaması çıkarılmış
  vektörlerdir (CLIP/CLAP vektörlerinde rastgele iki çekimin kosinüsü ≈ 0,8; ortalama çıkarılmazsa "ortalamayı tahmin
  et" kestirmesi ödüllenir). Ek olarak gizlenmemiş çekimlerde bazen tek bir kip gizlenip yalnız o kip tahmin edilir.
- **Kopya başlığı (bizim eklememiz):** tahmin = görünür çekimlerin özgün kip vektörlerinin dikkat ağırlıklı toplamı
  (ağırlıklar bağlamsal vektörlerden + öğrenilmiş uzaklık cezası) + küçük ölçekli doğrusal başlık. İlk sürümde
  (salt doğrusal başlık, 128 boyutlu darboğaz) model eğitim filmlerinde komşu ortalaması kadar iyi, ayrılmış filmlerde
  ise çok kötüydü (kosinüs 0,24'e karşı 0,46): eğitim filmlerinin içeriğini ezberliyordu.
- **Bağlam eşleştirme kaybı (bizim eklememiz):** `[CLS]`'den "bu özet + etiketler bu çekim dizisinin mi?" ikili
  sınıflandırması; yığındaki öğelerin yarısında bağlam başka başlıkla değiştirilir. Amaç modeli bağlamı okumaya
  zorlamaktı; ayrılmış başlıklara genelleyemedi (aşağıda).
- **Dışa aktarılan çekim vektörü** = son katmanın bağlamsal çekim çıktısı (128 boyut), eğitim çekimlerinin ortalaması
  çıkarılmış ve birim uzunlukta (çıkarılmazsa tüm kosinüsler ≈ 0,99 çıkıyordu). Yaprak vektörü bunların ortalaması.
- **`[GLOBAL]` belirteci** başlığın özetinin metin vektöründen ve **geçerli etiketlerinden** (bugün tüm başlıklar için
  özetten doldurulmuş ÖRNEK fişler — izlenerek değil; 16 ölçek, niteleyiciler,
  yüz değerleri, tür, ruh hâli, etiket dayanağı) kurulur ve `[CLS]`'den hemen sonra gelir; her çekim ona dikkat eder.
  Etiket burada nihai sınıflandırma değil, modelin girdisidir: uygulamada bir başlığın etiketi değişince (http
  sağlayıcısıyla) o başlığın vektörleri de değişir.

### Tasarımın dayanağı (MediaFM hakkında ne biliyoruz, ne bilmiyoruz)

MediaFM yazısı (Netflix TechBlog, Şubat 2026) bu makineden okunamadı (makale sayfaları bot korumasıyla 403 döndürüyor,
RSS akışında yok). Tasarım bu yüzden **makalenin doğrulanmış bir okumasına değil**, şunlara dayanır:
(1) ürün sahibinin modeli anlatışı — ses + görüntü + metinden çekim düzeyi vektörler; başlığın özeti ve etiketleri
her çekime eklenen genel bağlam ("etiketler artık nihai sınıflandırma değil, modelin girdilerinden biri");
(2) çekim dizileri üzerinde maskeli modelleme fikrinin genel, yayımlanmış hâli (BERT tarzı maskeli tahmin,
kosinüs benzerliğiyle gömme hedefi); (3) docs/ICERIK_ZEKASI.md §13.1. Ayrıntılarda (katman sayısı, maske oranı,
kodlayıcılar, kayıp biçimi) MediaFM ile **eşleştiğine dair hiçbir iddiada bulunmuyoruz**; buradaki seçimler bu
veri ölçeğine göre yapılmış kendi seçimlerimizdir: maske oranı %20, kip başına kosinüs kaybı (eksik kipler kayba
girmez), sinüs konum kodlaması, 64 çekimlik eğitim penceresi, 3 katman.

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
| 4. öznitelikler | `.venv/bin/python -m data.build_features` | kodlayıcıları ilk kullanımda indirir (≈ 1 GB, 40 sn); çekim başına 3 kip vektörü + özet vektörleri → `.cache/features/` (KEYFRAMES kareleri i.ytimg.com'dan bir kez; 424 istek) | 35 dk ilk sefer (yüklü makinede), sonra saniyeler |
| 5. çapraz doğrulama | `.venv/bin/python train.py --cv 5` | başlığa göre 5 kat × (tam model, `[GLOBAL]`'sız ablasyon) | ~5 dk |
| 6. değerlendirme | `.venv/bin/python evaluate.py` | ayrılmış başlıklarda maskeli çekim bulma + temeller + ablasyonlar + bağlam eşleştirme → `.cache/runs/cv/metrics.json` | ~25 sn |
| 7. son model | `.venv/bin/python train.py --final` | tüm açık filmlerle; dönem sayısı CV'deki en iyi dönemlerin ortancası (43) | ~30 sn |
| 8. dışa aktarma | `.venv/bin/python export.py` | tüm katalog (129 yaprak) → `content/models/mediafm-mini/` (≈ 6,3 MB) | ~30 sn |
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

## Sonuçlar (ayrılmış başlıklar, 5 katlı başlık çapraz doğrulaması)

Tam tablolar: `content/models/mediafm-mini/model-card.md` ve `metrics.json`. Veri: 13 açık lisanslı başlığın 15
yaprağı, 1 184 gerçek çekim (eğitim); dışa aktarma 129 yaprak, 1 619 çekim/sözde çekim.

**Maskeli çekim bulma** — çekimlerin %20'si gizlenir (yaprak başına 10 tohumlu tekrar), her gizli çekimin tahmini aynı
maskedeki gizli çekimler (ort. 21,5 aday; rastgele R@1 0,064) arasında sıralanır. Tüm sorgular (mikro, 2 360 sorgu):

| yöntem | R@1 | R@5 | ort. sıra | MRR |
|---|---:|---:|---:|---:|
| mediafm-mini (özet + geçerli etiketler) | 0,325 | 0,758 | 4,33 | 0,511 |
| aynı model, bağlam başka başlıktan | 0,325 | 0,758 | 4,33 | 0,511 |
| aynı model, bağlam boş | 0,325 | 0,758 | 4,33 | 0,511 |
| `[GLOBAL]`'sız eğitilmiş model | 0,327 | 0,764 | 4,28 | 0,514 |
| temel: en yakın görünür komşu | 0,281 | 0,698 | 5,11 | 0,465 |
| temel: iki komşunun ortalaması | 0,326 | 0,753 | 4,34 | 0,511 |

**Bağlam eşleştirme** — ayrılmış yaprağın çekimleri 13 başlığın bağlamıyla ayrı ayrı modele verilir: model R@1 0,000,
R@5 0,267, ortalama sıra 6,87 (rastgele 7); eğitimsiz CLIP temeli (film görüntü ortalaması · özet metni) R@1 0,400,
R@5 0,867, ortalama sıra 3,20.

**Dürüst özet:**

1. Model ayrılmış filmlerde "en yakın komşuyu kopyala"yı geçer, **"iki komşunun ortalaması" ile berabere kalır**
   (başlık ortalamasında temel R@1'de az farkla önde). Öğrendiği şey esasen yerel aradeğerlemedir.
2. **Bağlamın (`[GLOBAL]`: özet + etiketler) bu ölçekte ölçülebilir bir katkısı yok.** Ablasyon ve karıştırma aynı
   sonucu verir; eşleştirme başlığı rastgele düzeyinde, eğitimsiz CLIP temeli açıkça daha iyi. 10 civarı eğitim
   başlığıyla model başlık bağlamını kullanmayı öğrenemiyor.
3. Uygulamada (aşağıdaki denetim) etiket değişikliği vektörü değiştirir ama çok az (Sintel havuz vektörü kosinüsü
   0,99999). Hat çalışıyor; bu modelin bağlama duyarlılığı yok denecek kadar küçük.
4. Tasarım kararları (ortalama çıkarma, kopya başlığı) ilk CV sonuçlarına ve kat 0'ın sınama başlıklarına bakılarak
   verildi; bu, raporlanan sayılarda küçük bir iyimserlik kaynağıdır. Hiperparametre taraması yapılmadı.

**Uygulamada nitel denetim** (Sintel çekim komşuları, başka filmlerden): karanlık mağara/ejderha çekimi → Spring'in
karanlık orman yaratığı çekimleri (taban sağlayıcı: Elephants Dream'in karanlık sahnesi); yavru ejderha yakın planı →
Elephants Dream'deki yüz yakın planı, Big Buck Bunny yaratık yakın planı (taban: Big Buck Bunny geniş çayır planı);
Sintel'in yüz yakın planı → Tears of Steel asker, Charge robotu (karışık). Başlık komşuları: Sintel → Big Buck Bunny,
Tears of Steel, Cosmos Laundromat, Spring (taban: Elephants Dream, Spring, Agent 327 — ikisi de makul). Zayıf yer:
A Trip to the Moon (gerçek çekimli sessiz film) Türkçe belgesellere yakın düşüyor; taban sağlayıcı onu doğru biçimde
öteki sessiz klasiklerin yanına koyuyor (o, tür/ruh hâli bağlamını doğrudan karıştırıyor; bizim model bağlamı
kullanmıyor). Görseli olmayan arşiv klasikleri yalnız özet metniyle temsil edilir ve birbirine yakın kümelenir.

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
