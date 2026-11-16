---
baslik: Dil modeli işini değerlendirme
ozet: Görev kümesi kurma, puanlayıcı türleri ve model-hakem sakıncaları, biçim geçerliliği ile doğruluğu ayırma, gerileme testi, istem/model değişikliğini A/B ölçme ve küçük örneklemde güven aralığı.
etiketler: [llm, degerlendirme, olcum, test, istatistik, gerileme]
duzey: orta
guncellik: 2026-11
---

# Dil modeli işini değerlendirme

> Bu notu ne zaman okumalı: Bir modelin bir işi "görüp görmediğine" karar verirken; istem, model, şema ya da RAG
> ayarı değiştirmeden önce ve sonra; "daha iyi oldu" iddiasını sınamak için; ölçüm sayısının ne kadar güvenilir
> olduğunu bilmek için.

## Temel fikir

Gözle birkaç örneğe bakmak ölçüm değildir. Ölçüm: **sabit bir görev kümesi** (gerçek girdiler + beklenen çıktılar),
**otomatik puanlayıcılar**, **kayıtlı koşular** ve **önceki koşuyla karşılaştırma**. Küçük modelin zaafları ancak
böyle görünür: havuzdaki gerçek denemede 0,5B model sınıflandırmada %40, özet denetiminde %50 (her soruya "Hayır"),
araç kullanımında 1/10 aldı; biçim geçerliliği hepsinde %100'dü ([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md)
§3). **Biçim geçerliliği ve doğruluk ayrı ölçülür.** Küçük kümede sonuçlar gürültülüdür: 20 örnekte %60 ile %70
ayırt edilemez; farkı güven aralığı ve eşli karşılaştırmayla okuyun.

## Karar tablosu: hangi puanlayıcı

| Çıktı türü                                  | Puanlayıcı                                       | Dikkat                                                   |
| ------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Tek etiket, evet/hayır, kısa değer          | Tam eşleşme (Türkçe kuralla normalleştirilmiş)    | "İade." = "iade"; normalleştirme Türkçe kurallı olmalı   |
| Yanıtta belli bir ifade geçmeli             | İçerme / düzenli ifade                           | Olumsuz cümlede de geçer ("14 gün değil")                |
| JSON çıktı                                  | Şema geçerliliği (biçim) **+** alan bazında tam/sayısal eşleşme (doğruluk) | İkisini aynı sayıda toplamayın            |
| Sayı (tutar, sonuç)                         | Sayısal, toleranslı; sayının konumu (ilk/son)    | Model soruyu yineler: "son sayı" daha güvenli            |
| Serbest metin (özet, yanıt)                 | Beklenen olgular + dayanaksız denetimi; gerekirse hakem | Yüzey benzerliği (ROUGE, gömme) anlamı ölçmez     |
| Biçim/üslup kuralı (uzunluk, dil, yasak sözcük) | Kural denetimi (kod)                          | Ucuz ve kesin; her koşuda çalıştırın                     |
| Kodla denetlenemeyen nitelik                | Model-hakem, ölçütlü ve ikili (EVET/HAYIR)        | Hakemi ayrıca insan etiketiyle doğrulayın                |

Havuzdaki puanlayıcılar: `tam_eslesme`, `icerme`, `duzenli_ifade`, `json_sema`, `sayisal` (konum: ilk/son/herhangi),
`gomme_benzerligi`, `hakem` — `yz/yz/degerlendirme/puanlayici.py`.

## Görev kümesi kurma

1. **Gerçek girdiler** (anonimleştirilmiş): kullanıcı mesajları, gerçek belgeler, günlükler. Uydurma örnek modelin
   kolay bulduğu örnektir.
2. **Boyut:** başlangıç için 20–50; karar verilecek fark küçükse yüzlerce (aşağıdaki hesap).
3. **Uç durumlar ayrı etiketle:** boş alan, çok uzun girdi, İngilizce ya da karışık dil, Türkçe harfsiz yazım,
   yazım hatası, içinde talimat geçen metin, birden çok doğru yanıt, yanıtı olmayan soru.
4. **Beklenen çıktı** açık ve tek anlamlı; birden çok doğru varsa liste (`beklenen` liste → herhangi biri tutarsa geçer).
5. **Kategori etiketi** (ör. `tur: uc_durum`): toplam sayı iyiyken bir kategori çöküyor olabilir.
6. **Sızıntı yok:** değerlendirme örnekleri az-örnek isteminde ve ince ayar verisinde kullanılmaz.
7. Biçim: YAML görev tanımı + JSONL örnekler (`yz/gorevler/siniflandirma.yaml` + `.jsonl`).

## Puanlayıcılar: çalışan örnek

```python calistir
import json
import re


def normalle(metin: str) -> str:
    """Türkçe küçük harf, tek boşluk, sondaki nokta yok: 'İade.' == 'iade'."""
    return re.sub(r"\s+", " ", metin.replace("İ", "i").replace("I", "ı").lower()).strip(" .")


def sayi(ham: str) -> float:
    son = max(ham.rfind(","), ham.rfind("."))
    if son == -1:
        return float(ham)
    tam, kesir = ham[:son].replace(".", "").replace(",", ""), ham[son + 1 :]
    return float(tam + kesir) if len(kesir) == 3 else float(f"{tam}.{kesir}")


def tam_eslesme(cikti: str, beklenen) -> bool:
    return normalle(cikti) == normalle(str(beklenen))


def sayisal(cikti: str, beklenen, konum: str = "son", tolerans: float = 0.01) -> bool:
    sayilar = [sayi(s) for s in re.findall(r"\d+(?:[.,]\d+)*", cikti)]
    if not sayilar:
        return False
    adaylar = {"ilk": sayilar[:1], "son": sayilar[-1:], "herhangi": sayilar}[konum]
    return any(abs(s - float(beklenen)) <= tolerans for s in adaylar)


def json_gecerli(cikti: str, beklenen=None) -> bool:  # biçim geçerliliği: doğruluk DEĞİL
    try:
        return isinstance(json.loads(cikti), dict)
    except json.JSONDecodeError:
        return False


assert tam_eslesme("İade.", "iade") and not tam_eslesme("iade talebi", "iade")
yanit = "1250 TL'nin %18'i 225 TL eder."  # küçük model soruyu yineliyor (gerçek deneme)
print("ilk sayı:", sayisal(yanit, 225, "ilk"), "| son sayı:", sayisal(yanit, 225, "son"))

kosu = [  # (çıktı, beklenen toplam): şemaya uyan ama yanlış olanlar ayrı sayılmalı
    ('{"toplam": 1020.0}', 1020.0), ('{"toplam": 850.0}', 1020.0), ('```json\n{"toplam": 70}\n```', 70.0),
    ('{"toplam": 1240.0}', 1240.0)]
bicim = sum(json_gecerli(c) for c, _ in kosu) / len(kosu)
dogru = sum(json_gecerli(c) and abs(json.loads(c)["toplam"] - b) < 0.01 for c, b in kosu) / len(kosu)
print(f"biçim geçerliliği %{bicim * 100:.0f}, doğruluk %{dogru * 100:.0f}")
assert (bicim, dogru) == (0.75, 0.5)
```

```cikti
ilk sayı: False | son sayı: True
biçim geçerliliği %75, doğruluk %50
```

Kod çitli çıktı burada "biçim geçersiz" sayıldı; gerçek hatta önce sağlam ayrıştırıcıdan geçirip notunu ayrıca
sayın ([yapılı çıktı](yapili-cikti.md)). Hangi ayrıştırma ve onarımın kullanıldığı da bir ölçüdür.

## Model-hakem ve sakıncaları

Başka bir modele "bu yanıt doğru mu?" diye sormak, kodla denetlenemeyen nitelikler için tek yoldur ama kendisi de
ölçülmesi gereken bir modeldir.

| Sakınca                                     | Belirti                                         | Önlem                                                  |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Tek yanıta kayma                            | Hakem hep "Hayır" ya da hep "Evet"              | Hakemin kendi doğruluğunu 20–30 insan etiketli örnekte ölçün |
| Sıra yanlılığı (iki yanıt karşılaştırırken) | İlk/ikinci gösterilen kayırılıyor               | Sırayı değiştirip iki kez sorun; çelişirse "berabere"  |
| Uzunluk yanlılığı                           | Uzun yanıt "daha iyi" sayılıyor                 | Ölçütte uzunluğu ayrıca belirtin; kısa doğru örnek     |
| Kendi ailesini kayırma                      | Aynı model ailesinin yanıtı yüksek puan alıyor   | Hakem başka bir aileden; insan örneklemi               |
| Ölçek kararsızlığı                          | 1–10 puanlar koşudan koşuya oynuyor             | İkili karar + açık ölçüt ("tutar kaynakla aynı mı?")   |
| Maliyet                                     | Her örnek için ek çağrı                          | Önce kod puanlayıcılar; hakemi yalnız kalanlara        |

Gerçek denemede 0,5B model "bu özet doğru mu?" görevinde 12 örneğin hepsine "Hayır" dedi: küçük model hakem olarak
kullanılmamalıdır. Havuzdaki `ince-ayar` temeli bu yüzden hakem yerine insan okumasını önerir
([ince-ayar DEGERLENDIRME](../../ince-ayar/docs/DEGERLENDIRME.md)).

## Küçük örneklemde belirsizlik

```python calistir
import math


def wilson(basari: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Oran için %95 Wilson güven aralığı; küçük n'de normal yaklaşımdan güvenilirdir."""
    p = basari / n
    merkez = (p + z * z / (2 * n)) / (1 + z * z / n)
    yari = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return merkez - yari, merkez + yari


for basari, n in [(8, 20), (12, 20), (14, 20), (140, 200)]:
    alt, ust = wilson(basari, n)
    print(f"{basari}/{n} = %{100 * basari / n:.0f}  aralık %{100 * alt:.0f}–%{100 * ust:.0f}")

gerekli = math.ceil(1.96**2 * 0.25 / 0.05**2)  # en kötü durum p=0,5; ±5 puan için
print("±5 puan için gereken örnek:", gerekli)
assert wilson(12, 20)[1] > wilson(14, 20)[0]  # %60 ile %70 ayırt edilemiyor: aralıklar örtüşüyor
```

```cikti
8/20 = %40  aralık %22–%61
12/20 = %60  aralık %39–%78
14/20 = %70  aralık %48–%85
140/200 = %70  aralık %63–%76
±5 puan için gereken örnek: 385
```

Pratik kural: 20 örnekte sonuç ±20 puan oynar; yalnız büyük farklar (ör. %40'a karşı %90) kesindir. Küçük farkı
ayırmak için örneği artırın ya da aşağıdaki eşli karşılaştırmayı kullanın.

## İstem ya da model değişikliğini A/B ölçme

İki sürümü **aynı örneklerde**, aynı ayarlarla (sıcaklık 0, aynı çıktı sınırı) koşun. Bilgi yalnız **ayrışan**
örneklerdedir: birinin doğru ötekinin yanlış bildiği örnekler.

```python calistir
from math import comb


def esli_isaret_testi(a_sonuclar: list[bool], b_sonuclar: list[bool]) -> tuple[int, int, float]:
    """Aynı örneklerde A ve B. Yalnız ayrışan örnekler bilgi taşır. Kesin iki yönlü binom p-değeri."""
    a_iyi = sum(a and not b for a, b in zip(a_sonuclar, b_sonuclar))
    b_iyi = sum(b and not a for a, b in zip(a_sonuclar, b_sonuclar))
    n, k = a_iyi + b_iyi, min(a_iyi, b_iyi)
    p = min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2**n) if n else 1.0
    return a_iyi, b_iyi, p


eski = [True] * 12 + [False] * 8  # eski istem: 12/20
yeni = [True] * 10 + [False, False] + [True] * 5 + [False] * 3  # yeni istem: 15/20
a_iyi, b_iyi, p = esli_isaret_testi(eski, yeni)
print(f"yalnız eski doğru: {a_iyi}, yalnız yeni doğru: {b_iyi}, p = {p:.3f}")
assert sum(yeni) == 15 and p > 0.05  # %60 → %75 "iyileşme" bu örneklemde kanıt değil
```

```cikti
yalnız eski doğru: 2, yalnız yeni doğru: 5, p = 0.453
```

Okuma: yeni istem 5 örneği düzeltti ama 2 örneği bozdu. İstatistik "kesin iyileşme" demiyor; yine de bozulan 2 örneği
tek tek okuyun. Bozulma kabul edilemez bir kategorideyse (ör. güvenlik) değişiklik reddedilir. Gecikme ve maliyeti
doğrulukla birlikte okuyun: %2 daha doğru ama 5 kat yavaş sürüm çoğu iş için yanlış seçimdir.

## Gerileme testi

- Her koşunun örnek bazında sonucu saklanır (`yz`: `.yz/kosular/<ad>-<zaman>/sonuclar.jsonl`).
- Yeni koşu öncekiyle örnek örnek karşılaştırılır: **önceden geçip şimdi kalan** örnekler listelenir
  (`python -m yz degerlendir gorevler/x.yaml --onceki .yz/kosular/<önceki>`).
- Kural: yeni kalan örnek varsa değişiklik ya geri alınır ya da gerekçesi yazılır. Toplam yüzde artmış olsa bile.
- Kayıtlı gerçek model çıktıları testlere girer (havuz örneği: `yz/tests/test_gercek_ciktilar.py`); ayrıştırıcı ya da
  puanlayıcı değişince eski çıktılarla yeniden puanlanır. Gerçek denemede "sayısal" puanlayıcıya konum eklenince
  kayıtlı çıktılar yeniden puanlandı (0/10 → 1/10).

## Koşu hijyeni

| Ne                                   | Neden                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| Sıcaklık 0 (ya da sabit tohum)       | Fark değişiklikten gelsin, rastgelelikten değil           |
| Yanıt önbelleği                      | Tekrar koşuda maliyet sıfır, sonuç aynı                   |
| Kayıtta model kimliği + istem sürümü + şema sürümü + tarih | Sonuç geriye doğru açıklanabilsin   |
| Gecikme p50/p95, belirteç, maliyet   | Doğruluk tek başına karar vermez                          |
| Kategori kırılımı                    | Ortalama, çöken kategoriyi gizler                         |
| Etiket/yanıt dağılımı                | Tek yanıta kayma (hep "kargo", hep "Hayır") hemen görünür |
| Hatalı örnekleri okumak              | Puanlayıcının kendisi yanılıyor olabilir                  |

## Tuzaklar

| Belirti                                                     | Neden                                                 | Çözüm                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| %100 başarı ama kullanıcı memnun değil                      | Yalnız biçim ölçüldü                                  | Alan bazında doğruluk; olgu denetimi                        |
| Doğru yanıt "yanlış" sayılıyor                              | Normalleştirme yok ya da Türkçe kuralsız ("İADE" ≠ "iade") | Türkçe kurallı normalleştirme; eş değer yanıt listesi   |
| Sayısal görevde düşük puan, yanıtlar doğru görünüyor        | Puanlayıcı ilk sayıyı aldı; model soruyu yineledi     | `konum: son`; hatalı örnekleri okuyun                        |
| İstem değişikliği "iyileştirdi" ama başka kategori çöktü    | Yalnız toplam yüzdeye bakıldı                          | Kategori kırılımı + gerileme listesi                         |
| Sonuç koşudan koşuya değişiyor                              | Sıcaklık > 0, önbellek yok                             | Sıcaklık 0, tohum, önbellek                                  |
| Değerlendirme çok iyi, gerçekte kötü                        | Küme uydurma/kolay örnekler; sızıntı                   | Gerçek örnekler; değerlendirme örnekleri istemde/eğitimde yok |
| Hakem puanları anlamsız                                     | Küçük ya da yanlı hakem                                | Hakemi insan etiketiyle doğrulayın; ikili ölçütlü karar      |
| İki model "eşit" çıktı                                      | Küme küçük, fark gürültüde kaldı                       | Eşli karşılaştırma; örnek sayısını artırın                   |

## Denetim listesi

- [ ] Görev kümesi gerçek örneklerden; uç durumlar kategori etiketli; yanıtsız/uç örnekler var.
- [ ] Değerlendirme örnekleri az-örnek isteminde ve eğitim verisinde yok.
- [ ] Biçim geçerliliği ve doğruluk ayrı raporlanıyor; etiket/yanıt dağılımı yazılı.
- [ ] Normalleştirme Türkçe kurallı; sayısal puanlayıcıda konum seçildi.
- [ ] Koşu ayarları sabit (sıcaklık 0, aynı çıktı sınırı); model/istem/şema sürümü kayıtta.
- [ ] Önceki koşuyla örnek bazında karşılaştırıldı; yeni kalanlar okundu.
- [ ] Fark güven aralığı ya da eşli testle yorumlandı; küçük farka "iyileşme" denmedi.
- [ ] Hakem kullanıldıysa insan etiketli örneklerle doğrulandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Gerçek örneklerden 20–50 örneklik görev kümesi kur (YAML + JSONL). Biçim ve doğruluğu ayrı
  puanla. Önceki koşuyla örnek bazında karşılaştır; önceden geçip şimdi kalanları listele. Farkı güven aralığıyla
  yorumla." Havuz komutları: `python -m yz degerlendir`, `--onceki`, `python -m yz karsilastir`.
- **Modelin tipik hatası:** örnekleri kendisi uydurmak (kolay örnekler); yalnız ortalamayı raporlamak; tek koşudaki
  küçük farkı "iyileşme" saymak; puanlayıcıyı gevşeterek sonucu yükseltmek.
- **Çıktıda denetleyin:** kümenin kaynağı; puanlayıcı tanımı (normalleştirme, konum, tolerans); rapor kategori
  kırılımı ve gerileme listesi içeriyor mu; puanlayıcı değişikliği ayrı bir değişiklik olarak mı kaydedildi.
- Puanlayıcıyı değiştirmek "testi gevşetmek" olabilir: değişikliğin gerekçesini ve eski/yeni puanı birlikte isteyin.

## İlgili

- [RAG değerlendirme](rag-degerlendirme.md) · [Model seçimi](model-secimi.md) · [İstem mühendisliği](istem-muhendisligi.md) ·
  [Üretim hattı kalıpları](uretim-hatti-kaliplari.md)
- Havuz: [`puanlayici.py`](../../yz/yz/degerlendirme/puanlayici.py), [`kosu.py`](../../yz/yz/degerlendirme/kosu.py),
  [`karsilastir.py`](../../yz/yz/degerlendirme/karsilastir.py), [`rapor.py`](../../yz/yz/degerlendirme/rapor.py);
  örnek kümeler [`yz/gorevler/`](../../yz/gorevler/)
- İnce ayarlı modeli değerlendirme (taban karşılaştırması, sızıntı): [ince-ayar DEGERLENDIRME](../../ince-ayar/docs/DEGERLENDIRME.md)
- Genel ölçütler ve önyüklemeli güven aralığı: [Değerlendirme ölçütleri](../80-ml/degerlendirme-olcutleri.md);
  sızıntı türleri: [Veri sızıntısı](../80-ml/veri-sizintisi.md); olasılık temeli:
  [Olasılık temelleri](../92-matematik/olasilik-temelleri.md)
