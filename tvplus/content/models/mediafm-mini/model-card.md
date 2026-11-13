# mediafm-mini — model kartı

**Sürüm:** `mediafm-mini@2026-11-13-8d10628b` · **boyut:** 128 · **eğitilen parametre:** 989,826
· **üretim:** 2026-11-13T13:43:18Z

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
çekim i ─► CLIP ViT-B/32 görüntü (3 kare ort.) 512 ─► Doğrusal ─┐   kip yoksa/gizliyse: öğrenilmiş "kip yok"
        ─► CLAP HTSAT ses (≤10 sn, 48 kHz)     512 ─► Doğrusal ─┼─► birleştir ─► Doğrusal+LN ─► x_i  (gizliyse [MASK])
        ─► çok dilli CLIP metin (altyazı)      512 ─► Doğrusal ─┘
özet (çok dilli CLIP metin 512) ─► Doğrusal ─┐
etiket öznitelikleri (242) ─► MLP ───────┴─► [GLOBAL]
[CLS] [GLOBAL] x_1 … x_n  + sinüs konum ─► dönüştürücü (3 katman, d=128, 4 baş,
ff=256, pre-LN, dropout 0.2) ─► h_i (dışa aktarılan çekim vektörü, 128 boyut)
                                                    └─► kip başına başlık ─► gizlenen çekimin 3 kip vektörü (kosinüs)
yaprak vektörü = birim h_i'lerin ortalaması · başlık vektörü = yaprak vektörlerinin ortalaması (sunucuda)
```

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
| Big Buck Bunny | 80030001 | 122 | 122/122/0 | Blender Foundation | www.bigbuckbunny.org | CC BY 3.0 | [commons](https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm) |
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
8 dönem (CV'deki en iyi dönemlerin ortancası: [10, 123, 8, 2, 7]), 4 sn; kayıp
0.7364 → 0.7598.

## Değerlendirme (ayrılmış başlıklar, 5 katlı başlık çapraz doğrulaması)

Protokol: her sınama yaprağında 10 kez çekimlerin %20'si gizlenir; her gizli
çekimin tahmini, aynı maskede gizlenen çekimler arasında sıralanır (benzerlik = ortak kiplerin kosinüs ortalaması).
Hiçbir sayı eğitim başlıklarından değildir. Ortalama aday sayısı 21.5; rastgele
R@1 ≈ 0.064, R@5 ≈ 0.305; `norm_rank` = (sıra−1)/(aday−1),
rastgele ≈ 0,5.

**Tüm sorgular (mikro):**

| yöntem | R@1 | R@5 | mean_rank | norm_rank | MRR |
|---|---:|---:|---:|---:|---:|
| mediafm-mini (tam: özet + geçerli etiketler) | 0.325 | 0.768 | 4.26 | 0.174 | 0.512 |
| aynı model, bağlam başka başlıktan | 0.325 | 0.768 | 4.26 | 0.174 | 0.512 |
| aynı model, bağlam boş | 0.325 | 0.768 | 4.26 | 0.174 | 0.513 |
| [GLOBAL]'sız eğitilmiş ablasyon | 0.329 | 0.757 | 4.34 | 0.177 | 0.512 |
| temel: en yakın görünür komşu | 0.281 | 0.698 | 5.11 | 0.211 | 0.465 |
| temel: iki komşunun ortalaması | 0.326 | 0.753 | 4.34 | 0.176 | 0.511 |
| üst referans: çekim gizlenmeden | 0.967 | 0.997 | 1.07 | 0.005 | 0.980 |

**Başlık ortalaması (makro):**

| yöntem | R@1 | R@5 | mean_rank | norm_rank | MRR |
|---|---:|---:|---:|---:|---:|
| mediafm-mini (tam: özet + geçerli etiketler) | 0.339 | 0.818 | 3.76 | 0.203 | 0.537 |
| aynı model, bağlam başka başlıktan | 0.337 | 0.818 | 3.76 | 0.204 | 0.536 |
| aynı model, bağlam boş | 0.339 | 0.818 | 3.76 | 0.203 | 0.537 |
| [GLOBAL]'sız eğitilmiş ablasyon | 0.340 | 0.808 | 3.82 | 0.205 | 0.536 |
| temel: en yakın görünür komşu | 0.299 | 0.760 | 4.40 | 0.232 | 0.495 |
| temel: iki komşunun ortalaması | 0.344 | 0.805 | 3.81 | 0.202 | 0.538 |
| üst referans: çekim gizlenmeden | 0.961 | 0.997 | 1.08 | 0.012 | 0.976 |

**Başlık başına R@1:**

| başlık | kat | çekim | model | en yakın komşu | komşu ort. | [GLOBAL]'sız | bağlam karışık |
|---|---:|---:|---:|---:|---:|---:|---:|
| A Trip to the Moon | 4 | 51 | 0.640 | 0.600 | 0.610 | 0.600 | 0.640 |
| Big Buck Bunny | 2 | 122 | 0.212 | 0.158 | 0.204 | 0.229 | 0.212 |
| Caminandes | 3 | 72 | 0.450 | 0.421 | 0.464 | 0.450 | 0.450 |
| Charge | 1 | 77 | 0.393 | 0.333 | 0.393 | 0.420 | 0.400 |
| Coffee Run | 1 | 18 | 0.250 | 0.225 | 0.275 | 0.250 | 0.225 |
| Cosmos Laundromat: First Cycle | 0 | 97 | 0.263 | 0.226 | 0.263 | 0.226 | 0.263 |
| Elephants Dream | 4 | 121 | 0.371 | 0.287 | 0.371 | 0.350 | 0.371 |
| Glass Half | 0 | 23 | 0.340 | 0.320 | 0.360 | 0.340 | 0.340 |
| Sintel | 2 | 158 | 0.303 | 0.237 | 0.284 | 0.309 | 0.303 |
| Spring | 3 | 92 | 0.356 | 0.261 | 0.361 | 0.356 | 0.356 |
| Sprite Fright | 1 | 129 | 0.285 | 0.292 | 0.288 | 0.319 | 0.285 |
| Tears of Steel | 0 | 143 | 0.317 | 0.272 | 0.321 | 0.338 | 0.317 |
| Wing It! | 2 | 81 | 0.225 | 0.256 | 0.275 | 0.231 | 0.225 |

**Eğitim kayıtları (CV):**

| kat | değişken | sınama | doğrulama | en iyi dönem | koşulan dönem | doğrulama kaybı | sn |
|---|---|---|---|---:|---:|---:|---:|
| 0 | full | [80010002, 80030003, 80030004] | [80030008, 80030009] | 10 | 50 | 0.4034 | 50 |
| 0 | noglobal | [80010002, 80030003, 80030004] | [80030008, 80030009] | 5 | 45 | 0.4034 | 67 |
| 1 | full | [80030008, 80030009, 80030010] | [80010001, 80030001] | 123 | 163 | 0.4981 | 97 |
| 1 | noglobal | [80030008, 80030009, 80030010] | [80010001, 80030001] | 11 | 51 | 0.5032 | 20 |
| 2 | full | [80010001, 80030001, 80030011] | [80030007, 80031000] | 8 | 48 | 0.4450 | 17 |
| 2 | noglobal | [80010001, 80030001, 80030011] | [80030007, 80031000] | 8 | 48 | 0.4444 | 16 |
| 3 | full | [80030007, 80031000] | [80020001, 80030002] | 2 | 42 | 0.4281 | 20 |
| 3 | noglobal | [80030007, 80031000] | [80020001, 80030002] | 2 | 42 | 0.4280 | 16 |
| 4 | full | [80020001, 80030002] | [80010002, 80030003] | 7 | 47 | 0.4993 | 21 |
| 4 | noglobal | [80020001, 80030002] | [80010002, 80030003] | 87 | 127 | 0.4940 | 52 |

Yorum ve dürüst okuma için `ml/README.md` → "Sonuçlar"a bakın; kısa özet: tablolardaki sıralama neyse odur — bir temel
modelden iyi olmadığı satırlar da raporlanmıştır.

## Sınırlar

- Veri çok küçük (≈ 1184 çekim, 13 başlık,
  çoğu Blender animasyonu): görsel dağılım dar, canlı çekim tek film (Tears of Steel), sessiz film tek film.
- Metin kipi neredeyse yok (iki filmde altyazı); konuşma içeriği vektörlere az yansır.
- KEYFRAMES yapımları (katalogun çoğu) 1–4 küçük kareyle temsil edilir; benzerlikleri büyük ölçüde kare görünümü ve
  bağlamdan (özet + etiketler) gelir.
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
