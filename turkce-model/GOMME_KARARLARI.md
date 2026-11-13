# Gömme (embedding) kararları

Bu kararlar sana bırakıldı. `ayarlar.toml` dosyasının `[gomme]` bölümündeki her alan `"KARAR_VER"` olarak duruyor.
Eğitim de `hesapla` da on kararın hepsi dolmadan çalışmaz. Bu belge kararı vermez. Her seçeneğin ne yaptığını, neye mal
olduğunu, diğerleriyle nasıl etkileştiğini ve bilinen modellerin ne seçtiğini anlatır.

On kararın hepsi verildikten sonra (dosyada ya da hepsi `--ayar` ile), tek bir kararı değiştirmenin etkisini eğitmeden
görmek için:

```bash
python -m turkce_model hesapla                      # parametre dökümü, bellek, veri/parametre oranı, uyarılar
python -m turkce_model hesapla --olc                # + bu bilgisayarda birkaç adımla hız
python -m turkce_model hesapla --ayar gomme.boyut=384 --ayar gomme.konum=alibi   # dosyayı değiştirmeden dene
```

## Önce bağlam: veri ne kadar?

TDK Güncel Türkçe Sözlük ≈ 81 bin madde. 3 bin maddelik rastgele bir örneklemde madde başına ortalama 127 karakter ve
token başına ~3,2 karakter ölçüldü. Bu, **tüm TDK ≈ 10,3 milyon karakter ≈ 3 milyon token** demek. MEB soruları buna
kitapçık başına birkaç yüz soru ekler. Bu küçük bir veri: "Chinchilla" kuralı model parametresi başına ~20 token
önerir; 3 milyon token bu ölçüyle ~150 bin parametreyi "doyurur". Daha büyük modeller de eğitilebilir. Ama veriyi
ezberlemeye başladıkları noktayı doğrulama kaybında göreceksin (erken durdurma açık). Gömme kararlarının çoğu da
aslında bu soruya verilen cevaptır: **az veriyle hangi bilgiyi modele hazır vermek, hangisini öğrenmesine bırakmak?**

Aşağıdaki tablo, 32 000 token'lık sözlük, 6 katman ve SwiGLU ile ölçülmüştür (`hesapla` aynı sayıları verir):

| boyut | baş | gömme tablosu | 6 katman | toplam (bağlı) | toplam (ayrı) | fp32 ağırlık + AdamW |
| ----: | --: | ------------: | -------: | -------------: | ------------: | -------------------: |
|   128 |   2 |         4.1 M |    1.3 M |          5.4 M |         9.5 M |              0.09 GB |
|   256 |   4 |         8.2 M |    4.8 M |         13.0 M |        21.2 M |              0.21 GB |
|   384 |   6 |        12.3 M |   10.6 M |         22.9 M |        35.2 M |              0.37 GB |
|   512 |   8 |        16.4 M |   19.3 M |         35.7 M |        52.0 M |              0.57 GB |
|   768 |  12 |        24.6 M |   42.5 M |         67.1 M |        91.6 M |              1.07 GB |

Küçük modellerde parametrelerin çoğu gömme tablosundadır. Bu yüzden bu kararlar burada büyük modellerdekinden daha
çok şey değiştirir.

Son sütun yalnız ağırlıkları ve AdamW durumunu sayar. Eğitimde belleğin çoğunu aktivasyonlar ve çıkış logit'leri tutar
(yığın × bağlam × sözlük). Sözlük 32 000, bağlam 512 ve yığın 8 ile CPU'da en yüksek bellek 128/4 için ~3,5 GB, 256/6
için ~4,6 GB, 384/6 için ~5,5 GB ölçüldü; yığın 32 ile bunun yaklaşık dört katı gerekir. `hesapla` kendi ayarlarınla
tahmin eder.

---

## 1. `boyut` — gömme boyutu (d_model)

**Ne yapar.** Her token'ın vektörünün uzunluğu ve modelin genişliğidir. Dikkat başı sayısı `boyut / model.bas_boyutu`
(varsayılan 64) olur; bu yüzden 64'ün katı olmalı.

**Neye mal olur.** Gömme tablosu `sözlük × boyut` büyür (doğrusal), Transformer katmanları ise `~12 × boyut² × katman`
büyür (karesel). Bellek ve süre de buna göre artar.

**Etkileşimler.** `faktor_boyutu` tablonun boyutunu bundan ayırabilir. `baslatma_std = "otomatik"` bu değere bağlıdır
(1/√boyut).

**Bilinen modeller.** GPT-2 küçük 768, BERT-base 768, nanoGPT'nin Shakespeare örneği 384.

## 2. `konum` — model sıralamayı nereden bilecek?

Dikkat mekanizması kendiliğinden sıra bilmez; konum bilgisi ayrıca verilir.

| değer       | nasıl                                                            | parametre        | göreli mi | kaynak                        |
| ----------- | ---------------------------------------------------------------- | ---------------- | --------- | ----------------------------- |
| `rope`      | sorgu ve anahtar vektörleri konuma göre döndürülür               | 0                | evet      | Su vd. 2021 (RoFormer), LLaMA |
| `ogrenilen` | her konuma öğrenilen bir vektör eklenir                          | `baglam × boyut` | hayır     | GPT-2, BERT                   |
| `sinus`     | sabit sinüs/kosinüs vektörü eklenir                              | 0                | hayır     | Vaswani vd. 2017              |
| `alibi`     | dikkat puanından uzaklıkla orantılı bir ceza düşülür             | 0                | evet      | Press vd. 2022, BLOOM         |
| `yok`       | hiç; nedensel maske tek başına sıra ipucu verir                  | 0                | —         | Kazemnejad vd. 2023 (NoPE)    |

Literatürde ALiBi ve NoPE eğitimden uzun dizilere daha iyi genellenir. Bu kodda ise her tür `model.baglam`'a kadar
çalışır; üretim her adımda son `baglam` token'ı kullanır. Bu araçta hiçbir modelin bağlamı eğitimden sonra
değiştirilemez: `--devam` ve MEB aşaması mimarinin aynı kalmasını ister. `ogrenilen` ve `sinus`'ta bu ayrıca mimari
bir sınırdır, çünkü konum tablosu bağlam uzunluğundadır.

**Etkileşimler.** `sinus` ile `ogrenilen` vektörü gömmeye *eklenir*. Sinüs bileşenlerinin RMS'i ~0,71, gömmeler ise
`baslatma_std` kadardır (ör. 0,02). Bu durumda konum sinyali başta token sinyalini ~35 kat bastırır. İlk Transformer bu
yüzden gömmeyi √boyut ile çarpar (`olcek`). `hesapla` bu durumda uyarır. `rope`, `alibi` ve `yok` gömmeye dokunmaz,
dikkatin içinde çalışır.

**Türkçe açısından.** Sondan eklemeli bir dilde bir kelime birkaç token'dır (`▁kitap·lar·ımız·dan`). Göreli konum
(`rope`, `alibi`), "bu ek kökten kaç adım sonra geliyor" bilgisini mutlak konumdan bağımsız taşır.

## 3. `cikis_baglama` — giriş ve çıkış aynı tabloyu kullansın mı (weight tying)?

**Ne yapar.** Model, sonraki token'ı tahmin ederken gömme tablosunun kendisini kullanır:
`logit = h · Eᵀ`. Ayrı bir `sözlük × boyut` çıkış matrisi olmaz.

**Neye mal olur.** Kapalıysa `sözlük × boyut` kadar fazladan parametre gelir. 32 bin sözlük ve 512 boyutta bu 16,4 M
eder (tablodaki "bağlı" ve "ayrı" sütunlarının farkı).

**Etkileşimler.** `bicim_paylasimi` ile birlikte açılamaz. Paylaşımda `lar` ile `ler` aynı satırı kullanır; çıkış da bu
tabloyu kullanırsa model hangisini yazacağını (ünlü uyumunu) ayırt edemez. `faktor_boyutu` açıkken bağlama
`h · P · Eᵀ` olarak uygulanır (P: izdüşüm).

**Bilinen modeller.** Bağlı: ilk Transformer, GPT-2, BERT, Gemma. Ayrı: LLaMA 1–2. Kaynak: Press & Wolf 2017,
Inan vd. 2017. Bağlama küçük veride genelde yardım eder ama bu bir deney sorusudur.

## 4. `faktor_boyutu` — gömmeyi ikiye ayırmak (ALBERT)

**Ne yapar.** Token'lar önce küçük bir `e` boyutunda tutulur, sonra bir matrisle `boyut`a taşınır: tablo `sözlük × e`
ve izdüşüm `e × boyut`. `0` kapalı demektir.

**Neye mal olur.** 32 bin sözlük ve 512 boyutta tablo 16,4 M'den (e=128 ile) 4,1 M + 0,07 M'ye iner. Bunun karşılığında
her token'ın temsili `e` boyutlu bir alt uzaya sıkışır.

**Ne zaman anlamlı.** Sözlük büyük, veri azsa. Az görülen bir kök için 512 sayı öğrenmek yerine 128 sayı öğrenmek
daha kolaydır. TDK'nin bütün kelimelerini ayrı token yapmak istiyorsan (`tokenizer.boyut ≈ 80000`), bu karar
ağırlık kazanır.

**Bilinen modeller.** ALBERT (Lan vd. 2019) e=128.

## 5. `kategori_gommesi` — token'ın türünü söylemek (Türkçeye özgü)

**Ne yapar.** Tokenizer her token'ı bir kategoriye koyar: `ozel`, `bayt`, `harf`, `rakam`, `noktalama`, `ek`, `kok`,
`parca`. Bu seçenek, gömmeye kategorinin öğrenilen vektörünü ekler. Model bir token'ın "ek" ya da "kök" olduğunu
öğrenmek zorunda kalmaz, hazır alır. Kategoriler `sozcukler.tsv`'deki ID bloklarıdır.

Bir istisna var: tek harfli ekler (`-ı/-i/-u/-ü`, `-a/-e`, `-m`, `-n`, `-r` …) **harf** kategorisindedir. Kategori
vektörü bunlara "ek" değil "harf" der; bilinmeyen kelimeleri harf harf yazan token'larla aynı vektörü alırlar.
3 bin maddelik örneklemde kelime içindeki ek konumlarının ~%23'ü böyle bir harf token'ıdır.

**Neye mal olur.** 8 × boyut parametre, yani neredeyse bedava. Vektörler sıfırdan başlar; yararsızsa öyle kalır.

**Bilinen modeller.** BERT'in "token type" gömmesine benzer bir fikirdir, ama morfolojik kategoriyle bu repoya özgü
bir deneydir.

## 6. `bicim_paylasimi` — ses değişimli biçimler aynı satırı paylaşsın mı (Türkçeye özgü)

**Ne yapar.** Tokenizer her token için bir "ana" biçim kaydeder:

- ünlü ve ünsüz uyumu varyantları → asıl ek: `ler → lar`, `den / tan / ten → dan`, `lığ → lık`, `di → dı`
- ses değişimli kökler → asıl kök: `▁kitab → ▁kitap`, `▁ağz → ▁ağız`, `▁gid → ▁git`, `▁bekli → ▁bekle`
- boşluksuz kök biçimi → boşluklu biçim: `kitap → ▁kitap` (boşluksuz biçimler seyrektir: satır başı ve `( [ { "`
  sonrası zaten `▁kitap` olarak kodlanır)

Açıksa, bu token'lar gömme tablosunda **aynı satırı** kullanır. Üstüne 4 biçim vektöründen biri eklenir: asıl,
boşluksuz kök, ses değişimli kök ya da ek uyum biçimi. Sonuç: `lar` için öğrenilen her şey `ler`e de geçer.

**Neye mal olur.** Tablo küçülür: 3 bin maddelik örneklemle eğitilen tokenizer'da 11 154 token 10 665 satıra iner
(300 ses değişimli kök, 160 ek uyum biçimi, 29 boşluksuz kök). Tek koşul: `cikis_baglama = false`, yukarıda
açıklanan nedenle.

Tek harfli ekler paylaşıma girmez: `ı/i/u/ü` ve `a/e` harf token'larıdır, ayrı satırlarda kalırlar. İki ve daha çok
harfli uyum biçimleri (`in/un/ün → ın`, `di/du/dü → dı`) ise birleşir.

**Dilbilimsel gerekçe.** `ev-ler` ile `kitap-lar` arasındaki fark ekin anlamında değil, kökün ünlüsündedir. Girişte bu
fark zaten kökten bellidir. Çıkışta ise ayrı satırlar kalır, model doğru biçimi yazmayı öğrenir.

**Sınır.** Biçim sınıfları birbirini dışlar: hem boşluksuz hem ses değişimli bir kök, girişte `▁kitab` gibi ses
değişimli biçimle aynı vektörü alır. Bu durum çok seyrektir. Daralmış gövdeler (`▁bekli`) yalnız `-yor` önünde
kullanıldığı için fiile bağlanmaları güvenlidir.

## 7. `olcek` — gömmeyi √boyut ile çarpmak

**Ne yapar.** Gömme vektörü √boyut ile çarpılır (512'de ×22,6).

**Neden var.** İlk Transformer bağlı ağırlık + sinüs konum kullanırken gömme genliğini konum vektörlerine yaklaştırmak
için. Gemma da kullanır.

**Etkileşimler.**

- **`norm` ile.** Gömmenin ardından `norm` geliyorsa norm vektörü yeniden ölçekler. Ölçek ile norm arasında hiçbir şey
  eklenmiyorsa (`rope`, `alibi` ya da `yok` ve `kategori_gommesi = false`) çarpan neredeyse etkisiz kalır. `sinus`,
  `ogrenilen` ya da kategori vektörleri eklendiğinde ise çarpan, norm sonrasında da token vektörünün eklenen vektöre
  oranını belirler.
- **`cikis_baglama` ile.** Girişte büyüyen tablo çıkışta ölçeksiz kullanılır; `baslatma_std`'yi buna göre seç.

## 8. `norm` — gömmeden hemen sonra normalleştirme

**Ne yapar.** `layernorm` ya da `rmsnorm` gömme çıkışını ölçekler (bloklardaki normlardan ayrı).

**Neden var.** BLOOM, büyük ölçekte eğitimi kararlı kılmak için gömme LayerNorm'u ekledi; BERT de kullanır. Küçük
modelde öğrenme oranı toleransını artırabilir. Karşılığında gömme genliğinin taşıdığı bilgiyi siler.

**Bilinen modeller.** Var: BERT, BLOOM. Yok: GPT-2, LLaMA.

## 9. `baslatma_std` — gömme tablosunun başlangıç ölçeği

**Ne yapar.** Tablo `N(0, std²)` ile başlar. `"otomatik"` = 1/√boyut (512'de 0,044).

**Etkileşimler.** `olcek`, `norm` ve `cikis_baglama` ile birlikte düşün. Bağlı ağırlıkta aynı tablo ilk logit'lerin
ölçeğini de belirler. Konum ve faktör tabloları da aynı std ile başlar; izdüşüm, etkin std değişmesin diye
1/√e ile başlar. Diğer katmanlar GPT-2 gibi 0,02 ile başlar (artık yola yazanlar 0,02/√(2·katman)).

**Bilinen modeller.** GPT-2 ve BERT 0,02.

## 10. `dropout` — gömme çıkışında dropout

**Ne yapar.** Eğitimde gömme vektörünün öğelerini bu olasılıkla sıfırlar.

**Neden.** Küçük veride ezberlemeyi azaltır; çok yüksek değer öğrenmeyi yavaşlatır. Bloklardaki dropout ayrıdır
(`model.dropout`).

**Bilinen modeller.** GPT-2 ve BERT 0,1.

---

## Gömmeyi etkileyen diğer ayarlar

- `tokenizer.boyut`: tablonun satır sayısı. 32 bin, TDK köklerinin yaygın olanlarını tek token yapar. ~80 bin, sözlükte
  geçen neredeyse her kelimeyi ayrı token yapar ama nadir token'ların gömmeleri az veriyle zayıf öğrenilir.
  Değiştirirsen tokenizer'ı ve tüm modelleri yeniden eğitmen gerekir. İki sözlük boyutunu yan yana denemek için ayrı
  bir ayar dosyası kullan ve onun `[yollar] ciktilar` değerini de değiştir (README, 6. adım).
- `model.baglam`: `ogrenilen` konumda tablo `baglam × boyut` olur.
- `egitim.*.agirlik_azaltma`: tüm 2 boyutlu ağırlıklara uygulanır. Buna gömme tablosu, kategori ve biçim vektör tabloları,
  izdüşüm ve öğrenilen konum tablosu da dahildir. Yalnız 1 boyutlu norm ağırlıklarına uygulanmaz.

## Kararlarını nasıl sınarsın?

1. Bir başlangıç noktası seç ve `ayarlar.toml`'u doldur.
2. `python -m turkce_model egit --asama tdk`. Deney klasörü on kararın hepsinden ve model ayarlarından adlandırılır
   (`g384-rope-bagli-kat-s0.02-d0.1-k6-m3f2a` gibi; sondaki kısa kod diğer model ayarlarının özetidir). Böylece
   deneyler birbirinin üstüne yazmaz. Aynı deneyi baştan eğitmek için `--uzerine-yaz`, sürdürmek için `--devam` gerekir.
3. **Bir seferde tek bir kararı** değiştirip tekrar eğit. Aşağıdaki örnekte iki alan birlikte değişir, çünkü biçim
   paylaşımı çıkış bağlamayla birlikte açılamaz:

   ```bash
   python -m turkce_model egit --asama tdk --ayar gomme.bicim_paylasimi=true --ayar gomme.cikis_baglama=false
   ```

4. `ciktilar/ilerleme.md` tablosunda **BPC**'yi (karakter başına bit) karşılaştır. BPC aynı TDK doğrulama metni
   üzerinde, token sayısından ve bağlam uzunluğundan bağımsızdır; farklı sözlük boyutları ve tokenizer'lar arasında
   da adil karşılaştırma verir. `veri/ek_metin` eklemek TDK doğrulamasını değiştirmez; ek metnin BPC'si ayrı sütundadır.
5. MEB aşamasından sonra doğruluğu her zaman **rastgele tahmin tabanıyla** birlikte oku. Tablo her doğruluğu kendi
   tabanıyla yazar (4 şıklı AÖL sorularında %25, 5 şıklı TurkishMMLU'da %20).
