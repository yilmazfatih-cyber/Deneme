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
(PowerShell: `$env:PYTHONUTF8=1`). Yoksa `▁` ve `→` gibi işaretler kaçış dizisi (`▁`) olarak yazılır.

**Örnek hızlar ve bellek.** 4 çekirdekli bir bulut CPU'sunda; sözlük 32 000, bağlam 512, yığın 8 ile ölçüldü:

| boyut / katman | hız            | en yüksek bellek | tüm TDK'de bir dönem (≈ 3 milyon token) |
| -------------- | -------------- | ---------------- | --------------------------------------- |
| 128 / 4        | ~3 200 token/sn | ~3,5 GB          | ≈ 16 dk                                 |
| 256 / 6        | ~1 500 token/sn | ~4,6 GB          | ≈ 34 dk                                 |
| 384 / 6        | ~950 token/sn   | ~5,5 GB          | ≈ 53 dk                                 |

Varsayılan 10 dönemdir, yani bunun 10 katı; erken durdurma daha önce kesebilir. Bir ekran kartı bunu onlarca kat
hızlandırır. Belleğin çoğunu çıkış logit'leri tutar (yığın × bağlam × sözlük). Bu yüzden varsayılan yığın 8, birikim 4'tür:
her adım yine 32 dizi görür. Bellek yetmezse `egitim.tdk.yigin`'i küçült ve `birikim`'i aynı oranda büyüt; sonuç
değişmez. Ekran kartında tersini yap. Kendi ayarlarınla tahmin ve ölçüm için:
`python -m turkce_model hesapla --olc` (gömme kararları dolduktan sonra).

## Adım adım

Her an nerede olduğunu ve sıradaki komutu görmek için:

```bash
python -m turkce_model durum
```

`durum` her adımın çıktısını girdileriyle karşılaştırır. Örneğin tam indirmeden sonra derlem eski kaldıysa onu
`[~]` ile işaretler ve yeniden çalıştırılacak komutu söyler. İndirilen madde sayısını ve yarıda kalan eğitimleri de
gösterir. Komutları `turkce-model` klasöründe çalıştır; `ayarlar.toml`'u başka yerde tutuyorsan `--ayarlar <dosya>` ver.

### 1. TDK'yi indir (bir gece sürer, kaldığı yerden devam eder)

```bash
python -m turkce_model tdk-indir
```

Önce ≈ 81 bin madde başını, sonra her maddenin anlamlarını, örneklerini ve ses değişimi bilgisini (`taki`) indirir.
İstekler arasında 0,35 sn bekler; sunucu yavaşlarsa bekleme süresini uzatır. Ctrl+C ile durdurup aynı komutla
sürdürebilirsin. Önce denemek için: `python -m turkce_model tdk-indir --ornek 2000`. Sonra tam indirmeye geçersen
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
yeniden çalıştır; MEB modeli eğitildiyse onu da `--uzerine-yaz` ile yeniden eğit.

`meb-pdf` şunları yapar:

- Ders başlıklarını, soruları, şıkları ve cevap anahtarını eşleştirir.
- Satır sonu tirelerini birleştirir.
- Şekil, grafik ya da tablo gerektiren soruları, yabancı dil derslerini ve düzeni bozuk çıkan soruları ayıklar.
- Soruları eğitim / doğrulama / test (%80 / 10 / 10) diye böler. Aynı soru her çalıştırmada aynı bölüme düşer,
  kopyalar atılır.

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

`hesapla` de eğitim gibi on kararın hepsini ister. Parametre dökümünü, bellek tahminini, veri/parametre oranını ve
kararların etkileşim uyarılarını gösterir.

### 6. Eğitim

```bash
python -m turkce_model veri-hazirla
python -m turkce_model egit --asama tdk      # aşama 1: sözlük
python -m turkce_model egit --asama meb      # aşama 2: TDK modelinden devam, soru çözerek
```

- **Kaldığı yerden sürer.** `--devam` son kontrol noktasından devam eder. Rastgelelik durumu da kaydedilir: sürdürülen
  eğitim yığınları baştan tekrarlamaz, kesilmeseydi göreceği yığınlarla devam eder.
  - Kayıttakiyle aynı olmalı: `[gomme]`, `[model]` ve adım sayısını ya da öğrenme oranı eğrisini belirleyen eğitim
    ayarları (`donem`, `en_fazla_adim`, `yigin`, `birikim`, `ogrenme_orani`, `min_oran`, `isinma_adimi`,
    `agirlik_azaltma`, `gradyan_kirpma`, `tohum`, `kayip`, `tdk_karisim`). Hazır veri de değişmemiş olmalı.
  - Değişebilir (bir notla): `degerlendirme_her`, `degerlendirme_yigini`, `erken_durdurma`, `hassasiyet`, `derle`.
- **Ctrl+C** o ana kadar tamamlanan adımı kaydedip durur; değerlendirme yapmaz, sürdürme ve değerlendirme komutlarını
  yazar. Kontrol noktaları önce geçici bir dosyaya yazılır, yazma sırasında kesilse de eski kayıt bozulmaz.
- **Eski eğitim korunur.** Aynı deneyi baştan eğitmek için `--uzerine-yaz` gerekir. Eski dosyalar ancak yeni eğitimin
  bütün denetimleri geçtikten sonra silinir.
- **Erken durdurma açık.** Doğrulama kaybı iyileşmeyi bırakınca eğitim durur ve en iyi model `en_iyi.pt`'de kalır.
  Kısa eğitimlerde değerlendirme en az ~10 kez yapılsın diye aralık kısalır. Ör. tek bir MEB kitapçığı ≈ 80 adım eder.
  Isınma da toplam adımın beşte birini geçmez. Komut bunları bir notla söyler.
- **Aşama 2'nin ayarları:**
  - `kayip = "cevap"` yalnız cevap token'larından öğrenir; varsayılan `"tum"` soruyu da dil olarak öğrenir.
  - `tdk_karisim` yığınların bir kısmını TDK'den çekerek dil bilgisinin unutulmasını azaltır.
- **Deneyler ayrı klasörlere yazılır.** Her deney, on gömme kararından ve model ayarlarından adlandırılan bir klasöre
  yazılır (`ciktilar/deneyler/g384-rope-bagli-s0.02-d0.1-k6-m3f2a/`). Bir kararı değiştirip yeniden eğittiğinde eski
  deney kalır.
  - Yalnız eğitim ayarları farklı bir deney için ad ver: `--deney <ad>`. Aynı ad `degerlendir`, `tanimla`, `sor` ve
    `uret` komutlarında o deneyin modelini seçer.
  - Tokenizer ayarı farklı bir deney için ayrı bir ayar dosyası kullan ve onun `[yollar] ciktilar` değerini de
    değiştir. Tokenizer ve hazır veri `ciktilar` klasöründedir; ortak kalırsa öteki deneyin modelleri kullanılamaz.

### 7. Nereye kadar gittin?

```bash
python -m turkce_model degerlendir               # eğitim sonunda kendiliğinden de çalışır
python -m turkce_model tanimla kitap özgürlük     # model kelimeyi sözlük gibi tanımlasın
python -m turkce_model sor --adet 5               # test sorularını sor, şık olasılıklarını gör
python -m turkce_model uret "Türk dili"
```

`degerlendir`, `--asama` verilmezse deneyde MEB modeli varsa onu, yoksa TDK modelini ölçer. `--model <dosya>` ile
herhangi bir kontrol noktası verilebilir. Dosyalar güvenli biçimde yüklenir: yalnız tensör ve basit değerler okunur,
başkasından gelen bir dosya kod çalıştıramaz.

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
  - *taban:* o kümenin rastgele tahmin oranı (AÖL soruları 4 şıklı → %25, TurkishMMLU 5 şıklı → %20)
  - *n:* soru sayısı; n küçükken birkaç puanlık fark gürültüdür.
- **Not:** `durduruldu` (eğitim bitmeden değerlendirildi), `+N ek paragraf`.

Tablonun altında, bağlam için TurkishMMLU makalesindeki büyük modellerin puanları durur (5 örnekli ölçüm; birebir
karşılaştırma değil).

## Daha ileri gitmek: ek metin

`veri/ek_metin/**/*.txt` dosyaları boş satırla ayrılmış paragraflara bölünüp aşama 1 akışına eklenir. Örneğin Türkçe
Vikipedi dökümü (CC BY-SA) ya da hakkına sahip olduğun metinler. Paragrafların %1'i ayrı bir doğrulama akışına gider ve
tabloda "BPC (ek metin)" sütununda ölçülür. TDK doğrulaması değişmez, eski satırlarla karşılaştırılabilir kalır.

Ek metin tokenizer'ı da değiştirir. Tokenizer'ı ve veriyi yeniden hazırla, modelleri yeniden eğit:

```bash
python -m turkce_model tokenizer-egit
python -m turkce_model veri-hazirla
python -m turkce_model egit --asama tdk --uzerine-yaz     # ya da yeni bir --deney adıyla
```

## Veri, haklar ve gizlilik

- `veri/` ve `ciktilar/` depoya girmez (`.gitignore`).
- **TDK:** içeriğin hakları TDK'ye aittir. İndirilen madde ve derlemi yalnız kişisel araştırmada kullan, paylaşma.
  `sozluk.gov.tr/robots.txt` otomatik erişime izin veriyor; indirici yine de yavaş ve nazik çalışır.
- **MEB:** kitapçıkları kendin indirirsin; bu araç MEB sitelerine istek göndermez. Soruları ve onlarla eğitilmiş
  modelleri yayımlamadan önce MEB'in kullanım koşullarına bak.
- **TurkishMMLU:** lisansı belirtilmemiştir. Kaynak göster (Yüksel vd., 2024), yeniden dağıtma.
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
| `tests/`                        | sentetik veriyle birim ve uçtan uca testler                              |
