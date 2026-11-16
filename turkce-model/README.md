# Sıfırdan Türkçe dil modeli

Hazır hiçbir model ya da ağırlık kullanmadan, bilgisayarında Türkçe bir dil modeli eğitmek için uçtan uca bir boru hattı:

1. **Türkçeye göre token'lar.** TDK kökleri ve Türkçe ek biçimleriyle bir tokenizer. Kimlikler (ID) Türkçe
   kategorilere göre bloklar hâlinde dizilir.
2. **Önce TDK.** Güncel Türkçe Sözlük'ün tüm maddeleriyle ön eğitim (aşama 1).
3. **Sonra MEB soruları.** MEB'in yayımladığı çoktan seçmeli sorularla ince ayar ve ölçüm (aşama 2).
4. **Gömme kararları senin.** `ayarlar.toml`'daki `[gomme]` bölümünün on alanı da `KARAR_VER` olarak bırakıldı;
   doldurmadan eğitim başlamaz. Seçenekler ve ödünleşimler [GOMME_KARARLARI.md](GOMME_KARARLARI.md) dosyasında.
5. **Nereye kadar gittiğini görmek için** her değerlendirme `ciktilar/ilerleme.md` tablosuna bir satır yazar: BPC,
   doğruluk ve her ölçümün kendi rastgele tahmin tabanı.
6. **İsteğe bağlı DeepSeek modülleri.** Taranmış kitapçıkları OCR ile okur, hazır küçük bir modeli aynı sorularda
   ölçer. Varsayılan olarak kapalıdır; yalnız bilgisayarındaki ya da yerel ağındaki bir model sunucusuyla konuşur
   (aşağıda).

```
TDK kelime listesi ──► TDK maddeleri ──► derlem + kök sözlüğü ──► tokenizer (kök + ek, Türkçe ID blokları)
                                                                      │
MEB kitapçıkları (PDF, elle indirilir) ──► sorular ───────────────────┤
                                                                      ▼
                                 veri-hazirla ──► aşama 1: TDK ──► aşama 2: MEB ──► değerlendirme ──► ilerleme.md
```

## Dürüst beklenti

- **Veri küçük.** Tüm TDK ≈ 81 bin madde ≈ 10,3 milyon karakter ≈ **3 milyon token**. Bir Açık Öğretim Lisesi (AÖL)
  soru kitapçığı birkaç yüz soru ekler. Kıyas için: bugünkü büyük modeller trilyonlarca token görüyor.
- **Ne öğrenir?** Türkçe yazım, ünlü uyumu, ek dizilimi ve sözlük tanımı üslubu. `tanimla` komutu modele bir kelime
  verip "TDK gibi" tanımlatır; ilerlemeyi en iyi burada görürsün.
- **Ne öğrenemez?** Sözlükte ve birkaç bin soruda olmayan dünya bilgisini. MEB sorularında doğruluk muhtemelen rastgele
  tahmine (%20–25) yakın başlar. Ölçüm araçları tam da bunu, yani tabanı ne kadar geçtiğini görmek için var.
- **Daha ileri gitmek için** en büyük kaldıraç daha fazla Türkçe metindir: `veri/ek_metin/` klasörüne koyduğun her
  `.txt` dosyası aşama 1'e eklenir (aşağıda).

## Kurulum

Python 3.10 veya üstü gerekir.

```bash
cd turkce-model
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
```

PyTorch'u kendi donanımına göre önce kur:

- **NVIDIA ekran kartı:** [pytorch.org](https://pytorch.org/get-started/locally/) sayfasındaki CUDA komutu. Windows'ta
  PyPI'deki PyTorch yalnızca CPU sürümüdür.
- **Ekran kartı olmayan Linux:** yalnız CPU sürümü. PyPI'deki sürüm birkaç GB'lık CUDA paketlerini de indirir.

  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/cpu
  ```

- **Apple Silicon (M1–M4):** PyPI'deki sürüm MPS ile kendiliğinden çalışır.

```bash
pip install -e ".[pdf,dev]"
python -m pytest -q                # her şey yerinde mi?
```

**Windows'ta** çıktıyı dosyaya ya da boruya yönlendireceksen (`> log.txt`) önce `set PYTHONUTF8=1` yaz
(PowerShell: `$env:PYTHONUTF8=1`). Yoksa `▁` ve `→` gibi işaretler `\u2581`, `\u2192` gibi kaçış dizileri olarak
yazılır.

**Örnek hızlar ve bellek.** 4 çekirdekli bir bulut CPU'sunda; sözlük 32 000, bağlam 512, yığın 8 ile ölçüldü:

| boyut / katman | hız            | en yüksek bellek | tüm TDK'de bir dönem (≈ 3 milyon token) |
| -------------- | -------------- | ---------------- | --------------------------------------- |
| 128 / 4        | ~3 200 token/sn | ~3,5 GB          | ≈ 16 dk                                 |
| 256 / 6        | ~1 500 token/sn | ~4,6 GB          | ≈ 34 dk                                 |
| 384 / 6        | ~950 token/sn   | ~5,5 GB          | ≈ 53 dk                                 |

Varsayılan 10 dönemdir, yani bunun 10 katı; erken durdurma daha önce kesebilir. Bir ekran kartı bunu onlarca kat
hızlandırır. Belleğin çoğunu çıkış logit'leri tutar (yığın × bağlam × sözlük). Bu yüzden varsayılan yığın 8, birikim 4'tür:
her adım yine 32 dizi görür. Bellek yetmezse `egitim.tdk.yigin`'i küçült ve `birikim`'i aynı oranda büyüt. Adım
başına dizi sayısı da, eğitim sırasındaki doğrulama kümesi de aynı kalır; aşama 1 aynı pencerelerden öğrenir. Sonuç
yalnız dropout maskeleri ve yuvarlama kadar değişir. Ekran kartında tersini yap.

Aşama 2'nin varsayılanı yığın 8, birikim 2'dir (adım başına 16 dizi). Yığınlarının bir kısmı tam bağlamlık TDK
pencereleridir; bellek aşama 1'deki gibi `egitim.meb.yigin` ile ölçeklenir. Tam değerlendirme (eğitimin sonunda ve
`degerlendir` ile) `egitim.tdk.yigin` kadar, en fazla 16 pencerelik yığınlarla yapılır; eğitime sığan değerlendirmeye
de sığar. Kendi ayarlarınla tahmin ve ölçüm için: `python -m turkce_model hesapla --olc` (gömme kararları dolduktan
sonra).

## Adım adım

Her an nerede olduğunu ve sıradaki komutu görmek için:

```bash
python -m turkce_model durum
```

`durum` her adımın çıktısını girdileriyle karşılaştırır. Eskiyen adımı `[~]` ile işaretler ve yeniden çalıştırılacak
komutu söyler:

- **Dosya zamanları.** Ham veri adımları, tokenizer ve hazır veri, girdilerinden biri sonradan değişince `[~]` olur.
  Örneğin tam indirmeden sonra derlem eski kalır. `veri/ek_metin` de tokenizer'ın ve hazır verinin girdisidir.
- **İçerik.** Hazır veri başka bir tokenizer'la ya da eski biçimle hazırlanmışsa `[~]` olur. Modeller kaydettikleri
  tokenizer ve eğitim verisi imzalarıyla karşılaştırılır; MEB modeli, başladığı TDK modeli değişince de `[~]` olur.
  Aynı girdilerle yeniden üretilen tokenizer ya da hazır veri modelleri eskitmez. İmzası olmayan eski koşularda
  tokenizer dosyasının zamanına bakılır.
- **Zincir.** Bir adım yenilenecekse ona bağlı adımlar "önceki adım yenilenecek" notunu alır. "Sıradaki adım" zincirin
  ilk eksik ya da eskimiş adımıdır.
- **Eğitimler.** Süren eğitim "eğitim şu an sürüyor (adım X/Y, son kayıt …)" diye görünür ve komut önerilmez; o
  sürerken `tokenizer-egit` ve `veri-hazirla` da önerilmez. Yarıda kalan eğitim için `--devam` komutu yazılır. Bitmiş
  ama son değerlendirmesi yapılmamış eğitim "değerlendirilmedi → degerlendir --asama …" olur.
- **Başka deneyler.** Listenin altındaki "Yarıda kalan başka deneyler" bölümü, `ciktilar/deneyler` altında yarıda
  kalmış her aşamayı sürdürme komutuyla gösterir. Bu komut `--deney` ve `--ayarlar`'ı taşır, `--ayar`'ları taşımaz: o
  deneyi `--ayar` ile başlattıysan aynılarını ekle. Tokenizer'ı ya da hazır verisi değişmiş bir koşu "sürdürülemez"
  notuyla listelenir.

Listedeki ve "Sıradaki adım"daki komutlar `durum`'a verdiğin `--ayarlar`, `--ayar` ve `--deney` seçeneklerini tekrarlar;
kopyaladığın komut aynı deneye gider. İndirilen madde sayısı da listededir. Komutları `turkce-model` klasöründe
çalıştır; `ayarlar.toml`'u başka yerde tutuyorsan `--ayarlar <dosya>` ver.

### 1. TDK'yi indir (bir gece sürer, kaldığı yerden devam eder)

```bash
python -m turkce_model tdk-indir
```

Önce ≈ 81 bin madde başını, sonra her maddenin anlamlarını, örneklerini ve ses değişimi bilgisini (`taki`) indirir.
İstekler arasında 0,35 sn bekler; sunucu yavaşlarsa bekleme süresini uzatır. Ctrl+C ile durdurup aynı komutla
sürdürebilirsin. Kesilince sonucu yazar ve 130 koduyla çıkar: `tdk-indir && tdk-derlem` gibi bir zincir yarım
indirmeyle sürmez. Önce denemek için: `python -m turkce_model tdk-indir --ornek 2000`. Sonra tam indirmeye geçersen
`durum` hangi adımların yeniden çalıştırılacağını söyler.

### 2. Derlem ve kök sözlüğü

```bash
python -m turkce_model tdk-derlem
```

Her madde bir belge olur. Biçim şöyledir (örnek uydurmadır, gerçek madde metni değildir):

```
kitap (Arapça kitāb)
1. isim: Sayfaları bir arada tutulan, basılı ya da yazılı eser
"Kitabı bitirince arkadaşına verdi."
2. Bir konuyu kapsamlı biçimde ele alan yazı
Birleşik sözler: kitap kurdu, el kitabı, …
```

Maddelerin %1'i doğrulamaya ayrılır ve hiçbir eğitime (tokenizer dahil) girmez.

Kök sözlüğü (`veri/tdk/kokler.tsv`) tek kelimelik madde başlarından ve şu biçimlerden çıkarılır:

- fiil gövdeleri: `gelmek → gel`
- TDK'nin `taki` alanındaki ses değişimleri: `kitap → kitab`, `ağız → ağz`, `hak → hakk`, `gitmek → gid`
- `-yor` önündeki daralma: `bekle → bekli`

### 3. MEB soruları (aşama 2 için)

**Kitapçıkları tarayıcıyla kendin indir.** `odsgm.meb.gov.tr` ve `www.meb.gov.tr` sitelerinin `robots.txt` dosyaları
yapay zekâ tarayıcılarını (GPTBot, ClaudeBot, Google-Extended…), `cdn.eba.gov.tr` ise tüm botları yasaklıyor. Bu yüzden
bu araç MEB sitelerinden hiçbir şey indirmez; yalnız senin indirdiğin yerel PDF'leri okur.

- Nerede: ODSGM duyurularındaki **"Açık Öğretim … Sınavlarının Soru Kitapçıkları ve Cevap Anahtarları"** sayfaları.
  Her dönem birkaç oturum yayımlanır; her oturum PDF'i onlarca dersten soru ve sonunda cevap anahtarı içerir.
- Nereye: `veri/meb/pdf/` (alt klasör olabilir).

```bash
python -m turkce_model meb-mmlu     # isteğe bağlı ama önce: TurkishMMLU'nun açık soruları
python -m turkce_model meb-pdf      # → veri/meb/meb_pdf.jsonl (+ .rapor.json)
```

`meb-mmlu`'yu önce çalıştırırsan `meb-pdf`, TurkishMMLU'daki bir soruyla soru kökü aynı olan PDF sorularını eğitimden
çıkarır. Böylece değerlendirme sınavı eğitime sızmaz. Sırayı ters yaptıysan `meb-pdf`'i, sonra `veri-hazirla`'yı
yeniden çalıştır; MEB modeli eğitildiyse onu da `--uzerine-yaz` ile yeniden eğit. Klasöre sonradan kitapçık eklersen
`durum` `meb-pdf`'i yeniden önerir.

`meb-pdf` şunları yapar:

- Ders başlıklarını, soruları, şıkları ve cevap anahtarını eşleştirir.
- Satır sonu tirelerini birleştirir.
- Şekil, grafik ya da tablo gerektiren soruları, yabancı dil derslerini ve düzeni bozuk çıkan soruları ayıklar.
- Soruları eğitim / doğrulama / test (%80 / 10 / 10) diye böler. Aynı soru her çalıştırmada aynı bölüme düşer,
  kopyalar atılır.
- Metin katmanı olmayan (taranmış) bir kitapçıkta uyarır. Böyle kitapçıkları OCR modülüyle okuyabilirsin:
  `meb-pdf --ocr` (aşağıda, "DeepSeek modülleri").

**TurkishMMLU** (Yüksel vd., EMNLP 2024 Findings) lise müfredatından, MEB'in EBA platformundaki sorulardan derlenmiş bir
ölçüttür. Açık kısmı 945 soru, 9 ders ve 5 şıktan oluşur; bir tekrar atılınca 944 soru kalır. Sabit bir sürümü indirilir,
böylece sonuçlar karşılaştırılabilir kalır. Lisansı belirtilmemiştir; burada **yalnız değerlendirmede** kullanılır,
eğitime hiç girmez. Böylece modelin hiç görmediği bir sınav olarak kalır.

Gerçek bir AÖL kitapçığında (2025-26, 1. dönem, 1. oturum) ölçülen sonuç:

- **Bulunan:** 48 ders × 10 = 480 soru; 48 cevap anahtarı bölümünün hepsi eşleşti.
- **Tutulan:** 308 soru.
- **Elenen:**
  - 100'ü yabancı dil derslerinden,
  - 52'si şekil ya da tablo gerektirdiği için,
  - 20'si düzeni bozuk çıktığı için.

Bir kitapçık yaklaşık 250 eğitim sorusu verir; birkaç dönemin kitapçıklarını indirmek aşama 2'yi anlamlı kılar.

### 4. Tokenizer

```bash
python -m turkce_model tokenizer-egit
python -m turkce_model tokenizer-dene "Kitabını okuyamadık."
```

Örnek çıktı (kimlik numaraları sözlüğe göre değişir):

```
     4  '<B>'     ozel
  1775  '▁kitab'  kok  (ana: ▁kitap)
   540  'ın'      ek
   282  'ı'       harf
  1230  '▁oku'    kok
   554  'ya'      ek
   531  'ma'      ek
   625  'dık'     ek
   449  '.'       noktalama
```

Nasıl çalışır:

- **Büyük harf ayrı işaretlenir.** `Kitap → <B> ▁kitap`, `KİTAP → <BB> ▁kitap`. Sözlükte yalnız küçük biçimler
  vardır ve Türkçe `İ/ı` kuralları korunur.
- **Önce morfoloji.** Kelime, en olası *kök + ek* bölünmesine ayrılır (Unigram LM + Viterbi, yumuşak EM ile eğitilir).
  Kök ve ek kullanmak ucuz, tek harf ve öğrenilmiş parça kullanmak cezalıdır.
- **Türkçe ayrıntılar.**
  - Kök yalnız kelime başında olur; `masalardaydı` hiçbir zaman `masal·arda` diye bölünmez.
  - `-yor` önündeki daralmış gövde (`bekli`) yalnız `-yor` önünde kullanılır: `bekliyor → ▁bekli yor`, ama
    `adı → ▁ad ı`.
  - Düzenli isim-fiiller (`gelme`) kök sayılmaz; mastar `▁gel mek` olur.
  - Satır başındaki ve `( [ { "` işaretlerinden sonraki kelimeler de `▁kitap` gibi kodlanır, ayrı biçim gerekmez.
- **Kalanlar.** Kök + ekle açıklanamayan kelimeler (özel adlar, yabancı sözcükler) BPE parçalarına, sözlükte olmayan
  karakterler UTF-8 baytlarına düşer.
- **Hiçbir metin kaybolmaz:** `decode(encode(x, normalle=False)) == x`. Varsayılan `encode` önce normalleştirir (NFC;
  tipografik tırnak, tire ve `…` sadeleşir, boşluklar toparlanır), yani `decode(encode(x)) == normallestir(x)`.
- **Kimlikler Türkçeye göre dizilir.** Özel → bayt → harf (Türk alfabesi sırasıyla) → rakam → noktalama → **ek** →
  **kök** → parça. Ek, kök ve parça bloklarında sık olan önce gelir. Her token'ın kimliği, kategorisi ve ana biçimin
  kimliği (`ler → lar`, `kitab → kitap`) `ciktilar/tokenizer/sozcukler.tsv` dosyasındadır.
- **Bilinen sınırlar.** EM seyrek daralmış gövdeleri zaman zaman tek harfe bırakır (`anlıyor → ▁an l ıyor`). Sözlükte
  olmayan özel adlar kısa köklere bölünebilir (`Türkiye → <B> ▁türki ye`). `/` ya da `-` ile bitişik yazılmış ikinci
  kelime (`kitap/defter`) çoğu zaman harf harf bölünür.

### 5. Gömme kararları

[GOMME_KARARLARI.md](GOMME_KARARLARI.md)'yi oku, `ayarlar.toml`'daki `[gomme]` bölümünü doldur, etkisine bak:

```bash
python -m turkce_model hesapla --olc
```

`hesapla` de eğitim gibi on kararın hepsini ister ve iki aşamanın eğitim ayarlarını `egit` gibi denetler. Şunları
gösterir:

- Parametre dökümü ve veri/parametre oranı.
- Aşama 1 ve aşama 2 için ayrı bellek tahmini. Tahmin, ağırlıklarla birlikte cihaz belleğinin %70'ini geçerse hangi
  bölümün `yigin` ve `birikim` değerini değiştireceğini söyler.
- Eğitim sonundaki tam değerlendirmenin yığını.
- Kararların etkileşim uyarıları.

`--olc` bu bilgisayarda rastgele veriyle birkaç adım koşar. Saniyede token sayısını ve bir eğitim adımının süresini
(aşama 1'in `yigin` × `birikim` ayarıyla) yazar.

### 6. Eğitim

```bash
python -m turkce_model veri-hazirla
python -m turkce_model egit --asama tdk      # aşama 1: sözlük
python -m turkce_model egit --asama meb      # aşama 2: TDK modelinden devam, soru çözerek
```

- **Kaldığı yerden sürer.** `--devam` son kontrol noktasından devam eder. Rastgelelik durumu adım sınırında kaydedilir:
  Ctrl+C bir adımın ortasına gelse de sürdürülen eğitim o adımı aynı yığınlarla yeniden yapar ve kesilmeseydi
  göreceği yığınlarla devam eder.
  - Kayıttakiyle aynı olmalı: `[gomme]`, `[model]` ve adım sayısını, öğrenme oranı eğrisini ya da eğitim sırasındaki
    doğrulama kümesini belirleyen eğitim ayarları (`donem`, `en_fazla_adim`, `yigin`, `birikim`, `ogrenme_orani`,
    `min_oran`, `isinma_adimi`, `agirlik_azaltma`, `gradyan_kirpma`, `degerlendirme_yigini`, `tohum`, `kayip`,
    `tdk_karisim`).
  - Tokenizer ve hazır veri de değişmemiş olmalı. Kontrol noktası onların içerik imzalarını tutar; `veri-hazirla`
    başka bir veri üretmişse `--devam` hangi akışın değiştiğini söyleyip reddeder.
  - Değişebilir (bir notla): `degerlendirme_her`, `erken_durdurma`, `hassasiyet`, `derle`.
  - Sürdürülecek kontrol noktası yoksa `--devam` hata verir, yeni bir eğitim başlatmaz. `--devam` ile `--uzerine-yaz`
    birlikte verilemez.
- **Ctrl+C** tamamlanan son adımı kaydedip durur (çıkış kodu 130). Değerlendirme yapmaz; sürdürme ve değerlendirme
  komutlarını yazar. Değerlendirmesi yarıda kalan adım `--devam`'da baştan değerlendirilir. Eğitim bittikten sonraki
  otomatik değerlendirme kesilirse eğitim kayıtlı kalır; `durum` onu "değerlendirilmedi" diye gösterir. Kontrol
  noktaları önce geçici bir dosyaya yazılır, yazma sırasında kesilse de eski kayıt bozulmaz.
- **Yazılan komutlar deneyi taşır.** `egit`'in yazdığı sürdürme ve değerlendirme komutları bu çağrının `--ayarlar`,
  `--ayar`, `--deney` ve `--cihaz` seçeneklerini tekrarlar. Kopyaladığın komut aynı deneyi sürdürür.
- **Bir aşama aynı anda tek süreçte eğitilir.** Aynı deneyin aynı aşaması eğitilirken ikinci bir `egit` reddedilir.
  Kilidi işletim sistemi tutar; süreç ölünce kendiliğinden kalkar.
- **Eski eğitim korunur.** Aynı deneyi baştan eğitmek için `--uzerine-yaz` gerekir. Eski dosyalar hemen silinmez,
  `.eski` adıyla kenara alınır ve yeni eğitim ilk adımını tamamlayınca silinir. Yeni eğitim ilk adımı bitiremezse
  (bellek yetmedi, Ctrl+C) eski eğitim olduğu gibi geri gelir.
- **Erken durdurma açık.** Doğrulama kaybı iyileşmeyi bırakınca eğitim durur ve en iyi model `en_iyi.pt`'de kalır.
  Kısa eğitimlerde değerlendirme en az ~10 kez yapılsın diye aralık kısalır. Ör. tek bir MEB kitapçığı ≈ 80 adım eder.
  Isınma da toplam adımın beşte birini geçmez. Komut bunları bir notla söyler.
- **Aşama 2'nin ayarları:**
  - Aşama 2, TDK aşamasının en iyi modelinden başlar. TDK aşaması bitmemişse bunu bir notla söyler ve bitirme komutunu
    yazar; `--sifirdan` TDK modeli olmadan başlatır.
  - Varsayılan yığın 8 × birikim 2, yani adım başına 16 dizi. TDK karışım yığınları tam bağlamlık olduğundan bellek
    aşama 1'deki gibi `egitim.meb.yigin` ile ölçeklenir.
  - `kayip = "cevap"` yalnız cevap token'larından öğrenir; varsayılan `"tum"` soruyu da dil olarak öğrenir.
  - `tdk_karisim` yığınların bir kısmını TDK'den çekerek dil bilgisinin unutulmasını azaltır.
- **Deneyler ayrı klasörlere yazılır.** Her deney, on gömme kararından ve model ayarlarından adlandırılan bir klasöre
  yazılır (`ciktilar/deneyler/g384-rope-bagli-s0.02-d0.1-k6-m3f2a/`). Bir kararı değiştirip yeniden eğittiğinde eski
  deney kalır.
  - Yalnız eğitim ayarları farklı bir deney için ad ver: `--deney <ad>`. Aynı ad `degerlendir`, `tanimla`, `sor` ve
    `uret` komutlarında o deneyin modelini seçer.
  - Tokenizer ayarı farklı bir deney için ayrı bir ayar dosyası kullan ve onun `[yollar] ciktilar` değerini de
    değiştir. Tokenizer ve hazır veri `ciktilar` klasöründedir; ortak kalırsa öteki deneyin modelleri kullanılamaz.
    Ek metin eklemek de tokenizer'ı değiştirir (aşağıda, "Daha ileri gitmek").

### 7. Nereye kadar gittin?

```bash
python -m turkce_model degerlendir               # eğitim sonunda kendiliğinden de çalışır
python -m turkce_model tanimla kitap özgürlük     # model kelimeyi sözlük gibi tanımlasın
python -m turkce_model sor --adet 5               # test sorularını sor, şık olasılıklarını gör
python -m turkce_model uret "Türk dili"
```

`degerlendir`, `--asama` verilmezse deneyde MEB modeli varsa onu, yoksa TDK modelini ölçer. `--model <dosya>` ile
herhangi bir kontrol noktası verilebilir; aşama dosyanın kendi kaydından okunur, bu yüzden `--model` ile `--asama`
verme. Dosyanın yanındaki `durum.json` eğitimin bitmediğini söylüyorsa satır "durduruldu" notunu alır. Dosyalar güvenli
biçimde yüklenir: yalnız tensör ve basit değerler okunur, başkasından gelen bir dosya kod çalıştıramaz.

`ciktilar/ilerleme.md` her değerlendirme için şunları tutar:

- **Sözlük:** boyut ve tokenizer imzası; farklı tokenizer'larla eğitilmiş satırlar ayırt edilsin diye.
- **Görülen token:** modelin eğitimde gördüğü token sayısı. MEB aşamasında TDK aşamasında görülenler de dahildir.
- **TDK doğrulama:** kayıp ve **BPC** (karakter başına bit). Doğrulama maddelerinin her token'ı tam bir kez puanlanır.
  BPC token sayısından ve bağlam uzunluğundan bağımsızdır; aynı doğrulama metni üzerinde farklı tokenizer ve gömme
  kararlarını adil karşılaştırır.
- **BPC (ek metin):** `veri/ek_metin`'in ayrı doğrulama payı (varsa).
- **MEB doğrulama, MEB test ve TurkishMMLU** doğrulukları `metin / harf (taban, n)` biçiminde:
  - *metin:* şık harfi verildikten sonra şık metninin token başına ortalama log-olasılığı (harf hariç)
  - *harf:* şıklar istemdeyken yalnız cevap harfinin (` C)`) olasılığı
  - *taban:* o kümedeki soruların şık sayısından hesaplanan rastgele tahmin oranı (4 şıkta %25, 5 şıkta %20). AÖL
    kitapçıkları çoğunlukla 4 şıklı, TurkishMMLU 5 şıklıdır.
  - *n:* soru sayısı; n küçükken birkaç puanlık fark gürültüdür.
- **Not:**
  - `durduruldu`: eğitim bitmeden değerlendirildi (`--model` ile verilen dosyada da yanındaki `durum.json`'a bakılır).
  - `+N ek paragraf`: hazır veride `veri/ek_metin`'den N paragraf var.
  - `MEB eğitimi: N soru 5 şıklı`: aşama 2 satırlarında; ince ayar E şıkkını da gördü, harf puanını buna göre oku.
  - `eski ölçüm: yeniden değerlendir`: satır ölçüm sürümünü taşımıyor; önceki sürümlerin yazdığı satırlar böyledir.
    İlk sürümler BPC'yi yalnız tam pencerelerden, metin puanını harfle birlikte ölçüyordu; karşılaştırmak için aynı
    modeli yeniden değerlendir.
- **Aşaması "kıyas" olan satırlar** `modul-kiyas`'tan gelir: hazır bir DeepSeek modelinin aynı sorulardaki sonucu
  (aşağıda, "DeepSeek modülleri").

Sayılarda binlik ayırıcı boşluk, ondalık ayırıcı noktadır (`823 616`, `3.719`); bir milyondan büyükler `5.38 M` gibi
yazılır. Tablonun altında, bağlam için TurkishMMLU makalesindeki büyük modellerin puanları durur (5 örnekli ölçüm;
birebir karşılaştırma değil).

**Eski bir sürümden güncellediysen** sırayla şunları çalıştır:

1. `tokenizer-egit`: ilk sürümler doğrulama maddelerini de sözlüğe katıyordu. Yeni tokenizer eskisiyle aynı çıkarsa
   modellerin kullanılabilir kalır (`degerlendir` onları yükler). Farklı çıkarsa modelleri `--uzerine-yaz` ile yeniden
   eğit.
2. `veri-hazirla`: eğitim ve değerlendirme eski biçimle hazırlanmış veriyi reddeder.
3. `degerlendir`: eski satırları yeni ölçümle yinele.

Bu sürümden önce eğitilmiş modeller imza taşımaz; `durum` onları tokenizer dosyasının zamanıyla karşılaştırır.
Tokenizer'ı yeniden eğitince, aynı çıksa da bu modelleri `[~]` gösterir. `degerlendir` modeli yükleyebiliyorsa
tokenizer aynıdır, yeniden eğitmen gerekmez.

## Daha ileri gitmek: ek metin

`veri/ek_metin/**/*.txt` dosyaları boş satırla ayrılmış paragraflara bölünüp aşama 1 akışına eklenir. Örneğin Türkçe
Vikipedi dökümü (CC BY-SA) ya da hakkına sahip olduğun metinler. Paragrafların %1'i ayrı bir doğrulama akışına gider ve
tabloda "BPC (ek metin)" sütununda ölçülür. TDK doğrulaması değişmez, eski satırlarla karşılaştırılabilir kalır.

Ek metin tokenizer'ı da değiştirir. `tokenizer-egit` ortak tokenizer'ı (`ciktilar/tokenizer`) yeniden yazar. Yeni
tokenizer farklı çıkacağından `ciktilar/deneyler` altındaki bütün modeller, `--deney` adları ne olursa olsun,
kullanılamaz olur. Önceki deneyleri korumak için ek metin deneyini, `[yollar] ciktilar` değeri farklı ayrı bir ayar
dosyasıyla yap. Örneğin `ayarlar.toml`'u `ek.toml` adıyla kopyala ve içinde `ciktilar = "ciktilar_ek"` yaz:

```bash
python -m turkce_model tokenizer-egit --ayarlar ek.toml
python -m turkce_model veri-hazirla --ayarlar ek.toml
python -m turkce_model egit --asama tdk --ayarlar ek.toml
```

Yeni deneyin tokenizer'ı, hazır verisi, modelleri ve ilerleme tablosu `ciktilar_ek/` altındadır. `veri/` ise ortaktır:
eski ayar dosyasıyla `durum` artık tokenizer'ı ve hazır veriyi `[~]` gösterir ve `tokenizer-egit` önerir, çünkü ek metin
onların da girdisidir. Önceki deneyi olduğu gibi tutmak istiyorsan bu öneriyi uygulama.

## DeepSeek modülleri (isteğe bağlı)

DeepSeek'in açık yayımladığı küçük modeller bu projeye **modül** olarak bağlanabilir. Dil modelinin kendisi yine
sıfırdan eğitilir: modüller ona ağırlık katmaz. OCR modülü yalnız senin verdiğin sayfaları ve fotoğrafları metne
çevirir, kıyas modeli yalnız ölçülür. Hepsi varsayılan olarak kapalıdır. Yalnız bu bilgisayardaki ya da yerel ağdaki
bir model sunucusuna bağlanırlar; TDK/MEB içeriği dışarıdaki bir hizmete gönderilmez.

| Modül   | Ne yapar                                                   | DeepSeek modeli                                                        |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `ocr`   | Taranmış kitapçıkları ve soru fotoğraflarını metne çevirir | DeepSeek-OCR (3,3 milyar parametre, MIT) · DeepSeek-OCR-2 (Apache-2.0) |
| `metin` | Hazır küçük bir modeli aynı test sorularında ölçer         | DeepSeek-R1 damıtmaları: 1,5B · 7B · 8B (MIT)                          |

```bash
python -m turkce_model modul-liste     # DeepSeek'in küçük modelleri, rolleri, lisansları ve sunucunun durumu
```

**Neden yalnız bu ikisi?** `modul-liste` her modelin yanında nedenini yazar. Kısaca:

- **DSpark, DFlash, Eagle3** (DeepSpec): yalnız eğitildikleri hedef modelin (Qwen3, Gemma 4, DeepSeek-V4) üretimini
  hızlandıran taslak modellerdir. O modele göre eğitilmişlerdir; başka bir modele takılamazlar.
- **Janus ve DeepSeek-VL** (görüntü anlama): yerel sunucularda hazır değil. Bu projede görüntüden gereken tek şey
  metni okumak; onu OCR modülü yapıyor.
- **Coder, Math, Prover**: kod ve matematik modelleri; Türkçe dil modeliyle ilgileri yok.
- **DeepSeek-V4 / V4.1**: 284 milyar – 1,6 trilyon parametre; kişisel bilgisayarda çalışmaz.

Bu modellerin ağırlıklarını sıfırdan eğittiğin modelin "içine" katmak mümkün değildir (mimari ve token'lar farklıdır)
ve "sıfırdan" ilkesini bozardı. Modül, modelin yanında çalışan ayrı bir araçtır.

### Modülleri kurmak

1. Yerel bir model sunucusu kur. En kolayı [Ollama](https://ollama.com): Windows, macOS ve Linux'ta çalışır; ekran
   kartı olmadan da çalışır ama yavaştır.
2. Modeli indir:

   ```bash
   ollama pull deepseek-ocr        # OCR (Ollama 0.13 ya da sonrası gerekir)
   ollama pull deepseek-r1:1.5b    # kıyas için en küçük DeepSeek metin modeli
   ```

3. `ayarlar.toml`'da modülü aç (dosyayı değiştirmeden: `--ayar moduller.ocr.model=deepseek-ocr`):

   ```toml
   [moduller.ocr]
   model = "deepseek-ocr"

   [moduller.metin]
   model = "deepseek-r1:1.5b"
   ```

4. Bu bilgisayarda sına:

   ```bash
   python -m turkce_model modul-dene                          # açık modüllerin hepsi
   python -m turkce_model modul-dene ocr --gorsel sayfa.png   # OCR'ı kendi görüntünle
   ```

   OCR sınaması Türkçe harfli küçük bir sayfa çizer ve modele okutur. Süreyi, karakter doğruluğunu ve ç ğ ı İ ö ş ü
   harflerinin doğru okunma oranını yazar. Kitapçık okutmadan önce bu sonuca bak. Metin sınaması modele bir soru
   sorar ve cevabından şık harfini çıkarabildiğini gösterir.

Kapalı bir modülü isteyen her komut, onu nasıl açacağını söyleyip 2 koduyla çıkar. `durum` açık modülleri sunucuya
bağlanmadan tek satırda gösterir: `Modüller: ocr deepseek-ocr, metin kapalı (sınamak için: …)`.

Başka sunucular da olur; `[moduller] adres` değerini değiştirmen yeter. Adres, sunucunun OpenAI uyumlu köküdür ve
`/v1` ile biter:

| Sunucu    | Adres                       | Not                                                                        |
| --------- | --------------------------- | -------------------------------------------------------------------------- |
| Ollama    | `http://localhost:11434/v1` | varsayılan                                                                 |
| llama.cpp | `http://localhost:8080/v1`  | `llama-server -hf ggml-org/DeepSeek-OCR-GGUF --chat-template deepseek-ocr` |
| LM Studio | `http://localhost:1234/v1`  |                                                                            |
| vLLM      | `http://localhost:8000/v1`  | NVIDIA ekran kartı; DeepSeek-OCR ve OCR-2'nin resmî hızlı yolu             |

Yerel ağdaki bir bilgisayar da olur (`192.168.…`, `10.…`, `*.local`). Başka bir adres varsayılan olarak reddedilir;
bilerek izin vermek için `[moduller] uzak_sunucu = true` yaz.

vLLM'de DeepSeek-OCR için önerilen tekrar önleyici, isteğe eklenen alanlarla açılır:

```toml
[moduller.ocr]
model = "deepseek-ai/DeepSeek-OCR"
ek_istek = { skip_special_tokens = false, vllm_xargs = { ngram_size = 30, window_size = 90, whitelist_token_ids = [128821, 128822] } }
```

DeepSeek-OCR-2, Ollama'nın resmî kütüphanesinde görünmüyor (Kasım 2026). vLLM ya da llama.cpp ile çalışır; adını
`[moduller.ocr] model` alanına yazman yeter.

### OCR modülü

```bash
python -m turkce_model meb-pdf --ocr           # metin katmanı olmayan (taranmış) kitapçıkları OCR ile oku
python -m turkce_model meb-pdf --ocr hepsi     # bütün kitapçıkları OCR ile oku
python -m turkce_model sor --resim soru.jpg    # fotoğraftaki soruyu okut, kendi modelin cevaplasın
python -m turkce_model ocr kitap.pdf           # herhangi bir PDF ya da görüntüyü metne çevir → veri/ocr/
```

- **`meb-pdf --ocr`** sayfaları görüntüye çevirir (`[moduller.ocr] dpi`, varsayılan 150) ve modele okutur. Çıkan metin
  PDF ayrıştırıcısının aynı kurallarından geçer: ders başlığı → soru → seçenek, cevap anahtarı, elemeler. Metin katmanı
  olan kitapçıklar `--ocr` ile de her zamanki gibi okunur. OCR ile okunan soruların `ek` alanına `"okuma": "ocr"` ve
  modelin adı yazılır.
- **Önbellek.** Okunan sayfalar `ciktilar/moduller/ocr/` altında saklanır: yarıda kesilirse kaldığı sayfadan sürer,
  aynı sayfa ikinci kez okunmaz.
- **Hata olursa durur.** Sunucuya ulaşılamazsa, model yoksa ya da modül kapalıysa `meb-pdf --ocr` kendi iletisiyle
  durur ve `meb_pdf.jsonl`'e dokunmaz.
- **Konum bilgisi yoktur.** PDF yolu sütunları, girintiyi ve çizimleri görür; OCR metninde bunlar yoktur. Bu yüzden:
  - Şekilli sorular yalnız modelin bıraktığı şekil işaretinden ya da kökteki "şekil, tablo, grafik" gibi sözlerden
    anlaşılır.
  - Cevap anahtarında bir dersin altında aynı soru numarası iki farklı harfle okunursa (yan yana sütunlar karışmış
    demektir) o dersin bütün soruları elenir. Yanlış cevapla eğitmektense soruyu atmak daha iyidir.
  - Rakamla başlayan devam satırları ("2. Dünya Savaşı'ndan…") soru başı sanılmasın diye her derste en tutarlı soru
    dizisi seçilir.
  - Yine de OCR ile okunan soruları eğitimden önce gözle örnekle (`veri/meb/meb_pdf.jsonl`).
- **Hız.** DeepSeek-OCR 3,3 milyar parametrelidir. Ekran kartında sayfa başına saniyeler, yalnız CPU'da dakikalar
  sürebilir; `[moduller] zaman_asimi` buna göre geniştir (900 sn).
- **`sor --resim`** fotoğraftaki tek soruyu (kök + "A) …" seçenekleri) okur; sıfırdan eğittiğin model şıkları
  puanlar. Doğru cevap bilinmediği için yalnız modelin seçimini gösterir. Fotoğraf model yüklenmeden önce okunur;
  `--adet` yok sayılır.
- **`ocr`** bir PDF'i ya da görüntüyü (`.png`, `.jpg`, `.webp` …) metne çevirip `veri/ocr/<ad>.txt`'ye yazar
  (`--cikti` ile başka bir klasöre). Hakkına sahip olduğun metinleri `veri/ek_metin/` klasörüne koyarsan aşama 1'e
  eklenir; tokenizer'ı da değiştirdiğini unutma ("Daha ileri gitmek" bölümü).

### Kıyas modülü

```bash
python -m turkce_model modul-kiyas --adet 100   # her kümeden 100 soru (varsayılan); 0 = hepsi
```

Küçük bir DeepSeek metin modeline MEB test sorularını ve TurkishMMLU'yu sorar. Her kümenin doğruluğunu konsolda yazar
ve `ilerleme.md`'ye "kıyas" aşamasıyla bir satır ekler. Böylece sıfırdan eğittiğin modelin doğruluğunu, bilgisayarında
çalışan hazır küçük bir modelin aynı sorulardaki sonucuyla karşılaştırırsın.

- Her çalıştırmada aynı sorular seçilir; `--adet` büyüdükçe küme genişler ve önceki cevaplar yeniden kullanılır.
- İki ölçüm aynı değildir. Senin modelin şıkların olasılığıyla puanlanır; modül modeli soruyu okuyup cevabı yazar
  ("üretimle") ve milyarlarca token'lık ön eğitimden gelir. Cevabından şık harfi çıkarılamayan sorular "cevapsız"
  sayılır ve yanlış kabul edilir.
- DeepSeek-R1 damıtmaları cevaptan önce düşünür; CPU'da soru başına onlarca saniye sürebilir. Cevaplar soru soru
  `ciktilar/moduller/kiyas/` altında saklanır (ham cevap ve çıkarılan şık); yarıda kesilirse kaldığı yerden sürer.
  Birkaç cevaba bakıp şıkkın doğru çıkarıldığını denetle.
- Bu küçük modellerin Türkçesi sınırlıdır; sonucu "bu boyuttaki hazır bir model ne yapıyor" diye oku.

### Sınanan ve sınanmayan

Modüllerin kodu bu depoda sahte bir yerel sunucuyla sınanır (istek biçimi, hata iletileri, önbellek, OCR metninden
soru çıkarma, kıyas). **Gerçek bir DeepSeek modeli bu projenin geliştirildiği ortamda çalıştırılmadı** (ekran kartı
yoktu). DeepSeek-OCR'ın Türkçe sınav sayfalarını ne kadar doğru okuduğunu kendi bilgisayarında `modul-dene` ile ve
birkaç sayfayı gözle karşılaştırarak ölç.

Lisanslar: DeepSeek-OCR MIT, DeepSeek-OCR-2 Apache-2.0, DeepSeek-R1 damıtmaları MIT. Öteki küçük modellerin bir
kısmı DeepSeek'in kendi model lisansıyla yayımlanmıştır; `modul-liste` her birinin lisansını gösterir.

## Veri, haklar ve gizlilik

- `veri/` ve `ciktilar/` depoya girmez (`.gitignore`).
- **TDK:** içeriğin hakları TDK'ye aittir. İndirilen madde ve derlemi yalnız kişisel araştırmada kullan, paylaşma.
  `sozluk.gov.tr/robots.txt` otomatik erişime izin veriyor; indirici yine de yavaş ve nazik çalışır.
- **MEB:** kitapçıkları kendin indirirsin; bu araç MEB sitelerine istek göndermez. Soruları ve onlarla eğitilmiş
  modelleri yayımlamadan önce MEB'in kullanım koşullarına bak.
- **TurkishMMLU:** lisansı belirtilmemiştir. Kaynak göster (Yüksel vd., 2024), yeniden dağıtma.
- **DeepSeek modülleri:** yalnız bu bilgisayardaki ya da yerel ağdaki bir sunucuya bağlanır; başka bir adres için
  `[moduller] uzak_sunucu = true` gerekir. Modellerin lisansları `modul-liste`'de.
- Testler TDK ya da MEB içeriği içermez; tüm test verisi sentetiktir.

## Dosyalar

| Yol                             | Ne                                                                       |
| ------------------------------- | ------------------------------------------------------------------------ |
| `ayarlar.toml`                  | tüm ayarlar; `[gomme]` senin kararların                                  |
| `GOMME_KARARLARI.md`            | gömme seçenekleri, ödünleşimler, bilinen modeller                        |
| `turkce_model/ayarlar.py`       | ayar dosyasını okuma, `--ayar` geçersiz kılmaları, doğrulama, deney adı  |
| `turkce_model/metin.py`         | Türkçe büyük/küçük harf, normalleştirme, ön bölütleme                    |
| `turkce_model/morfoloji.py`     | ek şablonları → ünlü uyumuna göre ek biçimleri, asıl biçim bağları       |
| `turkce_model/tdk.py`           | TDK indirme, derlem, kök sözlüğü (ses değişimleri)                       |
| `turkce_model/tokenizer.py`     | kök + ek tokenizer'ı, eğitimi, Türkçe ID blokları                        |
| `turkce_model/meb.py`           | MEB PDF ayrıştırıcı, TurkishMMLU, soru biçimi, bölme                     |
| `turkce_model/veri.py`          | token akışları ve soru örnekleri (eğitim ve değerlendirme verisi)        |
| `turkce_model/model.py`         | GPT ve tüm gömme seçenekleri                                             |
| `turkce_model/egitim.py`        | eğitim döngüsü, kontrol noktaları, değerlendirme                         |
| `turkce_model/degerlendirme.py` | kayıp, BPC, çoktan seçmeli doğruluk, ilerleme tablosu                    |
| `turkce_model/uretim.py`        | metin üretme, sözlük tanımı, soru cevaplama                              |
| `turkce_model/cli.py`           | komutlar                                                                 |
| `turkce_model/moduller/`        | isteğe bağlı DeepSeek modülleri: yerel sunucu, OCR, kıyas, katalog       |
| `tests/`                        | sentetik veriyle birim ve uçtan uca testler                              |
