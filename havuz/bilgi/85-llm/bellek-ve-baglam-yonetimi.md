---
baslik: Bellek ve bağlam yönetimi
ozet: Uzun konuşmada bağlam bütçesi, kayan pencere, özetleme ve getirerek hatırlama; sistem isteminin yeri, önemli bilginin konumu, bağlam doldukça kalite düşüşü ve özette kaybolan bilgiyi yakalama.
etiketler: [llm, baglam, bellek, sohbet, ozetleme, butce]
duzey: orta
guncellik: 2026-11
---

# Bellek ve bağlam yönetimi

> Bu notu ne zaman okumalı: Çok turlu sohbet, uzun süren bir ajan ya da uzun belgeyle çalışan bir akış kurarken;
> model konuşmanın başındaki bilgiyi "unuttuğunda", kuralı uygulamayı bıraktığında ya da bağlam taşma hatası
> verdiğinde.

## Temel fikir

Modelin hafızası yoktur. "Hafıza", her çağrıda bağlama geri koyduğunuz metindir ve bağlam sınırlıdır. Bütçeyi sırayla
dağıtın: önce çıktıya yer, sonra sistem istemi, sonra güncel ileti, kalanını en yeniden geriye doğru geçmiş ya da
geçmişin özeti ve getirilen anılar. Üç strateji vardır: **kayan pencere** (son N ileti), **özetleme** (eskiyi kısa
özete katla), **getirerek hatırlama** (eskiyi sakla, gerektiğinde ara). Konum önemlidir: kurallar başta, soru en
sonda; uzun bağlamın ortasındaki bilgi daha az kullanılır. Bağlam doldukça, özellikle küçük modelde, kalite düşer:
pencerenin hepsini doldurmak hedef değil, sınırdır.

## Karar tablosu

| Durum                                                         | Strateji                                           | Neden                                              |
| ------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Kısa sohbet (birkaç tur), bağlama rahat sığıyor               | Tamamını gönder                                    | En basit; bilgi kaybı yok                          |
| Uzun sohbet, eski ayrıntı önemsiz (destek, sohbet)            | Kayan pencere                                      | Ucuz, öngörülebilir                                |
| Uzun sohbet, eski bilgi önemli (sipariş no, karar, tutar)     | Özet + **kalıcı olgular** alanı + son N ileti     | Özet akışı korur; olgular asla özetlenmez          |
| Çok oturumlu, kullanıcıya özgü uzun süreli bilgi              | Getirerek hatırlama (anı deposu + arama)           | Her şeyi taşımadan ilgili olanı getirir            |
| Uzun belge üzerinde iş                                        | Bağlama sığdırmak yerine parçala + getir ya da eşle-indirge | [RAG tasarımı](rag-tasarimi.md), [belge](cok-modlu-ve-belge.md) |
| Ajan uzun çalışıyor, araç çıktıları birikiyor                 | Gözlemi kırp; eski adımları özetle                 | Araç çıktıları bağlamı en hızlı dolduran kalemdir  |
| Küçük model kuralları zamanla bırakıyor                       | Önemli kuralı son iletinin yanında kısaca yinele   | Model son okuduğunu daha iyi uygular              |

## Bağlam bütçesi

Sıra: **çıktı payı → sistem istemi → yeni ileti → (olgular, özet, getirilen anılar) → en yeniden geriye geçmiş.**
Sığmayan iletiyi atlayıp daha eskisini almayın; konuşmanın sürekliliği bozulur.

```python calistir
import math


def belirtec(metin: str) -> int:
    return math.ceil(len(metin) / 2.6)  # Türkçe için güvenli tahmin; gerçek sayım için belirteçleyici


def sigdir(sistem: str, gecmis: list[dict], yeni: dict, baglam: int = 1000, cikti: int = 300):
    """Önce çıktıya yer ayır, sonra sistem ve yeni ileti; kalan bütçeyi EN YENİDEN geriye doğru geçmişle doldur."""
    butce = baglam - cikti - belirtec(sistem) - belirtec(yeni["content"])
    if butce < 0:
        raise ValueError("sistem istemi + yeni ileti bağlama sığmıyor: kısaltın ya da bölün")
    secilen: list[dict] = []
    for ileti in reversed(gecmis):
        maliyet = belirtec(ileti["content"]) + 4  # rol işaretleri için pay
        if maliyet > butce:
            break  # aradakini atlayıp daha eskisini alma: konuşmanın sürekliliği bozulur
        secilen.insert(0, ileti)
        butce -= maliyet
    return [{"role": "system", "content": sistem}] + secilen + [yeni], len(gecmis) - len(secilen)


gecmis = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"{i}. ileti " + "x" * 190} for i in range(20)]
iletiler, atilan = sigdir("Kısa ve nazik yanıt ver. " * 8, gecmis, {"role": "user", "content": "Son sorum " * 10})
print(f"{len(iletiler) - 2} geçmiş iletisi sığdı, {atilan} eski ileti dışarıda kaldı; ilk kalan: {iletiler[1]['content'][:9]}")
toplam = sum(belirtec(i["content"]) + 4 for i in iletiler[1:-1]) + belirtec(iletiler[0]["content"]) + belirtec(iletiler[-1]["content"])
assert toplam <= 1000 - 300 and iletiler[-1]["content"].startswith("Son sorum")
```

```cikti
7 geçmiş iletisi sığdı, 13 eski ileti dışarıda kaldı; ilk kalan: 13. ileti
```

Havuzdaki karşılık: `yz/yz/istem/butce.py` (`BaglamButcesi`, `mesajlari_sigdir`, `parcalari_sigdir`; varsayılan pencere
4096, çıktı payı 512). Sayım tahminidir; kesin sayım için modelin belirteçleyicisini `sayac` olarak verin.

## Kayan pencere, özetleme, getirerek hatırlama

| Strateji              | Nasıl                                                     | Kaybettiği                          | Bedeli                                  |
| --------------------- | --------------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| Kayan pencere         | Son N ileti (ya da son N belirteç)                        | Pencereden çıkan her şey            | Yok                                     |
| Özetleme              | Eşik aşılınca eski iletiler bir özete katlanır            | Ayrıntı; özet **rakam ve adı** kaybedebilir | Özet başına bir model çağrısı     |
| Kalıcı olgular        | Sipariş no, ad, tutar, kararlar ayrı bir sözlükte; her çağrıda sistem iletisine | Yalnız olgu olmayanlar | Olguları çıkarmak (kod ya da çıkarım çağrısı) |
| Getirerek hatırlama   | Eski iletiler/notlar dizinlenir; soruya göre ilgili olanlar getirilir | Getirmenin kaçırdıkları   | Dizin + arama; getirme hatası riski     |

Özetleme adımını denetleyin: küçük model özette rakamları ve adları en sık kaybeden adımdır. Katlarken kaybolan
rakamları kodla bulun; kaybolan varsa yeniden özetletin ya da o bilgiyi kalıcı olgu olarak ayrı saklayın.

```python calistir
import re

SAYI = re.compile(r"\d+(?:[.,]\d+)?")


def katla(gecmis: list[dict], ozetci, korunan: int = 4) -> tuple[list[dict], list[str]]:
    """Son `korunan` ileti olduğu gibi kalır; eskiler tek özet iletisine katlanır.
    Özette kaybolan rakamlar raporlanır: özet, rakam ve adları en sık kaybeden adımdır."""
    eski, son = gecmis[:-korunan], gecmis[-korunan:]
    if not eski:
        return gecmis, []
    metin = "\n".join(f"{i['role']}: {i['content']}" for i in eski)
    ozet = ozetci(metin)
    kayip = sorted(set(SAYI.findall(metin)) - set(SAYI.findall(ozet)))
    return [{"role": "system", "content": f"Önceki konuşmanın özeti: {ozet}"}] + son, kayip


gecmis = [
    {"role": "user", "content": "1042 numaralı siparişimi iade etmek istiyorum."},
    {"role": "assistant", "content": "İade kodunuz IAD-77. Kargo ücreti 49,90 TL."},
    {"role": "user", "content": "Tamam, kargoya verdim."},
    {"role": "assistant", "content": "Teşekkürler, takip ediyorum."},
    {"role": "user", "content": "Para ne zaman yatar?"},
    {"role": "assistant", "content": "İade onayından sonra 3 iş günü içinde."},
]


def sahte_ozetci(metin: str) -> str:  # gerçekte: "Şu konuşmayı 3 cümlede özetle; tüm rakamları ve adları koru."
    return "Müşteri 1042 numaralı siparişin iadesini istedi; iade kodu IAD-77 verildi."


yeni, kayip = katla(gecmis, sahte_ozetci, korunan=4)
print(yeni[0]["content"])
print("özette kaybolan rakamlar:", kayip)
assert kayip == ["49,90"] and len(yeni) == 5  # uyarı: yeniden özetlet ya da kalıcı olgu olarak ayrı sakla
```

```cikti
Önceki konuşmanın özeti: Müşteri 1042 numaralı siparişin iadesini istedi; iade kodu IAD-77 verildi.
özette kaybolan rakamlar: ['49,90']
```

Havuzdaki özetleyen tampon: `yz/yz/istem/bellek.py` (`OzetleyenBellek`; son 6 ileti korunur, toplam 2000 belirteci
aşınca eskiler özete katlanır; `python -m yz sohbet` bunu kullanır).

## Sistem isteminin yeri

- Sistem istemi **her zaman ilk** iletidir ve kısa, kararlı kalır: rol, kalıcı kurallar, çıktı biçimi, tarih.
- Değişen veriyi (kullanıcı bilgisi, belge) sistem istemine gömmeyin; ayrı ileti yapın. Sabit önek önbelleğe
  alınabilir, değişen kısım sonda durur ([maliyet ve gecikme](maliyet-ve-gecikme.md)).
- Özet ve kalıcı olgular sistem isteminin hemen arkasına, ayrı bir sistem iletisi olarak gelir.
- Uzun konuşmada küçük model baştaki kuralı bırakabilir: en kritik 1–2 kuralı son kullanıcı iletisinin yanında kısa
  bir hatırlatma olarak yineleyin ("Yanıt: en çok 3 cümle, yalnızca Türkçe.").

## Önemli bilginin konumu

- Uzun bağlamda modeller başta ve sondaki bilgiyi ortadakinden daha iyi kullanma eğilimindedir; bu araştırmalarda
  "ortada kaybolma" (lost in the middle) olarak anılır. Kendi modelinizde aşağıdaki yöntemle ölçün.
- Belgeyle çalışırken: talimat başta, belge ortada, **soru ve biçim kuralı en sonda**. Çok uzun belgede talimatın
  kısa bir kopyasını sona da koyun.
- RAG'da en ilgili parçayı başa koyun; parça sayısını azaltın.

İğne testi (needle test) yöntemi: uzun bir bağlamın %10, %50, %90 konumlarına tek bir benzersiz olgu ("Depo kapı
kodu 7314'tür.") yerleştirip soruyu sorun; her konum ve bağlam uzunluğu için başarıyı ölçün. Bu, modelinizin
"rahat" bağlam uzunluğunu verir; değerlendirme kümesi olarak `python -m yz degerlendir` ile koşulabilir.

## Bağlam doldukça kalite düşüşü

| Belirti                                                    | Olası neden                                    | Ne yapılır                                           |
| ---------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Baştaki kural uygulanmıyor                                 | Kural uzun bağlamda gölgelendi                 | Kısa hatırlatma sonda; bağlamı küçültün              |
| Kişi/sipariş karıştırılıyor                                | Benzer varlıklar çok; özet bulanıklaştırdı     | Kalıcı olgular alanı; varlıkları ayrı adımda çıkarın |
| Yanıt yinelenmeye başladı                                  | Küçük model uzun bağlamda dağıldı              | Pencereyi daraltın; çıktı sınırı                     |
| Model belgedeki bilgiyi "yok" sayıyor                      | Bilgi ortada kaldı ya da sessizce kırpıldı     | Konumu değiştirin; girdi belirtecini sayın           |
| İlk belirteç süresi uzadı                                  | Her turda büyüyen geçmiş                       | Pencere/özet; önek önbelleği                         |

## Tuzaklar

| Belirti                                                  | Neden                                                      | Çözüm                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| "Bağlam uzunluğu aşıldı" hatası uzun sohbette             | Bütçe hesabı yok; çıktı payı ayrılmadı                     | Çıktı payı + en yeniden geriye sığdırma                    |
| Model önceki turda verilen sipariş numarasını unuttu     | Kayan pencereden çıktı ya da özet kaybetti                 | Kalıcı olgular alanı; özet denetimi                        |
| Özetten sonra tutarlar değişti                           | Özet rakamı yanlış yazdı ya da yuvarladı                    | Rakam karşılaştırması; rakamları olgu olarak saklayın      |
| Arada bir ileti eksik, model bağlamı yanlış kuruyor      | Sığmayan iletiyi atlayıp eskisini aldı                     | Sığmayan ilk iletide durun                                 |
| Sistem kuralları uzun konuşmada aşınıyor                 | Kural yalnız başta, bağlam uzun                            | Kısa hatırlatma sonda                                      |
| Getirilen "anı" alakasız                                 | Anı deposunda ilgililik eşiği yok                          | Eşik; anıyı tarih ve kaynakla sakla                        |
| Bütçe hesabı tutmuyor                                    | İngilizce oranla tahmin; rol işaretleri sayılmadı          | Türkçe oran; ileti başına pay ya da gerçek sayım           |

## Denetim listesi

- [ ] Bütçe sırası kodda: çıktı payı → sistem → yeni ileti → olgular/özet → en yeniden geriye geçmiş.
- [ ] Sığmayan iletide duruluyor; aradaki ileti atlanmıyor.
- [ ] Kalıcı olgular (no, ad, tutar, karar) ayrı tutuluyor ve her çağrıda gönderiliyor.
- [ ] Özetleme sonrası kaybolan rakam/ad denetleniyor.
- [ ] Sistem istemi kısa ve sabit; değişen veri ayrı iletide.
- [ ] Soru ve biçim kuralı bağlamın sonunda; kritik kural sonda kısaca yineleniyor.
- [ ] Modelin rahat bağlam uzunluğu iğne testiyle ölçüldü.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bağlam bütçesini çıktı payı, sistem, yeni ileti ve en yeniden geriye geçmiş sırasıyla hesapla.
  Sipariş no, ad, tutar gibi olguları ayrı bir sözlükte tut, özetleme. Özetten sonra rakamları karşılaştır."
  Özetletirken: "Şu konuşmayı en çok 3 cümlede özetle. Bütün rakamları, adları ve kararları aynen koru."
- **Modelin tipik hatası:** geçmişin tamamını her turda göndermek; özette rakamı yuvarlamak ya da atlamak; sistem
  istemine her tur değişen veriyi eklemek; bütçeyi İngilizce oranla hesaplamak.
- **Çıktıda denetleyin:** bütçe işlevi çıktı payı ayırıyor mu; özet denetimi var mı; olgular ayrı mı; uzun sohbet
  testi (40+ tur) var mı.

## İlgili

- [Maliyet ve gecikme](maliyet-ve-gecikme.md) · [RAG tasarımı](rag-tasarimi.md) · [Ajanlar ve araçlar](ajanlar-ve-araclar.md) ·
  [Dil modeli nasıl çalışır](llm-nasil-calisir.md)
- Havuz: [`butce.py`](../../yz/yz/istem/butce.py), [`bellek.py`](../../yz/yz/istem/bellek.py),
  [`metin.py`](../../yz/yz/metin.py) (`belirtec_tahmini`, `kirp`)
