# sifirdan/arayuz — model talimatları

## Bu temel ne yapar

On üç bağımlılıksız TypeScript mini sistemi (sinyal, sanal_dom, yonlendirici, depo, form, tablo, duzenleyici,
oyun_motoru, isin_izleyici, grafik, paketleyici, animasyon ve isteğe bağlı listeden sanal_liste) ve her birinin tarayıcı gösterimi. Her sistem
`src/<sistem>/` altında tek klasördür, kendi README'si ve `test/<sistem>/` altında testleri vardır. Kod hem
tarayıcıda (Vite) hem Node'da (vitest, `node dosya.ts`) çalışır.

## Komutlar

Hepsi bu klasörden (`havuz/sifirdan/arayuz`) çalışır.

| Komut                                                                                 | Ne zaman                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm ci`                                                                              | İlk kurulum (kilit dosyasından)                                       |
| `npm run check`                                                                       | Her değişiklikten sonra: tip + lint + biçim + birim ve kural testleri |
| `npx vitest run test/<sistem>`                                                        | Tek sistemin testleri (hızlı döngü)                                   |
| `npm run format`                                                                      | Prettier ile biçimlendir (check biçim hatası verirse)                 |
| `npm run dev`                                                                         | Gösterimleri tarayıcıda açmak (kapı 8450)                             |
| `npm run build`                                                                       | Gösterim sitesini derlemek                                            |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run e2e -- --trace off` | Gösterim değiştiyse                                                   |
| `npm run gen -- <ad>`                                                                 | Yeni mini sistem eklemek                                              |

## Harita

| Şunu değiştireceksen                          | Şuraya bak                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| Bir sistemin davranışı                        | `src/<sistem>/` — önce o klasörün `README.md`'si (dosya haritası orada)          |
| Bir sistemin dış yüzü                         | `src/<sistem>/index.ts` (tek giriş noktası; gösterimler ve testler buradan alır) |
| E-tabloya işlev eklemek                       | `src/tablo/functions/<grup>.ts` (+ yeni grup için `functions/index.ts`)          |
| Form hata iletileri                           | `src/form/messages.ts` (tek sözlük)                                              |
| Gösterim sayfası                              | `demo/<sistem>/index.html` + `main.ts` (+ `stil.css`)                            |
| Gösterimin Türkçe metinleri (koddan üretilen) | `demo/metin.ts`                                                                  |
| Ortak tema, düğme, form stilleri              | `demo/ortak/stil.css`                                                            |
| Gösterim listesi (dizin, derleme, e2e)        | `demo/gosterimler.json`                                                          |
| Tarayıcı testinin etkileşimi                  | `e2e/etkilesimler.ts`                                                            |
| Temel kuralları                               | `test/kurallar.test.ts`                                                          |
| Teknoloji/yaklaşım kararları                  | `docs/KARARLAR.md` · parçalar arası akış: `docs/MIMARI.md`                       |

## Değişmez kurallar

1. **Sistemler birbirini içe aktarmaz.** Ortak yardımcı gerekiyorsa kopyalanır, başlık yorumuna asıl kaynak
   yazılır. Tek istisna `src/yonlendirici/signal_adapter.ts` → `sinyal`. (Koruyan: `test/kurallar.test.ts`)
2. **Çalışma zamanı bağımlılığı yok.** `package.json`'da `dependencies` alanı olmaz. (Koruyan: kural testi)
3. **Her kaynak dosya Türkçe başlık yorumuyla açılır** ve ilk satırlarda `Genişletme:` satırı vardır; dosya
   300 satırı aşmaz. (Koruyan: kural testi)
4. **Her sistemin README'si** "Ne yapar / Nasıl çalışır / Dosya haritası / Sınırlar / Buradan nereye"
   bölümlerini içerir ve klasördeki **her** `.ts` dosyasını anar. (Koruyan: kural testi)
5. **Türkçe büyük/küçük harf** yalnız `toLocaleUpperCase('tr-TR')` / `toLocaleLowerCase('tr-TR')` ile.
   İngilizce tanımlayıcılar (olay adı, sütun harfi) için ASCII dönüşümü kullanılır (`asciiLower`,
   `asciiUpper`). (Koruyan: ESLint `no-restricted-syntax` + kural testi)
6. **Görünmez/birleşen karakter kaynakta kaçışla yazılır** (`'e\u0301'`, `'\u200d'`). Dosya yazma aracı
   `\u…` dizilerini gerçek karaktere çevirebilir: yazdıktan sonra depo kökünden
   `python3 havuz/araclar/kacis.py havuz/sifirdan/arayuz` çalıştırın. (Koruyan: `kacis.py --denetle`, `durum.py`)
7. **Kayıttaki her gösterimin** kaynağı, README'si, testi, sayfası, e2e etkileşimi ve kök README satırı vardır.
   (Koruyan: kural testi)
8. **Kullanıcıya görünen metin Türkçedir**; hata iletisi suçlamaz, ne yapılacağını söyler. Dışa açılan
   tanımlayıcılar İngilizcedir.
9. **Belirlenimci testler:** rastgelelik tohumlu (`Rng`, mulberry32), saat dışarıdan verilir (`ManualClock`,
   `now` seçenekleri). Testte `Math.random()`/`Date.now()` kullanılmaz.
10. **Kullanıcı verisi HTML'e kaçışsız girmez:** sanal_dom metni `createTextNode` ile, grafik `escapeXml` ile
    yazar; `javascript:` adresleri engellenir. Gösterimlerde `innerHTML`'e yalnız kaçışlanmış SVG/HTML verilir.

## Tarifler

### 1. Yeni mini sistem eklemek

1. `npm run gen -- surukle_birak` (iskelet + kayıtlar).
2. `src/surukle_birak/` altında kodu yazın; her dosya Türkçe başlık + `Genişletme:` satırı.
3. README bölümlerini doldurun; her dosyayı "Dosya haritası"na ekleyin.
4. `test/surukle_birak/` testleri; `demo/surukle_birak/` gösterimi; `e2e/etkilesimler.ts` etkileşimi.
5. Kök `README.md` dizin tablosuna satır ekleyin.
6. `npm run check` ve `npm run e2e`.

### 2. E-tabloya işlev eklemek (ör. `ÇARPIMTOPLA`/`SUMPRODUCT`)

1. `src/tablo/functions/math.ts` → `MATH` dizisine `{ names: ['ÇARPIMTOPLA', 'SUMPRODUCT'], min, max, fn }`.
2. Argümanları `num`, `text`, `asMatrix`, `collectNumbers` yardımcılarıyla okuyun; hata için `fail('value')`.
3. `test/tablo/functions.test.ts` → `cases` dizisine `['=ÇARPIMTOPLA(…)', beklenen]` satırları.
4. `src/tablo/README.md` işlev listesine ekleyin. Doğrulama: `npx vitest run test/tablo`.

### 3. Form şemasına kural eklemek (ör. TC kimlik no)

1. `src/form/messages.ts` → `IssueCode`'a kod + `messages`'a Türkçe ileti.
2. `src/form/schema.ts` → `StringSchema`'ya yöntem (`pattern` örneğini kopyalayın).
3. `test/form/schema.test.ts`'e geçerli/geçersiz örnek. Doğrulama: `npx vitest run test/form`.

### 4. Sanal DOM'a kanca eklemek (ör. `useLayoutEffect`)

1. `src/sanal_dom/instance.ts` → gerekirse `Hook` birleşimine üye.
2. `src/sanal_dom/hooks.ts` → `nextHook('tür', kur)` ile kanca; `index.ts`'den dışa aktarın.
3. `test/sanal_dom/hooks.test.ts`'e sıra/temizlik testi. Kanca kurallarını README'de anlatın.

### 5. Oyuna yeni varlık eklemek (ör. hareketli platform)

1. `src/oyun_motoru/game/level.ts` → yeni harf; `droplet.ts` → `Kind`'e üye, `spawn`'da kurulum, `touch`'ta kural.
2. `game/render.ts` → `drawEntity` içinde çizim.
3. `test/oyun_motoru/game.test.ts` → kural testi; belirlenimcilik testi hâlâ geçmeli.

### 6. Grafiğe yeni tür eklemek

1. `src/grafik/types.ts` → `ChartType`'a üye; `cartesian.ts`'te çizim dalı (ya da yeni dosya).
2. `test/grafik/svg.test.ts` → SVG yapısını DOMParser ile denetleyen test.
3. `demo/grafik/main.ts`'te bir örnek; `npm run e2e -- -g grafik`.

### 7. Gösterim metni değiştirmek

1. Durağan metin → `demo/<sistem>/index.html`; koddan üretilen metin → `demo/metin.ts`.
2. e2e etkileşimi o metne bakıyorsa `e2e/etkilesimler.ts`'i de güncelleyin.

## Sık yapılan hatalar

| Belirti                                                | Neden                                                     | Çözüm                                                    |
| ------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------- |
| `npm run check` "Code style issues" der                | Prettier biçimi                                           | `npm run format`                                         |
| Kural testi: "Dosya haritası'na x.ts satırını ekleyin" | README güncel değil                                       | O sistemin README tablosuna satır ekleyin                |
| Kural testi: "sistemler bağımsız kalmalı"              | Başka sistemden içe aktarma                               | Yardımcıyı kopyalayın, kaynağını başlığa yazın           |
| `durum.py`'de "görünmez karakter"                      | `\u0301` gerçek karaktere dönmüş                          | `python3 havuz/araclar/kacis.py havuz/sifirdan/arayuz`   |
| `"i5"` hücresi `İ5` olur / olay adı `ınput` olur       | tr-TR büyütme/küçültme İngilizce tanımlayıcıya uygulanmış | `asciiUpper` / `asciiLower` kullanın                     |
| JSX'te `key` tür hatası                                | `h.JSX.IntrinsicAttributes` eksik                         | `src/sanal_dom/vnode.ts`'teki ad alanına bakın           |
| Kanca hatası "Kanca sırası değişti"                    | Kanca koşul/döngü içinde                                  | Kancaları bileşenin başında koşulsuz çağırın             |
| Sinyal: "Hesaplanmış değer içinde sinyal yazılamaz"    | `computed` içinde yazma                                   | Yazmayı bir `effect`'e taşıyın                           |
| e2e "strict mode violation"                            | Aynı metin sayfada iki kez                                | `getByText(…, { exact: true })` ya da rol + ad           |
| e2e axe "scrollable-region-focusable"                  | Kayan kap klavyeyle odaklanamıyor                         | Kaba `tabindex="0"` ve `aria-label` verin                |
| e2e yatay kaydırma hatası                              | Geniş içerik                                              | İçeriği `.kaydir` kabına alın ya da `min-width: 0` verin |

## Bitti tanımı

- [ ] `npm run check` yeşil (tip, lint, biçim, birim ve kural testleri)
- [ ] Gösterim değiştiyse `npm run e2e` yeşil (390×844 ve 360×800, axe'te ciddi/kritik yok, yatay kaydırma yok)
- [ ] Yeni/değişen dosyada Türkçe başlık + `Genişletme:` satırı; dosya ≤ 300 satır
- [ ] Sistemin README'si güncel (dosya haritası, sınırlar)
- [ ] `python3 havuz/araclar/kacis.py --denetle havuz/sifirdan/arayuz` temiz
- [ ] Yeni davranışın testi var; testte rastgelelik tohumlu, saat sahte
