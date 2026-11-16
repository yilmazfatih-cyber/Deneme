# Kararlar

Kısa kayıtlar: ne seçildi, neden, neyin elendiği. Yeni karar en alta eklenir.

## K1 — Tek Node projesi, sistem başına bir klasör

**Seçim:** Tüm sistemler tek `package.json` altında; her sistem `src/<sistem>/` klasöründe. **Neden:** Tek
`npm ci`, tek `npm run check`; küçük model için komut ezberi yok. **Elenen:** npm çalışma alanları (her sistem
ayrı paket) — on üç kilit/ayar dosyası, hiçbir kazanç yok. **Bağımsızlık nasıl korunuyor:** kural testi,
sistemler arası içe aktarmayı yasaklar (tek istisna: yönlendiricinin sinyal köprüsü).

## K2 — TypeScript ~6.0.3, `.ts` uzantılı içe aktarma

**Neden:** typescript-eslint 8.72 TS 7'yi desteklemiyor (ortak brif). `allowImportingTsExtensions` +
`erasableSyntaxOnly` ile her dosya Node 22'nin tip ayıklamasıyla doğrudan çalışır (`node src/paketleyici/cli.ts`).
`enum`, `namespace` (değerli), parametre özelliği kullanılmaz; JSX türleri yalnız tür içeren `h.JSX` ad alanında.

## K3 — Çalışma zamanı bağımlılığı yok; geliştirme araçları az

`vite` (gösterim sitesi), `vitest` (birim test), `jsdom` (DOM testleri: SVG için `DOMParser`, odak, olay
kabarması olgun), `@playwright/test` + `@axe-core/playwright` (tarayıcı testi + erişilebilirlik), `eslint` +
`typescript-eslint` + `globals`, `prettier`, `@types/node`. happy-dom elendi: jsdom'un standartlara uyumu bu
testler için yeterli ve tek DOM ortamı yeterli.

## K4 — Gösterimler çatısız; kayıt dosyası her şeyi sürer

Gösterim sayfaları düz HTML + TS (sanal_dom gösterimi kendi çatısıyla JSX). `demo/gosterimler.json` dizin
sayfasını, Vite girişlerini, e2e döngüsünü ve kural testlerini besler: yeni gösterim tek yerde kaydedilir.

## K5 — Gösterim metinleri: durağan metin HTML'de, dinamik metin `demo/metin.ts`'te

STANDARTLAR "arayüz metni tek sözlükte" der. Sayfanın durağan anlatımı bir belge gibi HTML'de bırakıldı
(okunaklı, ekran okuyucu için anlamlı yapı); betiklerin ürettiği her ileti (`durum`, hata, sayaç) tek sözlükte.
Kütüphane iletileri kendi sözlüklerindedir (`src/form/messages.ts`). **Bilinçli sapma**, raporda belirtildi.

## K6 — sinyal: it-çek + dönem sayacı

Saf itme (her yazmada hesapla) elmasta glitch ve gereksiz hesap üretir; saf çekme her okumada tüm zinciri
denetler. Seçilen: itmede yalnız "eskimiş olabilir" işareti, okumada sürüm karşılaştırması (Preact Signals'ın
yaklaşımı). Canlı olmayan `computed` kaynaklarına abone olmaz (bellekte kalmaz); global dönem sayacıyla "o günden
beri yazma oldu mu?" sorusu O(1).

## K7 — sanal_dom: iki ağaç, çapalı parça, LIS

VNode değişmez tarif, durum ayrı "yerleşik ağaçta" (aynı VNode iki yerde kullanılabilir). Parça iki boş metin
çapası arasında: "düğüm nerede başlar?" sorusu hep yanıtlı. Anahtarlı listede en uzun artan alt dizi dışındakiler
taşınır (Vue 3/Inferno yöntemi). Taşınan odaklı öğenin odağı geri verilir (tarayıcı düşürür). JSX klasik
çalışma zamanı (`h`): ayrı `jsx-runtime` modülü ve yol takma adı gerekmez; `Fragment` TS denetimi için işlevdir.

## K8 — yonlendirici: puanlı desenler, AbortController ile yarış koruması

React Router'ın puanlama fikri (sabit > parametre > joker). Her geçiş kendi `AbortController`'ını alır; geç
gelen yükleyici sonucu atılır. Kaydırma konumu geçmiş kaydının anahtarıyla saklanır. Varsayılan geçmiş bellek
kipidir (Node ve test).

## K9 — depo: eylem çoğaltmayla sekme eşitleme, sürümlü kalıcılık

Sekmeler arası tam durum göndermek yerine eylem yayınlanır (küçük ileti, aynı indirgeyici); yeni sekme bir kez
tam durum ister. Çakışan eşzamanlı yazmalar için CRDT yok (Sınırlar'da). Kalıcılık zarfı `{ v, durum }`;
gelecek sürümün kaydı **üzerine yazılmaz** (veri kaybı yerine salt okunur).

## K10 — form: kendi şema doğrulayıcısı, eksiz Türkçe iletiler

Şartname bağımlılıksız doğrulayıcı istiyor (Zod elendi). Türkçe sayı ekleri ses uyumuna bağlı (18'den, 40'tan);
iletiler bu yüzden ek almayan kalıpla yazıldı ("En az 18 olmalı"). Uzunluk grafemle ölçülür. Eşzamansız
doğrulamada sıra numarası + iptal: eski yanıt yeni sonucu ezemez. Nesne düzeyindeki `refine(…, at)` ilgisiz
alanların hatalarından etkilenmez (çok adımlı formda şifre eşleşmesi 1. adımda görünsün diye).

## K11 — tablo: Tarjan ile tek geçişte sıra + döngü

Etkilenen alt çizgede Tarjan güçlü bağlı bileşenleri hem topolojik sırayı hem döngüleri verir; özyinelemesiz
yazıldı (uzun zincirde yığın taşmaz). Aralık bağımlılıkları hücre hücre açılır (basit; büyük aralıkta bellek
harcar — Sınırlar). İşlev adı katlama `tr-TR` büyütme + `İ→I`: `MIN`, `MİN`, `min` aynı. Metin işlevleri grafem
sayar (Excel'den bilinçli fark). Öncelik Excel'inki (`-2^2 = 4`).

## K12 — duzenleyici: parça tablosu (dizi) ve desen dönüşümüyle Türkçe arama

İp (rope) yerine parça tablosu: geri alma dostu, anlaşılır. Parçalar düz dizi (ağaç değil): okunaklılık için;
büyük belge sınırı README'de. Türkçe duyarsız arama metni katlayarak değil **deseni** dönüştürerek yapılır
(`i` → `[iİ]`): konumlar birebir kalır ve düzenli ifadeyle çalışır. Gösterim `contenteditable` yerine gizli
textarea köprüsü kullanır (IME ve ekran okuyucu metni oradan alır).

## K13 — oyun_motoru: sabit adım, ayrı görsel RNG, özgün oyun

"Fix Your Timestep" döngüsü; ECS depoları ekleme sıralı `Map`. Görsel etkiler ayrı RNG kullanır: çizim
kapatılsa da mantık aynı kalır. Durum özeti 64 bit ham bayt üzerinden FNV-1a. Örnek oyun "Damla" bu depo için
tasarlandı (kopya değil); tüm çizimler programla.

## K14 — isin_izleyici: Whitted, medyan BVH, iki PNG yolu

Yol izleme yerine Whitted (belirlenimci, hızlı, piksel özeti testi mümkün). BVH medyan bölme (SAH yerine;
basit). PNG'de sıkıştırma platformdan (`CompressionStream`), ayrıca tamamen elle "stored" zlib — testte bağımsız
çözücüyle doğrulanır. İşçi iptali: sonlandırıp yenisini başlatmak.

## K15 — grafik: saf SVG dizgisi + ayrı etkileşim katmanı

Çizim saf işlev (Node'da test edilir); etkileşim (`mountChart`) ayrı. SVG `role="img"` ve içinde odaklanılabilir
öğe yok; klavye gezinmesi saran öğede, duyuru `aria-live` ile (iç içe etkileşimli öğe sorunu yok). Renkler CSS
değişkeni: tema sayfa düzeyinde değişir.

## K16 — paketleyici: anlık görüntü içe aktarmaları (kapsam çözümlemesi yok)

Canlı bağ (live binding) için her başvurunun yeniden adlandırılması gerekir; bu tam bir kapsam çözümleyicisi
ister. Seçilen: adlandırılmış içe aktarma `const { a } = __require(…)` (anlık görüntü), dışa aktarımlar alıcı
(canlı), alıcılar gövdeden önce (döngüde yukarı taşınan işlevler çalışır). Fark README'de açıkça yazılı ve test,
örnek projenin Node ESM'siyle aynı sonucu verdiğini kanıtlar. Ağaç silkelemede başvurular fazla tahmin edilir.

## K17 — animasyon: kapalı formül yay, OKLab, paylaşılan zamanlayıcı

Yay konumu her karede kapalı formülden (kare hızından bağımsız); doğruluk RK4 ile sınanır. Renk OKLab'da
karışır (sRGB ortası bulanık). Tüm animasyonlar tek rAF döngüsü; testte `ManualClock`.

## K18 — e2e: boş kapı, 2 işçi, axe ciddi/kritik kapısı

`scripts/e2e.ts` işletim sisteminden boş kapı alır (sabit kapı yok); paylaşımlı makine için 2 işçi. Her gösterim
390×844 ve 360×800'de: başlık, temel etkileşim, sayfa hatası yok, yatay kaydırma yok, axe'te ciddi/kritik yok.

## K19 — Kurallar vitest'te

Yapısal kurallar (README bölümleri, başlık yorumu, dosya boyu, kayıt tutarlılığı, bağımsızlık) özel ESLint
eklentisi yerine `test/kurallar.test.ts`'te: düz TypeScript, iletisi düzeltme adımını söyler.
