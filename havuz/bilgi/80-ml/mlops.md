---
baslik: "MLOps: deney kaydı, sürümleme ve canlıda izleme"
ozet: Deneyde ne kaydedilir, yeniden üretilebilirlik denetimi, veri ve model sürümleme, eğitim-sunum çarpıklığı, kayma ve başarım izleme, geri alma ve yeniden eğitim tetikleyicileri.
etiketler: [makine-ogrenmesi, mlops, izleme, kayma, surumleme, yeniden-uretilebilirlik]
duzey: orta
guncellik: 2026-11
---

# MLOps: deney kaydı, sürümleme ve canlıda izleme

> Bu notu ne zaman okumalı: bir model ilk kez canlıya çıkacakken; "geçen ayki model neden daha iyiydi?"
> sorusu yanıtlanamadığında; canlıda tahminler tuhaflaştığında; yeniden eğitim takvimi kurulurken.

## Temel fikir

Model bir kez eğitilip bırakılan bir dosya değildir. Üç şeyi bilmeden canlıda model çalıştırılmaz:

1. **Nereden geldi?** Hangi kod, hangi veri, hangi ayar ve tohumla üretildi (deney kaydı ve sürümleme).
2. **Canlıda eğitimdeki gibi mi besleniyor?** Aynı özellik kodu, aynı birimler, aynı ön işleme (eğitim-sunum çarpıklığı).
3. **Hâlâ çalışıyor mu?** Girdi dağılımı, tahmin dağılımı ve — etiket gelince — gerçek başarım izleniyor mu?

Küçük bir ekip için bunların hepsi birkaç dosya ve bir betikle yapılabilir; ağır bir platform şart değildir.

## Deney kaydı: ne kaydedilir?

| Alan | Örnek | Neden |
| --- | --- | --- |
| Kod sürümü | git işlem kimliği (+ kaydedilmemiş değişiklik var mı) | Aynı sonucu yeniden üretmek |
| Veri sürümü | Eğitim dosyalarının SHA-256 özeti, satır sayısı, tarih aralığı | "Aynı veri" iddiasını kanıtlamak |
| Ayar | Bütün hiperparametreler, özellik listesi, ayrım türü | Farkın nedenini bulmak |
| Tohum | `random_state`, kütüphane tohumları | Belirlenimcilik |
| Ortam | Python ve kütüphane sürümleri, donanım | "Bende çalışıyordu" sorununu çözmek |
| Ölçütler | CV ortalama ± std, sınama ölçütü ve güven aralığı, taban çizgisi | Karşılaştırma |
| Süre ve kaynak | Eğitim süresi, bellek | Maliyet |
| Çıktı | Model dosyası yolu ve özeti | Hangi dosyanın hangi koşudan geldiği |
| Not | "Neden bu deneme?" tek cümle | Altı ay sonra okuyacak kişi için |

Basit uygulama: her koşu `kosular.jsonl` dosyasına tek bir JSON satırı ekler. Veri özeti, veri değişince kaydın da
değişmesini sağlar:

```python calistir
import hashlib
import json

csv_text = "musteri_no,ucret,kayip\n1,250,0\n2,410,1\n3,180,0\n"
config = {"model": "HistGradientBoosting", "learning_rate": 0.1, "max_leaf_nodes": 31, "seed": 0, "split": "grup:musteri_no"}


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def run_record(data: str, cfg: dict, metrics: dict) -> dict:
    config_text = json.dumps(cfg, sort_keys=True, ensure_ascii=False)
    return {
        "veri_ozeti": digest(data),
        "veri_satir": data.count("\n") - 1,
        "ayar_ozeti": digest(config_text),
        "ayar": cfg,
        "olcutler": metrics,
        "kosu_kimligi": digest(digest(data) + config_text),
    }


first = run_record(csv_text, config, {"roc_auc_cv": [0.81, 0.02]})
changed = run_record(csv_text.replace("410,1", "410,0"), config, {"roc_auc_cv": [0.80, 0.02]})
print(json.dumps(first, ensure_ascii=False, sort_keys=True))
print(f"tek hücre değişti → veri özeti {first['veri_ozeti']} → {changed['veri_ozeti']}")
assert first["veri_ozeti"] != changed["veri_ozeti"] and first["ayar_ozeti"] == changed["ayar_ozeti"]
```

```cikti
{"ayar": {"learning_rate": 0.1, "max_leaf_nodes": 31, "model": "HistGradientBoosting", "seed": 0, "split": "grup:musteri_no"}, "ayar_ozeti": "07991133cd19", "kosu_kimligi": "2d3f9ce98964", "olcutler": {"roc_auc_cv": [0.81, 0.02]}, "veri_ozeti": "44484faef00e", "veri_satir": 3}
tek hücre değişti → veri özeti 44484faef00e → f7c61c9f6b76
```

## Yeniden üretilebilirlik denetimi

- [ ] Kod ve ayar sürümlü; koşu kaydında işlem kimliği var.
- [ ] Eğitim verisi değiştirilemez bir anlık görüntü (snapshot) olarak saklanıyor; özeti kayıtta.
- [ ] Tohumlar sabit; dosya ve küme sıraları sıralı ([hata ayıklama](egitim-hata-ayiklama.md)).
- [ ] Kütüphane sürümleri kilit dosyasıyla sabit.
- [ ] Aynı komut, temiz bir ortamda aynı ölçütü (belirlenimci olmayan GPU işlemleri dışında) veriyor.
- [ ] Model dosyası güvenli biçimde: güvenilmeyen kaynaktan gelen `pickle` dosyası kod çalıştırabilir; ağırlık
  biçimleri (`safetensors`, `.npz` + JSON) ya da `weights_only` yükleme tercih edilir.

## Veri ve model sürümleme

| Ne | Nasıl (küçük ekip için) |
| --- | --- |
| Ham veri | Tarihli, salt-okunur klasör; değişiklik yeni klasör demektir |
| Eğitim kümesi | Hangi ham veriden, hangi sorguyla üretildiği + özeti; ayrım tohumu |
| Özellik kodu | Eğitim ve sunum için **tek** bir modül |
| Model | `modeller/<ad>/<sürüm>/`: model dosyası, ayar, ölçütler, model kartı, veri özeti |
| Kayıt defteri | Tek bir tablo: sürüm, tarih, veri özeti, ana ölçüt, durum (deneme / canlı / emekli) |

Sürüm atlamadan önce yeni model, **aynı sınama kümesinde** canlıdaki modelle karşılaştırılır (şampiyon ↔ aday) ve
fark güven aralığıyla yazılır.

## Eğitim-sunum çarpıklığı

Model eğitimde gördüğü özellikleri canlıda farklı biçimde alırsa sessizce yanlış tahmin yapar. Tipik nedenler: birim
farkı (TL ↔ bin TL), farklı eksik değer varsayılanı (ortalama ↔ −1), büyük/küçük harf, saat dilimi, özellik
hesabının eğitimde toplu, canlıda anlık yapılması. Bir yayından sonra gelir alanının bin TL olarak gönderilmeye
başladığını düşünelim; izleme bunu ilk gün yakalar:

```python calistir
import bisect
import math
import random
import statistics

random.seed(44)
risk = lambda income: 1 / (1 + math.exp(-(1 - income / 15_000)))  # canlıdaki model
reference = [random.lognormvariate(9.8, 0.4) for _ in range(5000)]  # eğitimdeki gelir (TL)
edges = statistics.quantiles(reference, n=10)  # referansın onda birlik sınırları


def psi(new):
    def shares(values):
        counts = [0] * 10
        for v in values:
            counts[bisect.bisect_right(edges, v)] += 1
        return [max(c / len(values), 1e-4) for c in counts]
    ref, cur = shares(reference), shares(new)
    return sum((c - r) * math.log(c / r) for r, c in zip(ref, cur))


print("gün  gelir PSI  ortalama tahmin")
for day in range(1, 8):
    incomes = [random.lognormvariate(9.8, 0.4) for _ in range(800)]
    if day >= 6:  # 6. gün yayın: gelir bin TL olarak gelmeye başladı
        incomes = [x / 1000 for x in incomes]
    print(f"{day:3d}  {psi(incomes):9.2f}  {statistics.fmean(risk(x) for x in incomes):15.2f}")
```

```cikti
gün  gelir PSI  ortalama tahmin
  1       0.01             0.43
  2       0.01             0.43
  3       0.01             0.44
  4       0.01             0.43
  5       0.02             0.43
  6       8.28             0.73
  7       8.28             0.73
```

Korunma yolları:

- Özellik kodu tek yerde; eğitim ve sunum aynı fonksiyonu çağırır.
- **Eşlik testi:** aynı ham satır eğitim hattından ve sunum hattından geçirilip aynı tahmini vermeli (birim testi).
- Canlı girdiler ve tahminler örneklenip kaydedilir; günlük olarak eğitim dağılımıyla karşılaştırılır.
- Girdi şeması sınırda doğrulanır (tür, birim, aralık): "gelir 100'den küçük" gibi bir kural bu hatayı anında yakalar.

## Canlıda izleme

| Ne izlenir | Nasıl | Ne zaman alarm |
| --- | --- | --- |
| Veri kalitesi | Eksik oranı, şema, aralık dışı değer | Eksik oranı referansın belirgin üstünde; şema hatası |
| Girdi kayması | Sütun başına PSI ya da KS | PSI için yaygın kural (kesin eşik değildir): < 0,1 küçük, 0,1–0,25 orta, > 0,25 büyük |
| Tahmin dağılımı | Ortalama tahmin, pozitif oranı, skor yüzdelikleri | Belirgin sıçrama (çoğu zaman ilk belirti) |
| Gerçek başarım | Etiket gelince ana ölçüt ve kalibrasyon | Kabul eşiğinin altına iniş |
| İş ölçütü | Dönüşüm, kurtarılan gelir, şikâyet | Hedeften sapma |
| Alt gruplar | Bölge, kanal, cihaz bazında başarım | Bir grupta ayrışma ([model kartı](model-karti-ve-sorumluluk.md)) |
| Sistem | Gecikme, hata oranı, zaman aşımı | Hizmet düzeyi hedefi |

Etiket çoğu zaman gecikir (kayıp 30 gün sonra belli olur). Bu yüzden ilk savunma girdi ve tahmin dağılımıdır;
gerçek başarım geldikçe eklenir. Kayma her zaman kötü değildir: başarım düşmüyorsa yalnız not edilir.

## Geri alma ve yeniden eğitim

**Geri alma** önceden planlanır: önceki model dosyası ve ayarı hazır durur; geçiş bir ayar değişikliğidir, yeni
yayın değildir. Yeni model önce **gölge** kipte (tahmin üretir, kullanılmaz) ya da trafiğin küçük bir kısmında
(kanarya) çalışır; geri alma ölçütleri ("ortalama tahmin %X oynarsa", "hata oranı > Y") önceden yazılır.

| Yeniden eğitim tetikleyicisi | Not |
| --- | --- |
| Takvim (ayda bir) | Basit ve öngörülebilir; kayma hızına göre seçin |
| Kayma eşiği aşıldı | Önce nedenini bulun: veri hatası mı, gerçek değişim mi? Veri hatasını yeniden eğitimle "düzeltmeyin" |
| Başarım düşüşü | En güçlü işaret; etiket gecikmesini hesaba katın |
| Yeterli yeni etiket birikti | Özellikle az veriyle başlanan işlerde |
| İş kuralı ya da ürün değişti | Hedef tanımı değiştiyse yeniden çerçeveleyin |

Her yeniden eğitim aynı değerlendirmeden geçer; yeni model canlıdakini aynı sınamada geçmiyorsa yayına alınmaz.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Geçen ayki sonucu üretemiyoruz" | Veri ya da ayar sürümü kaydedilmemiş | Koşu kaydı: veri özeti, ayar, tohum, işlem kimliği |
| Canlıda ortalama tahmin bir gecede değişti | Eğitim-sunum çarpıklığı (birim, varsayılan, sürüm) | Eşlik testi; şema doğrulama; tahmin dağılımı alarmı |
| Kayma alarmı yağıyor, başarım iyi | Önemsiz sütunlarda doğal kayma | Alarmı önemli sütunlara ve tahmin dağılımına odaklayın |
| Başarım düştü, kimse fark etmedi | Etiket gelince ölçüt hesaplanmıyor | Gecikmeli etiketle otomatik başarım raporu |
| Yeniden eğitim sonrası model kötüleşti | Değerlendirmesiz otomatik yayın | Şampiyon ↔ aday karşılaştırması zorunlu |
| Geri almak saatler sürdü | Önceki model ve ayarı hazır değildi | Sürümlü model klasörü; geçiş = ayar değişikliği |
| Model dosyası açılınca beklenmedik kod çalıştı | Güvenilmeyen `pickle` | Ağırlık biçimleri; güvenli yükleme |
| Kayıtlarda kişisel veri birikti | Girdiler olduğu gibi günlüğe yazıldı | Maskeleme; saklama süresi ([model kartı](model-karti-ve-sorumluluk.md)) |

## Denetim listesi

- [ ] Her koşu bir kayıt satırı bırakıyor: işlem kimliği, veri özeti, ayar, tohum, sürümler, ölçütler, süre.
- [ ] Eğitim verisi anlık görüntüsü değiştirilemez biçimde saklanıyor.
- [ ] Özellik kodu eğitim ve sunumda ortak; eşlik testi var.
- [ ] Canlı girdiler sınırda şemayla (tür, birim, aralık) doğrulanıyor.
- [ ] Girdi kayması, tahmin dağılımı ve (etiket gelince) başarım izleniyor; alarm eşikleri yazılı.
- [ ] Önceki model geri alınmaya hazır; geri alma ölçütleri yazılı.
- [ ] Yeniden eğitim tetikleyicileri ve şampiyon ↔ aday değerlendirmesi tanımlı.
- [ ] Günlüklerde kişisel veri maskeli; saklama süresi belirli.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her eğitim koşusu `kosular.jsonl` dosyasına bir satır eklesin: git işlem kimliği, veri
  dosyalarının SHA-256 özeti, bütün ayarlar, tohum, Python ve kütüphane sürümleri, CV ve sınama ölçütleri. Özellik
  hesaplamasını tek bir modülde topla; eğitim ve tahmin aynı fonksiyonu çağırsın; aynı satırın iki yoldan aynı
  tahmini verdiğini sınayan bir test yaz."
- **Modelin tipik hatası:** Tahmin servisinde özellikleri yeniden (biraz farklı) yazar; ölçütleri yalnız konsola basar;
  model dosyasını `pickle` ile kaydedip güvenilmeyen yerden yükler; izlemeyi "sonra eklenir" diye bırakır.
- **Çıktıda denetleyin:** özellik kodunun tek kaynağı; koşu kaydında veri özeti; şema doğrulaması; tahmin dağılımı
  izleme betiği; geri alma adımı.

## İlgili

- [Eğitim hata ayıklama](egitim-hata-ayiklama.md) — tohum ve yeniden üretilebilirlik · [Veri ve etiket](veri-ve-etiket.md) — kayma türleri
- [Model kartı ve sorumlu kullanım](model-karti-ve-sorumluluk.md) · [Aykırı değer ve anomali](aykiri-deger-ve-anomali.md) — alarm tasarımı
- PSI ve KS ile kayma: [`verihavuzu/kalite/drift.py`](../../veri/verihavuzu/kalite/drift.py) (`python -m verihavuzu kayma ref.csv yeni.csv`)
- Koşu çıktıları (ayar, sürümler, tohum, süre): [`ince_ayar/runs.py`](../../ince-ayar/ince_ayar/runs.py); eğitim kaydı örneği:
  [`dil-modeli/ornek-model/egitim-kaydi.json`](../../dil-modeli/ornek-model/egitim-kaydi.json)
- Pickle'sız model dosyası: [`ml_temel/persistence.py`](../../ml-temel/ml_temel/persistence.py); kesintiye dayanıklı
  eğitim durumu: [`dil_modeli/train_state.py`](../../dil-modeli/dil_modeli/train_state.py)
- Dağıtım: [Yayın yolu seçimi](../60-devops/yayin-yolu-secimi.md); izleme altyapısı: `60-devops` kümesi
