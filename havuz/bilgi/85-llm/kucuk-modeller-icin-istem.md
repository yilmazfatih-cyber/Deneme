---
baslik: Küçük modeller için istem
ozet: Küçük modelin sınırları (uzun talimatı kaçırır, olumsuzu atlar, biçimden sapar, adımları karıştırır) ve karşı önlemler; gerçek 0,5B denemesinden kanıtlar, büyük ve küçük model istemi karşılaştırması.
etiketler: [llm, kucuk-model, istem, guvenilirlik, denetim]
duzey: orta
guncellik: 2026-11
---

# Küçük modeller için istem

> Bu notu ne zaman okumalı: İşi yerel ya da ucuz küçük bir modelle (yaklaşık 0,5–8 milyar parametre) yaptıracakken;
> büyük modelde çalışan bir istem küçük modelde bozulduğunda; "model bu işi görür mü?" kararından önce. Genel istem
> kuralları: [İstem mühendisliği](istem-muhendisligi.md).

## Temel fikir

Küçük model, büyük modelin "anlayıp toparladığı" işleri yapamaz: uzun talimatın bir kısmını uygular, olumsuzu atlar,
biçimden çıkar, bilmediğini uydurur, isteminizi yanıtına kopyalar. Çözüm modeli ikna etmek değil, **işi modele göre
tasarlamaktır**: tek görev, kısa ve kesin dil, örnek iskelet, kısıtlı çıktı, sıcaklık 0, işi zincire bölme ve en
önemlisi **çıktıyı kodla denetleme**. Biçimi mühendislik kurtarır; içerik doğruluğunu ancak ölçüm gösterir.
Havuzdaki gerçek deneme (Qwen2.5-0.5B-Instruct, CPU, açgözlü çözümleme) bunun somut kanıtıdır: biçim %100'e çıktı,
doğruluk çıkmadı.

## Gerçek denemeden ne öğrendik

Kaynak: [GERCEK_MODEL_DENEMESI](../../yz/docs/GERCEK_MODEL_DENEMESI.md) (16 Kasım 2026; tek model, küçük örneklem;
sayılar bu modele ve bu görevlere özgüdür, genellenemez).

| Gözlem                                                                 | Ders                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| JSON'u 6 çıktının 5'inde kod çitine (```json) sardı; düz `json.loads` 1/6, sağlam ayrıştırıcı 6/6 | Biçimi istemle değil, ayrıştırıcıyla kurtarın ([yapılı çıktı](yapili-cikti.md)) |
| Tarihi "15.03.2024" yazdı; İngilizce doğrulama iletisiyle 3 turda da düzeltmedi | Onarım iletisi Türkçe ve eyleme dönük olsun; düzeltilebileni kod düzeltsin |
| Türkçe tarih düzeltmesi + Türkçe ileti sonrası çıkarım 4/6 → 6/6        | Bilinen sapmayı istemle değil, doğrulamadan önce kodla giderin |
| Şemaya uyan 4 faturanın yalnız 1'inde numara + toplam + para birimi birlikte doğru | **Biçim geçerliliği doğruluk değildir**; ikisini ayrı ölçün |
| "$" geçen faturaya TRY, "EUR" geçene TRY; ara toplamı (850) genel toplam sandı | İçeriği kod kurallarıyla denetleyin (aşağıdaki denetçi)      |
| Kalemi olmayan faturalara "John Doe", "Özür", "Soyad" kalemleri uydurdu | Olmayabilecek alan için boş/`null` izni ve denetim          |
| Sınıflandırma %40; 15 yanıtın 7'si "kargo"; özet denetiminde 12 soruya da "Hayır" | Tek etikete kayma: ölçmeden fark edilmez; bu görev için model yetersiz |
| Aritmetik sorularda 10 kez yanlış araç (`tarih_ekle`), 2 kez `hesapla`  | Küçük modelde araç seçimine güvenmeyin; yönlendirmeyi kod yapsın |
| RAG yanıtına kaynak başlığını ve "Soru:" satırını kopyaladı             | İstem yankısını temizleyin; atıfı kod bulsun                 |
| "Türkiye'nin başkenti?" → "İstanbul"                                    | Bilgiyi modelden değil, belgeden/araçtan alın               |

Bir olası neden (kanıtlanmadı): örnek iskelet enum alanında ilk seçeneği (`"para_birimi": "TRY"`) ve kalem
listesinde bir örnek öğe gösteriyordu; yanlış para birimlerinin ikisi de TRY'ydi, uydurma kalemler de bu öğenin
yerini doldurdu. Küçük model iskeleti değer olarak kopyalayabilir; enum alanında seçenekleri (`"TRY|USD|EUR"`)
göstermeyi ve "kalem yoksa boş liste" örneğini kendi kümenizde deneyin.

## Sınırlar ve karşı önlemler

| Küçük modelin sınırı                         | Belirti                                         | Karşı önlem                                                                  |
| -------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Uzun talimatı kaçırır                        | Kuralların bir kısmı uygulanmıyor               | Tek görev; en çok 3–5 numaralı kural; gereksiz cümleyi silin                 |
| Olumsuzlamayı atlar                          | "Açıklama yazma" → açıklama yazıyor             | Olumlu talimat: "Yalnızca JSON yaz; ilk karakter `{` olsun"                  |
| Biçimden sapar                               | Kod çiti, önsöz, tek tırnak, eksik alan         | Şema kısıtı (destekleniyorsa) → araç çağrısı → iskelet + sağlam ayrıştırıcı  |
| Çok adımı karıştırır                         | Adımlar atlanıyor, sırası bozuluyor             | Zincire bölün; her adımın çıktısını doğrulayın ([zincirler](gorev-bolme-ve-zincirler.md)) |
| Bilgi uydurur                                | Emin, yanlış ad/rakam                           | Bilgiyi bağlamda verin; `null`/"bilinmiyor" izni; rakam denetimi             |
| Tek etikete kayar                            | Çıktıların çoğu aynı sınıf                      | Etiket tanımları + dengeli az-örnek; olmazsa sınıflandırıcı ince ayarı       |
| İstemi yankılar                              | "Soru:", kaynak başlığı yanıtta                 | Yankıyı kodla temizleyin; istem işaretlerini sade tutun                     |
| Uzun çıktıda döngüye girer                   | Aynı cümle yineleniyor, süre uzuyor             | Çıktı sınırı kısa; sıcaklık 0 yetmezse hafif yineleme cezası                 |
| Hesap yapamaz                                | Toplam, tarih farkı yanlış                      | Hesabı kod/araç yapsın; model yalnız sayıları çıkarsın                      |
| Araç seçiminde yanılır                       | Yanlış araç, uydurma argüman                    | Az araç; mümkünse aracı kod seçsin, model yalnız argüman doldursun          |

## Sıcaklık ve çıktı sınırı

| İş                                        | Sıcaklık | Çıktı sınırı (belirteç)          |
| ----------------------------------------- | -------- | -------------------------------- |
| Sınıflandırma                             | 0        | ~10                              |
| Çıkarım (JSON)                            | 0        | 200–400 (şemaya göre)            |
| Belgeye soru, kısa yanıt                  | 0        | 300–500                          |
| Değerlendirme hakemi (EVET/HAYIR)          | 0        | ~5                               |
| Yaratıcı metin, seçenek üretme            | 0,6–0,9 + tohum | ihtiyaca göre              |

Uzun çıktı sınırı küçük modelde zarar verir: model döngüye girer, süre uzar. Gerçek denemede 400 sınırıyla tek
çıkarım dakikalar sürdü, 200 ile ~20 saniye ([küçük model rehberi](../../yz/docs/KUCUK_MODEL_REHBERI.md)).

## Çıktıyı izinli değerlere indirme

Sınıflandırmada model "İade.", "Kategori: Kargo" ya da cümle yazar. Türkçe kuralla küçültüp izinli kümeye indirin;
iki etiket geçiyorsa ya da hiç yoksa **kabul etmeyin**, yeniden sorun ya da insana bırakın.

```python calistir
import re

ETIKETLER = ("iade", "fatura", "teknik", "kargo", "diger")
KATLA = str.maketrans("çğıöşü", "cgiosu")


def etiket_coz(cikti: str) -> str | None:
    """Serbest yanıttan TEK izinli etiketi çıkarır. Hiç yoksa ya da birden çoksa None: yeniden sor."""
    metin = cikti.replace("İ", "i").replace("I", "ı").lower().translate(KATLA)
    bulunan = {e for kelime in re.findall(r"\w+", metin) for e in ETIKETLER if kelime.startswith(e)}
    return bulunan.pop() if len(bulunan) == 1 else None


assert etiket_coz("İade.") == "iade"  # gerçek denemede model "İade" yazdı
assert etiket_coz("Kategori: Kargo") == "kargo"
assert etiket_coz("Diğer") == "diger"
assert etiket_coz("Bu bir iade talebidir.") == "iade"
assert etiket_coz("iade değil, kargo sorunu") is None  # iki etiket: belirsiz, kabul etme
assert etiket_coz("Bilmiyorum") is None
print("tamam")
```

```cikti
tamam
```

Bu yalnız **biçimi** düzeltir. Gerçek denemede biçim %100 iken doğruluk %40'tı; doğruluğu değerlendirme kümesi söyler.

## Denetçi adım: içeriği kodla denetleme

Küçük modelin çıkardığı değerleri, metindeki işaretlerle karşılaştıran kurallar yazın. Model gerekmez; ucuzdur;
gerçek denemedeki iki hatayı da yakalar. Sorun bulunursa: alanı ayrı bir kısa soruyla yeniden sorun, ya da kaydı
insana gönderin.

```python calistir
import re

SEMBOL = {"$": "USD", "€": "EUR", "₺": "TRY"}
SOZCUK = {"tl": "TRY", "try": "TRY", "lira": "TRY", "usd": "USD", "dolar": "USD", "eur": "EUR", "euro": "EUR", "avro": "EUR"}


def sayi(ham: str) -> float:
    """'1.020,00' (TR) ve '1,240.00' (EN): son ayraç ondalıktır; ardından 3 rakam geliyorsa binliktir."""
    ham = ham.rstrip(".,")
    son = max(ham.rfind(","), ham.rfind("."))
    if son == -1:
        return float(ham)
    tam, kesir = ham[:son].replace(".", "").replace(",", ""), ham[son + 1 :]
    return float(tam + kesir) if len(kesir) == 3 else float(f"{tam}.{kesir}")


def denetle(metin: str, cikti: dict) -> list[str]:
    """Küçük modelin çıkarımını koddaki kurallarla denetler; model gerektirmez."""
    kucuk = metin.replace("İ", "i").replace("I", "ı").lower()
    sorunlar = []
    if cikti["fatura_no"] not in metin:
        sorunlar.append(f"fatura_no {cikti['fatura_no']!r} metinde yok")
    gecen = {k for s, k in SEMBOL.items() if s in metin} | {SOZCUK[w] for w in re.findall(r"\w+", kucuk) if w in SOZCUK}
    if cikti["para_birimi"] not in gecen:
        sorunlar.append(f"para_birimi {cikti['para_birimi']}, metinde geçen: {', '.join(sorted(gecen)) or 'yok'}")
    toplamlar = re.findall(r"(?<!ara )(?:toplam|total)[^\d\n|]*?(\d[\d.,]*)", kucuk)
    if toplamlar and abs(sayi(toplamlar[-1]) - cikti["toplam"]) > 0.01:
        sorunlar.append(f"toplam {cikti['toplam']}, metindeki son 'toplam' {sayi(toplamlar[-1])}")
    return sorunlar


# Havuzdaki görev kümesinden iki fatura (yz/gorevler/json_cikarim.jsonl) ve gerçek denemedeki hatalı çıktılar
j02 = "INVOICE #INV-7781\nDate: 2025-02-03\nConsulting services (10 h)\nTotal due: $1,240.00"
j04 = "Belge No: 000457 | Tarih: 01.02.2025 | Ara toplam: 850,00 TL | KDV %20: 170,00 TL | Toplam: 1.020,00 TL"
print(denetle(j02, {"fatura_no": "INV-7781", "toplam": 1240.0, "para_birimi": "TRY"}))
print(denetle(j04, {"fatura_no": "000457", "toplam": 850.0, "para_birimi": "TRY"}))
assert denetle(j04, {"fatura_no": "000457", "toplam": 1020.0, "para_birimi": "TRY"}) == []
assert sayi("1.500") == 1500.0 and sayi("12,50") == 12.5 and sayi("1.234.567") == 1234567.0
```

```cikti
['para_birimi TRY, metinde geçen: USD']
["toplam 850.0, metindeki son 'toplam' 1020.0"]
```

Kurallar kusursuz değildir (ör. "1.500" İngilizce 1,5 olabilir); amaç her yanlışı yakalamak değil, **şüpheliyi
ayırmaktır**. Havuzdaki genel karşılıklar: Türkçe sayı/tarih `yz/yz/yapili/sema_araclari.py` (`turkce_sayi`,
`tarih_iso`), RAG yanıtında dayanaksız rakam ve ad `yz/yz/rag/yanit.py` (`dayanaksizlari_bul`).

## Aynı iş: büyük model istemi ve küçük model istemi

Büyük modelde çalışan istem (tek çağrı, serbest dil):

```text
Aşağıdaki faturayı incele ve muhasebe sistemine aktarılacak temel bilgileri çıkar: fatura numarası, ISO tarih,
satıcı, kalemler ve genel toplam. Para birimini sembolden ya da metinden anla. Emin olmadığın alanları boş bırak.
Sonucu JSON olarak ver.
```

Küçük model için aynı iş (alanlar azaltıldı, kurallar numaralı, biçim en sonda; kalemler ayrı çağrıda istenir):

```text
Metinden bilgi çıkar.
ALANLAR:
- fatura_no (metin): Fatura numarası
- toplam (sayı): "Toplam", "Genel toplam" ya da "Total" satırındaki tutar; "Ara toplam" değil
- para_birimi: TRY, USD ya da EUR. "$" = USD, "€" = EUR, "TL" = TRY
Kurallar:
1. Yalnızca metindeki bilgiyi kullan.
2. Metinde olmayan alan için null yaz.
METİN:
"""
{metin}
"""
Yalnızca JSON yaz. Biçim: {"fatura_no": "...", "toplam": 0.0, "para_birimi": "TRY|USD|EUR"}
```

Kod tarafı: sağlam ayrıştırıcı → Türkçe tarih/sayı düzeltmesi → şema doğrulama → yukarıdaki denetçi → sorunluysa
yalnız sorunlu alanı tek soruyla yeniden sor. Farklar: tek görev, ölçülebilir tanım ("ara toplam değil"),
sembol eşlemesi açıkça yazılı, enum seçenekleri iskelette tek değer olarak değil hepsi birden, biçim en sonda.

Sınıflandırma için küçük model istemi:

```text
Müşteri mesajını sınıflandır.
Etiketler:
- iade: ürünü geri vermek ya da parasını geri almak istiyor
- kargo: gönderinin yeri, gecikmesi, teslimatı
- fatura: ücret, ödeme, fatura belgesi
- teknik: uygulama ya da site çalışmıyor
- diger: yukarıdakilerin hiçbiri
Mesaj: """{mesaj}"""
Yalnızca etiketi yaz.
```

## Tuzaklar

| Belirti                                                      | Neden                                                | Çözüm                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| Büyük modelde çalışan istem küçükte bozuk çıktı veriyor      | Uzun, çok görevli, örtük beklentili istem             | Görevi bölün; kuralları numaralayın; biçimi sona yazın         |
| Onarım turları hiçbir şeyi düzeltmiyor                        | Hata iletisi İngilizce/teknik; model ne yapacağını anlamıyor | Türkçe, eyleme dönük ileti ("tarih YYYY-AA-GG, ör. 2024-03-15"); bilinen sapmayı kod düzeltsin |
| Onarım isteyince model başka alanları bozuyor (listeyi boşaltıyor) | Model tüm nesneyi yeniden yazarken unutuyor      | Yalnız hatalı alanı ayrı soruyla isteyin; geçerli alanları koruyun |
| Biçim %100, iş yine yanlış                                    | Biçim geçerliliği doğruluk sanıldı                    | Alan bazında doğruluğu ayrı ölçün; denetçi kurallar             |
| Bütün yanıtlar aynı etiket                                    | Model tek etikete kaydı                               | Etiket dağılımını raporlayın; tanım + dengeli örnek; olmazsa başka yol |
| Enum alanında hep ilk seçenek                                 | İskelet ilk seçeneği değer gibi gösterdi (olası)       | İskelette seçenekleri birlikte yazın; kümede ölçün             |
| Yanıtın başında istemdeki başlık ya da "Soru:" var           | İstem yankısı                                        | Yankı temizleyici; istem işaretlerini sade tutun               |
| İş akışı ajanla kuruldu, küçük model yanlış araç seçiyor     | Araç seçimi küçük model için zor                      | Yönlendirmeyi kural ya da sınıflandırıcıyla kod yapsın         |

## Denetim listesi

- [ ] Her çağrı tek iş yapıyor; kurallar numaralı ve en çok 5 tane.
- [ ] Bütün talimatlar olumlu; biçim satırı en sonda.
- [ ] Sıcaklık 0; çıktı sınırı işe göre kısa.
- [ ] Çıktı kod tarafında: sağlam ayrıştırma → bilinen sapma düzeltme → şema → içerik denetçisi.
- [ ] Onarım iletileri Türkçe ve örnekli; onarım yalnız hatalı alanı istiyor.
- [ ] Hesap, tarih farkı, araç seçimi gibi işler koda bırakıldı.
- [ ] Görev kümesinde biçim geçerliliği ve doğruluk **ayrı** raporlandı; etiket dağılımına bakıldı.
- [ ] Model yetersiz çıktıysa sırayla denendi: istemi sadeleştir → şemayı küçült → görevi böl → az-örnek → büyük
      model → (biçim sorunuysa) ince ayar.

## Küçük modele yaptırırken

Bu not, küçük modelin kendisinin başka bir küçük modele iş yaptıracağı durum için de geçerlidir:

- **İsteme yazın:** "Bir çağrıda tek iş. Kuralları numarala. Biçimi en sona yaz. Hesabı kodla yap. Çıktıyı
  denetleyen bir işlev de yaz." İstem kadar denetçiyi de isteyin.
- **Modelin tipik hatası:** büyük model gibi tek ve uzun bir istem yazmak; denetimi "model zaten doğru yazar"
  diye atlamak; onarım döngüsüne İngilizce kütüphane hata iletisini olduğu gibi vermek.
- **Çıktıda denetleyin:** sıcaklık ve çıktı sınırı yazılmış mı; ayrıştırma ve doğrulama adımı var mı; görev
  kümesinde biçim ve doğruluk ayrı sayılıyor mu; "kabul etme" (None) yolu var mı.
- Model "daha büyük model lazım" ya da "ince ayar lazım" derse önce ölçüm isteyin:
  `python -m yz karsilastir gorevler/<görev>.yaml --modeller <a> <b>` ([model seçimi](model-secimi.md)).

## İlgili

- [İstem mühendisliği](istem-muhendisligi.md) · [Hazır istem şablonları](istem-sablonlari.md) ·
  [Yapılı çıktı](yapili-cikti.md) · [Görev bölme ve zincirler](gorev-bolme-ve-zincirler.md) ·
  [Değerlendirme](degerlendirme.md) · [Model seçimi](model-secimi.md)
- Kanıt: [GERCEK_MODEL_DENEMESI](../../yz/docs/GERCEK_MODEL_DENEMESI.md); kurallar ve araçlar:
  [KUCUK_MODEL_REHBERI](../../yz/docs/KUCUK_MODEL_REHBERI.md)
- Kod: [`sablonlar.py`](../../yz/yz/istem/sablonlar.py) (küçük model şablonları),
  [`sema_araclari.py`](../../yz/yz/yapili/sema_araclari.py) (iskelet, Türkçe sayı/tarih, Türkçe hata iletisi),
  [`cikar.py`](../../yz/yz/yapili/cikar.py) (katmanlı çıkarım), [`semalar.py`](../../yz/yz/yapili/semalar.py) (örnek şemalar)
- Görev kümeleri: [`json_cikarim.yaml`](../../yz/gorevler/json_cikarim.yaml),
  [`siniflandirma.yaml`](../../yz/gorevler/siniflandirma.yaml)
- Küçük dil modeli sınıflandırmada yetmiyorsa klasik yol: [Metin sınıflandırma](../80-ml/metin-siniflandirma.md)
