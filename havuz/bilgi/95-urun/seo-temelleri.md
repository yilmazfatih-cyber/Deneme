---
baslik: SEO temelleri
ozet: Arama niyeti ve araçsız anahtar sözcük araştırması, sayfa başlığı ve açıklaması, başlık yapısı, iç bağlantı, teknik SEO denetim listesi ve içerik kalitesi; site temelinin denetimlerine bağlı.
etiketler: [urun, seo, arama-niyeti, icerik, teknik-seo]
duzey: temel
guncellik: 2026-11
---

# SEO temelleri

> Bu notu ne zaman okumalı: bir sitenin aramada bulunması isteniyorsa; yeni bir sayfa ya da yazı planlarken;
> "neden aramada çıkmıyoruz?" sorusu geldiğinde.

## Temel fikir

Arama motoru bir soruya en iyi yanıtı göstermeye çalışır. Arama motoru optimizasyonu (SEO) üç iştir:

1. **Niyet:** insanların gerçekten sorduğu soruyu ve ne tür bir yanıt beklediğini bulmak.
2. **Yanıt:** o soruyu en iyi yanıtlayan sayfayı yazmak. **Bir sayfa = bir ana niyet.** İki sayfa aynı niyeti
   hedeflerse birbirini yer (yamyamlık, cannibalization).
3. **Teknik taban:** sayfa taranabilir, hızlı, mobilde düzgün ve makinece anlaşılır olmalı. Taban eksikse içerik
   görünmez; tamsa tek başına sıralama getirmez. Havuzdaki [`site`](../../site/) temeli tabanın çoğunu her
   derlemede denetler.

SEO yavaştır: yeni bir sitede haftalar, aylar sürer. Fikir doğrulamak için SEO beklenmez; duman testinin trafiği
başka kanaldan gelir ([içerik ve büyüme](icerik-ve-buyume.md)). Sıralamanın formülü yayımlanmaz ve değişir; bu not
değişmeyen temeli anlatır.

## Karar tablosu: niyet → sayfa türü

| Niyet               | Sorgu örneği                                              | Sayfa türü                               | Çağrı                          |
| ------------------- | --------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| Bilgi (öğrenmek)    | "gelmeyen müşteri nasıl azalır", "kapora nedir"           | Rehber yazısı                            | Yumuşak: ilgili özellik, bülten |
| Ticari araştırma    | "en iyi randevu programı", "randevu uygulaması yorumları" | Karşılaştırma, "kimler için uygun" sayfası | Deneme                       |
| İşlem (almak, yapmak) | "randevu programı fiyat", "ücretsiz randevu uygulaması" | Ürün ve fiyat sayfası                    | Ana çağrı                      |
| Gezinme (markayı bulmak) | "sedir giriş"                                        | Ana sayfa, giriş sayfası                 | Giriş                          |
| Yerel               | "kadıköy kuaför"                                          | Müşterinizin kendi sayfası ve harita kaydı | Sizin sitenizin hedefi değil  |

Son satır sık yapılan bir hatadır: randevu yazılımı satan site "kadıköy kuaför" sorgusunu hedeflememelidir; o arama
kuaförün kendi sayfasının işidir. (Müşterinin yerel görünürlüğüne yardım etmek ise ayrı bir ürün fikri olabilir.)

## Anahtar sözcük araştırması: araçsız yöntem

1. **Tohum listesi:** müşterinin sözcükleri (görüşme notları, destek talepleri), sorunlar, bugünkü alternatifler.
2. **Otomatik tamamlama:** tohumu arama kutusuna yazın; sonuna harf ve soru sözcükleri ekleyin ("nasıl", "neden",
   "ücretsiz", "fiyat", "uygulaması"). Önerileri not edin.
3. **Sonuç sayfasını okuyun:** ilk on sonuç ne tür sayfa: yazı mı, ürün mü, video mu, harita mı? **Niyeti en
   güvenilir biçimde sonuç sayfası söyler.** "İlgili aramalar" ve "kullanıcılar bunları da sordu" kutularını not edin.
4. **Toplulukları okuyun:** forumlar, şikâyet siteleri, sosyal medya grupları, uygulama mağazası yorumları.
5. **Gruplayın:** aynı niyet = aynı sayfa. Her grupta bir ana sorgu, birkaç yan sorgu.
6. **Seçin:** ürüne yakınlık (işlem > ticari > bilgi) × gerçekten bildiğiniz konu mu × rakipler (ilk sayfada
   forumlar ve küçük siteler varsa fırsat; yalnız büyük siteler varsa zor).

Hacim verisi olmadan da karar verilebilir; yayından sonra arama konsolu (Google Search Console, Bing Webmaster
Tools) sitenin gerçekten göründüğü sorguları gösterir ve listeyi düzeltirsiniz.

**Türkçeye özgü:** Türkçe eklemeli bir dildir ("randevu programı", "randevu programları", "randevu programını");
arama motorları kökleri büyük ölçüde eşler. Metni doğal Türkçeyle yazın, ek çeşitlerini doldurmayın. İnsanlar
"kuafor" diye de yazar; sonuçlar çoğunlukla benzer ama birebir aynı olmayabilir, ikisine de bakın. Adreste ASCII
(`/blog/gelmeyen-musteri/`), metinde doğru Türkçe.

Niyeti ve yamyamlığı bir tabloda denetlemek:

```python calistir
from collections import defaultdict

INTENT_WORDS = {  # sıra önemli: ilk eşleşen kazanır
    "işlem": ["fiyat", "ücret", "satın al", "indir", "deneme", "ücretsiz"],
    "ticari": ["en iyi", "karşılaştırma", "alternatif", "yorum", "öneri"],
    "bilgi": ["nasıl", "nedir", "neden", "ne zaman", "rehber", "örnek"],
}


def intent(query: str) -> str:
    for label, words in INTENT_WORDS.items():
        if any(word in query for word in words):
            return label
    return "belirsiz: sonuç sayfasına bakın"


# Sayfa → (sayfa türü, hedeflenen ana sorgu) — Sedir, kurgusal
pages = {
    "/": ("ürün", "online randevu programı"),
    "/fiyatlar/": ("ürün", "randevu programı fiyat"),
    "/blog/randevu-programi-secimi/": ("yazı", "online randevu programı"),
    "/blog/gelmeyen-musteri/": ("yazı", "gelmeyen müşteri nasıl azalır"),
    "/blog/ucretsiz-randevu/": ("yazı", "ücretsiz randevu uygulaması indir"),
}
by_query = defaultdict(list)
for path, (_, query) in pages.items():
    by_query[query].append(path)
cannibal = {q: paths for q, paths in by_query.items() if len(paths) > 1}
mismatch = [path for path, (kind, q) in pages.items() if kind == "yazı" and intent(q) == "işlem"]

assert intent("gelmeyen müşteri nasıl azalır") == "bilgi"
assert intent("online randevu programı").startswith("belirsiz")
assert cannibal == {"online randevu programı": ["/", "/blog/randevu-programi-secimi/"]}
print("yamyamlık:", cannibal)
print("niyet uyuşmazlığı:", mismatch)

title = "Kuaför ve klinikler için online randevu programı | Sedir"
description = ("Müşterileriniz günün her saati kendi randevusunu alsın, hatırlatmalar kendiliğinden gitsin. "
               "14 gün ücretsiz deneyin.")
assert len(title) <= 60 and 50 <= len(description) <= 160  # Python len Türkçe harfi 1 sayar
print(len(title), len(description))
```

```cikti
yamyamlık: {'online randevu programı': ['/', '/blog/randevu-programi-secimi/']}
niyet uyuşmazlığı: ['/blog/ucretsiz-randevu/']
56 116
```

Okuma: blog yazısı ana sayfanın sorgusunu hedefliyor (ana sorgusunu değiştirin: "randevu programı seçerken nelere
bakılır"); "ücretsiz … indir" sorgusu işlem niyetlidir, yazıyla değil ürün ya da fiyat sayfasıyla karşılanır.
Sözcük listesi kaba bir süzgeçtir: "online randevu programı" gibi sorgularda karar sonuç sayfasınındır.

## Başlık etiketi, açıklama, başlık yapısı

| Öğe                      | Kural                                                                                      | İyi örnek                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Başlık etiketi (`title`) | Her sayfada özgün; ana sorgu başta, marka sonda; ~50–60 karakter (uzunu kesilir)            | "Kuaför ve klinikler için online randevu programı \| Sedir" |
| Açıklama (`description`) | 50–160 karakter; sıralamayı değil tıklamayı etkiler; ne var + neden tıklanmalı             | Yukarıdaki kod bloğundaki açıklama                          |
| `h1`                     | Sayfada tek; title ile aynı konu                                                           | "Randevularınız kendiliğinden dolsun"                       |
| `h2`, `h3`               | Okurun alt soruları; düzey atlanmaz                                                         | "Hatırlatma iletileri ne zaman gider?"                      |
| İlk paragraf             | Soruyu iki cümlede doğrudan yanıtlar                                                       | —                                                           |
| Adres                    | Kısa, ASCII, tireli; değişirse eski adres yeni adrese kalıcı yönlendirilir                 | `/blog/gelmeyen-musteri/`                                   |

Arama motoru başlığı ve açıklamayı kendi seçimiyle yeniden yazabilir; yazdığınız metin yine de en güçlü öneridir.

## İçerik kalitesi

- **Özgün bilgi:** kendi veriniz, deneyiminiz, gerçek örnek ve ekran görüntüsü. Her modelin üretebileceği genel metin
  sıralama nedeni değildir.
- **Seri üretimden kaçının:** yapay zekâyla ya da elle çoğaltılmış, değer katmayan sayfalar arama motorlarının spam
  politikalarına takılabilir (politika metinleri değişir; Kasım 2026'da doğrulanmadı). Az ve iyi yazın.
- **Güven işaretleri:** yazar, tarih, güncelleme tarihi, kaynak bağlantısı; uydurma istatistik yok.
- **Yapılandırılmış veri yalnız sayfada görünen içeriği anlatır.** Sayfada olmayan bir SSS'yi işaretlemek kuraldışıdır.
  SSS zengin sonuçları bir süredir çoğu site için gösterilmiyor (doğrulanmadı); veri yine de sayfayı anlatır.
- Yapay zekâ destekli arama yanıtları için ayrı bir hile bilinmiyor; aynı temel (soruyu açıkça yanıtlayan, kaynağı
  belli, yapılı sayfa) en güvenli yoldur.

## İç bağlantı

- **Merkez ve uçlar:** ürün sayfası ↔ ilgili rehber yazıları. Her yazı bir ürün sayfasına ve 2–3 ilgili yazıya bağlanır.
- **Bağlantı metni anlatır:** "bekleme listesi nasıl çalışır", "buraya tıklayın" değil.
- **Yetim sayfa olmasın:** her yeni sayfaya en az iki iç bağlantı gelsin. Site temeli kırık bağlantıyı ve çapayı
  denetler; yetim sayfayı bulmak için site haritasındaki adresleri iç bağlantılarla karşılaştırın.
- Gezinti yolu (breadcrumb) hem okura hem arama motoruna yer bildirir; site temelinde hazır.

## Teknik SEO denetim listesi ve site temeli

| Madde                                          | Site temelinde                                                                          | Kim yapar        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| Tek `h1`, `title`, açıklama 50–160             | [`scripts/audit/rules.ts`](../../site/scripts/audit/rules.ts) (`tek-h1`, `title`, `aciklama`) | Otomatik    |
| Canonical, Open Graph, Twitter kartı           | [`Seo.astro`](../../site/src/components/Seo.astro) + `canonical`, `open-graph` kuralları | Otomatik         |
| Yapılandırılmış veri (JSON-LD)                 | [`structured-data.ts`](../../site/src/lib/structured-data.ts) + `json-ld` kuralı        | Otomatik         |
| Görsel alt metni ve boyutu                     | `gorsel-alt`, `gorsel-boyut` kuralları                                                  | Otomatik         |
| Kırık bağlantı ve çapa, yinelenen `id`         | `kirik-baglanti`, `kirik-capa`, `yinelenen-id`                                          | Otomatik         |
| Çok dilde `hreflang`                           | `hreflang` kuralı (`translationKey`)                                                    | Otomatik         |
| Site haritası, `robots.txt`, RSS, 404          | Derleme üretir ([`robots.txt.ts`](../../site/src/pages/robots.txt.ts))                  | Otomatik         |
| Sayfa ağırlığı bütçesi, mobilde taşma          | `butce` kuralı; uçtan uca test (360 px)                                                 | Otomatik         |
| Gerçek hız (Core Web Vitals)                   | — ([web performansı](../20-web-onyuz/web-performansi.md))                               | Elle, yayında    |
| HTTPS, tek adres (www'li ya da www'siz)         | Barındırma ayarı                                                                        | Elle             |
| Arama konsoluna kayıt, site haritası gönderimi | —                                                                                       | Elle, yayında    |
| `noindex` ya da `robots.txt` engeli kalmadı    | —                                                                                       | Elle, yayında    |

Kural ayrıntıları ve hata iletileri: [`kalite-denetimleri.md`](../../site/src/content/belgeler/tr/kalite-denetimleri.md);
yayın öncesi on iki maddelik liste:
[`seo-temel-denetim-listesi.md`](../../site/src/content/blog/tr/seo-temel-denetim-listesi.md). Hız ölçütleri için
yaygın "iyi" eşikleri: LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1 (eşikler değişebilir; Kasım 2026'da doğrulanmadı).

## Tuzaklar

| Belirti                                                      | Neden                                                         | Çözüm                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Site yayında ama aramada hiç yok                             | `noindex` kaldı, `robots.txt` engelliyor ya da alan çok yeni  | Meta robots ve `robots.txt`'ye bakın; arama konsoluna kayıt; zaman tanıyın |
| `robots.txt` etkisiz                                         | Site bir alt klasörde yayında (ör. proje sitesi)              | Kendi alan adı; arama motorları yalnız kökteki dosyayı okur             |
| İki sayfa aynı aramada yer değiştirip duruyor                | Yamyamlık                                                     | Birleştirin ya da birinin ana sorgusunu değiştirin; biri ötekine bağlansın |
| Her sayfanın başlığı aynı                                    | Başlık şablonu yalnız marka adını yazıyor                     | Sayfa başına özgün `title`                                              |
| Metin anahtar sözcükle doldurulmuş; okur kaçıyor             | Eski taktik                                                   | Doğal dil; niyete yanıt                                                 |
| Modelle yüzlerce yazı üretildi; trafik gelmedi ya da düştü   | Değer katmayan seri içerik                                    | Az ve özgün: gerçek veri, örnek, deneyim                                |
| Adres değişti, eski bağlantılar 404 veriyor                  | Yönlendirme yapılmadı                                         | Kalıcı yönlendirme; iç bağlantıları güncelleyin                         |
| Paylaşılan adreste `%C3%A7` gibi karakterler                 | Adreste Türkçe harf                                           | ASCII kısa ad (site üreteci kendisi yapar)                              |
| Mobilde ana görsel geç geliyor                               | Büyük görsel, dış yazı tipi, ağır betik                       | Site temelinin bütçeleri; boyutlu ve sıkıştırılmış görsel               |
| Çeviri sayfaları birbirini göstermiyor                       | Çeviriler bağlanmadı                                          | `translationKey`; karşılıklı `hreflang`                                 |

## Denetim listesi

- [ ] Her sayfanın tek ana niyeti ve ana sorgusu yazılı; iki sayfa aynı ana sorguyu hedeflemiyor.
- [ ] Niyet, sonuç sayfasına bakılarak doğrulandı.
- [ ] `title` özgün, ana sorgu başta, ~60 karakteri aşmıyor; açıklama 50–160 karakter.
- [ ] Tek `h1`; `h2`'ler okurun alt soruları; ilk paragraf soruyu doğrudan yanıtlıyor.
- [ ] İçerikte özgün bilgi (veri, örnek, deneyim) var; kaynaksız istatistik yok.
- [ ] Her yeni sayfaya en az iki iç bağlantı geliyor; bağlantı metinleri açıklayıcı.
- [ ] Site temelinde `npm run check` yeşil.
- [ ] Yayında: engel yok, site haritası arama konsoluna gönderildi, tek adres (HTTPS, www kararı) oturdu.
- [ ] Adresi değişen her sayfa için kalıcı yönlendirme var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu sayfanın ana sorgusu: <sorgu>, niyeti: <niyet>. `title` en çok 60 karakter, başında ana sorgu,
  sonunda marka. Açıklama 50–160 karakter. İlk paragraf soruyu iki cümlede yanıtlasın. Anahtar sözcüğü doldurma.
  İstatistik, uzman sözü ya da kaynak uydurma; elinde yoksa yazma."
- **Araştırma için:** "Aşağıdaki müşteri cümlelerinden arama sorgusu adayları çıkar ve her birine niyet yaz. Arama
  hacmi uydurma." Sonra sonuç sayfalarına kendiniz bakın.
- **Modelin tipik hatası:** sözcük doldurur; genel geçer metin yazar; "araştırmalara göre %…" uydurur; birden çok `h1`
  koyar; adrese Türkçe harf yazar; sayfada görünmeyen SSS için yapılandırılmış veri ekler.
- **Çıktıda denetleyin:** site temelinin denetimi; `title` ve açıklama uzunluğu; metindeki her rakamın kaynağı; ilk
  paragrafın soruyu gerçekten yanıtlayıp yanıtlamadığı.

## İlgili

- [Tanıtım sayfası](tanitim-sayfasi.md): sayfanın kendisi ve çağrısı.
- [İçerik ve büyüme](icerik-ve-buyume.md): içerik stratejisi ve kanallar.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): aramadan gelen ziyaretin işe dönüşüp dönüşmediği.
- [Web performansı](../20-web-onyuz/web-performansi.md): hız ölçütlerinin uygulaması.
- Site temeli: [`site/README.md`](../../site/README.md) → "SEO" ve "Kalite denetimleri".
