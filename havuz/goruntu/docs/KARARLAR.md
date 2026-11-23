# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi. Yeni karar en alta eklenir. Ölçümler
`docs/DENEME_KAYDI.md`'dedir.

## K01 — Paket ve bağımlılıklar
Çekirdek: numpy (≥2.0, `np.bitwise_count`), pillow, pydantic, pyyaml. Ekstralar: `egitim` (torch,
torchvision, timm), `gomme` (torch, torchvision, transformers), `onnx` (onnx, onnxruntime, onnxscript),
`cikarim` (yalnız onnxruntime: torch'suz uygulama), `sunucu` (fastapi, uvicorn, python-multipart), `dev`.
Sürümler `requirements.lock` (`uv pip compile --universal --python-version 3.11`).

## K02 — pyyaml çekirdekte (şartnameden küçük sapma)
Şartname çekirdeği numpy + pillow + pydantic sayıyordu; model kataloğu YAML olduğu (`katalog/modeller.yaml`,
şartnamede istenen biçim) ve `modeller` komutu onu okuduğu için pyyaml çekirdeğe eklendi (küçük, yaygın).

## K03 — Güvenli açma: kendi sınırımız + biçim beyaz listesi
`Image.MAX_IMAGE_PIXELS` süreç geneli ve kabadır (89 MP uyarı, 179 MP hata). Biz dosya boyutunu okumadan,
başlıktaki piksel sayısını ÇÖZMEDEN önce denetleriz (varsayılan 50 MP / 30 MB). `Image.open(formats=…)`
yalnız izinli eklentileri dener (JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF): EPS gibi dış program çalıştıran
biçimler hiç denenmez. MPO (çok kareli JPEG) JPEG eklentisiyle açılır ("MPO" listeye yazılamaz, Pillow'da
OPEN kaydı yok — ölçüldü). 16 bitlik görüntü ölçeklenir (`convert("RGB")` bembeyaz yapıyordu, testli).
Saydamlık beyaz zemine bindirilir. Dönen görüntünün `info`'su boştur (üst veri kazara yazılamaz).
Elenen: ICC profilinden sRGB'ye dönüştürme (sınanacak gerçek P3/AdobeRGB profili yok; Sınırlar).

## K04 — Kopya: pHash + 5 merkez-kırpma varyantı, eşik 8
Tek pHash boyutlandırma ve JPEG'e çok dayanıklı (≤2 bit) ama %5 kırpmada 20 bite çıkıyor (ölçüm). Her
görüntünün 1,0/0,95/0,9/0,85/0,8 merkez kırpmaları özetlenir; uzaklık "birinin tamamı ↔ ötekinin herhangi
bir kırpması"nın en küçüğüdür (2k−1 karşılaştırma). Kopyalar ≤2 bit, farklı sahneler ≥12 bit → eşik 8.
Bit sırası `imagehash` ile aynı (16'lık gösterim uyumlu, testli). DCT ölçeksiz DCT-II matrisiyle (scipy yok).
Gruplar union-find ile (zincir). Arama n²: 20 bin görüntü ~14 sn. Elenen: çok-indeksli özet (karmaşık,
bu ölçekte gereksiz), anahtar nokta (ORB) eşleme (bağımlılık + yavaş), `imagehash` bağımlılığı (scipy ister;
yalnız testte başvuru olarak kullanılır).

## K05 — Üst veri temizliği: yeniden kodlama
Parça parça silmek (EXIF, XMP, IPTC, COM, PNG metni…) her biçimde ayrı ayrıştırıcı ister ve bilinmeyen
parçayı kaçırır; EXIF içindeki küçük resim (kırpılmamış hâl) ve çok dilli dosya hileleri gibi tuzaklar var.
Pikseller yeni, `info`'su boş bir görüntüye alınır ve yalnız açıkça verilen ayarlarla kodlanır. Pillow'un
kaydederken `im.info`'dan sessizce aldığı alanlar (JPEG `comment`, PNG `icc_profile`/`transparency`)
böylece taşınamaz (kaynak okundu). JPEG'de kaynağın nicemleme tabloları ve alt örneklemesi yeniden
kullanılır (kalite kaybı küçük). ICC varsayılan olarak korunur (renk doğruluğu; kişisel veri değil),
`--icc-sil` ile atılır. Raporda değer değil yalnız var/yok yazılır. Test: işaretli dosyaların temizlenmiş
baytlarında işaret dizgisi aranır. Elenen: kayıpsız JPEG segment silme (yön etiketi varsa pikseller
döndürülemez; jpegtran gerektirir).

## K06 — Model girdisi: uint8 NHWC, normalleştirme modelin içinde
"Eğitimde iyi, uygulamada kötü"nün en sık nedeni ön işleme farkıdır. `hazirlik/model_input.prepare`
timm değerlendirme dönüşümünü (kısa kenar `floor(boyut/crop_pct)`, torchvision yuvarlaması, ortadan kırpma,
Pillow filtresi) birebir yapar (testte timm'le < 1e-5). ÷255, −ortalama, ÷sapma `ImageClassifier`
sarmalayıcısının ve ONNX grafiğinin içindedir: uygulama yalnız uint8 piksel verir.

## K07 — ONNX: dynamo aktarıcı, tek dosya, üst veri içeride
`torch.onnx.export(dynamo=True)` (ince-ayar K06 ile aynı yol). torch 2.15'te varsayılan ağırlıkları ayrı
`.onnx.data` dosyasına yazıyor (ölçüldü) → `external_data=False`. Etiketler, ön işleme, sıcaklık ve eşik
`metadata_props["goruntu.paket"]` içinde JSON: uygulamaya yalnız `model.onnx` kopyalanır; tarayıcı gibi
üst veri okuyamayanlar için yanına `paket.json`. Çıkışlar: `logit` ve kalibre `olasilik`. Yığın 1 testli.

## K08 — int8: yalnız MatMul/Gemm; kazanç yoksa yazılmaz
Bütün işlemleri dinamik nicemlemek MobileNetV3'te karar uyumunu %40–63'e düşürdü (kanal başına da);
yalnız MatMul/Gemm %100 uyum ama CNN'de küçülme yok. ViT-Tiny'de MatMul nicemleme %73 küçültüp uyumu
korudu. Kural: %20'den az küçülmede int8 dosyası yazılmaz; uyum %98'in altındaysa `int8_onerilmez`.
Elenen: statik (ölçüm verili) nicemleme — doğru yöntem ama ayrı bir iş; Sınırlar'da.

## K09 — Kalibrasyon ve "emin değilim"
Sıcaklık ölçekleme: NLL, β = 1/T'ye göre dışbükey → altın oran araması (scipy yok; ızgarayla testli).
Doğrulama 50 örnekten azsa T öğrenilmez (20 örnekte testte ECE'yi bozdu, ölçüldü). Eşik: `hedef_dogruluk`
verilirse doğrulamada o doğruluğu sağlayan en düşük güven (ince-ayar'dan); `sabit_esik` doğrudan.

## K10 — Kuru çalıştırma kestirimi
Model "meta" aygıtında kurulur (ağırlık yok, indirme yok): kesin parametre, `FlopCounterMode` ile FLOP,
katman çıktıları toplamı. Bellek formülü CPU'da 3 modelle ölçülen tepeyle %60–105 tuttu. Süre bu makinede
2 adım ölçülerek uzatılır (paylaşımlı makinede şişebilir); hedef GPU için FLOP ÷ `hedef_tflops` kaba
kestirimi (T4 için 8 TFLOPS varsayımı, ölçülmedi).

## K11 — Sınıflandırma: timm + kendi eğitim döngüsü
timm: tek API ile yüzlerce önceden eğitilmiş model, Hugging Face'ten indirme, modelin kendi ön işleme
ayarı (`pretrained_cfg`), `get_classifier()` ile baş. Döngü elle yazıldı (~120 satır): baş kipinde
BatchNorm istatistiklerini dondurmak, ayrımlı öğrenme oranı, baş ısınması, erken durdurma açıkça görünür.
Elenen: HF Trainer (görüntüde ek katman, BN dondurma gizli), Lightning (ağır bağımlılık).
Ağırlıklar safetensors (pickle yok).

## K12 — Lisans: ağırlık lisansı ≠ veri lisansı
Katalogdaki lisanslar HF API'sinden doğrulandı (11/11). timm ağırlıkları apache-2.0 etiketli ama
ImageNet ile eğitildi; ImageNet koşulları araştırma amaçlıdır. Bu bir hukuki görüş değildir; ticari
üründe değerlendirilmelidir (katalog başlığında ve README'de yazılı).

## K13 — Gömme: transformers (open_clip değil), varsayılan SigLIP 2
Tek API (`AutoModel` + `AutoProcessor`, `get_image_features`/`get_text_features`) CLIP, SigLIP ve
SigLIP 2'yi kapsar; çok dilli SigLIP 2 transformers'tadır; open_clip'in çok dilli modelleri de zaten
transformers ister. transformers 5 tuzakları kaynaktan okundu: `get_*_features` nesne döndürür
(`pooler_output`), `dtype=` (eski `torch_dtype` değil), SigLIP metni `padding="max_length"` (64).
Varsayılan `siglip2` (google/siglip2-base-patch32-256): Türkçe sorguda ölçülen tek çalışan seçenek;
patch32 CPU'da patch16'dan ~4 kat az belirteç. Elenen: openai/clip-vit-base-patch32 (HF'de lisans
etiketi yok, safetensors yok), sentence-transformers çok dilli CLIP (iki model + ek bağımlılık).

## K14 — Arama dizini: numpy kaba kuvvet
`havuz/yz` vektör deposundan uyarlandı. Kimlik = dosyanın SHA-256'sı (aynı dosya iki kez eklenmez,
taşınsa da tanınır). `vektorler.npy` + `dizin.json`, atomik yazma. ~100 bin görüntüye kadar yeterli.
Elenen: FAISS/hnswlib (bağımlılık; bu ölçekte gereksiz).

## K15 — Sunucu: FastAPI + yz istek kapısı
`havuz/yz/yz/sunucu/kapi.py` kopyalandı: gövde boyu okunmadan, yerel kipte Host/Origin, isteğe bağlı API
anahtarı (sabit zamanlı karşılaştırma). Uçlar eşzamanlı `def` (model çalışırken olay döngüsü bloklanmaz).
Yükleme çok parçalı form (`dosya` alanı). Varsayılan 127.0.0.1:8465: şartnamede verilen kapı;
STANDARTLAR §12'de `sifirdan`'ın 8450–8469 aralığına düşüyor (o temelde bu kapıyı kullanan kod yok).
Tablo havuz liderince güncellenmeli; çakışırsa `sun --kapi`.

## K16 — Ayrım: ince-ayar'ın grup atama algoritması
Kopya grupları + `grup_deseni` anahtarı union-find ile birleşir, gruplar katmanlı olarak parçalara
dağıtılır (büyük gruplar önce). Hazır ayrım klasörleri (egitim/dogrulama/test) değiştirilmez; aralarındaki
yakın kopyalar yalnız UYARI olarak raporlanır (kullanıcının bilinçli ayrımı bozulmasın).

## K17 — Modelsiz "histogram" gömmesi
Testler ve ağsız deneme için: doygunluk-farkında HSV histogramı + kenar yönü histogramı. Beyaz zemin
rengi bastırmasın diye gri pikseller ayrı kutularda (ilk sürümde renk recall@1 0,44 → 0,97, ölçüldü).
Şekli ayırt etmez; metinle arama yapamaz (açık hata).

## K18 — Komut satırı: argparse + Türkçeleştirme, düz komutlar
ince-ayar'ın `TurkishParser`'ı uyarlandı. Komutlar tek düzey (`python -m goruntu <komut>`); kayıt
`commands.py`. Ağır kütüphaneler komutun içinde içe aktarılır (yardım torch yüklemeden açılır, testli).

## K19 — Hazır ayarlar: cpu-deneme, cpu-kucuk, colab-t4
Şartname `cpu-deneme` ve `colab-t4` istiyordu; gerçek CPU işi için `cpu-kucuk` eklendi (MobileNetV3,
yalnız baş, dakikalar). `cpu-deneme` ağsızdır: "minik-rastgele" = timm `test_resnet` rastgele ağırlıkla
(öğrenmez, hattın çalıştığını gösterir). `colab-t4`: efficientnet_b0, 2 dönem baş ısınması + tam ince
ayar, fp16 — GPU'da denenmedi.

## K20 — Nesne bölgesi kırpma yapılmadı
"İyi olur" maddesi. Merkez kırpma zaten var; sınır kutusu sezgisi (ör. beyaz zeminden ürünü kırpma)
güvenilir yapılamadan eklenmedi; README Sınırlar'da.
