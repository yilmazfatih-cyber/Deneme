# TV+ UX Şartnamesi v2 — Netflix deneyimi, TV+ markası

Bu belge görünüm ve etkileşimin **tek kaynağıdır**; `referans/DESIGN_SPEC.md`'nin yerini alır (o belge yalnız ikon
yolları ve Türkçe ton için başvurudur).

**İlke:** yerleşim ve etkileşim kalıpları Netflix'in web, mobil ve TV uygulamalarından alınır; marka TV+'tır.
Netflix'in adı, logosu, kırmızısı ve yazı tipi **kullanılmaz**. Netflix'in kırmızı kullandığı her yerde (ilerleme çubuğu,
rozet, etkin gösterge, TV odak vurgusu) TV+ sarısı kullanılır; "Oynat" düğmesi Netflix'teki gibi **beyazdır**.
TV+'a özgü olanlar (Canlı TV, Rehber, kumanda, TV'ye yansıtma) aynı görsel dille çizilir.

Üç ekran aynı sunucuyu ve aynı veri katmanını kullanır; yalnız kabuk ve bileşenler değişir:
`mobile` (< 900 px) · `desktop` (≥ 900 px) · `tv` (TV tarayıcısı ya da `?cihaz=tv`). Karar: `web/src/lib/formFactor.ts`.

## 1. Tokenlar (`web/src/ui/tokens.css`)

| Token | Değer | Kullanım |
| --- | --- | --- |
| `--bg` | `#141414` | sayfa zemini |
| `--surface-1` | `#181818` | modal, önizleme kartı, açılır menü, TV paneli |
| `--surface-2` | `#232323` | kart zemini, girdi |
| `--surface-3` | `#2f2f2f` | "Benzerleri" kartı, basılı yüzey |
| `--line` | `rgba(255,255,255,.12)` | ayırıcı |
| `--text-1` `#fff` · `--text-2` `#e5e5e5` · `--text-3` `#b3b3b3` · `--text-4` `#808080` | | başlık · gövde · ikincil · üçüncül (daha koyusu yok) |
| `--accent` | `#F7D849` (`--on-accent` `#14140F`) | TV+ sarısı: ilerleme, rozet, etkin gösterge, TV odağı |
| `--play-bg` `#fff` · `--play-fg` `#000` | | "Oynat" |
| `--btn-2` | `rgba(109,109,110,.7)` (üzerine gelince `.4`) | ikincil düğme ("Daha Fazla Bilgi") |
| `--live` | `#FF5247` | yalnız CANLI etiketi ve "şimdi" çizgisi |
| `--positive` | `#46d369` | "Yeni" metni |

Eski değişken adları (`--s1 --s2 --s3 --t1 --t2 --t3 --yellow --on-yellow --ok --font`) takma ad olarak tanımlı kalır
(oynatıcı ve Kaputun altı paneli kullanıyor).

Köşe: kart 4 px (mobil 6 px) · modal 8 px · düğme 4 px · mobil kategori hapı 999 px · avatar 4 px (TV 8 px).
Yazı: Manrope. En küçük 11 px (yalnız rozet). Emoji yok. Saat 24'lük. Hareket: kart büyümesi 300 ms
`cubic-bezier(.5,0,.1,1)`, modal 250 ms; `prefers-reduced-motion` açıkken anında.

## 2. Masaüstü web (≥ 900 px)

**Üst menü.** Sabit, 68 px, yatay boşluk %4. En üstte saydam (`linear-gradient(#000b 10%, transparent)`), sayfa
kayınca `--bg` dolgu. Sol: TV+ logosu (yükseklik 26) · bağlantılar 14 px: **Ana Sayfa · Canlı TV · Diziler · Filmler ·
Yeni ve Popüler · Listem** (etkin: beyaz ve kalın; diğerleri `--text-2`). Sağ: arama simgesi (tıklayınca sola doğru
açılan kutu: 1 px beyaz çerçeve, siyah zemin, yer tutucu "Başlıklar, kişiler, türler"; yazmaya başlanınca sayfa
içeriği arama sonuçlarıyla değişir, kutu boşalınca önceki sayfaya dönülür) · "TV'de izle" simgesi (başka cihaz
çevrimiçiyse) · bildirim zili · 32 px avatar + ok (menü: profiller, Profilleri Yönet, Cihazlar, Kaputun altı, Çıkış).

**Vitrin (billboard).** Tam genişlik, yükseklik `56.25vw` (en çok 85 vh). Görsel/sessiz tanıtım videosu arkada; altta
`--bg`'ye doğru karartma. Bilgi katmanı sol %4, alt ~%30: başlık logosu (en çok 36 vw) · üç satırı geçmeyen özet
(1.2 vw, en az 14 px) · düğmeler: **▶ Oynat** (beyaz) · **ⓘ Daha Fazla Bilgi** (`--btn-2`). Sağda: ses aç/kapa
(yuvarlak, çerçeveli) + yaş işareti şeridi (sol kenarı 3 px çizgi). Top 10'daysa "Bugün Dizilerde 3 Numara" satırı.

**Satır (slider).** Başlık 1.4 vw (16–24 px) kalın, `--text-2`; üzerine gelince sağında "Tümünü Gör ›". Kartlar
**16:9**, aralarında 0.4 vw; sayfada kart sayısı: ≥1400 → 6 · ≥1100 → 5 · ≥800 → 4 · daha dar → 3. Kenarlarda %4
genişliğinde tutamaçlar (üzerine gelince ok), tıklayınca **sayfa sayfa** kayar; sağ üstte sayfa göstergesi (12×2 px
çizgiler). Sonraki sayfanın ilk kartı kenardan görünür. Klavye: ←/→ kart, Tab satır.

**Başlık kartı.** 16:9 görsel (`STORY_ART`), sol üstte en çok bir rozet ("Yeni", "Yeni Bölüm", "Son 3 Gün",
kilit); "İzlemeye Devam Et"te altta 3 px ilerleme çubuğu (`--accent`) ve "S1:B3 · 23 dk kaldı". Top 10 satırında
dikey afiş + solunda dış hat rakam.

**Önizleme kartı.** Kartın üzerinde 500 ms beklenince kart yerinde ~1.5× büyür (kenardaki kartlar içe doğru),
`--surface-1`, gölgeli: üstte 16:9 görsel → 600 ms sonra sessiz tanıtım; altta yuvarlak düğmeler (▶ beyaz dolu ·
＋/✓ Listem · beğen · sağda ⌄ "Daha fazla bilgi") · bilgi satırı ("Yeni" yeşil · yaş işareti çerçeveli · "2 Sezon"
ya da "1 sa 28 dk" · HD) · noktayla ayrılmış üç etiket. Satırın tüm kartları tek `MiniModalQuery` ile ön yüklenir.

**Detay penceresi.** Göz atma sayfasının **üstünde** açılır (adres `?jbv=<videoId>`; ✕, Esc ya da dışarı tıklama
kapatır; arkadaki sayfa kaymaz). Genişlik en çok 850 px, `--surface-1`, köşe 8 px. Üst: 16:9 görsel/tanıtım, altta
karartma; sol altta başlık logosu, ilerleme, düğmeler (▶ Oynat/Devam Et beyaz · ＋ · beğen · TV'de izle); sağ altta
ses. Gövde iki sütun (2fr 1fr): sol — "Yeni" · yıl · sezon/süre · HD · 5.1 · altyazı, yaş işareti + nedenleri, Top 10
satırı, özet; sağ — "Oyuncular: …", "Türler: …", "Bu içerik: …" (etiketler). Sonra: **Bölümler** (sezon seçici; satır:
büyük sıra numarası · 130×73 görsel · başlık + süre · özet; sıradaki bölüm vurgulu) · **Benzerleri** (3 sütun kart:
16:9 görsel, sağ üstte süre, yaş işareti + yıl, ＋ düğmesi, özet) · **Fragmanlar ve Daha Fazlası** · **Hakkında**
(yönetmen, oyuncular, türler, yaş işareti, lisans/kaynak satırı). Paket gerektiren başlıkta birincil düğme
"Paketi İncele"dir; pencerenin içinde sakin bir açıklama açar (hata sayfası yok).

**Arama.** Yazdıkça anında sonuç (250 ms gecikme). Düzen yukarıdan aşağıya:
1. **Tahminler** — "Şunu mu arıyorsun:" ardından model tahmini tamamlamalar (bağlantılar, ` | ` ile ayrılmış).
2. **"Şunlarla ilgili daha fazla keşfedin:"** — kişi, tür, koleksiyon bağlantıları.
3. **Canlı TV** — eşleşen kanal ve yayınlar (tek satır; varsa).
4. **Sonuç ızgarası** — 16:9 kartlar, 6 sütun (satır kuralındaki kırılımlar), önizleme kartı açılır. Tahminle gelen
   kartların altında gerekçe satırı: "Sana özel" · "Sintel ile ilgili" · "Çok arananlar".
5. Doğrudan eşleşme yoksa: "“xyz” için eşleşme bulunamadı." + **"Bunlar ilgini çekebilir"** (modelin tahminleri).
Kutu boşken: "Sana özel öneriler" ızgarası + son aramalar. Yetenek bildirimi denetimi Kaputun altı panelindedir.

**Sayfalar.** Ana Sayfa (vitrin + satırlar) · Diziler / Filmler (başlık + "Türler ▾" açılır listesi + vitrin + o türün
satırları) · Yeni ve Popüler (Yeni Gelenler, Top 10 Diziler, Top 10 Filmler, Son Şans, Herkes Bunları İzliyor) ·
Listem (ızgara) · Canlı TV · Rehber. **Profil kapısı** "Kim izliyor?": 10 vw (84–200 px) kare avatarlar, üzerine
gelince beyaz çerçeve; altta "Profilleri Yönet" (ekle, ad, avatar, çocuk profili, 4 haneli kilit). Kilitli profilde PIN
sorulur.

**Canlı TV.** Üstte vitrin: seçili kanalın canlı görüntüsü (sessiz), kanal logosu, CANLI etiketi, program adı,
"20:00–23:15 · 42 dk kaldı", ilerleme; düğmeler **▶ Canlı İzle** (beyaz) · **Baştan Başlat** · **TV'de İzle**. Altında
satırlar: Kanallarım, Tüm Kanallar (16:9 kart: program görseli, sol üstte kanal logosu, altta ilerleme çubuğu ve
program adı), Bu Akşam, Kaçırdıkların. Rehber: yapışkan kanal sütunu + zaman ızgarası, kırmızı "şimdi" çizgisi.
Canlı her öğe ilerleme + bitiş/kalan süre taşır.

**Oynatıcı.** Sol üst: geri oku. Alt: ilerleme çubuğu (`--accent`), sağında kalan süre; düğme sırası — sol: oynat/
duraklat · 10 sn geri · 10 sn ileri · ses; orta: başlık ("Dizi S1:B3 Bölüm adı"); sağ: sonraki bölüm · bölümler ·
ses ve altyazı · hız · kaynak · TV'de izle · tam ekran. YouTube kaynaklarında denetimler çerçevenin dışındadır.

## 3. Mobil (< 900 px)

**Üst çubuk** (56 px, vitrinin üstünde saydam): sol "‹Profil adı› için" ya da logo; sağ: "TV'de izle" · arama.
Altında kategori hapları: **Diziler · Filmler · Canlı TV · Kategoriler ▾** (seçilince başında ✕).
**Vitrin kartı:** kenarlardan 16 px içeride, ~2:3, köşe 12 px, 1 px açık çerçeve; altta başlık logosu, noktalı etiket
satırı, kart içinde iki düğme: **▶ Oynat** (beyaz) · **＋ Listem** (`--btn-2`).
**Satırlar:** başlık 17 px kalın; **dikey afişler** (2:3, 110 px, köşe 6 px); İzlemeye Devam Et'te ilerleme çubuğu ve
altında ⓘ / ⋮; Top 10 rakamlı.
**Alt sekmeler** (56 px + güvenli alan): **Ana Sayfa · Canlı TV · Yeni ve Popüler · TV+'ım**. Etkin: beyaz.
**Detay** tam sayfa (`/baslik/:id`): üstte 16:9 tanıtım (✕ ve TV'de izle simgeleri), başlık, bilgi satırı,
**▶ Oynat** (beyaz, tam genişlik), **TV'de İzle** (`--btn-2`, TV çevrimiçiyse), özet, oyuncular, simge sırası
(Listem · Değerlendir · Paylaş), sekmeler **Bölümler · Benzerleri · Fragmanlar**.
**Arama:** üstte girdi (36 px, `--surface-2`); yazmadan önce "Sana Özel Öneriler" dikey liste (16:9 küçük görsel +
ad + ▶); yazarken üstte tahmin tamamlamaları (dokununca yazıya dönüşür), sonra 3 sütun afiş ızgarası.
**TV+'ım:** avatar + ad + profil değiştir; Bildirimler; **TV'ye Bağlan / Kumanda**; Listem; İzlemeye Devam Et;
Beğendiklerin; Cihazlar; Çıkış.
**"Şu an TV'de" çubuğu:** eşleşmiş bir TV oynatırken alt sekmelerin üstünde: küçük görsel, ad, ⏯, dokununca kumanda.

## 4. TV (10-foot)

Tuval 1920×1080; `html { font-size: calc(100vw / 120) }` (1 rem = 16 px), tüm ölçüler rem. Kenar güvenli alanı 6 rem.
Yalnız yön tuşları, OK ve Geri ile kullanılır (fare gerekmez). Odak her an tek bir öğededir: odaktaki kart 1.08×
büyür ve 0.25 rem beyaz çerçeve alır; odaktaki düğme beyaz zemin + siyah yazı; odak kaybolmaz, ekran değişince
mantıklı öğeye geçer. Tuşlar: ←↑→↓, Enter/OK, Geri (Escape, Backspace, 461, 10009), oynat/duraklat medya tuşları,
rakamlar.

**Yan menü:** solda 6.5 rem (simgeler); ← ile açılınca 22 rem + etiketler, içerik kararır. Öğeler: profil ·
Ara · Ana Sayfa · Canlı TV · Diziler · Filmler · Yeni ve Popüler · Listem · Ayarlar.
**Ana Sayfa:** üst %52 odaktaki başlığın bilgisi — tür satırı ("DİZİ"), başlık (4.5 rem), bilgi satırı, 3 satır özet;
arka plan görseli sağda (%68 genişlik), sola ve aşağı karartmalı; 1.2 sn sonra sessiz tanıtım. Alt: odaktaki satırın
başlığı (1.6 rem) ve 16:9 kartlar (19.5 rem, aralık 0.75 rem); odaktaki satır hep aynı yükseklikte durur, ↓/↑ satır
değiştirir, sonraki satır alttan görünür. İlk karttayken ← yan menüyü açar.
**Detay:** tam ekran; sol sütun: başlık, bilgi, özet, oyuncular; dikey eylem listesi (4 rem yüksek): ▶ Oynat /
Devam Et · Baştan Başlat · Bölümler ve Daha Fazlası · Fragman · ＋ Listem · Beğen. Bölümler ekranı: solda sezonlar,
sağda bölüm listesi (görsel, "1. Ad", süre, özet, ilerleme).
**Arama:** solda ekran klavyesi (6 sütun: a–z, 0–9, **boşluk · sil · temizle**), altında **tahmin tamamlamaları**
(seçince yazıya dönüşür); sağda sonuç ızgarası (3 sütun 16:9) — yazmadan önce "Sana Özel Öneriler". Telefon
eşleşmişse ipucu: "Telefonunla yazabilirsin".
**Canlı TV:** solda kanal listesi (numara, logo, ad, şimdiki program + ilerleme), sağda odaktaki kanalın canlı
görüntüsü ve şimdi/sonraki. OK → tam ekran. Tam ekranda ↑/↓ kanal değiştirir, OK kanal listesi + bilgi bandı,
rakamlar numarayla geçiş (2 sn), Geri çıkar.
**Oynatıcı:** herhangi bir tuşta görünen, 4 sn sonra gizlenen alt şerit: ilerleme, süre; OK oynat/duraklat, ←/→
10 sn, ↑ ses ve altyazı paneli, ↓ bölümler / kanal listesi, Geri çıkış.
**Giriş:** sol yarı "Telefonunla giriş yap" + üç adım + QR (beyaz kart, 22 rem); sağ yarı adres ve büyük kod
(`KLMN-4821`, 5 rem, `--accent`), geri sayım; altta "Bu TV'de demo hesabıyla giriş yap". Onay gelince profil seçimi.

## 5. Cihazlar arası

- **QR ile giriş:** TV kod ister → QR + kısa kod gösterir → telefon `/bagla?kod=…` açar (giriş yapılmamışsa önce
  giriş) → "Bu cihazda oturum açılsın mı? TV · Chrome" **Onayla / Reddet** → TV kendiliğinden açılır. Kod 10 dk
  geçerli, tek kullanımlık. Yeni cihaz girişi bildirim olarak düşer.
- **Kumanda (`/kumanda`):** üstte bağlı cihaz ve değiştirme; "Şu an TV'de" kartı (görsel, ad, ilerleme, ⏯, ±10 sn);
  yön pedi (ortada OK), Geri, Ana Sayfa, Ara (telefon klavyesi → TV'deki arama kutusu), Rehber; ses −/+ ve sessiz;
  kanal −/+; rakam tuşları; "Bu telefonda devam et". Her basışta kısa titreşim.
- **TV'de izle (yansıtma):** simge mobil üst çubukta, masaüstü menüde, oynatıcıda, detayda ve canlı kanal
  kartlarında. Cihaz seçici (TV'ler önce, çevrimiçi durumu) → içerik TV'de kaldığı yerden açılır, telefon kumandaya
  döner. Canlı kanalda tek dokunuş. "Bu cihazda devam et" ile geri alınır.
- **Cihaz vitrini (`/vitrin`):** TV, web ve mobil yan yana, her biri ayrı sanal cihaz olarak canlı çalışır; QR girişi,
  kumanda ve yansıtma aynı sayfada denenir.

## 6. Sözlük

Ana Sayfa · Diziler · Filmler · Yeni ve Popüler · Listem · Canlı TV · Rehber · TV+'ım · Oynat · Devam Et · Baştan
Başlat · Daha Fazla Bilgi · Listeme Ekle / Listemde · Beğen · Bölümler · Sezon 1 · Benzerleri · Fragmanlar ve Daha
Fazlası · Hakkında · İzlemeye Devam Et · ‹Ad› için En İyi Seçimler · Türkiye'de Bugünün Top 10 Dizi Listesi ·
Yeni Gelenler · Son Şans · Kim izliyor? · Profilleri Yönet · Profil Ekle · TV'de İzle · Bu Cihazda Devam Et ·
Kumanda · TV'ye Bağlan · Canlı İzle · Hatırlat · Başlıklar, kişiler, türler. Ton: kısa, sen dili, ünlem yok.

## 7. Değişmez kurallar (denetlenir)

1. Hiçbir ekranda Netflix adı, logosu ya da kırmızısı yoktur; marka TV+'tır.
2. Masaüstü ve TV'de kartlar 16:9, mobilde dikey afiştir (Top 10 her yerde dikey + rakam).
3. Oynat her yerden en çok 2 adım; "İzlemeye Devam Et" ve canlı kanalda 1 adım.
4. Kart başına en çok bir rozet. Canlı öğe ilerleme ve bitiş/kalan süre taşır.
5. Detay masaüstünde pencere, mobilde sayfa, TV'de tam ekrandır.
6. TV'de her ekran yalnız yön tuşları + OK + Geri ile tamamen kullanılabilir; odak hiçbir zaman kaybolmaz.
7. Arama hiçbir zaman çıkmaz sokak değildir: eşleşme yoksa modelin tahminleri gösterilir.
8. Yetki sürprizi yok: kilitli içerik karttan bellidir; tam ekran hata yoktur.
9. 360 px genişlikte yatay kaydırma yok; en küçük yazı 11 px.
10. YouTube oynatıcısının üstüne arayüz çizilmez; en az 200×200.
