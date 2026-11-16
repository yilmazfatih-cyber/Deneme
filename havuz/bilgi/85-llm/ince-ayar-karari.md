---
baslik: İnce ayar kararı
ozet: İstem, az-örnek, RAG ve ince ayar arasında karar ağacı; ince ayarın çözdüğü ve çözmediği şeyler, veri gereksinimi ve kalitesi, LoRA sezgisi ve parametre hesabı, değerlendirme, aşırı uyum ve bakım maliyeti.
etiketler: [llm, ince-ayar, lora, veri, karar]
duzey: ileri
guncellik: 2026-11
---

# İnce ayar kararı

> Bu notu ne zaman okumalı: "Modeli kendi verimizle eğitelim" fikri çıktığında; istem ve RAG ile ulaşılan doğruluk
> yetmediğinde; küçük modeli büyük modelin işini yapacak hâle getirmek istediğinizde. Uygulama adımları:
> [`ince-ayar` temeli](../../ince-ayar/README.md).

## Temel fikir

İnce ayar (fine-tuning) modelin **davranışını** değiştirir: biçim, üslup, görev odağı, dar bir sınıflandırma. Modele
güvenilir biçimde **yeni bilgi** eklemez; az veriyle bilgi ezberletmek uydurmayı artırır. Bilgi için RAG, davranış
için ince ayar. Sıra hep aynıdır: istem → az-örnek → (bilgi eksikse) RAG → ölçülmüş bir açık kalırsa ince ayar.
İnce ayarın asıl maliyeti eğitim değil, **veri** (temiz, tutarlı, lisanslı örnekler) ve **bakımdır** (taban model
değişince yeniden eğitme, her sürümü ölçme). LoRA, taban ağırlıkları dondurup küçük bir ek eğitir; tek bir
tüketici GPU'suna sığmayı mümkün kılar ama karar mantığını değiştirmez.

## Karar ağacı

```text
1. Sorun bilgi mi (modelin bilmediği/güncel olgu)?
   └─ Evet → RAG (rag-tasarimi). İnce ayar DEĞİL.
2. Sorun biçim/üslup/odak mı?
   └─ İstemi sadeleştir + şema + az-örnek → görev kümesinde ölç.
      ├─ Yetti → bitti.
      └─ Yetmedi → 3.
3. Elinizde temiz, tutarlı, lisanslı yüzlerce örnek var mı (ya da üretebilir misiniz)?
   ├─ Hayır → daha büyük model / görevi böl / veri topla.
   └─ Evet → 4.
4. Görev dar bir sınıflandırma/varlık tanıma mı?
   ├─ Evet → küçük kodlayıcı (encoder) ince ayarı: CPU'da milisaniyeler (ince-ayar: siniflandirma, varlik).
   └─ Hayır → sohbet modeli LoRA ince ayarı; taban modelle karşılaştırmalı değerlendirme.
5. Arama kalitesi mi kötü? → gömme modelini alana uydurun (ince-ayar: gomme), üretici modeli değil.
```

## İnce ayar neyi çözer, neyi çözmez

| Çözer (ölçülerek)                                          | Çözmez                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| Çıktı biçimini/üslubunu tutarlı kılmak (JSON, kurum dili)   | Modele güvenilir yeni bilgi eklemek (fiyat, politika, kişi)   |
| Uzun istemi kısaltmak (davranış modele "gömülür")          | Küçük modele büyük modelin akıl yürütmesini kazandırmak       |
| Dar sınıflandırmada küçük modelle yüksek doğruluk          | Uydurmayı tamamen engellemek                                  |
| Küçük modeli bir görevde büyük modele yaklaştırmak (damıtma) | Kötü/çelişkili veriden iyi model çıkarmak                    |
| Alan aramasında recall/MRR artışı (gömme ince ayarı)        | Güvenlik garantisi (zararlı çıktıyı tümden kesmek)            |
| Belirli hatayı azaltmak (ör. hep aynı etikete kayma)        | Ölçülmemiş bir sorunu (önce ölçün)                            |

Kaynak ve ayrıntı: [NE_ZAMAN_INCE_AYAR](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md), [küçük model rehberi](../../yz/docs/KUCUK_MODEL_REHBERI.md) §7.

## Veri gereksinimi ve kalitesi

Başlangıç miktarları yaygın uygulamadan kaba noktalardır, ölçüm değildir (`ince-ayar` belgeleriyle aynı):

| Görev                | Başlamak için                              | Kalite kuralı                                       |
| -------------------- | ------------------------------------------ | --------------------------------------------------- |
| Sınıflandırma        | sınıf başına en az ~50–100 temiz örnek      | Etiket tanımı yazılı; iki kişi etiketleyip uyuşma bakılır |
| Sohbet / talimat     | birkaç yüz – birkaç bin kaliteli örnek      | Tutarlılık nicelikten önemli; çelişen yanıt zarar verir |
| Gömme (arama)        | birkaç yüz – birkaç bin (sorgu, belge) çifti | Gerçek sorgular; zor olumsuz örnekler                |
| Varlık tanıma        | tür başına birkaç yüz örnek varlık          | Sınır ve tür tutarlılığı kritik                      |

- **Kaynak:** gerçek (anonimleştirilmiş) örnekler; açık lisanslı kümeler (lisansı kaydedin); ya da lisansı izin veren
  açık bir "öğretmen" modelle üretim hattı (`python -m ince_ayar sohbet uret`, istem sürümü ve satır başına kaynak
  kaydıyla). Eğitim verisini elle uydurmayın.
- **Temizlik:** yinelenen ve çok benzer örnekleri atın; kişisel veriyi çıkarın; bozuk kodlamayı düzeltin.
- **Ayrım:** değerlendirme kümesi eğitimden **önce** ayrılır; çok benzer örnekler ve aynı kaynaktan gelenler aynı
  tarafa gider (havuz: MinHash ile sızıntısız ayrım, `grup` alanı).
- **Eğitim istemi = çalışma zamanı istemi:** model eğitimde gördüğü biçimle çalıştırılmalı (depodaki `ozetci` projesi
  bunu tek bir istem dosyasıyla garanti eder).

## LoRA sezgisi

Doğrusal katmanın çıktısı `y = W·x`. LoRA, `W`'yu dondurur ve yanına iki küçük matris ekler: `y = W·x + (α/r)·B·(A·x)`.
`A` (r × giriş) ve `B` (çıkış × r) eğitilir; `r` küçük olduğu için eğitilen parametre azdır. `B` sıfırla başlar,
eğitim başında model hiç değişmez. Eğitim bitince ek `W`'nun içine katılabilir (birleştirme): çıkarımda ek maliyet
kalmaz.

```python calistir
import random

rastgele = random.Random(0)
d, r, alfa = 6, 2, 4  # küçük boyutlarla: d×d ağırlık, r ranklı ek


def matris(satir: int, sutun: int, sifir: bool = False) -> list[list[float]]:
    return [[0.0 if sifir else rastgele.uniform(-1, 1) for _ in range(sutun)] for _ in range(satir)]


def carp(m: list[list[float]], v: list[float]) -> list[float]:
    return [sum(a * b for a, b in zip(satir, v)) for satir in m]


W = matris(d, d)               # donuk (eğitilmez)
A = matris(r, d)               # eğitilir
B = matris(d, r, sifir=True)   # eğitilir; SIFIRLA başlar -> eğitim başında model hiç değişmez
x = [rastgele.uniform(-1, 1) for _ in range(d)]


def lora_cikti(x: list[float]) -> list[float]:
    ek = carp(B, carp(A, x))
    return [w + (alfa / r) * e for w, e in zip(carp(W, x), ek)]


assert lora_cikti(x) == carp(W, x)  # B = 0 iken çıktı taban modelinkiyle aynı
B = matris(d, r)  # "eğitimden sonra" B artık sıfır değil
# Birleştirme: W' = W + (alfa/r)·B·A  -> çıkarımda ek maliyet kalmaz
BA = [[sum(B[i][k] * A[k][j] for k in range(r)) for j in range(d)] for i in range(d)]
W_birlesik = [[W[i][j] + (alfa / r) * BA[i][j] for j in range(d)] for i in range(d)]
assert all(abs(a - b) < 1e-12 for a, b in zip(lora_cikti(x), carp(W_birlesik, x)))
print(f"tam matris {d * d} parametre, LoRA eki {r * 2 * d}; birleşik model eşdeğer")
```

```cikti
tam matris 36 parametre, LoRA eki 24; birleşik model eşdeğer
```

Gerçek boyutta hesap (Qwen3-1.7B `config.json` değerleriyle; sonuç havuzdaki kuru çalıştırma kaydıyla aynı):

```python calistir
# Qwen3-1.7B config.json değerleri (Hugging Face önbelleğinden okundu, 16 Kasım 2026)
gizli, ara, katman, bas, kv_bas, bas_boyu = 2048, 6144, 28, 16, 8, 128
toplam_parametre = 2_031_739_904  # ince-ayar kataloğu (HF API'den doğrulandı)
r = 16

# LoRA her doğrusal katmana A (r × giriş) ve B (çıkış × r) ekler: r × (giriş + çıkış) parametre
dogrusal = {  # ad: (giriş, çıkış)
    "q_proj": (gizli, bas * bas_boyu), "k_proj": (gizli, kv_bas * bas_boyu), "v_proj": (gizli, kv_bas * bas_boyu),
    "o_proj": (bas * bas_boyu, gizli), "gate_proj": (gizli, ara), "up_proj": (gizli, ara), "down_proj": (ara, gizli),
}
lora = katman * sum(r * (giris + cikis) for giris, cikis in dogrusal.values())
print(f"LoRA r={r}: {lora:,} eğitilen parametre (toplamın %{100 * lora / toplam_parametre:.2f}'si)")
assert round(lora / 1e6, 1) == 17.4  # ince-ayar DENEME_KAYDI: "LoRA r=16 (17,4 M eğitilen)"

# Eğitilen parametre başına ~16 bayt (ağırlık + gradyan + AdamW'nin iki momenti, fp32)
print(f"eğitilenlerin durumu: LoRA {lora * 16 / 1e9:.2f} GB, tam ince ayar {toplam_parametre * 16 / 1e9:.1f} GB")
print(f"donuk taban ağırlıkları (bf16, LoRA'da da gerekir): {toplam_parametre * 2 / 1e9:.1f} GB")
```

```cikti
LoRA r=16: 17,432,576 eğitilen parametre (toplamın %0.86'si)
eğitilenlerin durumu: LoRA 0.28 GB, tam ince ayar 32.5 GB
donuk taban ağırlıkları (bf16, LoRA'da da gerekir): 4.1 GB
```

Etkinleştirme belleği (yığın × uzunluk × gizli boyut) bunlara eklenir; `python -m ince_ayar sohbet egit --kuru`
tahmini verir ([HIPERPARAMETRE](../../ince-ayar/docs/HIPERPARAMETRE.md) "Bellek tahmini"; GPU'da doğrulanmadı).
Başlangıç ayarları: `r` 16 (az veride 8), `alpha` = 2·r, öğrenme oranı 2e-4, 2 dönem. Sıfırdan LoRA gerçeklemesi:
`dil-modeli/dil_modeli/lora.py`.

## Değerlendirme ve aşırı uyum

- Asıl soru: **ince ayarlı model tabandan iyi mi?** Aynı kümede tabanı da ölçün
  (`python -m ince_ayar sohbet degerlendir ... --karsilastir`). "ROUGE 0,4" tek başına bir şey söylemez.
- Aşırı uyum (overfitting): eğitim kaybı inerken doğrulama kaybı yükselir. Dönemi azaltın, veri ekleyin, `r`'yi
  küçültün; en iyi ara kayıt doğrulama kaybına göre seçilir.
- Felaket unutma (catastrophic forgetting): model eski genel yeteneklerini kaybeder. Görev dışı birkaç genel örnekle
  ayrıca ölçün; öğrenme oranını düşürün, veriye genel örnek karıştırın.
- Sızıntı: aynı ya da çok benzer örnek iki tarafta → ölçüt şişer (`python -m ince_ayar veri sizinti ...`).
- Sohbette kayıp **yalnız asistan yanıtında** hesaplanmalı ve bitiş belirteci öğretilmeli; yoksa model durmayı
  öğrenmez, kendini yineler (havuz: modelin kendi şablonuyla kayıp maskesi, `ince_ayar/tasks/chat/masking.py`).
- 30–50 doğrulama örneğini insan gözüyle okuyun; yüzey ölçütleri anlamı ölçmez.

Ayrıntı: [ince-ayar DEGERLENDIRME](../../ince-ayar/docs/DEGERLENDIRME.md).

## Bakım maliyeti

| Kalem                         | Ne gerektirir                                                       |
| ----------------------------- | ------------------------------------------------------------------- |
| Taban model güncellenince     | Yeniden eğitim + yeniden ölçüm; bağdaştırıcı yeni tabana taşınmaz    |
| Veri değişince (yeni sınıf)   | Veri toplama, etiketleme, yeniden eğitim                            |
| Sunum                         | Birleştirme + dönüştürme (GGUF/ONNX) + nicemleme sonrası kalite ölçümü |
| Sürümleme                     | Veri sürümü + taban + ayarlar + bağdaştırıcı + değerlendirme raporu birlikte |
| Lisans                        | Taban model ve veri lisanslarının kaydı                              |

Bu maliyet istem/RAG'da çok daha düşüktür; ince ayarı ancak ölçülmüş kazanç bu maliyeti karşılıyorsa seçin.

## Tuzaklar

| Belirti                                                      | Neden                                                 | Çözüm                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| İnce ayardan sonra model kendinden emin yanlış bilgi veriyor | Bilgi ezberletilmeye çalışıldı                        | Bilgiyi RAG'a taşıyın; ince ayarı biçime ayırın            |
| Doğrulama ölçütleri şüpheli iyi                              | Sızıntı (benzer örnek iki tarafta)                    | Sızıntı denetimi; grup ayrımı                              |
| Model yanıtı bitirmiyor, tekrar ediyor                        | Bitiş belirteci öğretilmedi; kayıp maskesi yanlış     | Maskeyi gözle denetleyin (`dogrula`); bitiş belirteci etiketli |
| Kayıp düşüyor, gerçek kullanım kötüleşti                     | Aşırı uyum ya da eğitim istemi ≠ çalışma istemi       | Taban karşılaştırması; aynı istem dosyası                  |
| Genel sorulara artık saçma yanıt                             | Felaket unutma                                        | Öğrenme oranı/dönem azalt; genel örnek karıştır            |
| Birleştirme sonrası çıktılar değişti                          | Düşük duyarlıkta (bf16) birleştirme yuvarlaması       | fp32 birleştirme (havuz kaydı: bf16'da fark 1,0; fp32'de 7,9e-05) |
| Nicemlenmiş model kötü                                        | 1B altı modelde düşük bitli nicemleme kaybı büyük     | Nicemleme sonrası yeniden ölçün; daha yüksek bit           |
| Veri "yeterli" ama sonuç kötü                                | Çelişkili/tutarsız örnekler                           | Örnekleri okuyun; etiket tanımı; temizlik                  |

## Denetim listesi

- [ ] İstem, az-örnek ve (bilgi sorunuysa) RAG denendi; açık görev kümesinde ölçülerek gösterildi.
- [ ] Sorun bilgi değil davranış/biçim/odak.
- [ ] Veri gerçek ya da lisanslı kaynaktan; lisanslar kayıtlı; kişisel veri çıkarıldı.
- [ ] Değerlendirme kümesi önceden ayrıldı; sızıntı denetimi temiz.
- [ ] `--kuru` ile bellek planı görüldü; küçük bir koşuyla hat doğrulandı.
- [ ] Taban modelle aynı kümede karşılaştırıldı; 30–50 örnek insan gözüyle okundu.
- [ ] Birleştirme/dönüştürme/nicemleme sonrası yeniden ölçüldü.
- [ ] Veri + taban + ayar + bağdaştırıcı + rapor birlikte sürümlendi; bakım sahibi belli.

## Küçük modele yaptırırken

- **İsteme yazın:** "İnce ayardan önce istem/az-örnek/RAG ile ölçüm yap ve tabloyu göster. Eğitim verisi yazma; şu
  gerçek/lisanslı kaynağı kullan ya da `ince_ayar sohbet uret` hattını kur. Değerlendirme kümesini eğitimden önce
  ayır. `--kuru` ile başla. Sonuçta tabanla karşılaştırma tablosu ver."
- **Modelin tipik hatası:** sorunu bilgi eksikliği olduğu hâlde ince ayarla çözmeye kalkmak; eğitim verisini kendisi
  uydurmak; değerlendirmeyi eğitim verisinde yapmak; yalnız kayıp eğrisine bakıp "öğrendi" demek.
- **Çıktıda denetleyin:** veri kaynağı ve lisansı; ayrım ve sızıntı raporu; taban karşılaştırması; örnek üretimler
  (`rapor.html`); birleştirme duyarlığı.
- Komutları havuzdan kullandırın, sıfırdan eğitim betiği yazdırmayın: [`ince-ayar` AGENTS.md](../../ince-ayar/AGENTS.md).

## İlgili

- [RAG tasarımı](rag-tasarimi.md) · [Model seçimi](model-secimi.md) · [Değerlendirme](degerlendirme.md) ·
  [Yerel model çalıştırma](yerel-model-calistirma.md)
- Havuz: [`ince-ayar`](../../ince-ayar/README.md) (sohbet, sınıflandırma, gömme, varlık; veri araçları; katalog),
  [NE_ZAMAN_INCE_AYAR](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md), [HIPERPARAMETRE](../../ince-ayar/docs/HIPERPARAMETRE.md),
  [DENEME_KAYDI](../../ince-ayar/docs/DENEME_KAYDI.md)
- Sıfırdan LoRA ve küçük model eğitimi: [`lora.py`](../../dil-modeli/dil_modeli/lora.py),
  [EGITIM_REHBERI](../../dil-modeli/docs/EGITIM_REHBERI.md)
- Sızıntının genel türleri: [Veri sızıntısı](../80-ml/veri-sizintisi.md)
