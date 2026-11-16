---
baslik: Görev bölme ve model çağrısı zincirleri
ozet: Büyük işi model çağrıları zincirine bölme kalıpları (sınıflandır-yönlendir, çıkar-doğrula-biçimle, eşle-indirge), adımlar arası doğrulama, hata yayılımı hesabı ve tek çağrının yettiği durumlar.
etiketler: [llm, zincir, gorev-bolme, dogrulama, is-akisi]
duzey: orta
guncellik: 2026-11
---

# Görev bölme ve model çağrısı zincirleri

> Bu notu ne zaman okumalı: Tek bir istemle yaptırılan iş yarım ya da tutarsız çıkıyorsa; bir işi birden çok model
> çağrısına bölmeyi düşünüyorsanız; ya da tersine, kurulmuş bir zincirin gereksiz pahalı olduğundan
> şüpheleniyorsanız.

## Temel fikir

Bir çağrıda tek iş, küçük model için en güvenilir kuraldır. Büyük işi adımlara bölün: her adım **dar bir görev**,
her adımın sonunda **kodla doğrulama**, geçmeyen çıktı **asla** sonraki adıma gitmez. Modelin iyi olmadığı adımları
(hesap, biçimlendirme, yönlendirme, birleştirme) koda verin; model yalnız anlam gerektiren adımı yapsın. Bedeli: daha
çok çağrı, daha çok gecikme. Bu yüzden zinciri **ölçerek** kurun: tek çağrıya göre doğruluk artmıyorsa zincir
gereksizdir. Hatalar çarpılarak büyür: her adımı %90 doğru beş adımlık zincir doğrulamasız %59 doğrudur.

## Karar tablosu

| Durum                                                          | Seçim                                  | Neden                                                     |
| -------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| İş tek ve dar (bir sınıflandırma, bir çıkarım, bir soru)       | **Tek çağrı**                          | Zincir yalnız gecikme ve maliyet ekler                    |
| Girdi türüne göre farklı işlem gerekiyor                       | Sınıflandır → yönlendir                | Her dal kısa ve kendi istemine sahip olur                 |
| Hem anlama hem katı biçim isteniyor, biçim tutmuyor            | Çıkar → doğrula → biçimle (biçim kodda) | Model anlamı, kod biçimi üretir                           |
| Belge bağlama sığmıyor ya da çok uzun                          | Eşle-indirge (map-reduce)              | Her parça küçük modelin rahat okuyacağı boyda             |
| Çok alanlı çıkarımda bazı alanlar hep yanlış                   | Sorunlu alanları ayrı adımda sorun     | Küçük model az alanlı soruda daha doğru                   |
| Çıktının kalitesi denetlenebilir (kural, test, kaynak)          | Üret → denetle → (gerekirse) yeniden   | Denetçi hatayı yakalarsa yeniden deneme işe yarar         |
| Adım sayısı ve sırası girdiye göre değişiyor                   | Ajan ya da planla-yürüt-denetle        | Ancak ölçülmüş kazanç varsa ([ajanlar](ajanlar-ve-araclar.md)) |
| Büyük model kullanılabiliyor ve tek çağrı yeterince doğru      | Tek çağrı                              | Zinciri büyük modele kurmak çoğu zaman gereksizdir        |

## Kalıplar

### 1. Sınıflandır → yönlendir

Ucuz bir sınıflandırma (kısa istem, ~10 belirteç çıktı) girdiyi dallara ayırır; her dalın kendi istemi, aracı ya da
kod yolu vardır. Bilinmeyen ya da belirsiz etiket **ayrı bir dala** (insana, genel yanıta) gider; asla rastgele bir
dala düşmez. Sınıflandırıcının kendi doğruluğunu ölçün: gerçek denemede 0,5B model 5 sınıfta %40'ta kaldı
([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md)). Böyle bir modelle yönlendirme yapılmaz; ya daha büyük model
ya da küçük bir sınıflandırıcı ince ayarı ([ince ayar kararı](ince-ayar-karari.md)) ya da anahtar sözcük kuralları.

### 2. Çıkar → doğrula → biçimle

- Model yalnız değerleri çıkarır (JSON, az alan).
- Kod doğrular: şema, bilinen sapmaların düzeltilmesi (Türkçe tarih/sayı), içerik kuralları
  ([küçük modeller için istem](kucuk-modeller-icin-istem.md) denetçisi).
- Kod biçimler: kullanıcıya giden metin, e-posta, tablo şablonla üretilir. Model biçimlendirirse rakamı değiştirebilir.

### 3. Eşle-indirge (map-reduce)

Uzun belge parçalara bölünür; her parça ayrı özetlenir/çıkarılır (eşle); ara sonuçlar birleştirilir (indirge).
Birleştirme de sığmıyorsa bir seviye daha (en çok 2–3 seviye). Her seviyede rakamlar kaynakta aranır; parça sınırında
kaybolmasın diye örtüşme bırakılır. Gerçekleme örneği: depo kökündeki `ozetci` projesinin `ozetci/summarize/llm.py`
dosyası; ayrıntı: [çok kipli girdi ve belge](cok-modlu-ve-belge.md).

### 4. Üret → denetle

Bir adım üretir, sonraki adım denetler. Denetçi önce **kod** olsun (şema, kural, test, kaynakta arama); ancak kodla
denetlenemiyorsa model-hakem kullanın ve hakemi ayrıca ölçün ([değerlendirme](degerlendirme.md)). Gerçek denemede
0,5B model "özet doğru mu?" sorularının hepsine "Hayır" dedi: küçük model hakem olarak güvenilmez olabilir.

### 5. Planla → yürüt → denetle

Model önce plan yazar, sonra adımları araçlarla yapar, sonunda denetler. Havuzdaki örnek `yz/ornekler/coklu_ajan.py`
kendi başlık yorumunda uyarır: tek adımlık işte 3–6 kat çağrı ve gecikme; küçük modelin planı da hatalı olabilir.
Yalnız ölçülmüş kazançla kullanın.

## Adımlar arası doğrulama: çalışan iskelet

Her adım `(bağlam, önceki hata) → çıktı` ve `çıktı → hata | None` çiftidir. Hata metni modele geri verilir; deneme
hakkı bitince zincir **durur**. Sahte model betikli yanıt verir; gerçek modelde aynı iskelet çalışır
(havuzdaki karşılığı: `yz/yz/ajan/is_akisi.py`, `IsAkisi` ve `IsAdimi`).

```python calistir
import json
import re
from dataclasses import dataclass
from typing import Any, Callable


class SahteModel:
    """Betikli yanıtlar: gerçek model yerine sırayla döner; gelen istemleri saklar."""

    def __init__(self, yanitlar: list[str]) -> None:
        self.yanitlar, self.istemler = list(yanitlar), []

    def __call__(self, istem: str) -> str:
        self.istemler.append(istem)
        return self.yanitlar.pop(0)


@dataclass
class Adim:
    ad: str
    calistir: Callable[[dict, str | None], Any]  # (bağlam, önceki hata) -> çıktı
    dogrula: Callable[[Any], str | None]  # None: geçti; metin: neden kaldı (modele geri verilir)


def zincir(adimlar: list[Adim], girdi: str, azami_deneme: int = 2) -> dict:
    baglam: dict[str, Any] = {"girdi": girdi}
    for adim in adimlar:
        hata = None
        for _ in range(azami_deneme):
            cikti = adim.calistir(baglam, hata)
            if (hata := adim.dogrula(cikti)) is None:
                baglam[adim.ad] = cikti
                break
        else:  # geçersiz çıktı sonraki adıma ASLA gitmez
            raise RuntimeError(f"'{adim.ad}' {azami_deneme} denemede geçmedi: {hata}")
    return baglam


model = SahteModel(["Kargo.", '```json\n{"siparis_no": "A12"}\n```', '{"siparis_no": "A12", "sehir": null}'])
ETIKETLER = {"iade", "kargo", "fatura", "diger"}


def siniflandir(baglam: dict, hata: str | None) -> str:
    return model(f"Mesajı sınıflandır: {baglam['girdi']}\nYalnızca etiketi yaz.").strip(" .").lower()


def sinif_dogrula(cikti: str) -> str | None:
    return None if cikti in ETIKETLER else f"etiket şunlardan biri olmalı: {sorted(ETIKETLER)}"


def alan_cikar(baglam: dict, hata: str | None) -> dict | None:
    istem = f"Sipariş no ve şehri JSON olarak çıkar: {baglam['girdi']}"
    if hata:
        istem += f"\nÖnceki yanıtın kurala uymadı: {hata}"
    try:
        return json.loads(re.sub(r"^```\w*\s*|\s*```$", "", model(istem).strip()))
    except json.JSONDecodeError:
        return None  # ayrıştırılamayan çıktı da bir doğrulama hatasıdır


def alan_dogrula(cikti: dict | None) -> str | None:
    if cikti is None:
        return "JSON okunamadı; yalnızca JSON yaz"
    return None if {"siparis_no", "sehir"} <= cikti.keys() else "sehir alanı eksik; metinde yoksa null yaz"


def yanit_yaz(baglam: dict, hata: str | None) -> str:  # model yok: biçimlendirmeyi şablon yapar
    return f"{baglam['alanlar']['siparis_no']} numaralı siparişiniz kargoda."


adimlar = [Adim("sinif", siniflandir, sinif_dogrula), Adim("alanlar", alan_cikar, alan_dogrula),
           Adim("yanit", yanit_yaz, lambda cikti: None)]
sonuc = zincir(adimlar, "A12 numaralı siparişim nerede?")
print(sonuc["sinif"], sonuc["alanlar"], "|", sonuc["yanit"])
assert len(model.istemler) == 3 and "sehir alanı eksik" in model.istemler[2]
```

```cikti
kargo {'siparis_no': 'A12', 'sehir': None} | A12 numaralı siparişiniz kargoda.
```

Dikkat edilecekler: onarım isteminde **yalnız eksik olanı** isteyin (gerçek denemede tüm nesneyi yeniden yazdıran
onarımda model kalem listesini boşalttı); geçerli alanları kodda saklayın ve birleştirin.

## Hata yayılımı

Adımların hataları çarpılır. Doğrulayıcı hatayı yakalarsa yeniden deneme onu düzeltebilir; yakalayamazsa yanlış
çıktı **sessizce** sonraki adıma gider. Asıl belirleyici, denetçinin yakalama oranıdır.

```python calistir
def adim_olasiliklari(p: float, yakalama: float, yeniden: int) -> tuple[float, float]:
    """Bir adımın (doğru, sessizce yanlış) olasılığı. Doğrulayıcı hatanın `yakalama` kadarını yakalar,
    yakalanan hata `yeniden` kez yeniden denenir. Hatalar bağımsız varsayılır (iyimser)."""
    dongu = sum(((1 - p) * yakalama) ** i for i in range(yeniden + 1))
    return p * dongu, (1 - p) * (1 - yakalama) * dongu


for yakalama, yeniden in [(0.0, 0), (1.0, 1), (0.5, 1), (1.0, 2)]:
    dogru, sessiz = adim_olasiliklari(0.9, yakalama, yeniden)
    print(f"yakalama {yakalama:.0%}, yeniden {yeniden}: 5 adımlık zincir doğru {dogru ** 5:.1%}, "
          f"adım başına sessiz hata {sessiz:.1%}")

assert round(0.9 ** 5, 3) == 0.59  # doğrulamasız 5 adım: her adım %90 iken zincir %59
```

```cikti
yakalama 0%, yeniden 0: 5 adımlık zincir doğru 59.0%, adım başına sessiz hata 10.0%
yakalama 100%, yeniden 1: 5 adımlık zincir doğru 95.1%, adım başına sessiz hata 0.0%
yakalama 50%, yeniden 1: 5 adımlık zincir doğru 75.4%, adım başına sessiz hata 5.2%
yakalama 100%, yeniden 2: 5 adımlık zincir doğru 99.5%, adım başına sessiz hata 0.0%
```

Okuma: tam yakalayan denetçiyle kalan yüzde "sessiz yanlış" değil, **görünür durmadır** (insana gider). Varsayım
iyimserdir: gerçekte aynı girdide model aynı hatayı yineler (gerçek denemede 3 turda da aynı tarih). Bu yüzden
yeniden denemede istemi değiştirin (hata iletisi, daha dar soru) ya da sonraki katmana geçin; aynı istemi sıcaklık 0
ile tekrarlamak aynı yanıtı verir.

## Adım tasarım kuralları

1. **Her adımın girdisi ve çıktısı yazılı bir sözleşme** (alan adları, tipler). Adımlar arası veri sözlük/JSON,
   serbest metin değil.
2. **Modelin yapmadığı adımı kod yapsın:** hesap, tarih, birleştirme, sıralama, biçimlendirme, yönlendirme.
3. **Adım sayısını en aza indirin:** her adım gecikme ve hata kaynağıdır. İki ardışık model adımı tek çağrıda
   birleşebiliyorsa (ölçerek) birleştirin.
4. **Ara sonuçları kaydedin:** hangi adımın bozduğunu görmek için her adımın girdisi, çıktısı ve doğrulama sonucu
   döküme yazılsın (havuz: `IsAkisi` adım kayıtları, ajan dökümü `yz/yz/web/kayit.html`).
5. **Durma davranışı tanımlı olsun:** deneme hakkı bitince ne olur? Kullanıcıya dürüst ileti, kayıt, insana devir.
6. **Bağımsız adımları paralel koşun** (eşle aşaması): gecikme en uzun parçaya iner; eşzamanlılığı sunucu sınırına
   göre kısın ([maliyet ve gecikme](maliyet-ve-gecikme.md)).

## Tuzaklar

| Belirti                                                    | Neden                                                    | Çözüm                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Zincir tek çağrıdan daha kötü sonuç veriyor                | İlk adımın hatası sonrakilere yayıldı                    | Her adıma doğrulayıcı; ilk adımın doğruluğunu ayrıca ölçün  |
| Son yanıtta rakam kaynakla tutmuyor                         | Biçimlendirmeyi model yaptı, sayıyı değiştirdi           | Biçimlendirmeyi şablona verin; rakamları kaynakta denetleyin |
| Yeniden deneme hiç düzeltmiyor                             | Aynı istem, sıcaklık 0: aynı yanıt                       | Hata iletisini isteme ekleyin; daha dar soru; sonraki katman |
| Gecikme kabul edilemez                                     | Ardışık çok adım                                         | Adım birleştirme, paralel eşleme, küçük adımlara küçük model |
| Belirsiz girdiler yanlış dala gidiyor                       | Yönlendiricinin "bilinmiyor" çıkışı yok                  | Belirsiz → ayrı dal (insan/genel yanıt)                      |
| Birleştirme adımı parçalardaki bilgiyi kaybediyor          | İndirge istemi her şeyi kısaltıyor; sınırda bölünen cümle | Örtüşme; birleştirmede "her bölümden en az bir madde" kuralı |
| Hangi adımın bozduğu bulunamıyor                           | Ara sonuçlar kaydedilmiyor                               | Adım dökümü; her adımın ayrı ölçümü                         |
| Planlayıcılı yapı pahalı ve kararsız                        | Gereksiz ajan                                            | Sabit zincire dönün; ajanı ancak ölçülmüş kazançla tutun    |

## Denetim listesi

- [ ] Tek çağrıyla karşılaştırıldı; zincirin doğruluk kazancı ve ek gecikmesi kayıtlı.
- [ ] Her model adımının dar bir görevi ve kodda bir doğrulayıcısı var.
- [ ] Geçersiz çıktı sonraki adıma gidemiyor; deneme hakkı bitince tanımlı bir durma yolu var.
- [ ] Hesap, biçimlendirme, yönlendirme ve birleştirme kodda.
- [ ] Yönlendiricinin "bilinmiyor/belirsiz" dalı var.
- [ ] Onarım istemi yalnız eksik/yanlış alanı istiyor; geçerli alanlar korunuyor.
- [ ] Her adımın girdisi, çıktısı ve doğrulama sonucu kaydediliyor.
- [ ] Adım bazında doğruluk ayrı ölçüldü (hangi adım zayıf?).

## Küçük modele yaptırırken

- **İsteme yazın:** "İşi adımlara böl. Her adım için girdi, çıktı alanları ve doğrulama işlevi yaz. Hesap ve
  biçimlendirme adımlarını kodla yap. Geçmeyen çıktıda zincir dursun." Havuzdaki iskeleti gösterin:
  `yz/yz/ajan/is_akisi.py`.
- **Modelin tipik hatası:** her adımı yine modele yaptırmak (biçimlendirmeyi bile); doğrulayıcıyı `return None`
  yazıp geçmek; yeniden denemede aynı istemi göndermek; hata durumunda zinciri sessizce sürdürmek.
- **Çıktıda denetleyin:** her `dogrula` işlevi gerçekten bir şey denetliyor mu; durma yolu test edilmiş mi (sahte
  modelle hatalı yanıt verip zincirin durduğunu gösteren test); kaç model çağrısı yapıldığı sayılıyor mu.
- Zinciri ona ölçtürün: tek çağrı ve zincir aynı görev kümesinde, doğruluk + toplam çağrı + süre tablosu.

## İlgili

- [Küçük modeller için istem](kucuk-modeller-icin-istem.md) · [Yapılı çıktı](yapili-cikti.md) ·
  [Ajanlar ve araçlar](ajanlar-ve-araclar.md) · [Değerlendirme](degerlendirme.md) ·
  [Çok kipli girdi ve belge](cok-modlu-ve-belge.md)
- Havuz: [`is_akisi.py`](../../yz/yz/ajan/is_akisi.py) (doğrulamalı adımlar),
  [`coklu_ajan.py`](../../yz/ornekler/coklu_ajan.py) (planla-yürüt-denetle ve ne zaman gereksiz olduğu),
  [`cikar.py`](../../yz/yz/yapili/cikar.py) (katmanlar arası geri çekilme)
- Görev bölme tablosu: [KUCUK_MODEL_REHBERI](../../yz/docs/KUCUK_MODEL_REHBERI.md) §5
- Genel iş bölme yöntemi: [İşi parçalama](../00-yontem/isi-parcalama.md)
