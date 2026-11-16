# Eğitim rehberi

## 1. Kendi verinizle eğitim

1. **Metni toplayın.** `.txt` (dosya başına bir belge; `--satir-belge` ile her satır bir belge),
   `.md` ya da `.jsonl` (`{"text": "..."}`; başka alan adı için `--alan`). Bir klasör verirseniz
   içindeki bütün `.txt/.md/.jsonl` dosyaları sırayla okunur. Eski Türkçe dosyalar için
   `--kodlama cp1254`. Metin Unicode NFC'ye çevrilir (ayrık yazılmış `ğ` gibi harfler birleşir).
2. **Temizleyin.** Model ne görürse onu üretir: menü/çerez metinleri, tekrar eden alt bilgiler,
   bozuk kodlama (`Ã¼` gibi) ve kişisel veri (ad, telefon, e-posta) eğitimden önce çıkarılmalı.
   Aynı belgenin kopyaları ezberlemeyi artırır.
3. **Tokenizer:** `python -m dil_modeli tokenizer-egit --girdi veri/ham --cikti calisma/tok.json --sozluk 8192`
   - Sözlük: 4.096 (CPU, çok küçük model) · 8.192 (genel) · 16.384–32.000 (büyük veri ve GPU).
     Büyük sözlük metni daha az belirteçle yazar (Türkçe Vikipedi'de ölçüm: 4.096 → 3,21; 8.192 →
     3,72; 16.384 → 4,20 karakter/belirteç) ama çıkış katmanı büyür ve küçük modelde yavaşlatır.
   - Yüzlerce MB üstü metinde `--hizli` (aynı sonucu `tokenizers` ile üretir).
4. **Veri:** `python -m dil_modeli veri-hazirla --girdi veri/ham --tokenizer calisma/tok.json --cikti veri/hazir`
   Çıktıdaki "karakter/belirteç" oranına bakın; 2'nin altındaysa tokenizer bu metne uymuyor demektir.
5. **Eğitim:** `yapilandirma/cpu-deneme.toml`'u kopyalayıp `data_dir`'i değiştirin, sonra
   `python -m dil_modeli egit --yapilandirma yapilandirma/benim.toml`. Tek seferlik değişiklik için
   `--ayar max_steps=2000 --ayar model.dim=192`.
6. **İzleyin:** konsolda her `log_every` adımda kayıp ve belirteç/sn; her `eval_every` adımda doğrulama
   kaybı ve örnek metin. Grafik: `python -m dil_modeli rapor --egitim <out_dir>`.
7. **Kullanın:** en iyi model `<out_dir>/en-iyi/`, son durum `<out_dir>/son/`.

## 2. Model boyutu ↔ veri miktarı ↔ süre (TAHMİN)

> Bu tablo **tahmindir**; yalnız CPU satırı bu depoda ölçülen hıza dayanır. Nasıl hesaplandı:
> eğitim işlemi ≈ 6 × parametre × belirteç kayan nokta işlemi (yaygın kural). Belirteç sayısı
> "parametre başına 20 belirteç" (Chinchilla kuralı; işlem bütçesine göre verimli nokta) ile seçildi.
> CPU hızı: `bebek` + 4.096 sözlük, 2 iş parçacığında ölçülen 9.600 belirteç/sn → ~77 milyar işlem/sn;
> diğer boyutlara aynı oranla taşındı. GPU hızları ölçülmedi: T4 için ~10, RTX 4090 için ~40
> trilyon işlem/sn etkin hız varsayıldı (tepe hızın kabaca %15–25'i). Metin boyutu: 8.192 sözlükte
> 3,7 karakter/belirteç ve Türkçe UTF-8'de ~1,1 bayt/karakter → 1 milyon belirteç ≈ 4 MB metin.

| Boyut (8.192 sözlük) | Parametre | Belirteç (20×) | Metin  | CPU, 2 iş parçacığı | Colab T4 | RTX 4090 |
| -------------------- | --------- | -------------- | ------ | ------------------- | -------- | -------- |
| `bebek`              | 1,9 M     | 37 M           | ~150 MB | ~1,5 saat          | < 1 dk   | < 1 dk   |
| `mini`               | 5,3 M     | 106 M          | ~430 MB | ~12 saat           | ~6 dk    | ~2 dk    |
| `kucuk`              | 29,5 M    | 590 M          | ~2,4 GB | ~2 hafta (önerilmez) | ~3 saat | ~45 dk   |
| `orta`               | 91 M      | 1,8 milyar     | ~7 GB  | —                   | ~1 gün   | ~7 saat  |

Pratik notlar:

- Metniniz az ise aynı veriyi 2–4 tur görmek genelde zararsızdır; daha fazlası ezberletir.
- Küçük modeller 20×'ten çok daha fazla veriyle iyileşmeyi sürdürür; süre bütçeniz varsa artırın.
- Depodaki örnek model 1,33 M parametreyle yalnız 6,5 M belirteç gördü (5×); kaybı hâlâ iniyordu.
- Başlangıç öğrenme oranları (yaygın uygulama, tahmin): `bebek` 2e-3 · `mini` 1e-3 ·
  `kucuk` 6e-4 · `orta` 3e-4. Etkin yığını (batch_size × grad_accum × seq_len) büyüttükçe
  biraz artırılabilir; NaN görürseniz yarıya indirin.

## 3. Kayıp eğrisini okuma

- **Başlangıç:** rastgele model ≈ `ln(sözlük)` kayıpla başlar (4.096 → 8,3; 8.192 → 9,0). Çok
  farklıysa başlatma ya da veri bozuktur.
- **Şaşkınlık** = `e^kayıp`: model her adımda ortalama kaç belirteç arasında kararsız. Sözlüğe
  bağlıdır; farklı tokenizer'lı modelleri **karakter başına bit** ile karşılaştırın
  (`python -m dil_modeli degerlendir --girdi metin.txt`).
- **Sağlıklı eğri:** eğitim ve doğrulama birlikte iner, aralarında küçük bir fark kalır.
  Isınma bitince hızlı düşüş, sonra yavaş iyileşme beklenir; kosinüsün sonunda eğri düzleşir.
- **Ezberleme:** eğitim kaybı inerken doğrulama kaybı yükselir. `en-iyi/` zaten en düşük doğrulama
  kaybındaki modeli tutar; daha çok veri, daha küçük model, `model.dropout=0.1` deneyin.
- **Örnek metinler** sayıdan çok şey söyler: önce harf yığınları, sonra kelimeler, sonra ekler ve
  noktalama, en son anlamlı cümleler gelir.

## 4. Sık sorunlar

| Belirti | Olası neden | Ne yapmalı |
| ------- | ----------- | ---------- |
| `Kayıp sayı olmaktan çıktı (NaN/sonsuz)` | öğrenme oranı yüksek; fp16 taşması | `--ayar learning_rate=...` yarıya; `grad_clip=1.0`; GPU'da `precision="bf16"` ya da `"fp32"` |
| Kayıp `ln(sözlük)` civarında kalıyor (öğrenmiyor) | öğrenme oranı çok düşük/yüksek; veri tek tip | `rapor` ile eğriye bakın; lr'yi 3 kat değiştirip 200 adım deneyin; `veri-hazirla` çıktısındaki belirteç sayısını denetleyin |
| Doğrulama kaybı yükseliyor | ezberleme | daha çok veri / küçük model / dropout; erken durun |
| `… pencere için yetmiyor` | metin çok az | daha çok metin ya da `--ayar seq_len=64` |
| Bellek yetmiyor (GPU: `CUDA out of memory`) | yığın büyük | `batch_size`'ı yarıya, `grad_accum`'u iki katına (etkin yığın aynı kalır); `seq_len`'i kısaltın |
| Çok yavaş (CPU) | iş parçacığı, sözlük | `threads` ayarı; daha küçük sözlük; `seq_len=128` |
| Eğitim yarıda kaldı | elektrik, Colab | aynı komuta `--surdur` (aynı `out_dir`) |
| `Sürdürülen eğitimin model biçimi … farklı` | ayar dosyası değişti | aynı ayarla sürdürün ya da yeni `out_dir` |
| Üretim hep aynı satırı yineliyor | küçük model, açgözlü üretim | `--sicaklik 0.8 --top-p 0.95 --yineleme-cezasi 1.1` |

## 5. Sohbet ince ayarı (LoRA)

Biçim: her satır `{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."},
{"role": "assistant", "content": "..."}]}`. Kayıp yalnız asistan yanıtlarında hesaplanır.

```bash
python -m dil_modeli ince-ayar --model calisma/benim/en-iyi --veri sohbet.jsonl --cikti calisma/ince --adim 300
python -m dil_modeli sohbet --model calisma/ince/birlesik --sistem "Kısa ve nazik yanıt ver."
```

Veri lisansı önemlidir: Hugging Face'te Türkçe talimat veri kümeleri vardır; ör.
`merve/turkish_instructions` HF etiketinde `apache-2.0` görünür (yükleyicinin beyanı; içeriğin
nasıl üretildiği ve biçimi **doğrulanmadı**). Bir veri kümesini kullanmadan önce kartını okuyun,
lisansını kaydedin ve satırları yukarıdaki `messages` biçimine çevirin. Önce temel modeli yeterince
eğitin: depodaki 1,3 M parametreli örnek model sohbet öğrenecek kadar büyük değildir.

## 6. GPU'da (denenmedi)

`yapilandirma/colab-t4.toml` ve `tek-gpu-24gb.toml` hazırdır. `device="auto"` CUDA'yı seçer;
`precision="auto"` bf16 destekleyen kartta bf16, T4'te fp16 + gradyan ölçekleyici kullanır;
`compile=true` ilk adımlarda derleme yaptığı için başta yavaştır. Bu yollar CPU'lu makinede
yazıldı; ilk koşuda 50 adımlık kısa bir deneme yapın (`--ayar max_steps=50`).
