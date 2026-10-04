# Varlık listesi — Minik Usta

Sahip: design-lead · Durum: Faz 1 taslağı (2026-10-04) · Görsel tarifler: `docs/ART_DIRECTION.md` · Animasyon/ses:
`docs/JUICE.md` · Sahneler: `docs/STORY.md`

---

## 0. Kurallar

- **Boyutlar** 1080×1920 tasarım tuvaline göre px (1×). Tuval cihazda yaklaşık fiziksel piksel çözünürlüğünde çizildiği
  için (390 pt × 3 = 1170 px) 1× yeterlidir; ikonlar ve logo ayrıca SVG kaynağıyla teslim edilir.
- **Durum:** `prosedürel` = kodla çizilir (final kalitesinde kalabilir) · `yer tutucu` = basit SVG/şekil, final sanatla
  değişecek · `final` = teslim edildi.
- **Format:** düz renkli ve kenar keskin öğeler SVG kaynak + PNG atlas; büyük illüstrasyonlar WebP (kalite 85, şeffaflık
  gerekiyorsa WebP-alpha), yedek PNG. Ses: prosedürel (MVP), final için OGG + M4A.
- **Dosya adı:** `kategori_ad_varyant` (İngilizce, küçük harf, alt çizgi). Klasör yerleşimi code-lead'in kararı
  (öneri `public/assets/<kategori>/`).
- **Atlas:** oyun ekranındaki tüm küçük görseller tek bir 2048×2048 atlasa (blok dokuları açılışta ayrı RenderTexture
  atlasına) — çizim çağrısı bütçesi için.

### 0.1 Genel stil brifi (her final görsel brifinin başına eklenir)

> "Bright, warm 'toy box' 2D game art for a mobile puzzle game. Thick rounded dark-brown outlines (#3B2A1A), flat
> colors with one soft shadow tone and one white highlight band, rounded corners everywhere, chunky toy-like
> proportions, soft and friendly. No gradients except skies. No text, letters, numbers or logos in the image.
> Original characters only."
>
> **Negatif (her zaman):** "no yellow hard hat on the child, no overalls, no tool belt on the child, no talking
> construction vehicles, no bulldog, no crown or cape, no Bob the Builder, PAW Patrol, Royal Match or Handy Manny
> likeness, no text, no watermark, no photorealism, no 3D render, no anime style."

Türkçe karşılığı: parlak, sıcak "oyuncak kutusu" 2B oyun sanatı; kalın yuvarlak koyu kahve kontur; düz renk + tek gölge
tonu + beyaz ışık bandı; yuvarlak köşeler; tombul oyuncak oranları. Görselde yazı/rakam/logo yok.

---

## 1. Font

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `font_baloo2_latin_tr` | 38 KB | WOFF2 (değişken 400–800) | final | P0 | Baloo 2 (OFL 1.1), Latin + Latin Ext-A + Türkçe noktalama alt kümesi. Kaynak: google/fonts `ofl/baloo2`. Lisans metni `OFL.txt` uygulama içi Lisanslar sayfasına. |

---

## 2. Bloklar, semboller, bayraklar

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `blk_<W..P>_<mask00..15>` (128 doku) | 120×120 | RenderTexture (açılışta) | prosedürel | kod | ART_DIRECTION §3 tarifi; 4-komşu maske × 8 renk. Final'de de prosedürel kalması önerilir (tutarlılık, renk körü modu, boyut). |
| `sym_<W..P>` (8) | 100×100 birim (hücrede 55 px) | SVG | prosedürel | kod | ART_DIRECTION §3.1 yolları. Final iyileştirme brifi: "8 simple monochrome glyphs, one per material: wood grain with knot, three sand dots, leaf, brick bond, roof-tile scallops, concrete cross-hatch, four-point sparkle, faceted gem. Each must stay distinct as a silhouette at 40 px and in grayscale. Stroke-based, rounded caps, 8% stroke weight." |
| `flag_glass` | 120×120 katman | PNG/prosedürel | prosedürel | kod | İki çapraz beyaz parıltı + köşede çatlak cam rozeti (28 px). Final: "subtle glass overlay for a toy block: two diagonal white streaks, faint inner rim, tiny cracked-glass corner badge; transparent background." |
| `flag_mortar` | 120×140 (alttan 20 px taşar) | PNG | yer tutucu | P1 | Bloğun altından sarkan 3 gri harç damlası + 32 px mala rozeti. Final: "three soft gray mortar drips hanging from the bottom edge of a block, plus a small trowel badge; cartoon, thick outline." |
| `flag_balloon_1`, `flag_balloon_2` | 80×120, 140×120 | PNG | yer tutucu | P1 | Beyaz balon(lar) + ip, kontur #3B2A1A. Final: "one / two white party balloons with short strings, glossy highlight, thick outline, tied to the top of a block." |
| `flag_chain` | 120×120 | PNG | yer tutucu | P1 | Çapraz iki zincir + ortada 40 px altın asma kilit. Final: "two steel chains crossing diagonally over a square tile, small chunky gold padlock in the middle; toy style." |
| `flag_wet` | 120×120 | PNG | yer tutucu | P1 | Parlak gri ıslak harç tabakası (%55) + 2 beyaz parlama. Final: "glossy wet-cement glaze over a block, gray, two white shine spots, a few drips; semi-transparent." |
| `badge_counter` | Ø 48 | prosedürel | prosedürel | kod | Krem daire + koyu kontur; rakam Baloo 2 800, 34 px. |
| `heavy_band`, `badge_weight` | 120×16, 40×40 | PNG | yer tutucu | P0 | Sarı-siyah ikaz bandı ve kettlebell silueti (Ağır Malzeme). |

---

## 3. Tahta, şantiye, plan

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `board_yard_floor` | 120×120 döşeme (2 ton dama) | PNG | prosedürel | kod | #E9C891 / #E2BD80 ince ahşap-kum zemin, 3 px ızgara #D4AE6E. Final: "warm sandy wooden floor tile, very subtle grain, seamless, low contrast so blocks pop." |
| `board_yard_frame` | 9-dilim, köşe 40 | PNG | yer tutucu | P0 | 20 px ahşap tahta çerçeve #B98A4E, köşelerde çivi. |
| `board_blueprint` | 240×240 döşeme | PNG | prosedürel | kod | #1F4F8F zemin, beyaz %14/%24 ızgara, %4 kâğıt benekleri. Final: "seamless blueprint paper texture, deep blue, faint white grid every cell and stronger every two cells, slight paper speckle; flat, not photographic." |
| `board_blueprint_corner` | 72×72 | SVG | prosedürel | kod | Pafta köşebendi (beyaz %30 L). |
| `board_scaffold_pole`, `_ledger`, `_clamp` | 16×960, 240×10, 20×20 | PNG | yer tutucu | P0 | Çelik iskele borusu (#8A96A3, üst ışık), yatay kuşak, turuncu kelepçe. Final: "chunky toy scaffolding: rounded steel poles, orange clamps, thick outline." |
| `plan_cell` | 104×104 | prosedürel | prosedürel | kod | Tebeşir altlık #BCCADD + renk %80 + kesik kontur + sembol (ART_DIRECTION §4). |
| `plan_empty` (`.`) | 104×104 | prosedürel | prosedürel | kod | 45° beyaz %28 tarama + kesik kontur; komşular birleşik çerçeve. |
| `plan_hidden_tag` (`?`) | 64×64 | SVG | yer tutucu | P1 | Krem kâğıt etiket, ip deliği, `?` i18n değil (sembol). Final: "small cream paper tag with a string hole, hand-drawn question mark, slightly rotated." |
| `crane_hook_ornament` | 80×120 | SVG | yer tutucu | P0 | Vinç alanı sol ucunda sabit kanca. Final: "orange crane hook on a short cable, toy style." |
| `ghost_badge_ok`, `ghost_badge_warn`, `ghost_badge_glass` | Ø 44 (renk körü modunda 60) | SVG | prosedürel | kod | ✓ / ! / çatlak cam; beyaz daire + koyu kontur. |
| `segment_mini_<n>` | 2×8 hücre, hücre 12 px | prosedürel | prosedürel | kod | Panorama için planın küçük render'ı. |

---

## 4. Duvar ve geçitler

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `wall_body` | 60×120 döşeme | PNG | prosedürel | kod | Beton gövde, dikey kalıp çizgileri. Final: "vertical concrete column segment, light gray, soft formwork lines, rounded edges, toy style, seamless vertically." |
| `wall_cap` | 72×20 | PNG | prosedürel | kod | Sarı-siyah ikaz şeritli başlık. |
| `gap_static_edge` | 72×14 | PNG | prosedürel | kod | İkaz bandı (üst/alt) + `gap_rail` 240×6 çelik ray. |
| `gap_narrow_jaw` | 18×28 ×2 | SVG | yer tutucu | P0 | İçe bakan çelik çene (#4A525C). Final: "two small chunky steel wedge jaws pointing inward, bolted." |
| `gap_shutter_slats` | 60×(120·size) | PNG | yer tutucu | P0 | Yatay lamelli panjur; `gap_shutter_roll` 72×28 sarılı silindir. Final: "metal roller shutter, horizontal slats, gray-blue, closed and rolled-up states." |
| `gap_slider_plate` + `badge_updown` | 72×(120·size), Ø 52 | PNG/SVG | yer tutucu | P0 | Turuncu kayar plaka, dikey ray izi, ▲▼ rozeti (dolu = sıradaki yön). |
| `gap_paint_frame_<W..P>` | 72×(120·size) | prosedürel | prosedürel | kod | Geçit rengiyle 8 damla + damla rozeti içinde sembol. Final: "paint-splattered door frame, thick drips in the gate color, a drop-shaped badge on top." |
| `gap_locked_gate` + `padlock` | 72×(120·size), 72×80 | PNG | yer tutucu | P1 | Dikey parmaklıklar + büyük altın asma kilit; açılma animasyonu için 3 kare. Final: "barred gate with 4 vertical steel bars and a chunky gold padlock; open and closed padlock frames." |
| `fan_housing`, `fan_blades` | 112×112, 96×96 | SVG | yer tutucu | P1 | Rüzgâr fanı muhafazası ve 3 kanat (dönen sprite); `wind_lines` 240×120 kesik çizgiler. |

---

## 5. Engeller

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `obs_crate_hp3`, `_hp2`, `_hp1` | 120×120 | PNG | yer tutucu | P0 | Açık çam kasa, X destek, çiviler; hp3 = 2 metal kuşak, hp2 = 1 kuşak + küçük çatlak, hp1 = kuşaksız 2 çatlak. Final: "light pine wooden crate, cartoon, X brace, nails; three damage states: two steel straps, one strap, no strap with cracks; must not look like a wooden building block." |
| `obs_cement_bag` + `_torn` | 120×120 | PNG | yer tutucu | P0 | Kâğıt çuval, ip bağı, gri tuğla piktogramı; yırtık kare. Final: "plump paper cement sack, off-white, tied top, gray brick pictogram (no text), slightly slumped; torn frame with dust puff." |
| `obs_screw` | Ø 56 | SVG | yer tutucu | P0 | Altın vida başı, artı yarık. Final: "shiny golden screw head, cross slot, top view, chunky." |
| `obs_key` | 88×40 | SVG | yer tutucu | P1 | Altın anahtar, halkasında renk şeridi. |
| `obs_glint` | 20×20 | SVG | prosedürel | kod | Kapalı vida/anahtar için köşe ışıltısı. |
| `obs_debris_mask_<shape>` | şekil kutusu | prosedürel | prosedürel | kod | Kırık beton (#8D8579), tırtıklı kenar, çatlaklar. Final dokusu: "broken concrete chunk texture, brown-gray, jagged edges, cracks, dust specks; tileable." |

---

## 6. Arka planlar (her hikaye bölümü için 4 katman)

Boyut 1080×2400 (uzun telefonlar için; bkz. UX_FLOWS §0.1). Gökyüzü gradyanı prosedürel.

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `bg_ch<1..5>_sky` | 1080×2400 | prosedürel | prosedürel | kod | ART_DIRECTION §7 renkleri. |
| `bg_clouds_<a..d>` | 360×160 | PNG | yer tutucu | P0 | 4 yumuşak bulut, beyaz, kontursuz, alt kenarda hafif gölge. |
| `bg_ch1_far/mid/near` | 1080×600 / 1080×700 / 1080×500 | WebP | yer tutucu | P0 | Ağaç Ev: "soft rolling green hills, round-topped forest silhouettes, grass with tiny daisies; low saturation, layered parallax strips, transparent top." |
| `bg_ch2_far/mid/near` | aynı | WebP | yer tutucu | P0 | Fırın: "warm orange small-town street, tiled roofs and chimneys with curly smoke, cozy window lights; low saturation." |
| `bg_ch3_far/mid/near` | aynı | WebP | yer tutucu | P1 | Kütüphane: "blue-violet school silhouette, round trees, clouds shaped faintly like open books, mosaic tile trim." |
| `bg_ch4_far/mid/near` | aynı | WebP | yer tutucu | P1 | Fener: "sunset sea in turquoise and peach, rocky shore, lighthouse silhouette, distant gulls." |
| `bg_ch5_far/mid/near` | aynı | WebP | yer tutucu | P1 | Şato: "purple festival night, hilltop with warm golden lights, bunting flags, faint fireworks." |

---

## 7. Kasaba (Ana ekran) ve albüm

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `town_ch<n>_base` | 1080×1200 | WebP | yer tutucu | P0 (ch1–2) · P1 (ch3–5) | Hikaye bölümünün yapı alanı boş hâli (iskele, temel çukuru). |
| `town_ch<n>_part<1..7>` (35 parça) | parça başına ≤ 1080×1200, şeffaf | WebP | yer tutucu | P0 (ch1–2) · P1 (ch3–5) | STORY §5 görevleri; her görev yapıya bir katman ekler. Brif örneği (Ağaç Ev 1): "wooden tree-house steps nailed to a big plane tree trunk, toy style, transparent background, matches layered composition." Her parça aynı kamera açısında (¾ önden, hafif aşağıdan) ve aynı ölçekte. |
| `town_ch<n>_complete_glow` | 1080×1200 | PNG | prosedürel | kod | Tamamlanınca yapının arkasında yumuşak ışık halesi. |
| `album_card_ch<1..5>` | 600×800 | WebP | yer tutucu | P2 [Sonra] | Tamamlanan yapının kartpostal görünümü, beyaz kenar, köşede yıldız. |
| `album_card_locked` | 600×800 | prosedürel | prosedürel | kod | Gri siluet + asma kilit. |

---

## 8. Karakterler

Teslim: her karakter katmanlı (gövde, kafa, saç/şapka, yüz parçaları: göz ×6, kaş ×6, ağız ×6), kod ile tween'lenir.
Büst 256×320, tam boy 320×480 (1×). Yer tutucular ART_DIRECTION §11.7 SVG'leri.

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `chr_tuna_*` (büst, tam boy, 8 poz, 6 ifade) | 256×320 / 320×480 | SVG → PNG parçalar | yer tutucu | P0 | "An 8-year-old gender-neutral child builder: chin-length messy chestnut hair poking out of a MINT-GREEN hard hat with a white star sticker, freckles, big amber eyes, orange safety vest with two pale-yellow reflective bands over a cream/teal striped long-sleeve shirt, navy trousers with a sand-colored knee patch, HUGE yellow work gloves (bigger than the head's width ratio suggests), red sneakers, yellow pencil behind the ear. Big head, small body. Poses: thumbs up, carrying a block, fixing helmet with both hands, writing on plan, victory jump, startled hop, chin on glove thinking, hugging the dog." + genel negatif. |
| `chr_dede_*` (6 poz, 6 ifade) | aynı | SVG → PNG | yer tutucu | P0 | "Tall thin elderly master builder: terracotta flat cap, very thick round black glasses magnifying the eyes, broad white blunt mustache, white tufts of hair at the sides, olive multi-pocket work jacket over white shirt, yellow tape-measure case on the belt, holds a folding wooden ruler as a pointer; slightly stooped, kind smile. Must not resemble Geppetto (no apron, no vest, no white bushy hair on top)." |
| `chr_kepce_*` (6 poz, 6 ifade) | 320×220 | SVG → PNG | yer tutucu | P0 | "Red dachshund with a very long body and tiny legs, wearing an oversized ORANGE hard hat that slips sideways, one ear flopping out under it, mint collar with a bone-shaped tag; loves digging. Not a bulldog, no vehicle, no backpack, no badge." |
| `chr_gribeton_*` (6 poz, 6 ifade) | 256×320 | SVG → PNG | yer tutucu | P0 | "Boxy, rectangular-bodied businessman: flat-top gray hair shaped like a poured concrete slab with horizontal form lines, thick straight dark-gray eyebrows, thin straight 'spirit level' mustache, half-lidded confident eyes, gray three-piece suit, dark-gray tie with a tiny cement-mixer tie pin, gray hard-cover folder with a plain gray square emblem, polished black shoes. Comedic and proud but clearly kind-hearted; never villainous or sinister. No top hat, no cane, no monocle." Bölüm 5 varyantı: kravatta küçük renkli mozaik iğne. |
| `chr_ayse_*` (4 poz, 6 ifade) | 256×320 | SVG → PNG | yer tutucu | P0 | "Warm middle-aged baker: dark-gray hair bun, rosy cheeks, mustard apron dusted with flour, sleeves rolled, long wooden bread peel over the shoulder." |
| `chr_selin_*` | 256×320 | SVG → PNG | yer tutucu | P1 | "Young teacher: high black ponytail, purple cardigan, mosaic-pattern scarf in blue/purple/yellow, stack of three books in her arms." |
| `chr_riza_*` | 256×320 | SVG → PNG | yer tutucu | P1 | "Sturdy fisherman: navy knit beanie, yellow oilskin jacket, short salt-and-pepper beard, fish-shaped whistle on a cord. Not a captain's cap, no pipe." |
| `chr_kurdele_*` | 256×320 | SVG → PNG | yer tutucu | P0 | "Tall slim mayor: navy suit, red-and-white diagonal sash, oversized golden ceremonial scissors, enthusiastic speech-giving pose." |
| `chr_extras_<kid1..3, fisher1..2>` | 200×280 | SVG | yer tutucu | P2 | Kasaba çocukları ve balıkçılar için 5 sade figür, aynı stil, yüz ifadesi yalnız mutlu/şaşkın. |
| `chr_bridge_helmet_player`, `_bot_<1..8>` | 64×64 | SVG | yer tutucu | P0 | Sallanan Köprü kaskları: oyuncu = Tuna'nın nane kaskı + yıldız; botlar 8 renk varyantı (blok renkleri), yıldızsız. |

---

## 9. Ara sahne panelleri

Panel 1000×1000, WebP; konuşma balonları ve yazılar kodla üstüne basılır (görselde yazı yok). Toplam **47 panel**.
Yer tutucu: düz renkli arka plan + karakter yer tutucu SVG'leri + 1 sahne nesnesi.

| Ad | Adet | Durum | Öncelik | Brif |
| -- | ---- | ----- | -- | ---- |
| `cut_prologue_p<1..3>` | 3 | yer tutucu | P0 | STORY §4.0 panel tarifleri. Ortak: "comic panel, single clear focal point, characters large (head ≥ 25% of panel height), soft background, space in the bottom 30% for a speech bubble." |
| `cut_ch1_start_p<1..4>`, `cut_ch1_end_p<1..4>` | 8 | yer tutucu | P0 | STORY §4.1. |
| `cut_ch2_start_p<1..4>`, `cut_ch2_end_p<1..4>` | 8 | yer tutucu | P0 | STORY §4.2. |
| `cut_ch3_start_p<1..4>`, `cut_ch3_end_p<1..4>` | 8 | yer tutucu | P1 | STORY §4.3. |
| `cut_ch4_start_p<1..5>`, `cut_ch4_end_p<1..5>` | 10 | yer tutucu | P1 | STORY §4.4. |
| `cut_ch5_start_p<1..4>`, `cut_ch5_end_p<1..6>` | 10 | yer tutucu | P1 | STORY §4.5. Final paneli (havai fişek) en yüksek detay. |
| `ui_speech_bubble` | 9-dilim, köşe 48, kuyruk 3 yön | prosedürel | kod | Beyaz balon, 6 px kontur, kuyruk sol/sağ/alt. |

---

## 10. Arayüz

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `ui_button_<primary/secondary/danger/disabled>` | 9-dilim, köşe 48, dudak 12 | prosedürel | prosedürel | kod | ART_DIRECTION §2.3 renkleri; üst ışık bandı + dudak. |
| `ui_panel` | 9-dilim, köşe 48 | prosedürel | prosedürel | kod | Krem panel, kenar ışığı, alt dudak. |
| `ui_close` | Ø 112 | SVG | yer tutucu | P0 | Kırmızı daire + beyaz kalın ×. |
| `ui_tag_hard`, `ui_tag_superhard` | 240×80 | prosedürel | prosedürel | kod | Kırmızı / mor etiket, yazı i18n ("ZOR", "ÇOK ZOR"), kenarda ince ikaz şeridi (yalnız çok zor). |
| `ui_toggle` | 176×96 | prosedürel | prosedürel | kod | Açık = yeşil, kapalı = gri; düğme topu krem. |
| `ui_streak_bar` | 560×80 | prosedürel | prosedürel | kod | 4 boncuk + Altın Mala yuvası. |
| `ui_moves_panel` | 280×224 | prosedürel | prosedürel | kod | Krem panel, büyük rakam alanı. |
| `ui_booster_slot` | 172×172 | prosedürel | prosedürel | kod | Yuvarlak kare, çukur, adet rozeti / "+" / kilit. |
| `ui_tutorial_glove` | 140×160 | SVG | yer tutucu | P0 | Tuna'nın sarı iş eldiveni, işaret parmağı uzatılmış; 2 kare (açık, basılı). Final: "big yellow cartoon work glove pointing with the index finger, thick outline; pressed and released frames." |
| `ui_spotlight_mask` | — | prosedürel | prosedürel | kod | Karartma + yuvarlak dikdörtgen delikler. |
| `ui_loading_crane` | 96×96 (8 kare) | PNG | yer tutucu | P0 | Bloğu döndüren mini vinç döngüsü. |
| `ui_progress_crane` | 840×200 | SVG | yer tutucu | P0 | Açılış yükleme vinci: kol + kanca + blok. |
| `ui_panel_dots` | 24×24 | prosedürel | prosedürel | kod | Ara sahne ilerleme noktaları. |

**İkonlar** (128×128, SVG kaynak + atlas PNG; brif: ART_DIRECTION §9 ikon dili; her biri "chunky toy icon, thick dark
outline, two-tone fill, white highlight pill, no text"):

| Ad | Durum | Öncelik | Ek brif |
| -- | ----- | -- | ------- |
| `icon_life` | yer tutucu | P0 | Kalp, ortasında küçük beyaz yıldız. |
| `icon_coin` | yer tutucu | P0 | Altın sikke, kabartma mala. |
| `icon_star` | yer tutucu | P0 | Tombul 5 köşeli yıldız. |
| `icon_hammer` | yer tutucu | P0 | Ahşap saplı kırmızı başlı çekiç, 20° eğik. |
| `icon_crane` | yer tutucu | P0 | Turuncu kanca + halat. |
| `icon_brush` | yer tutucu | P0 | Ahşap saplı fırça, ucu 3 renk şerit. |
| `icon_undo` | yer tutucu | P0 | Kıvrık ok, ucunda küçük mala. |
| `icon_thermos` | yer tutucu | P0 | Mavi termos, buhar. |
| `icon_trowel_start` | yer tutucu | P0 | Altın mala + parıltı. |
| `icon_open_shutter` | yer tutucu | P0 | Yarı açık panjur + yukarı ok. |
| `icon_gold_trowel` | yer tutucu | P0 | Altın mala, ahşap sap. |
| `icon_truck` | yer tutucu | P0 | Turuncu kamyon ¾ önden, kasada 3 blok. Karaktersiz (yüz yok). |
| `icon_settings` | yer tutucu | P0 | Dişli içinde vida başı. |
| `icon_pause` | yer tutucu | P0 | İki kalın çubuk. |
| `icon_nav_shop`, `_league`, `_home`, `_team`, `_album` | yer tutucu | P0 | Tente+tezgâh · mala kupa · kiremit çatılı ev · iki kask (kilitli varyant gri) · spiralli albüm. |
| `icon_event_bridge` | yer tutucu | P0 | Halat köprü + simit. |
| `icon_daily`, `icon_piggy_<0..2>`, `icon_chest` | yer tutucu | P0 | Takvim+yıldız · tuğla biçimli kumbara (3 doluluk) · ahşap alet sandığı (kapalı/açık). |
| `icon_goal_build`, `_crate`, `_chain`, `_debris`, `_screw` | yer tutucu | P0 | Hedef paneli ikonları (64 px'te okunur). |
| `icon_lock` | yer tutucu | P0 | Altın asma kilit. |
| `icon_league_<bronze/silver/gold/diamond>` | yer tutucu | P1 | Mala biçimli rozet; bronz/gümüş/altın/elmas, kademeli süsleme. |

---

## 11. Logo, uygulama ikonu, mağaza

| Ad | Boyut | Format | Durum | Öncelik | Brif |
| -- | ----- | ------ | ----- | -- | ---- |
| `logo_wordmark` | 880×360 | SVG + PNG | yer tutucu | P0 | "MİNİK USTA" Baloo 2 800, beyaz dolgu + koyu kontur, harflerin arkasında 8 renkli blok (W Y G R O C B P), İ noktası yıldız. EN sürümü NAMING kararındaki adla çizilir ("Little Builder" kullanılmaz — BUSINESS P-6). Ad kesinleşince TR logo da yeniden değerlendirilir. |
| `app_icon` | 1024×1024 | PNG (şeffaflık yok) | yer tutucu | P0 | "Tuna's mint hard hat with the white star, peeking over a stack of three colorful toy blocks (green, yellow, red) on a warm sky-blue background; no text." iOS köşe maskesi sistemden. |
| `app_icon_android_fg`, `_bg` | 432×432 (108 dp @4×) | PNG | yer tutucu | P0 | Uyarlanabilir ikon: ön plan kask + bloklar (güvenli alan 66 dp daire), arka plan #7FD3F7. |
| `pwa_icon_192`, `_512`, `_maskable_512` | 192/512 | PNG | yer tutucu | P0 | app_icon'dan türetilir. |
| `store_feature_graphic` | 1024×500 | PNG | yer tutucu | P0 | Google Play öne çıkan görsel: sol yarıda Tuna bir bloğu duvarın üstünden aşırıyor (imza hareket), sağda renkli ağaç ev; yazı yok (mağaza metni ayrı). |
| `store_screenshots` | 1290×2796 (iOS 6,7"), 1080×1920 (Android) | PNG | yer tutucu | P0 | Faz 5'te `npm run screens` çıktısından + çerçeve; entrepreneur'ün STORE_LISTING metinleriyle. |
| `splash_native` | 2732×2732 (merkez 1024 güvenli) | PNG | yer tutucu | P0 | Capacitor native splash: #7FD3F7 + logo. |

---

## 12. Parçacıklar (fx atlası, 512×512)

| Ad | Boyut | Durum | Öncelik | Brif |
| -- | ----- | ----- | -- | ---- |
| `fx_dust` | 32×32 | prosedürel | kod | Yumuşak krem toz bulutu (#F2E6CF, kenar %0). |
| `fx_spark` | 24×24 | prosedürel | kod | 4 köşeli beyaz kıvılcım (renklenebilir). |
| `fx_gold` | 28×28 | prosedürel | kod | Altın kıvılcım (#FFC21A + beyaz merkez). |
| `fx_confetti_<W..P>` | 16×24 | prosedürel | kod | Dikdörtgen konfeti, blok renkleri. |
| `fx_splinter` | 24×8 | yer tutucu | P0 | Çam kıymığı. |
| `fx_glass` | 20×20 (3 varyant) | yer tutucu | P1 | Beyaz-mavi üçgen cam kırığı. |
| `fx_paint` | 20×20 | prosedürel | kod | Boya damlası (renklenebilir). |
| `fx_water` | 16×20 | prosedürel | kod | Su damlası. |
| `fx_steam` | 40×40 | prosedürel | kod | Buhar halkası. |
| `fx_star_small` | 20×20 | prosedürel | kod | Küçük yıldız. |
| `fx_note` | 24×24 | yer tutucu | P2 [Sonra] | Müzik notası (kombo dansı). |
| `fx_wind` | 64×8 | prosedürel | kod | Rüzgâr çizgisi. |

---

## 13. Sesler

MVP'de tümü **prosedürel** (JUICE tarifleri, ZzFX benzeri üreteç). Final brifi (ses tasarımcısı ya da üretim aracı):
"bright, toy-like, wooden and plastic textures, short and soft-attack, never harsh; failure sounds gentle and
non-judgmental; all sounds mono, 44.1 kHz, peak −3 dBFS, delivered as OGG + M4A."

| Grup | Adlar | Adet |
| ---- | ----- | ---- |
| Sürükleme | `sfx_pick`, `sfx_blocked`, `sfx_bump`, `sfx_whoosh`, `sfx_ghost_ok`, `sfx_cancel`, `sfx_set_yard`, `sfx_fall`, `sfx_land` | 9 |
| Yerleşim / kombo | `sfx_place_ok` (perde kademeli), `sfx_place_bad`, `sfx_bounce`, `sfx_mortar`, `sfx_streak_pip`, `sfx_combo`, `sfx_trowel`, `sfx_segment` | 8 |
| Teslimat | `sfx_truck_horn`, `sfx_queue`, `sfx_reshuffle` | 3 |
| Geçitler | `sfx_gap_rail`, `sfx_clamp`, `sfx_gap_squeeze`, `sfx_shutter`, `sfx_tick`, `sfx_slider`, `sfx_paint`, `sfx_unlock`, `sfx_wind` | 9 |
| Engeller | `sfx_crate_hit`, `sfx_crate_break`, `sfx_bag_tear`, `sfx_bag_thud`, `sfx_chain_break`, `sfx_dry`, `sfx_key`, `sfx_screw`, `sfx_goal_tick`, `sfx_debris`, `sfx_glass`, `sfx_balloon`, `sfx_slip`, `sfx_steer`, `sfx_carousel`, `sfx_elevator`, `sfx_reveal` | 17 |
| Hamle / sonuç | `sfx_lastmoves`, `sfx_offer`, `sfx_moves_add`, `sfx_goal_done`, `music_win`, `sfx_coin`, `sfx_out_of_moves`, `sfx_life_lost`, `sfx_star` | 9 |
| Güçlendiriciler | `sfx_select`, `sfx_hammer`, `sfx_crane`, `sfx_brush`, `sfx_undo`, `sfx_thermos`, `sfx_streak_bonus` | 7 |
| Arayüz / meta | `sfx_button`, `sfx_popup`, `sfx_close`, `sfx_tab`, `sfx_locked`, `sfx_town_build`, `sfx_bridge_step`, `sfx_splash`, `sfx_rank_up`, `sfx_page`, `sfx_woof` | 11 |
| Karakter sesleri | `sfx_voice_tuna`, `_dede`, `_gribeton`, `_kepce`, `_ayse`, `_selin`, `_riza`, `_kurdele` | 8 |
| Müzik (sonra) | `music_town_loop`, `music_level_loop`, `music_cutscene` | 3 |
