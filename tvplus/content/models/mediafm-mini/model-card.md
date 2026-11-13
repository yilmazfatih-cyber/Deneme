# mediafm-mini — model kartı

**Sürüm:** `mediafm-mini@2026-11-13-3eaa7027` · **boyut:** 128 · **eğitilen parametre:** 989,955
· **üretim:** 2026-11-13T13:52:28Z

## Ne olduğu, ne olmadığı

mediafm-mini, Netflix'in MediaFM'inde anlatılan mimarinin (çekim düzeyinde üç kipli gömme + çekim dizisi üzerinde
maskeli çekim modellemesiyle eğitilen dönüştürücü + başlık düzeyi `[GLOBAL]` bağlam belirteci) **küçük, gerçekten
eğitilmiş bir örneğidir.** Eğitim verisi açık lisanslı 13 başlığın
15 yaprağındaki 1184 gerçek çekimdir; eğitim tek bir paylaşımlı CPU'da
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
etiket öznitelikleri (242) ─► MLP ───────┴─► [GLOBAL]
[CLS] [GLOBAL] x_1 … x_n + sinüs konum ─► dönüştürücü (3 katman, d=128, 4 baş, ff=256,
                                          pre-LN, dropout 0.2)
   ├─► h_i ─► (eğitim çekimlerinin ortalaması çıkarılır, birim) ─► DIŞA AKTARILAN çekim vektörü (128 boyut)
   ├─► tahmin_i,k = birim(Σ_j a_ij · görünür j'nin k kipi) + β · birim(Doğrusal_k(h_i))      (kopya başlığı)
   │      a_ij = softmax_j(q(h_i)·k(h_j)/√d − λ|i−j|), yalnız görünür ve k kipini taşıyan j'ler
   └─► [CLS] ─► bağlam eşleştirme başlığı (özet + etiketler bu diziye mi ait?)
yaprak vektörü = birim çekim vektörlerinin ortalaması · başlık vektörü = yaprak vektörlerinin ortalaması (sunucuda)
```

Kayıp: gizlenen çekimlerin var olan her kipi için 1 − cos(tahmin, ortalaması çıkarılmış özgün vektör) + gizlenen
tek kipler (ağırlık 0.5) + bağlam eşleştirme ikili çapraz entropisi (ağırlık 0.5;
yığındaki öğelerin %50'inde özet + etiketler başka başlığınkiyle değiştirilir, bu öğeler
maskeli çekim kaybına girmez). Kopya başlığı ve bağlam eşleştirme bizim eklememizdir: kopya başlığı olmadan 128 boyutlu
darboğazdan geçen tahmin yeni filmlere genelleyemedi (ayrılmış başlıklarda komşu ortalamasının çok altında kaldı);
eşleştirme kaybı, salt maskeli çekim hedefinin bağlamı kullanmayı gerektirmemesi yüzünden denendi.

Eğitim penceresi 64 çekimdir; daha uzun yapraklar yarı örtüşen pencerelerle kodlanır (pencere ortası
ağırlıklı ortalama). Etiket öznitelikleri: 16 ölçek (değer/5 + "dolu mu"), niteleyiciler, yüz değerleri, türler, ruh
hâlleri (çoklu-sıcak), etiket dayanağı (CONSENSUS/SAMPLE/MODEL/NONE) ve tür (film/dizi). Bağlam sunucunun
gönderdiği **geçerli** etiketlerdir — bugün tüm başlıklarda bunlar özetten doldurulmuş ÖRNEK fişlerdir (izlenerek
değil, dayanak SAMPLE); eğitimde de aynı girdiler kullanılır (`ml/tools/dump-inputs.ts`).

## Kip kodlayıcıları (dondurulmuş, ONNX Runtime, CPU)

| kip | model | ONNX dosyası | lisans |
|---|---|---|---|
| visual | [openai/clip-vit-base-patch32](https://huggingface.co/openai/clip-vit-base-patch32) | Xenova/clip-vit-base-patch32 · onnx/vision_model.onnx | MIT (OpenAI CLIP) |
| text | [sentence-transformers/clip-ViT-B-32-multilingual-v1](https://huggingface.co/sentence-transformers/clip-ViT-B-32-multilingual-v1) | sentence-transformers/clip-ViT-B-32-multilingual-v1 · onnx/model.onnx + 2_Dense | Apache-2.0 |
| audio | [laion/clap-htsat-unfused](https://huggingface.co/laion/clap-htsat-unfused) | Xenova/clap-htsat-unfused · onnx/audio_model.onnx | Apache-2.0 |

Ön işleme Hugging Face yapılandırmalarından okunmuştur (CLIP: kısa kenar 224 bikübik + ortadan kırpma + CLIP
ortalama/sapma; metin: en çok 128 belirteç, ortalama havuzlama + 768→512 Dense; CLAP: 48 kHz, 1024 FFT, 480 adım,
64 Slaney mel 50–14000 Hz, dB, 10 sn "repeatpad"; özgündeki rastgele kesme yerine belirlenimci ortadan kesme). Toplam
indirme ≈ 1,0 GB. Metin kodlayıcısı CLIP görüntü uzayına hizalı olduğu için model sunucusundaki metinle çekim arama
(demo) mümkündür.

## Eğitim verisi

Yalnız açık lisanslı (CC BY / kamu malı) **gerçek çekimler** eğitime girer; başlığa göre bölünür.

| başlık | videoId | çekim | görüntü/ses/metin kipi olan çekim | yapımcı | lisans | kaynak |
|---|---:|---:|---|---|---|---|
| Sintel | 80010001 | 158 | 158/158/22 | Blender Foundation (Durian Open Movie Project), yön. Colin Levy | CC BY 3.0 | [dash](https://durian.blender.org/) |
| Tears of Steel | 80010002 | 143 | 143/143/50 | Blender Foundation (Mango Open Movie Project), yön. Ian Hubert | CC BY 3.0 | [dash](https://mango.blender.org/) |
| A Trip to the Moon | 80020001 | 51 | 51/0/0 | Georges Méliès (1902) | Kamu malı | [commons](https://commons.wikimedia.org/wiki/File:Le_Voyage_dans_la_Lune_%281902%29.webm) |
| Big Buck Bunny | 80030001 | 122 | 122/122/0 | Blender Foundation \| www.bigbuckbunny.org | CC BY 3.0 | [commons](https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm) |
| Elephants Dream | 80030002 | 121 | 121/121/0 | Blender Foundation / Netherlands Media Art Institute | CC BY 2.5 | [commons](https://commons.wikimedia.org/wiki/File:Elephants_Dream_%282006%29.webm) |
| Cosmos Laundromat: First Cycle | 80030003 | 97 | 97/97/0 | Blender Foundation (Gooseberry Open Movie Project) | CC BY 3.0 | [commons](https://commons.wikimedia.org/wiki/File:Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm) |
| Glass Half | 80030004 | 23 | 23/23/0 | Blender Studio | CC BY 4.0 | [commons](https://commons.wikimedia.org/wiki/File:Glass_Half_-_Blender_Open_Movie-full_movie.webm) |
| Spring | 80030007 | 92 | 92/92/0 | Blender Studio | CC BY 4.0 | [commons](https://commons.wikimedia.org/wiki/File:Spring_-_Blender_Open_Movie.webm) |
| Coffee Run | 80030008 | 18 | 18/18/0 | Blender Studio | CC BY 4.0 | [commons](https://commons.wikimedia.org/wiki/File:Coffee_Run_-_Blender_Open_Movie-full_movie.webm) |
| Sprite Fright | 80030009 | 129 | 129/129/0 | Blender Studio | CC BY 4.0 | [commons](https://commons.wikimedia.org/wiki/File:Sprite_Fright_-_Blender_Open_Movie-full_movie.webm) |
| Charge | 80030010 | 77 | 77/77/0 | Blender Studio | CC BY 4.0 | [commons](https://commons.wikimedia.org/wiki/File:Charge_-_Blender_Open_Movie-full_movie.webm) |
| Wing It! | 80030011 | 81 | 81/81/0 | Blender Studio | CC BY 4.0 | [commons](https://commons.wikimedia.org/wiki/File:WING_IT%21_-_Blender_Open_Movie-full_movie.webm) |
| Caminandes | 80031101 | 16 | 16/16/0 | Blender Foundation, yön. Pablo Vazquez | CC BY | [commons](https://commons.wikimedia.org/wiki/File:Caminandes-_Llama_Drama_-_Short_Movie.ogv) |
| Caminandes | 80031102 | 24 | 24/24/0 | Blender Foundation, yön. Pablo Vazquez | CC BY | [commons](https://commons.wikimedia.org/wiki/File:Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm) |
| Caminandes | 80031103 | 32 | 32/32/0 | Blender Institute, yön. Pablo Vazquez | CC BY | [commons](https://commons.wikimedia.org/wiki/File:Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm) |

Medya: Sintel ve Tears of Steel katalogdaki DASH manifestosunun barındırıcısından (480p'lik akış — 2,35:1 olduğu için
yüksekliği ≤ 364 piksel), diğerleri Wikimedia Commons'ın 360p VP9 dönüştürmesinden. Çekim sınırları uygulamanın kendi
çözümlemesidir (`npm run analyze:shots -- <id> --media …`). Metin kipi yalnız Türkçe altyazısı olan iki filmde var;
öteki filmlerde altyazı alınamadı (metin kipi "yok" olarak işaretli).

Dışa aktarma bütün kataloğu kapsar: 16 SCENE_DETECT yaprağı (1188 çekim) ve
113 KEYFRAMES yaprağı (431 sözde çekim: hazır küçük kareler + bölüm özeti, ses yok).
**KEYFRAMES vektörleri daha zayıftır:** model gerçek çekim dizileriyle eğitildi, 1–4 karelik sözde diziler eğitimde hiç
görülmedi; bu yapımların çoğu YouTube standart lisanslıdır ve **eğitimde kullanılmadı**, yalnız çıkarımdan geçti.

## Hiperparametreler

AdamW (lr 0.001, ağırlık çürümesi 0.05), 10 dönem ısınma + kosinüs, yığın
8, dönem başına her 64'lik dilim için 2.0 rastgele pencere,
çekim maskesi %20, gizlenmemiş çekimlerde tek kip gizleme olasılığı 0.15
(kayıp ağırlığı 0.5), gradyan kırpma 1.0, tohum 7. Çapraz doğrulamada erken durdurma:
ayrılmış doğrulama başlıklarında maskeli çekim kaybı, sabır 40. Son model: tüm açık filmler,
43 dönem (CV'deki en iyi dönemlerin ortancası: [13, 43, 114, 2, 154]), 24 sn; kayıp
1.0992 → 1.0481.

## Değerlendirme (ayrılmış başlıklar, 5 katlı başlık çapraz doğrulaması)

Protokol: her sınama yaprağında 10 kez çekimlerin %20'si gizlenir; her gizli
çekimin tahmini, aynı maskede gizlenen çekimler arasında sıralanır (benzerlik = ortak kiplerin kosinüs ortalaması).
Hiçbir sayı eğitim başlıklarından değildir. Ortalama aday sayısı 21.5; rastgele
R@1 ≈ 0.064, R@5 ≈ 0.305; `norm_rank` = (sıra−1)/(aday−1),
rastgele ≈ 0,5.

**Tüm sorgular (mikro):**

| yöntem | R@1 | R@5 | mean_rank | norm_rank | MRR |
|---|---:|---:|---:|---:|---:|
| mediafm-mini (tam: özet + geçerli etiketler) | 0.325 | 0.758 | 4.33 | 0.177 | 0.511 |
| aynı model, bağlam başka başlıktan | 0.325 | 0.758 | 4.33 | 0.177 | 0.511 |
| aynı model, bağlam boş | 0.325 | 0.758 | 4.33 | 0.177 | 0.511 |
| [GLOBAL]'sız eğitilmiş ablasyon | 0.327 | 0.764 | 4.28 | 0.175 | 0.514 |
| temel: en yakın görünür komşu | 0.281 | 0.698 | 5.11 | 0.211 | 0.465 |
| temel: iki komşunun ortalaması | 0.326 | 0.753 | 4.34 | 0.176 | 0.511 |
| denetim: çekim gizlenmeden (kopya başlığı çekimin kendisini görür) | 0.952 | 0.997 | 1.07 | 0.004 | 0.974 |

**Başlık ortalaması (makro):**

| yöntem | R@1 | R@5 | mean_rank | norm_rank | MRR |
|---|---:|---:|---:|---:|---:|
| mediafm-mini (tam: özet + geçerli etiketler) | 0.336 | 0.808 | 3.81 | 0.206 | 0.534 |
| aynı model, bağlam başka başlıktan | 0.336 | 0.808 | 3.82 | 0.206 | 0.534 |
| aynı model, bağlam boş | 0.336 | 0.808 | 3.81 | 0.206 | 0.534 |
| [GLOBAL]'sız eğitilmiş ablasyon | 0.339 | 0.814 | 3.78 | 0.205 | 0.536 |
| temel: en yakın görünür komşu | 0.299 | 0.760 | 4.40 | 0.232 | 0.495 |
| temel: iki komşunun ortalaması | 0.344 | 0.805 | 3.81 | 0.202 | 0.538 |
| denetim: çekim gizlenmeden (kopya başlığı çekimin kendisini görür) | 0.956 | 0.997 | 1.07 | 0.004 | 0.976 |

**Başlık başına R@1:**

| başlık | kat | çekim | model | en yakın komşu | komşu ort. | [GLOBAL]'sız | bağlam karışık |
|---|---:|---:|---:|---:|---:|---:|---:|
| A Trip to the Moon | 4 | 51 | 0.610 | 0.600 | 0.610 | 0.630 | 0.610 |
| Big Buck Bunny | 2 | 122 | 0.221 | 0.158 | 0.204 | 0.217 | 0.221 |
| Caminandes | 3 | 72 | 0.450 | 0.421 | 0.464 | 0.457 | 0.450 |
| Charge | 1 | 77 | 0.440 | 0.333 | 0.393 | 0.427 | 0.440 |
| Coffee Run | 1 | 18 | 0.225 | 0.225 | 0.275 | 0.200 | 0.225 |
| Cosmos Laundromat: First Cycle | 0 | 97 | 0.247 | 0.226 | 0.263 | 0.263 | 0.247 |
| Elephants Dream | 4 | 121 | 0.383 | 0.287 | 0.371 | 0.375 | 0.383 |
| Glass Half | 0 | 23 | 0.320 | 0.320 | 0.360 | 0.340 | 0.320 |
| Sintel | 2 | 158 | 0.306 | 0.237 | 0.284 | 0.291 | 0.306 |
| Spring | 3 | 92 | 0.344 | 0.261 | 0.361 | 0.356 | 0.344 |
| Sprite Fright | 1 | 129 | 0.288 | 0.292 | 0.288 | 0.300 | 0.288 |
| Tears of Steel | 0 | 143 | 0.307 | 0.272 | 0.321 | 0.314 | 0.307 |
| Wing It! | 2 | 81 | 0.225 | 0.256 | 0.275 | 0.237 | 0.225 |

**Eğitim kayıtları (CV):**

| kat | değişken | sınama | doğrulama | en iyi dönem | koşulan dönem | doğrulama kaybı | sn |
|---|---|---|---|---:|---:|---:|---:|
| 0 | full | [80010002, 80030003, 80030004] | [80030008, 80030009] | 13 | 53 | 0.4010 | 19 |
| 0 | noglobal | [80010002, 80030003, 80030004] | [80030008, 80030009] | 7 | 47 | 0.4028 | 16 |
| 1 | full | [80030008, 80030009, 80030010] | [80010001, 80030001] | 43 | 83 | 0.5015 | 28 |
| 1 | noglobal | [80030008, 80030009, 80030010] | [80010001, 80030001] | 79 | 119 | 0.4997 | 42 |
| 2 | full | [80010001, 80030001, 80030011] | [80030007, 80031000] | 114 | 154 | 0.4401 | 50 |
| 2 | noglobal | [80010001, 80030001, 80030011] | [80030007, 80031000] | 8 | 48 | 0.4448 | 14 |
| 3 | full | [80030007, 80031000] | [80020001, 80030002] | 2 | 42 | 0.4276 | 16 |
| 3 | noglobal | [80030007, 80031000] | [80020001, 80030002] | 1 | 41 | 0.4279 | 15 |
| 4 | full | [80020001, 80030002] | [80010002, 80030003] | 154 | 194 | 0.4887 | 70 |
| 4 | noglobal | [80020001, 80030002] | [80010002, 80030003] | 22 | 62 | 0.4999 | 23 |

**Bağlam eşleştirme** (ayrılmış her yaprağın çekimleri 13 başlığın özet + etiketleriyle ayrı ayrı
modele verilir; kendi bağlamının sırası — bağlamın kullanılıp kullanılmadığının doğrudan sınaması):

| yöntem | R@1 | R@5 | ortalama sıra |
|---|---:|---:|---:|
| mediafm-mini eşleştirme başlığı | 0.000 | 0.267 | 6.87 |
| temel: eğitimsiz CLIP (film görüntü ortalaması · özet metni) | 0.400 | 0.867 | 3.20 |
| rastgele | 0.077 | 0.385 | 7.00 |

| yaprak | kat | model sırası | CLIP temeli sırası |
|---|---:|---:|---:|
| Tears of Steel | 0 | 9 | 2 |
| Cosmos Laundromat: First Cycle | 0 | 6 | 5 |
| Glass Half | 0 | 4 | 4 |
| Coffee Run | 1 | 8 | 7 |
| Sprite Fright | 1 | 6 | 12 |
| Charge | 1 | 11 | 1 |
| Sintel | 2 | 6 | 2 |
| Big Buck Bunny | 2 | 7 | 1 |
| Wing It! | 2 | 8 | 1 |
| Spring | 3 | 10 | 4 |
| Caminandes | 3 | 3 | 1 |
| Caminandes | 3 | 3 | 1 |
| Caminandes | 3 | 3 | 1 |
| A Trip to the Moon | 4 | 9 | 3 |
| Elephants Dream | 4 | 10 | 3 |

### Sonuçların dürüst okuması

- **Maskeli çekim bulmada model, "iki komşunun ortalaması" temeliyle berabere** (mikro R@1 0.325 — temel
  0.326; R@5 0.758 — 0.753; ortalama sıra 4.33 — 4.34).
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

- Veri çok küçük (≈ 1184 çekim, 13 başlık,
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
