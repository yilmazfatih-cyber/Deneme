# Yatırım ajanı

Hisseleri araştıran, olasılıklı tahmin yazan, tahminlerini puanlayan, sanal parayla işlem yapan ve
Midas için emir önerisi hazırlayan kişisel bir ajan.

> **Yatırım tavsiyesi değildir.** Sistem gerçek emir göndermez. Gerçek parayla kullanmadan önce sanal
> işlemde aylarca ölçün. Başkalarının parasını yönetmek SPK lisansı gerektirir.

## Neden böyle tasarlandı

Investor's Last Exam ([arXiv 2610.38342](https://arxiv.org/abs/2610.38342)) yapay zekâ ajanlarını
"geleceği görmeden" hisse araştırmasında sınar. En iyi modeller bile araştırmada iyi, tahminde zayıf
çıkıyor. Bu proje bu bulgudan üç ders çıkarır:

1. **Zaman kilidi.** Ajan yalnız karar anına kadarki veriyi görür (`veri/zaman_kilidi.py`). Bir çubuk
   ancak bittikten sonra görünür. Geçmiş bir tarihte web araması ve anlık temel veri kapalıdır.
2. **Tahmini ölç.** Her tez "U gün içinde en az E getiri" önermesine bir olasılık verir. Vadesi
   gelince Brier skoru ve kalibrasyonla puanlanır (`tahmin/gunluk.py`). Ajan kendi karnesini görür.
3. **Dil modeli zamanlamaya karışmaz.** Dil modeli yavaş katmandır: günde bir araştırır. Dakikalık
   zamanlamayı açık kurallar yapar. Risk sınırlarını sabit kod uygular.

```
Araştırma ajanı (Claude, günlük)        →  tez: AL/TUT/SAT/İZLE + olasılık + adil değer aralığı
        │                                          │
        ▼                                          ▼
Tahmin günlüğü (Brier, kalibrasyon)       Kurallı katman (1m…1d çubuk): eğilim + zarar kes
                                                   │
                                                   ▼
                                    Risk bekçisi (sabit kural, dil modeli değil)
                                                   │
                                                   ▼
                       Sanal aracı (maliyetli dolum) + Midas emir önerisi (siz girersiniz)
```

## Kurulum

```bash
cd yatirim-ajani
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[yahoo,test]"
```

Araştırma ajanı için bir Anthropic API anahtarı gerekir:

```bash
export ANTHROPIC_API_KEY=...
```

İsterseniz ayarları kopyalayıp düzenleyin. Varsayılanlar temkinlidir.

```bash
cp ayarlar.ornek.toml ayarlar.toml
```

## Kullanım

Önce sistemin çalıştığını internetsiz, sentetik veriyle görün:

```bash
python -m yatirim_ajani geriye-test --piyasa bist --veri sentetik --baslangic 2023-01-01 --bitis 2025-12-31
```

Gerçek akış:

```bash
# 1. Sabah: hisseleri araştır, tez ve tahmin kaydet (Claude + web araması)
python -m yatirim_ajani arastir --piyasa bist --hisseler THYAO,ASELS,BIMAS

# 2. Seans boyunca: her dakika tara, sanal işlem yap, Midas önerisi yaz (raporlar/ klasörü)
python -m yatirim_ajani canli --piyasa bist --aralik 1m

# 3. Durum: sanal portföy, son tezler, tahmin karnesi
python -m yatirim_ajani rapor

# 4. Vadesi gelen tahminleri puanla
python -m yatirim_ajani coz
```

Kurallı katmanı geçmiş veriyle test etmek için:

```bash
python -m yatirim_ajani geriye-test --piyasa abd --baslangic 2022-01-01 --bitis 2025-12-31
python -m yatirim_ajani geriye-test --piyasa bist --aralik 5m --baslangic 2026-09-15 --bitis 2026-11-01
```

Ajanın geçmişte nasıl karar verirdi sorusu için zaman kilitli mod (web ve temel veri kapalı):

```bash
python -m yatirim_ajani arastir --piyasa bist --hisseler THYAO --an 2025-06-30T18:30
```

## Saatlik öğrenme (ilk ay: yalnız eğitim, gerçek para yok)

Saatlik strateji dil modeliyle değil, ölçülebilir bir modelle çalışır. Akış:

```bash
# 1. Kasım 2024'ten beri saatlik (ve son 60 gün 5 dakikalık) çubukları çek, temizle, günleri etiketle
#    (Yahoo 1 saatlik veriyi yalnız son ~730 gün verir; daha eski başlangıç otomatik sınıra çekilir)
python -m yatirim_ajani veri-cek --piyasa bist

# 2. Train günlerinde eğit, test günlerinde ölç; kaymalı saatleri (00/15/30/45) train'de kıyasla
python -m yatirim_ajani egit --piyasa bist --kayma-kiyasla

# 3. Haftalık ekip oturumu (Fable baş, Opus analist, Sonnet mühendis, Haiku stajyer)
python -m yatirim_ajani ekip --piyasa bist

# 4. Saatlik tarama: tez AL + eğilim + model kapısı (beklenen net getiri ≥ eşik) → sanal işlem + öneri
python -m yatirim_ajani canli --piyasa bist --aralik 1h --dakika 60
```

Nasıl çalışır:

- **Train/test etiketi gün bazında ve rastgeledir.** Zaman sırası bozulmaz; her işlem günü tohumlu
  rastgele %20 olasılıkla test olur ve etiket `veri/saatlik/etiketler.csv` içinde sabit kalır.
  Satır satır etiketleme yapılmaz: komşu saatlerin özellikleri birbirine sızar ve sonuç şişer.
- **Ödül = masraf sonrası net getiri.** Karar çubuk kapanışında verilir, emir sonraki çubuğun
  açılışından dolar, çubuk kapanışında çıkılır; spread + kayma + komisyon iki kez düşülür.
- **Model bir bağlamsal bandit** (ridge, numpy): AL eyleminin beklenen net getirisini öğrenir.
  Eşik (`risk.min_net_getiri`, varsayılan %0,5) modelin dışındadır; model onu gevşetemez.
  `--kayma-kiyasla` ve ridge seçimi yalnız train günlerinde yapılır; test seçime karışmaz.
- **Ödül günlüğü** (`odul_gunlugu` tablosu) her kararın tahminini ve gerçekleşen sonucunu tutar.
  Günlük büyüdükçe aynı özellik ve ödülle FinRL/PPO'ya geçilir (`ogrenme/rl.py`, `FINRL_NOTU`).
- **Kronos** (açık kaynak K-line temel modeli) için bu veri seti doğrudan girdi olabilir; ince ayar
  GPU ister ve bu depoda yapılmaz. `veri/saatlik/*.csv` dosyaları Kronos'un beklediği OHLCV biçimindedir.

Beklentiyi doğru kurun: BIST büyük hisselerinde saatlik hareket çoğunlukla %0,5–0,9'dur ve
yayımlanmış saatlik yön tahmini çalışmaları %54–56 doğrulukta kalır. Eşik bu yüzden çoğu saat
"bekle" der; günde 0–2 işlem normaldir. Rastgele yürüyüş (sentetik) veride model hiç işlem
önermez; gerçek veride de öyle çıkarsa bu bir hata değil, dürüst bir sonuçtur.

Ekip oturumu bütçesi: haftada bir oturum, en fazla 8 alt görev.

## Otomatik çalışma: GitHub Actions + Claude Code (API anahtarı gerekmez)

Dil modeli gerektirmeyen her iş GitHub Actions'ta çalışır; haftalık araştırma Claude Code'un
zamanlanmış göreviyle, aboneliğiniz üzerinden yapılır. API anahtarına gerek kalmaz.

| İş                             | Nerede                                            | Ne zaman                         |
| ------------------------------ | ------------------------------------------------- | -------------------------------- |
| Veri çekme + eğitim + karne    | `.github/workflows/yatirim-ajani.yml`             | Hafta içi 19:45 (TRT)            |
| Saatlik tarama + Midas önerisi | aynı iş akışı                                     | Hafta içi 10:20–17:20, saat başı |
| Haftalık ekip araştırması      | Claude Code zamanlanmış görevi, yönerge `EKIP.md` | Pazartesi sabahı                 |

Bütün çıktılar (`veri/`, `raporlar/`, `veri/ajan.db`) kod dallarına değil **`ajan-ciktilari`** dalına
yazılır. Haftalık rapor ayrıca bir GitHub Issue olarak açılır; telefonunuza bildirim düşer.
İşleri elle başlatmak için: Actions → "Yatırım ajanı" → Run workflow → `veri-egitim` ya da `tara`.

`ekip` komutu (API anahtarıyla çalışan sürüm) kodda durur; aboneliği aşan bir ihtiyaç olursa açılır.

## Bilgi veritabanı: sayı + anlam

`olaylar` tablosu (veri/ajan.db) Kasım 2024'ten bugüne piyasada iz bırakmış olayları hem sayısal
katsayılarla (aralık getirisi, endekse göre fark, hacim z-skoru, sonraki 5/20 gün) hem metinle
(ne oldu, yatırımcı kitlesi nasıl tepki verdi, önden görülebilir miydi, kaynaklar) tutar.

```bash
python -m yatirim_ajani bilgi-olaylar --piyasa bist      # veriden sayısal olayları çıkar
python -m yatirim_ajani bilgi-yukle bilgi_kaynak/x.json  # anlam katmanını ekle (Olay şeması: bilgi/sema.py)
python -m yatirim_ajani bilgi-sorgu --hisse ASELS --son 90
python -m yatirim_ajani bilgi-benzer --hisse ASELS       # bugünkü duruma benzeyen geçmiş olaylar, sonrası ne oldu
```

`bilgi_kaynak/` klasöründeki JSON dosyaları anlam katmanının kaynağıdır (sektör grupları + makro
zaman çizelgesi); iş akışı her akşam bunları veritabanına yeniden yükler. `docs/tersine-analiz-2026-11.md`
10 hisse için geriye bakışlı "bu hareket nereden geldi" anlatısıdır; tahmin kanıtı değildir.

## Strateji simülasyonu

```bash
python -m yatirim_ajani simule --piyasa bist
```

Al-tut, gece (kapanış→açılış), gündüz, gece+momentum, trend, haftalık momentum ve model kapılı
(ridge / numpy MLP) stratejileri 1.000.000 TL ile maliyetli simüle eder. Üç ölçüm verir: tüm dönem
(geriye bakışlı, şişkin), yalnız test günleri, ileriye yürüyen (ilk 12 ay seçim, kalanı ölçüm).
Model eşiği yalnız seçim penceresinde seçilir. Kas 2024–Kas 2026 bulgusu: kazanç gecede oluşur,
gün içi ortalaması negatiftir; her gün al-sat maliyetle ölür; hiçbir model ileriye yürüyen ölçümde
al-tut'u güvenilir biçimde geçmedi.

## İstek üzerine "bugün neye yatırılır"

Claude Code'da "Yatırım ajanı — bugün neye yatırılır" görevi elle çalıştırılır (aboneliğinizden);
yönerge `GUNLUK.md`. Çıktı: hisse bazlı olasılıklı öneri, gece taşıma kararı, bilgi veritabanından
en benzer geçmiş olay, GitHub Issue.

## Bilmeniz gerekenler

- **Midas'ın herkese açık emir API'si yok.** Bu yüzden sistem emir göndermez. `raporlar/` altına
  "şu hisseden şu kadar, şu limit fiyattan" öneri dosyası yazar; emri siz Midas'ta verirsiniz.
  Önerilerin bir kısmını uygulayıp bir kısmını atlasanız da sanal hesap hepsini uygulamış gibi
  ilerler; böylece stratejinin kendi sicili sizin seçimlerinizden bağımsız ölçülür.
  Gerçek emir API'si isteyen otomasyon için AlgoLab (Deniz Yatırım) gibi bir kurum gerekir.
  Midas bir API açarsa ya da API'li bir aracı kuruma geçerseniz `yurutme/` altına yeni bir
  yürütücü eklenir. Risk bekçisi aynı kalır.
- **Yahoo verisi sınırlıdır.** 1 dakikalık veri yalnız son 7 gün için gelir ve gecikmeli olabilir.
  Gerçek dakika seviyesi için canlı veri kaynağı gerekir. `CsvKaynak` ile kendi verinizi
  (Matriks, Foreks vb. dışa aktarımı) bağlayabilirsiniz.
- **Maliyetleri güncelleyin.** `ayarlar.py` içindeki komisyon, spread ve kayma değerleri tahmindir.
  Midas tarifenize göre düzeltin. Dakika seviyesinde kârı en çok bu maliyetler yer.
- **Geriye dönük test dil modelini çalıştırmaz.** Modelin eğitim verisi geçmişi "biliyor"
  olabilir. Ajanın gerçek tahmin becerisini yalnızca canlı tahmin günlüğü ölçer. En az 30, tercihen
  100'den fazla çözülmüş tahmin olmadan karneye güvenmeyin.
- **TL'de Sharpe yanıltıcıdır.** Yüksek enflasyonda sıfır getiri kayıptır. `--risksiz-oran` ile
  mevduat faizini girin.

## Gerçek paraya geçiş ölçütleri (öneri)

Hepsi sağlanmadan gerçek para kullanmayın:

1. En az 3 ay canlı sanal işlem.
2. Sanal portföy, masraflar sonrası göstergeyi ve eşit ağırlıklı al-tut ölçütünü geçmiş.
3. Tahmin karnesinde en az 50 çözülmüş tahmin ve beceri skoru sıfırın üstünde.
4. Zirveden en büyük düşüş, katlanabileceğiniz düzeyde.

Sonra küçük bir tutarla başlayın. Önerileri Midas'ta elle uygulamaya devam edin.

## Testler

```bash
python -m pytest -q
```

Testler gerçek API çağrısı yapmaz. Araştırma ajanı sahte bir istemciyle sınanır.
