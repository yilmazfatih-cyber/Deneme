---
baslik: Dil modeli seçimi
ozet: Hangi model sorusunun yöntemi: gereksinimleri yaz, sert kısıtlarla ele, kendi görev kümende ölç, en küçük yeterli modeli seç; lisans türleri, yerel ve bulut kararı, küçük modelden büyüğe kademelendirme.
etiketler: [llm, model-secimi, lisans, yerel, kademelendirme, olcum]
duzey: orta
guncellik: 2026-11
---

# Dil modeli seçimi

> Bu notu ne zaman okumalı: Yeni bir iş için model seçerken; "daha yeni/büyük model çıktı, geçelim mi?" sorusunda;
> maliyet ya da gizlilik yüzünden buluttan yerele (ya da tersi) geçmeyi düşünürken; seçilen model işi görmüyorsa.

## Temel fikir

"Hangi model en iyi?" sorusunun genel bir yanıtı yoktur; sıralama tabloları ve tanıtım sayıları **sizin işinizi**
ölçmez, Türkçe başarıyı hiç ölçmeyebilir ve çabuk eskir. Yöntem şudur: gereksinimleri yazın → sert kısıtlarla
(lisans, gizlilik, donanım, bağlam) adayları eleyin → kalan 2–4 adayı **kendi görev kümenizde** ölçün → eşikleri geçen
**en küçük** modeli seçin → gerekiyorsa zor durumlar için büyük modele kademelendirin. Bu notta model adı ve fiyat
listesi bilerek yoktur; havuzda tarihli ve doğrulanmış bir katalog vardır
([`ince-ayar` kataloğu](../../ince-ayar/katalog/modeller.yaml), 16 Kasım 2026, 35 model).

## Gereksinim şablonu

Kopyalayıp doldurun; boş kalan satır, ölçmeden karar verdiğiniz yerdir.

```text
Görev:            (ör. müşteri mesajını 5 sınıfa ayırma; faturadan 6 alan çıkarma)
Dil:              (girdi: Türkçe, bazen İngilizce; çıktı: Türkçe)
Girdi boyu:       (tipik / en uzun, belirteç olarak; Türkçe ~2,6 karakter/belirteç ile)
Çıktı:            (etiket / JSON / serbest metin; en uzun kaç belirteç)
Doğruluk eşiği:   (ör. görev kümesinde ≥ %85; hangi hata türü kabul edilemez)
Gizlilik:         (veri cihazdan/kurumdan çıkabilir mi; kişisel veri var mı)
Gecikme:          (p95 hedefi, ör. 3 sn; akışla mı gösterilecek)
Hacim ve bütçe:   (günde kaç istek; aylık üst sınır)
Lisans:           (ticari kullanım, dağıtım, çıktının kullanımı)
Donanım (yerelse): (CPU/GPU, bellek)
Bakım:            (model güncellemesini kim, nasıl ölçecek)
```

## Eleme: sert kısıtlar

| Kısıt                    | Eleme ölçütü                                          | Nasıl doğrulanır                                                |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------- |
| Lisans                   | Ticari kullanım/dağıtım izni yok                      | Lisans metni + model kartı; havuz kataloğundaki `ticari` alanı   |
| Gizlilik                 | Veri dışarı çıkamıyorsa bulut API'si elenir           | Veri akışını çizin; sözleşme/KVKK değerlendirmesi              |
| Bellek                   | Ağırlık + bağlam önbelleği donanıma sığmıyor          | [Yerel model çalıştırma](yerel-model-calistirma.md) hesaplayıcısı |
| Bağlam                   | En uzun girdi + çıktı pencereye sığmıyor              | Model `config.json` (`max_position_embeddings`) ve sunucu ayarı  |
| Dil                      | Türkçe görev kümesinde açıkça başarısız               | Ölçüm (aşağıda); model kartındaki dil etiketi yetmez            |
| Özellik                  | Araç çağrısı/şema kısıtı gerekiyor ama sunucu desteklemiyor | Küçük bir duman testi (`yz` `YZ_CANLI=1` testleri)          |

İki uyarı: (1) Model kartında "Türkçe" yazması iyi olduğu anlamına gelmez; havuz kataloğu bunu "kanıt: dil
etiketlerinde tr" diye ayrıca işaretler ve iyi olduğu sonucunu çıkarmaz. (2) Model adındaki sayı yaklaşıktır:
katalogda Qwen3-1.7B için Hugging Face API'sinden okunan parametre sayısı 2.031.739.904'tür. Bellek hesabında adı
değil gerçek sayıyı kullanın.

## Ölçüm: kendi görev kümende

1. 20–50 gerçek örnekle görev kümesi ([değerlendirme](degerlendirme.md)).
2. Adayları aynı ayarla koşun: `python -m yz karsilastir gorevler/<görev>.yaml --modeller <a> <b> <c>`
   (sıcaklık 0, önbellek açık; maliyet sütunu için `yz.yaml` içinde `fiyatlar`).
3. Tabloyu okuyun: doğruluk, biçim geçerliliği, gecikme p50/p95, belirteç, maliyet. Türkçe metinde belirteç sayısı
   modelden modele 1,5–2 kat değişebilir; bu doğrudan maliyet ve gecikme farkıdır
   ([dil modeli nasıl çalışır](llm-nasil-calisir.md) ölçümü).
4. Hatalı örnekleri okuyun: hangi kategori, hangi hata türü (tek etikete kayma, uydurma, biçim).

```python calistir
# Adaylar ve ölçümler ÖRNEKTİR: kendi `yz karsilastir` tablonuzdaki sayılarla doldurun.
adaylar = [
    {"ad": "aday-A", "milyar": 0.5, "ticari": True, "yerel": True, "baglam": 32_000, "dogruluk": 0.40, "p95_sn": 1.2},
    {"ad": "aday-B", "milyar": 1.5, "ticari": True, "yerel": True, "baglam": 32_000, "dogruluk": 0.81, "p95_sn": 2.1},
    {"ad": "aday-C", "milyar": 3.0, "ticari": False, "yerel": True, "baglam": 32_000, "dogruluk": 0.90, "p95_sn": 3.0},
    {"ad": "aday-D", "milyar": 4.0, "ticari": True, "yerel": True, "baglam": 32_000, "dogruluk": 0.88, "p95_sn": 3.6},
    {"ad": "aday-E", "milyar": 8.0, "ticari": True, "yerel": True, "baglam": 8_000, "dogruluk": 0.93, "p95_sn": 7.5},
]
gereksinim = {"ticari": True, "yerel": True, "asgari_baglam": 16_000, "asgari_dogruluk": 0.85, "azami_p95_sn": 4.0}


def sec(adaylar: list[dict], g: dict) -> tuple[dict | None, list[str]]:
    """1) Sert kısıtlarla ele, 2) ölçüm eşiklerini geçenler arasından EN KÜÇÜĞÜ seç."""
    notlar, kalan = [], []
    for a in adaylar:
        neden = ("lisans ticari değil" if g["ticari"] and not a["ticari"] else
                 "bağlam kısa" if a["baglam"] < g["asgari_baglam"] else
                 "doğruluk düşük" if a["dogruluk"] < g["asgari_dogruluk"] else
                 "yavaş" if a["p95_sn"] > g["azami_p95_sn"] else None)
        notlar.append(f"{a['ad']}: {neden or 'uygun'}")
        if neden is None:
            kalan.append(a)
    return min(kalan, key=lambda a: a["milyar"], default=None), notlar


secilen, notlar = sec(adaylar, gereksinim)
print("\n".join(notlar))
print("seçilen:", secilen["ad"])
assert secilen["ad"] == "aday-D"  # en doğru (E) değil, eşikleri geçen en küçük
```

```cikti
aday-A: doğruluk düşük
aday-B: doğruluk düşük
aday-C: lisans ticari değil
aday-D: uygun
aday-E: bağlam kısa
seçilen: aday-D
```

Hiçbir aday geçmiyorsa sırayla deneyin: istemi sadeleştir → şemayı küçült → görevi böl → az-örnek → daha büyük
model → (bilgi değil biçim/davranış sorunuysa) ince ayar ([küçük model rehberi](../../yz/docs/KUCUK_MODEL_REHBERI.md) §9).
Havuzdaki gerçek denemede 0,5B model bu görevlerde tek başına yetersiz çıktı; 1,5B–3B modellerle karşılaştırma
**yapılmadı**, sonucu bilinmiyor ([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md) §5).

## Lisans türleri

Hukuki danışmanlık değildir; kullanmadan önce lisans metninin kendisini okuyun ve kaydedin.

| Tür                                         | Genel durum                                                     | Dikkat                                                          |
| ------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Serbest (Apache-2.0, MIT gibi)              | Ticari kullanım ve değiştirme serbest; lisans/telif bildirimi korunur | Apache-2.0'da değişiklik bildirimi ve NOTICE dosyası           |
| Üreticinin kendi koşul metni ("topluluk lisansı", "kullanım şartları") | Çoğu ticari kullanıma **koşullu** izin verir | Kullanım politikası, ad/atıf şartı, kullanıcı sayısı eşiği, çıktıyla başka model eğitme yasağı olabilir |
| Ticari olmayan (CC BY-NC, "yalnız araştırma") | Ticari üründe kullanılamaz                                    | Ürünün içinde "deneme" kullanımı da ticari sayılabilir          |
| Kapalı API kullanım şartları                | Model sizin değil; şartlar değişebilir                          | Veri saklama ve eğitimde kullanım maddeleri                     |

- "Açık ağırlık" (open weights) açık kaynak demek değildir; ağırlıklar indirilebilir ama koşullar kısıtlı olabilir.
- Model kartındaki lisans etiketi hatalı ya da tutarsız olabilir; depodaki `ozetci` projesi bir model kartında iki
  farklı lisans gördüğünü kaydetmiştir. Etiket değil metin bağlayıcıdır.
- İnce ayarlı model taban modelin lisansını taşır; eğitim verisinin lisansı ayrıca geçerlidir. Sentetik veri üreten
  "öğretmen" modelin lisansı çıktı kullanımına izin vermelidir (havuz: `ince-ayar` sentetik veri hattı ticari
  kullanıma kapalı öğretmende durur).
- Kaydı tutun: model kimliği, sürüm/karma, lisans, tarih, nereden doğrulandı (katalog örneği:
  [`dogrulama-2026-11-16.json`](../../ince-ayar/katalog/dogrulama-2026-11-16.json)).

## Yerel mi bulut mu

| Ölçüt                         | Yerel (kendi makine/sunucu)                         | Bulut API                                          |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Gizlilik, KVKK                | Veri çıkmaz                                         | Sözleşme ve veri işleme şartlarına bağlı           |
| İnternetsiz çalışma           | Evet                                                | Hayır                                              |
| Kalite tavanı                 | Donanımın taşıyabildiği model kadar                 | En büyük modellere erişim                           |
| Maliyet yapısı                | Donanım + elektrik; çok istekte ucuzlar             | İstek başına; az istekte ucuz                       |
| Gecikme                       | Donanıma bağlı; CPU'da yavaş (gerçek denemede 0,5B ≈ 6,7 belirteç/sn) | Ağ + sıra; genelde hızlı üretim         |
| Davranış kararlılığı          | Model dosyası donuk: siz değiştirmedikçe aynı       | Aynı ad arkasında sürüm değişebilir; kayıt tutun    |
| Bakım                         | Çalıştırıcı, güncelleme, izleme sizde                | Sağlayıcıda; ama API değişikliklerini izlersiniz    |

Karma yaygındır: kişisel veriyi yerel küçük model maskeler/çıkarır, maskeli ve zor iş buluta gider
([LLM güvenliği](llm-guvenligi.md)).

## Kademelendirme: küçük model + zor durumda büyüğe yükseltme

Her isteği önce küçük model yapar; **denetçi** (şema doğrulama, içerik kuralları, etiket kümesi dışı yanıt, iki
örneklemin çelişmesi) şüpheli bulursa istek büyük modele gider. Kazanç tamamen denetçinin küçük modelin hatalarını
yakalama oranına bağlıdır.

```python calistir
def kademe(p_kucuk: float, yakalama: float, yanlis_alarm: float, p_buyuk_zor: float, maliyet_orani: float):
    """Önce küçük model; denetçi şüpheli bulursa büyük modele yükselt. Maliyet birimi: bir küçük çağrı.
    p_buyuk_zor: büyük modelin YÜKSELEN (zor) örneklerdeki başarısı; genel ortalamasından düşüktür."""
    yukselen = p_kucuk * yanlis_alarm + (1 - p_kucuk) * yakalama
    dogruluk = p_kucuk * (1 - yanlis_alarm) + yukselen * p_buyuk_zor
    return yukselen, dogruluk, 1 + yukselen * maliyet_orani


print("yalnız büyük: doğruluk %95.0, maliyet 10.0")
for yakalama in (0.3, 0.7, 0.95):
    yukselen, dogruluk, maliyet = kademe(0.80, yakalama, 0.05, 0.85, 10)
    print(f"yakalama %{yakalama * 100:.0f}: yükselen %{yukselen * 100:.0f}, doğruluk %{dogruluk * 100:.1f}, "
          f"maliyet {maliyet:.1f}")
assert abs(kademe(0.80, 0.7, 0.05, 0.85, 10)[1] - 0.913) < 1e-9
```

```cikti
yalnız büyük: doğruluk %95.0, maliyet 10.0
yakalama %30: yükselen %10, doğruluk %84.5, maliyet 2.0
yakalama %70: yükselen %18, doğruluk %91.3, maliyet 2.8
yakalama %95: yükselen %23, doğruluk %95.5, maliyet 3.3
```

Sayılar varsayımdır (küçük model %80, büyük model zor örneklerde %85, büyük çağrı 10 kat pahalı); kendi
ölçümlerinizi koyun. Okuma: denetçi zayıfsa kademelendirme ucuz ama kötüdür; güçlüyse büyük model kalitesine yakın
sonucu maliyetin üçte birine verir. Yükseltme ölçütleri: şema/kural hatası, izinli küme dışı etiket, kesik çıktı,
uzun ya da bilinen zor kategori, kullanıcı itirazı. Gecikmeyi de hesaplayın: yükselen istek iki çağrı bekler.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Sıralama tablosunda iyi model işinizde kötü                   | Tablo sizin görevinizi/dilinizi ölçmüyor                 | Kendi görev kümeniz; karar yalnız onunla                      |
| Seçilen model canlıda yavaş                                    | Gecikme ölçülmedi ya da kısa girdiyle ölçüldü            | Gerçek boyda girdiyle p95; Türkçe belirteç sayısı             |
| Aylık fatura beklenenin iki katı                               | Türkçe belirteç sayısı İngilizce varsayımla tahmin edildi | Kendi metninizle belirteç ölçümü                              |
| "Yeni sürüm daha iyi" diye geçildi, bir kategori çöktü        | Yalnız toplam yüzdeye bakıldı                            | Gerileme listesi; kategori kırılımı                          |
| Bulutta aynı model adı başka davranıyor                        | Sağlayıcı sürümü güncelledi                              | Tarihli model kimliği; düzenli yeniden ölçüm                  |
| Ticari üründe lisans sorunu çıktı                              | Etikete bakıldı, metin okunmadı; ince ayarda taban lisansı unutuldu | Lisans metni kaydı; katalogda `ticari` alanı          |
| Model belleğe sığmıyor                                         | Ad üzerinden hesap; bağlam önbelleği unutuldu            | Gerçek parametre sayısı + bağlam önbelleği hesabı             |
| Kademede neredeyse her istek büyüğe gidiyor                    | Denetçi çok hassas (yanlış alarm yüksek)                 | Yanlış alarm oranını ölçün; ölçütleri daraltın                |

## Denetim listesi

- [ ] Gereksinim şablonu dolduruldu; doğruluk eşiği ve kabul edilemez hata türleri yazılı.
- [ ] Adaylar sert kısıtlarla elendi; lisans metni okundu ve kaydedildi.
- [ ] Bellek ve bağlam gerçek parametre sayısı ve gerçek girdi boyuyla hesaplandı.
- [ ] 2–4 aday aynı görev kümesinde, aynı ayarla ölçüldü (doğruluk, biçim, p95, belirteç, maliyet).
- [ ] Eşikleri geçen en küçük model seçildi; seçim gerekçesi tarihli kayıtta.
- [ ] Kademelendirme varsa denetçinin yakalama ve yanlış alarm oranı ölçüldü.
- [ ] Model kimliği ve sürümü kayıtta; yeniden ölçüm takvimi var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Model önerme; şu gereksinim şablonunu doldur, şu adayları `python -m yz karsilastir` ile ölç,
  tabloyu ve eşikleri geçen en küçük modeli yaz. Bilmediğin lisans/parametre/bağlam bilgisini uydurma; model kartından
  ya da katalogdan al, alamadığına 'doğrulanmadı' yaz."
- **Modelin tipik hatası:** eğitim verisindeki eski bilgiyle model adı, bağlam uzunluğu, lisans ya da fiyat yazmak;
  "en büyük/en yeni en iyisidir" demek; ölçmeden öneri vermek.
- **Çıktıda denetleyin:** her sayının kaynağı var mı (ölçüm dosyası, model kartı, katalog); lisans metni okunmuş mu;
  karşılaştırma aynı ayarla mı yapılmış; seçim gerekçesi eşiklere dayanıyor mu.

## İlgili

- [Değerlendirme](degerlendirme.md) · [Yerel model çalıştırma](yerel-model-calistirma.md) ·
  [Maliyet ve gecikme](maliyet-ve-gecikme.md) · [İnce ayar kararı](ince-ayar-karari.md) ·
  [Küçük modeller için istem](kucuk-modeller-icin-istem.md)
- Karşılaştırma aracı: [`karsilastir.py`](../../yz/yz/degerlendirme/karsilastir.py); kural listesi:
  [KUCUK_MODEL_REHBERI](../../yz/docs/KUCUK_MODEL_REHBERI.md) §9
- Doğrulanmış model kataloğu (lisans, parametre, erişim): [`modeller.yaml`](../../ince-ayar/katalog/modeller.yaml)
- Klasik ML'de model ailesi seçimi (tablo verisi, sınıflandırıcı): [Model seçimi (ML)](../80-ml/model-secimi.md)
