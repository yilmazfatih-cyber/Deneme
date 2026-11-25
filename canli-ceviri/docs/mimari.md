# Mimari karar notu — 25.11.2026

Bu not üç soruyu yanıtlar: uygulama neyle yazılmalı, kullanıcı hesabı olmalı mı, uygulama hangi dilde olmalı.
Önce karar, sonra gerekçe. Rakam uydurulmadı; Apple'ın kuralından emin olmadığım yerde **doğrulanmalı** yazdım.

## Kısa karar

- **Swift + SwiftUI ile kalın.** Flutter ya da React Native'e geçmeyin. Android'e ancak iPhone'da para ödeyen kullanıcı
  görüldükten ve bulut motoru çalıştıktan sonra bakılır.
- **Hesap yok.** Abonelik zaten Apple Kimliği'ne bağlı. Hesabı yalnız Android'de ya da web'de aynı abonelik satılmak
  istenirse ekleyin.
- **Sunucu şimdi yok.** Soniox bulut motoru herkese sunulmaya karar verildiği gün küçük bir "anahtar dağıtıcı" kurulur.
- **Arayüz yalnız Türkçe kalsın.** İngilizce arayüz, hedef dil seçilebilir olduğunda anlam kazanır; o güne kadar
  yalnız mağaza sayfası İngilizceye çevrilir.

## 1. Programlama dili ve çatı

**Karar:** Swift + SwiftUI, iOS 18. Swift 5 dil kipinde kalın; Swift 6 kipine geçiş yayından sonra ayrı küçük bir iş.

**Gerekçe:**
- Uygulamanın değeri tamamen Apple'ın parçalarında: konuşma tanıma (Speech), cihazda çeviri (Translation), AirPods ses
  yolu, abonelik (StoreKit 2). Flutter / React Native bunları kendisi yapmaz; hepsi yine Swift ile "köprü" yazılarak
  bağlanır: iki dil, iki derleme, daha çok hata yeri, kazanç yok. Apple'ın çeviri oturumu bugün SwiftUI ekranından
  açılıyor (`KokEkran.swift`); başka çatıda bu yol dolambaçlıdır (doğrulanmalı).
- Android'de Apple'ın tanıma ve çevirisi yoktur; Android sürümü Google'ın araçlarıyla ya da bulut motoruyla (Soniox)
  çalışır. Ortak çatının kod kazancı küçüktür.
- Swift 6 kipi eşzamanlılık hatalarını derlemede yakalar ama ses kodunu (`Hat.swift`) elden geçirmeyi ister; yayından
  önce bu riske değmez.

**Android'e ne zaman bakılır:** (a) iPhone'da birkaç hafta abone verisi, (b) bulut motoru cihazda denenmiş ve ücreti
belli, (c) Android'den istek var. Üçü olunca yerel Android (Kotlin) ile çapraz platform çatı o gün karşılaştırılır.

## 2. Hesap (kullanıcı girişi)

**Karar:** Hesap yok, giriş ekranı yok. **Bugün:** Abonelik Apple Kimliği'ne bağlı; aynı Apple Kimliği'yle her iPhone'da "Satın alımları geri
yükle" yeter. iPhone'lar arası geçiş için hesap gerekmez.

**Getirdiği:** Android / web'de aynı aboneliği tanımak; cihazlar arası geçmiş (bugün geçmiş zaten saklanmıyor);
kötüye kullanımı kişiye göre sınırlamak.

**Götürdüğü:**
- Gizlilik ilkesi (ilke 3) zayıflar; mağaza beyanı "Veri Toplanmıyor" olmaktan çıkar.
- Hesap açılabiliyorsa silme de uygulama içinden yapılabilmeli (Apple kuralı 5.1.1(v); güncel metni doğrulanmalı).
- Google vb. ile giriş sunulursa gizlilik odaklı eşdeğer bir giriş de (ör. Apple ile Giriş) sunulmalı (kural 4.8;
  doğrulanmalı). Hesaba dayalı özellik yoksa girişi zorunlu tutmamak beklenir (doğrulanmalı).
- Sunucu, veritabanı, şifre sıfırlama, destek yükü: tek kişi için sürekli iş. Giriş ekranı ilk çeviriye giden yolu uzatır.

**Hangi durumda hesap gerekir:**
- **Android ya da web'de aynı abonelik:** Apple aboneliğini Google bilmez; ikisini tek kişiye bağlamak için hesap ve
  sunucu gerekir. → **Gerekir.**
- **Cihazlar arası geçmiş:** Ürün geçmişi saklamıyor; bu değişmedikçe gerekmez (iCloud hesapsız yol olabilir, doğrulanmalı).
- **Bulut motoru bizim anahtarımızla:** **Gerekmez.** Sunucu Apple'ın imzalı abonelik kaydına bakar; kaydın kimliği
  kişiyi tanımadan sınır koymaya yeter (§ 3).

**Eşik:** Android ya da web'de satış kararı verildiği gün eklenir: "Apple ile Giriş" (+ Android'de Google), şifresiz, uygulama içinden silinebilir.

## 3. Sunucu

**Karar:** Bugün sunucu yok. Soniox bulut motoru herkese sunulmaya karar verildiğinde küçük bir sunucu kurulur; o güne
kadar bulut motoru yalnız kendi Soniox anahtarını giren kişi içindir (S02'nin tasarımı).

**Neden sunucu gerekir:** Bizim Soniox anahtarımız uygulamaya gömülemez: dosya açılıp anahtar okunabilir ve okuyan bizim
hesabımızdan sınırsız harcar. Soniox da uzun ömürlü anahtarı telefona koymamayı öneriyor (S02 brief, riskler).

**En ucuz yol: sesi taşıyan değil, anahtar dağıtan sunucu.**

```
iPhone ──(1) "abone kaydım bu, kısa ömürlü anahtar ver"──▶ küçük sunucu ──▶ Soniox: geçici anahtar üret
iPhone ◀─(2) birkaç dakikalık anahtar──────────────────── küçük sunucu
iPhone ══(3) ses doğrudan Soniox'a, geçici anahtarla══════▶ Soniox
```

- Ses sunucumuzdan geçmez; sunucu yalnız kısa bir istek yanıtlar. Ücretsiz katmanı olan "sunucusuz işlev" hizmetleri
  (Cloudflare Workers, Vercel, Firebase Functions gibi) yeter; sınırları doğrulanmalı. Soniox'un geçici anahtar
  özelliği S02 brief'inde geçiyor; adı ve süresi Soniox belgesinden doğrulanmalı.
- **Abonelik doğrulama:** StoreKit 2'nin Apple imzalı işlem kaydını uygulama sunucuya gönderir; sunucu imzayı ve bitiş
  tarihini denetler. İade ve iptal için Apple'ın "App Store Server Notifications" bildirimleri, gerekirse "App Store
  Server API" kullanılır (kurulum ayrıntısı hesap açılınca doğrulanmalı).
- **Kötüye kullanım:** Sunucu aynı abonelikten gelen istekleri sayar, günlük üst sınır koyar. Önerim: **bulut motoru
  yalnız abonelere** (ücretsiz dakika yeniden kurulumla sıfırlanabilir; Apple'ın DeviceCheck'i çare olabilir, doğrulanmalı).

**Kabaca maliyet:** Asıl gider sunucu değil Soniox'tur: S02 brief'ine göre çeviriyle saatte yaklaşık 0,18 ABD doları,
akış açık kaldıkça işler (güncel fiyat doğrulanmalı). "Sınırsız" haftalık abonelikte çok kullanan biri ödediğinden
fazlasını harcatabilir; bulut açılmadan önce haftalık dakika sınırı ya da ayrı, pahalı bir abonelik gerekir. Apple'ın
payı da düşülür (%15, `docs/yayin.md`). Sunucunun kendisi ücretsiz katmanda sıfıra yakın olabilir (doğrulanmalı).

**Şimdi mi sonra mı:** Sonra. Önce cihaz testi (S01) ve yayın; sonra kendi anahtarınızla iki motoru karşılaştırma (S02).

## 4. Uygulamanın dili (arayüz)

**Karar:** Arayüz yalnız Türkçe; mağaza sayfası ve abonelik adı İngilizce de yazılır (`docs/yayin.md` zaten söylüyor).

**Gerekçe:** Ürünün vaadi "karşındakini Türkçe dinle"; kullanıcı Türkçe bilen biri, İngilizce arayüz ona bir şey
katmaz. İngilizce arayüz **hedef dil seçilebildiğinde** anlam kazanır (ör. Almancayı İngilizce dinlemek). Bu yeni bir
pazar kararıdır (ad, sesler, Apple'ın kendi AirPods çevirisinin zaten desteklediği diller); Türkçe pazarda abone verisi
görülmeden düşünülmemeli.

**Maliyet (String Catalog):** Proje hazır (geliştirme dili Türkçe, String Catalog açık); ekrandaki `Text("…")` yazıları
kendiliğinden toplanır. Ama hata ve durum iletilerinin çoğu `Durum.swift` / `Hat.swift` içinde düz metin; bunlar tek tek
`String(localized:)` ile sarılmalı. Kod işi birkaç gün; asıl yük çeviri, ekran görüntüleri ve her yeni metni iki dilde
tutmak. Tek kişi için sürekli yük; erken başlamaya değmez. **Ucuz hazırlık:** yeni iletiler `String(localized:)` ile yazılsın.

## 5. Kod yapısı

**Bugün:** `Durum` (ekran durumu ve çeviri döngüsü), `Hat` (mikrofon, cümle ayırma, seslendirme, kesintiler; ~1.100
satır), `Abonelik`, `Anahtarlik`, `Tanilama`, `Sabitler`, `Arayuz/`. Tek motor için **yeterli**; yeniden yazım gerekmez.

**İki motor gelince (S02) çizilecek sınır:** `Hat` bugün iki işi birden yapıyor: ortak ses işleri (mikrofon, AirPods
yolu, kesintiler, seslendirme) ve cihaza özgü tanıma. Bulut motoru ortak kısmı kullanmalı, tanımayı değil. Sınır:

```
                 ┌────────────── Durum (ekran durumu, günlük süre, abonelik) ──────────────┐
                 │                              ▲ olaylar: canlı metin, akan çeviri,       │
                 │                              │ biten cümle (asıl+Türkçe), durum, hata   │
  Ses (ortak) ───┼─ mikrofon sesi ─▶  Motor  ───┘                                          │
  mikrofon,      │                    ├─ CihazMotoru: Apple Speech + Translation            │
  AirPods yolu,  │                    └─ BulutMotoru: Soniox bağlantısı + SonioxCozucu      │
  kesintiler,    │                                   + anahtar kaynağı (bugün kullanıcının, │
  seslendirme ◀──┼─ okunacak Türkçe cümle ◀─ Durum     yarın sunucunun geçici anahtarı)     │
                 └──────────────────────────────────────────────────────────────────────────┘
```

- **Motor** tek bir sözleşmedir: içine mikrofon sesi girer, dışına yalnız olaylar çıkar. Ekran hangi motorun çalıştığını
  bilmez, yalnız olayları gösterir (sessiz motor değişimi yok, S02 KR1).
- **Ortak ses** `Hat`'tan parça parça ayrılır (önce mikrofon + AirPods yolu + kesintiler, sonra seslendirme sırası);
  cihaz motorunun davranışı değişmez (S02 K8). Cihaz motorunun çeviri oturumu SwiftUI ekranından gelir; bu korunur.
- **Anahtar kaynağı** ayrı küçük bir parçadır: bugün kullanıcının anahtarı, yarın sunucunun geçici anahtarı. Sunucu
  geldiğinde yalnız bu parça değişir.

## 6. Karar tablosu

| Konu | Bugünkü karar | Ne zaman yeniden bakılır |
| --- | --- | --- |
| Programlama dili / çatı | Swift + SwiftUI, iOS 18 | Android'e karar verildiğinde (§ 1'deki üç koşul) |
| Swift dil kipi | Swift 5 | Yayından sonra, ses kodu cihazda oturunca |
| Hesap | Yok | Android ya da web'de satış kararı |
| Abonelik doğrulama | Cihazda (StoreKit 2) | Bulut motoru bizim anahtarımızla sunulduğunda |
| Sunucu | Yok | Bulut motoru herkese açılacağında |
| Bulut motoru | Yalnız kendi anahtarıyla (S02, beklemede) | S02 karşılaştırması bittiğinde; ücret ve sınır netleşince |
| Arayüz dili | Yalnız Türkçe; mağaza metni Türkçe + İngilizce | Hedef dil seçilebilir olduğunda |
| Hedef dil | Yalnız Türkçe | Türkçe pazarda abone verisi görüldüğünde |
| Kod yapısı | Bugünkü düzen | S02 başlarken: ortak ses / motor sınırı |

## 7. Proje sahibinin karar vermesi gerekenler

1. **Android:** iPhone'da abone verisi görülmeden Android'e başlanmasın mı? Önerim: evet, beklensin.
2. **Hesap:** "Android ya da web'de satış" kararına dek hesapsız kalınsın mı? Önerim: evet, hesapsız.
3. **Bulut motoru kimin için:** Herkese sunulacaksa yalnız abonelere ve haftalık dakika sınırıyla mı? Önerim: evet, ücretsiz kullanıcıya bulut yok.
4. **Sıra:** Önce cihaz testi ve yayın, sonra S02 karşılaştırması, en son sunucu mu? Önerim: evet, bu sırayla.
5. **Arayüz dili:** İngilizce arayüz ve hedef dil seçimi şimdilik birikimde kalsın mı? Önerim: evet, yalnız mağaza metni İngilizce.
