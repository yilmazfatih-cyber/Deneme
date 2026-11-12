# Sıfırdan Türkçe dil modeli

Hazır hiçbir model ya da ağırlık kullanmadan, bilgisayarında Türkçe bir dil modeli eğitmek için uçtan uca bir boru hattı:

1. **Türkçeye göre token'lar.** TDK kökleri ve Türkçe ek biçimleriyle bir tokenizer. Kimlikler (ID) Türkçe
   kategorilere göre bloklar hâlinde dizilir.
2. **Önce TDK.** Güncel Türkçe Sözlük'ün tüm maddeleriyle ön eğitim (aşama 1).
3. **Sonra MEB soruları.** MEB'in yayımladığı çoktan seçmeli sorularla ince ayar ve ölçüm (aşama 2).
4. **Gömme kararları senin.** `ayarlar.toml`'daki `[gomme]` bölümü boş bırakıldı. Seçenekler ve ödünleşimler
   [GOMME_KARARLARI.md](GOMME_KARARLARI.md) dosyasında.
5. **Nereye kadar gittiğini görmek için** her deney `ciktilar/ilerleme.md` tablosuna bir satır yazar: BPC, doğruluk ve
   rastgele tahmin tabanı.

```
TDK kelime listesi ──► TDK maddeleri ──► derlem + kök sözlüğü ──► tokenizer (kök + ek, Türkçe ID blokları)
                                                                      │
MEB kitapçıkları (PDF, elle indirilir) ──► sorular ───────────────────┤
                                                                      ▼
                                 veri-hazirla ──► aşama 1: TDK ──► aşama 2: MEB ──► değerlendirme ──► ilerleme.md
```

## Dürüst beklenti

- **Veri küçük.** Tüm TDK ≈ 81 bin madde ≈ 10,8 milyon karakter ≈ **3 milyon token**. Bir MEB AÖL kitapçığı birkaç yüz
  soru ekler. Kıyas için: bugünkü büyük modeller trilyonlarca token görüyor.
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

**Ekran kartın NVIDIA ise** PyTorch'u önce [pytorch.org](https://pytorch.org/get-started/locally/) sayfasındaki CUDA
komutuyla kur. Windows'ta PyPI'deki PyTorch yalnızca CPU sürümüdür. Apple Silicon (M1–M4) MPS ile kendiliğinden çalışır.

```bash
pip install -e ".[pdf,dev]"
python -m pytest -q                # her şey yerinde mi?
```

Hız fikri (4 çekirdekli bir bulut CPU'sunda ölçüldü, bağlam 512): boyut 128 / 4 katman ~3 200 token/sn
(3 milyon token'lık bir dönem ≈ 16 dk); boyut 256 / 6 katman ~1 500 token/sn (≈ 33 dk); boyut 384 / 6 katman
~1 200 token/sn (≈ 42 dk). Bir ekran kartı bunu onlarca kat hızlandırır. Kendi makinende ölçmek için:
`python -m turkce_model hesapla --olc`.

## Adım adım

Her an nerede olduğunu ve sıradaki komutu görmek için:

```bash
python -m turkce_model durum
```

### 1. TDK'yi indir (bir gece sürer, kaldığı yerden devam eder)

```bash
python -m turkce_model tdk-indir
```

Önce ≈ 81 bin madde başını, sonra her maddenin anlamlarını, örneklerini ve ses değişimi bilgisini (`taki`) indirir.
İstekler arasında 0,35 sn bekler ve sunucu yavaşlarsa geri çekilir. Ctrl+C ile durdurup aynı komutla sürdürebilirsin.
Önce denemek için: `python -m turkce_model tdk-indir --ornek 2000`.

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
python -m turkce_model meb-pdf      # → veri/meb/meb_pdf.jsonl (+ .rapor.json)
python -m turkce_model meb-mmlu     # isteğe bağlı: TurkishMMLU'nun açık 945 sorusu
```

`meb-pdf` şunları yapar:

- Ders başlıklarını, soruları, şıkları ve cevap anahtarını eşleştirir.
- Satır sonu tirelerini birleştirir.
- Şekil, grafik ya da tablo gerektiren soruları, yabancı dil derslerini ve düzeni bozuk çıkan soruları ayıklar.
- Soruları kararlı biçimde eğitim / doğrulama / test (%80 / 10 / 10) diye böler: aynı soru her çalıştırmada aynı
  bölüme düşer, kopyalar atılır.

**TurkishMMLU** (Yüksel vd., EMNLP 2024 Findings) lise müfredatından, MEB'in EBA platformundaki sorulardan derlenmiş bir
ölçüttür. Açık kısmı 945 soru, 9 ders ve 5 şıktan oluşur. Lisansı belirtilmemiştir; burada **yalnız değerlendirmede**
kullanılır, eğitime hiç girmez. Böylece modelin hiç görmediği bir sınav olarak kalır.

### 4. Tokenizer

```bash
python -m turkce_model tokenizer-egit
python -m turkce_model tokenizer-dene "Kitabını okuyamadık."
```

```
     4  '<B>'     ozel
  1862  '▁kitab'  kok  (ana: ▁kitap)
   537  'ın'      ek
   282  'ı'       harf
  1789  '▁oku'    kok
   550  'ya'      ek
   551  'ma'      ek
   662  'dık'     ek
   449  '.'       noktalama
```

Nasıl çalışır:

- **Büyük harf ayrı işaretlenir.** `İstanbul → <B> ▁istanbul`, `TDK → <BB> ▁tdk`. Sözlükte yalnız küçük biçimler
  vardır ve Türkçe `İ/ı` kuralları korunur.
- **Önce morfoloji.** Kelime, en olası *kök + ek* bölünmesine ayrılır (Unigram LM + Viterbi, yumuşak EM ile eğitilir).
  Kök ve ek kullanmak ucuz, tek harf ve öğrenilmiş parça kullanmak cezalıdır.
- **Kalanlar.** Kök + ekle açıklanamayan kelimeler (özel adlar, yabancı sözcükler) BPE parçalarına, sözlükte olmayan
  karakterler UTF-8 baytlarına düşer. Hiçbir metin kaybolmaz: `decode(encode(x)) == x`.
- **Kimlikler Türkçeye göre dizilir.** Özel → bayt → harf (Türk alfabesi sırasıyla) → rakam → noktalama → **ek** →
  **kök** → parça. Ek, kök ve parça bloklarında sık olan önce gelir. Her token'ın kimliği, kategorisi ve ana biçimi
  (`ler → lar`, `kitab → kitap`) `ciktilar/tokenizer/sozcukler.tsv` dosyasındadır.

### 5. Gömme kararları

[GOMME_KARARLARI.md](GOMME_KARARLARI.md)'yi oku, `ayarlar.toml`'daki `[gomme]` bölümünü doldur, etkisine bak:

```bash
python -m turkce_model hesapla --olc
```

### 6. Eğitim

```bash
python -m turkce_model veri-hazirla
python -m turkce_model egit --asama tdk      # aşama 1: sözlük
python -m turkce_model egit --asama meb      # aşama 2: TDK modelinden devam, soru çözerek
```

- **Kaldığı yerden sürer.** `--devam` son kontrol noktasından devam eder. Ctrl+C güvenle durdurur.
- **Erken durdurma açık.** Doğrulama kaybı iyileşmeyi bırakınca eğitim durur; küçük veride ezberlemeye karşı ilk
  savunma budur.
- **Aşama 2'nin ayarları:**
  - `kayip = "cevap"` yalnız cevap token'larından öğrenir; varsayılan `"tum"` soruyu da dil olarak öğrenir.
  - `tdk_karisim` yığınların bir kısmını TDK'den çekerek dil bilgisinin unutulmasını azaltır.
- **Deneyler ayrı klasörlere yazılır.** Her deney, gömme kararlarından adlandırılan bir klasöre yazılır
  (`ciktilar/deneyler/g384-rope-bagli-k6/`). Bir kararı değiştirip yeniden eğittiğinde eski deney kalır.

### 7. Nereye kadar gittin?

```bash
python -m turkce_model degerlendir --asama meb   # eğitim sonunda kendiliğinden de çalışır
python -m turkce_model tanimla kitap özgürlük     # model kelimeyi sözlük gibi tanımlasın
python -m turkce_model sor --adet 5               # test sorularını sor, şık olasılıklarını gör
python -m turkce_model uret "Türk dili"
```

`ciktilar/ilerleme.md` her deney için şunları tutar:

- **TDK doğrulama:** kayıp ve **BPC** (karakter başına bit). Token sayısından bağımsız olduğu için farklı tokenizer
  ve gömme kararlarını adil karşılaştırır.
- **MEB doğrulama/test doğruluğu,** iki yöntemle:
  - *metin:* şık metninin olasılığı
  - *harf:* şıklar istemdeyken cevap harfinin olasılığı
- **TurkishMMLU doğruluğu.**
- **Rastgele tahmin tabanı.**

Tablonun altında, bağlam için TurkishMMLU makalesindeki büyük modellerin puanları durur (5 örnekli ölçüm; birebir
karşılaştırma değil).

## Daha ileri gitmek: ek metin

`veri/ek_metin/**/*.txt` dosyaları boş satırla ayrılmış paragraflara bölünüp aşama 1 akışına eklenir (%1'i doğrulamaya).
Örneğin Türkçe Vikipedi dökümü (CC BY-SA) ya da hakkına sahip olduğun metinler. Tokenizer'ı ve veriyi yeniden
hazırlamayı unutma:

```bash
python -m turkce_model tokenizer-egit
python -m turkce_model veri-hazirla
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

| Yol                                | Ne                                                                |
| ---------------------------------- | ----------------------------------------------------------------- |
| `ayarlar.toml`                     | tüm ayarlar; `[gomme]` senin kararların                           |
| `GOMME_KARARLARI.md`               | gömme seçenekleri, ödünleşimler, bilinen modeller                 |
| `turkce_model/metin.py`            | Türkçe büyük/küçük harf, normalleştirme, ön bölütleme             |
| `turkce_model/morfoloji.py`        | ek şablonları → ünlü uyumuna göre ek biçimleri, asıl biçim bağları |
| `turkce_model/tdk.py`              | TDK indirme, derlem, kök sözlüğü (ses değişimleri)                |
| `turkce_model/tokenizer.py`        | kök + ek tokenizer'ı, eğitimi, Türkçe ID blokları                 |
| `turkce_model/meb.py`              | MEB PDF ayrıştırıcı, TurkishMMLU, soru biçimi, bölme              |
| `turkce_model/model.py`            | GPT ve tüm gömme seçenekleri                                      |
| `turkce_model/egitim.py`           | eğitim döngüsü, kontrol noktaları, değerlendirme                  |
| `turkce_model/degerlendirme.py`    | kayıp, BPC, çoktan seçmeli doğruluk, ilerleme tablosu             |
| `turkce_model/cli.py`              | komutlar                                                          |
| `tests/`                           | sentetik veriyle birim ve uçtan uca testler                       |
