# Bölüş — Nihai Görsel Tasarım Şartnamesi

Sürüm: nihai (jüri sonrası) · Tarih: 2 Kasım 2026 · Temel: **"Sakin Finans"**; "Sıcak ev" ve "Hızlı giriş" yaklaşımlarından seçilen fikirler aşılandı.

Bu dosya tek başına yeterlidir. Geliştirici başka bir tasarım belgesine bakmadan uygular: Ek A yapıştırılabilir tam stil sayfasıdır, Ek B simge takımıdır, Bölüm 6 ekran ekran şablon değişikliğidir.

## 0. Kapsam ve değişmezler

**Değişen:** `bolus/index.html` içindeki `<style>` ve `<meta>` etiketleri, `bolus/app.mjs` içindeki HTML şablon dizeleri ve görünen metinler, `manifest.webmanifest` renkleri, `icon.svg` zemin rengi, `sw.js` önbellek sürümü.

**Değişmeyen:** `hesap.mjs`, veri modeli, `normalizeGroup`, kayıt/yükleme, yönlendirme (`go`, `render`), `bindRows`, `bindCommon`, olay mantığı.

**DOM sözleşmesi (şablonlar yeniden yazılırken aynen kalır):**

- `id`: `back`, `group-switch`, `q`, `list`, `f`, `del`, `single-payer`, `multi-payer`, `payer-hint`, `split-lines`, `split-hint`, `form-err`, `new-group`, `import-btn`, `share`, `csv`, `export`, `import`, `currency`, `wipe`, `rename-group`, `delete-group`, `add-member`, `me`, `merge`, `replace`, `fab`.
- Form `name`: `description`, `amount`, `date`, `category`, `note`, `payer`, `multiPayer`, `from`, `to`, `me`, `name`.
- `data-*`: `data-id`, `data-kind` (`#list .row[data-id]`), `data-s`, `data-settle`, `data-split`, `data-split-in`, `data-payer`, `data-calc`, `data-rename`, `data-del`, `data-g`.
- Sınıf: `.row` (liste satırları `#list .row[data-id]` ile bağlanır), `.hidden`, `.link`, `.btn`, `.primary`, `.danger`.
- `form.payer.value`, `form.from.value`, `form.to.value` yalnızca okunur. Bu üç alan radyo grubuna çevrildiğinde de çalışır (`RadioNodeList.value`). **Her radyo grubunda başlangıçta biri `checked` olmak zorundadır** (yoksa değer boş döner).

**İzin verilen tek davranış dokunuşu:** yeni harcama formunda ilk odak `form.description.focus()` yerine `form.amount.focus()` olur (satır ~916). Reddedilirse alan sırası yine tutar-ilk kalır, yalnızca klavye açıklamada açılır.

**Sunum yardımcıları (mantık değil, biçimlendirme):**

- `icon(name)` → `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
- `moneyHtml(cents, opts)` → `money()` çıktısındaki baştaki `-` karakterini `−` (U+2212) yapar. Hesap değişmez.

---

## 1. Tasarım ilkeleri (5)

1. **Sayı kahramandır, süs yoktur.** Bankacılık sakinliği: düz yüzey, ince çizgi, gölge ve emoji yok. Tek vurgu rengi derin petrol yeşili; yalnızca eylem ve seçili durum içindir.
2. **Para yönü dört kanalla söylenir.** Renk + işaret (`+` / gerçek eksi `−`) + sözcük (alacak / borç / ödeşti) + etiket biçimi (dolu / çerçeveli / ince çizgili). Gri tonda bile ayırt edilir. Renk yalnızca **sizin** durumunuz içindir; başkalarının borcu nötrdür.
3. **Bir ekranda bir iş, el tercihinden bağımsız.** Ana eylem tam genişlikte ve başparmak bölgesindedir (dock, yapışık form çubuğu, diyalog düğmeleri). Sağa yaslı yüzen düğme yok; ayrı sol el modu gerekmez.
4. **Hata affeder, güvenli seçenek öndedir.** Güvenli seçenek ana düğmedir (Birleştir, Üzerine yaz değil); silme onayında ilk odak Vazgeç'tedir; DOM sırası = görsel sıra. Hata kırmızı değil, kehribar bilgi kutusudur ve ne yapılacağını söyler. Kırmızı yalnızca silme eylemidir.
5. **Büyük, okunur, ölçeklenir.** Hedefler ≥ 48 px (ana eylem 56, liste satırı ≥ 72), gövde 17 px, en küçük yazı 14 px. Yazılar `rem` ile yazılır, hedefler `min-height` olur; sistem yazı boyutu %200'e kadar kırılmadan sarar. Adlar kesilmez, sarar.

---

## 2. Token tablosu

### 2.1 Renk (açık / koyu)

Tek vurgu: `--accent`. Anlamsal renkler yalnızca para yönü içindir: `--pos` (= vurgu), `--neg` (pişmiş toprak). `--danger` yalnızca Sil düğmesi ve silme onayıdır. Kenarlık gereken her yerde `--line-strong`; `--line` yalnızca süs ayracıdır (bilgi taşımaz, etkileşim sınırı olamaz).

| Token              | Açık                 | Koyu              | Kullanım                                                  |
| ------------------ | -------------------- | ----------------- | --------------------------------------------------------- |
| `--bg`             | `#F6F5F1`            | `#0F1413`         | Sayfa zemini (sıcak kâğıt / sıcak siyah), üst çubuk, dock |
| `--surface`        | `#FFFFFF`            | `#171D1C`         | Kart, alan, alt gezinme, diyalog                          |
| `--sunken`         | `#EFEDE7`            | `#1E2625`         | Segment kanalı, avatar zemini, basılı satır, pasif düğme  |
| `--ink`            | `#14201E`            | `#E8EEEC`         | Ana metin, sayılar, alan etiketi                          |
| `--ink-2`          | `#475451`            | `#B5C1BD`         | İkincil metin                                             |
| `--ink-3`          | `#5C6865`            | `#9AA7A3`         | Yer tutucu, pasif metin, `›` işareti                      |
| `--line`           | `#E3E0D9`            | `#2A3331`         | Yalnızca süs ayracı                                       |
| `--line-strong`    | `#838D8A`            | `#78857F`         | Alan, düğme, onay kutusu, avatar kenarlığı                |
| `--accent`         | `#0B5D57`            | `#4CC2B6`         | Ana düğme, seçili durum, bağlantı, odak halkası           |
| `--on-accent`      | `#FFFFFF`            | `#04211E`         | Vurgu üstündeki metin                                     |
| `--accent-soft`    | `#E1EEEC`            | `#15332F`         | Seçili çip, alacak etiketi, tonal düğme                   |
| `--pos`            | `#0B5D57`            | `#4CC2B6`         | Alacak tutarı ve etiketi                                  |
| `--pos-soft`       | `#E1EEEC`            | `#15332F`         | Alacak etiket zemini                                      |
| `--neg`            | `#9A3D0E`            | `#F2A56F`         | Borç tutarı, borç etiketi çerçevesi, bilgi kutusu çizgisi |
| `--neg-soft`       | `#F8EADF`            | `#2C2018`         | Bilgi/hata kutusu zemini                                  |
| `--danger`         | `#A61E1E`            | `#FF8F85`         | Yalnızca Sil düğmeleri                                    |
| `--inverse`        | `#1F2A27`            | `#E8EEEC`         | Toast zemini                                              |
| `--on-inverse`     | `#FFFFFF`            | `#14201E`         | Toast metni                                               |
| `--inverse-accent` | `#8EE0D6`            | `#0B5D57`         | Toast "Geri al"                                           |
| `--scrim`          | `rgba(20,32,30,.55)` | `rgba(0,0,0,.65)` | Diyalog perdesi                                           |

**Ölçülmüş kontrast (WCAG 2.x, betikle yeniden hesaplandı):**

| Çift                                        | Açık | Koyu | Ölçüt |
| ------------------------------------------- | ---- | ---- | ----- |
| `--ink` / `--surface`                       | 16,7 | 14,5 | ≥ 7   |
| `--ink` / `--bg`                            | 15,3 | 15,8 | ≥ 7   |
| `--ink-2` / `--bg`                          | 7,25 | 10,0 | ≥ 7   |
| `--ink-2` / `--sunken`                      | 6,8  | 8,3  | ≥ 4,5 |
| `--ink-3` / `--surface`                     | 5,8  | 6,9  | ≥ 4,5 |
| `--ink-3` / `--sunken` (pasif düğme)        | 4,95 | 6,2  | ≥ 4,5 |
| `--accent` / `--surface`                    | 7,7  | 7,9  | ≥ 7   |
| `--accent` / `--bg`                         | 7,1  | 8,6  | ≥ 7   |
| `--on-accent` / `--accent`                  | 7,7  | 7,8  | ≥ 7   |
| `--accent` / `--accent-soft`                | 6,5  | 6,3  | ≥ 4,5 |
| `--neg` / `--surface`                       | 6,9  | 8,5  | ≥ 4,5 |
| `--neg` / `--neg-soft`                      | 5,85 | 7,8  | ≥ 4,5 |
| `--ink` / `--neg-soft` (bilgi kutusu metni) | 14,2 | 13,5 | ≥ 7   |
| `--danger` / `--surface`                    | 7,4  | 7,8  | ≥ 4,5 |
| `--line-strong` / `--surface` (kenarlık)    | 3,4  | 4,4  | ≥ 3   |
| `--line-strong` / `--bg`                    | 3,1  | 4,8  | ≥ 3   |
| Toast metni / `--inverse`                   | 14,8 | 14,2 | ≥ 7   |
| "Geri al" / `--inverse`                     | 9,7  | 6,6  | ≥ 4,5 |

**Kural:** `--line-strong` kenarlığı yalnızca `--surface` veya `--bg` üstünde durur; `--sunken` üstünde 3:1'in altına düşer (açıkta 2,9). Bu yüzden `.seg` kanalının kendisi `--line` (süs) kullanır, içindeki seçili düğme dolu vurgudur.

`prefers-contrast: more`: `--line` = `--line-strong`, `--ink-2` = `--ink`.

### 2.2 Tipografi

Yazı tipi: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (yazı tipi indirilmez; çevrimdışı). Her yerde `font-variant-numeric: tabular-nums lining-nums`. `text-transform` hiçbir yerde kullanılmaz (tümü büyük harf yok). Baş harfler mevcut `toLocaleUpperCase('tr-TR')` ile kalır.

| Rol                                   | rem / px    | Satır | Ağırlık                     | Nerede                                    |
| ------------------------------------- | ----------- | ----- | --------------------------- | ----------------------------------------- |
| Kahraman sayı                         | 2,25 / 36   | 1,1   | 700, −0,01em                | Harcamalar özet kartı "Bakiyeniz"         |
| Tutar alanı                           | 2 / 32      | 1,2   | 700                         | `input.amount`                            |
| Sayfa başlığı `.page-title`           | 1,75 / 28   | 1,2   | 700                         | Sekme ekranlarının `h1`'i                 |
| Üst çubuk başlığı                     | 1,25 / 20   | 1,3   | 700                         | Ayrıntı ekranlarının `h1`'i; marka 18/700 |
| Diyalog başlığı                       | 1,25 / 20   | 1,3   | 700                         | `dialog h3`                               |
| Bakiye satırı tutarı                  | 1,25 / 20   | 1,3   | 700                         | `.row.bal .amt`                           |
| Bölüm başlığı `.card h2`              | 1,0625 / 17 | 1,3   | 700                         | Cümle düzeni, `--ink`                     |
| Gövde, satır başlığı, düğme           | 1,0625 / 17 | 1,45  | 400 / 600 / 700 (ana düğme) | Her yerde                                 |
| Satır tutarı `.amt`                   | 1,0625 / 17 | 1,3   | 700                         |                                           |
| İkincil `.sub`, `.hint`, alan etiketi | 0,9375 / 15 | 1,4   | 400 / 600 (etiket)          |                                           |
| Küçük `.tag`, gezinme etiketi         | 0,875 / 14  | 1,3   | 600                         | En küçük yazı: 14                         |

Satır başlığı en çok 2 satır (`line-clamp`). Ad kesilmez: `overflow-wrap: anywhere`.

### 2.3 Boşluk, köşe, gölge, hareket, hedef

| Alan                         | Değer                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| Boşluk ölçeği                | 4 · 8 · 12 · 16 · 20 · 24 · 32 px                                                                    |
| Sayfa kenar boşluğu          | 16 px; bölümler arası 20 px; kart iç boşluğu 16 px                                                   |
| Aynı gruptaki düğmeler arası | 12 px (hiçbir yerde < 8)                                                                             |
| Köşe                         | Kontrol 10 px · yüzey 12 px · diyalog 16 px · etiket 6 px · avatar yuvarlak                          |
| Çizgi                        | Yüzey 1 px `--line` · kontrol 1,5 px `--line-strong`                                                 |
| Gölge                        | Yüzeylerde yok. Yalnızca toast ve diyalog: `0 8px 24px rgba(20,32,30,.18)` (koyuda `rgba(0,0,0,.5)`) |
| Hareket                      | Yalnızca `background-color .12s`. Kayma, büyüme, sıçrama yok. `prefers-reduced-motion: reduce` → 0   |
| Dokunma hedefi               | Genel ≥ 48 · ana eylem 56 · liste satırı ≥ 72 · alt gezinme 64 · seçici hücre ≥ 92×88                |
| Üst genişlik                 | `#app` 640 px, ortalı                                                                                |
| Yüksekler                    | Üst çubuk 56 (+ güvenli alan) · dock 73 (8+56+8+1) · gezinme 64                                      |

Kural: yazı `rem`, hedefler `min-height`. Hiçbir bileşende sabit `height` (avatar, simge, onay kutusu hariç).

---

## 3. Dil: alacak, borç, ödeşti

### 3.1 Dört kanal

| Durum  | Renk      | İşaret              | Sözcük            | Biçim (etiket)                                      |
| ------ | --------- | ------------------- | ----------------- | --------------------------------------------------- |
| Alacak | `--pos`   | `+₺3.325,25`        | alacak / alacaklı | **Dolu**: `--pos-soft` zemin, çerçevesiz            |
| Borç   | `--neg`   | `−₺430,15` (U+2212) | borç / borçlu     | **Çerçeveli**: şeffaf zemin, 1,5 px `--neg` çerçeve |
| Ödeşti | `--ink-2` | `₺0,00` işaretsiz   | ödeşti            | **İnce çizgili**: 1,5 px `--line-strong` çerçeve    |

Tek kelime dağarcığı (tüm uygulamada): **alacak / alacaklı · borç / borçlu · ödeşti · ödeme · harcama**. "Size borçlu", "borcunuz ₺X", "dahil değilsiniz" gibi karışık ifadeler kalkar.

### 3.2 Kimin durumu renklenir?

- Renk, işaret ve etiket yalnızca **ben (siz)** için kullanılır: Bakiyeniz, sizin harcama etkiniz, "kim kime" satırında taraflardan biri sizseniz.
- Başkalarının arasındaki borç **nötrdür** (`--ink`, işaretsiz, renksiz).
- Kırmızı borç için kullanılmaz; borç bir hata değildir.
- "Siz" ifadesi kullanılır (ek almayan dil): "Can → Siz". "-e/-den" ekleri yeni metinlerde yok; Türkçe ünlü uyumu hatası çıkmaz.
- Sayının yanında/altında her zaman sözcük vardır. Ekran okuyucu sırası: tutar, sözcük.

### 3.3 Hata ve uyarı dili

Kehribar bilgi kutusu (`.hint.err`): `--neg-soft` zemin, 4 px `--neg` sol çizgi, `--ink` metin, solda dairesel "i" simgesi. Kırmızı yok, "hatalı/geçersiz" yok. Metin ne yapılacağını söyler ("Tutarı rakamla yazın, örn. 250,50."). Boşken gizlidir.

---

## 4. Bileşen kuralları

Tam CSS Ek A'dadır. Yeni sınıflar **kalın**.

| Bileşen             | Yapı                                                         | Kural                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Üst çubuk (sekme)   | `header.top` > **`p.brand`** "Bölüş" + `select#group-switch` | 56 px, zemin `--bg`, altı 1 px `--line`. Seçici 48 px, 1,5 px `--line-strong`, `--surface`, en çok %55 genişlik. Marka `h1` değildir.                                      |
| Üst çubuk (ayrıntı) | `header.top` > `button#back.back` + `h1`                     | Geri: ok simgesi + "Geri" yazısı, ≥ 72×48, `--accent`. Seçici yok.                                                                                                         |
| Sayfa başlığı       | **`h1.page-title`**                                          | `main`'in ilk öğesi; sekme, karşılama ve bağlantı-al ekranlarında.                                                                                                         |
| Alt gezinme         | `nav.bottom` > `.inner` > `a`                                | 64 px; 24 px çizgi simgesi + 14/600 görünür etiket. Seçili: `--accent` renk + 700 etiket + kalın simge çizgisi + üstte 3 px × %50 çubuk. `aria-current="page"`.            |
| Dock                | **`.dock`** > `button#fab.btn.primary`                       | Gezinmenin üstünde sabit, tam genişlik, 56 px düğme (en çok 608). Yalnızca Harcamalar ekranı, `members.length > 0`.                                                        |
| Form çubuğu         | **`.form-bar`**                                              | `position: sticky; bottom: 0`; `--bg` zemin, üstü çizgi; içinde sırayla `#form-err` ve ana düğme. Forma özgü.                                                              |
| Kart                | `.card` / `.card.list`                                       | `--surface`, 1 px `--line`, 12 px köşe, gölgesiz. Liste kartında dikey iç boşluk 0.                                                                                        |
| Özet kartı          | **`.card.hero`**                                             | Etiket 15/600; kahraman sayı 36/700; `.tag`; `.sub` satırı.                                                                                                                |
| Satır               | `.row` (+ `.link`)                                           | ≥ 72 px; satırlar arası 1 px `--line`; `.link` sağ uçta `›` (CSS), basılıyken `--sunken`.                                                                                  |
| Harcama satırı      | `.row.link.entry`                                            | Sol `.grow`: başlık (≤ 2 satır), "tarih · kategori", "kim ödedi tutar". Sağ **`.side`**: işaretli kişisel etki + etiket.                                                   |
| Bakiye satırı       | **`.row.bal`**                                               | Izgara: avatar / ad / tutar; altında etiket; altında ikincil satır.                                                                                                        |
| Borç satırı         | **`.debt`**                                                  | Izgara; üstte `.flow`, sağda tutar; altında sözcük; **`.btn.tonal.block`** "Ödendi" (56 px).                                                                               |
| Kim kime akışı      | **`.flow`**                                                  | `[avatar] Can → [avatar] Fatih`; sarar; ad kesilmez. Ok `aria-hidden`; ekran okuyucu için `.sr-only` "Borçlu: … alacaklı: …".                                              |
| Etiket              | **`.tag`** (+ `.pos` `.neg` `.even` `.on`)                   | 14/600, ≥ 24 px, 6 px köşe, 1,5 px çerçeve (Bölüm 3). `.on` = "✓ Açık".                                                                                                    |
| Avatar              | `.avatar` (+ `.me`)                                          | 40 px (flow'da 32), nötr `--sunken` zemin, 1,5 px `--line-strong`, baş harfler 15/700 `--ink`. `.me`: çerçeve ve harf `--accent`. Kişiye özel renk yok. `aria-hidden`.     |
| Düğme ikincil       | `.btn`                                                       | ≥ 48, 1,5 px `--line-strong`, `--surface`, 17/600.                                                                                                                         |
| Düğme ana           | `.btn.primary`                                               | 56, `--accent` zemin, `--on-accent`, 17/700. Ekranda tek ana düğme (dock/Kaydet/Grup oluştur/…).                                                                           |
| Düğme tonal         | **`.btn.tonal`**                                             | `--accent-soft` zemin, `--accent` metin, çerçevesiz. "Ödendi" için; 56 px, tam genişlik.                                                                                   |
| Düğme silme         | `.btn.danger`                                                | Çerçeveli, `--danger` metin+çerçeve. Dolu kırmızı yok.                                                                                                                     |
| Düğme metin         | **`.btn.text`**                                              | Çerçevesiz, `--accent`, ≥ 48. Vazgeç gibi üçüncül eylemler.                                                                                                                |
| Simge düğmesi       | **`.btn.icon`**                                              | 48×48, `aria-label` zorunlu.                                                                                                                                               |
| Pasif düğme         | `.btn:disabled`                                              | `opacity` yok: `--sunken` zemin, `--line` çerçeve, `--ink-3` metin (≥ 4,5:1).                                                                                              |
| Düğme grubu         | `.actions`                                                   | Dikey, tam genişlik, 12 px aralık. Sıra: ana → ikincil → vazgeç. DOM = görsel.                                                                                             |
| Form alanı          | `label.field`                                                | Etiket 15/600 `--ink` üstte; alan ≥ 52, 17 px, 1,5 px `--line-strong`, 10 px köşe. Alanlar tek sütun.                                                                      |
| Tutar alanı         | `input.amount`                                               | 64 px, 32/700, sayı okları gizli.                                                                                                                                          |
| Kişi seçici         | **`fieldset.pick`**                                          | Radyo grubu; hücre = avatar + ad. Seçili: 2 px `--accent` çerçeve + `--accent-soft` zemin + sağ üst ✓ rozeti + 700 ad (üç kanal). Hücre ≥ 92×88; ad en çok 2 satır, sarar. |
| Segment             | `.seg`                                                       | Kanal `--sunken`; düğme ≥ 48. Seçili: dolu `--accent` + 700. Sarabilir. (✓ öneki genişlik yüzünden alınmadı: dolu zemin gri tonda da ayırt edilir.)                        |
| Onay kutusu / radyo | `input[type=checkbox\|radio]`                                | 28 px özel çizim, 2 px `--line-strong`; işaretli: dolu `--accent` + şekil (✓ / halka). Satırın tamamı `label` hedefi (≥ 56).                                               |
| "Ben" seçici        | **`label.me-pick`**                                          | 48 px çip: radyo + "Ben". İşaretli: `--accent-soft` zemin, `--accent` çerçeve, "✓" öneki, 700.                                                                             |
| Bölüşme satırı      | **`label.member-line`**                                      | Izgara: avatar / ad + hesaplanan tutar altta / denetim. ≥ 72, satırın tamamı hedef. Uzun ad sarar.                                                                         |
| Bilgi kutusu        | `.hint.err`, `#form-err`                                     | Bölüm 3.3.                                                                                                                                                                 |
| İpucu               | `.hint`                                                      | 15 px `--ink-2`.                                                                                                                                                           |
| Toast               | `.toast`                                                     | Ters renk, dock/gezinmenin üstünde, ≥ 56 px, "Geri al" 48 px metin düğmesi, `role="status"`.                                                                               |
| Diyalog             | `dialog`                                                     | ≤ 440 px, 16 px köşe, 20 px iç boşluk. Girişsizse altta (başparmak), girişliyse üstte 12vh. Düğmeler dikey: ana → ikincil → Vazgeç (`.btn.text`).                          |
| Boş durum           | `.empty`                                                     | İsteğe bağlı çizgi simgesi + 19/700 cümle + 15 px yönlendirme. Emoji yok.                                                                                                  |
| Adımlar             | **`ol.steps`**                                               | Numara 20/700 `--accent`, başlık 17/600, açıklama 15 `--ink-2` alt alta.                                                                                                   |
| Satır içi form      | **`.inline-form`**                                           | Alan + düğme yan yana, ikisi de 56.                                                                                                                                        |

Odak: `:focus-visible` 3 px `--accent`, 2 px dışa kayık (satırlarda içe). `outline: none` hiçbir yerde yok.

---

## 5. Mikro-metinler (eski → yeni)

Yetişkin, sakin, suçlamayan, kısa; ünlem ve "Hata!" yok; cümleler en çok 6–7 sözcük.

| Yer                               | Eski                                             | Yeni                                                                                                                                               |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Karşılama başlığı                 | Ev içi ortak harcamaları paylaşın.               | Ortak harcamaları paylaşın                                                                                                                         |
| Karşılama gövdesi                 | …Sunucu yok, hesap yok; veri bu cihazda kalır.   | Kim ne ödedi, kim kime borçlu; tek bakışta. (ikincil) Hesap gerekmez. Veriler yalnızca bu telefonda kalır.                                         |
| Karşılama adımları                | 5 satırlık sağa yaslı liste                      | 1 Evdekileri ekleyin / Ad yazmanız yeter. · 2 Harcamayı girin / Kim ödedi, nasıl bölünsün. · 3 Borçlar sadeleşir / Ödeyince kapanır.               |
| Özet etiketi                      | Bakiyeniz                                        | Bakiyeniz + etiket: Alacaklısınız / Borçlusunuz / Ödeştiniz                                                                                        |
| `ben` yoksa özet                  | Harcama sayısı                                   | Toplam harcama + "N harcama" + bağlantı "Kendinizi Kişiler sayfasında işaretleyin"                                                                 |
| Harcama satırı sağ etiketi        | size ₺X borçlu / borcunuz ₺X / dahil değilsiniz  | `+₺X` + alacak · `−₺X` + borç · `₺X` + payınız · yalnız etiket "dahil değil"                                                                       |
| Ödeme satırı                      | Can → Fatih ödeme                                | Can → Fatih; alt satır "Ödeme · tarih · not"                                                                                                       |
| Boş liste                         | Sağ alttaki düğmeyle ilk harcamayı ekleyin.      | Henüz harcama yok. / İlk harcamayı aşağıdaki düğmeyle ekleyin.                                                                                     |
| Arama boş                         | Eşleşen harcama yok.                             | Eşleşen harcama yok. / Başka bir sözcük deneyin.                                                                                                   |
| Dock                              | ＋ Harcama ekle                                  | Harcama ekle (simge ayrı)                                                                                                                          |
| Bölüm başlıkları                  | KİM KİME ÖDEYECEK? vb.                           | Kim kime ödeyecek? / Kişi bakiyeleri / Kim ödedi? / Nasıl bölünsün?                                                                                |
| Ana sayfa özeti                   | —                                                | Kim kime ne kadar                                                                                                                                  |
| Ben                               | ben                                              | Ben (seçici) · (siz) (listede)                                                                                                                     |
| Kişi ipucu                        | "ben" işaretlediğinizde …                        | Kendinizi "Ben" olarak işaretlerseniz harcamalar size göre alacak ve borç görünür.                                                                 |
| Borç boş durumu                   | Herkes ödeşmiş.                                  | Herkes ödeşti. / Ödenecek borç yok.                                                                                                                |
| Ödeme formu girişi                | Biri diğerine borcunu ödediğinde buraya yazın; … | Ödenen borcu kaydedin; bakiyeler güncellenir.                                                                                                      |
| Ödeme alanları                    | Ödeyen / Alan                                    | Ödemeyi yapan / Ödemeyi alan                                                                                                                       |
| Paylaşım düğmesi                  | 🔗 Paylaşım bağlantısı                           | Bağlantıyı paylaş                                                                                                                                  |
| Paylaşım ipucu                    | …Her değişiklikten sonra yeni bağlantı paylaşın. | Bağlantı grubun tüm kayıtlarını içerir. WhatsApp'tan gönderin; açan kişi kendi telefonuna alır. Değişiklikten sonra yeni bağlantı paylaşın.        |
| Tehlikeli bölge                   | Tehlikeli bölge                                  | Verileri sıfırla (başlık) · düğme "Tüm verileri sil"                                                                                               |
| Grup durum etiketi                | açık                                             | ✓ Açık                                                                                                                                             |
| Yedek düğmeleri                   | Yedek al (.json)                                 | Yedek indir (".json" ipucuna) · Yedekten yükle                                                                                                     |
| Bağlantı al select                | — seçme —                                        | — seçin —                                                                                                                                          |
| Bağlantı hatası                   | ⚠️ Bağlantı açılamadı.                           | Bu bağlantı açılamadı.                                                                                                                             |
| Bağlantı var ipucu                | …"Üzerine yaz" … "Birleştir" …                   | Bu grup telefonunuzda zaten var. Birleştir: iki taraftaki kayıtlar birlikte kalır. Üzerine yaz: telefonunuzdakinin yerine bağlantıdaki hâli koyar. |
| Tutar hatası                      | Geçerli bir tutar girin (örn. 250,50).           | Tutarı rakamla yazın, örn. 250,50.                                                                                                                 |
| Açıklama hatası                   | (mevcut)                                         | Açıklamayı yazar mısınız?                                                                                                                          |
| Ödeme hatası                      | Ödeyen ve alan farklı olmalı.                    | Ödemeyi yapan ve alan farklı kişiler olmalı.                                                                                                       |
| Pay tutmuyor (`hesap.mjs` dizesi) | Payların toplamı (X) tutara (Y) eşit değil       | Opsiyonel, `hesap.mjs` sahibinin kararı: "Paylar toplamı ₺X; tutar ₺Y. Fark ₺Z."                                                                   |
| Silme diyaloğu                    | (mevcut)                                         | Başlık soru ("Fatih silinsin mi?"), düğmeler: Sil / Vazgeç                                                                                         |

Kategori `select` seçeneklerinden emoji kalkar (`${e} ${l}` → `${l}`). `CATEGORIES` verisi değişmez.

---

## 6. Ekranlar

**Genel kurallar.** Üst çubuk 56 px sabit (sticky). Alt gezinme 64 px sabit, yalnızca 4 sekme ekranında (Harcamalar, Bakiyeler, Kişiler, Ayarlar). Formlarda, karşılamada ve bağlantı-al ekranında gezinme yoktur. Sekme ekranları `h1.page-title` ile başlar; ayrıntı ekranlarında `h1` üst çubuktadır. 360 px'te içerik 328, kart içi 296 px. Yatay kaydırma yok: tüm metin sarar, sabit genişlikli tek öğe 112 px'i aşmaz (`html`/`body`'ye `overflow-x:hidden` konmaz; taşma kaynağı düzeltilir).

**Sol el.** Bölüş'te ayrı mod yoktur: ana eylemler tam genişliktedir (dock, `.form-bar`, ana düğmeler, diyalog düğmeleri), sağa yaslı tek öğe kalmadı. Geri düğmesi sol üsttedir; sistem geri hareketi de çalışır. Ana sayfadaki satır sonu `›` yönü aynalanmaz.

**Çizim işaretleri:** `[ ]` düğme/alan, `( )` avatar, `▸` seçili.

### 6.0 Ortak kabuk (`index.html`, `header`, `bottomNav`, `avatar`)

- `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />` (Android Chrome'da klavye açılınca sayfayı küçültür; form çubuğu klavyenin üstünde kalır. iOS yok sayar; çubuk `sticky` olduğu için yine görünür).
- `theme-color` ikiye bölünür: `#F6F5F1` (`media="(prefers-color-scheme: light)"`) ve `#0F1413` (dark). `manifest.webmanifest`: `theme_color` ve `background_color` `#F6F5F1`. `icon.svg` zemini `#0B5D57`.
- `sw.js`: `CACHE = 'bolus-v3'` (artırılmazsa eski stil önbellekten gelir).
- `<style>` bloğu Ek A ile **tümüyle** değiştirilir. Ölü kurallar (`.stats`, `.stat`, `.fab`, `.chips`, `.chip`, `.emoji`, `.badge`, `.big`) gider.
- `header(title, {back, right})`: `back` varsa `<button type="button" id="back" class="back">${icon('back')}<span>Geri</span></button><h1>${title}</h1>`; yoksa `<p class="brand">Bölüş</p>` + (grup varsa) `select#group-switch` + `right`. Sekme, karşılama ve bağlantı-al ekranları kendi `h1.page-title`'ını `main` içine koyar. `select`'in `aria-label="Grup seç"` ve "+ Yeni grup…" seçeneği kalır.
- `bottomNav(current)`: emoji yerine `icon('list')`, `icon('swap')`, `icon('people')`, `icon('sliders')`; etiketler Harcamalar, Bakiyeler, Kişiler, Ayarlar. `<span class="ico">` kalkar; `icon()` çıktısı doğrudan `a` içine konur.
- `avatar(group, id)`: `<span class="avatar${id === group.meId ? ' me' : ''}" aria-hidden="true">${initials}</span>`; satır içi `style` kalkar. `COLORS` ve `memberColor` kullanılmaz olur → silinir (ESLint).
- Her `style="…"` özniteliği kalkar (16 yer); karşılığı Ek A sınıflarındadır.

### 6.1 Karşılama (grup yok) — `renderWelcome`

Amaç: tek eylem, **Grup oluştur**.

```
+------------------------------------+
| Bölüş                              |  56 üst çubuk (seçici yok)
+------------------------------------+
| Ortak harcamaları                  |  h1.page-title 28/700
| paylaşın                           |
| Kim ne ödedi, kim kime borçlu;     |  17 --ink-2
| tek bakışta.                       |
| Hesap gerekmez. Veriler yalnızca   |  15 --ink-2
| bu telefonda kalır.                |
|                                    |
| [        Grup oluştur            ] |  56 ana düğme #new-group
|                                    |
| +--------------------------------+ |
| | Nasıl çalışır?                 | |  h2 17/700
| | 1  Evdekileri ekleyin          | |
| |    Ad yazmanız yeter.          | |
| | 2  Harcamayı girin             | |
| |    Kim ödedi, nasıl bölünsün.  | |
| | 3  Borçlar sadeleşir           | |
| |    Ödeyince kapanır.           | |
| +--------------------------------+ |
| [   Yedekten geri yükle  (text)  ] |  48 .btn.text.block #import-btn
+------------------------------------+
```

- Sıra: `h1.page-title` → `p` (gövde) → `p.sub` → `button.btn.primary.block#new-group` → `.card` (`h2` + `ol.steps`) → `button.btn.text.block#import-btn`.
- Kalkanlar: 🏠 emoji, `.empty` içindeki düğme, 5 satırlık `.kv` tablosu, "Paylaş" adımı (paylaşım Ayarlar'da anlatılır), `.card` içindeki `import-btn` sarmalı.
- Boş/hata: yok. Ekran okuyucu: `h1` "Ortak harcamaları paylaşın"; adımlar `ol`.
- Kabul: 360×800'de ana düğme `y < 400` içinde; yatay kaydırma yok.

### 6.2 Harcamalar — `renderExpenses`, `entryLine`

Amaç: tek birincil eylem **Harcama ekle** (dock). İkincil: kim kime satırından ödeme, Ödeme kaydet, arama.

```
+------------------------------------+
| Bölüş                    [ Ev   v ]|  56
+------------------------------------+
| Harcamalar                         |  h1.page-title
| +--------------------------------+ |
| | Bakiyeniz                      | |  15/600 --ink-2
| | +₺3.325,25                     | |  36/700 --pos
| | [alacaklısınız]                | |  .tag.pos dolu
| | Toplam harcama      ₺11.640,50 | |  .sub
| +--------------------------------+ |
| +--------------------------------+ |
| | Kim kime ne kadar              | |  h2
| | (C) Can → (S) Siz    +₺2.850,10| |  .debt.link (satır = bağlantı)
| | Siz alacaklısınız            › | |
| |--------------------------------| |
| | (A) Ayşe → (C) Can      ₺45,00 | |  taraf siz değilsiniz: nötr
| | Ayşe borçlu                  › | |
| | +1 borç daha                   | |  .sub (2'den fazlaysa)
| |================================| |
| | Ödeme kaydet | Tüm bakiyeler > | |  .sum-foot 56
| +--------------------------------+ |
| [ Ara: açıklama, kişi, kategori ]  |  52 (> 3 kayıt)
| Kasım 2026                         |  15/600 --ink-2
| +--------------------------------+ |
| | Kira                 +₺2.500,00| |  başlık / benim etkim 17/700
| | 2 Kas 2026 · Kira       [alacak]| |  .sub / .tag.pos
| | 2 kişi ödedi ₺10.000,00        | |  .sub
| |--------------------------------| |
| | Fatura                −₺250,10 | |
| | 2 Kas 2026 · Faturalar   [borç]| |  .tag.neg çerçeveli
| | Fatih ödedi ₺1.250,50          | |
| |--------------------------------| |
| | Can → Fatih            ₺430,15 | |  ödeme kaydı, nötr
| | Ödeme · 2 Kas 2026             | |
| +--------------------------------+ |
+------------------------------------+
| [   +  Harcama ekle              ] |  .dock, 56 ana
+------------------------------------+
|  Harc.   Bakiye    Kişiler  Ayarlar|  64 nav
+------------------------------------+
```

Sıra: üst çubuk → `h1.page-title` "Harcamalar" → (kişi yoksa "Önce evdekileri ekleyin" kartı; bu durumda hero, kim kime kartı ve dock **yoktur**) → `.card.hero` → **kim kime kartı** (üyeler ≥ 2) → arama (yalnızca > 3 kayıt, mevcut koşul) → `#list` → `.dock` → `nav.bottom`.

**Özet kartı (`.card.hero`):**

- `g.meId` varsa: `.k` "Bakiyeniz" → `.v` `moneyHtml(mine,{sign:true})` (`.pos` / `.neg` / sınıfsız) → `.tag` (`mine>0`: `.tag.pos` "Alacaklısınız"; `mine<0`: `.tag.neg` "Borçlusunuz"; `0`: `.tag.even` "Ödeştiniz") → `.kv`'siz tek `p.sub` "Toplam harcama ₺…" (sol etiket, sağ tutar `display:flex; justify-content:space-between`).
- `g.meId` yoksa: `.k` "Toplam harcama" → `.v` toplam (nötr) → `p.sub` "N harcama" → `a.btn.text` "Kendinizi Kişiler sayfasında işaretleyin" (`href="#/kisiler"`).

**Kim kime kartı** (aynı ifade `renderBalances`'ta olduğu gibi: `state.settings.simplify ? simplifyDebts(net) : pairwiseDebts(g.entries)`; yeni hesap yok):

- Satırlar: önce `ben` taraf olan borçlar, sonra diğerleri; en çok **2** satır. Fazlası için `.sub` "+N borç daha" (dokunulmaz; "Tüm bakiyeler" bağlantısı vardır).
- Satır `<a class="debt link" href="#/odeme/yeni?from=ID&to=ID&amount=CENTS">`: `.flow` + `.amt` + `.sub` + `›`. **Ödendi akışı 2 dokunuş**: satıra dokun → ön dolu ödeme formunda Kaydet.
- Taraflardan biri `ben` ise ad yerine **"Siz"**, tutar işaretli ve renkli (`ben` alacaklı: `+₺` `.pos`; borçlu: `−₺` `.neg`), `.sub` "Siz alacaklısınız" / "Siz borçlusunuz". Aksi halde tutar nötr ve işaretsiz, `.sub` "Can borçlu".
- Borç yoksa tek satır: `check-circle` simgesi + "Herkes ödeşti." (17/600).
- Alt şerit `.sum-foot`: `a` "Ödeme kaydet" (`href="#/odeme/yeni"`) | `a` "Tüm bakiyeler" + `›` (`href="#/bakiye"`). Her biri ≥ 56 px, ortada 1 px çizgi, `--accent` 700.
- `aria-label` (satır): "Borçlu Can, alacaklı Siz, 2.850,10 lira. Ödeme kaydet".

**Harcama satırı (`entryLine`, `.row.link.entry[data-id][data-kind]`):**

- Sol `.grow`: `.title` ad (≤ 2 satır) → `.sub` "tarih · kategori adı" (`formatDate` + `category(e.category)[2]`) → `.sub` "Fatih ödedi ₺1.250,50" (çok ödeyende "2 kişi ödedi ₺10.000,00"; `ben` yoksa da toplam yazılır).
- Sağ `.side` (en çok %45): `ben` varsa — alacak (`diff>0`): `.amt.pos` `+₺X` + `.tag.pos` "alacak"; borç (`diff<0`): `.amt.neg` `−₺X` + `.tag.neg` "borç"; yalnız pay (`diff=0`, payı var): `.amt` `₺X` + `.tag.even` "payınız"; dahil değil: yalnız `.tag.even` "dahil değil". `ben` yoksa: `.amt` harcama toplamı (nötr), etiket yok.
- Ödeme kaydı: `.title` "Can → Fatih" (ok `aria-hidden`; yanında `.sr-only` " ödeme: " ön ek: "Ödeme: Can → Fatih"), `.sub` "Ödeme · tarih · not", sağ `.amt` nötr; etiket yok.
- Emoji ve `.emoji` kutusu kalkar. `bindRows` aynen.

**Ay başlığı** `.month`: cümle düzeni ("Kasım 2026"), 15/600 `--ink-2`, kartın 8 px üstünde; `#list` dikey akış (`gap:8px`). Ay kartı `.card.list`.

**Boş durumlar:** kayıt yok → `.empty`: "Henüz harcama yok." + "İlk harcamayı aşağıdaki düğmeyle ekleyin."; arama sonucu yok → "Eşleşen harcama yok." + "Başka bir sözcük deneyin."; kişi yok → kart "Önce evdekileri ekleyin." + `a.btn.primary.block` "Kişi ekle".

**Kaldırılanlar:** `.stats`, yüzen `#fab` (yerine dock içinde aynı id), listenin altındaki `.actions` "Ödeme kaydet".

**Ekran okuyucu:** `h1` "Harcamalar"; özet `section aria-label="Özet"`; satır `aria-label` yok (içerik sırası: başlık, tarih·kategori, kim ödedi, tutar, etiket); dock düğmesi "Harcama ekle"; arama `aria-label="Harcama ara"`.

**Kabul:** 360 px'te sağ sütun ≤ 120 px; ad ≤ 2 satır; dock hiçbir satırı kalıcı örtmez (`#app` alt boşluğu dock + gezinme + 32); toast dock'un üstünde; ilk ekranda hero + kim kime kartı görünür, liste kaydırınca.

### 6.3 Harcama formu — `renderExpenseForm`

Amaç: tek birincil eylem **Ekle / Kaydet** (yapışık çubukta).

```
+------------------------------------+
| [< Geri]   Harcama ekle            |  56
+------------------------------------+
| +--------------------------------+ |
| | Tutar (TRY)                    | |
| | [ 1234,56                     ]| |  64, 32/700, açılışta odak (yeni)
| | Açıklama                       | |
| | [ Örn. Haftalık market        ]| |  52
| | Tarih                          | |
| | [ 02.11.2026                  ]| |
| | Kategori                       | |
| | [ Market                    v ]| |
| +--------------------------------+ |
| +--------------------------------+ |
| | Kim ödedi?                     | |
| | (F▸)     (A)      (C)          | |  fieldset.pick, 3 sütun
| | Fatih    Ayşe     Can          | |
| | [x] Birden fazla kişi ödedi    | |  satır 56, tamamı hedef
| +--------------------------------+ |
| +--------------------------------+ |
| | Nasıl bölünsün?                | |
| | [Eşit][Tutar][Yüzde][Hisse]    | |  .seg 48
| | (F) Fatih              [x]     | |
| |     ₺100,00                    | |  hesaplanan, adın altında
| | (A) Ayşe               [x]     | |
| |     ₺100,00                    | |
| | 3 kişi · kişi başı ₺100,00     | |  .hint
| +--------------------------------+ |
| +--------------------------------+ |
| | Not (isteğe bağlı)             | |
| | [                             ]| |  96
| +--------------------------------+ |
| (düzenlemede) [ Harcamayı sil ]    |  .btn.danger.block 48, formun sonunda
+------------------------------------+
| (i) Tutarı rakamla yazın, örn. 250,50.|  #form-err (varsa), çubuğun içinde
| [            Ekle                ] |  .form-bar sticky, 56 ana
+------------------------------------+
```

- Sıra: kart 1 (**Tutar**, Açıklama, Tarih, Kategori; hepsi tek sütun, `.grid-2` kullanılmaz) → kart 2 "Kim ödedi?" → kart 3 "Nasıl bölünsün?" → kart 4 Not → (düzenlemede) `#del` → `.form-bar` (`#form-err` + `button[type=submit].btn.primary.block`). Tutar ilk çünkü ana veri odur.
- Tutar `inputmode="decimal"`, `autocomplete="off"`; sayı okları gizli. Yeni harcamada açılışta odak tutardadır; düzenlemede odak yok.
- **Kim ödedi?** `#single-payer` içinde `<fieldset class="pick"><legend class="field-label">Kim ödedi?</legend><div class="pick-grid">` + her üye için `<label class="pick-item"><input type="radio" name="payer" value="ID" ${seçili?'checked':''}><span class="pick-box">${avatar}<span class="pick-name">Ad</span></span></label>`. `legend` görünür etiket olduğundan kart `h2`'si bu kartta kullanılmaz (çift başlık olmasın). `checked` zorunlu (varsayılan: `f.payer`). `select[name=payer]` kalkar.
- "Birden fazla kişi ödedi": `label.row.check` (≥ 56) içinde 28 px onay kutusu (`name="multiPayer"`). İşaretlenince `#single-payer` gizlenir, `#multi-payer` açılır (mevcut mantık): her üye `label.member-line` (avatar, ad, 112 px tutar girişi `data-payer`), altta `.hint#payer-hint`.
- **Bölüşme satırı** (`renderSplitLines`): `div.member-line` yerine `label.member-line`; DOM sırası: avatar, `.name`, `.calc[data-calc]`, denetim. Eşit türünde denetim 28 px onay kutusu (`data-split-in`); tutar/yüzde/hisse türünde 112 px, 48 px yüksek giriş. `aria-label`'lar ("Fatih dahil", "Fatih payı") aynen. 360 px'te ad sütunu ≈ 120 px; "Abdurrahman" sığar, daha uzunu sarar, **"…" ile kesilmez**.
- Segment: `role="group" aria-label="Bölüşme türü"`, düğmelerde `aria-pressed` (mevcut).
- Çubuk `.form-bar`: `#form-err` düğmenin hemen üstünde, `role="alert"`. Boşken gizli.
- Hata metinleri kehribar kutuda (Bölüm 5). Hatalı alana `input.err` (2 px `--neg` çerçeve; kırmızı yok).
- Canlı ipuçları `#split-hint`, `#payer-hint`: normal `.hint`; tutmuyorsa `.hint.err` (yönlendirir: "Kalan ₺X dağıtılmadı.").
- Silme: mevcut `confirmDialog` + "Geri al" toast akışı aynen.
- Boş/hata: üye yoksa mevcut yönlendirme (`go('kisiler')`).
- Kabul: 360 px'te yatay kaydırma yok; her satır ≥ 72; Ekle düğmesi kaydırmadan görünür; klavye açıkken (Android) tutar + çubuk aynı anda görünür.

### 6.4 Bakiyeler — `renderBalances`

Amaç: tek birincil eylem **Ödendi** (borcu kapat). Ekran "kim kime" ile başlar; kişi bakiyeleri altta.

```
+------------------------------------+
| Bölüş                    [ Ev   v ]|
+------------------------------------+
| Bakiyeler                          |  h1.page-title
| +--------------------------------+ |
| | Kim kime ödeyecek?             | |
| | [ Sadeleştirilmiş | Kişi kişiye ]| |  .seg 48
| | (C) Can → (F) Fatih  ₺2.895,10 | |  .flow + .amt (nötr)
| | Can borçlu                     | |  .sub
| | [  Ödendi  (tonal, tam)       ]| |  56
| |--------------------------------| |
| | (A) Ayşe → (S) Siz    −₺430,15 | |  siz tarafsınız: renkli+işaret
| | Siz borçlusunuz                | |
| | [  Ödendi                     ]| |
| | En az ödemeyle herkesin borcu  | |
| | kapanır.                       | |  .hint
| +--------------------------------+ |
| +--------------------------------+ |
| | Kişi bakiyeleri                | |
| | (F) Fatih (siz)    +₺3.325,25  | |  20/700 pos
| |     [alacaklı]                 | |  dolu
| |     Ödedi ₺9.050,50 · Payı     | |
| |     ₺5.725,25                  | |
| |--------------------------------| |
| | (A) Ayşe             −₺430,15  | |  nötr! (siz değilsiniz)
| |     [borçlu]                   | |  çerçeveli
| |--------------------------------| |
| | (Z) Zeynep           Ödeşti    | |
| |     [ödeşti]                   | |  ince çizgili
| +--------------------------------+ |
+------------------------------------+
|  nav (Bakiyeler seçili)            |
+------------------------------------+
```

- Bölüm sırası: önce "Kim kime ödeyecek?" (eylem), sonra "Kişi bakiyeleri" (bilgi). `style="margin-bottom:10px"` kalkar.
- **Borç satırı `.debt`** (ızgara `minmax(0,1fr) auto`, alanlar `"who amt" "sub sub" "act act"`): `who` = `.flow` (Bölüm 4); `amt` = `.amt`; `sub`; `act` = `<button type="button" class="btn tonal block" data-settle="from|to|amount" aria-label="Ödendi olarak kaydet: Can, Fatih, ₺2.895,10">Ödendi</button>`. Renk/işaret kuralı Bölüm 3.2 ile aynı ("Siz" taraf ise renkli, işaretli, `.sub` "Siz alacaklısınız/borçlusunuz"; değilse nötr, "Can borçlu").
- **Kişi satırı `.row.bal`** (ızgara `40px minmax(0,1fr) auto`, alanlar `av name amt / av tag tag / av sub sub`): avatar (üstte hizalı) · ad (`ben` için `<span class="muted">(siz)</span>`) · tutar 20/700 · `.tag` · `.sub` ("Ödedi ₺X" ve "Payı ₺Y" iki parça, sarabilir).
  - **Renk yalnızca `ben` satırında**: tutar `.pos`/`.neg` + işaret + etiket. Diğer kişilerde satıra `.other` eklenir: tutar `--ink`, işaretli (`+`/`−`); etiket renksiz ama **biçimi korur** (alacaklı: `--sunken` dolu, borçlu: `--ink-2` çerçeveli, ödeşti: ince çizgili). Sıfır bakiye: tutar yerine "Ödeşti" 17/600 `--ink-2`; `.tag.even`.
- Segment `.seg`: `role="group" aria-label="Görünüm"`, `aria-pressed`; "Sadeleştirilmiş" 360 px'te sarmadan sığar; sarsa da bozulmaz.
- Boş (borç yok): `.empty` + 40 px `check-circle` (`--accent`) + "Herkes ödeşti." + "Ödenecek borç yok." Kişi yok: "Henüz kişi yok." + `a.btn.text` "Kişi ekle".
- Ekran okuyucu: `h1` "Bakiyeler"; kişi satırı okunuş sırası: ad, tutar, etiket, ödedi/payı.
- Kabul: tutarlar sağda hizalı; alacaklı/borçlu/ödeşti renge bakmadan ayırt edilir (gri tonlu görüntüde sınanır).

### 6.5 Kişiler — `renderMembers`

Amaç: tek birincil eylem **Ekle** (kişi ekle).

```
+------------------------------------+
| Bölüş                    [ Ev   v ]|
+------------------------------------+
| Kişiler                            |  h1.page-title
| +--------------------------------+ |
| | Evdekiler                      | |
| | (F) Fatih (siz)                | |  .person-head
| |     Ödedi ₺9.050,50 · Payı ... | |
| |     [✓ Ben] [kalem] [çöp]      | |  .row-actions 48, aralık 8
| |--------------------------------| |
| | (A) Ayşe                       | |
| |     Henüz harcaması yok        | |
| |     [  Ben] [kalem] [çöp]      | |
| |--------------------------------| |
| | [ İsim (örn. Ayşe)   ][ Ekle ] | |  .inline-form 56
| | Kendinizi "Ben" olarak ...     | |  .hint
| +--------------------------------+ |
| +--------------------------------+ |
| | Grup                           | |
| | [ Grup adını değiştir        ] | |  .actions dikey, 48
| | [ Grubu sil                  ] | |  .btn.danger
| +--------------------------------+ |
+------------------------------------+
```

- Kişi öğesi `.person` (artık `.row` değil): `.person-head` (avatar + `.grow`[ad, alt metin]) → `.row-actions` (soldan 52 px girinti = avatar hizası): `label.me-pick` (radyo `name="me"` `aria-label="Ayşe benim"` + `<span>Ben</span>`), `button.btn.icon[data-rename]` (`aria-label="Ayşe adını değiştir"`, kalem), `button.btn.icon[data-del]` (`aria-label="Ayşe sil"`, çöp, **nötr renk**).
- Satır içi çöp kırmızı değildir; kırmızı yalnızca onay diyaloğundaki "Sil"de. Düzenle/Sil menüde **gizlenmez** (yaşlı kullanıcıda keşfedilebilirlik); "tek menü" fikri birikim listesinde (Bölüm 8).
- 360 px'te sıra: çip (88) + 8 + 48 + 8 + 48 = 200 px; satıra sığar.
- "Ekle" 56 px, ≥ 96 genişlik; alan `flex:1`, 56 px. Odak kendiliğinden alana gelmez (mevcut). Grup kartı: iki düğme alt alta, aynı yükseklik.
- Boş: "Henüz kimse yok." + "Aşağıdaki alana ilk ismi yazın."
- Mevcut yinelenen ad toast'ı kalır.

### 6.6 Ödeme kaydet — `renderPaymentForm`

Amaç: tek birincil eylem **Kaydet**. "Ödendi"/özet satırından gelince tutar ve iki kişi önceden dolu → yalnızca Kaydet.

```
+------------------------------------+
| [< Geri]   Ödeme kaydet            |
+------------------------------------+
| Ödenen borcu kaydedin;             |  15 --ink-2
| bakiyeler güncellenir.             |
| +--------------------------------+ |
| | Tutar (TRY)                    | |
| | [ 2895,10                     ]| |  64, 32/700
| | Ödemeyi yapan                  | |
| | (C▸)     (A)      (F)          | |  fieldset.pick
| |            v                   | |  .pick-arrow (süs, aria-hidden)
| | Ödemeyi alan                   | |
| | (C)      (A)      (F▸)         | |  fieldset.pick
| | Tarih                          | |
| | [ 02.11.2026                  ]| |
| | Not (isteğe bağlı)             | |
| | [ Havale, nakit...            ]| |
| +--------------------------------+ |
| (düzenlemede) [ Ödemeyi sil ]      |  .btn.danger.block
+------------------------------------+
| [            Kaydet              ] |  .form-bar sticky
+------------------------------------+
```

- Sıra: giriş `p.sub` → kart (**Tutar** → `fieldset.pick` "Ödemeyi yapan" (`name="from"`) → `.pick-arrow` → `fieldset.pick` "Ödemeyi alan" (`name="to"`) → Tarih → Not) → (düzenlemede) `#del` → `.form-bar`.
- Yan yana iki `select` kalkar. Radyo grupları 6.3'teki gibi (`checked` zorunlu; ödeyen `from`, alan `to`, yoksa ilk diğer üye).
- `.pick-arrow`: `icon('down')`, ortalı, `--ink-2`, 24 px; yön "yapan → alan" sırasını şekille verir. Canlı önizleme **eklenmez** (JS gerektirir); eklenirse yalnızca `.flow` bileşeni kullanılır.
- Hata (kehribar): "Ödemeyi yapan ve alan farklı kişiler olmalı." / "Tutarı rakamla yazın, örn. 250,50."
- Düzenlemede kaydedince Bakiyeler'e gider (mevcut).
- Kabul: 360 px'te yatay kaydırma yok; Kaydet sticky çubukta.

### 6.7 Ayarlar — `renderSettings`

Amaç: tek birincil eylem **Bağlantıyı paylaş**.

```
+------------------------------------+
| Bölüş                    [ Ev   v ]|
+------------------------------------+
| Ayarlar                            |  h1.page-title
| +--------------------------------+ |
| | Evdekilerle paylaş             | |
| | [ Bağlantıyı paylaş  (ana)    ]| |  56  #share
| | Bağlantı grubun tüm kayıtlarını| |
| | içerir. WhatsApp'tan gönderin; | |
| | açan kişi kendi telefonuna alır| |
| | Değişiklikten sonra yeni       | |
| | bağlantı paylaşın.             | |
| +--------------------------------+ |
| +--------------------------------+ |
| | Ev grubu                       | |
| | Para birimi                    | |
| | [ TRY                       v ]| |  #currency
| | [ CSV indir                   ]| |  48  #csv
| +--------------------------------+ |
| +--------------------------------+ |
| | Gruplar                        | |
| | Ev                  [✓ Açık]   | |  .row.link[data-g] 72
| | 3 kişi · 5 kayıt             › | |
| | [ + Yeni grup                 ]| |  48
| +--------------------------------+ |
| +--------------------------------+ |
| | Yedek                          | |
| | [ Yedek indir                 ]| |  #export
| | [ Yedekten yükle              ]| |  #import
| | Tüm gruplar tek .json dosyasında.| |
| +--------------------------------+ |
| +--------------------------------+ |
| | Verileri sıfırla               | |
| | [ Tüm verileri sil  (danger)  ]| |  #wipe
| +--------------------------------+ |
|  Bölüş · reklamsız, veri telefonda.|
|  Kaynak kod                        |
+------------------------------------+
|  nav (Ayarlar seçili)              |
+------------------------------------+
```

- Sıra: "Evdekilerle paylaş" (ana düğme `#share`, ipucu) → "{Grup} grubu" (`#currency`, `#csv`) → Gruplar → Yedek → Verileri sıfırla → alt bilgi. Tüm `id`'ler aynı. Grup yoksa yalnızca Yedek ve Gruplar kartları görünür (mevcut davranış).
- Düğmeler `.actions` dikey yığında, tam genişlik; 🔗 emojisi kalkar; paylaşım ana düğmesinde simge yok.
- Gruplar satırı: `.row.link[data-g]` (sağda `›`); etkin grup `.tag.on` "Açık" (✓ CSS ile gelir, metne yazılmaz). "+ Yeni grup" `.btn.block` (satır içi `margin-top` kalkar).
- "Tehlikeli bölge" → "Verileri sıfırla". `#wipe` çerçeveli `--danger`; onay diyaloğu mevcut.
- Alt bilgi 15 px `--ink-2`, ortalı; "Kaynak kod" bağlantısı `--accent`, altı çizili, `padding:12px 4px` (hedef ≥ 48).
- Ekran okuyucu: `h1` "Ayarlar"; kart başlıkları `h2`.

### 6.8 Bağlantı al — `renderImportLink`

Amaç: tek birincil eylem. Yeni grupta **Telefonuma al**; grup zaten varsa **Birleştir** (veri kaybettirmez).

```
+------------------------------------+
| Bölüş                              |
+------------------------------------+
| Paylaşılan grup                    |  h1.page-title
| +--------------------------------+ |
| | Ev                             | |  20/700 (🏠 kalkar)
| | Fatih, Ayşe, Can               | |  15 --ink-2
| | Kayıt                        5 | |  .kv
| | Toplam              ₺11.640,50 | |  .kv
| | Bu grupta siz kimsiniz?        | |
| | [ — seçin —                 v ]| |  #me
| | (varsa) Bu grup telefonunuzda  | |
| | zaten var. Birleştir: …        | |  .hint
| | [ Birleştir      (ana 56)     ]| |  #merge
| | [ Üzerine yaz    (ikincil)    ]| |  #replace
| | [ Vazgeç         (.btn.text)  ]| |  a.btn.text href="#/"
| +--------------------------------+ |
+------------------------------------+
```

- Grup telefonda **yoksa**: `button#replace.btn.primary.block` "Telefonuma al" → `a.btn.text.block` "Vazgeç".
- Grup telefonda **varsa**: `button#merge.btn.primary.block` "Birleştir" → `button#replace.btn.block` "Üzerine yaz" (ikincil; yerel değişiklikleri siler) → `a.btn.text.block` "Vazgeç". DOM sırası bu sıradadır; Vazgeç her koşulda en altta, ana düğme her koşulda ilk düğmedir.
- Okunuyor: `.empty` "Bağlantı okunuyor…" (simge yok). Hata: simgesiz kehribar `.hint.err` "Bu bağlantı açılamadı." + `p.sub` (`e.message`) + `a.btn.block` "Ana sayfa". ⚠️ ve kırmızı yok.
- `h1` her durumda `h1.page-title` "Paylaşılan grup". Header `p.brand` (seçici yok).

### 6.9 Diyaloglar ve toast

- **`confirmDialog` DOM sırası** (`data-v` korunur, tıklama mantığı değişmez):
  - `danger` yok: `ok` (`.btn.primary`) → `extra` (`.btn`) → `cancel` (`.btn.text`).
  - `danger`, `extra` yok (silme onayı): `ok` (`.btn.danger`, çerçeveli kırmızı) → `cancel` (`.btn.text`, **`autofocus`**; ilk odak Vazgeç).
  - `danger` + `extra` (yedek yükleme: "Üzerine yaz" / "Birleştir"): `extra` ("Birleştir", `.btn.primary`, güvenli seçenek) → `ok` ("Üzerine yaz", `.btn.danger`) → `cancel` (`.btn.text`, `autofocus`).
  - `.actions` dikey, 12 px aralık; başlık 20/700; metin `--ink-2`.
- **`promptDialog`:** alan 56 px (girişli diyalog üstte 12vh); düğmeler: Kaydet (`.btn.primary`) → Vazgeç (`.btn.text`). Odak/`select()` mevcut.
- **Toast:** ters renk; dock'un üstünde (dock yoksa gezinmenin üstünde, form ekranında çubuğun üstünde); tek satır tercih; "Geri al" 48 px metin düğmesi. Metinler kısa ve yönlendirici.
- Diyalog başlıkları soru biçimindedir ("Fatih silinsin mi?"); suçlama yok.

---

## 7. Erişilebilirlik

- **Kontrast:** Bölüm 2.1. Metin ≥ 4,5:1 (ana ve ikincil ≥ 7:1), kenarlık ve simge ≥ 3:1. Yer tutucu `--ink-3` (≥ 5,8:1 yüzeyde).
- **Renk tek başına anlam taşımaz:** para yönü (Bölüm 3), seçili sekme (çubuk + kalın), seçili segment (dolu zemin + kalın), onay kutusu (✓ şekli), "Ben" (✓ + çip), kişi seçici (çerçeve + ✓ rozeti + kalın ad), "Açık" (✓ + etiket), hata (simge + çizgi + metin).
- **Dokunma:** Bölüm 2.3. Satır ve kutular `label`/bağlantı olarak tüm alanı hedef yapar.
- **Odak:** 3 px `--accent`; radyo/onay kutusu gizlendiğinde (`.pick`, `.me-pick`) odak halkası görünür kardeşe taşınır.
- **Yapı:** her ekranda tek `h1`; kart başlıkları `h2`; `header`, `main`, `nav aria-label="Ana menü"`. Seçici gruplar `fieldset > legend`.
- **Simgeler** `aria-hidden="true" focusable="false"`; simge düğmelerinde `aria-label`. Ok `→` `aria-hidden`; yanında `.sr-only` sözcük.
- **Tutarlar:** işaret + sözcük aynı satırda; eksi U+2212.
- **Canlı bölgeler:** `role="status"` (toast), `role="alert"` (`#form-err`), `aria-live="polite"` (`#split-hint`, `#payer-hint`) mevcut kalır.
- **Yazı ölçeği:** `rem`; %200'de kırılmadan sarar (satır başlığı ≤ 2 satır; düğmeler `min-height`; segment ve çubuk sarar).
- **Hareket:** yalnızca 120 ms renk geçişi; `prefers-reduced-motion` ile 0.
- **Yüksek karşıtlık:** `prefers-contrast: more` (Bölüm 2.1). `color-scheme: light dark` yerel denetimleri (tarih seçici, `select`) uyarlar.
- **Süre baskısı yok:** toast yalnızca geri alma kolaylığıdır; kritik bilgi tek başına toast'ta verilmez.

---

## 8. Uygulama notları ve "Bitti" listesi

### 8.1 Sıra

1. `index.html`: Ek A'yı `<style>` yerine yapıştır; meta etiketleri (6.0); `manifest`, `icon.svg`, `sw.js` sürümü.
2. `app.mjs` başı: `ICONS` (Ek B), `icon()`, `moneyHtml()`; `avatar()`; `header()`; `bottomNav()`.
3. `confirmDialog` / `promptDialog` (6.9).
4. `renderWelcome` → `renderExpenses`/`entryLine` → `renderBalances` → `renderMembers` → `renderExpenseForm` (+ `renderSplitLines`) → `renderPaymentForm` → `renderSettings` → `renderImportLink`.
5. Mikro-metinler (Bölüm 5). E2E/test metne dayanıyorsa güncellenir; `id` ve `data-*` seçicileri aynıdır.
6. `README.md`'de "Dosyalar" satırına `TASARIM.md` eklenir (isteğe bağlı).
7. `SHOTS`: 11 ekranı 390×844 ve 360×800'de, açık ve koyu temada yeniden üret; gri tonlu bir kopyada alacak/borç/ödeşti ayrımını kontrol et.

### 8.2 Riskler ve geri dönüş

- `:has()` yalnızca şu yerlerde kullanılır: `#app` alt boşluğu, `.me-pick` zemini, diyalog konumu, toast konumu. Eski tarayıcıda düşerse: alt boşluk fazla ama güvenli, "Ben" çipi yalnızca ✓ ile ayrışır (zemin değişmez), diyalog ortada kalır, toast gezinmenin/dock'un üstünde (en yüksek konum) kalır. İşlev bozulmaz.
- Radyo gruplarında `checked` unutulursa `form.payer.value` boş döner → harcama kaydedilemez. Her şablonda ilk/önceki seçim `checked`.
- `.flow` içindeki adlar `overflow-wrap:anywhere` ile sarar; kesme işareti yok.
- `line-clamp` için `-webkit-` önekleri Ek A'da.

### 8.3 Birikim listesine (ROADMAP; bu sürümde yok)

- Sayfa değişince odağı yeni `h1`'e taşıma (`tabindex="-1"`).
- Geri alma toast'ı için süre 8000–10000 ms (`toast()` varsayılanı 6000).
- Harcama satırında "Düzenle/Sil tek menü"; yaşlı kullanıcı için keşfedilebilirlik ayrıca denenecek.
- Ödeme formunda canlı `.flow` önizlemesi; uygulama içi sayısal tuş takımı; "Tekrarla" düğmesi.
- `hesap.mjs` hata iletilerinin sadeleştirilmesi (sahibi başka).
- Elle açık/koyu tema anahtarı; Windows zorlanmış renk modu denemesi.

### 8.4 "Bitti" kontrol listesi (her ekran)

- [ ] Tüm dokunma alanları ≥ 48 px; ana eylemler (dock, Kaydet/Ekle, Grup oluştur, Telefonuma al/Birleştir, Bağlantıyı paylaş, Ödendi) 56 px; liste satırları ≥ 72; komşu hedefler arası ≥ 8 px
- [ ] 360×800 ve 390×844'te, ayrıca %200 yazı ölçeğinde yatay kaydırma yok; hiçbir ad "…" ile gizlenmiyor (başlıklar en çok 2 satır, bölüşme/seçici adları sarar)
- [ ] Metin kontrastı ≥ 4,5:1 (ana ve ikincil ≥ 7:1), kenarlık/simge ≥ 3:1 — açık ve koyu temada
- [ ] Alacak/borç/ödeşti gri tonlu görüntüde ayırt ediliyor (işaret + sözcük + biçim); renk yalnızca `ben` için; eksi işareti U+2212
- [ ] Kırmızı yalnızca Sil düğmeleri ve silme onayında; hata mesajlarında kırmızı yok; hata kutuları kehribar ve yönlendirici
- [ ] Emoji yok (kategori `select` ve `CATEGORIES` verisi dahil görsel yüzeyde); en küçük yazı 14 px; tümü büyük harf yok
- [ ] Ana düğme güvenli seçenek; DOM sırası = görsel sıra; silme diyaloğunda ilk odak Vazgeç; Vazgeç en altta metin düğmesi
- [ ] Dock ve toast hiçbir içeriği kalıcı örtmüyor; toast dock/gezinme/form çubuğunun üstünde; klavye açıkken (Android) Ekle çubuğu görünür
- [ ] Ödendi akışı 2 dokunuş (satır/Ödendi → Kaydet); form tutar-ilk
- [ ] Her ekranda tek `h1`; simge düğmelerinde `aria-label`; radyo gruplarında `fieldset/legend` ve başlangıçta `checked`
- [ ] "Hareketi azalt" açıkken hiçbir geçiş yok; `prefers-contrast: more` çalışıyor
- [ ] `node --test bolus/hesap.test.mjs` değişmeden geçiyor; localStorage verisi aynı; uçak modunda açılıyor (`sw.js` sürümü artırıldı)
- [ ] Ekran görüntüleri (açık + koyu, 390×844 ve 360×800): karşılama, kişiler, harcama formu, harcamalar, bakiyeler, kişi kişiye, ödeme, ayarlar, bağlantı al, `ben` görünümü, uzun isim

---

## Ek A — Tam stil sayfası (`index.html` içindeki `<style>` yerine)

```css
:root {
  color-scheme: light dark;
  --bg: #f6f5f1;
  --surface: #ffffff;
  --sunken: #efede7;
  --ink: #14201e;
  --ink-2: #475451;
  --ink-3: #5c6865;
  --line: #e3e0d9;
  --line-strong: #838d8a;
  --accent: #0b5d57;
  --on-accent: #ffffff;
  --accent-soft: #e1eeec;
  --pos: #0b5d57;
  --pos-soft: #e1eeec;
  --neg: #9a3d0e;
  --neg-soft: #f8eadf;
  --danger: #a61e1e;
  --inverse: #1f2a27;
  --on-inverse: #ffffff;
  --inverse-accent: #8ee0d6;
  --scrim: rgba(20, 32, 30, 0.55);
  --shadow-float: 0 8px 24px rgba(20, 32, 30, 0.18);
  --tap: 48px;
  --tap-main: 56px;
  --nav-h: 64px;
  --dock-h: 73px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1413;
    --surface: #171d1c;
    --sunken: #1e2625;
    --ink: #e8eeec;
    --ink-2: #b5c1bd;
    --ink-3: #9aa7a3;
    --line: #2a3331;
    --line-strong: #78857f;
    --accent: #4cc2b6;
    --on-accent: #04211e;
    --accent-soft: #15332f;
    --pos: #4cc2b6;
    --pos-soft: #15332f;
    --neg: #f2a56f;
    --neg-soft: #2c2018;
    --danger: #ff8f85;
    --inverse: #e8eeec;
    --on-inverse: #14201e;
    --inverse-accent: #0b5d57;
    --scrim: rgba(0, 0, 0, 0.65);
    --shadow-float: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
}
@media (prefers-contrast: more) {
  :root {
    --line: var(--line-strong);
    --ink-2: var(--ink);
  }
}

/* ---- Temel ---- */
* {
  box-sizing: border-box;
}
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
html,
body {
  margin: 0;
  padding: 0;
}
h1,
h2,
h3,
p {
  margin: 0;
}
body {
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  font-size: 1.0625rem;
  line-height: 1.45;
  background: var(--bg);
  color: var(--ink);
  font-variant-numeric: lining-nums;
  -webkit-tap-highlight-color: transparent;
}
a {
  color: var(--accent);
}
#app {
  max-width: 640px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  padding-bottom: calc(var(--nav-h) + var(--dock-h) + 32px + env(safe-area-inset-bottom));
}
#app:not(:has(.dock)) {
  padding-bottom: calc(var(--nav-h) + 32px + env(safe-area-inset-bottom));
}
#app:not(:has(nav.bottom)) {
  padding-bottom: calc(32px + env(safe-area-inset-bottom));
}
#app:has(.form-bar):not(:has(nav.bottom)) {
  padding-bottom: 0;
}
main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 16px 0;
}
main:has(.form-bar) {
  padding-bottom: 0;
}
form#f {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.hidden {
  display: none !important;
}
.muted {
  color: var(--ink-2);
}
.ico {
  width: 24px;
  height: 24px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- Üst çubuk ---- */
header.top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 16px 0;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
header.top h1,
header.top .brand {
  flex: 1;
  min-width: 0;
  font-size: 1.25rem;
  line-height: 1.3;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
header.top .brand {
  font-size: 1.125rem;
  letter-spacing: 0.01em;
}
header.top select {
  flex: none;
  width: auto;
  max-width: 55%;
  padding: 0 12px;
  font-weight: 600;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--tap);
  min-width: 72px;
  margin-left: -8px;
  padding: 0 12px 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.page-title {
  font-size: 1.75rem;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 4px 0 0;
}

/* ---- Yüzeyler ---- */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
}
.card.list {
  padding-top: 0;
  padding-bottom: 0;
}
.card h2 {
  font-size: 1.0625rem;
  line-height: 1.3;
  font-weight: 700;
  margin-bottom: 8px;
}
#list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.month {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink-2);
  margin: 16px 4px 0;
}
#list .month:first-child {
  margin-top: 4px;
}
.hero {
  padding: 20px 16px 16px;
}
.hero .k {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink-2);
}
.hero .v {
  font-size: 2.25rem;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 4px 0 12px;
  font-variant-numeric: tabular-nums lining-nums;
  overflow-wrap: anywhere;
}
.hero .tag {
  margin-bottom: 12px;
}
.hero .sub {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.hero .btn.text {
  margin-top: 4px;
}
.kv {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  min-height: var(--tap);
  padding: 12px 0;
  font-size: 1.0625rem;
}
.kv + .kv {
  border-top: 1px solid var(--line);
}
.sum-foot {
  display: flex;
  margin: 8px -16px -16px;
  border-top: 1px solid var(--line);
}
.sum-foot > a {
  flex: 1;
  min-height: var(--tap-main);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  color: var(--accent);
  font-weight: 700;
  text-align: center;
  text-decoration: none;
}
.sum-foot > a + a {
  border-left: 1px solid var(--line);
}
.sum-foot > a:active {
  background: var(--sunken);
}

/* ---- Satırlar ---- */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  padding: 12px 0;
}
.row + .row,
.person + .person,
.debt + .debt {
  border-top: 1px solid var(--line);
}
.row .grow {
  flex: 1;
  min-width: 0;
}
.row .title,
.person .title {
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sub {
  color: var(--ink-2);
  font-size: 0.9375rem;
  line-height: 1.4;
}
.row.link {
  cursor: pointer;
  transition: background-color 0.12s;
}
.row.link::after {
  content: '›';
  content: '›' / '';
  flex: none;
  color: var(--ink-3);
  font-size: 1.5rem;
  line-height: 1;
}
.row.link.entry::after {
  content: none;
}
.row.link:active {
  background: var(--sunken);
  border-radius: 8px;
}
.row.link:focus-visible {
  outline-offset: -3px;
  border-radius: 8px;
}
.side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: none;
  text-align: right;
  max-width: 45%;
}
.amt {
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}
.pos {
  color: var(--pos);
}
.neg {
  color: var(--neg);
}

/* Kim kime akışı */
.flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}
.flow-who {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  font-weight: 600;
  line-height: 1.3;
}
.flow-who .avatar {
  width: 32px;
  height: 32px;
  font-size: 0.875rem;
}
.flow-name {
  overflow-wrap: anywhere;
}
.flow-arrow {
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--ink-2);
}
.flow-arrow .ico {
  width: 100%;
  height: 100%;
}

/* Borç satırı */
.debt {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'who amt' 'sub sub' 'act act';
  column-gap: 12px;
  row-gap: 4px;
  align-items: center;
  min-height: 72px;
  padding: 16px 0;
}
.debt .flow {
  grid-area: who;
}
.debt .amt {
  grid-area: amt;
}
.debt .sub {
  grid-area: sub;
}
.debt .btn {
  grid-area: act;
  margin-top: 8px;
}
a.debt {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
a.debt.link {
  grid-template-columns: minmax(0, 1fr) auto 16px;
  grid-template-areas: 'who amt go' 'sub sub go';
  padding: 12px 0;
}
a.debt.link::after {
  grid-area: go;
  content: '›';
  content: '›' / '';
  color: var(--ink-3);
  font-size: 1.5rem;
  line-height: 1;
  justify-self: end;
}
a.debt.link:active {
  background: var(--sunken);
  border-radius: 8px;
}
a.debt.link:focus-visible {
  outline-offset: -3px;
  border-radius: 8px;
}

/* Bakiye satırı */
.row.bal {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  grid-template-areas: 'av name amt' 'av tag tag' 'av sub sub';
  column-gap: 12px;
  row-gap: 4px;
  align-items: start;
}
.row.bal .avatar {
  grid-area: av;
}
.row.bal .title {
  grid-area: name;
}
.row.bal .amt {
  grid-area: amt;
  font-size: 1.25rem;
  line-height: 1.3;
}
.row.bal .tag {
  grid-area: tag;
  justify-self: start;
}
.row.bal .sub {
  grid-area: sub;
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
}
.row.bal.other .amt {
  color: var(--ink);
}
.row.bal.other .tag.pos {
  background: var(--sunken);
  color: var(--ink);
}
.row.bal.other .tag.neg {
  border-color: var(--ink-2);
  color: var(--ink);
}

/* Kişi öğesi */
.person {
  padding: 12px 0;
}
.person-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--tap);
}
.person-head .grow {
  flex: 1;
  min-width: 0;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0 52px;
  flex-wrap: wrap;
}

/* ---- Etiket, avatar ---- */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 1px 8px;
  border: 1.5px solid transparent;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  color: var(--ink-2);
}
.tag.pos {
  background: var(--pos-soft);
  color: var(--pos);
}
.tag.neg {
  background: transparent;
  border-color: var(--neg);
  color: var(--neg);
}
.tag.even {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink-2);
}
.tag.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.tag.on::before {
  content: '✓';
}
.avatar {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--sunken);
  border: 1.5px solid var(--line-strong);
  color: var(--ink);
  font-size: 0.9375rem;
  font-weight: 700;
}
.avatar.me {
  border-color: var(--accent);
  color: var(--accent);
}

/* ---- Düğmeler ---- */
button.btn,
a.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--tap);
  padding: 0 20px;
  border-radius: 10px;
  border: 1.5px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.12s;
}
button.btn:active,
a.btn:active {
  background: var(--sunken);
}
button.btn.primary {
  min-height: var(--tap-main);
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
}
button.btn.primary:active {
  background: var(--accent);
  filter: brightness(0.92);
}
button.btn.tonal {
  min-height: var(--tap-main);
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
  font-weight: 700;
}
button.btn.tonal:active {
  filter: brightness(0.94);
  background: var(--accent-soft);
}
button.btn.danger {
  color: var(--danger);
  border-color: var(--danger);
}
button.btn.text,
a.btn.text {
  border-color: transparent;
  background: transparent;
  color: var(--accent);
}
button.btn.small {
  min-height: var(--tap);
  padding: 0 16px;
  font-size: 1rem;
}
button.btn.icon {
  width: var(--tap);
  padding: 0;
}
button.btn.block,
a.btn.block {
  width: 100%;
}
button.btn:disabled {
  background: var(--sunken);
  border-color: var(--line);
  color: var(--ink-3);
  cursor: default;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.actions > * {
  width: 100%;
}
.inline-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.inline-form input {
  flex: 1;
  min-width: 0;
  min-height: var(--tap-main);
}
.inline-form .btn {
  min-height: var(--tap-main);
  min-width: 96px;
}

/* ---- Form ---- */
label.field {
  display: block;
  margin-bottom: 16px;
}
label.field:last-child {
  margin-bottom: 0;
}
label.field > span,
.field-label {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 6px;
}
input[type='text'],
input[type='date'],
input[type='number'],
input[type='search'],
select,
textarea {
  width: 100%;
  min-height: 52px;
  padding: 12px 14px;
  border: 1.5px solid var(--line-strong);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
::placeholder {
  color: var(--ink-3);
  opacity: 1;
}
input:focus,
select:focus,
textarea:focus {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}
input.amount {
  min-height: 64px;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums lining-nums;
}
input.err {
  border-color: var(--neg);
  border-width: 2px;
}
input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
textarea {
  min-height: 96px;
  resize: vertical;
}
.hint {
  font-size: 0.9375rem;
  line-height: 1.4;
  color: var(--ink-2);
  margin-top: 8px;
}
.hint.err {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px 12px 12px;
  border-radius: 10px;
  border-left: 4px solid var(--neg);
  background: var(--neg-soft);
  color: var(--ink);
  font-weight: 500;
}
.hint.err::before {
  content: 'i';
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border: 2px solid var(--neg);
  border-radius: 50%;
  color: var(--neg);
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.hint.err:empty {
  display: none;
}
.form-bar {
  position: sticky;
  bottom: 0;
  z-index: 4;
  margin: 0 -16px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.form-bar .hint.err {
  margin: 0 0 12px;
}

/* Kişi seçici (radyo grubu) */
.pick {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.pick legend {
  padding: 0;
  margin-bottom: 8px;
}
.pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px;
}
.pick-item {
  position: relative;
  display: block;
  cursor: pointer;
}
.pick-item input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}
.pick-box {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 88px;
  padding: 8px 4px;
  border: 2px solid transparent;
  border-radius: 12px;
  text-align: center;
}
.pick-name {
  max-width: 100%;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.pick-item input:checked + .pick-box {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.pick-item input:checked + .pick-box .pick-name {
  font-weight: 800;
}
.pick-item input:checked + .pick-box::after {
  content: '✓';
  position: absolute;
  top: 4px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
}
.pick-item input:focus-visible + .pick-box {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.pick-arrow {
  display: flex;
  justify-content: center;
  margin: 4px 0;
  color: var(--ink-2);
}

/* Onay kutusu, radyo */
input[type='checkbox'],
input[type='radio'] {
  -webkit-appearance: none;
  appearance: none;
  flex: none;
  margin: 0;
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-content: center;
  border: 2px solid var(--line-strong);
  background: var(--surface);
  cursor: pointer;
}
input[type='checkbox'] {
  border-radius: 7px;
}
input[type='radio'] {
  border-radius: 50%;
}
input[type='checkbox']:checked {
  background: var(--accent);
  border-color: var(--accent);
}
input[type='checkbox']:checked::after {
  content: '';
  width: 7px;
  height: 13px;
  margin-top: -2px;
  border: solid var(--on-accent);
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}
input[type='radio']:checked {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 5px var(--surface);
}
label.row.check {
  min-height: 56px;
  cursor: pointer;
}
.me-pick {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: var(--tap);
  padding: 0 16px 0 10px;
  border: 1.5px solid var(--line-strong);
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}
.me-pick input:checked + span {
  font-weight: 700;
}
.me-pick input:checked + span::before {
  content: '✓ ';
}
.me-pick:has(input:checked) {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.me-pick:has(input:focus-visible) {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

/* Segment */
.seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 12px;
  background: var(--sunken);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.seg button {
  flex: 1;
  min-width: 0;
  min-height: var(--tap);
  padding: 4px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}
.seg button[aria-pressed='true'] {
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
}

/* Bölüşme / çoklu ödeyen satırı */
.member-line {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  grid-template-areas: 'av name ctl' 'av calc ctl';
  column-gap: 12px;
  align-items: center;
  min-height: 72px;
  padding: 8px 0;
  cursor: pointer;
}
.member-line + .member-line {
  border-top: 1px solid var(--line);
}
.member-line .avatar {
  grid-area: av;
}
.member-line .name {
  grid-area: name;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.member-line .calc {
  grid-area: calc;
  color: var(--ink-2);
  font-size: 0.9375rem;
  font-variant-numeric: tabular-nums lining-nums;
  text-align: left;
}
.member-line > input {
  grid-area: ctl;
}
.member-line input[type='text'],
.member-line input[type='number'] {
  width: 112px;
  min-height: var(--tap);
  padding: 8px 10px;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ---- Gezinme, dock ---- */
nav.bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  background: var(--surface);
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
}
nav.bottom .inner {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
}
nav.bottom a {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: var(--nav-h);
  padding: 6px 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--ink-2);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
}
nav.bottom a[aria-current='page'] {
  color: var(--accent);
  font-weight: 700;
}
nav.bottom a[aria-current='page'] .ico {
  stroke-width: 2.4;
}
nav.bottom a[aria-current='page']::before {
  content: '';
  position: absolute;
  top: 0;
  left: 25%;
  right: 25%;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--accent);
}
.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
  z-index: 6;
  display: flex;
  justify-content: center;
  padding: 8px 16px;
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.dock .btn {
  flex: 1;
  max-width: 608px;
}

/* ---- Toast, diyalog ---- */
.toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  bottom: calc(var(--nav-h) + var(--dock-h) + 12px + env(safe-area-inset-bottom));
  width: calc(100% - 32px);
  max-width: 480px;
  min-height: 56px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-radius: 12px;
  background: var(--inverse);
  color: var(--on-inverse);
  font-size: 1rem;
  line-height: 1.35;
  box-shadow: var(--shadow-float);
}
body:not(:has(.dock)) .toast {
  bottom: calc(var(--nav-h) + 12px + env(safe-area-inset-bottom));
}
body:has(.form-bar) .toast {
  bottom: calc(96px + env(safe-area-inset-bottom));
}
.toast button {
  flex: none;
  min-height: var(--tap);
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--inverse-accent);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
dialog {
  width: calc(100% - 32px);
  max-width: 440px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-float);
}
dialog:not(:has(input)) {
  margin: auto auto calc(16px + env(safe-area-inset-bottom));
}
dialog:has(input) {
  margin: 12vh auto auto;
}
dialog::backdrop {
  background: var(--scrim);
}
dialog .body {
  padding: 20px;
}
dialog h3 {
  font-size: 1.25rem;
  line-height: 1.3;
  font-weight: 700;
  margin-bottom: 8px;
}
dialog p {
  color: var(--ink-2);
  margin-bottom: 16px;
}
dialog label.field {
  margin-bottom: 16px;
}
dialog .btn {
  min-height: var(--tap-main);
}
dialog .btn.text {
  min-height: var(--tap);
}

/* ---- Boş durum, adımlar ---- */
.empty {
  text-align: center;
  color: var(--ink-2);
  padding: 24px 8px;
}
.empty strong,
.empty .lead {
  display: block;
  color: var(--ink);
  font-size: 1.1875rem;
  font-weight: 700;
  margin-bottom: 8px;
}
.empty p + p {
  margin-top: 4px;
  font-size: 0.9375rem;
}
.empty .ico {
  width: 40px;
  height: 40px;
  stroke-width: 1.5;
  color: var(--accent);
  margin-bottom: 8px;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: s;
}
.steps li {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 12px;
  padding: 12px 0;
  counter-increment: s;
}
.steps li + li {
  border-top: 1px solid var(--line);
}
.steps li::before {
  content: counter(s);
  color: var(--accent);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.steps b {
  display: block;
  font-weight: 600;
}
.steps span {
  color: var(--ink-2);
  font-size: 0.9375rem;
}
code {
  background: var(--sunken);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 0.9375rem;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
}
```

Notlar:

- `.dock` içindeki düğme `button.btn.primary` olduğundan 56 px'tir; `.debt .btn` ve `.dock .btn` `min-width`/`max-width` kuralları bu sayfada yeterlidir.
- Şablonda `.card.hero` içindeki kim kime kartı için ayrı `.card` kullanılır; `.sum-foot` bu kartın son çocuğudur (negatif kenar boşlukları kartın iç boşluğunu aşar, çizgi uçtan uca gider).
- Dokunulmayan eski sınıflar: `.row`, `.link`, `.hint`, `.seg`, `.toast`, `.card`, `.actions`, `.sr-only`, `.hidden`.

## Ek B — Çizgi simgeleri (24×24, `stroke=currentColor`, `fill=none`; stil `.ico` sınıfından gelir)

`ICONS` sabitinde yalnızca iç `path`/`circle` verilir; `icon(name)` bunu `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">…</svg>` içine koyar.

| Ad             | Kullanım                    | İçerik                                                                                                                                                           |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`         | Gezinme: Harcamalar         | `<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>`                                                                                              |
| `swap`         | Gezinme: Bakiyeler          | `<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>`                                                                                                               |
| `people`       | Gezinme: Kişiler            | `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.6 0 4.5 1.8 4.5 4.8"/>` |
| `sliders`      | Gezinme: Ayarlar            | `<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>`                                                         |
| `back`         | Geri düğmesi                | `<path d="M15 5l-7 7 7 7"/>`                                                                                                                                     |
| `plus`         | Dock: Harcama ekle          | `<path d="M12 5v14M5 12h14"/>`                                                                                                                                   |
| `pencil`       | Kişi: adı değiştir          | `<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>`                                                                                        |
| `trash`        | Kişi: sil (nötr renk)       | `<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>`                                                                                                |
| `check-circle` | Boş durum / "Herkes ödeşti" | `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>`                                                                                                     |
| `arrow-right`  | `.flow` oku (`.flow-arrow`) | `<path d="M5 12h14M13 6l6 6-6 6"/>`                                                                                                                              |
| `down`         | Ödeme formu `.pick-arrow`   | `<path d="M12 5v14M6 13l6 6 6-6"/>`                                                                                                                              |

`.flow-arrow` ve `.pick-arrow` için `icon()` çıktısı `<span class="flow-arrow">` içine sarılır (sınıf `.ico`'nun boyutunu ezer). Her simge yanında görünür metin taşır (gezinme etiketi, "Geri", "Harcama ekle") ya da `aria-label` ile verilir (kalem, çöp). Simge tek başına anlam taşımaz.
