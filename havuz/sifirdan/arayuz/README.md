# Sıfırdan: arayüz, tarayıcı ve grafik kolu

Bir web çatısı, e-tablo, metin düzenleyici ya da oyun motoru **içeride nasıl çalışır?** Bu klasör bu soruyu on
üç küçük sistemle yanıtlar. Her sistem tek bir klasördür, çalışma zamanında hiçbir pakete bağımlı değildir,
bolca testle kanıtlanmıştır ve tarayıcıda açılıp denenebilen bir gösterimi vardır. Hem okunacak bir başvuru
hem de üstüne özellik eklenecek sağlam bir çekirdek olarak yazıldı.

## 5 dakikada çalıştırma

```bash
cd havuz/sifirdan/arayuz
npm ci              # geliştirme araçlarını kilit dosyasından kurar
npm run check       # tip + lint + biçim + birim ve kural testleri (bu makinede 23–30 sn)
npm run dev         # gösterim sitesi: http://localhost:8450 (doluysa sonraki boş kapı)
```

Tarayıcı testleri (derler, telefon boyutlarında açar, axe ile erişilebilirlik tarar):

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run e2e -- --trace off
```

## Dizin

| Sistem                                         | Ne öğretir                                                                                                          | Gösterim                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`sinyal`](src/sinyal/README.md)               | İnce taneli tepkisellik: it-çek algoritması, elmas bağımlılıkta tek hesap, döngü algılama                           | [demo/sinyal/](demo/sinyal/index.html)               |
| [`sanal_dom`](src/sanal_dom/README.md)         | React benzeri çatı: fark alma, anahtarlı liste (LIS), kancalar ve kuralları, toplu güncelleme, hata sınırı          | [demo/sanal_dom/](demo/sanal_dom/index.html)         |
| [`yonlendirici`](src/yonlendirici/README.md)   | İstemci yönlendirme: desen puanlama, iç içe rotalar, koruma, yükleyici yarışı, kaydırma konumu                      | [demo/yonlendirici/](demo/yonlendirici/index.html)   |
| [`depo`](src/depo/README.md)                   | Öngörülebilir durum: indirgeyici, ara katman, yapısal paylaşım, geri al, kalıcılık + göç, sekme eşitleme            | [demo/depo/](demo/depo/index.html)                   |
| [`form`](src/form/README.md)                   | Form yönetimi: şema doğrulama, yarışa dayanıklı eşzamansız denetim, alan dizileri, erişilebilir hata                | [demo/form/](demo/form/index.html)                   |
| [`tablo`](src/tablo/README.md)                 | E-tablo motoru: formül ayrıştırma, bağımlılık çizgesi, Tarjan ile sıralama ve döngü, 53 işlev                       | [demo/tablo/](demo/tablo/index.html)                 |
| [`duzenleyici`](src/duzenleyici/README.md)     | Metin düzenleyici: parça tablosu, çoklu imleç, gruplu geri al, Türkçe duyarsız düzenli ifade arama                  | [demo/duzenleyici/](demo/duzenleyici/index.html)     |
| [`oyun_motoru`](src/oyun_motoru/README.md)     | 2B oyun: sabit adım, ECS, çarpışma, uzamsal karma, fizik, kamera, belirlenimci tekrar; örnek oyun Damla             | [demo/oyun_motoru/](demo/oyun_motoru/index.html)     |
| [`isin_izleyici`](src/isin_izleyici/README.md) | Işın izleme: kesişimler, gölge, yansıma, Fresnel kırılma, BVH, gama, sıfırdan PNG, Web Worker                       | [demo/isin_izleyici/](demo/isin_izleyici/index.html) |
| [`grafik`](src/grafik/README.md)               | SVG grafik: güzel eksen adımları, zaman ölçeği, Türkçe biçim, klavye ve veri tablosuyla erişilebilirlik             | [demo/grafik/](demo/grafik/index.html)               |
| [`paketleyici`](src/paketleyici/README.md)     | Modül paketleyici: JS sözcük çözümleme, modül çizgesi, ağaç silkeleme, kaynak haritası                              | [demo/paketleyici/](demo/paketleyici/index.html)     |
| [`sanal_liste`](src/sanal_liste/README.md)     | Değişken yükseklikli sanallaştırma: Fenwick ağacıyla O(log n) konum, ölçüm, kaydırma çapası (isteğe bağlı listeden) | [demo/sanal_liste/](demo/sanal_liste/index.html)     |
| [`animasyon`](src/animasyon/README.md)         | Hareket: cubic-bezier, kapalı formül yay fiziği, OKLab renk geçişi, zaman çizelgesi, FLIP                           | [demo/animasyon/](demo/animasyon/index.html)         |

Her sistemin README'sinde aynı bölümler vardır: **Ne yapar**, **Nasıl çalışır** (çizimle), **Dosya
haritası**, **Sınırlar**, **Buradan nereye**.

## Komutlar

| Komut                                              | Ne yapar                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                                      | Gösterim sitesi (Vite, kapı 8450; doluysa sonraki boş kapı)                           |
| `npm run build`                                    | Gösterim sitesini `dist/`'e derler (statik; her barındırmada çalışır)                 |
| `npm run check`                                    | Tip denetimi + ESLint + Prettier + birim testler + kural testleri                     |
| `npm test`                                         | Yalnız birim testler (vitest)                                                         |
| `npm run e2e`                                      | Derler, boş bir kapıda sunar, Playwright ile 390×844 ve 360×800'de gösterimleri sınar |
| `npm run gen -- <ad>`                              | Yeni mini sistemin iskeleti: kaynak, README, test, gösterim, kayıtlar                 |
| `node src/paketleyici/cli.ts giris.js -o paket.js` | Paketleyiciyi komut satırından kullanma                                               |

## Klasörler

```
src/<sistem>/    sistemin kodu + README.md (her dosya ≤ 300 satır, Türkçe başlık yorumu)
test/<sistem>/   birim testleri (vitest; DOM isteyenler jsdom ile)
test/kurallar.test.ts  temelin kendi kurallarını koruyan testler
demo/<sistem>/   gösterim sayfası (index.html + main.ts) · demo/ortak/stil.css ortak tema
demo/gosterimler.json  gösterim kaydı (dizin sayfası, derleme ve e2e buradan okur)
demo/metin.ts    gösterimlerin koddan ürettiği Türkçe metinler (tek sözlük)
e2e/             Playwright testleri · scripts/  e2e çalıştırıcı ve üreteç
docs/            KARARLAR.md (neden böyle?) · MIMARI.md (parçalar ve akış)
```

## Sınırlar

- Bunlar **öğretici ve genişletilebilir çekirdeklerdir**, üretimdeki React/Excel/VS Code'un yerine geçmez. Her
  sistemin bilinen eksikleri kendi README'sinin "Sınırlar" bölümündedir.
- Sistemlerin boyutu 230–1.630 satır arasıdır. Şartnamedeki "kabaca 300–900 satır" hedefini e-tablo (53 işlev),
  oyun motoru (14 alt parça + örnek oyun), paketleyici, sanal_dom ve düzenleyici aşar; dosya başına 300 satır
  sınırı ise her yerde korunur (kural testi).
- Şartnamenin "iyi olur" listesinden yalnız `sanal_liste` yazıldı; `sablon_derleyici` ve `surukle_birak` yoktur.
- Hız iddiası yoktur; verilen tek süre ölçümü (ışın izleyici) nasıl ölçüldüğüyle birlikte yazılıdır.
- Gösterimler yalnız Chromium'da (Playwright) sınandı; Firefox ve Safari'de denenmedi.
- Belirlenimcilik testleri (oyun durum özeti, ışın izleyici piksel özeti) aynı JS motorunda geçerlidir;
  farklı motorlarda `Math.sin/pow` son basamakları farklıysa özet değişebilir.
