---
baslik: Üretim hattı kalıpları
ozet: Model çağrısını üretimde güvenilir kılan kalıplar: yeniden deneme ve yedek model, toplam süre sınırı, yanıt önbelleği, hız sınırı, maskeli gözlemlenebilirlik, istem-model-şema birlikte sürümleme ve kademeli yayın.
etiketler: [llm, uretim, gozlemlenebilirlik, surumleme, yayin, dayaniklilik]
duzey: ileri
guncellik: 2026-11
---

# Üretim hattı kalıpları

> Bu notu ne zaman okumalı: Model kullanan bir özelliği gerçek kullanıcılara açmadan önce; sağlayıcı kesintisi,
> hız sınırı ya da açıklanamayan kalite düşüşü yaşandığında; istemi, modeli ya da şemayı canlıda değiştirirken.

## Temel fikir

Üretimde model çağrısı **güvenilmez bir dış bağımlılıktır**: yavaşlar, hata verir, hız sınırına takılır, aynı ad
arkasında davranışı değişir, bazen biçimi bozar. Hattı buna göre kurun: her çağrıda zaman aşımı ve sınırlı yeniden
deneme, gerekirse yedek model, toplam süre sınırı, belirlenimci istekler için önbellek, hız sınırı, her çağrının maskeli
kaydı. İstem, model ve şema **birlikte** sürümlenir; biri değişince sonuçlar karşılaştırılamaz. Değişiklik önce
görev kümesinde, sonra gölgede, sonra küçük bir kullanıcı diliminde denenir; geri alma tek bir ayarla yapılabilmelidir.

## Karar tablosu

| Sorun                                          | Kalıp                                                    | Dikkat                                                  |
| ---------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Geçici hatalar (429, 5xx, kopma)               | Titreşimli üstel geri çekilmeyle sınırlı yeniden deneme  | 400/401/422 yeniden denenmez ([maliyet ve gecikme](maliyet-ve-gecikme.md)) |
| Sağlayıcı uzun süre çöküyor                    | Yedek model/sağlayıcı                                    | Yedeğin kendi istemi ve ölçümü olmalı                   |
| Yedek denemeleri kullanıcıyı bekletiyor        | Toplam süre sınırı (son tarih)                           | Süre dolunca dürüst hata iletisi                        |
| Aynı istek tekrar tekrar geliyor               | Yanıt önbelleği                                          | Yalnız belirlenimci istek; anahtarda sürüm              |
| Kota aşımı, maliyet patlaması                  | Hız sınırı (istek ve belirteç), kullanıcı başına bütçe   | Kuyrukta bekleyen işi sınırlayın                        |
| "Dün çalışıyordu" kalite düşüşü                | Maskeli çağrı kaydı + sürüm kimliği + düzenli ölçüm      | Model kimliği tarihli kaydedilsin                       |
| İstem/model değişikliği riskli                 | Gölge → küçük dilim → genişletme; geri alma anahtarı      | Ölçüt kapıları önceden yazılı                           |

## Yeniden deneme, yedek model ve toplam süre

Yeniden deneme aynı sağlayıcıda geçici hatayı aşar; yedek model sağlayıcı çöktüğünde devreye girer. İkisi birlikte
kullanıcıyı dakikalarca bekletebilir; toplam süre sınırı koyun.

```python calistir
class GeciciHata(Exception):
    """429, 5xx, zaman aşımı: başka sağlayıcıyla denemeye değer."""


def yedekli_cagir(saglayicilar: list, istem: str, saat, son_tarih_sn: float) -> tuple[str, str]:
    """Sağlayıcıları sırayla dener. Toplam süre `son_tarih_sn`'yi aşarsa yenisine geçmez (kullanıcı beklemesin)."""
    bas, hatalar = saat(), []
    for ad, cagir in saglayicilar:
        if saat() - bas > son_tarih_sn:
            hatalar.append(f"{ad}: süre doldu, denenmedi")
            break
        try:
            return ad, cagir(istem)
        except GeciciHata as hata:
            hatalar.append(f"{ad}: {hata}")
    raise RuntimeError("hiçbir sağlayıcı yanıt vermedi: " + "; ".join(hatalar))


zaman = [0.0]


def birincil(istem: str) -> str:
    zaman[0] += 4.0
    raise GeciciHata("503")


def yedek(istem: str) -> str:
    zaman[0] += 1.0
    return "yedek modelden yanıt"


print(yedekli_cagir([("birincil", birincil), ("yedek", yedek)], "soru", lambda: zaman[0], son_tarih_sn=10))
try:
    zaman[0] = 0.0
    yedekli_cagir([("birincil", birincil), ("yedek", yedek)], "soru", lambda: zaman[0], son_tarih_sn=3)
except RuntimeError as hata:
    print(hata)
```

```cikti
('yedek', 'yedek modelden yanıt')
hiçbir sağlayıcı yanıt vermedi: birincil: 503; yedek: süre doldu, denenmedi
```

- Yedek model **başka bir modeldir**: aynı istem onda aynı sonucu vermez. Yedeğin istemini ayrı sürümleyin ve görev
  kümesinde ölçün; yanıtı hangi modelin verdiğini kayda yazın.
- Biçim doğrulaması başarısızsa yedek modele geçmek de bir seçenektir (kademelendirme; [model seçimi](model-secimi.md)).
- Bağlantı hatasında her katmanı ayrı ayrı denemeyin: sağlayıcı yoksa hemen dönün (havuz kararı `yz/docs/KARARLAR.md`
  K-03). Sağlayıcı profilleri ve yeniden deneme: `yz/yz/saglayici/kayit.py`, `yeniden_dene.py`, `yz.ornek.yaml`.

## Sürümleme ve yanıt önbelleği

Bir çıktıyı açıklamak için üçü birden gerekir: istem şablonu, model kimliği (tarihli), şema. Üçünü tek bir sürüm
kimliğinde birleştirin, her çıktıyla birlikte saklayın ve önbellek anahtarına katın.

```python calistir
import hashlib
import json


def surum_kimligi(istem_sablonu: str, model: str, sema: dict) -> str:
    """İstem + model + şema BİRLİKTE sürümlenir: biri değişince sonuçlar karşılaştırılamaz olur."""
    govde = json.dumps({"istem": istem_sablonu, "model": model, "sema": sema}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(govde.encode()).hexdigest()[:12]


def onbellek_anahtari(surum: str, iletiler: list[dict], ayarlar: dict) -> str | None:
    if ayarlar.get("sicaklik", 0) > 0 and "tohum" not in ayarlar:
        return None  # rastgele olması istenen yanıt önbelleğe alınmaz
    govde = json.dumps({"surum": surum, "iletiler": iletiler, "ayarlar": ayarlar}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(govde.encode()).hexdigest()


sema = {"toplam": "number", "para_birimi": ["TRY", "USD", "EUR"]}
v1 = surum_kimligi("Faturadan alanları çıkar.\n{metin}", "model-a@2026-11", sema)
v2 = surum_kimligi("Faturadan alanları çıkar. Ara toplam değil.\n{metin}", "model-a@2026-11", sema)
iletiler = [{"role": "user", "content": "Toplam: 1.020,00 TL"}]
print(v1, v2, v1 != v2)
assert onbellek_anahtari(v1, iletiler, {"sicaklik": 0}) != onbellek_anahtari(v2, iletiler, {"sicaklik": 0})
assert onbellek_anahtari(v1, iletiler, {"sicaklik": 0.7}) is None
```

```cikti
c879e83cc23a e64dc0bfc20d True
```

Önbellek kuralları: anahtar isteğin tamamını ve sürümü kapsar; süre sınırı (TTL) koyun; önbellek düz metin kişisel
veri içerir, erişimi kısıtlayın (havuz: `yz/yz/saglayici/onbellek.py` atomik yazar, yalnız sıcaklık 0 ya da tohumlu
istekleri saklar). Genel önbellek kararları: [Önbellek](../30-arkauc/onbellek.md).

## Hız sınırı

Sağlayıcının sınırına çarpmadan önce kendi sınırınızı koyun: istek/dakika ve belirteç/dakika, kullanıcı başına ve
toplam. Belirteç kovası (token bucket) ani yükü kapasite kadar kabul eder, sonra sabit hızla doldurur.

```python calistir
class Kova:
    """Belirteç kovası: dakikada `hiz` istek; en çok `kapasite` kadar ani yük. Saat parametreyle verilir."""

    def __init__(self, hiz_dakika: float, kapasite: float, saat) -> None:
        self.hiz, self.kapasite, self.saat = hiz_dakika / 60, kapasite, saat
        self.dolu, self.son = kapasite, saat()

    def al(self, miktar: float = 1) -> bool:
        simdi = self.saat()
        self.dolu = min(self.kapasite, self.dolu + (simdi - self.son) * self.hiz)
        self.son = simdi
        if self.dolu >= miktar:
            self.dolu -= miktar
            return True
        return False  # çağıran: bekle ya da kullanıcıya "biraz sonra" de


t = [0.0]
kova = Kova(hiz_dakika=30, kapasite=5, saat=lambda: t[0])
ilk = [kova.al() for _ in range(7)]  # aynı anda 7 istek: 5'i geçer
t[0] += 4  # 4 saniye sonra 2 belirteç birikmiş olur (30/dk = 0,5/sn)
sonra = [kova.al() for _ in range(3)]
print(ilk, sonra)
assert ilk.count(True) == 5 and sonra.count(True) == 2
```

```cikti
[True, True, True, True, True, False, False] [True, True, False]
```

Belirteç/dakika sınırı için `al(miktar=tahmini_belirtec)` kullanın. Toplu işleri kuyruğa alın, eşzamanlılığı
sınırlayın ([Arka plan işleri](../30-arkauc/arka-plan-isleri.md)).

## Gözlemlenebilirlik

Her model çağrısı için **tek bir yapılı kayıt** yazın. Ham istem ve yanıtı yazmayın; kısa, maskeli bir önizleme yeter.

| Alan                                  | Neden                                                   |
| ------------------------------------- | ------------------------------------------------------- |
| İstek kimliği, zaman                  | Kullanıcı şikâyetini kayda bağlamak                     |
| Sürüm kimliği, model kimliği, sağlayıcı | Hangi istem/model yanıt verdi (yedek dahil)           |
| Girdi/çıktı belirteci, maliyet        | Bütçe ve anormallik                                     |
| Gecikme (toplam, ilk belirteç)        | p50/p95 izleme                                          |
| Bitiş nedeni                          | "length" = kesik çıktı                                  |
| Doğrulama sonucu, onarım sayısı, ayrıştırma notları | Biçim kalitesinin zaman içindeki değişimi |
| Yedek/önbellek kullanıldı mı          | Kesinti ve tasarruf görünürlüğü                         |
| Maskeli önizleme (kırpılmış)           | Hata ayıklama; kişisel veri yok                         |

Kalıp doğrulama oranı, onarım oranı, yedeğe düşme oranı ve "length" oranı bir anda artarsa model ya da sağlayıcı
değişmiş olabilir. Havuz: maskeli JSONL günlük `yz/yz/saglayici/gunluk.py`; kural testi günlükte sır ve kişisel veri
kalmadığını denetler.

## Kademeli yayın

```python calistir
import hashlib
import json
import re


def kova_yuzdesi(kullanici_kimligi: str, deney: str) -> float:
    """Kararlı bölme: aynı kullanıcı aynı deneyde HER ZAMAN aynı tarafa düşer (rastgele değil)."""
    ozet = hashlib.sha256(f"{deney}:{kullanici_kimligi}".encode()).hexdigest()
    return int(ozet[:8], 16) / 0xFFFFFFFF * 100


def surum_sec(kullanici: str, yeni_yuzde: float) -> str:
    return "v2" if kova_yuzdesi(kullanici, "istem-v2") < yeni_yuzde else "v1"


secimler = [surum_sec(f"k{i}", 10) for i in range(1000)]
print("v2'ye düşen:", secimler.count("v2"), "/ 1000")
assert surum_sec("k42", 10) == surum_sec("k42", 10)  # kararlı
assert 50 < secimler.count("v2") < 150


def gunluk_kaydi(**alanlar) -> str:
    """Her çağrı tek JSON satırı. Metin önizlemesi maskeli ve kırpılmış; ham istem yazılmaz."""
    maskeli = re.sub(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "[EPOSTA]", alanlar.pop("onizleme"))
    maskeli = re.sub(r"(?<!\d)(?:\+90 ?|0)?5\d{2} ?\d{3} ?\d{2} ?\d{2}\b", "[TELEFON]", maskeli)
    return json.dumps({**alanlar, "onizleme": maskeli[:80]}, ensure_ascii=False)


print(gunluk_kaydi(istek="r-91", surum="a1b2c3d4e5f6", model="model-a@2026-11", girdi_belirteci=412,
                   cikti_belirteci=38, gecikme_ms=930, bitis="stop", dogrulama="gecti", onarim=0,
                   onizleme="ali@ornek.com 0532 123 45 67 numaralı hattım için fatura istiyor"))
```

```cikti
v2'ye düşen: 97 / 1000
{"istek": "r-91", "surum": "a1b2c3d4e5f6", "model": "model-a@2026-11", "girdi_belirteci": 412, "cikti_belirteci": 38, "gecikme_ms": 930, "bitis": "stop", "dogrulama": "gecti", "onarim": 0, "onizleme": "[EPOSTA] [TELEFON] numaralı hattım için fatura istiyor"}
```

Adımlar:

1. **Görev kümesi:** yeni sürüm eskisinden kötü değil; gerileme listesi boş ya da gerekçeli ([değerlendirme](degerlendirme.md)).
2. **Gölge (shadow):** yeni sürüm gerçek isteklerde arka planda çalışır, yanıtı kullanıcıya gösterilmez; doğrulama
   oranı, gecikme, maliyet ve eski sürümle anlaşma oranı karşılaştırılır.
3. **Küçük dilim:** kullanıcıların %5–10'u kararlı bölmeyle yeni sürüme; ölçüt kapıları önceden yazılı (ör. doğrulama
   oranı düşmeyecek, p95 %20'den fazla artmayacak, şikâyet artmayacak).
4. **Genişletme:** %25 → %50 → %100; her adımda aynı kapılar.
5. **Geri alma:** sürüm seçimi ayardan okunur; tek değişiklikle eski sürüme dönülür. Eski sürümün istemi, şeması ve
   model bağlantısı yayın bitene dek silinmez.

## Tuzaklar

| Belirti                                                     | Neden                                                   | Çözüm                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Kesintide kullanıcı 1–2 dakika bekliyor                     | Her sağlayıcıda tam yeniden deneme, toplam sınır yok    | Toplam süre sınırı; yedekte daha az deneme                  |
| Yedeğe düşünce biçim bozuldu                                | Yedek model aynı istemle ölçülmedi                      | Yedeğe ayrı istem sürümü + görev kümesi ölçümü              |
| İstem değişti ama önbellek eski yanıtı veriyor              | Anahtarda sürüm yok                                     | Sürüm kimliği anahtarda                                     |
| Kalite düştü, neden bilinmiyor                              | Kayıtta model/istem sürümü yok                          | Sürüm kimliği her çıktıda; doğrulama/onarım oranı izleme    |
| Bulut modeli sessizce değişti                               | Takma ad (en güncel) kullanıldı                         | Tarihli model kimliği; düzenli görev kümesi koşusu          |
| Günlükte müşteri telefonları                                | Ham istem günlüğe yazıldı                               | Maskeli, kırpılmış önizleme                                 |
| Deney grubu her istekte değişiyor                           | Rastgele bölme                                          | Kullanıcı kimliğinden kararlı karma                         |
| Geri almak saatler sürdü                                    | Sürüm kodda sabit, eski sürüm silinmiş                  | Sürüm ayardan; eski sürüm yayın boyunca hazır               |

## Denetim listesi

- [ ] Her çağrıda zaman aşımı; yeniden deneme yalnız geçici hatalarda, sınırlı ve titreşimli.
- [ ] Yedek model ayrı istem sürümüyle ölçüldü; toplam süre sınırı var; yanıtı hangi modelin verdiği kayıtta.
- [ ] Sürüm kimliği = istem + model + şema; her çıktıyla saklanıyor; önbellek anahtarında.
- [ ] Önbellek yalnız belirlenimci isteklerde; süre sınırlı; erişimi kısıtlı.
- [ ] Hız sınırı (istek + belirteç) ve kullanıcı başına bütçe var.
- [ ] Her çağrı tek yapılı kayıt; ham metin yok, önizleme maskeli; doğrulama/onarım/yedek/length oranları izleniyor.
- [ ] Yayın planı: görev kümesi → gölge → küçük dilim → genişletme; ölçüt kapıları ve geri alma tek ayar.

## Küçük modele yaptırırken

- **İsteme yazın:** "Model çağrısını sağlayıcı katmanından yap (zaman aşımı, yeniden deneme, önbellek, maskeli
  günlük orada). Sürüm kimliğini istem + model + şemadan üret ve her çıktıyla sakla. Saat ve rastgeleliği parametre
  al ki test edilebilsin. Yeni istem sürümünü ayar dosyasından seçilebilir yap."
- **Modelin tipik hatası:** her yerde ayrı ayrı `try/except` ile sonsuz yeniden deneme; önbellek anahtarını yalnız
  kullanıcı iletisinden üretmek; ham istemi günlüğe yazmak; deney grubunu `random()` ile seçmek; model adını koda gömmek.
- **Çıktıda denetleyin:** yeniden denenen hata kodları; toplam süre sınırı; önbellek anahtarının içeriği; günlük
  satırında ham metin var mı; sürüm seçimi ayardan mı; geri alma testi var mı.

## İlgili

- [Maliyet ve gecikme](maliyet-ve-gecikme.md) · [Değerlendirme](degerlendirme.md) · [LLM güvenliği](llm-guvenligi.md) ·
  [Model seçimi](model-secimi.md)
- Havuz: [`taban.py`](../../yz/yz/saglayici/taban.py) (ortak çağrı akışı), [`yeniden_dene.py`](../../yz/yz/saglayici/yeniden_dene.py),
  [`onbellek.py`](../../yz/yz/saglayici/onbellek.py), [`gunluk.py`](../../yz/yz/saglayici/gunluk.py),
  [`kayit.py`](../../yz/yz/saglayici/kayit.py), [`yz.ornek.yaml`](../../yz/yz.ornek.yaml)
- Genel arka uç kalıpları: [Önbellek](../30-arkauc/onbellek.md), [Arka plan işleri](../30-arkauc/arka-plan-isleri.md),
  [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md), [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md)
  (devre kesici, yük atma), [Gözlemlenebilirlik](../40-sistem-tasarimi/gozlemlenebilirlik.md),
  [Hız sınırı ve kötüye kullanım](../30-arkauc/hiz-siniri-ve-kotuye-kullanim.md)
