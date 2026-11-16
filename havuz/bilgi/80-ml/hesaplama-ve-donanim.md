---
baslik: Hesaplama ve donanım
ozet: Parametre sayısından bellek ve süre tahmini, CPU ile GPU seçimi, yığın boyutu ve sayısal duyarlık ödünleşimi, ücretsiz bulut defterleriyle çalışma düzeni ve denetim noktasıyla kesintiye dayanıklı eğitim.
etiketler: [makine-ogrenmesi, donanim, bellek, gpu, denetim-noktasi, duyarlik]
duzey: orta
guncellik: 2026-11
---

# Hesaplama ve donanım

> Bu notu ne zaman okumalı: bir modeli eğitmeden ya da çalıştırmadan önce "sığar mı, ne kadar sürer?"
> sorusunda; GPU kiralamaya ya da ücretsiz bir bulut defteri kullanmaya karar verirken; eğitim yarıda kesildiğinde.

## Temel fikir

İki kaba hesap çoğu kararı verdirir:

- **Bellek ≈ ağırlıklar + gradyanlar + en iyileyici durumu + etkinleştirmeler + sabit pay.** Yalnız çalıştırmak
  (çıkarım) için ağırlıklar ve KV önbelleği yeter; eğitimde AdamW parametre başına ~16 bayt ister.
- **Eğitim hesabı ≈ 6 × parametre × belirteç** kayan nokta işlemi; süre = hesap / donanımın **etkin** hızı (tepe
  hızın bir kısmı). Dil modeli metin üretirken ise sınır çoğu zaman hesap değil **bellek bant genişliğidir**: her
  belirteçte bütün ağırlıklar bir kez okunur.

Bunlar tahmindir; sınırdaysanız birkaç adımlık kısa bir koşuyla ölçün.

## Bellek tahmini

```python calistir
GiB = 2**30


def estimate(params: float, lora_share: float = 0.005) -> dict[str, float]:
    lora = params * lora_share  # varsayım: LoRA parametresi toplamın ~%0,5'i (yapıya ve r'ye göre değişir)
    return {
        "çıkarım fp16": params * 2 / GiB,
        "çıkarım 4 bit": params * 0.55 / GiB,  # 4 bit + ölçek payı, kaba
        "tam ince ayar": (params * 2 + params * 16) / GiB,  # bf16 ağırlık + (fp32 ağırlık, gradyan, 2 moment)
        "LoRA (bf16)": (params * 2 + lora * 16) / GiB,
        "QLoRA (4 bit)": (params * 0.55 + lora * 16) / GiB,
    }


print(f"{'model':<6s}  " + "  ".join(f"{k:>13s}" for k in estimate(1)))
for name, params in (("125M", 125e6), ("1,1B", 1.1e9), ("7B", 7e9)):
    print(f"{name:<6s}  " + "  ".join(f"{v:9.1f} GiB" for v in estimate(params).values()))
```

```cikti
model    çıkarım fp16  çıkarım 4 bit  tam ince ayar    LoRA (bf16)  QLoRA (4 bit)
125M          0.2 GiB        0.1 GiB        2.1 GiB        0.2 GiB        0.1 GiB
1,1B          2.0 GiB        0.6 GiB       18.4 GiB        2.1 GiB        0.6 GiB
7B           13.0 GiB        3.6 GiB      117.3 GiB       13.6 GiB        4.1 GiB
```

Tabloya eklenmesi gerekenler: **etkinleştirmeler** (yığın × dizi uzunluğu × gizli boyut × katman ile büyür;
gradyan denetimi bunu belirgin azaltır), **KV önbelleği** (uzun bağlamda çıkarımın asıl yükü;
[transformer](transformer.md)), **sabit pay** (CUDA bağlamı ya da Python + kütüphaneler; ~1 GB). Havuzdaki
`ince-ayar` temelinin `egit --kuru` komutu bu kalemleri gerçek model yapısından hesaplar.

## Süre tahmini

Havuzda ölçülmüş bir değer: `dil-modeli` temelinin en küçük modeli, 2 iş parçacıklı CPU'da ~9.600 belirteç/sn,
yani ~77 milyar işlem/sn etkin hız. GPU hızları **ölçülmedi**, varsayımdır (aynı belgedeki varsayımlar):

```python calistir
EFFECTIVE = {"CPU, 2 iş parçacığı (ölçülen)": 7.7e10, "T4 sınıfı GPU (varsayım)": 1e13, "24 GB oyun kartı (varsayım)": 4e13}


def human(seconds: float) -> str:
    for unit, size in (("gün", 86400), ("saat", 3600), ("dk", 60)):
        if seconds >= size:
            return f"{seconds / size:.1f} {unit}"
    return f"{seconds:.0f} sn"


for name, params in (("5,3 M", 5.3e6), ("29,5 M", 29.5e6), ("91 M", 91e6)):
    tokens = 20 * params  # parametre başına ~20 belirteç (yaygın kural)
    flops = 6 * params * tokens
    cells = [f"{human(flops / speed):>9s}" for speed in EFFECTIVE.values()]
    print(f"{name:7s} {tokens / 1e6:6.0f} M belirteç: " + "  ".join(cells))
print("sütunlar:", " | ".join(EFFECTIVE))
```

```cikti
5,3 M      106 M belirteç: 12.2 saat     5.6 dk     1.4 dk
29,5 M     590 M belirteç:  15.7 gün   2.9 saat    43.5 dk
91 M      1820 M belirteç: 149.4 gün    1.2 gün   6.9 saat
sütunlar: CPU, 2 iş parçacığı (ölçülen) | T4 sınıfı GPU (varsayım) | 24 GB oyun kartı (varsayım)
```

Çıkarım hızı için kaba üst sınır: **belirteç/sn ≈ bellek bant genişliği / model boyutu**. 4 bitlik 7B bir model
(~3,6 GiB), saniyede 50 GB okuyabilen bir bellekte en çok ~13 belirteç/sn üretir; kendi donanımınızın bant
genişliğini koyarak hesaplayın (bu değer varsayımdır).

## CPU mı, GPU mu?

| İş | Seçim | Neden |
| --- | --- | --- |
| Tablo verisi, ağaç toplulukları, doğrusal modeller | CPU | Bu işler GPU'dan az fayda görür; milyonlarca satırda bile CPU yeter |
| Küçük sinir ağı (≤ birkaç milyon parametre), deneme | CPU | Kurulum maliyeti yok; dakikalar içinde biter |
| Transformer eğitimi ya da tam ince ayar | GPU | Hesap 100–1000 kat fazla |
| LoRA ince ayarı (≤ birkaç milyar parametre) | Tek GPU (gerekirse 4 bit) | Bellek tahminine bakın |
| Küçük dil modelini çalıştırma (nicemlenmiş) | CPU ya da dizüstü | Bant genişliği sınırlı ama kullanılabilir; ayrıntı `85-llm` kümesinde |
| Çok sayıda metni gömme | GPU varsa GPU; yoksa CPU'da toplu ve gece | Toplu işte GPU büyük hızlanma sağlar |
| Veri hazırlama, özellik çıkarma | CPU | GPU'yu bekletmeyin: veri önceden hazırlansın |

## Yığın boyutu ve duyarlık

| Duyarlık | Bayt | Eğitim | Çıkarım | Dikkat |
| --- | --- | --- | --- | --- |
| fp32 | 4 | Güvenli varsayılan; CPU'da tek seçenek | Gereksiz büyük | — |
| bf16 | 2 | Destekleyen GPU'da önerilen karışık duyarlık | İyi | Aralığı fp32 gibi geniş, hassasiyeti düşük |
| fp16 | 2 | Kayıp ölçekleyiciyle | İyi | Dar aralık: taşma → `inf`/`nan`; ölçekleyici şart |
| int8 | 1 | Genelde değil | İyi (kalite kaybı çoğu zaman küçük; ölçün) | Nicemleme sonrası değerlendirin |
| 4 bit | ~0,5 | Yalnız dondurulmuş taban + LoRA (QLoRA) | Küçük donanımda dil modeli | Kalite kaybını kendi işinizde ölçün |

Bellek yetmediğinde sırayla: yığını yarıya indirip **gradyan biriktirmeyi** iki katına çıkarın (etkin yığın aynı
kalır), dizi uzunluğunu kısaltın, gradyan denetimini (gradient checkpointing; hesabı biraz yavaşlatır) açın, bf16'ya
geçin, LoRA ya da 4 bit kullanın.

Gradyan biriktirmenin doğru yazımı: her küçük yığının kaybı **biriktirme adımı sayısına bölünür**:

```python calistir
import math
import random

random.seed(48)
data = [(x, 3 * x + random.gauss(0, 1)) for x in (random.gauss(0, 1) for _ in range(32))]
w = 0.5


def grad(batch):  # ortalama kare hatanın w'ye göre gradyanı
    return sum(2 * (w * x - y) * x for x, y in batch) / len(batch)


full = grad(data)  # 32'lik tek yığın
correct = sum(grad(data[i:i + 8]) / 4 for i in range(0, 32, 8))  # 4 × 8, her biri /4
forgot = sum(grad(data[i:i + 8]) for i in range(0, 32, 8))  # HATA: bölme unutuldu
print(f"tek yığın {full:.4f} | biriktirme (doğru) {correct:.4f} | bölme unutuldu {forgot:.4f}")
assert math.isclose(full, correct) and math.isclose(forgot, 4 * full)
```

```cikti
tek yığın -3.3532 | biriktirme (doğru) -3.3532 | bölme unutuldu -13.4127
```

Bölme unutulursa gradyan biriktirme adımı kadar büyür; bu, öğrenme oranını gizlice o kadar artırmak demektir.

## Ücretsiz bulut defterleriyle çalışma düzeni

Ücretsiz defter hizmetlerinin süre, GPU türü ve kota kuralları sık değişir ve garanti değildir (Kasım 2026,
doğrulanmadı). Kuraldan bağımsız iyi düzen:

1. **Önce yerelde, küçükte:** kodu CPU'da birkaç adımla çalıştırıp hatasız olduğunu görün; deftere yalnız ağır işi
   taşıyın.
2. **İlk koşu 50 adım:** GPU, duyarlık ve bellek ayarlarını kısa bir koşuyla doğrulayın.
3. **Kalıcı depolama:** oturum kapanınca disk silinir; denetim noktalarını bağlı bir sürücüye ya da model deposuna
   düzenli yazın.
4. **Sürümleri sabitleyin:** kurulumu kilit dosyasından yapın; defterin önceden kurulu sürümlerine güvenmeyin.
5. **Sırları defterde tutmayın:** erişim anahtarını hizmetin gizli değişken özelliğiyle verin; defteri paylaşmadan
   önce çıktı hücrelerini temizleyin.
6. **Kesintiyi varsayın:** her eğitim `--surdur` ile kaldığı yerden devam edebilmeli (aşağıda).

## Kesintiye dayanıklı eğitim

Denetim noktası (checkpoint) yalnız ağırlık değildir; bire bir sürdürme için: ağırlıklar, en iyileyici durumu
(momentler), öğrenme oranı çizelgesinin konumu, karışık duyarlık ölçekleyicisi, adım sayısı, en iyi doğrulama
değeri ve rastgelelik. En sağlam yol, yığın seçimini ve öğrenme oranını **adım numarasının saf fonksiyonu** yapmaktır;
dosya da **atomik** yazılır (önce geçici dosya, sonra yeniden adlandırma), böylece yarım dosya kalmaz:

```python calistir
import json
import os
import random
import tempfile

DATA = [(x / 50, 2 * x / 50 + 1) for x in range(-50, 50)]


def train(steps, folder, stop_at=None, seed=7):
    path = os.path.join(folder, "durum.json")
    state = {"step": 0, "w": 0.0, "b": 0.0, "m_w": 0.0, "m_b": 0.0}
    if os.path.exists(path):  # sürdür
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
    while state["step"] < steps:
        rng = random.Random(seed * 1_000_003 + state["step"])  # yığın, adımın saf fonksiyonu
        batch = rng.sample(DATA, 8)
        lr = 0.1 * (1 - state["step"] / steps)  # öğrenme oranı da adımın fonksiyonu
        gw = sum(2 * (state["w"] * x + state["b"] - y) * x for x, y in batch) / 8
        gb = sum(2 * (state["w"] * x + state["b"] - y) for x, y in batch) / 8
        state["m_w"], state["m_b"] = 0.9 * state["m_w"] + gw, 0.9 * state["m_b"] + gb
        state["w"] -= lr * state["m_w"]
        state["b"] -= lr * state["m_b"]
        state["step"] += 1
        with tempfile.NamedTemporaryFile("w", dir=folder, delete=False, encoding="utf-8") as tmp:
            json.dump(state, tmp)
        os.replace(tmp.name, path)  # atomik: ya eski dosya ya yeni dosya, yarım dosya asla
        if state["step"] == stop_at:
            return None  # "elektrik kesildi"
    return state


with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
    uninterrupted = train(100, a)
    train(100, b, stop_at=60)
    resumed = train(100, b)
print(f"kesintisiz:  w={uninterrupted['w']:.6f} b={uninterrupted['b']:.6f}")
print(f"60'ta kesilip sürdürülen: w={resumed['w']:.6f} b={resumed['b']:.6f}")
assert uninterrupted == resumed
```

```cikti
kesintisiz:  w=2.009416 b=1.001266
60'ta kesilip sürdürülen: w=2.009416 b=1.001266
```

Momentler (`m_w`, `m_b`) kaydedilmeseydi sürdürülen eğitim farklı bir yere giderdi; en sık yapılan hata yalnız
ağırlıkları kaydetmektir. Kural: "N adım" ile "N/2 + sürdür + N/2" aynı sonucu vermeli; bunu bir testle koruyun.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Eğitim başlar başlamaz `out of memory` | Ağırlık + en iyileyici durumu hesaplanmadı | Bellek tahmini; LoRA, 4 bit, daha küçük model |
| Birkaç adım sonra `out of memory` | Etkinleştirmeler, en uzun örnek geldiğinde | Dizi uzunluğu sınırı; yığın ↓ biriktirme ↑; gradyan denetimi |
| fp16'da kayıp `nan` | Dar sayı aralığında taşma | Kayıp ölçekleyici ya da bf16 |
| GPU kullanımı düşük, eğitim yavaş | Veri hazırlama darboğazı | Veriyi önceden belirteçleyin; yükleyici işçisi |
| Sürdürülen eğitim farklı sonuç veriyor | En iyileyici/çizelge/rastgelelik durumu kaydedilmedi | Tam durum + adımın saf fonksiyonu olan yığın seçimi |
| Denetim noktası bozuk, açılmıyor | Yazma sırasında kesinti | Atomik yazma (geçici dosya + yeniden adlandırma) |
| Defter oturumu kapandı, her şey gitti | Yerel diskte saklandı | Bağlı sürücü ya da model deposuna düzenli yazma |
| Nicemlenmiş model beklenenden kötü | 4/8 bit kaybı bu işte büyük | Nicemleme öncesi ve sonrası aynı değerlendirme |
| Gradyan biriktirince eğitim kararsızlaştı | Kayıp biriktirme sayısına bölünmedi | Her küçük yığın kaybını adım sayısına bölün |

## Denetim listesi

- [ ] Ağırlık, en iyileyici, etkinleştirme ve sabit pay için bellek tahmini yapıldı; kısa bir koşuyla doğrulandı.
- [ ] Süre tahmini (6 × parametre × belirteç / etkin hız) yapıldı; ilk 50 adımın gerçek hızı ölçüldü.
- [ ] Duyarlık seçimi donanıma uygun; fp16'da kayıp ölçekleyici var.
- [ ] Gradyan biriktirmede kayıp doğru bölünüyor; etkin yığın kayıtta yazıyor.
- [ ] Denetim noktası tam durumu içeriyor ve atomik yazılıyor; son birkaç tanesi saklanıyor.
- [ ] "N adım" ile "kesilip sürdürülen N adım" aynı sonucu veriyor (test).
- [ ] Bulut defterinde çıktılar kalıcı depolamaya yazılıyor; sürümler sabit; sırlar defterde değil.

## Küçük modele yaptırırken

- **İsteme yazın:** "Eğitime başlamadan bellek tahmini yap (ağırlık, AdamW durumu, etkinleştirme, sabit pay) ve
  yaz. Denetim noktasına ağırlıkları, en iyileyici ve çizelge durumunu, adımı ve rastgelelik durumunu kaydet;
  dosyayı geçici dosya + `os.replace` ile yaz. 'N adım' ile 'N/2 + sürdür + N/2' aynı sonucu veriyor mu diye test ekle."
- **Modelin tipik hatası:** Yalnız `model.state_dict()` kaydeder; gradyan biriktirmede kaybı bölmez; fp16'yı
  ölçekleyicisiz açar; "7B model 14 GB, sığar" deyip eğitimde en iyileyici durumunu unutur.
- **Çıktıda denetleyin:** denetim noktası sözlüğünün anahtarları; sürdürme testi; tahmin tablosunda en iyileyici ve
  etkinleştirme satırları; ilk kısa koşunun bellek ve hız ölçümü.

## İlgili

- [Transformer](transformer.md) — parametre ve KV önbelleği hesabı · [Derin öğrenme temelleri](derin-ogrenme-temelleri.md) ·
  [Eğitim hata ayıklama](egitim-hata-ayiklama.md)
- Bellek tahmini (`egit --kuru`): [`ince_ayar/memory.py`](../../ince-ayar/ince_ayar/memory.py), formül ve sınırları:
  [`ince-ayar/docs/HIPERPARAMETRE.md`](../../ince-ayar/docs/HIPERPARAMETRE.md), tahmin ↔ ölçüm:
  [`DENEME_KAYDI.md`](../../ince-ayar/docs/DENEME_KAYDI.md); duyarlık seçimi: [`hardware.py`](../../ince-ayar/ince_ayar/hardware.py)
- Boyut ↔ veri ↔ süre tablosu ve ölçülen CPU hızı: [`dil-modeli/docs/EGITIM_REHBERI.md`](../../dil-modeli/docs/EGITIM_REHBERI.md);
  bire bir sürdürme: [`dil_modeli/train_state.py`](../../dil-modeli/dil_modeli/train_state.py)
- Bulut defteri ve hazır ayarlar: [`ince-ayar/defterler/ince_ayar_colab.ipynb`](../../ince-ayar/defterler/ince_ayar_colab.ipynb),
  [`dil-modeli/yapilandirma/colab-t4.toml`](../../dil-modeli/yapilandirma/colab-t4.toml)
- numpy ile klasik modellerin ölçülen hızları: [`ml-temel/README.md`](../../ml-temel/README.md)
- [Yerel model çalıştırma](../85-llm/yerel-model-calistirma.md) · [Sayılar ve kayan nokta](../92-matematik/sayilar-ve-kayan-nokta.md)
