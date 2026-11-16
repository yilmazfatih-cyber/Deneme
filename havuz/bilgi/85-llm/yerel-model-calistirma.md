---
baslik: Yerel model çalıştırma: nicemleme, bellek ve hız
ozet: Nicemleme ve kalite ödünleşimi, ağırlık ile bağlam önbelleği bellek hesabı, CPU-GPU-birleşik bellek farkı, bağlam uzunluğunun maliyeti, OpenAI uyumlu yerel uç kavramı, hız ölçümü ve sık sorunlar.
etiketler: [llm, yerel-model, nicemleme, bellek, hiz, cikarim]
duzey: orta
guncellik: 2026-11
---

# Yerel model çalıştırma: nicemleme, bellek ve hız

> Bu notu ne zaman okumalı: Bir modeli kendi bilgisayarınızda ya da sunucunuzda çalıştırmadan önce ("sığar mı, ne
> kadar hızlı olur?"); bellek hatası, yavaşlık, yarıda kesilen bağlam ya da durmayan model sorununda; nicemleme
> düzeyi seçerken.

## Temel fikir

Yerel çalıştırmada belleği üç şey doldurur: **ağırlıklar** (parametre × bit), **bağlam önbelleği** (KV cache;
bağlam uzunluğuyla doğrusal büyür) ve çalıştırıcının kendi payı. **Nicemleme** (quantization) ağırlıkları daha az
bitle saklar: bellek ve çoğu zaman hız kazanılır, kalite biraz kaybedilir; küçük modelde kayıp daha belirgindir.
Üretim hızı büyük ölçüde bellek bant genişliğine bağlıdır: yoğun (dense) modelde her belirteç için ağırlıkların
tamamı okunur; uzman karışımı (MoE) modelde yalnız o belirteç için seçilen uzmanlar okunur. Hız iki
ayrı sayıdır: ilk belirtece kadar geçen süre (istem işleme) ve sonraki belirteçlerin hızı. Hepsini kendi
makinenizde, kendi istem boyunuzla ölçün; başkasının sayısı sizin donanımınızı anlatmaz.

## Karar tablosu

| Durum                                                 | Seçim                                                        | Neden                                              |
| ----------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| 1B altı model                                         | 8 bit ya da 16 bit                                           | Küçük modelde düşük bitin kalite kaybı büyük olur  |
| 3–14B model, bellek dar                               | 4–5 bit; görev kümesinde yeniden ölçün                       | Bellek yarıdan fazla azalır; kayıp çoğu işte küçük |
| Uzun bağlam gerekiyor (≥ 16 bin belirteç)             | Bağlam önbelleğini hesaba katın; gerekirse daha küçük model  | Uzun bağlamda önbellek ağırlıkları geçebilir       |
| Yalnız CPU var                                        | Küçük model + nicemlenmiş dosya + kısa çıktı                  | CPU'da üretim yavaştır                             |
| Birden çok kullanıcı aynı anda                        | Toplu işleyebilen sunucu; eşzamanlılığı ölçün                 | Tek kullanıcılık çalıştırıcı istekleri sıraya koyar |
| Uygulama zaten OpenAI biçiminde istemci kullanıyor    | OpenAI uyumlu yerel uç                                       | Yalnız adres değişir; farkları istemci hoş görmeli |

## Nicemleme ve kalite ödünleşimi

Ağırlıklar küçük bloklara bölünür (ör. 32'şer); her blok için bir ölçek saklanır, değerler o ölçekle küçük tam
sayılara yuvarlanır. Bit azaldıkça yuvarlama hatası büyür. Ölçek de yer kaplar: 32'li blokta 16 bitlik ölçek ağırlık
başına +0,5 bit demektir.

```python calistir
import math
import random

rastgele = random.Random(1)
agirliklar = [rastgele.gauss(0, 0.02) for _ in range(4096)]  # bir katmandan örnek ağırlıklar


def nicemle(degerler: list[float], bit: int, blok: int = 32) -> list[float]:
    """Simetrik blok nicemleme: her 32 ağırlık için bir ölçek; değerler tam sayıya yuvarlanır, sonra geri açılır."""
    seviye = 2 ** (bit - 1) - 1  # 8 bit: ±127, 4 bit: ±7
    geri = []
    for i in range(0, len(degerler), blok):
        parca = degerler[i : i + blok]
        olcek = max(abs(x) for x in parca) / seviye
        geri += [round(x / olcek) * olcek for x in parca]
    return geri


def goreli_hata(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / sum(x * x for x in a))


hatalar = {}
for bit in (8, 6, 4, 3):
    hatalar[bit] = goreli_hata(agirliklar, nicemle(agirliklar, bit))
    etkin = bit + 16 / 32  # blok başına 16 bitlik ölçek: ağırlık başına +0,5 bit
    print(f"{bit} bit (etkin {etkin} bit/ağırlık): göreli hata %{100 * hatalar[bit]:.1f}")
assert hatalar[8] < hatalar[6] < hatalar[4] < hatalar[3]
```

```cikti
8 bit (etkin 8.5 bit/ağırlık): göreli hata %0.5
6 bit (etkin 6.5 bit/ağırlık): göreli hata %2.2
4 bit (etkin 4.5 bit/ağırlık): göreli hata %9.6
3 bit (etkin 3.5 bit/ağırlık): göreli hata %22.6
```

Ağırlık hatası doğrudan görev başarısı değildir; gerçek çalıştırıcıların biçimleri (llama.cpp GGUF türleri gibi)
daha akıllı yöntemler kullanır ve bazı katmanları yüksek bitte tutar. Kural: **nicemlemeden sonra görev kümenizi
yeniden koşun.** Havuzdaki gözlemler: `dil-modeli` örnek modelinde int8, float32 ile aynı kaliteyi verdi (1,33 M
parametre; [README](../../dil-modeli/README.md)); depodaki `ozetci` projesi 1B altı modellerde 8 biti önerir, 4 bitin
kaybını büyük bulur. Kendi modelinizde ölçün.

## Bellek hesabı

```python calistir
def bellek_gb(parametre: int, bit: float, katman: int, kv_bas: int, bas_boyu: int, baglam: int,
              kv_bayt: int = 2) -> tuple[float, float]:
    """Ağırlık = parametre × bit/8. Bağlam önbelleği (KV) = 2 (K ve V) × katman × KV başı × baş boyu × bayt × bağlam."""
    agirlik = parametre * bit / 8
    kv = 2 * katman * kv_bas * bas_boyu * kv_bayt * baglam
    return agirlik / 1e9, kv / 1e9


# config.json (HF önbelleği) + parametre sayısı (ince-ayar kataloğu, HF API), 16 Kasım 2026
modeller = {"Qwen3-1.7B": (2_031_739_904, 28, 8, 128), "Qwen3-4B": (4_022_468_096, 36, 8, 128)}
for ad, (p, katman, kv_bas, bas_boyu) in modeller.items():
    for bit in (16, 8.5, 4.5):
        for baglam in (4_096, 32_768):
            a, kv = bellek_gb(p, bit, katman, kv_bas, bas_boyu, baglam)
            print(f"{ad:10} {bit:>4} bit  bağlam {baglam:>6}: ağırlık {a:4.1f} + KV {kv:3.1f} = {a + kv:4.1f} GB")

# Sağlama: depodaki ozetci README'si Qwen3-0.6B (751.632.384 parametre) Q8_0 dosyasını ≈ 805 MB veriyor
assert abs(751_632_384 * 8.5 / 8 / 1e6 - 805) < 10
```

```cikti
Qwen3-1.7B   16 bit  bağlam   4096: ağırlık  4.1 + KV 0.5 =  4.5 GB
Qwen3-1.7B   16 bit  bağlam  32768: ağırlık  4.1 + KV 3.8 =  7.8 GB
Qwen3-1.7B  8.5 bit  bağlam   4096: ağırlık  2.2 + KV 0.5 =  2.6 GB
Qwen3-1.7B  8.5 bit  bağlam  32768: ağırlık  2.2 + KV 3.8 =  5.9 GB
Qwen3-1.7B  4.5 bit  bağlam   4096: ağırlık  1.1 + KV 0.5 =  1.6 GB
Qwen3-1.7B  4.5 bit  bağlam  32768: ağırlık  1.1 + KV 3.8 =  4.9 GB
Qwen3-4B     16 bit  bağlam   4096: ağırlık  8.0 + KV 0.6 =  8.6 GB
Qwen3-4B     16 bit  bağlam  32768: ağırlık  8.0 + KV 4.8 = 12.9 GB
Qwen3-4B    8.5 bit  bağlam   4096: ağırlık  4.3 + KV 0.6 =  4.9 GB
Qwen3-4B    8.5 bit  bağlam  32768: ağırlık  4.3 + KV 4.8 =  9.1 GB
Qwen3-4B    4.5 bit  bağlam   4096: ağırlık  2.3 + KV 0.6 =  2.9 GB
Qwen3-4B    4.5 bit  bağlam  32768: ağırlık  2.3 + KV 4.8 =  7.1 GB
```

Okuma:

- 4,5 bitlik Qwen3-1.7B'de 32 bin bağlamın önbelleği (3,8 GB) ağırlıkların (1,1 GB) üç katıdır. Uzun bağlam
  istemiyorsanız bağlamı kısa ayarlayın; birçok çalıştırıcı önbelleği ayarlanan bağlam kadar baştan ayırır.
- Değerleri modelin `config.json` dosyasından alın: `num_hidden_layers`, `num_key_value_heads`, `head_dim` (yoksa
  `hidden_size / num_attention_heads`). KV başı sayısı dikkat başı sayısından az olabilir (gruplu dikkat, GQA);
  önbelleği o küçültür.
- Üstüne çalıştırıcı payı ekleyin (ara bellekler, ayrıştırma); kendi makinenizde ilk koşuda ölçün. İşletim sistemi ve
  öteki uygulamalar için de yer kalsın; belleğin tamamını hesaplamayın.
- Ad yaklaşıktır: "1.7B" adlı modelin API'den okunan parametre sayısı 2,03 milyardır. Hesabı gerçek sayıyla yapın.
- Uzman karışımı (MoE) modelde bellek için **toplam** parametre, hız için **etkin** (belirteç başına kullanılan)
  parametre önemlidir; model kartı ikisini ayrı verir. Bütün uzmanlar bellekte durur.
- Bazı çalıştırıcılar bağlam önbelleğini de nicemleyebilir; kalite etkisini ölçmeden açmayın.
- Eğitim belleği bambaşka bir hesaptır (gradyan, optimizer durumu): [ince ayar kararı](ince-ayar-karari.md).

## CPU, GPU ve birleşik bellek

| Donanım                          | Ağırlıklar nerede                       | Hızı belirleyen                          | Ne zaman                                   |
| -------------------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Yalnız CPU                       | Sistem belleği                          | Bellek bant genişliği, çekirdek sayısı   | Küçük model, düşük hacim, gizlilik         |
| Ayrık GPU                        | GPU belleği (sığmayan kısım CPU'ya taşar) | GPU bellek bant genişliği; taşma çok yavaşlatır | Hız gerekiyorsa; model GPU belleğine sığıyorsa |
| Birleşik bellek (CPU ve GPU aynı belleği paylaşır) | Ortak bellek                  | Ortak bellek bant genişliği              | Büyük modeli tek makinede çalıştırmak      |

- Modelin bir kısmı GPU'ya sığmayıp CPU'da kalırsa hız, CPU kısmına göre düşer. Ya tamamen sığdırın ya daha
  küçük/nicemlenmiş model seçin.
- CPU'da iş parçacığı sayısını fiziksel çekirdek sayısına göre ayarlayın; paylaşımlı makinede düşük tutun.
- Havuzdaki ölçüm: Qwen2.5-0.5B, transformers, float32, 4 çekirdekli paylaşımlı CPU, 2 iş parçacığı: 120 belirteçlik
  yanıt 17,8 sn (≈6,7 belirteç/sn), tek kelimelik sınıflandırma p50 0,72 sn
  ([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md)). Nicemlenmiş, CPU'ya özel çalıştırıcılar genelde
  daha hızlıdır; bu depoda ölçülmedi.

## Bağlam uzunluğunun maliyeti

- **Bellek:** önbellek bağlamla doğrusal büyür (yukarıdaki tablo).
- **İlk belirteç süresi:** istemin tamamı önce işlenir; uzun istem = uzun bekleme. Sohbette her tur geçmişi
  yeniden göndermek bu süreyi büyütür ([bellek ve bağlam](bellek-ve-baglam-yonetimi.md)).
- **Kalite:** küçük modelde uzun bağlamda dikkat dağılır; ihtiyacınız olandan büyük bağlam açmak kalite kazandırmaz.
- **Sessiz kırpma:** çalıştırıcının varsayılan bağlamı modelin desteklediğinden küçük olabilir; uzun girdi uyarısız
  kesilir. Bağlamı açıkça ayarlayın (ör. Ollama `Modelfile` içindeki `num_ctx`;
  [dil-modeli OLLAMA](../../dil-modeli/docs/OLLAMA.md) örneği) ve girdi belirtecini kendiniz sayın.

## Çalıştırıcı türleri ve OpenAI uyumlu uç

| Tür                                   | Nasıl                                                     | Ne zaman                                         |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Kitaplık olarak, süreç içinde          | Python/C++ kitaplığı modeli yükler, işlev çağrısıyla üretir | Toplu iş, deney, tek program                     |
| Yerel sunucu (HTTP)                   | Model bir kez yüklenir; uygulamalar HTTP ile istek yollar  | Birden çok uygulama/süreç; arayüz; geliştirme    |
| Tarayıcıda / cihazda                  | Model dosyası istemcide çalışır                           | Tam çevrimdışı ve gizli; çok küçük modeller      |

"OpenAI uyumlu uç": `/v1/chat/completions` gibi yollarla `messages` listesi alan, aynı biçimde yanıt veren HTTP uçtur.
Aynı istemci kodu yalnız taban adresi değiştirerek yerel sunucuya ya da buluta bağlanır. Ama uyum tam değildir:
eksik `usage` alanı, parça listesi hâlinde içerik, araç argümanının dizgi ya da nesne gelmesi, düşünce alanları,
farklı akış biçimi, desteklenmeyen alanı 400 hatasıyla reddetme gibi farklar görülür. Havuzdaki istemci bunları tek
yerde hoş görür ([yz kararı K-01](../../yz/docs/KARARLAR.md); `yz/yz/saglayici/openai_bicim.py`). Havuzdaki yerel
sunucular: `dil-modeli` (`python -m dil_modeli sun`, kapı 8430) ve küçük HF modelleri için geliştirme sunucusu
`yz/araclar/hf_sunucu.py`.

## Hız ölçümü

İki sayıyı ayrı raporlayın: **TTFT** (ilk belirtece kadar süre; istem işleme) ve **üretim hızı** (ilk belirteçten
sonraki belirteç/sn). Toplam süreyi toplam belirtece bölmek ikisini karıştırır.

```python calistir
def olc(akis, saat) -> tuple[float, float, float]:
    """İlk belirteç süresi (TTFT), üretim hızı (ilk belirteçten sonra) ve yanıltıcı 'ortalama hız'."""
    bas, ilk, adet = saat(), None, 0
    for _ in akis:
        adet += 1
        if ilk is None:
            ilk = saat()
    son = saat()
    return ilk - bas, (adet - 1) / (son - ilk), adet / (son - bas)


simdi = 0.0  # sahte saat: gerçek ölçümde time.perf_counter kullanın


def saat() -> float:
    return simdi


def sahte_akis(istem_isleme_sn: float, belirtec_sn: float, adet: int):
    global simdi
    simdi += istem_isleme_sn  # ön işleme (prefill): istem uzadıkça büyür
    for i in range(adet):
        if i:
            simdi += belirtec_sn
        yield f"b{i}"


ttft, hiz, karisik = olc(sahte_akis(0.8, 0.15, 20), saat)
print(f"TTFT {ttft:.2f} sn | üretim {hiz:.2f} belirteç/sn | toplamdan bölünen (yanıltıcı) {karisik:.2f}")
assert round(hiz, 2) == 6.67 and karisik < hiz
```

```cikti
TTFT 0.80 sn | üretim 6.67 belirteç/sn | toplamdan bölünen (yanıltıcı) 5.48
```

Ölçüm kuralları: ilk isteği (model yükleme, ısınma) saymayın; gerçek boyda istem kullanın; sıcaklık 0 ve sabit çıktı
sınırı; en az 5 koşu, ortanca; donanım, iş parçacığı, nicemleme ve bağlam ayarını sonucun yanına yazın. Akışlı uçta
parçaları belirteç saymak yaklaşıktır; sağlayıcının bildirdiği belirteç sayısını kullanın.

## Tuzaklar

| Belirti                                                      | Neden                                                     | Çözüm                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------ |
| Model yükleniyor, uzun istemde bellek hatası                 | Bağlam önbelleği hesaba katılmadı                         | Hesaplayıcıyla bağlamı seçin; bağlamı kısaltın ya da daha düşük bit |
| Çok yavaş, disk sürekli çalışıyor                            | Bellek yetmedi, takas (swap) kullanılıyor                 | Daha küçük model/nicemleme; öteki uygulamaları kapatın        |
| GPU var ama hız CPU gibi                                     | Katmanların bir kısmı CPU'da kaldı                        | Tamamını GPU'ya sığdırın ya da küçültün                       |
| Uzun belgenin başı "yokmuş" gibi                             | Çalıştırıcının varsayılan bağlamı küçük; sessiz kırpma     | Bağlamı açıkça ayarlayın; girdi belirtecini sayın             |
| Model durmuyor ya da rol işaretlerini yazıyor                | Sohbet şablonu/durdurma belirteci yanlış (GGUF'ta sık)     | Modelin kendi şablonu; durdurma belirteçleri (`OLLAMA.md` örneği) |
| Nicemlemeden sonra JSON/Türkçe bozuldu                       | Düşük bitte kalite kaybı (küçük modelde büyük)             | Daha yüksek bit; görev kümesiyle yeniden ölçüm                |
| İlk istek çok yavaş, sonrakiler normal                       | Model yükleme ve ısınma                                   | Sunucuyu açık tutun; ölçümde ilk isteği saymayın              |
| Hugging Face'ten indirme dakikalarca takılıyor               | Depolama ucu sorunu (havuzda yaşandı)                     | `HF_HUB_DISABLE_XET=1` ile deneyin ([DENEME_KAYDI](../../ince-ayar/docs/DENEME_KAYDI.md) §4) |
| Hız raporları tutarsız                                       | TTFT ve üretim hızı karıştı; farklı istem boyu            | İki sayıyı ayrı; aynı istem ve ayarla ölçün                   |

## Denetim listesi

- [ ] Bellek hesabı gerçek parametre sayısı ve `config.json` değerleriyle, kullanılacak bağlamla yapıldı.
- [ ] Nicemleme düzeyi model boyuna göre seçildi; nicemleme sonrası görev kümesi yeniden koşuldu.
- [ ] Çalıştırıcının bağlam ayarı açıkça verildi; uzun girdi kırpılmıyor.
- [ ] Sohbet şablonu ve durdurma belirteçleri modelinkiyle aynı.
- [ ] TTFT ve üretim hızı ayrı ölçüldü; donanım, iş parçacığı, nicemleme kayıtlı.
- [ ] İstemci OpenAI uyumlu uçtaki farkları hoş görüyor (eksik `usage`, 400 ile reddedilen alan).
- [ ] Sunucu yalnız yerel adreste dinliyor ya da kimlik doğrulaması var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bellek hesabını parametre × bit/8 + bağlam önbelleği formülüyle yap; değerleri modelin
  config.json dosyasından oku; sonucu tablo yap. Nicemleme önerisini görev kümesinde ölçmeden kesinleştirme."
- **Modelin tipik hatası:** yalnız ağırlıkları hesaplayıp bağlam önbelleğini unutmak; model adındaki sayıyı parametre
  sayısı sanmak; ezberden bağlam uzunluğu ya da hız rakamı yazmak; toplam süreyi belirtece bölüp "hız" demek.
- **Çıktıda denetleyin:** her değerin kaynağı (`config.json`, model kartı, kendi ölçümü); TTFT ve üretim hızı ayrı mı;
  bağlam ayarı açıkça verilmiş mi.

## İlgili

- [Model seçimi](model-secimi.md) · [Maliyet ve gecikme](maliyet-ve-gecikme.md) ·
  [Bellek ve bağlam yönetimi](bellek-ve-baglam-yonetimi.md) · [Dil modeli nasıl çalışır](llm-nasil-calisir.md)
- Havuz: GGUF'a dönüştürme ve Ollama [OLLAMA.md](../../dil-modeli/docs/OLLAMA.md); yerel uca bağlanma tarifi
  [yz AGENTS](../../yz/AGENTS.md) ("Ollama'ya / havuz/dil-modeli sunucusuna bağlan"); örnek sağlayıcı
  [`ollama_yerel.py`](../../yz/ornekler/ollama_yerel.py); geliştirme sunucusu [`hf_sunucu.py`](../../yz/araclar/hf_sunucu.py)
- İnce ayarlı modeli GGUF/ONNX'e aktarma: [`ince-ayar`](../../ince-ayar/README.md)
- Kapasite ve eşzamanlılık hesabı: [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md)
- KV önbelleğinin nereden geldiği: [Transformer ve dikkat](../80-ml/transformer.md); donanım seçimi:
  [Hesaplama ve donanım](../80-ml/hesaplama-ve-donanim.md)
