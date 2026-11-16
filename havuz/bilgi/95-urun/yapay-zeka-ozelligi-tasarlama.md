---
baslik: Yapay zekâ özelliği tasarlama
ozet: Yapay zekâ özelliğinin ne zaman değer kattığı, arayüz kipini hata bedeline göre seçmek, beklenti yönetimi, belirsizlik ve hata anında arayüz, insan onayı, geri bildirim düğmesi, ölçüm, maliyet ve gecikme kararı.
etiketler: [urun, yapay-zeka, llm, arayuz, insan-onayi, maliyet]
duzey: orta
guncellik: 2026-11
---

# Yapay zekâ özelliği tasarlama

> Bu notu ne zaman okumalı: ürüne "yapay zekâ ile…" diye başlayan bir özellik eklemeden önce; model çıktısını
> kullanıcıya nasıl göstereceğinize karar verirken; yapay zekâ faturası fiyatı zorlamaya başladığında. İstem, yapılı
> çıktı, değerlendirme ve maliyet hesabının uygulaması `85-llm` kümesinde ve havuzdaki [`yz`](../../yz/) temelindedir.

## Temel fikir

Dil modeli olasılıklı çalışır: aynı girdiye farklı ve bazen **yanlış ama kendinden emin** yanıt verir. Ürün tasarımının
işi, bu yanlışın bedelini kullanıcıya ödetmemektir.

Yapay zekâ **girdi bulanık** olduğunda değer katar: serbest metin, ses, görüntü, dağınık belge. Kural birkaç satırla
yazılabiliyorsa kural kazanır: ucuzdur, açıklanır, hatası bulunur.

Model çıktısı üç kipte sunulur: **otomatik** (model yapar, kullanıcı sonra düzeltir), **öneri** (model önerir,
kullanıcı tek dokunuşla onaylar), **taslak** (model yazar, kullanıcı düzenler ve kendisi gönderir). Kipi doğruluk
değil, **hatanın bedeli ve geri alınabilirlik** belirler. Doğruluk kendi görev kümenizde ölçülür; "biçimi doğru"
doğru demek değildir: havuzdaki denemede şemaya uyan faturaların ancak bir kısmında rakamlar doğruydu
([`yz/docs/GERCEK_MODEL_DENEMESI.md`](../../yz/docs/GERCEK_MODEL_DENEMESI.md)).

Maliyet ve gecikme birer **ürün kararıdır**: kullanıcı başına bütçe, paket sınırı ve model yokken de çalışan bir yol.

## Karar tablosu: yapay zekâ mı, kural mı, hiç mi?

| Durum                                                            | Seçim                                                        | Neden                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Kural birkaç satırla yazılabiliyor (biçim, sınır, eşleme tablosu) | Kural                                                        | Ucuz, açıklanır, test edilir                |
| Serbest metinden, sesten, görüntüden yapı çıkarmak               | Model + şema doğrulaması + öneri kipi                        | Kural yazılamaz                             |
| Hata pahalı ve geri alınamaz (gönderim, ödeme, sağlık)            | Taslak + insan onayı ya da hiç                               | Bedel kullanıcıya kalır                     |
| Hata ucuz ve geri alınabilir (etiket, sıralama, kategori)         | Otomatik + kolay düzeltme                                    | Hız kazancı                                 |
| Doğruluk henüz ölçülmedi                                          | Önce görev kümesi (`python -m yz degerlendir`)               | Seçilmiş örnekle demo yanıltır              |
| Kitle için başarısızlık hissi zararlı                             | İnsan değerlendirmesi; modeli dışarıda bırakın               | Ürün ilkesi önce gelir                      |
| Kişisel veri yurt dışındaki bir servise gidecek                   | Maskeleme + aydınlatma + hukukçu; ya da yerel model          | KVKK ([yasal](yasal-temel-belgeler.md), [KVKK pratiği](../50-guvenlik/kvkk-pratik.md)) |
| Yanıt birkaç saniyeden uzun sürüyor                               | Akış, arka planda yapma, önbellek ya da daha küçük model      | Algılanan hız                               |

Gerçek bir örnek: Köprü (depo kökü, `docs/PLAN.md`) MVP'de konuşma tanımayı dışarıda bırakır; kelime değerlendirmesini
kişi ya da yanındaki üç düğmeyle yapar ("Söyledim · Yardımla söyledim · Henüz değil"). Afazili konuşmada tanıma
hatası "başarısızlık hissettirmez" ilkesiyle çatışırdı; hatanın bedeli kullanıcıya kalırdı (bu, kararın olası
gerekçesidir).

## Arayüz kipini seçmek

```python calistir
def ui_mode(error_cost: str, reversible: bool, accuracy: float | None) -> str:
    """Model çıktısının kullanıcıya nasıl sunulacağı. accuracy: KENDİ görev kümenizde ölçülen doğruluk."""
    if accuracy is None:
        return "önce ölç: görev kümesi kur"
    if error_cost == "yüksek" and not reversible:
        return "taslak: insan düzenler ve gönderir"
    if error_cost == "düşük" and reversible and accuracy >= 0.8:
        return "otomatik: sonra kolay düzeltme"
    if accuracy >= 0.9:
        return "öneri: tek dokunuşla onay"
    return "taslak: insan düzenler ve gönderir"


features = {  # Sedir, kurgusal; doğruluklar örnek
    "WhatsApp mesajından randevu önerisi": ("orta", True, 0.93),
    "Gelmeyen müşteriye otomatik ileti": ("yüksek", False, 0.95),
    "Hizmet adını rapor kategorisine eşleme": ("düşük", True, 0.88),
    "Fatura fotoğrafından tutar okuma": ("orta", True, None),
}
for name, args in features.items():
    print(f"{name}: {ui_mode(*args)}")
assert ui_mode("yüksek", False, 0.99).startswith("taslak")  # yüksek doğruluk, geri alınamaz işi otomatik yapmaz
```

```cikti
WhatsApp mesajından randevu önerisi: öneri: tek dokunuşla onay
Gelmeyen müşteriye otomatik ileti: taslak: insan düzenler ve gönderir
Hizmet adını rapor kategorisine eşleme: otomatik: sonra kolay düzeltme
Fatura fotoğrafından tutar okuma: önce ölç: görev kümesi kur
```

Son satır: %99 doğrulukta bile geri alınamaz bir işi model kendi başına yapmaz; yüz iletiden biri yanlış kişiye
yanlış metinle gider ve geri gelmez.

## Beklenti yönetimi

- **Ad işlevi söyler:** "Mesajdan randevu öner"; "Akıllı asistan" değil. Büyük ad, büyük beklenti ve hayal kırıklığı
  getirir.
- **İlk kullanımda tek cümle sınır:** "Mesajdaki tarih ve saati okur; yanlış okuyabilir, kaydetmeden önce bakın."
- **Kanıt gösterin:** önerinin yanında dayandığı yer: "Mesajdaki 'salı 3'te' ifadesinden".
- **Türkçe belirsizliği sorun:** "salı 3'te" 15:00 mı 03:00 mı? Model tahmin etmesin; tek soru sorun ya da alanı boş
  bırakıp vurgulayın. Havuzdaki `yz` temeli Türkçe tarih ve sayı yazımlarını ("15.03.2024", "1.250,50") düzeltir.
- Çıktının yapay zekâyla üretildiğini saklamayın; insan yazmış gibi de sunmayın.

## Belirsizlik ve hata anında arayüz

| Durum                                   | Arayüz                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Alan belirsiz ya da eksik               | Alan boş ve vurgulu; tek soru; uydurma doldurma yok                                      |
| Model zaman aşımına uğradı, servis yok  | Ürün elle çalışır: "Öneri şu an hazırlanamadı. Bilgileri elle girebilirsiniz."            |
| Belgede yanıt yok (belgeye dayalı yanıt) | "Belgelerde bu bilgi yok" demek doğru davranıştır ([RAG tasarımı](../85-llm/rag-tasarimi.md)) |
| Model "eminim" diyor                    | Yüzde göstermeyin; olasılıklar çoğunlukla kalibre değildir ([kalibrasyon](../80-ml/kalibrasyon-ve-olasilik.md)). Belirsiz alanı vurgulamak yeter |
| Kullanıcı öneriyi düzeltti              | Düzeltme kaydedilir; aynı oturumda aynı hata tekrar önerilmez                             |

Teknik hata iletisi ("500", "rate limit", "JSON parse error") kullanıcıya gösterilmez.

## İnsan onayı

Dış dünyaya etki eden her eylemden önce onay alınır: gönderme, ödeme, silme, paylaşma. Onay ekranı modelin **ne
yapacağını** gösterir: "Elif'e şu ileti gidecek: …". Her şeyi onaylatmak onay yorgunluğu doğurur ve dikkatsiz "Tamam"a
götürür; onayı geri alınamaz ve dış etkili işlere saklayın. Ajan ve araç tasarımındaki karşılığı:
[ajanlar ve araçlar](../85-llm/ajanlar-ve-araclar.md); `yz` temelinde tehlikeli araçlar insan onayı ister.

## Geri bildirim düğmesi ve ölçüm

- İki etiketli düğme ("Faydalı", "Faydalı değil"; yalnız simge değil) + isteğe bağlı kapalı neden listesi (yanlış
  bilgi, eksik, anlamsız, uygunsuz, diğer) + serbest metin.
- Kaydedilen: maskeli girdi, çıktı, model ve istem sürümü, zaman. Kullanıcıya bunun kaydedildiğini söyleyin.
- Döngü: olumsuz örnekler haftalık okunur → görev kümesine eklenir → istem ya da model değişir → **gerileme testi**
  ([değerlendirme](../85-llm/degerlendirme.md); `python -m yz degerlendir`).

| Ölçüt                                  | Ne söyler                                |
| -------------------------------------- | ---------------------------------------- |
| Kabul oranı (öneri değiştirilmeden)    | Doğruluk ve güven                        |
| Düzenleme oranı                        | Kısmi doğruluk                           |
| Geri alma oranı                        | Otomatik kipte hata                      |
| "Faydalı değil" oranı                  | Algılanan kalite                         |
| Özelliği atlayıp elle girme oranı      | Güven kaybı                              |
| İstek başı maliyet, p95 gecikme        | Sürdürülebilirlik                        |

## Maliyet ve gecikme: ürün kararı

Ortalama maliyet yanıltır; **ağır kullanıcı** belirleyicidir. Kullanıcı başına aylık bütçeyi fiyattan ve hedef marjdan
türetin ([fiyatlandırma](fiyatlandirma.md)), sonra dağılıma bakın:

```python calistir
import statistics

# ÖRNEK yer tutucu fiyatlar: gerçek fiyatı sağlayıcının güncel sayfasından alın
PRICE_IN, PRICE_OUT = 0.004, 0.016  # TL / 1000 belirteç
TOKENS_IN, TOKENS_OUT = 3000, 500  # istek başına (Türkçe metin İngilizceden çok belirteç tutar)
BUDGET = 10.0  # hesap başına aylık yapay zekâ bütçesi, TL (fiyat ve hedef marjdan türetildi)

per_request = TOKENS_IN / 1000 * PRICE_IN + TOKENS_OUT / 1000 * PRICE_OUT
requests = [20] * 60 + [80] * 25 + [300] * 10 + [1500] * 5  # 100 hesabın aylık istek sayısı (kurgusal)
costs = [r * per_request for r in requests]

over = sum(cost > BUDGET for cost in costs)
cap = round(BUDGET / per_request)
print(f"istek başı: {per_request:.3f} TL · ortalama hesap: {statistics.mean(costs):.2f} TL")
print(f"bütçeyi aşan hesap: {over}/100 · en ağırların maliyeti: {max(costs):.0f} TL")
print(f"bu bütçeyle aylık istek sınırı: {cap}")
assert statistics.mean(costs) < BUDGET < max(costs)  # ortalama iyi görünür, ağır kullanıcı batırır
```

```cikti
istek başı: 0.020 TL · ortalama hesap: 2.74 TL
bütçeyi aşan hesap: 5/100 · en ağırların maliyeti: 30 TL
bu bütçeyle aylık istek sınırı: 500
```

Seçenekler: paket başına istek sınırı ve %80'de uyarı; sınırın üstü kullanım bazlı ücret; aynı girdiye önbellek; işi
daha küçük modele bölmek. Belirteç ekonomisi, gecikmenin bileşenleri, akış ve zaman aşımı:
[maliyet ve gecikme](../85-llm/maliyet-ve-gecikme.md). Gecikmede ortalamaya değil p95'e bakın; uzun metinde akış
(kelime kelime gösterim), yapı çıkarmada iskelet ekran, her durumda bir zaman sınırı ve elle devam yolu.

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Demo harikaydı, gerçek kullanıcıda yanlışlar çıktı            | Seçilmiş örneklerle denendi                               | Gerçek ve zor örneklerden görev kümesi; ölçüm                              |
| Kullanıcılar öneriyi bakmadan kaydediyor                      | Otomatik kip yanlış yerde ya da onay yorgunluğu           | Kritik alanı (saat, tutar) vurgulayın ve ayrıca onaylatın                  |
| "Akıllı asistan" hayal kırıklığı yarattı                      | Ad ve metin işlevi söylemiyor                             | İşlevsel ad; ilk kullanımda sınır cümlesi                                   |
| Model geç yanıt verince ekran donuyor                         | Zaman sınırı ve yedek yol yok                             | Zaman sınırı, elle giriş, akış                                              |
| Yapay zekâ faturası beklenenin katları                        | Ağır kullanıcı, sınır yok                                 | Kullanıcı başı bütçe, paket sınırı, önbellek                                |
| Şema doğru, içerik yanlış                                     | Biçim geçerliliği doğruluk sanıldı                        | Alan alan doğruluk ölçümü                                                   |
| "%87 eminim" gösterildi, kullanıcı yanlış anladı              | Kalibre olmayan sayı arayüze kondu                        | Yüzde yok; belirsiz alanı vurgulayın                                        |
| "Faydalı değil"e basılıyor, hiçbir şey değişmiyor             | Geri bildirim döngüsü yok                                 | Haftalık okuma → görev kümesi → gerileme testi                              |
| Müşteri verisi yurt dışı API'ye gidiyor, aydınlatmada yok     | Veri akışı düşünülmedi                                    | Maskeleme, aydınlatma, hukukçu; gerekirse yerel model                       |
| Model kullanıcı metnindeki talimatı izledi                    | İstem enjeksiyonu                                         | Yetkiyi daraltın, çıktıyı doğrulayın ([güvenlik](../85-llm/llm-guvenligi.md)) |
| Sağlayıcı modeli değiştirdi, davranış değişti                 | Model sürümü sabit değil, gerileme testi yok              | Sürümü sabitleyin; her değişiklikte görev kümesini koşun                    |

## Denetim listesi

- [ ] Neden yapay zekâ gerektiği (kural neden yetmiyor) bir cümleyle yazılı.
- [ ] Doğruluk kendi görev kümenizde ölçüldü; biçim geçerliliği ayrı raporlandı.
- [ ] Arayüz kipi hata bedeli ve geri alınabilirliğe göre seçildi.
- [ ] Özelliğin adı işlevi söylüyor; ilk kullanımda sınır cümlesi var.
- [ ] Belirsiz alanlar vurgulanıyor; model yokken ya da zaman aşımında ürün elle çalışıyor.
- [ ] Dış etkili her eylemden önce insan onayı var.
- [ ] Geri bildirim düğmesi etiketli; olumsuz örnekler görev kümesine giriyor.
- [ ] Kullanıcı başı maliyet, ağır kullanıcı sınırı ve p95 gecikme hesaplı.
- [ ] Kişisel veri akışı aydınlatmada yazılı; dış servise gitmeden maskeleniyor.
- [ ] Model ve istem sürümü sabit; değişiklikte gerileme testi koşuyor.

## Küçük modele yaptırırken

- **Özelliği yaptırırken:** "Model çıktısını doğrudan kaydetme. Şemayla doğrula; belirsiz alanı boş bırak ve vurgula;
  kullanıcı onaylamadan kaydetme. Zaman sınırı koy; aşılırsa elle girişe düş. Kullanıcıya teknik hata gösterme;
  metinleri sözlük dosyasına yaz."
- **Metin için:** "Özellik adı için işlevini söyleyen üç seçenek yaz; 'akıllı', 'asistan', 'yapay zekâ destekli' kullanma.
  İlk kullanım için tek cümlelik bir sınır metni yaz."
- **Modelin tipik hatası:** kendi çıktısına güvenip doğrulamasız kaydeder; zaman sınırı koymaz; ham hata iletisini
  gösterir; uydurma güven yüzdesi ekler; kişisel veriyi maskelemeden API'ye gönderir; "Faydalı değil" verisini hiçbir
  yere bağlamaz.
- **Çıktıda denetleyin:** model yanıtının şema doğrulamasından geçmeden kaydedildiği bir yol var mı; zaman sınırı ve
  yedek yolun testi var mı; maskeleme çağrısı API isteğinden önce mi; aydınlatma metni güncellendi mi.

## İlgili

- [Maliyet ve gecikme](../85-llm/maliyet-ve-gecikme.md), [değerlendirme](../85-llm/degerlendirme.md),
  [yapılı çıktı](../85-llm/yapili-cikti.md), [model seçimi](../85-llm/model-secimi.md),
  [üretim hattı kalıpları](../85-llm/uretim-hatti-kaliplari.md), [güvenlik](../85-llm/llm-guvenligi.md).
- [ML problemini çerçeveleme](../80-ml/problem-cerceveleme.md): "yapay zekâ gerekli mi?" sorusunun kökü.
- Havuzdaki çalışan temel: [`yz/README.md`](../../yz/README.md) (doğrula-onar, değerlendirme, karşılaştırma, maskeleme),
  [`yz/docs/KUCUK_MODEL_REHBERI.md`](../../yz/docs/KUCUK_MODEL_REHBERI.md).
- [Fiyatlandırma](fiyatlandirma.md) ve [yasal temel belgeler](yasal-temel-belgeler.md).
