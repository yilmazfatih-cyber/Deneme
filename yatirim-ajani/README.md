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

## Bilmeniz gerekenler

- **Midas'ın herkese açık emir API'si yok.** Bu yüzden sistem emir göndermez. `raporlar/` altına
  "şu hisseden şu kadar, şu limit fiyattan" öneri dosyası yazar; emri siz Midas'ta verirsiniz.
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
