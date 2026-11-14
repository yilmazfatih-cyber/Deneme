# TV+ Yeniden Tasarım — Tasarım Spesifikasyonu (v1)

Bu belge, tuvaldeki tüm ekranların uyduğu tek kaynaktır. Ekran çizen herkes buradaki
token, bileşen ve metinleri AYNEN kullanır; kendi rengini/ölçüsünü icat etmez.

## 0. Ürün fikri: "İki kapı, tek ev"

TV+'ın iki ana kitlesi var: **IPTV'den gelenler** (kanal izleyen, rehber/zap/kayıt
kullanan ev kullanıcısı) ve **OTT kullanıcıları** (film/dizi seçip izleyen). Ana sayfanın
en üstünde, her zaman aynı yerde duran iki parçalı bir **Geçiş** var:

    [ ● Canlı TV ]  [ ▶ Film & Dizi ]

- Kullanıcı ne için geldiyse ona tek dokunuşla geçer; uygulama son seçimi hatırlar.
- Ana sayfa seçime göre yeniden dizilir (Canlı TV modu / Film & Dizi modu).
- Her modun en altında diğer dünyaya küçük bir "köprü" şeridi bulunur.
- Kullanıcıya "IPTV/OTT" jargonu ASLA gösterilmez; etiketler "Canlı TV" ve "Film & Dizi".

Mobil alt gezinme (4 sekme): **Ana Sayfa · Rehber · Ara · Kitaplığım**. Profil avatarı üst sağda.
Web üst menü: logo · Geçiş · Rehber · Spor · Çocuk · [geniş arama kutusu] · TV'de izle · avatar.

## 1. Tokenlar

### Renk
| Token | Hex | Kullanım |
|---|---|---|
| bg | #0D0E12 | sayfa zemini (TV+ mevcut zemini) |
| surface-1 | #16171C | kart, girdi, alt sayfa zemini |
| surface-2 | #1E1F23 | kanal karosu, yükseltilmiş kart (TV+ mevcut kart rengi) |
| surface-3 | #2A2B30 | basılı/aktif yüzey, ikincil buton |
| line | rgba(255,255,255,0.08) | ince ayırıcı / kart kenarı |
| line-strong | rgba(255,255,255,0.16) | ikincil buton kenarı |
| yellow | #F7D849 | TV+ sarısı: birincil eylem, seçili durum, ilerleme çubuğu |
| on-yellow | #14140F | sarı üzerindeki metin/ikon |
| text-1 | #FFFFFF | başlık, birincil metin |
| text-2 | #B6B7BC | ikincil metin (zeminde 9:1) |
| text-3 | #8E9096 | üçüncül metin, meta (zeminde 5.9:1 — daha koyusu YASAK) |
| live | #FF5247 | yalnızca CANLI noktası/etiketi ve "şimdi" çizgisi |
| ok | #5BD6A0 | "paketinde", "kaydedildi" onayı (az kullan) |

Kurallar: Sarı yalnızca (a) birincil buton, (b) seçili sekme/çip/Geçiş parçası, (c) ilerleme çubuğu,
(d) tek rozet için kullanılır. Bir ekranda aynı anda en fazla 1 sarı dolgulu birincil buton
görünür (Geçiş hariç). Kırmızı yalnızca canlı yayın işaretidir. Degrade yalnızca görsel üstü
okunabilirlik için siyaha/zemine doğru kullanılır (dekoratif degrade yok). Emoji yok.

### Tipografi
Tek aile: **Manrope** (Google Fonts; yedek: system-ui, -apple-system, "Segoe UI", sans-serif).
`<helmet>` içine: `<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">`
Kök öğede: `font-family: Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif; color:#FFFFFF`.

| Rol | Mobil | Web | Ağırlık | Not |
|---|---|---|---|---|
| Ekran başlığı | 26/32 | 32/40 | 800 | letter-spacing -0.02em |
| Hero başlığı | 30/34 | 56/60 | 800 | letter-spacing -0.02em |
| Satır başlığı | 18/24 | 22/28 | 700 | |
| Kart başlığı | 14/18 | 15/20 | 600 | tek satır, ellipsis |
| Gövde | 14/20 | 16/24 | 500 | text-2 |
| Meta / yardımcı | 12/16 | 13/18 | 500 | text-3; en küçük 12px |
| Buton etiketi | 15/20 | 16/20 | 700 | |
| Rozet | 11/14 | 11/14 | 700 | letter-spacing 0.02em |

Saat biçimi her yerde 24 saat: "20:00–23:15", "Bugün 22:15", "42 dk kaldı".

### Ölçü
- Kenar boşluğu: mobil 16px; web 48px (içerik max-width 1440px).
- Boşluk ölçeği: 4, 8, 12, 16, 24, 32, 48.
- Köşe: afiş 10px · kart/karo 14px · alt sayfa 20px · buton/çip tam hap (999px).
- Dokunma hedefi en az 44px (mobil), 40px (web).
- Afiş 2:3 (mobil 112×168, web 184×276) · yatay kart 16:9 (mobil 232×130, web 300×169) ·
  kanal karosu 1:1 (mobil 56, web 64) · satırlar arası 28px (mobil), 40px (web).

## 2. Bileşenler (HTML kalıpları — satır içi stil)

Tüm stiller satır içi `style="…"` yazılır (editör paneli bunu düzenler). Kardeş gruplar
`display:flex` / `grid` + `gap` ile dizilir. Tıklanabilir her şey gerçek `<button>` veya `<a href="#">`.
Buton sıfırlama her butonda: `border:0; font:inherit; cursor:pointer`.

### Geçiş (mobil, tam genişlik)
```html
<div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px; padding:4px; background:#16171C; border:1px solid rgba(255,255,255,0.08); border-radius:999px">
  <button style="height:44px; border:0; border-radius:999px; background:#F7D849; color:#14140F; font:inherit; font-size:15px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer"><span style="width:8px; height:8px; border-radius:999px; background:#14140F"></span>Canlı TV</button>
  <button style="height:44px; border:0; border-radius:999px; background:transparent; color:#B6B7BC; font:inherit; font-size:15px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer">[play ikonu 16px]Film &amp; Dizi</button>
</div>
```
Seçili parça: sarı dolgu + koyu metin. Seçili olmayan: saydam + text-2. Web'de aynı kalıp, genişlik 280px, parça yüksekliği 40px.

### Butonlar
- Birincil: `height:48px; padding:0 24px; border-radius:999px; background:#F7D849; color:#14140F; font-weight:700; font-size:15px; display:inline-flex; align-items:center; gap:8px`
- İkincil: aynı ölçü, `background:rgba(255,255,255,0.12); color:#FFFFFF` (görsel üstünde `backdrop-filter:blur(12px)`).
- Üçüncül / ikon buton: `width:44px; height:44px; border-radius:999px; background:rgba(255,255,255,0.08); color:#FFFFFF; display:flex; align-items:center; justify-content:center` + `aria-label`.
- Metin buton ("Tümü"): `color:#B6B7BC; font-size:13px; font-weight:600; height:44px` satır başlığının sağında.

### Çip
`height:36px; padding:0 16px; border-radius:999px; font-size:13px; font-weight:600; display:inline-flex; align-items:center`
Seçili: `background:#FFFFFF; color:#0D0E12`. Diğer: `background:#16171C; color:#B6B7BC; border:1px solid rgba(255,255,255,0.08)`.
(Çipte seçili durum BEYAZ; sarı Geçiş'e ve birincil eyleme ayrılır.)

### Satır başlığı
```html
<div style="display:flex; align-items:center; justify-content:space-between; padding:0 16px">
  <h2 style="margin:0; font-size:18px; line-height:24px; font-weight:700">İzlemeye devam et</h2>
  <a href="#" style="color:#B6B7BC; font-size:13px; font-weight:600; text-decoration:none; padding:12px 0">Tümü</a>
</div>
```
Yatay kayan satır: `display:flex; gap:12px; padding:0 16px; overflow:hidden` (son kart kenardan taşarak "devamı var" hissi verir).

### Afiş kartı (2:3)
```html
<a href="#" style="flex:none; width:112px; text-decoration:none; color:inherit; display:flex; flex-direction:column; gap:8px">
  <img src="/_blob/…" alt="[Başlık] afişi" style="width:112px; height:168px; object-fit:cover; border-radius:10px; display:block; background:#16171C">
</a>
```
Afişin altında başlık YAZILMAZ (afişte zaten var) — ama arama sonuç ızgarasında ve "Benzerleri"nde
afiş altına 1 satır başlık + 1 satır meta eklenir. Kart başına EN FAZLA 1 rozet; rozet afişin sol üstünde:
`position:absolute; top:8px; left:8px; height:22px; padding:0 8px; border-radius:6px; background:#F7D849; color:#14140F; font-size:11px; font-weight:700; display:flex; align-items:center`.
Rozet sözlüğü (yalnız bunlar): "Yeni bölüm", "Yeni", "Sadece TV+'ta", "Son 3 gün". Canlı için kırmızı noktalı "CANLI".

### Yatay kart (16:9) — devam et / program
Görsel 16:9, köşe 14px; altta 3px ilerleme çubuğu (ray rgba(255,255,255,0.2), dolgu #F7D849) görselin alt kenarına yapışık;
altında başlık (14/18, 600) ve meta (12/16, text-3): "S1 B4 · 23 dk kaldı".

### Canlı kanal kartı (Kanallarım)
Kanal karosu (surface-2, 56×56, köşe 14, içinde logo `object-fit:contain`) + sağında/altında: program adı (14/18, 600),
"20:00–23:15 · 42 dk kaldı" (12/16, text-3), 3px ilerleme çubuğu. CANLI öğe HER ZAMAN ilerleme + bitiş/kalan süre taşır.

### CANLI etiketi
`display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; letter-spacing:0.04em; color:#FFFFFF`
+ başında `width:8px; height:8px; border-radius:999px; background:#FF5247` nokta. Görsel üstündeyse
`background:rgba(13,14,18,0.72); padding:4px 8px; border-radius:6px`.

### Alt gezinme (mobil)
Sabit alt şerit: `height:64px; background:rgba(13,14,18,0.92); backdrop-filter:blur(16px); border-top:1px solid rgba(255,255,255,0.08); display:grid; grid-template-columns:repeat(4, minmax(0, 1fr))`.
Her sekme `<a>`: ikon 24px + etiket 11px/14 600; seçili: ikon+metin #F7D849; diğer: #8E9096.
Sekmeler: Ana Sayfa (ev) · Rehber (ızgara/takvim) · Ara (büyüteç) · Kitaplığım (yer imi yığını).
Artboard'un en altında yer alır (ekranın parçası gibi; sahte durum çubuğu / ana ekran çizgisi ÇİZİLMEZ).

### Üst bar (mobil)
`height:56px; padding:0 16px; display:flex; align-items:center; justify-content:space-between`: solda TV+ logosu (yükseklik 26px),
sağda "TV'de izle" ikon butonu + 36px yuvarlak profil avatarı.

### Web üst menü
Opak ve sabit: `height:72px; background:#0D0E12; border-bottom:1px solid rgba(255,255,255,0.08)` (içerikle ÜST ÜSTE BİNMEZ;
mevcut sitedeki saydam menü hatası düzeltilir). Sıra: logo (h 30) · Geçiş (280px) · bağlantılar "Rehber", "Spor", "Çocuk"
(16px/600, text-2; seçili text-1) · esnek boşluk · arama kutusu (genişlik 360px, yükseklik 44px, surface-1, hap, büyüteç ikonu,
yer tutucu "Film, dizi, kanal, program, oyuncu ara") · "TV'de izle" ikon butonu · avatar 40px.

## 3. İkonlar
Satır içi SVG, `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`,
dekoratifse `aria-hidden="true"`. Dolu oynat üçgeni: `fill="currentColor" stroke="none"`.
Yollar (hepsi 24×24):
- oynat (dolu): `<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>`
- duraklat: `<path d="M8 5v14M16 5v14"/>`
- baştan başlat: `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`
- ev: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>`
- rehber: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>`
- ara: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`
- kitaplık: `<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>`
- artı: `<path d="M12 5v14M5 12h14"/>`
- onay: `<path d="m5 12 5 5 9-10"/>`
- TV'de izle (cast): `<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>`
- kaydet (rec): `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>`
- zil: `<path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>`
- indir: `<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>`
- paylaş: `<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>`
- beğen: `<path d="M7 11v9H4v-9h3zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7"/>`
- bilgi: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>`
- şevron sağ: `<path d="m9 6 6 6-6 6"/>` · sol: `<path d="m15 6-6 6 6 6"/>` · aşağı: `<path d="m6 9 6 6 6-6"/>`
- kapat: `<path d="M6 6l12 12M18 6 6 18"/>`
- mikrofon: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`
- altyazı: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 14h4M13 14h4M7 10h2M11 10h6"/>`
- ayar: `<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>`
- 10 sn geri: `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>` + ortada `<text x="12" y="15.5" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">10</text>`
- 10 sn ileri: `<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>` + aynı "10" metni
- ses: `<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>`
- tam ekran: `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`
- sonraki bölüm: `<path d="M5 5v14l10-7L5 5z"/><path d="M19 5v14"/>`
- bölümler (liste): `<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>`
- saat: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`
- telefon/kumanda: `<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M12 6v.01M12 11v.01M10 15h4"/>`

## 4. Dil ve metin (Türkçe arayüz sözlüğü)
- Geçiş: "Canlı TV" / "Film & Dizi"
- Birincil eylemler: "İzle", "Devam et", "Canlı izle", "Baştan başlat", "Canlıya dön", "Kaydet", "Hatırlat", "Listeme ekle", "TV'de izle"
- Satırlar (Canlı TV modu): "Kanallarım", "Bu akşam", "Canlı spor", "Kaçırdıkların · son 7 gün", "Kayıtlarım"
- Satırlar (Film & Dizi modu): "İzlemeye devam et", "Bugünün Top 10'u", "Sadece TV+'ta", "HBO Max'ten", "Yeni gelenler"
- Zaman: "42 dk kaldı", "Bugün 22:15", "Dün 20:00", "Cmt 20:00"
- Yetki: "Paketinde" / "HBO Max paketiyle" (kilit simgesi + tek satır; tam ekran hata YOK)
- Ton: kısa, sen dili, emir kipinde eylem. Ünlem ve büyük harfli bağırma yok.

## 5. Değişmez tasarım kuralları (denetim bulgularından)
1. Oynat/Devam et her yerden en fazla 2 dokunuş; canlıda ve "devam et"te 1 dokunuş.
2. Canlı her öğe: kanal logosu + program adı + ilerleme çubuğu + bitiş/kalan süre.
3. Kart başına en fazla 1 rozet.
4. Ana sayfada en fazla 6 satır tipi ve mod başına 6–7 satır (mevcut ~36 modül yerine).
5. Boş durum kartları ana sayfada YOK (yalnızca Kitaplığım'da, tek satır yardım metni olarak).
6. Web'de menü opak; içerik menünün altından başlar.
7. Her hero'da görünür birincil buton + bir ikincil buton.
8. En küçük yazı 12px; text-3'ten koyu gri yok.
9. "TV'de izle" ikonu hep üst sağda, aynı yerde.
10. Sahte iOS durum çubuğu / klavye çizilmez.
