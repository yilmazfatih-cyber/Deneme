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
    "model_visible_ref": "denetim: çekim gizlenmeden (kopya başlığı çekimin kendisini görür)",
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
        author = (f.author if f else "").replace("|", "\\|")
        film_rows.append(f"| {d['title']} | {d['videoId']} | {d['shots']} | {d['visual']}/{d['audio']}/{d['text']} | "
                         f"{author} | {d['licence']} | {src} |")
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
    cm = ev["context_match"]
    cm_rows = "\n".join(f"| {r['title']} | {r['fold']} | {r['model_rank']} | {r['clip_baseline_rank']} |"
                         for r in cm["videos"])
    m_, b_ = micro["model"], micro["neighbour_mean"]
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
- **Tasarımın dayanağı:** MediaFM yazısı (Netflix TechBlog, Şubat 2026) bu makineden okunamadı. Tasarım, ürün
  sahibinin modeli anlatışını (ses + görüntü + metinden çekim düzeyi vektörler; özet ve etiketler her çekime genel
  bağlam) ve çekim dizileri üzerinde maskeli modellemenin genel yayımlanmış fikrini izler; docs/ICERIK_ZEKASI.md §13.1
  esas alınmıştır. Makalenin doğrulanmış bir okuması **değildir**; ayrıntılarda MediaFM ile eşleşme iddiası yoktur.

## Mimari

```
çekim i ─► CLIP ViT-B/32 görüntü (3 kare ort.) 512 ─┐  kip başına eğitim ortalaması çıkarılır, birim uzunluk
        ─► CLAP HTSAT ses (≤10 sn, 48 kHz)     512 ─┼─► kip başına Doğrusal ─► birleştir ─► Doğrusal+LN ─► x_i
        ─► çok dilli CLIP metin (altyazı)      512 ─┘   (kip yok/gizli: öğrenilmiş gömme; gizli çekim: [MASK])
özet (çok dilli CLIP metin 512) ─► Doğrusal ─┐
etiket öznitelikleri ({mcfg['tag_dim']}) ─► MLP ───────┴─► [GLOBAL]
[CLS] [GLOBAL] x_1 … x_n + sinüs konum ─► dönüştürücü ({mcfg['layers']} katman, d={mcfg['d']}, {mcfg['heads']} baş, ff={mcfg['ff']},
                                          pre-LN, dropout {mcfg['dropout']})
   ├─► h_i ─► (eğitim çekimlerinin ortalaması çıkarılır, birim) ─► DIŞA AKTARILAN çekim vektörü ({mcfg['d']} boyut)
   ├─► tahmin_i,k = birim(Σ_j a_ij · görünür j'nin k kipi) + β · birim(Doğrusal_k(h_i))      (kopya başlığı)
   │      a_ij = softmax_j(q(h_i)·k(h_j)/√d − λ|i−j|), yalnız görünür ve k kipini taşıyan j'ler
   └─► [CLS] ─► bağlam eşleştirme başlığı (özet + etiketler bu diziye mi ait?)
yaprak vektörü = birim çekim vektörlerinin ortalaması · başlık vektörü = yaprak vektörlerinin ortalaması (sunucuda)
```

Kayıp: gizlenen çekimlerin var olan her kipi için 1 − cos(tahmin, ortalaması çıkarılmış özgün vektör) + gizlenen
tek kipler (ağırlık {tcfg['mod_weight']}) + bağlam eşleştirme ikili çapraz entropisi (ağırlık {tcfg['match_weight']};
yığındaki öğelerin %{int(tcfg['match_p'] * 100)}'inde özet + etiketler başka başlığınkiyle değiştirilir, bu öğeler
maskeli çekim kaybına girmez). Kopya başlığı ve bağlam eşleştirme bizim eklememizdir: kopya başlığı olmadan 128 boyutlu
darboğazdan geçen tahmin yeni filmlere genelleyemedi (ayrılmış başlıklarda komşu ortalamasının çok altında kaldı);
eşleştirme kaybı, salt maskeli çekim hedefinin bağlamı kullanmayı gerektirmemesi yüzünden denendi.

Eğitim penceresi {mcfg['max_len']} çekimdir; daha uzun yapraklar yarı örtüşen pencerelerle kodlanır (pencere ortası
ağırlıklı ortalama). Etiket öznitelikleri: 16 ölçek (değer/5 + "dolu mu"), niteleyiciler, yüz değerleri, türler, ruh
hâlleri (çoklu-sıcak), etiket dayanağı (CONSENSUS/SAMPLE/MODEL/NONE) ve tür (film/dizi). Bağlam sunucunun
gönderdiği **geçerli** etiketlerdir — bugün tüm başlıklarda bunlar özetten doldurulmuş ÖRNEK fişlerdir (izlenerek
değil, dayanak SAMPLE); eğitimde de aynı girdiler kullanılır (`ml/tools/dump-inputs.ts`).

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

**Bağlam eşleştirme** (ayrılmış her yaprağın çekimleri {cm['candidates']} başlığın özet + etiketleriyle ayrı ayrı
modele verilir; kendi bağlamının sırası — bağlamın kullanılıp kullanılmadığının doğrudan sınaması):

| yöntem | R@1 | R@5 | ortalama sıra |
|---|---:|---:|---:|
| mediafm-mini eşleştirme başlığı | {cm['model']['R@1']:.3f} | {cm['model']['R@5']:.3f} | {cm['model']['mean_rank']:.2f} |
| temel: eğitimsiz CLIP (film görüntü ortalaması · özet metni) | {cm['clip_baseline']['R@1']:.3f} | {cm['clip_baseline']['R@5']:.3f} | {cm['clip_baseline']['mean_rank']:.2f} |
| rastgele | {cm['model']['random_R@1']:.3f} | {cm['model']['random_R@5']:.3f} | {(cm['candidates'] + 1) / 2:.2f} |

| yaprak | kat | model sırası | CLIP temeli sırası |
|---|---:|---:|---:|
{cm_rows}

### Sonuçların dürüst okuması

- **Maskeli çekim bulmada model, "iki komşunun ortalaması" temeliyle berabere** (mikro R@1 {m_['R@1']:.3f} — temel
  {b_['R@1']:.3f}; R@5 {m_['R@5']:.3f} — {b_['R@5']:.3f}; ortalama sıra {m_['mean_rank']:.2f} — {b_['mean_rank']:.2f}).
  Başlık ortalamasında temel R@1'de biraz önde. "En yakın görünür komşu" temelini açıkça geçer. Yani model, ayrılmış
  filmlerde komşu çekimlerden yerel bir aradeğerleme öğrenmiştir; bunun ötesinde ölçülebilir bir kazanç yoktur.
- **Bağlam (`[GLOBAL]`) bu görevde ölçülebilir bir katkı yapmıyor:** bağlamı başka başlıkla değiştirmek ya da boşaltmak
  sonucu değiştirmiyor, `[GLOBAL]`'sız eğitilen model aynı düzeyde. Bu beklenebilir: adayların hepsi aynı filmdendir,
  ayırt etmek için başlık bağlamına gerek yoktur.
- **Bağlam eşleştirme başlığı ayrılmış başlıklara genelleyemedi** (rastgele düzeyinde); aynı ortak uzaydaki eğitimsiz
  CLIP temeli açıkça daha iyi. 10 civarı eğitim başlığıyla "özet ↔ görüntü dizisi" eşlemesi öğrenilemiyor.
- Sonuç olarak dışa aktarılan vektörlerde etiket değişikliğinin etkisi çok küçüktür (Sintel'de etiketler tamamen
  değiştirildiğinde havuz vektörünün kosinüsü 0,99999). Hat uçtan uca çalışır (etiket değişir → yaprak yeniden
  kodlanır → vektör değişir), ama bu ölçekte model bağlamı kullanmayı öğrenmemiştir.
- "Denetim" satırı (çekim gizlenmeden) bir üst sınır değildir: kopya başlığı görünür çekimin kendisine bakabilir;
  yalnız sızıntısız tasarımın tersini (gizlenince bulamaması) göstermek içindir.

## Sınırlar

- Veri çok küçük (≈ {sum(d['shots'] for d in train_rows)} çekim, {len({d['titleId'] for d in train_rows})} başlık,
  çoğu Blender animasyonu): görsel dağılım dar, canlı çekim tek film (Tears of Steel), sessiz film tek film.
- Metin kipi neredeyse yok (iki filmde altyazı); konuşma içeriği vektörlere az yansır.
- KEYFRAMES yapımları (katalogun çoğu) 1–4 küçük kareyle temsil edilir; benzerlikleri büyük ölçüde kare görünümü ve
  bağlamdan (özet + etiketler) gelir.
- `[GLOBAL]` bağlamı bu ölçekte kullanılmıyor (yukarıya bakın); KEYFRAMES ve yalnız metinli yapımlarda vektörler
  büyük ölçüde karelerden ve özet metninden (metin kipi) gelir.
- Agent 327 katalogda CC BY 4.0 yazıyor, Blender Studio ise filmi CC BY-ND olarak duyurmuş; Commons'ta da
  bulunamadı — eğitime alınmadı (yalnız KEYFRAMES ile çıkarım).
- Sessiz film (A Trip to the Moon) eski film titremesi yüzünden sahne eşiği 0,25 ile çözümlendi (varsayılan 0,12
  380 sahte kesim üretiyordu); Commons kopyasında ses yok.
- Etiketler örnek fişlerdir (özetten, izlenmeden doldurulmuş; dayanak SAMPLE) ve özetle büyük ölçüde aynı bilgiyi
  taşır; etiket bağlamının katkısı bu yüzden de sınırlıdır.
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
