"""model-card.md üretimi (Türkçe). Sayılar metrics.json'dan gelir; elle yazılmaz."""

from __future__ import annotations

from .encoders import ENCODERS
from .sources import FILMS

METHOD_TR = {
    "model": "mediafm-mini (tam: özet + geçerli etiketler)",
    "model_ctx_shuffled": "aynı model, bağlam başka başlıktan",
    "model_ctx_blank": "aynı model, bağlam boş",
    "model_noglobal": "[GLOBAL]'sız eğitilmiş ablasyon",
    "nearest_visible": "temel: en yakın görünür komşu",
    "neighbour_mean": "temel: iki komşunun ortalaması",
    "model_visible_ref": "üst referans: çekim gizlenmeden",
}


def _table(rows: dict, keys=("R@1", "R@5", "mean_rank", "norm_rank", "MRR")) -> str:
    out = ["| yöntem | " + " | ".join(keys) + " |", "|---|" + "---:|" * len(keys)]
    for m, o in rows.items():
        out.append(f"| {METHOD_TR.get(m, m)} | " + " | ".join(f"{o[k]:.3f}" if k != "mean_rank" else f"{o[k]:.2f}"
                                                         for k in keys) + " |")
    return "\n".join(out)


def render_card(metrics: dict, man: dict, mcfg: dict, tcfg: dict) -> str:
    ev = metrics["evaluation"]
    micro, macro = ev["overall_micro"], ev["overall_macro_by_title"]
    data = metrics["data"]
    train_rows = [d for d in data if d["inTraining"]]
    by_id = {f.video_id: f for f in FILMS}
    film_rows = []
    for d in sorted(train_rows, key=lambda x: x["videoId"]):
        f = by_id.get(d["videoId"])
        src = f"[{f.kind.lower()}]({f.page})" if f else ""
        film_rows.append(f"| {d['title']} | {d['videoId']} | {d['shots']} | {d['visual']}/{d['audio']}/{d['text']} | "
                         f"{f.author if f else ''} | {d['licence']} | {src} |")
    sd = [d for d in data if d["method"] == "SCENE_DETECT"]
    kf = [d for d in data if d["method"] == "KEYFRAMES"]
    per_title = ev["per_title"]
    pt_rows = []
    for t, r in sorted(per_title.items(), key=lambda kv: kv[1]["title"]):
        pt_rows.append(f"| {r['title']} | {r['fold']} | {r['shots']} | {r['model']['R@1']:.3f} | "
                       f"{r['nearest_visible']['R@1']:.3f} | {r['neighbour_mean']['R@1']:.3f} | "
                       f"{r['model_noglobal']['R@1']:.3f} | {r['model_ctx_shuffled']['R@1']:.3f} |")
    folds = metrics["cv_training"]
    fold_rows = [f"| {f['fold']} | {f['variant']} | {f['test']} | {f['val']} | {f['best_epoch']} | {f['epochs_run']} | "
                 f"{f['best_val_shot']:.4f} | {f['seconds']:.0f} |" for f in folds]
    ft = metrics["final_training"]
    enc = "\n".join(f"| {k} | [{v['model']}]({v['url']}) | {v['onnx']} | {v['licence']} |" for k, v in ENCODERS.items())
    return f"""# mediafm-mini — model kartı

**Sürüm:** `{man['id']}@{man['version']}` · **boyut:** {man['dims']} · **eğitilen parametre:** {metrics['params']:,}
· **üretim:** {man['builtAt']}

## Ne olduğu, ne olmadığı

mediafm-mini, Netflix'in MediaFM'inde anlatılan mimarinin (çekim düzeyinde üç kipli gömme + çekim dizisi üzerinde
maskeli çekim modellemesiyle eğitilen dönüştürücü + başlık düzeyi `[GLOBAL]` bağlam belirteci) **küçük, gerçekten
eğitilmiş bir örneğidir.** Eğitim verisi açık lisanslı {len({d['titleId'] for d in train_rows})} başlığın
{len(train_rows)} yaprağındaki {sum(d['shots'] for d in train_rows)} gerçek çekimdir; eğitim tek bir paylaşımlı CPU'da
dakikalar sürer.

- **Bir temel model (foundation model) değildir** ve hiçbir üretim modeliyle eşdeğer olduğu iddia edilmez.
- Kip kodlayıcıları başkalarının önceden eğitilmiş açık ağırlıklarıdır ve **dondurulmuştur**; eğitilen yalnız
  kaynaştırma dönüştürücüsüdür.
- Çekim vektörleri **bağlamsaldır**: bir çekimin vektörü komşu çekimleri ve başlığın özet + etiketlerini de taşır.
  Bu yüzden aynı filmin çekimleri birbirine yakın kümelenir (bkz. sınırlar).
- MediaFM yazısının kendisine (Netflix TechBlog, Şubat 2026) bu ortamdan erişilemedi; mimari ayrıntılar yazıyı
  aktaran ikincil kaynaklardan (çekim = birim; kip başına gömmeler birleştirilir; `[CLS]` ardından özet ve
  etiketlerden kurulan `[GLOBAL]`; çekimlerin %20'si öğrenilmiş `[MASK]` ile değiştirilir; tahmin ile özgün gömme
  arasında kosinüs uzaklığı) ve docs/ICERIK_ZEKASI.md §13.1'den alınmıştır. Doğrulanamayan her şey §13.1'e göre
  yapılmıştır.

## Mimari

```
çekim i ─► CLIP ViT-B/32 görüntü (3 kare ort.) 512 ─► Doğrusal ─┐   kip yoksa/gizliyse: öğrenilmiş "kip yok"
        ─► CLAP HTSAT ses (≤10 sn, 48 kHz)     512 ─► Doğrusal ─┼─► birleştir ─► Doğrusal+LN ─► x_i  (gizliyse [MASK])
        ─► çok dilli CLIP metin (altyazı)      512 ─► Doğrusal ─┘
özet (çok dilli CLIP metin 512) ─► Doğrusal ─┐
etiket öznitelikleri ({mcfg['tag_dim']}) ─► MLP ───────┴─► [GLOBAL]
[CLS] [GLOBAL] x_1 … x_n  + sinüs konum ─► dönüştürücü ({mcfg['layers']} katman, d={mcfg['d']}, {mcfg['heads']} baş,
ff={mcfg['ff']}, pre-LN, dropout {mcfg['dropout']}) ─► h_i (dışa aktarılan çekim vektörü, {mcfg['d']} boyut)
                                                    └─► kip başına başlık ─► gizlenen çekimin 3 kip vektörü (kosinüs)
yaprak vektörü = birim h_i'lerin ortalaması · başlık vektörü = yaprak vektörlerinin ortalaması (sunucuda)
```

Eğitim penceresi {mcfg['max_len']} çekimdir; daha uzun yapraklar yarı örtüşen pencerelerle kodlanır (pencere ortası
ağırlıklı ortalama). Etiket öznitelikleri: 16 ölçek (değer/5 + "dolu mu"), niteleyiciler, yüz değerleri, türler, ruh
hâlleri (çoklu-sıcak), etiket dayanağı (CONSENSUS/SAMPLE/MODEL/NONE) ve tür (film/dizi). Bağlam sunucunun
gönderdiği **geçerli** etiketlerdir; eğitimde de aynı girdiler kullanılır (`ml/tools/dump-inputs.ts`).

## Kip kodlayıcıları (dondurulmuş, ONNX Runtime, CPU)

| kip | model | ONNX dosyası | lisans |
|---|---|---|---|
{enc}

Ön işleme Hugging Face yapılandırmalarından okunmuştur (CLIP: kısa kenar 224 bikübik + ortadan kırpma + CLIP
ortalama/sapma; metin: en çok 128 belirteç, ortalama havuzlama + 768→512 Dense; CLAP: 48 kHz, 1024 FFT, 480 adım,
64 Slaney mel 50–14000 Hz, dB, 10 sn "repeatpad"; özgündeki rastgele kesme yerine belirlenimci ortadan kesme). Toplam
indirme ≈ 1,0 GB. Metin kodlayıcısı CLIP görüntü uzayına hizalı olduğu için model sunucusundaki metinle çekim arama
(demo) mümkündür.

## Eğitim verisi

Yalnız açık lisanslı (CC BY / kamu malı) **gerçek çekimler** eğitime girer; başlığa göre bölünür.

| başlık | videoId | çekim | görüntü/ses/metin kipi olan çekim | yapımcı | lisans | kaynak |
|---|---:|---:|---|---|---|---|
{chr(10).join(film_rows)}

Medya: Sintel ve Tears of Steel katalogdaki DASH manifestosunun barındırıcısından (480p'lik akış — 2,35:1 olduğu için
yüksekliği ≤ 364 piksel), diğerleri Wikimedia Commons'ın 360p VP9 dönüştürmesinden. Çekim sınırları uygulamanın kendi
çözümlemesidir (`npm run analyze:shots -- <id> --media …`). Metin kipi yalnız Türkçe altyazısı olan iki filmde var;
öteki filmlerde altyazı alınamadı (metin kipi "yok" olarak işaretli).

Dışa aktarma bütün kataloğu kapsar: {len(sd)} SCENE_DETECT yaprağı ({sum(d['shots'] for d in sd)} çekim) ve
{len(kf)} KEYFRAMES yaprağı ({sum(d['shots'] for d in kf)} sözde çekim: hazır küçük kareler + bölüm özeti, ses yok).
**KEYFRAMES vektörleri daha zayıftır:** model gerçek çekim dizileriyle eğitildi, 1–4 karelik sözde diziler eğitimde hiç
görülmedi; bu yapımların çoğu YouTube standart lisanslıdır ve **eğitimde kullanılmadı**, yalnız çıkarımdan geçti.

## Hiperparametreler

AdamW (lr {tcfg['lr']}, ağırlık çürümesi {tcfg['weight_decay']}), {tcfg['warmup']} dönem ısınma + kosinüs, yığın
{tcfg['batch']}, dönem başına her {mcfg['max_len']}'lik dilim için {tcfg['crops_per_window']} rastgele pencere,
çekim maskesi %{int(tcfg['mask_ratio'] * 100)}, gizlenmemiş çekimlerde tek kip gizleme olasılığı {tcfg['mod_mask_p']}
(kayıp ağırlığı {tcfg['mod_weight']}), gradyan kırpma 1.0, tohum {tcfg['seed']}. Çapraz doğrulamada erken durdurma:
ayrılmış doğrulama başlıklarında maskeli çekim kaybı, sabır {tcfg['patience']}. Son model: tüm açık filmler,
{ft['epochs']} dönem (CV'deki en iyi dönemlerin ortancası: {ft['cv_best_epochs']}), {ft['seconds']:.0f} sn; kayıp
{ft['loss_first']} → {ft['loss_last']}.

## Değerlendirme (ayrılmış başlıklar, {len(ev['folds'])} katlı başlık çapraz doğrulaması)

Protokol: her sınama yaprağında {ev['repeats']} kez çekimlerin %{int(ev['mask_ratio'] * 100)}'si gizlenir; her gizli
çekimin tahmini, aynı maskede gizlenen çekimler arasında sıralanır (benzerlik = ortak kiplerin kosinüs ortalaması).
Hiçbir sayı eğitim başlıklarından değildir. Ortalama aday sayısı {micro['model']['candidates_mean']:.1f}; rastgele
R@1 ≈ {micro['model']['random_R@1']:.3f}, R@5 ≈ {micro['model']['random_R@5']:.3f}; `norm_rank` = (sıra−1)/(aday−1),
rastgele ≈ 0,5.

**Tüm sorgular (mikro):**

{_table(micro)}

**Başlık ortalaması (makro):**

{_table(macro)}

**Başlık başına R@1:**

| başlık | kat | çekim | model | en yakın komşu | komşu ort. | [GLOBAL]'sız | bağlam karışık |
|---|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(pt_rows)}

**Eğitim kayıtları (CV):**

| kat | değişken | sınama | doğrulama | en iyi dönem | koşulan dönem | doğrulama kaybı | sn |
|---|---|---|---|---:|---:|---:|---:|
{chr(10).join(fold_rows)}

Yorum ve dürüst okuma için `ml/README.md` → "Sonuçlar"a bakın; kısa özet: tablolardaki sıralama neyse odur — bir temel
modelden iyi olmadığı satırlar da raporlanmıştır.

## Sınırlar

- Veri çok küçük (≈ {sum(d['shots'] for d in train_rows)} çekim, {len({d['titleId'] for d in train_rows})} başlık,
  çoğu Blender animasyonu): görsel dağılım dar, canlı çekim tek film (Tears of Steel), sessiz film tek film.
- Metin kipi neredeyse yok (iki filmde altyazı); konuşma içeriği vektörlere az yansır.
- KEYFRAMES yapımları (katalogun çoğu) 1–4 küçük kareyle temsil edilir; benzerlikleri büyük ölçüde kare görünümü ve
  bağlamdan (özet + etiketler) gelir.
- Etiketlerin çoğu otomatik öneridir (dayanak MODEL); etiket bağlamının katkısı bu yüzden de sınırlıdır.
- Bağlamsal vektörler başlığa göre kümelenir: "başka filmlerdeki benzer çekim" araması için tek kipli vektörler
  (model sunucusundaki /search) daha uygundur.
- Kodlayıcı çıktıları referans uygulamalarla (transformers) sayısal olarak karşılaştırılmadı; ön işleme
  yapılandırma dosyalarından elle yazıldı.

## Nasıl büyütülür

Aynı hat: gerçek katalog medyası → `analyze:shots` çekim sınırları → aynı kodlayıcılar (ya da daha güçlüleri: ör.
video için zamansal bir kodlayıcı, ses için konuşma + müzik ayrı) → daha geniş dönüştürücü (d 512–768, 6–12 katman,
512 çekimlik pencere) ve GPU'da büyük yığınlar; değerlendirmeye aşağı akış görevleri (tür / ton / etiket tahmini,
klip seçimi) eklenir. Ayrıntı: `ml/README.md`.
"""
