---
baslik: Dil modelleri hakkında sık yanılgılar
ozet: Sıcaklık 0, uzun istem, kaynak gösterme, ince ayar, büyük bağlam, biçim geçerliliği, model güveni gibi konularda yaygın yanlış inanışlar, doğrusu ve ne yapılacağı; çalışan karşı örneklerle.
etiketler: [llm, yanilgi, karar, guvenilirlik, temel-kavram]
duzey: temel
guncellik: 2026-11
---

# Dil modelleri hakkında sık yanılgılar

> Bu notu ne zaman okumalı: Bir model kararı "herkes böyle yapıyor" ya da "model öyle dedi" gerekçesiyle
> verilecekken; bir modelin (küçük model dahil) dil modelleri hakkında yazdığı bir öneriyi kabul etmeden önce;
> bir sorunun nedeni bulunamadığında.

## Temel fikir

Dil modelleriyle ilgili en pahalı hatalar teknik değil, **yanlış inançtan** gelir: "sıcaklık 0 her zaman aynı yanıtı
verir", "kaynak gösterdiyse doğrudur", "ince ayar bilgi ekler". Bu inançlar modellerin eğitim verisinde de bolca
geçer; küçük bir model bunları kendinden emin biçimde önerir. Aşağıdaki tablo her yanılgının doğrusunu ve pratikte ne
yapılacağını verir. Ortak ders: model davranışı hakkındaki her iddiayı **kendi görev kümenizde ölçün** ve kritik
çıktıyı **kodla denetleyin**.

## Yanılgılar tablosu

| Yanılgı                                              | Doğrusu                                                                                      | Ne yapılır                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| "Sıcaklık 0 = her seferinde aynı yanıt"              | Çoğu zaman aynı ama garanti değil: sunucu toplu işleme, donanım ve sürüm farkı başa baş adaylarda seçimi çevirir | Yanıtı saklayın (önbellek); istem + model sürümünü kaydedin |
| "Sıcaklık 0 = daha doğru"                            | Yalnız daha tutarlı; en olası aday yanlışsa **her seferinde aynı yanlış**                   | Doğruluğu görev kümesiyle ölçün                                   |
| "Daha uzun, daha ayrıntılı istem = daha iyi"         | Kurallar birbirini gölgeler; küçük model kaçırır; maliyet ve gecikme artar                  | Kısa, ölçülebilir, tek görev; her eklemeyi ölçün                  |
| "Model kaynak gösterdiyse doğrudur"                  | Atıf da üretilen metindir: yanlış kaynağa ya da olmayan kaynağa atıf olur                    | Atıfı ve rakamları kodla kaynakta denetleyin                      |
| "İnce ayar modele bilgi ekler"                       | Davranış ve biçim öğretir; az veriyle bilgi ezberletmek uydurmayı artırır                   | Bilgi için RAG ([ince ayar kararı](ince-ayar-karari.md))          |
| "Büyük bağlam = model hepsini okur ve kullanır"      | Ortadaki bilgi daha az kullanılır; dolu bağlamda kalite düşer; her belirteç para ve süre     | Az ve ilgili bağlam; konum; iğne testi ([bağlam](bellek-ve-baglam-yonetimi.md)) |
| "Şemaya uyan JSON = doğru yanıt"                     | Gerçek denemede 6/6 geçerli JSON, dört faturanın yalnız birinde üç alan birlikte doğru       | Biçim ve doğruluğu ayrı ölçün ([yapılı çıktı](yapili-cikti.md))   |
| "Şema/JSON kipi açıksa doğrulamaya gerek yok"        | Kısıt biçimi korur, değeri değil; sunucu kısıtı sessizce kapanabilir; çıktı kesilebilir       | Ayrıştırma + doğrulama her zaman                                  |
| "Belirteç = kelime"                                  | Türkçe kelime çoğu zaman birkaç belirteçtir; ölçümde aynı metin 1,5–2 kat belirteç           | Türkçe metinle sayın ([nasıl çalışır](llm-nasil-calisir.md))     |
| "Model hesap yapar, sayar"                           | Belirteçlerle çalışır; aritmetik, tarih farkı, harf sayma güvenilmez                         | Hesabı araç/kod yapsın                                            |
| "İsteme 'uydurma' yazmak uydurmayı önler"            | Olumsuz talimat zayıftır; boş bırakma izni yoksa model doldurur                             | "Yoksa null yaz" + kaynakta doğrulama                             |
| "Model 'eminim' diyorsa güvenilir"                   | Sözle söylenen güven ölçülmüş bir olasılık değildir                                         | Kural tabanlı denetçi; düşük güveni insana gönderin ([kalibrasyon](../80-ml/kalibrasyon-ve-olasilik.md)) |
| "Model kendi hatasını görüp düzeltir"                | Bazen; küçük model aynı hatayı yineler (gerçek denemede 3 turda aynı tarih)                 | Bilinen sapmayı kod düzeltsin; Türkçe örnekli ileti; tur sınırı   |
| "Model bugünün tarihini ve kendi sürümünü bilir"     | Bilmez; kesim tarihinde donmuştur                                                            | Tarihi isteme yazın; model kimliğini kayıttan alın                |
| "Sistem istemi gizlidir"                             | Kullanıcı yanıtta gösterttirebilir                                                          | İsteme sır koymayın ([güvenlik](llm-guvenligi.md))                |
| "İstem enjeksiyonu iyi bir filtreyle çözülür"        | Tam çözümü yok; filtre başka sözcükle aşılır                                                | Yetki daraltma, onay, çıktı doğrulama                             |
| "Yeni ya da büyük model her işte daha iyidir"        | Göreve ve dile göre değişir; maliyet ve gecikme artar                                       | Kendi kümenizde ölçün; en küçük yeterli model ([seçim](model-secimi.md)) |
| "Daha çok örnek (few-shot) hep iyidir"               | Bağlam maliyeti, aşırı uyum, etiket yanlılığı                                              | 2–3 benzer ve dengeli örnek; ölçün                                |
| "Yerel model = gizli"                                | Günlük, önbellek, eklenti ve cihaz güvenliği de yerel ve korunaklı olmalı                    | Veri akışını uçtan uca çizin                                      |
| "Gömme benzerliği yüksek = aynı anlam"               | "İade edilir" ile "iade edilmez" yazımca çok benzer; olumsuzluk, rakam ve ad farkı benzerliği çoğu zaman az değiştirir | Rakam/ad denetimi; karma arama; yeniden sıralama |
| "Model hakem tarafsızdır"                            | Sıra ve uzunluk yanlılığı olabilir; küçük hakem tek yanıta kayar (gerçek denemede hep "Hayır") | Hakemi insan etiketiyle doğrulayın ([değerlendirme](degerlendirme.md)) |
| "Uzun çıktı sınırı zararsızdır, nasılsa model durur" | Küçük model döngüye girer; gerçek denemede 400 sınırla dakikalar, 200 ile ~20 sn             | İşe göre kısa sınır; bitiş nedenini izleyin                       |
| "Model adındaki sayı parametre sayısıdır"            | Yaklaşıktır: "1.7B" adlı modelin API'den okunan sayısı 2,03 milyar                          | Bellek hesabını gerçek sayıyla yapın ([yerel çalıştırma](yerel-model-calistirma.md)) |
| "Model kartında Türkçe yazıyorsa Türkçede iyidir"    | Kapsamda olduğunu söyler, iyi olduğunu değil                                                | Türkçe görev kümesiyle ölçün                                      |

Kanıtların kaynağı (gerçek deneme satırları): [GERCEK_MODEL_DENEMESI](../../yz/docs/GERCEK_MODEL_DENEMESI.md) ve
[KUCUK_MODEL_REHBERI](../../yz/docs/KUCUK_MODEL_REHBERI.md); belirteç ölçümü [dil modeli nasıl çalışır](llm-nasil-calisir.md);
parametre sayısı [`ince-ayar` kataloğu](../../ince-ayar/katalog/modeller.yaml).

## Karşı örnek: sıcaklık 0 ne garanti eder, ne etmez

```python calistir
# Aynı sayılar, farklı toplama sırası, farklı sonuç (kayan nokta toplaması birleşmeli değildir)
sira_1 = (0.1 + 0.2) + 0.3
sira_2 = 0.1 + (0.2 + 0.3)
print(sira_1, sira_2, sira_1 == sira_2)


def acgozlu(puanlar: dict[str, float]) -> str:  # sıcaklık 0: en yüksek puanlı aday; eşitlikte ilki
    return max(puanlar, key=puanlar.get)


# Başa baş iki aday: sunucu toplamayı başka sırayla yapınca (ör. farklı toplu işleme) seçim değişir
for ad, ankara in (("sıra 1", sira_1), ("sıra 2", sira_2)):
    print(ad, "->", acgozlu({"İstanbul": 0.6, "Ankara": ankara}))
assert acgozlu({"İstanbul": 0.6, "Ankara": sira_1}) != acgozlu({"İstanbul": 0.6, "Ankara": sira_2})

# Sıcaklık 0 belirlenimcidir ama DOĞRU değildir: en olası aday yanlışsa her seferinde aynı yanlış
assert {acgozlu({"İstanbul": 2.5, "Ankara": 2.2}) for _ in range(100)} == {"İstanbul"}
```

```cikti
0.6000000000000001 0.6 False
sıra 1 -> Ankara
sıra 2 -> İstanbul
```

Örnek bilerek küçüktür: gerçek modelde binlerce katkı toplanır ve fark yalnız başa baş adaylarda seçimi çevirir. Ama
bir belirteç değişince sonraki bütün metin farklı yazılır; bu yüzden uzun yanıtlarda küçük farklar büyür. Kayan nokta
ayrıntısı: [Sayılar ve kayan nokta](../92-matematik/sayilar-ve-kayan-nokta.md).

## Karşı örnek: atıf var, dayanak yok

```python calistir
import re

kaynaklar = {1: "Kargo ücreti 500 TL altı siparişlerde 49,90 TL'dir.", 2: "İade süresi 14 gündür."}


def atif_denetle(yanit: str, kaynaklar: dict[int, str]) -> list[str]:
    """Her cümlenin rakamları, gösterdiği kaynakta GERÇEKTEN geçiyor mu?"""
    sorunlar = []
    for cumle in re.split(r"(?<=[.!?])\s+", yanit.strip()):
        atiflar = [int(n) for n in re.findall(r"\[(\d+)\]", cumle)]
        sayilar = re.findall(r"\d+(?:,\d+)?", re.sub(r"\[\d+\]", "", cumle))
        if sayilar and not atiflar:
            sorunlar.append(f"atıfsız rakam: {cumle}")
        for n in atiflar:
            if n not in kaynaklar:
                sorunlar.append(f"[{n}] diye kaynak yok")
            elif eksik := [s for s in sayilar if s not in kaynaklar[n]]:
                sorunlar.append(f"{eksik} kaynak [{n}]'de geçmiyor: {cumle}")
    return sorunlar


yanit = "Kargo ücreti 49,90 TL'dir [2]. İade süresi 14 gündür [2]. Destek hattı 7/24 açıktır [3]."
for sorun in atif_denetle(yanit, kaynaklar):
    print("-", sorun)
assert len(atif_denetle(yanit, kaynaklar)) == 2
```

```cikti
- ['49,90'] kaynak [2]'de geçmiyor: Kargo ücreti 49,90 TL'dir [2].
- [3] diye kaynak yok
```

Rakam doğru, atıf yanlış; üçüncü cümle olmayan bir kaynağa dayanıyor. Okur atıf işaretini görünce denetlemez; bu
yüzden denetimi kod yapmalı ([RAG değerlendirme](rag-degerlendirme.md)).

## Yanılgıyı nasıl yakalarsınız

1. İddiayı ölçülebilir bir soruya çevirin: "sıcaklık 0'da aynı istemi 20 kez gönderince kaç farklı yanıt çıkıyor?"
2. Kendi görev kümenizde ve kendi modelinizde deneyin; başkasının sonucunu taşımayın.
3. Sonucu tarih, model kimliği ve ayarlarla kaydedin; model değişince yeniden deneyin.
4. Kritik çıktıda inanca değil denetime güvenin: şema, kaynakta arama, aritmetik, kural testi.

## Tuzaklar

| Belirti                                                       | Altındaki yanılgı                                   | Çözüm                                                        |
| ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| "Aynı istemi gönderdik, farklı sonuç geldi; hata nerede?"      | Sıcaklık 0 = belirlenimci                            | Önbellek + sürüm kaydı; farkı kabul edip ölçün               |
| Testler geçiyor ama müşteri yanlış tutar görüyor              | Biçim geçerliliği = doğruluk                         | Alan bazında doğruluk ölçümü; içerik denetçisi               |
| İnce ayardan sonra model daha çok uyduruyor                    | İnce ayar bilgi ekler                                | Bilgiyi RAG'a taşıyın                                        |
| Bağlam büyütüldü, yanıtlar kötüleşti                           | Büyük bağlam = daha iyi                              | Az ve ilgili bağlam; konum                                   |
| İstem her hatada uzadı, sonunda hiçbir kural tutmuyor          | Uzun istem = iyi istem                               | Sadeleştirin; kuralları koda/teste taşıyın                   |
| "Güvenlik için isteme kural ekledik" ama veri sızdı           | İstem güvenlik sınırıdır                             | Yetkiyi kodda daraltın                                       |
| Yeni model alındı, bir kategori çöktü                          | Yeni/büyük her işte iyi                              | Gerileme listesiyle karşılaştırma                            |
| Küçük modelin önerdiği "en iyi uygulama" sorun çıkardı         | Model önerisi doğrulanmış bilgi sanıldı              | Bu tabloya ve ölçüme göre doğrulayın                         |

## Denetim listesi

- [ ] Karar veren her iddia (model, ayar, istem) kendi görev kümesinde ölçüldü.
- [ ] Tekrarlanabilirlik gerekiyorsa yanıt saklanıyor; istem + model sürümü kayıtlı.
- [ ] Biçim geçerliliği ve doğruluk ayrı raporlanıyor.
- [ ] Atıf ve rakamlar kodla kaynakta denetleniyor.
- [ ] Bilgi sorunları RAG'la, davranış sorunları istem/ince ayarla ele alınıyor.
- [ ] Hesap, tarih ve sayma işleri kodda.
- [ ] Güvenlik kuralları istemde değil, kodda ve yetkide.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dil modelleri hakkında bir öneri vereceksen önce `havuz/bilgi/85-llm/sik-yanilgilar.md` notunu
  oku. Önerini ölçülebilir bir denemeyle destekle; ölçmediysen 'doğrulanmadı' yaz."
- **Modelin tipik hatası:** tablodaki yanılgıları kendinden emin biçimde önermek ("sıcaklığı 0 yaparsan hep aynı
  yanıtı alırsın", "modeli ince ayarla, belgeleri öğrensin", "bağlamı büyüt, hepsini okusun"); model adı, bağlam
  uzunluğu ya da fiyatı ezberden yazmak.
- **Çıktıda denetleyin:** öneri bir ölçüme mi dayanıyor; bu tablodaki bir yanılgıyla çelişiyor mu; kaynak
  gösteriyorsa kaynak gerçekten bunu söylüyor mu.

## İlgili

- [Dil modeli nasıl çalışır](llm-nasil-calisir.md) · [Değerlendirme](degerlendirme.md) · [Yapılı çıktı](yapili-cikti.md) ·
  [Küçük modeller için istem](kucuk-modeller-icin-istem.md) · [LLM güvenliği](llm-guvenligi.md)
- Kanıt: [GERCEK_MODEL_DENEMESI](../../yz/docs/GERCEK_MODEL_DENEMESI.md), [KUCUK_MODEL_REHBERI](../../yz/docs/KUCUK_MODEL_REHBERI.md),
  [NE_ZAMAN_INCE_AYAR](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md)
- Matematik arka planı: [Sayılar ve kayan nokta](../92-matematik/sayilar-ve-kayan-nokta.md),
  [Kalibrasyon ve olasılık](../80-ml/kalibrasyon-ve-olasilik.md)
