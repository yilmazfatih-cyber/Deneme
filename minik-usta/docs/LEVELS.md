# 50 bölüm planı

Sahip: product-lead · Sürüm: Faz 1 revizyonu (2026-10-04; R-01, R-08, R-18, R-21; tutarlılık denetimi tur 1, 2026-10-05; F-3 çıkmaz taraması, 2026-10-05) · Kaynak: `docs/BRIEF.md` §8, `docs/GDD.md`, `docs/OBSTACLES.md`

Bu belge 50 bölümün taslağıdır. 1–10. bölümler tam blockout'tur (duvar, geçitler, saha blokları, plan satırları, kamyon
partileri, el çözümü). **1–5. bölümler Faz 2'de doğrudan JSON'a çevrilebilir.** 11–50. bölümler tek satırlık
tasarım kayıtlarıdır; Faz 3'te aynı akışla (ASCII → JSON → `npm run levels:check` → LEVEL_REPORT → hamle ayarı)
blockout'a dönüşür.

## 0. Kurallar ve yöntem

**Bölüm akışı:** ASCII blockout → JSON → `npm run levels:validate` → solver (minimum hamle, YAO) → playtest botu
(3 profil × 500) → `docs/LEVEL_REPORT.md` → hamle ayarı.

**Hamle bütçesi:** `moves = solver minimumu + tampon` (Kolay +8, Normal +5, Zor +3, Çok Zor +2), ardından "orta" bot
profiliyle hedef kazanma oranına ayar (Kolay ≥ %90, Normal %65–80, Zor %40–55, Çok Zor %25–40). Bu belgedeki
1–10 minimumları **el çözümüdür** (aşağıdaki doğrulama notu); solver daha kısa bir çözüm bulursa bütçe ona göre düşer.

**Doğrulama notu:** 1–10. bölümlerin blockout'ları, GDD kurallarını (duvar sınırı, açık gökyüzü, ray kipi, K-16,
K-34, kamyon dökümü K-25) uygulayan bir karalama betiğiyle hücre hücre denetlendi: bloklar çakışmıyor, şekiller
kimlikleriyle uyuşuyor, saha doluluğu %80–100, her çözüm adımı yol kuralıyla erişilebilir ve sonuç doğru yerleşim.
Betik proje kodu değildir; resmî doğrulama code-lead'in `levels:validate` (Faz 2) ve `levels:solve` (Faz 3, D-059) araçlarıyladır.
Revizyon turunda (Bölüm 1 üst satır düzeni, Bölüm 4 geçit boyu 2) 1–10 aynı betikle yeniden denetlendi: hepsi çözülür,
minimum hamle ve YAO değişmedi. Tutarlılık denetimi turunda (2026-10-05) betiğe iki denetim eklendi (§5 son iki madde):
(1) **✓ sonrası çözüm:** Mala'sız ve kazısız erişilebilen her durumdan çözüm vardır — Bölüm 2, 3, 4, 5, 6'daki
çıkmazlar veri değişikliğiyle kapatıldı (§4 madde 8); F-3 kapanışında (aşağıda) kazı ve saha bırakması dahil 1–10
yeniden tarandı. (2) **Z adımı koşulu:** zorunlu öğretici adımının istediği hamle, önceki adımın
tamamlanabildiği her durumda geçerli ve K-34'e uygundur (Bölüm 1, 3, 4, 6, 7, 9). 1–5 el çözümleri Faz 2'de, 6–10
el çözümleri Faz 3'te golden test olarak hamle dizisine çevrilir (`tests/golden/level_NNN.hand.json`, code-lead;
D-059, TECH §9.5).

**F-3 çıkmaz taraması (2026-10-05; karalama çözücüsü, proje kodu değil):** GDD hareket, yerçekimi, K-34 ve teslimat
kuralları (K-04/05/07/08/11/12/13/15/16/22/25/26, Y5) yeniden yazıldı; Kamyon Yardımı, Mala ve güçlendiriciler yok sayıldı.
(a) **Gevşetilmiş saha oyunu:** saha boş, her ağır olmayan blok her an alınabilir; ✓ sonrası bu oyunda bile bitmeyen durum
kazıdan bağımsız kesin çıkmazdır (malzeme/döşeme). (b) **Kazılı tam arama:** hamle bütçesi içinde ✓ yerleşimler + en çok
(çözümdeki kazı + 1) saha hamlesi (1–6'da 1: yanlışlıkla sahaya bırakma da bir kazıdır); her ✓ yerleşimden sonra kalan
bütçeyle sınırsız kazılı derin arama. Sınıflar ve ölçüt §5'tedir. Sonuç (önce → sonra; "çıkmaz" = kesin çıkmaz + verimli
oyuncu için bütçe tuzağı, kapsam içinde ✓ yerleşimle girilen ayrı durum sayısı):

| Bölüm | Min | YAO | Kapsam (saha hamlesi) | Gevşetilmiş tuzak | Çıkmaz | İsraf sonrası bütçe aşımı (sonra) |
|---|---|---|---|---|---|---|
| 1 | 3 | %100 | 1 | 0 | 0 → 0 | 0 |
| 2 | 3 | %100 | 1 | 2 → 2 (kapsamda erişilmez) | 0 → 0 | 0 |
| 3 | 3 | %67 | 1 | 0 | 0 → 0 | 0 |
| 4 | 4 | %75 | 1 | 1 → 1 (kapsamda erişilmez) | 0 → 0 | 0 |
| 5 | 6 | %100 | 1 | 2 → 0 | 36 → 0 | 0 |
| 6 | 6 | %100 | 1 | 9 → 9 (kapsamda erişilmez) | 0 → 0 | 0 |
| 7 | 7 | %100 | 3 | 4 → 0 | 110 → 0 | 5 |
| 8 | 7 | %100 | 2 | 9 → 0 | 45 → 0 | 0 |
| 9 | 8 | %88 | 1 | 19 → 0 | ≥ 166 (kazısız 5) → 0 | 5 |
| 10 (Zor) | 11 | %89 | 2 (= çözümdeki kazı; Zor, §5 ölçütü dışı) | 57 → 66 | 30 → 2 (2 kesin çıkmaz, yalnız gereksiz hamleden sonra; Zor → uyarı; Bölüm 10 notu) | 1 |

Kapsam dışı bilgi: iki gereksiz saha hamlesinden sonra Bölüm 5'te 3, Bölüm 6'da 2 kesin çıkmaz kalır. GDD K-30'un D3'süz
güvencesi yalnız yukarıdaki kapsamı (§5) kapsar; kapsam dışı bu çıkmazlar D3'süz sürümde hamle bitince +5 teklifi ya da
kayıpla sonuçlanır (D3'ün MVP'de zorunlu olup olmadığı proje sahibi sorusu). Bölüm başına
değişiklikler §4 madde 10'da ve bölüm notlarındadır. Faz 3'te aynı tarama `levels:solve --traps` ile tekrarlanır (§5; TECH §9.8, L-27); Faz 2'de
1–5 el çözümleri golden test olarak denetlenir (D-059).

**JSON eşlemesi:** Blok tablosundaki satır sırası = JSON parti-0 dizi sırası (`piece:<i>` öğretici vurgusu bu sıradır);
parti blokları `k<parti>_<indeks>` (0 tabanlı). `seed` yazılmazsa `id × 1000 + id` (GDD K-45/1). `teaches` yalnızca
veri imzası olan mekanikler için yazılır (OBSTACLES "Veri imzası"); 1, 2, 7 ve 10. bölümlerin öğretimi yalnızca
`tutorial` iledir.

**Öğretici adımları:** her blockout'un altında `tutorial[]` biçiminde (GDD §14, §14.1): `adım · Z (required) / Y (soft) ·
vurgu · el · textKey · tamam koşulu`. Metin anahtarı `tut.l{n}.{konu}`; bağlamsal bir satır öğretici adımında yeniden
kullanılırsa `tut.ctx.{konu}` (GDD §14.1 madde 1–2; tek kullanım Bölüm 4 adım 2). Metinler STORY §6'dadır (design-lead);
oyuncu metninde renk adı yok (R-08). Tamam koşulu `done` sözlüğü (sürükleme sinyali / hamle sonu olayı, süzgeçler,
`minMs`, `at`) GDD §14.1 madde 3'te, isteğe bağlı başlama koşulu `startOn` madde 5'tedir (11–38 eşlemesi §3). Sunum
(el, spot ışığı) UX_FLOWS §13'tedir; adım **sırası** buradaki el çözümüne uyar (R-01: K-34 yüzünden "önce temel") ve
zamana değil olay sırasına bağlıdır (§5).

**K-34 öğretimi:** Bölüm 4 adım 2 `tut.ctx.support` satırını yumuşak adım olarak gösterir ve `seenContextTips.support`
işaretlenir (GDD K-34 kanca 4, §14.1). Adım 2 ilk doğru yerleşimden sonra açılır; adım 1 ekrandayken yaşanan bir `support`
reddinin bağlamsal satırı kuyrukta bekler ve adım 2 aynı satırı gösterince düşer (bağlamsal satır öğretici adımı
ekrandayken gösterilmez, UX §13). Bağlamsal satır yalnızca bundan **önce** bir `support` reddi yaşayan oyuncuda
tetiklenir; tek doğal nokta Bölüm 3'tür (`f` raydan `a`'dan önce; betikle doğrulandı). Bölüm 3'ün öğretici adımları son
doğru yerleşime kadar ekranda olduğundan (adım 3 son yerleşimle biter, Faz 2 tur 1 #1) satır orada gösterilmez, bölüm
bitince kuyruktan düşer ve oyuncu onu Bölüm 4 adım 2'de görür. Bölüm 4'te lento `p` `b`'den önce ve
Bölüm 6'da `D` `C`'den önce (renk doğru, destek yok) `support` redleri yine olur; orada Dede satırı çıkmaz, geri sekme
ve eksik destek taraması (kanca 2–3) görünür.

**Bölüm süresi hedef bandı (tahmin; entrepreneur önerisi KABUL):** 1–10 = 45–75 sn; 11–30 = 75–120 sn; 31–50 = 100–180 sn.
Bot raporu ve Aşama 0 testinde `level_end.durationMs` medyanıyla ölçülür. Bandın altında kalan hikaye bölümleri Faz 3'te
§4 madde 1'deki sırayla büyütülür (önce dilim yüksekliği, sonra şaşırtma).

**Renk ve şekil açılışları** (brif §5, §6; GDD K-31, K-44):

| Hikaye bölümü | Bölümler | Renk havuzu (ilk göründüğü bölüm) | Bölüm başına en çok renk | Şekiller |
|---|---|---|---|---|
| 1 Ağaç Ev | 1–10 | W (1), Y (1), G (2), R (4) | 3 | B1, D2, O4, C3; 8'den itibaren ağır I5, Q9 |
| 2 Mahalle Fırını | 11–20 | + O, C (11) | 4 | + I3, L4, J4 |
| 3 Okul Kütüphanesi | 21–30 | + B, P (21) | 5 | + T4, S4, Z4 |
| 4 Deniz Feneri ve Köprü | 31–40 | hepsi | 5 | + I4 |
| 5 Festival Şatosu | 41–50 | hepsi | 5 | hepsi |

Renk sayısına bölümdeki **bütün** bloklar (parti 0, bütün kamyon partileri, moloz; şaşırtma ve dolgu dahil), plan
hücreleri (`?` çözülmüş rengiyle) ve Boya Kapısı renkleri girer (GDD K-31 ile aynı).

**Testere dişi:** Zor = 10, 15, 25, 35, 45, 49; Çok Zor = 20, 30, 40, 50. Her Zor/Çok Zor bölümden sonraki bölüm
"nefes" bölümüdür (hedef kazanma oranı Normal bandının üstü, %75–80). 49 → 50 istisnadır (büyük final).

**Öğretim kuralı:** Her bölüm en çok 1 yeni mekanik öğretir (GDD K-45/9). **Tanıtım bölümü** = veri imzasına göre yeni
mekaniği olan bölümdür (OBSTACLES "Veri imzası"; 3, 4, 5, 6, 8, 9, 11, 13–19, 21–24, 26–29, 31, 32, 35, 37, 38). Tanıtım
bölümü sadedir ve kombinasyon bölümünden zor hedeflenmez: hedef kazanma oranı Kolay'da ≥ %90 (bant), Normal'de
**≥ %70**, Zor'da **≥ %50**; bandın alt ucu (Normal %65, Zor %40–45) yalnız kombinasyon ve final bölümlerine verilir
(§1 tablosu buna uyar; §5 kontrol listesi). 50 bölümde 27 veri imzalı mekanik tanıtıldığı için tanıtımlar art arda
gelebilir (13–19'da yedi tanıtım: W4, Y6, G-H, W5, S4, Y2, Y7) ve her tanıtımın ardından iki ayrı pekiştirme bölümü
ayrılmaz; pekiştirme, mekaniğin sonraki kombinasyon ve final bölümlerinde yeniden kullanılmasıyla olur (hangi bölümler:
§3 engel bağımlılık dizini; Y2 yalnız 18'de kullanılır).

**YAO:** Her bölümde çözümdeki şantiye yerleştirmelerinin ≥ %60'ı duvar üstünden (GDD K-46). Geçitli bölümlerde
ray yerleşimi sayısı toplam yerleşimin %40'ını aşmayacak biçimde planlanır.

**Gösterim (blockout):** Satırlar yukarıdan aşağıya y=9…0. Saha hücrelerinde blok kimliği (aynı harf = aynı blok),
`.` boş. `D` sütunu duvardır: `#` kapalı, `=` geçit, `:` duvar üstü hava. Şantiyede 1. dilimin planı: renk kodu,
`+` = plandaki `.` (boş kalacak), `~` = plan dışı. Çapa = bloğun kutusunun sol alt köşesi (JSON `x, y`).
Kamyon partilerindeki bloklar sırayla düşer; `x` = düşeceği sol sütun (GDD K-25).

---

## 1. Zorluk eğrisi (50 bölüm özeti)

| # | Zorluk | Hamle (taslak) | Hedef kazanma (orta bot) | # | Zorluk | Hamle (taslak) | Hedef kazanma (orta bot) |
|---|---|---|---|---|---|---|---|
| 1 | Kolay | 11 | ≥ %95 | 26 | Normal (nefes) | 20 | %80 |
| 2 | Kolay | 11 | ≥ %92 | 27 | Normal | 20 | %70 |
| 3 | Kolay | 11 | ≥ %92 | 28 | Normal | 21 | %70 |
| 4 | Kolay | 12 | ≥ %90 | 29 | Normal | 19 | %70 |
| 5 | Normal | 11 | %80 | 30 | **Çok Zor** | 27 | %30 |
| 6 | Normal | 11 | %80 | 31 | Normal (nefes) | 20 | %80 |
| 7 | Normal | 12 | %75 | 32 | Normal | 20 | %70 |
| 8 | Normal | 12 | %75 | 33 | Normal | 22 | %65 |
| 9 | Normal | 13 | %70 | 34 | Normal | 22 | %65 |
| 10 | **Zor** | 14 | %45 | 35 | **Zor** | 21 | %50 |
| 11 | Normal (nefes) | 14 | %80 | 36 | Normal (nefes) | 21 | %75 |
| 12 | Normal | 16 | %70 | 37 | Normal | 21 | %70 |
| 13 | Normal | 16 | %70 | 38 | Normal | 21 | %70 |
| 14 | Normal | 15 | %70 | 39 | Normal | 25 | %65 |
| 15 | **Zor** | 16 | %50 | 40 | **Çok Zor** | 29 | %30 |
| 16 | Normal (nefes) | 15 | %80 | 41 | Normal (nefes) | 22 | %80 |
| 17 | Normal | 17 | %70 | 42 | Normal | 24 | %65 |
| 18 | Normal | 19 | %70 | 43 | Normal | 24 | %65 |
| 19 | Normal | 18 | %70 | 44 | Normal | 24 | %70 |
| 20 | **Çok Zor** | 24 | %35 | 45 | **Zor** | 27 | %45 |
| 21 | Normal (nefes) | 16 | %80 | 46 | Normal (nefes) | 27 | %75 |
| 22 | Normal | 17 | %70 | 47 | Normal | 25 | %65 |
| 23 | Normal | 17 | %70 | 48 | Normal | 28 | %65 |
| 24 | Normal | 20 | %70 | 49 | **Zor** | 30 | %45 |
| 25 | **Zor** | 22 | %45 | 50 | **Çok Zor** | 38 | %30 |

Hamle sütunu 1–10 için `el minimumu + tampon`, 11–50 için `tahmini minimum + tampon`dur. Brif §8'deki hamle sayıları
(ör. Bölüm 1: 10, Bölüm 10: 24) bu formülle yeniden hesaplandı; fark ve gerekçe §4'te.

---

## 2. Bölüm 1–10 (Hikaye Bölümü 1 — Ağaç Ev)

### Bölüm 1 — Ağaç Basamakları (Tree Steps)

| Alan | Değer |
|---|---|
| Öğretilen | Kaldır–taşı–indir (duvar üstü + düşme) |
| Zorluk / hedef kazanma | Kolay / ≥ %95 |
| Duvar | height 2; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Basamaklar (EN: Steps) `["WW", "WW", "YY"]` |
| Desen | yatay şerit |
| Renkler / şekiller | W, Y (2) / D2 |
| Saha doluluğu | 46/48 = %95,8 |
| Minimum hamle (el çözümü) | 3 |
| Hamle bütçesi | 3 + 8 = **11** |
| YAO (çözüm) | 3 duvar üstü / 3 yerleşim = **%100** |
| Öğretici | `tut.l1.lift`, `tut.l1.drop`, `tut.l1.match` (adımlar blockout'un altında) |

**Tasarım niyeti:** Oyuncu bloğu yukarı kaldırıp duvarın üstünden aşırmanın ve bırakınca düşmenin oyunun temel hareketi olduğunu keşfeder; gölgenin düşüş yerini gösterdiğini görür. İlk hedef `a` üst satırda, duvarın hemen solundadır (tek elle başparmağa en yakın yer; design-lead önerisi). `e` (yatay W) ve `h` (yatay Y) başta tutulabilir: `e` ilk hamlede "hatalı" gölge verir, `h` `a`'nın eşdeğeridir.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  d . b c a a   :   ~ ~
   y=6:  d . b c e e   :   ~ ~
   y=5:  f f g g h h   :   ~ ~
   y=4:  i j j k k l   :   ~ ~
   y=3:  i m m n n l   :   ~ ~
   y=2:  o o p p q q   :   W W
   y=1:  r s s t t u   #   W W
   y=0:  r v v w w u   #   Y Y
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `a` | `D2_90` | Y | (4,7) | hedef |
| `b` | `D2_0` | W | (2,6) | hedef |
| `c` | `D2_0` | W | (3,6) | hedef |
| `d` | `D2_0` | Y | (0,6) | şaşırtma (başta tutulabilir) |
| `e` | `D2_90` | W | (4,6) | şaşırtma (başta tutulabilir) |
| `f` | `D2_90` | Y | (0,5) | dolgu |
| `g` | `D2_90` | W | (2,5) | dolgu |
| `h` | `D2_90` | Y | (4,5) | şaşırtma (başta tutulabilir) |
| `j` | `D2_90` | Y | (1,4) | dolgu |
| `k` | `D2_90` | W | (3,4) | dolgu |
| `i` | `D2_0` | W | (0,3) | dolgu |
| `m` | `D2_90` | W | (1,3) | dolgu |
| `n` | `D2_90` | Y | (3,3) | dolgu |
| `l` | `D2_0` | Y | (5,3) | şaşırtma (başta tutulabilir) |
| `o` | `D2_90` | W | (0,2) | dolgu |
| `p` | `D2_90` | Y | (2,2) | dolgu |
| `q` | `D2_90` | W | (4,2) | şaşırtma (başta tutulabilir) |
| `s` | `D2_90` | W | (1,1) | dolgu |
| `t` | `D2_90` | Y | (3,1) | dolgu |
| `r` | `D2_0` | Y | (0,0) | dolgu |
| `v` | `D2_90` | Y | (1,0) | dolgu |
| `w` | `D2_90` | W | (3,0) | dolgu |
| `u` | `D2_0` | W | (5,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `a` (D2_90 Y) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `b` (D2_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
3. `c` (D2_0 W) (3,6)'den kaldır → duvar üstünden x=7 üstüne taşı → bırak → (7,1)'ye iner — duvar üstü, doğru

Öğretici adımları (`tutorial[]`):
1. Z · `piece:0`, `crane` · drag: `a` → duvar üstü → x=6 üstü · `tut.l1.lift` · `overWall` ×1
2. Y · `piece:0`, `build` · — · `tut.l1.drop` · `placementCorrect` ×1
3. Y · `piece:1`, `cell:6,1`, `cell:6,2` · drag: `b` → x=6 · `tut.l1.match` · `placementCorrect` ×1

Adım 2 yumuşaktır ve `a`'yı da vurgular: `overWall` bir sürükleme sinyalidir (GDD §14.1), adım 2 `a` havadayken başlar.
Oyuncu `a`'yı Vinç Alanı'nda saha üstüne ya da sınırı keserken bırakırsa (K-07 satır 3–4, iptal) `a` (4,7)'ye döner;
zorunlu adım olsaydı `a` spot ışığı dışında kalır ve oyuncu kilitlenirdi.

### Bölüm 2 — Platform (Platform)

| Alan | Değer |
|---|---|
| Öğretilen | Renk örüntüsü (çapraz şerit) + düşüş gölgesi; O4 ve C3 şekilleri |
| Zorluk / hedef kazanma | Kolay / ≥ %92 |
| Duvar | height 3; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Platform (EN: Platform) `["YY", "WY", "WW", "GG", "GG"]` (brifte 2×4; 5 satır gerekçesi §4 madde 9) |
| Desen | çapraz şerit (C3 çifti) |
| Renkler / şekiller | G, W, Y (3) / B1, C3, O4 |
| Saha doluluğu | 47/48 = %97,9 |
| Minimum hamle (el çözümü) | 3 |
| Hamle bütçesi | 3 + 8 = **11** |
| YAO (çözüm) | 3 duvar üstü / 3 yerleşim = **%100** |
| Öğretici | `tut.l2.pattern`, `tut.l2.shadow`, `tut.l1.match` (adımlar aşağıda; oyuncu metninde renk adı yok) |

**Tasarım niyeti:** Oyuncu aynı renk bölgesini doğru yönelimli bloğun doldurduğunu, ters yönelimli C3'ün (`c`, `C3_180`) gölgede "hatalı" (!) göründüğünü, doğru bloğun (`b`, `C3_0`) gölgesinin ✓ gösterdiğini keşfeder (öğretici adım 2 `c`'yi, adım 3 `b`'yi tutturur; betikle doğrulandı: 1. doğru yerleşimden sonra `c`'nin x=6 gölgesi `color` (birincil) + `support`, `b`'ninki doğru).

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  A A b . c c   :   ~ ~
   y=6:  A A b b d c   :   ~ ~
   y=5:  e e f f g g   :   ~ ~
   y=4:  e e f f g g   :   Y Y
   y=3:  h h i i j j   :   W Y
   y=2:  h h i i j j   #   W W
   y=1:  k k l l m m   #   G G
   y=0:  k k l l m m   #   G G
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `A` | `O4_0` | G | (0,6) | hedef |
| `b` | `C3_0` | W | (2,6) | hedef |
| `c` | `C3_180` | Y | (4,6) | hedef |
| `d` | `B1_0` | G | (4,6) | dolgu (G: `A` G satırlarını doldurduğu için hiçbir zaman doğru olamaz; Y iken `b`'den sonra tutulabilir olup (7,3)/(6,4)'e doğru iniyor ve kalan Y hücreleri dolamıyordu) |
| `e` | `O4_0` | Y | (0,4) | dolgu |
| `f` | `O4_0` | W | (2,4) | dolgu |
| `g` | `O4_0` | G | (4,4) | şaşırtma (başta tutulabilir) |
| `h` | `O4_0` | W | (0,2) | dolgu |
| `i` | `O4_0` | Y | (2,2) | dolgu |
| `j` | `O4_0` | G | (4,2) | dolgu |
| `k` | `O4_0` | G | (0,0) | dolgu |
| `l` | `O4_0` | W | (2,0) | dolgu |
| `m` | `O4_0` | Y | (4,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `A` (O4_0 G) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `b` (C3_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,2)'ye iner — duvar üstü, doğru
3. `c` (C3_180 Y) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

Öğretici adımları (`tutorial[]`):
1. Y · `panorama`, `build` · — · `tut.l2.pattern` · `placementCorrect` ×1
2. Y · `piece:2`, `build` · hold: `c` (4,7)'den (sol üst hücresi; `c` C3_180, çapa (4,6) `d`'nin hücresidir) x=6 üstünde (gölge "!") · `tut.l2.shadow` · `{ event: holdOverBuild, count: 1, minMs: 500 }`
3. Y · `piece:1`, `build` · drag: `b` → x=6 (gölge ✓) · `tut.l1.match` · `placementCorrect` ×1

### Bölüm 3 — Ön Duvar (Front Wall)

| Alan | Değer |
|---|---|
| Öğretilen | W1 Sabit Geçit + ray yerleştirme |
| Zorluk / hedef kazanma | Kolay / ≥ %92 |
| Duvar | height 6; geçit: y=2 boy 2 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Ön Duvar (EN: Front Wall) `["GG", "YY", "WW", "WW"]` |
| Desen | bant (W-Y-G) |
| Renkler / şekiller | G, W, Y (3) / D2, O4 |
| Saha doluluğu | 48/48 = %100,0 |
| Minimum hamle (el çözümü) | 3 |
| Hamle bütçesi | 3 + 8 = **11** |
| YAO (çözüm) | 2 duvar üstü / 3 yerleşim = **%67** |
| Öğretici | `tut.l1.match`, `tut.l3.gap`, `tut.l3.rail` (adımlar aşağıda; önce temel, K-34) |

**Tasarım niyeti:** Oyuncu sahanın derinindeki bloğun geçitten tek hamlede şantiyeye girdiğini ve raydaki bloğun düşmediğini keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  a a b b c d   :   ~ ~
   y=6:  a a e e c d   :   ~ ~
   y=5:  g g h h i i   #   ~ ~
   y=4:  g g h h i i   #   ~ ~
   y=3:  j j k k l l   =   G G
   y=2:  j j k k f f   =   Y Y
   y=1:  m m n n o o   #   W W
   y=0:  m m n n o o   #   W W
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `a` | `O4_0` | W | (0,6) | hedef |
| `f` | `D2_90` | Y | (4,2) | hedef |
| `b` | `D2_90` | G | (2,7) | hedef |
| `e` | `D2_90` | G | (2,6) | dolgu |
| `c` | `D2_0` | Y | (4,6) | şaşırtma (başta tutulabilir) |
| `d` | `D2_0` | G | (5,6) | şaşırtma (başta tutulabilir) |
| `g` | `O4_0` | G | (0,4) | dolgu |
| `h` | `O4_0` | W | (2,4) | dolgu |
| `i` | `O4_0` | G | (4,4) | dolgu |
| `l` | `D2_90` | G | (4,3) | şaşırtma (başta tutulabilir) |
| `j` | `O4_0` | Y | (0,2) | dolgu |
| `k` | `O4_0` | W | (2,2) | dolgu |
| `m` | `O4_0` | W | (0,0) | dolgu |
| `n` | `O4_0` | G | (2,0) | dolgu |
| `o` | `O4_0` | Y | (4,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `a` (O4_0 W) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `f` (D2_90 Y) (4,2)'den sağa → geçitten raya → (6,2)'de bırak — ray, doğru
3. `b` (D2_90 G) (2,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

K-34 notu: `f` `a`'dan önce raya konursa (6–7, 0–1) boş kaldığı için hatalıdır (betikle doğrulandı); öğretici bu yüzden
temelle başlar.

Çıkmaz notu (tutarlılık denetimi): üst satır önceden `WW`, `b` W idi; `b` ilk hamlede (6,0)'a ✓ iniyor, kalan W'lerin
hepsi `O4` olduğu için y1 dolamıyordu. Üst satır `GG` ve `b` G yapıldı: `b`, `e` ve rayla `l` yalnızca y3'te doğrudur,
y0–y1'i yalnızca `O4` W doldurur. Betik: min 3, YAO %67 (en iyi), çıkmaz yok; renkler G/W/Y aynı.

Öğretici adımları (`tutorial[]`):
1. Y · `piece:0`, `cell:6,0`, `cell:7,1` · drag: `a` → x=6 · `tut.l1.match` · `placementCorrect` ×1
2. Z · `gap:0`, `piece:1` · drag: `f` sağa, geçitten · `tut.l3.gap` · `placementCorrect` ×1
3. Y · `piece:1` · tap · `tut.l3.rail` · `placementCorrect` ×1

Adım 2, `f` rayda (6,2)'ye doğru yerleşince biter; adım 3 o anda açılır, raydaki `f`'yi gösterir ("Sıradakini üstünden
aşır") ve sıradaki doğru yerleşimle biter: `b` (ya da eşdeğeri `e`) duvar üstünden (6,3)'e (el çözümü 3. hamle) ya da
`l` raydan (6,3)'e. Metin böylece `b` hamlesi boyunca ekranda kalır (Faz 2 tur 1 #1). Önceki veride adım 2 `gapPass` ×1
idi: adım 3 sürükleme ortasında başlayıp aynı sürüklemenin bırakılmasıyla (`f`'nin ray yerleşimi) ≈ 0,4 sn'de bitiyordu.
Adım 3'e `startOn: { event: placementCorrect }` eklemek de metni `b` hamlesine taşır, ama `gapPass` ile bırakma arasında
(parmak hâlâ bloktayken) ekranda adım kalmaz; bırakma iptal edilir ya da `f` yanlış satıra (6,3) konup geri sekerse
oyuncu adım 3 açılana kadar yönlendirmesiz kalır. `placementCorrect` ile Z adımı `f` rayda doğru yerleşene kadar sürer;
iptal ya da geri sekmede `f` başlangıç hücresine, spot ışığının içine döner (K-17 adım 1; §5 "Z adımı kilitlemez"). y=2 (`YY`) satırını yalnız `f`
doldurabildiği için `a`'dan sonraki ilk doğru yerleşim her zaman `f`'nindir; Z adımında spot dışı dokunuş geçmediği
için `f` geçitten gelir. Betik (gerçek çekirdek + `TutorialController`, ✓ yerleşimler + ≤ 2 saha hamlesi, 852 kazanan
sıra): her sırada 3 adım da gösterilir, hiçbiri atlanmaz, adım 3 bir sonraki hamlenin başında ekrandadır, kazanınca
açık adım kalmaz.

### Bölüm 4 — Pencere (The Window)

| Alan | Değer |
|---|---|
| Öğretilen | S2 Plan Boşluğu (üstü geçitten) |
| Zorluk / hedef kazanma | Kolay / ≥ %90 |
| Duvar | height 6; geçit: y=3 boy **2** (static; R-21, brifte boy 1) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Ön Cephe (EN: Front Facade) `["RR", "WW", "W.", "WW", "YY"]` |
| Desen | pencereli cephe |
| Renkler / şekiller | R, W, Y (3) / C3, D2, O4 |
| Saha doluluğu | 47/48 = %97,9 |
| Minimum hamle (el çözümü) | 4 |
| Hamle bütçesi | 4 + 8 = **12** |
| YAO (çözüm) | 3 duvar üstü / 4 yerleşim = **%75** |
| Öğretici | `tut.l4.window`, `tut.ctx.support`, `tut.l4.above` (adımlar aşağıda) |

**Tasarım niyeti:** Oyuncu pencerenin üstünü tek genişlikteki blokla dolduramayacağını, geçitten gelen yatay lentonun pencerenin üstünde asılı kaldığını keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  a a b . d d   :   ~ ~
   y=6:  e e b b g g   :   ~ ~
   y=5:  h h i i j j   #   ~ ~
   y=4:  h h i i j j   =   R R
   y=3:  k k l l p p   =   W W
   y=2:  k k l l q q   #   W +
   y=1:  r r s s u u   #   W W
   y=0:  r r s s u u   #   Y Y
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `a` | `D2_90` | Y | (0,7) | hedef |
| `b` | `C3_0` | W | (2,6) | hedef |
| `p` | `D2_90` | W | (4,3) | hedef |
| `d` | `D2_90` | R | (4,7) | hedef |
| `e` | `D2_90` | R | (0,6) | dolgu |
| `g` | `D2_90` | Y | (4,6) | şaşırtma (başta tutulabilir) |
| `h` | `O4_0` | W | (0,4) | dolgu |
| `i` | `O4_0` | R | (2,4) | dolgu |
| `j` | `O4_0` | Y | (4,4) | dolgu |
| `k` | `O4_0` | Y | (0,2) | dolgu |
| `l` | `O4_0` | W | (2,2) | dolgu |
| `q` | `D2_90` | R | (4,2) | dolgu |
| `r` | `O4_0` | R | (0,0) | dolgu |
| `s` | `O4_0` | Y | (2,0) | dolgu |
| `u` | `O4_0` | W | (4,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `a` (D2_90 Y) (0,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `b` (C3_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'e iner, hücreler (6,1),(7,1),(6,2);
   (7,2) `.` boş kalır — duvar üstü, doğru
3. `p` (D2_90 W) (4,3)'den sağa → geçitten raya → (6,3)'de bırak — ray, doğru
4. `d` (D2_90 R) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru

Geçit boyu 2 (R-21): W3'ün veri imzası (`size = 1`) ilk kez Bölüm 9'da görünür, K-45/9 istisnasız kalır. Satır 3–4
geçidinden yeni kısa yol çıkmaz: tek sıralık R bloğu satır 4'e ulaşamaz (`j` kapatır), 2 sıralık bloklar renk karışık
satırlara (W/R) uymaz (betikle doğrulandı). K-34 notu: `p` `b`'den önce raya konursa (6,1),(7,1),(6,2) boş kaldığı için
hatalıdır — pencerenin üstündeki lento, altındaki duvar bitince konur.

Çıkmaz notu (tutarlılık denetimi): önceki sürümde `b` (`D2_0` W (2,6)), `c` (`B1_0` W (3,7)) ve `f` (`B1_0` W (3,6))
vardı. İki `B1` sütun 6'ya konunca (7,1) doldurulamıyordu; biri (6,3)'e konunca lentonun tek yolu (ray) kapanıyor, (7,3)
yalnızca 4'lü seriden gelen Altın Mala ile dolabiliyordu (betik: 13 çıkmaz durum). Üçü tek `C3_0` W ile değiştirildi;
(3,7) boş kaldı. Betik: min 4, YAO %75, Mala'sız ve kazısız erişilebilen çıkmaz yok; her 2 doğru yerleşimden sonra
`p`'nin ray yerleşimi geçerli ve K-34'e uygun (adım 3'ün Z koşulu, §5). `g` (`D2_90` Y) `a`'nın eşdeğeridir.

Öğretici adımları (`tutorial[]`):
1. Y · `cell:7,2` · tap · `tut.l4.window` · `placementCorrect` ×1
2. Y · `front` (inşa cephesi, GDD K-34 kanca 1) · — · `tut.ctx.support` · `placementCorrect` ×1
3. Z · `gap:0`, `piece:2`, `cell:6,3`, `cell:7,3` · drag: `p` sağa, geçitten · `tut.l4.above` · `gapPass` ×1

Adım 2 bağlamsal satırı yeniden kullanır; gösterildiği anda `seenContextTips.support` işaretlenir (GDD §14.1, K-34 kanca 4).

Adım sırası zamandan bağımsızdır (Faz 2 tur 1 #0; GDD §14.1 madde 4a): adım 1 ilk doğru yerleşimle, adım 2 ikinci doğru
yerleşimle biter. K-34 yüzünden ilk doğru yerleşim her zaman (6,0)'dadır (`a` ya da eşdeğeri `g`), ikincisi her zaman
(6,1) çapasındadır (`b`: `W.` pencere satırını yalnız `C3_0` doldurur; `p` rayda (6,3)'e `b`'den önce destek reddi
alır); böylece adım 3 `b`'den hemen sonra, `p` sahadayken açılır. Önceki veride adım 1 `timeoutMs` 2500 ve adım 2
`placementCorrect` ×2 idi: `a` 2,5 sn dolmadan yerleşirse adım 2 `b` ile `p`'yi sayıyor, adım 3 `p` kilitliyken
başlayıp kilit güvencesiyle atlanıyordu (golden çözüm de dersi atlıyordu). Yalnız adım 2'ye `at: [6, 1]` eklemek
yetmez: `a` ve `b` 2,5 sn içinde biterse adım 2 hiç bitmez, bölüm sonuna kadar ekranda kalır ve adım 3 yine görünmez.
Betik (gerçek çekirdek + `TutorialController`, ✓ yerleşimler + ≤ 1 saha hamlesi, 159 kazanan sıra): her sırada 3 adım
da gösterilir, adım 3 atlanmaz, kazanınca açık adım kalmaz. ≤ 2 saha hamlesinde 3.975 sıranın 4'ünde adım 3 kilit
güvencesiyle atlanır: dördünde de `b`'den sonra `i` ve `j` kazılır, `p` duvar üstünden (6,3)'e konur. Betik Z adımının
dokunuş kısıtını (yalnız spot ışığı, UX §13.1) uygulamaz; bu sıralar LEVELS §5 kapsamı (✓ + 1 saha hamlesi) dışındadır
ve atlama güvencenin tasarlanan davranışıdır.

### Bölüm 5 — İki Odalı Ev (Two-Room House)

| Alan | Değer |
|---|---|
| Öğretilen | S1 Kayan Şantiye + kamyon teslimatı |
| Zorluk / hedef kazanma | Normal / %80 |
| Duvar | height 4; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Sol Oda (EN: Left Room) `["RR", "WW", "WW", "GG"]` → 2. Sağ Oda (EN: Right Room) `["RR", "GG", "WG", "WW"]` |
| Desen | yatay şerit → çapraz şerit |
| Renkler / şekiller | G, R, W (3) / C3, D2, O4 |
| Saha doluluğu | 46/48 = %95,8 |
| Minimum hamle (el çözümü) | 6 |
| Hamle bütçesi | 6 + 5 = **11** |
| YAO (çözüm) | 6 duvar üstü / 6 yerleşim = **%100** |
| Öğretici | `tut.l5.segments`, `tut.l5.truck` (adımlar aşağıda) |

**Tasarım niyeti:** Oyuncu bir dilim bitince şantiyenin kaydığını ve kamyonun yeni malzemeyi sahanın boşalan yerlerine döktüğünü keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  a a . . c c   :   ~ ~
   y=6:  a a b b d d   :   ~ ~
   y=5:  e e f f g g   :   ~ ~
   y=4:  e e f f g g   :   ~ ~
   y=3:  h h i i j j   #   R R
   y=2:  h h i i j j   #   W W
   y=1:  k k l l m m   #   W W
   y=0:  k k l l m m   #   G G
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `c` | `D2_90` | R | (4,7) | hedef |
| `a` | `O4_0` | W | (0,6) | hedef |
| `b` | `D2_90` | G | (2,6) | hedef |
| `d` | `D2_90` | R | (4,6) | şaşırtma (başta tutulabilir; yalnızca y3'te doğru, `c`'nin eşdeğeri) |
| `e` | `O4_0` | G | (0,4) | dolgu |
| `f` | `O4_0` | R | (2,4) | dolgu |
| `g` | `O4_0` | R | (4,4) | şaşırtma (başta tutulabilir; hiçbir yerde doğru değil) |
| `h` | `O4_0` | R | (0,2) | dolgu |
| `i` | `O4_0` | G | (2,2) | dolgu |
| `j` | `O4_0` | W | (4,2) | dolgu |
| `k` | `O4_0` | W | (0,0) | dolgu |
| `l` | `O4_0` | R | (2,0) | dolgu |
| `m` | `O4_0` | G | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `D2_0` R x=2, `D2_90` R x=4, `C3_0` W x=0, `C3_180` G x=2

Çözüm (hamle hamle, doğrulandı):

1. `b` (D2_90 G) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `a` (O4_0 W) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
3. `c` (D2_90 R) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer: `k1_0` (2,6), `k1_1` (4,7), `k1_2` (0,6); `k1_3` (C3_180 G)
     sığmaz, kuyrukta bekler ("Kamyonda: 1", K-26).
4. `k1_2` (C3_0 W) (0,6)'dan kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'a iner — duvar üstü, doğru;
   açılan yere aynı hamlenin 9. adımında `k1_3` (C3_180 G) (0,6)'ya iner
5. `k1_3` (C3_180 G) (0,6)'dan kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'e iner — duvar üstü, doğru
6. `k1_1` (D2_90 R) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'e iner — duvar üstü, doğru

Çıkmaz notu (tutarlılık denetimi): önceki sürümde `d` `D2_90` W, `g` `O4_0` W ve parti 1'in ilk bloğu `B1_0` R idi.
`d` (6,1)'e ✓ iniyor ve y2 `WW` için tek sıralık W kalmıyordu; `g` `a`'nın yerine kullanılınca `a` (0,6)'da kalıp
parti 1'in yerleşimini bozuyor (kazı gerekiyordu); `k1_0` (B1 R) dilim 2'de (6,3)/(7,3)'e konunca kalan R hücresine
sığan blok yoktu. Renkler G/R/W kaldı.

**Çıkmaz denetimi (F-3, 2026-10-05):** kazısız erişimde çıkmaz yoktu, ama tek bir saha bırakması (kazı ya da yanlışlıkla
sahaya bırakma, K-07 satır 2; 7. bölümden önce de mümkündür) sonrası 36 kesin çıkmaz vardı: şaşırtma `k1_0` (`B1_0` W)
döküm değişince erişilebilir olup y0'a tek başına ✓ iniyor (30 durum) ya da döküm `C3_0` W'yi gömüyordu (6 durum).
Düzeltme: `k1_0` → `D2_0` R (dilim 2'de hiçbir yerde doğru olamaz) ve `D2_90` R partide 2. sıraya alındı; `C3_180` G
normal oyunda bir hamle kuyrukta bekler (`deliveryDone` partiden ilk blok düşünce gelir, öğretici adımı değişmez).
Sonrası: gevşetilmiş saha oyununda 0 tuzak; 1 saha bırakmasına kadar kesin çıkmaz 0, bütçe tuzağı 0 (2 bırakmada 3
kesin çıkmaz ve 1 bütçe aşımı kalır, ikisi de iki gereksiz hamle ister; §5 kapsamı dışında, GDD K-30). Min 6, YAO %100, bütçe 11 değişmedi.

Öğretici adımları (`tutorial[]`):
1. Y · `panorama` · — · `tut.l5.segments` · `segmentDone` ×1
2. Y · `truck` · — · `tut.l5.truck` · `deliveryDone` ×1

### Bölüm 6 — Uzun Gövde (Tall Trunk)

| Alan | Değer |
|---|---|
| Öğretilen | W2 Yüksek Duvar (Vinç Alanı'na kaldırma) |
| Zorluk / hedef kazanma | Normal / %80 |
| Duvar | height 8; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Uzun Gövde (EN: Tall Trunk) `["WW", "YW", "YY", "GG", "WW", "WW", "GG"]` |
| Desen | yatay şerit + çapraz şerit |
| Renkler / şekiller | G, W, Y (3) / B1, C3, D2, O4 |
| Saha doluluğu | 47/48 = %97,9 |
| Minimum hamle (el çözümü) | 6 |
| Hamle bütçesi | 6 + 5 = **11** |
| YAO (çözüm) | 6 duvar üstü / 6 yerleşim = **%100** |
| Öğretici | `tut.l6.crane` (adım aşağıda) |

**Tasarım niyeti:** Oyuncu duvar tahtanın tepesine kadar yükselince bloğu Vinç Alanı'na kaldırması gerektiğini ve uzun düşüşü keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  A A B C E .   #   ~ ~
   y=6:  D D B C E E   #   W W
   y=5:  f f g g F F   #   Y W
   y=4:  f f g g h F   #   Y Y
   y=3:  i i j j k k   #   G G
   y=2:  i i j j k k   #   W W
   y=1:  l l m m n n   #   W W
   y=0:  l l m m n n   #   G G
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `A` | `D2_90` | G | (0,7) | hedef |
| `D` | `D2_90` | G | (0,6) | hedef |
| `B` | `D2_0` | W | (2,6) | hedef |
| `C` | `D2_0` | W | (3,6) | hedef |
| `E` | `C3_0` | Y | (4,6) | hedef |
| `f` | `O4_0` | Y | (0,4) | dolgu |
| `g` | `O4_0` | W | (2,4) | dolgu |
| `F` | `C3_180` | W | (4,4) | hedef |
| `h` | `B1_0` | G | (4,4) | dolgu |
| `i` | `O4_0` | W | (0,2) | dolgu |
| `j` | `O4_0` | G | (2,2) | dolgu |
| `k` | `O4_0` | Y | (4,2) | dolgu |
| `l` | `O4_0` | G | (0,0) | dolgu |
| `m` | `O4_0` | Y | (2,0) | dolgu |
| `n` | `O4_0` | W | (4,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `A` (D2_90 G) (0,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `B` (D2_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
3. `C` (D2_0 W) (3,6)'den kaldır → duvar üstünden x=7 üstüne taşı → bırak → (7,1)'ye iner — duvar üstü, doğru
4. `D` (D2_90 G) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru
5. `E` (C3_0 Y) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru
6. `F` (C3_180 W) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,5)'ye iner — duvar üstü, doğru

K-34 notu: `D` `C`'den önce bırakılırsa (6,3)–(7,3)'e iner, renk doğru ama (7,1)–(7,2) boş → hatalı (`support`): geri
sekme ve eksik destek taraması (GDD K-34 kanca 2–3) burada da görünür. Bağlamsal `tut.ctx.support` satırı burada
**çıkmaz**: her oyuncu onu Bölüm 4 adım 2'de görmüş ve `seenContextTips.support` işaretlenmiştir (GDD K-34 kanca 4).

Çıkmaz notu (tutarlılık denetimi): önceki sürümde `E` `C3_0` W, `F` `C3_180` Y ve üst satırlar `YY`/`WY`/`WW` idi; `E`
`A`'dan sonra (6,1),(7,1),(6,2)'ye ✓ iniyor, (7,2) için 1×1 W olmadığından çıkmaz oluyordu. `E` ile `F`'nin renkleri ve
üç üst plan satırı yer değiştirdi (y4 `YY`, y5 `YW`, y6 `WW`): `E` (Y) alt W bölgesinde hiçbir zaman doğru olmaz, `F` (W)
alt bölgede K-34 ya da renk yüzünden hatalıdır. Renk ve hücre sayıları aynı (G 4, W 7, Y 3); betik: min 6, YAO %100,
çıkmaz yok; kaldırma ölçümü (§4 madde 7) değişmedi. Bölüm 1'in bütün
blokları 2 satır boyundadır, bu yüzden Vinç Alanı yükseklik sınırı (K-05) 6'da sınanmaz; uzun blok ipucu (design-lead
önerisi) ilk uzun bloğun yüksek duvarla buluştuğu yerde bağlamsal `tut.ctx.tootall` olarak verilir (GDD K-05; I3/L4
2. hikaye bölümünde açılır).

Öğretici adımları (`tutorial[]`):
1. Z · `piece:0`, `crane`, `wall` · drag: `A` → y ≥ 8 → x=6 · `tut.l6.crane` · `overWall` ×1

### Bölüm 7 — Çatı Altı (Under the Roof)

| Alan | Değer |
|---|---|
| Öğretilen | Kazı: sahada yeniden konumlandırma (K-10) |
| Zorluk / hedef kazanma | Normal / %75 |
| Duvar | height 5; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Kiriş (EN: Beam) `["RR", "RR", "WW", "WW"]` → 2. Saçak (EN: Eaves) `["GG", "RR", "WR", "WW"]` |
| Desen | bant → çapraz şerit |
| Renkler / şekiller | G, R, W (3) / B1, C3, D2, O4 |
| Saha doluluğu | 44/48 = %91,7 |
| Minimum hamle (el çözümü) | 7 |
| Hamle bütçesi | 7 + 5 = **12** |
| YAO (çözüm) | 5 duvar üstü / 5 yerleşim = **%100** |
| Öğretici | `tut.l7.dig`, `tut.l7.free` (adımlar aşağıda) |

**Tasarım niyeti:** Oyuncu gerekli bloğun üstündekini sahada boş bir yere taşımanın (kazı) bir hamleye değdiğini keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  . . b b c c   :   ~ ~
   y=6:  . . b b c c   :   ~ ~
   y=5:  e e f f g g   :   ~ ~
   y=4:  e e f f g g   #   ~ ~
   y=3:  h h i i j j   #   R R
   y=2:  h h i i j j   #   R R
   y=1:  k k l l m m   #   W W
   y=0:  k k l l m m   #   W W
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `b` | `O4_0` | R | (2,6) | hedef |
| `c` | `O4_0` | G | (4,6) | şaşırtma (başta tutulabilir) |
| `e` | `O4_0` | G | (0,4) | şaşırtma (başta tutulabilir) |
| `f` | `O4_0` | W | (2,4) | hedef |
| `g` | `O4_0` | G | (4,4) | dolgu |
| `h` | `O4_0` | R | (0,2) | dolgu |
| `i` | `O4_0` | G | (2,2) | dolgu |
| `j` | `O4_0` | W | (4,2) | dolgu |
| `k` | `O4_0` | W | (0,0) | dolgu |
| `l` | `O4_0` | R | (2,0) | dolgu |
| `m` | `O4_0` | G | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `B1_0` G x=2, `C3_180` R x=2, `B1_0` G x=3, `D2_90` G x=0, `C3_0` W x=2

Çözüm (hamle hamle, doğrulandı):

1. `b` (O4_0 R) sahada (2,6) → (0,6) — kazı
2. `f` (O4_0 W) (2,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
3. `b` (O4_0 R) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,2)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer: `k1_0` (2,4), `k1_1` (2,4), `k1_2` (3,6), `k1_3` (0,6);
     `k1_4` (C3_0 W) sığmaz, kuyrukta kalır ("Kamyonda: 1", K-26).
4. `k1_2` (B1_0 G) sahada (3,6) → (1,7) — kazı; aynı hamlenin 9. adımında `k1_4` (C3_0 W) (2,6)'ya iner
5. `k1_4` (C3_0 W) (2,6)'dan kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'a iner — duvar üstü, doğru
6. `k1_1` (C3_180 R) (2,4)'ten kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'e iner — duvar üstü, doğru
7. `k1_3` (D2_90 G) (0,6)'dan kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'e iner — duvar üstü, doğru

Öğretici adımları (`tutorial[]`):
1. Z · `piece:0`, `piece:3`, `cell:0,6` · drag: `b` → (0,6) · `tut.l7.dig` · `{ event: yardMove, count: 1, at: [0, 6] }`
2. Y · `piece:3` · tap · `tut.l7.free` · `timeoutMs` 2000

Adım 1'in tamam koşulu hedef çapaya bağlıdır (GDD §14.1 `at`): `b` bir sütun sola, (1,6)'ya bırakılırsa da `yardMove`
gelir ama `f`'in üstü (2,6) dolu kalır ve `f` tutulamaz (betikle doğrulandı); adım sürer, `b` (0,6)'ya taşınınca biter.
Böylece adım 2'nin "Artık alabilirsin" satırı yalnızca `f` gerçekten tutulabilirken çıkar.

**Çıkmaz denetimi (F-3, 2026-10-05) — KAPANDI.** Kazılı tam arama (§0 doğrulama notu; çözümdeki 2 kazı + 1 fazla
kazıya kadar) eski veride ✓ yerleşimden sonra 110 kesin çıkmaz durum buldu: (a) dilim 2'de şaşırtma `k1_0` (`B1_0` R)
(6,2)/(7,1)'e, `k1_3` (`B1_0` G) y3'e ✓ iniyor, kalan tek R/G hücresine blok kalmıyordu (kazıyla erişilebiliyorlardı;
104 durum); (b) gereksiz bir kazıdan sonra dilim 1'i bitiren ✓ yerleşimde kamyon dökümü `C3_0` W'yi açılan çukura
gömüyor, dökümden sonra sahada 2 boş hücre kaldığı için kazı imkânsızlaşıyordu (6 durum; D1/D2/D3 yakalamaz).
Düzeltme: `k1_0` R → G (iki `B1_0` G y3'ü birlikte doldurur, tek başına kalamaz) ve `C3_0` W partinin sonuna alındı:
ilk gereken blok en son gelir, normal oyunda kuyrukta bekler ve 4. hamledeki kazı ona yer açar ("kazı kamyona yer
açar" pekiştirmesi). Sonrası: kesin çıkmaz 0, verimli oyuncu için bütçe tuzağı 0; yalnızca gereksiz kazılardan sonra
bütçeyi aşan 5 durum kalır (çözüm vardır; tampon israfla bitmiştir, +5 teklifi yolu açık). Min 7, YAO %100, bütçe 12,
renkler ve öğretici değişmedi.

### Bölüm 8 — Bahçe Çiti (Garden Fence)

| Alan | Değer |
|---|---|
| Öğretilen | Y5 Ağır Malzeme + Çekiç açılır |
| Zorluk / hedef kazanma | Normal / %75 |
| Duvar | height 5; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Çit 1 (EN: Fence 1) `["GG", "W.", "WW", "GG"]` → 2. Çit 2 (EN: Fence 2) `["GG", ".W", "WW", "GG"]` |
| Desen | çit (iki yeşil kuşak arasında pencereli tahta), ayna dilim |
| Renkler / şekiller | G, W, Y (3) / B1, C3, D2, O4, Q9 |
| Saha doluluğu | 39/48 = %81,2 |
| Minimum hamle (el çözümü) | 7 |
| Hamle bütçesi | 7 + 5 = **12** |
| YAO (çözüm) | 6 duvar üstü / 6 yerleşim = **%100** |
| Öğretici | `tut.l8.heavy`, `tut.l8.hammer` (adımlar aşağıda; Çekiç 3 ücretsiz deneme) |

**Tasarım niyeti:** Oyuncu ağır paletin duvarı geçemediğini, yer açılınca kenara çekilebileceğini ya da Çekiç'le kırılabileceğini keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  . . . Q Q Q   :   ~ ~
   y=6:  . . . Q Q Q   :   ~ ~
   y=5:  . . . Q Q Q   :   ~ ~
   y=4:  a a b C G G   #   ~ ~
   y=3:  c c d C C e   #   G G
   y=2:  c c d w w e   #   W +
   y=1:  f f g g h h   #   W W
   y=0:  f f g g h h   #   G G
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `Q` | `Q9_0` | W | (3,5) | şaşırtma (başta tutulabilir), ağır |
| `a` | `D2_90` | Y | (0,4) | şaşırtma (başta tutulabilir) |
| `b` | `B1_0` | Y | (2,4) | şaşırtma (başta tutulabilir; planda Y yok, hiçbir yerde doğru değil) |
| `G` | `D2_90` | G | (4,4) | hedef |
| `C` | `C3_0` | W | (3,3) | hedef |
| `c` | `O4_0` | Y | (0,2) | dolgu |
| `d` | `D2_0` | Y | (2,2) | dolgu |
| `w` | `D2_90` | G | (3,2) | hedef |
| `e` | `D2_0` | G | (5,2) | dolgu |
| `f` | `O4_0` | G | (0,0) | dolgu |
| `g` | `O4_0` | W | (2,0) | dolgu |
| `h` | `O4_0` | Y | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `B1_0` Y x=5, `D2_90` G x=3, `C3_270` W x=3, `D2_90` G x=4

Çözüm (hamle hamle, doğrulandı):

1. `Q` (Q9_0 W) sahada (3,5) → (0,5) — kazı
2. `G` (D2_90 G) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
3. `C` (C3_0 W) (3,3)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
4. `w` (D2_90 G) (3,2)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
5. `k1_3` (D2_90 G) (4,5)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
6. `k1_2` (C3_270 W) (3,3)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
7. `k1_1` (D2_90 G) (3,2)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

Öğretici adımları (`tutorial[]`; Çekiç adımı **yumuşak**tır: tasarım niyeti "kenara çek ya da kır" iki yolu da açık
tutar; zorunlu Çekiç kazı dersini siler):
1. Y · `piece:0` · tap · `tut.l8.heavy` · `timeoutMs` 2500
2. Y · `booster:hammer`, `piece:0` · tap yuva, tap `Q` · `tut.l8.hammer` · `timeoutMs` 4000

**Çıkmaz denetimi (F-3, 2026-10-05) — KAPANDI.** Kazılı tam arama (§0; çözümdeki 1 kazı + 1 fazla kazıya kadar) eski
veride ✓ yerleşimden sonra 45 kesin çıkmaz buldu: (a) `b` (`B1_0` G) y0'a tek başına ✓ iniyor, öbür G hücresine 1
genişlikte G kalmıyordu; (b) `w` ya da `k1_1` (`D2_90` W) y1'e ✓ iniyor, pencerenin yanındaki tek W hücresi ve üst
satır için blok kalmıyordu (C3 yalnız y1'e oturur); (c) `d` (`D2_0` W) dikey ✓ iniyor, yanındaki tek W hücresi
dolamıyordu. Düzeltme: iki dilimin üst satırı `WW` → `GG`; `w` ve `k1_1` W → G; `b`, `d`, `k1_0` → Y (planda Y yok,
hiçbir yerde doğru olamaz). W bölgesi artık tam olarak bir C3'tür (`C` / `k1_2`), G satırları tam satırlık `D2_90` ile
dolar. Renk kümesi (G, W, Y), şekiller, blok düzeni, el çözümünün hamleleri ve öğretici aynı. Sonrası: gevşetilmiş
saha oyununda 0 tuzak; kesin çıkmaz 0, bütçe tuzağı 0. Min 7, YAO %100, bütçe 12.

### Bölüm 9 — İp Merdiven (Rope Ladder)

| Alan | Değer |
|---|---|
| Öğretilen | W3 Dar Geçit |
| Zorluk / hedef kazanma | Normal / %70 |
| Duvar | height 6; geçit: y=3 boy 1 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Halat (EN: Rope) `["GG", "GG", "YY", "..", "WW", "WW"]` → 2. Basamaklar (EN: Rungs) `["WW", "W.", "GG", "G.", "YY"]` |
| Desen | asılı basamak + pencereli şerit |
| Renkler / şekiller | G, W, Y (3) / B1, C3, D2, O4 |
| Saha doluluğu | 44/48 = %91,7 |
| Minimum hamle (el çözümü) | 8 |
| Hamle bütçesi | 8 + 5 = **13** |
| YAO (çözüm) | 7 duvar üstü / 8 yerleşim = **%88** |
| Öğretici | `tut.l1.match`, `tut.l9.narrow` (adımlar aşağıda; önce temel, K-34) |

**Tasarım niyeti:** Oyuncu dar geçide yalnızca tek sıra boyundaki blokların girdiğini ve asılı basamağın yalnızca raydan kurulabildiğini keşfeder.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  G G x x W W   :   ~ ~
   y=6:  G G z z W W   :   ~ ~
   y=5:  f f g g Y Y   #   G G
   y=4:  f f D D . .   #   G G
   y=3:  i i j D . .   =   Y Y
   y=2:  i i j j l l   #   + +
   y=1:  n n o o p p   #   W W
   y=0:  n n o o p p   #   W W
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `x` | `D2_90` | G | (2,7) | şaşırtma (başta tutulabilir) |
| `G` | `O4_0` | G | (0,6) | hedef |
| `z` | `D2_90` | Y | (2,6) | dolgu |
| `W` | `O4_0` | W | (4,6) | hedef |
| `g` | `D2_90` | G | (2,5) | dolgu |
| `Y` | `D2_90` | Y | (4,5) | hedef |
| `f` | `O4_0` | Y | (0,4) | dolgu |
| `D` | `C3_180` | Y | (2,3) | şaşırtma (başta tutulabilir; 2 sıra, dar geçide sığmaz; hiçbir yerde doğru değil) |
| `i` | `O4_0` | W | (0,2) | dolgu |
| `j` | `C3_0` | Y | (2,2) | dolgu (hiçbir yerde doğru değil) |
| `l` | `D2_90` | Y | (4,2) | şaşırtma (başta tutulabilir; `W`'den önce hatalı, sonra raydan basamak olarak `Y`'nin eşdeğeri) |
| `n` | `O4_0` | G | (0,0) | dolgu |
| `o` | `O4_0` | Y | (2,0) | dolgu |
| `p` | `O4_0` | W | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `D2_0` Y x=0, `D2_0` Y x=1, `D2_90` W x=4, `B1_0` W x=4, `D2_90` G x=4, `B1_0` G x=5, `D2_90` Y x=4

Çözüm (hamle hamle, doğrulandı):

1. `W` (O4_0 W) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `Y` (D2_90 Y) (4,5)'den sağa → geçitten raya → (6,3)'de bırak — ray, doğru
3. `G` (O4_0 G) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
4. `k1_6` (D2_90 Y) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'a iner — duvar üstü, doğru
5. `k1_5` (B1_0 G) (5,6)'dan kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'e iner — duvar üstü, doğru
6. `k1_4` (D2_90 G) (4,5)'ten kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,2)'ye iner — duvar üstü, doğru
7. `k1_3` (B1_0 W) (4,4)'ten kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'e iner — duvar üstü, doğru
8. `k1_2` (D2_90 W) (4,3)'ten kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'e iner — duvar üstü, doğru

Öğretici adımları (`tutorial[]`; `D` (C3_180, 2 sıra) geçide itilirse yapışkan takip geçit ağzında durur — dersin
"sığmaz" yarısı budur):
1. Y · `piece:3`, `build` · drag: `W` → x=6 · `tut.l1.match` · `placementCorrect` ×1
2. Z · `gap:0`, `piece:5` · drag: `Y` sağa, dar geçitten · `tut.l9.narrow` · `gapPass` ×1

Z adımı koşulu (§5) betikle doğrulandı: adım 1'in tamamlanabildiği her kazısız durumda (`W` ya da başka bir doğru
yerleşim (6,0)'a) `Y` dar geçide girebilir ve (6,3) ray yerleşimi doğrudur.

**Çıkmaz denetimi (F-3, 2026-10-05) — KAPANDI.** Eski veride kazısız erişimde 5, tek kazıyla en az 166 kesin çıkmaz
vardı: (a) dilim 1'de tek hücreli `h` (`B1_0` G) ya da dik `j` (`D2_0` G) y4–y5'e ✓ iniyor, kalan tek G hücresine blok
kalmıyordu; (b) `k` (`B1_0` Y) önce (6,3)'e raylanınca (7,3)'e ray yolu kapanıyordu (yakın hücre önce dolarsa uzak
hücreye ne ray ne düşüş ulaşır); (c) `l` (`D2_90` W) y0'a ✓ iniyor, y1 için ikinci tek sıralık W yoktu; (d) dilim 2'de
`k1_5` (`B1_0` W) (6,4)'e, `k1_6` (`D2_0` G) (6,1)'e ✓ iniyor, pencerelerin üstündeki (7,4)/(7,2) hücrelerine yalnız
iki sütunlu blok inebildiği için bu hücreler kapanıyordu. Düzeltme (renkler G, W, Y; blok düzeni, el çözümünün hamleleri
ve öğretici aynı; şekillere 1. hikaye bölümünde açık olan C3 eklendi): `h` + `D` → `D` `C3_180` Y (2,3) (2 sıra; dar
geçide sığmama dersi korunur), `k` + `j` → `j` `C3_0` Y (2,2), `l` W → Y (`W`'den sonra ikinci bir basamak), parti 1'in
iki şaşırtması `D2_0` Y yapıldı ve partinin başına alındı (önce şaşırtmalar düşer, gereken bloklar üste gelir; normal
oyunda iniş yerleri aynı). Y'li dik ve C3 bloklar planın hiçbir yerinde doğru olamaz; dilim 2'de 1 genişlikte G ve W
bloktan birer tane kalır, ikisi de pencerenin yanındaki tek yere gider. Sonrası: gevşetilmiş saha oyununda 0 tuzak;
1 kazıya kadar kesin çıkmaz 0, verimli oyuncu için bütçe tuzağı 0; gereksiz kazıdan sonra bütçeyi aşan 5 durum kalır
(çözüm vardır). Min 8, YAO %88 (7/8), bütçe 13, doluluk 44/48 değişmedi.

### Bölüm 10 — Ağaç Ev Tamam! (Treehouse Done!)

| Alan | Değer |
|---|---|
| Öğretilen | Bölüm finali (yüksek duvar + pencere + dar geçit + ağır) + Vinç açılır |
| Zorluk / hedef kazanma | Zor / %45 |
| Duvar | height 8; geçit: y=3 boy 1 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Gövde (EN: Trunk) `["GG", "WW", "W.", "WW", "WW"]` → 2. Pencere Katı (EN: Window Floor) `["RR", "RR", "WW", "..", "RR", "RR"]` → 3. Çatı (EN: Roof) `[".R", "RR", "RR", "GG"]` |
| Desen | gövde + pencere katı + çatı |
| Renkler / şekiller | G, R, W (3) / B1, C3, D2, O4, Q9 |
| Saha doluluğu | 45/48 = %93,8 |
| Minimum hamle (el çözümü) | 11 |
| Hamle bütçesi | 11 + 3 = **14** |
| YAO (çözüm) | 8 duvar üstü / 9 yerleşim = **%89** |
| Öğretici | `tut.l10.crane` (adım aşağıda; Vinç 2 ücretsiz deneme) |

**Tasarım niyeti:** Oyuncu hikaye bölümündeki bütün araçları sırayla kullanır: paleti doğru anda kenara çekmek, dar geçitten asılı katı kurmak, kamyon dökümünü kazıyla açmak.

Blockout (D = duvar sınırı, çizimde ayrı sütun; çekirdekte sıfır genişlik (R-03): `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  O O . Q Q Q   #   ~ ~
   y=6:  O O . Q Q Q   #   ~ ~
   y=5:  C C . Q Q Q   #   ~ ~
   y=4:  C a b b g g   #   G G
   y=3:  d d e f w w   =   W W
   y=2:  d d e i i j   #   W +
   y=1:  k k l l m m   #   W W
   y=0:  k k l l m m   #   W W
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `O` | `O4_0` | W | (0,6) | hedef |
| `Q` | `Q9_0` | R | (3,5) | şaşırtma (başta tutulabilir), ağır |
| `C` | `C3_90` | W | (0,4) | hedef |
| `a` | `B1_0` | R | (1,4) | dolgu (`C` gidince açılır; dilim 1'de doğru olamaz) |
| `b` | `D2_90` | R | (2,4) | dolgu |
| `g` | `D2_90` | G | (4,4) | hedef |
| `f` | `B1_0` | W | (3,3) | dolgu |
| `w` | `D2_90` | W | (4,3) | hedef |
| `d` | `O4_0` | G | (0,2) | dolgu |
| `e` | `D2_0` | R | (2,2) | dolgu |
| `i` | `D2_90` | G | (3,2) | dolgu |
| `j` | `B1_0` | R | (5,2) | dolgu |
| `k` | `O4_0` | R | (0,0) | dolgu |
| `l` | `O4_0` | W | (2,0) | dolgu |
| `m` | `O4_0` | G | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `O4_0` R x=4, `O4_0` R x=4, `B1_0` W x=3, `B1_0` W x=3
- Parti 2 (dilim 2 tamamlanınca, dizi sırasıyla): `B1_0` R x=4, `O4_0` R x=4, `D2_90` G x=4, `B1_0` W x=5

Çözüm (hamle hamle, doğrulandı):

1. `O` (O4_0 W) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `C` (C3_90 W) (0,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,2)'ye iner — duvar üstü, doğru
3. `Q` (Q9_0 R) sahada (3,5) → (0,5) — kazı
4. `g` (D2_90 G) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
5. `k1_1` (O4_0 R) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
6. `w` (D2_90 W) (4,3)'den sağa → geçitten raya → (6,3)'de bırak — ray, doğru
7. `k1_0` (O4_0 R) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru
   - Dilim 2 tamamlandı → kayma, kamyon partisi 2 düşer.
8. `k2_3` (B1_0 W) sahada (5,7) → (3,7) — kazı
9. `k2_2` (D2_90 G) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
10. `k2_1` (O4_0 R) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
11. `k2_0` (B1_0 R) (4,3)'den kaldır → duvar üstünden x=7 üstüne taşı → bırak → (7,3)'ye iner — duvar üstü, doğru

Öğretici adımları (`tutorial[]`; Zor bölümde yumuşak: Vinç kullanımı serbest, bot oranı Vinçsiz ölçülür):
1. Y · `booster:crane` · tap · `tut.l10.crane` · `timeoutMs` 3000

**Çıkmaz denetimi (F-3, 2026-10-05) — Zor; azaltıldı, kalanı belgelendi.** Eski veride kazısız erişimde bile 2 kesin
çıkmaz vardı: `C` gidince açılan `a` (`B1_0` G) y4'e tek başına iniyor, öbür G hücresine 1 genişlikte G kalmıyordu.
Çözümdeki 2 kazıya kadar aramada 14 kesin çıkmaz, 16 verimli oyuncu bütçe tuzağı (dilim 3'te `k1_3`/`k2_3` `B1_0` G'nin
y0'a tek konması; ortağı gömülü) ve 44 israf sonrası bütçe aşımı vardı. Düzeltme: `a` G → R, `k1_3` ve `k2_3` G → W
(renk kümesi G, R, W, blok düzeni ve el çözümü aynı; 8. hamledeki kazı artık `B1_0` W ile). Sonrası: kazısız ve 1 kazıda
0; 2 kazıda verimli oyuncu bütçe tuzağı 0, 2 kesin çıkmaz (yalnız gereksiz hamleden sonra: `a` (`B1_0` R) dilim 2'nin
y0'ına tek konunca) ve 1 israf sonrası bütçe aşımı. Kesin çıkmaz, hamle israfından bağımsız olarak "Çıkmaz" sütununa
sayılır (TECH §9.8 sınıf 1, `trap_dead_end`; Zor → uyarı); israf sınıfı yalnız çözülebilir durumlar içindir (§0 tablosu:
Çıkmaz 2, israf 1). Gevşetilmiş saha oyununda (bütün bloklar her an
erişilebilir sayılır) tuzaklar kalır: tek hücreli R/W blokların ve dilim 2'nin asılı satırı için gereken tek sıralık
`w`'nin erken kullanımı; gerçek kurallarla bunlara ancak birden çok gereksiz kazıyla ulaşılır. Bölüm Zor olduğu için
bu kalan durumlar bilinçli bırakıldı (gölge nötr; ileri planlama bölümün zorluğudur, hedef kazanma %45) ve LEVEL_REPORT'ta
uyarı olarak listelenir. Kurtarma (GDD K-30): renk arzı açılırsa D2 `B1` getirir; dilim döşenemez hale gelirse (ör. `w`
dilim 1'de kullanıldıysa dilim 2 aktif olduğunda) D3 sahayı renk toplamını koruyarak yeniden şekillendirir (TECH §9.7).
D3 MVP'de isteğe bağlıdır; D3'süz sürümde bu durumlar hamle bitince +5 teklifi / kayıpla sonuçlanır (proje sahibine soru).

---

## 3. Bölüm 11–50 (tasarım kayıtları)

Sütunlar: **Kurulum** = bölüm genelindeki parametreler (duvar, geçitler, yerçekimi, mod, engel sayıları); **Hamle** =
tahmini minimum + tampon = bütçe; **Hedef** = "orta" bot kazanma oranı. Duvar ve yerçekimi bölüm boyunca sabittir
(geçitler, fan, `gravity` dilimden dilime değişmez); dilimden dilime değişebilenler plan (`.`, `?`), moloz ve kamyonla
gelen blokların bayraklarıdır (cam, balon, harç, ıslak, zincir).

**Engel bağımlılık dizini (11–50; entrepreneur isteği, kesme etkisini tek bakışta gösterir):**

| Engel | Kullanıldığı bölümler | Engel | Kullanıldığı bölümler |
|---|---|---|---|
| W1 | 11, 12, 17, 19, 21, 24, 27, 29, 32, 37, 39 | Y6 | 14, 18, 20, 36, 41 |
| W2 | 25, 33, 42, 50 | Y7 | 19, 36, 49 |
| W3 | 16, 17, 19, 20, 22, 25, 27, 29, 30, 32, 35, 37, 39, 43, 47, 50 | Y8 | 35, 40, 48, 50 |
| W4 | 13, 20, 34, 35, 41 | S2 | 13, 16, 23, 38, 43, 44, 45, 50 |
| W5 | 16, 20, 43 | S3 | 21, 23, 25, 30, 33, 40, 42, 49, 50 |
| W6 | 22, 25, 30, 43, 47, 50 | S4 | 17, 20, 45, 50 |
| W7 | 26, 30, 45, 50 | S5 | 31, 34, 40, 48 |
| W8 | 32, 33, 36, 40, 46, 47 | S6 | 37, 39, 40, 49 |
| Y1 | 11, 12, 19, 41 | S7-R / S7-M | 27, 30, 44 / 29, 46, 50 |
| Y2 | 18 | S8 | 38, 39, 44, 47, 50 |
| Y3 | 24, 29, 45 | G-H / G-L | 15, 42 / 23, 49 |
| Y4 | 28, 48 | Y5, S1 | Faz 3 blockout'ında (ağır blok ve çok dilim hemen her bölümde) |

**B planı etkisi (BUSINESS P-7, entrepreneur kapsam kararı):** S5 Döner Platform ve S6 Asansör kesilirse 7 bölüm yeniden
kurulur: 31, 34, 37, 39, 40, 48, 49. Yapı parçası ve zorluk etiketi korunur; 31 ve 37 "nefes / pekiştirme" bölümüne
döner (yeni mekanik yok), 34 kepenk zamanlaması, 39 dar geçit + balon, 40 rüzgâr + harç + cam, 48 ıslak + harç, 49 hafif
yerçekimi + cam + vida olur. G-L yönlendirmesi de kesilirse 23 ve 49'da `gravity.build = low` yalnızca cam eşiği 4 ve
yavaş düşüş olarak kalır (yönlendirme öğretimi çıkar).

**11–50 öğretici notları:** Güçlendirici açılış bölümlerinde yumuşak adım (META §4; metin STORY §6, sunum UX §13.2):
Bölüm 12 `tut.l12.thermos` (`pre:thermos`, bölüm öncesi pencerede), Bölüm 13 `tut.l13.undo`, Bölüm 16 `tut.l16.trowel`
(`pre:trowel`), Bölüm 20 `tut.l20.openshutter`, Bölüm 22 `tut.l22.brush`. `pre:` vurgulu adım her zaman 1. adımdır
(Bölüm 12, 16, 20; UX §13.1): bölüm öncesi pencere tahtadan önce açılır ve pencere kapanınca adım biter (GDD §14.1
madde 3), oyun içi adımlar ondan sonra gelir. Bölüm 15'te ikinci yumuşak adım `tut.l15.setting` (Ayarlar > "Zaman
baskısını azalt", R-11; metin design-lead). Bölüm 23'te G-L girdisi: düşerken tahtaya dokunma, dokunulan taraf = yön
(GDD K-19, R-10). Bölüm 23 iki adımlıdır: 1 Z hafif yerçekimi (`tut.l23.light`, `overWall`; 1 genişlikli blok, çünkü
2 genişlikli blok yönlendirilemez) ve 2 Y yönlendirme (`tut.l23.steer`, `steered`; blok parmaktayken başlar, düşüş
başlayınca el gösterilir). Bölüm 19, 26, 36, 49'da saklı nesnelerin konumu görünür (GDD K-42).

**11–38 `tutorial[]` `done` eşlemesi** (UX §13.2 satırlarının veri karşılığı; sözlük GDD §14.1 madde 3, başlama
koşulu madde 5; Z/Y, vurgu, el ve metin UX §13.2'dekiyle aynı; `piece:` indeksleri Faz 3 blockout'ında yazılır). Ana
ekran satırları (`tut.meta.*`; 15, 20, 25) bölüm verisi değildir (GDD §14.1 madde 6).

| Bölüm · adım | Z/Y | `done` | UX "Tamam koşulu" |
|---|---|---|---|
| 11 · 1 | Y | `{ event: obstacleHit, type: crate }` | ilk kasa katı kırıldı |
| 12 · 1 | Y | `{ event: tap }` (`pre:thermos`; bölüm öncesi pencerede, pencere kapanınca da biter) | yuva seçildi ya da pencere kapandı (Oyna / ×) |
| 12 · 2 | Y | `{ timeoutMs: 2000 }` (vurgu `goals`, `tut.l12.clear`) | — (2 s) |
| 13 · 1 | Y | `{ event: turnEnd }` | 1 hamle yapıldı |
| 13 · 2 | Y | `{ timeoutMs: 3000 }` (Bölüm 10 Vinç adımıyla aynı; Geri Al için bağlamsal tetik yok, UX §13.2) | — (3 s) |
| 14 · 1 | Z | `{ event: yardFall }` | zincirleme düşüş oldu |
| 15 · 1 | Y | `{ event: landed }` | ilk iniş |
| 15 · 2 | Y | `{ timeoutMs: 2500 }` | — (2,5 s) |
| 16 · 1 | Y | `{ event: tap }` (`pre:trowel`; bölüm öncesi pencerede, pencere kapanınca da biter) | yuva seçildi ya da pencere kapandı (Oyna / ×) |
| 16 · 2 | Y | `{ event: turnEnd }` (vurgu `gap:0`, `tut.l16.slider`) | 1 hamle yapıldı |
| 17 · 1 | Z | `{ event: yardMove }` (`debris:0`) | moloz taşındı |
| 18 · 1 | Y | `{ event: obstacleHit, type: cement_bag }` | torba gitti |
| 19 · 1 | Y | `{ event: itemCollected, type: screw }` | ilk vida toplandı |
| 20 · 1 | Y | `{ event: tap }` (`pre:shutter`; bölüm öncesi pencerede, pencere kapanınca da biter) | — |
| 21 · 1 | Y | `{ event: landed, flag: glass }` | ilk cam blok sağlam indi |
| 22 · 1 | Z | `{ event: yardMove, painted: true }` | blok boyandı ve sahada |
| 22 · 2 | Y | `{ event: placementCorrect }` | 1 doğru yerleşim |
| 22 · 3 | Y | `{ timeoutMs: 4000 }` (Bölüm 8 Çekiç adımıyla aynı; kullanım isteğe bağlı) | kullanıldı ya da atlandı |
| 23 · 1 | Z | `{ event: overWall }` (vurgu: çözümün ilk 1 genişlikli `piece:` bloğu + `crane` + `build`; metin `tut.l23.light`; 2. adım blok parmaktayken başlar, Bölüm 1 adım 1 gibi) | `overWall` ×1 |
| 23 · 2 | Y | `{ event: steered }` (vurgu `build` + düşen bloğun "↔" çipi; metin `tut.l23.steer`) | yönlendirme yapıldı (`steered` ×1) |
| 24 · 1 | Y | `{ event: obstacleHit, type: chain }` | zincir koptu |
| 26 · 1 | Y | `{ event: itemCollected, type: key }` (kilit aynı denetimde açılır, K-42) | anahtar alındı, kilit açıldı |
| 27 · 1 | Y | `{ event: placementCorrect, hidden: true }` | ilk `?` doğru dolduruldu |
| 28 · 1 | Y | `{ event: turnEnd }` | 1 hamle |
| 29 · 1 | Y | `{ event: placementCorrect, hidden: true }` | ilk `?` doğru dolduruldu |
| 31 · 1 | Y | `{ event: carouselTurn }` | ilk dönüş |
| 32 · 1 | Z | `{ event: landed, wind: true }` | rüzgârlı iniş |
| 35 · 1 | Y | `startOn: { event: deliveryDone, flag: mortar }` · `{ timeoutMs: 2500 }`; vurgu ilk teslim edilen harçlı blok (`piece:k<p>_<i>`) — harçlı bloklar bölüm başında sahada yok (#35, §4 madde 4) | — (2,5 s) |
| 37 · 1 | Y | `{ event: turnEnd }` | 1 hamle |
| 38 · 1 | Z | `{ event: landed, flag: balloon }` | balonlu blok yerleşti |

Z adımları (14, 17, 22, 23, 32, 38) Faz 3 blockout'ında §5 "Z adımı kilitlemez" maddesiyle denetlenir (çalışma anı
güvencesi GDD §14.1 madde 4b).

### Hikaye Bölümü 2 — Mahalle Fırını (renkler W Y G R + O C; en çok 4)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Fırın Temeli | Y1 Ahşap Kasa (1 kat) | Duvar 5, sabit geçit y=1 boy 2; 6 kasa hp 1 (hedef değil) | 2 | O, C, W | 9+5 = 14 | Normal (nefes) | %80 | Kasa yanındaki bloğu almanın kasayı kırdığını ve yolu açtığını keşfetmek. |
| 12 | Tezgâh | `clear` hedefi (kasa ×6, 2 kat) + Termos açılır | Duvar 6, sabit geçit y=2 boy 2; 6 kasa hp 2 | 2 | O, C, Y, W | 11+5 = 16 | Normal | %70 | Kazı hamlesini kasa kırma sayacına da yarayacak yerden seçmek. |
| 13 | Vitrin | W4 Kepenk (period 2, phase 0) + Geri Al açılır | Duvar 6, kepenk y=2 boy 2; vitrin camı `.` | 2 | O, C, R, W | 11+5 = 16 | Normal | %70 | Kepenk kapalıyken duvar üstü yerleşim yapıp açık hamleyi raya saklamak. |
| 14 | Un Deposu | Y6 Saha Yerçekimi | Duvar 5, geçit yok; `gravity.yard = true` | 2 | W, Y, C | 10+5 = 15 | Normal | %70 | Alttan bir blok çekince üsttekilerin inip yeni yol açtığını (ya da kapattığını) okumak. |
| 15 | Baca | G-H Ağır yerçekimi | Duvar 7, geçit yok; `gravity.build = high`; dilimler 2×8 | 2 | R, C, O | 13+3 = 16 | **Zor** | %50 | Şantiyeye geçer geçmez 700 ms içinde doğru sütuna hizalamak; uzun baca boyunca hatasız dizmek. |
| 16 | Kapı Kemeri | W5 Kayar Kapı (range [1,3], boy 1) + Mala Başlangıcı açılır | Duvar 6; kemer = 2 satır `.`, üstü raydan | 2 | O, C, W | 10+5 = 15 | Normal (nefes) | %80 | Kapının hangi satıra geleceğini sayıp kemerin üstünü o hamlede raydan kurmak. |
| 17 | Eski Fırın | S4 Moloz | Duvar 6, sabit geçit y=2 boy 1; 3 moloz (dilim 0: 2, dilim 1: 1); `clear debris 3` | 2 | R, C, Y, O | 12+5 = 17 | Normal | %70 | Molozu sahaya taşımanın hem şantiyeyi açtığını hem de sahada yer yediğini dengelemek. |
| 18 | Un Çuvalları | Y2 Çimento Torbası | Duvar 5; `gravity.yard = true`; 5 torba | 3 | W, Y, C | 14+5 = 19 | Normal | %70 | Torbaları yırtarak sütunları istenen sırada indirmek. |
| 19 | Tabela | Y7 Altın Vida (`collect 5`) | Duvar 6, sabit geçit y=3 boy 1; 5 vida (2'si kasa altında) | 2 | O, Y, R, C | 13+5 = 18 | Normal | %70 | Vida toplayan kazı sırasını inşaat sırasıyla örtüştürmek. |
| 20 | Fırın Açılışı | Bölüm finali + Açık Kepenk açılır | Duvar 7; kepenk y=1 boy 2 (period 2), kayar kapı range [3,5] boy 1; `gravity.yard = true`; moloz 2 | 4 | O, C, R, Y | 22+2 = 24 | **Çok Zor** | %35 | Kepenk, kayar kapı ve düşen sahayı aynı plan üzerinde zamanlamak. |

### Hikaye Bölümü 3 — Okul Kütüphanesi (+ B P; en çok 5)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 21 | Kütüphane Penceresi | S3 Cam Blok | Duvar 6, sabit geçit y=2 boy 2; cam bloklar B renkli | 2 | B, P, W, C | 11+5 = 16 | Normal (nefes) | %80 | Cam bloğu siluete yakın indirip öyle bırakmak; geçidin camı koruyan güvenli yol olduğunu görmek. |
| 22 | Renkli Raflar | W6 Boya Kapısı + Boya Fırçası açılır | Duvar 6, boya kapısı y=2 boy 1 renk P | 2 | B, P, Y, R | 12+5 = 17 | Normal | %70 | Boya kapısını "boyahane" gibi kullanıp bloğu sahaya geri almak, sonra duvar üstünden yerleştirmek. |
| 23 | Okuma Köşesi | G-L Hafif yerçekimi | Duvar 6; `gravity.build = low`; cam bloklar | 2 | B, P, G, W | 12+5 = 17 | Normal | %70 | Yavaş düşen bloğu bir sütun yönlendirip pencereyi ıskalamak; cam eşiğinin 4 olduğunu görmek. |
| 24 | Kitap Kolileri | Y3 Zincir | Duvar 5, sabit geçit y=1 boy 2; 4 zincirli blok; `clear chain 4` | 3 | P, O, C, B | 15+5 = 20 | Normal | %70 | Zinciri çözecek komşu hamlesini doğru yerleşimle aynı hamlede yapmak. |
| 25 | Saat Kulesi | Kombinasyon | Duvar 8, boya kapısı y=3 boy 1 renk Y; cam bloklar; dilimler 2×8 | 3 | B, P, C, Y, W | 19+3 = 22 | **Zor** | %45 | Uzun düşüşte camı korumak ve boyayı doğru blokta harcamak. |
| 26 | Arşiv Kapısı | W7 Kilitli Geçit + anahtar | Duvar 6, kilitli geçit y=2 boy 2; anahtar (1,3) altında | 3 | P, W, C, B | 15+5 = 20 | Normal (nefes) | %80 | Anahtarı açan kazıyı önce yapıp geçidi kestirme olarak kullanmak. |
| 27 | Mozaik Duvar | S7 Gizli plan `repeat` (period 2) | Duvar 6, sabit geçit y=2 boy 1; 2. ve 3. dilimin üst 4 satırı `?` | 3 | B, P, Y, G, R | 15+5 = 20 | Normal | %70 | Alt satırlardan deseni okuyup `?` hücrelerini doğru tahmin etmek. |
| 28 | Bahçe Duvarı | Y4 Islak Beton | Duvar 6; ıslak bloklar wetMoves 2–3 (kamyonla da gelir) | 3 | G, C, W, B | 16+5 = 21 | Normal | %70 | Kuruma süresini başka yerleşimlerle doldurup hamle israf etmemek. |
| 29 | Simetrik Cephe | S7 Gizli plan `mirrorOf` | Duvar 6, sabit geçit y=3 boy 1; dilim 2 = dilim 1'in aynası; 3 zincir | 2 | P, B, O, W | 14+5 = 19 | Normal | %70 | İlk dilimi hatasız kurup aynasını renk yer değiştirerek kurmak. |
| 30 | Kütüphane Açılışı | Bölüm finali | Duvar 7, boya kapısı y=1 boy 1 renk B + kilitli geçit y=4 boy 1; cam; gizli `repeat` | 4 | B, P, C, Y, W | 25+2 = 27 | **Çok Zor** | %30 | Boya, gizli desen, cam ve anahtarı tek planda sıralamak. |

### Hikaye Bölümü 4 — Deniz Feneri ve Köprü (bütün renkler; en çok 5)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 31 | Balıkçı İskelesi | S5 Döner Platform (`carouselEvery 4`) | Duvar 5, geçit yok; `build.mode = carousel` | 3 | B, W, C, Y | 15+5 = 20 | Normal (nefes) | %80 | Öndeki yüz dönmeden önce ona yerleştirilecek bloğu hazırda tutmak. |
| 32 | Rüzgârlı Kıyı | W8 Rüzgâr Fanı (`dir right`) | Duvar 6, sabit geçit y=2 boy 1 | 3 | B, R, W, Y | 15+5 = 20 | Normal | %70 | Rüzgârın ince blokları kaydırdığını gölgeden okuyup sütunu ona göre seçmek ya da bloğu siluete indirmek. |
| 33 | Fener Gövdesi | Kombinasyon | Duvar 8, fan `left`; cam bloklar; dilimler 2×8 | 3 | R, W, B, C | 17+5 = 22 | Normal | %65 | Yüksek duvar, rüzgâr ve camı aynı düşüşte hesaba katmak. |
| 34 | Fener Odası | Kombinasyon (zamanlama) | Duvar 6, kepenk y=2 boy 2 (period 2, phase 0); `carousel`, `carouselEvery 4` | 3 | Y, B, R, P | 17+5 = 22 | Normal | %65 | Kepenk ile platformun aynı ritimde döndüğünü fark edip ray hamlelerini o ana denk getirmek. |
| 35 | Islak Harç | Y8 Harçlı Blok | Duvar 6, kepenk y=3 boy 1 (period 3); harçlı bloklar 2. ve 3. partide | 3 | C, R, W, O | 18+3 = 21 | **Zor** | %50 | Harçlı bloğu bırakmadan önce, Zor bölümde gölge doğruluk göstermediği için (GDD K-18), plan rengini ve inşa cephesini (her zorlukta görünür, K-34 kanca 1) kendisi eşleştirip gölgenin gösterdiği konumda bırakmak; zorluk yeni engelden değil dar bütçeden gelir. |
| 36 | Martı Yuvaları | Kombinasyon | Duvar 6, fan `right`; `gravity.yard = true`; `collect screw 6` | 3 | W, G, B, Y | 16+5 = 21 | Normal (nefes) | %75 | Vidaları açan düşüş zincirlerini rüzgârlı yerleştirmeyle birleştirmek. |
| 37 | Yükselen İskele | S6 Asansör İskele (`range [0,2]`) | Duvar 6, sabit geçit y=3 boy 1; `build.elevator` start 0 dir +1 | 3 | O, C, B, W | 16+5 = 21 | Normal | %70 | Geçidin hangi plan satırına açılacağını asansör ofsetinden hesaplamak. |
| 38 | Köprü Halatları | S8 Balonlu Blok | Duvar 5; planlarda `.` sütunlarının üstünde tavan hücreleri | 3 | R, W, B, Y | 16+5 = 21 | Normal | %70 | Balonlu bloğun tavana asılıp boşluk üstündeki halatı kurduğunu keşfetmek. |
| 39 | Köprü Tabliyesi | Kombinasyon | Duvar 6, dar sabit geçit y=2 boy 1; asansör [0,1]; balonlar | 4 | W, R, C, B, O | 20+5 = 25 | Normal | %65 | Asansör, balon ve dar geçidi tabliyenin dört parçasında sırayla kullanmak. |
| 40 | Fener Yandı! | Bölüm finali | `carousel` 4 dilim (`carouselEvery 3`) + asansör [0,2]; fan `right`; harçlı ve cam bloklar | 4 | Y, R, B, W, C | 27+2 = 29 | **Çok Zor** | %30 | Dönen ve yükselen şantiyeye rüzgârda harçlı/cam bloğu hatasız yerleştirmek. |

### Hikaye Bölümü 5 — Festival Şatosu (bütün renkler; en çok 5)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 41 | Hendek Köprüsü | Tekrar ve pekiştirme | Duvar 6, kepenk y=2 boy 2 (period 2); `gravity.yard = true`; 6 kasa hp 1–2 | 3 | C, B, W, G | 17+5 = 22 | Normal (nefes) | %80 | Bildik üç engelle akıcı bir bölümde ustalık hissi yaşamak. |
| 42 | Sol Kule Temeli | Kombinasyon | Duvar 8, geçit yok; `gravity.build = high`; cam bloklar | 3 | C, P, Y, B | 19+5 = 24 | Normal | %65 | Ağır yerçekiminde cam bloğu 700 ms içinde siluete indirmek. |
| 43 | Sol Kule Pencereleri | Kombinasyon | Duvar 7, kayar kapı range [1,3] boy 1 + boya kapısı y=5 boy 1 renk P; pencereler `.` | 3 | P, C, Y, B, W | 19+5 = 24 | Normal | %65 | Pencere üstlerini kayar kapıdan, renk eksiğini boya kapısından tamamlamak. |
| 44 | Mazgallar | Kombinasyon | Duvar 5; balonlar; gizli `repeat` (period 2) mazgal deseni | 3 | C, P, R, Y | 19+5 = 24 | Normal | %70 | Tekrar eden mazgal desenini okuyup boşluk üstündeki dişleri balonla kurmak. |
| 45 | Büyük Kapı | Kombinasyon | Duvar 7, kilitli geçit y=2 boy 2; kemer `.` (2×2); 4 zincir; 3 moloz | 4 | C, P, W, O, Y | 24+3 = 27 | **Zor** | %45 | Anahtar, zincir ve molozu çözme sırasını kemerin kuruluş sırasına bağlamak. |
| 46 | Sağ Kule | Kombinasyon | Duvar 6, fan `left`; dilim 3–4 `mirrorOf` dilim 1–2 | 4 | C, P, Y, B | 22+5 = 27 | Normal (nefes) | %75 | Sol kulenin aynasını rüzgârın yönünü hesaba katarak kurmak. |
| 47 | Bayraklar | Kombinasyon | Duvar 6, boya kapısı y=2 boy 1 renk R; fan `right`; balonlar | 3 | R, Y, B, P, G | 20+5 = 25 | Normal | %65 | Bayrakları balonla tavana asarken rüzgâr kaymasını ve boyayı birlikte planlamak. |
| 48 | Şato Avlusu | Kombinasyon | `carousel` (`carouselEvery 4`); ıslak ve harçlı bloklar | 4 | C, G, W, O, P | 23+5 = 28 | Normal | %65 | Dönen avluda kuruyan ve yapışan blokların sırasını yönetmek. |
| 49 | Festival Işıkları | Kombinasyon | Asansör [0,2]; `gravity.build = low`; cam; `collect screw 5` | 4 | Y, P, B, R, O | 27+3 = 30 | **Zor** | %45 | Yükselen iskeleye yavaş düşen cam ışıkları yönlendirerek asmak, vidaları yol üstünde toplamak. |
| 50 | Festival Şatosu | BÜYÜK FİNAL | Duvar 8; kilitli dar geçit y=2 boy 1 + boya kapısı y=5 boy 1 renk P; dilim engelleri: 1 Sol Kule (cam), 2 Kapı (kemer `.` + anahtar), 3 Sağ Kule (`mirrorOf` 1), 4 Bayrak Direkleri (balon), 5 Kule Tepeleri (harç + moloz) | 5 | C, P, Y, B, R | 36+2 = 38 | **Çok Zor** | %30 | Bütün oyunun araçlarıyla, her dilimi farklı bir ustalık sınavına çevirerek şatoyu bitirmek. |

---

## 4. Briften sapmalar ve gerekçeler

1. **Hamle sayıları düştü (1–10'da %25–40).** Brif §8 sayıları "başlangıç tahmini"dir; nihai kural "minimum +
   tampon"dur. 1–10'un el minimumları 3–11 hamledir; bu, bölüm başına ≈ 1 dakika oyun (≈ 5 sn/hamle) ve brifin 1–3
   dakika oturum hedefiyle uyumludur. Faz 3'te bot raporu bölümleri kısa bulursa planlar büyütülür (önce dilim yüksekliği,
   sonra şaşırtma sayısı). **Proje sahibine açık soru (R-18);** formül (solver minimumu + tampon, ardından bot ayarı)
   geçerli kalır. Ölçüt §0'daki bölüm süresi bandıdır.
2. **Bölüm 4'ün geçidi boy 2'dir** (brif: y=3 boy 1; R-21). Gerekçe: (a) doğrulayıcı mekanikleri veriden türetir
   (OBSTACLES "Veri imzası"); boy 1 geçit Bölüm 4'e S2 ile birlikte ikinci yeni mekanik (W3) getirir ve K-45/9'a istisna
   gerektirirdi; (b) W3'ün "blok sığmıyor" anı Bölüm 9'a saklanır; (c) boy 2 geçit Bölüm 4'e kısa yol açmaz (betikle
   doğrulandı; tutarlılık denetiminden sonraki güncel değerler min 4, YAO %75 — blok düzeni madde 8'de değişti). Alternatif ("W3 yalnızca `teaches` ile sayılır") istisna kuralı doğurduğu için seçilmedi.
3. **Bölüm 5 ve 6 "Normal" etiketli tanıtım bölümleridir;** öğretim kuralı gereği sade tutuldu, hedef kazanma %80
   (Normal bandının üst ucu). Kazı (K-10) 7. bölümde öğretildiği için 1–6'da hiçbir çözüm kazı gerektirmez.
4. **Bölüm 35 Zor ve yeni mekanik öğretir** (brif). Zorluk yeni engelden değil, +3 tampondan ve bilinen kepenkten gelir;
   harçlı bloklar yalnızca 2. ve 3. partide, ilk dilim harçsız.
5. **Bölüm 50 "her dilimde farklı engel seti":** duvar ve yerçekimi bölüm boyunca sabit olduğundan dilime özgü engeller
   plan, moloz ve kamyonla gelen blok bayraklarıyla verilir; duvar engelleri (kilitli dar geçit, boya kapısı) bütün
   dilimlerde ortaktır.
6. **Bölüm 40 döner platform + asansör** birlikte: `build.elevator` ayrı alan (GDD K-24, öneri P-4).
7. **İmza hareketin "yukarı" yarısı (design-lead gözlemi; ölçümle kapandı, brif "Duvar 2" korunur):** Duvar 1–5'te
   (2–6) tutulabilir blokların satırının (6–7) altında kalır, ama komşu bloklar düz yolu kapattığı için çözüm hamlelerinin
   çoğu bloğu başlangıç satırının **üstüne** kaldırmayı gerektirir. Karalama betiğiyle ölçülen en az kaldırma (satır,
   bütün yollar üzerinden en küçük tepe): Bölüm 1 `a` 0 · `b` 2 · `c` 1; Bölüm 2 `A` 2 · `b` 2 · `c` 0; Bölüm 3 `a` 2 ·
   `b` 1; Bölüm 4 `a` 1 · `b` 2 · `d` 0 (tutarlılık denetimi sonrası düzen); Bölüm 5 6 hamleden 4'ü 2 satır; Bölüm 6 (duvar 8) 1–4. Yani "yukarı"
   ilk oturumun **2. hamlesinde** (Bölüm 1 `b`, Vinç Alanı'na 2 satır) hissedilir; ilk hamle (`a`) kısa ve başparmağa
   yakın kalır (ergonomi). Bölüm 1–2'de duvarı yükseltme önerisi bu yüzden uygulanmadı ve brif sapması gerekmiyor.

8. **✓ sonrası çıkmazlar kapatıldı (tutarlılık denetimi, 2026-10-05).** Kolay/Normal bölümde gölgenin ✓ gösterdiği tek
   bir yerleşim bölümü D1/D2'nin yakalamadığı çözümsüz bir duruma sokuyordu; MVP'de D3 isteğe bağlı, Geri Al 13'te
   açılıyor, Altın Mala bu bölümlerde erişilemez. GDD K-30'u değiştirmek (D3'ü zorunlu yapmak) yerine veri düzeltildi ve
   §5'e denetim maddesi eklendi (D3'ün çalışma anı maliyeti code-lead'in; tasarım zamanı denetimi ucuz). Değişiklikler
   (hepsi betikle doğrulandı: Mala'sız, kazısız erişilebilen çıkmaz yok; min/YAO): Bölüm 2 `d` Y → G (3/%100);
   Bölüm 3 üst plan satırı `WW` → `GG`, `b` W → G (3/%67); Bölüm 4 `b`+`c`+`f` → tek `C3_0` W (5/%80 → 4/%75, bütçe 13 →
   12); Bölüm 5 `d` W → R, `g` W → R, parti 1 `B1_0` R → W (6/%100); Bölüm 6 `E` W ↔ `F` Y renkleri ve y4–y6 plan
   satırları (6/%100). Renk kümeleri ve şekil açılışları değişmedi; Bölüm 4'ten `B1` çıktı.
9. **Bölüm 2'nin dilimi 2×5'tir** (brif §8: 2×4). Gerekçe: brif bu bölümde O4 ve C3'ü birlikte ister; çapraz şerit bir
   C3 çiftidir (`C3_0` + `C3_180` = 6 hücre = 2×3) ve temel `O4` 2×2'dir → 2 + 3 = 5 satır. 4 satırda ya O4 ya da C3 çifti
   çıkar (ya da çift `D2`/`B1` ile kırpılır, şerit okunmaz). Hamle (3) ve süre bandı etkilenmez.
10. **✓ sonrası çıkmazlar kazı ve saha bırakması dahil kapatıldı (F-3, 2026-10-05).** Madde 8 denetimi kazısızdı;
   F-3'te 1–10 kazılı tam aramayla yeniden tarandı (yöntem §0, ölçüt §5). Yanlışlıkla sahaya bırakma (K-07 satır 2) 7.
   bölümden önce de bir "kazı" olduğundan 1–6 da tek saha bırakmasıyla tarandı. Ortak kök neden üç tipti: (1) 1 genişlikte
   şaşırtma/dolgu (`B1`, dik `D2`) iki hücreli bir satıra ya da pencerenin yanına tek başına ✓ iniyor, kalan hücreye blok
   kalmıyor; (2) tam satıra oturan iki hücreli blok, pencereli bölgenin anahtar bloğunun (C3) yerini yiyor; (3) gereksiz
   bir kazıdan sonra dilimi bitiren ✓ yerleşimin kamyon dökümü gerekli bloğu, sahada kazıya yer kalmayacak biçimde
   gömüyor. Değişiklikler: Bölüm 5 parti 1 `B1_0` W → `D2_0` R, `D2_90` R 2. sıraya; Bölüm 7 `k1_0` R → G, `C3_0` W partinin
   sonuna; Bölüm 8 üst plan satırları `WW` → `GG`, `w`/`k1_1` W → G, `b`/`d`/`k1_0` → Y; Bölüm 9 `h`+`D` → `C3_180` Y,
   `k`+`j` → `C3_0` Y, `l` W → Y, parti 1 şaşırtmaları `D2_0` Y ve partinin başında; Bölüm 10 `a` G → R, `k1_3`/`k2_3`
   G → W. Bütün bölümlerde renk kümeleri, minimum hamle, YAO, bütçe, doluluk ve öğretici adımları değişmedi; Bölüm 5'ten
   `B1` çıktı, Bölüm 9'a `C3` girdi (ikisi de 1. hikaye bölümünde açık). İlke (§5'e eklendi): 1 genişlikte blok tercihen
   yalnız tek başına 1 genişlikte blok isteyen hücre için, eşiyle birlikte ya da planın hiçbir yerinde doğru olamayacak
   renkte verilir; parti sırası, gereksiz bir saha
   hamlesinden sonra da döküm kazılabilir kalacak biçimde seçilir ve kazılı aramayla denetlenir (Bölüm 9'da şaşırtmalar
   önce düşer, Bölüm 7'de ilk gereken blok en son gelip kuyrukta bekler).

## 5. Bölüm tasarım kontrol listesi (her JSON için)

- [ ] Renk sayısı ve açılmış renkler (§0 tablosu); şekiller açılmış (K-44); ağır yalnızca 8+.
- [ ] Saha doluluğu %80–100; saklı nesneler örtülü; moloz ait olduğu dilimin plan alanında (`segment` verilmezse 0; dilim 0 dışındaki moloza yazılır, GDD K-45/7).
- [ ] En çok 1 yeni mekanik; `teaches` alanı ve öğretici adımları dolu; tanıtım bölümünün hedefi Normal'de ≥ %70, Zor'da
      ≥ %50 (§0 öğretim kuralı).
- [ ] Solver çözümü var; YAO ≥ %60; `moves = min + tampon`.
- [ ] Ek hedefler (clear/collect) inşaatın son dilimi bitmeden tamamlanabilir (E-27'den kaçın).
- [ ] Kamyon partileri boşalan alana sığar ya da kuyruk bilinçli tasarlanmıştır; parti sırası "önce gereken en üstte"
      ilkesine uyar (kazı istenen yer hariç) ve gereksiz bir saha hamlesinden sonra da döküm kazılabilir kalır (§4 madde 10).
- [ ] 1 genişlikte blok (`B1`, dik `D2`) tercihen yalnızca (a) planda yalnız 1 genişlikte bloğun dolduracağı hücre için
      (ör. Bölüm 9 dilim 2'de pencerenin yanındaki tek hücre), (b) eşiyle birlikte ya da (c) planın hiçbir yerinde doğru
      olamayacak renkte verilir; pencerenin (`.`) üstündeki hücre yalnızca iki sütunlu blokla dolabiliyorsa o rengin 1
      genişlikte bloğu dilimde en çok bir tanedir. Bu kurala uymayan blok (ör. kapsamda erişilemeyen dolgu: Bölüm 2 `d`,
      Bölüm 6 `h`) ancak aşağıdaki kazılı tarama temizse kalır (§4 madde 10).
- [ ] Gölge her düşüşü doğru gösterir; gizli bilgi yalnızca `?` ile verilir (adalet ilkesi); saklı nesnelerin konumu görünür.
- [ ] Öğretici adımları `tut.l{n}.{konu}` anahtarlarıyla (bağlamsal satır yeniden kullanılırsa `tut.ctx.{konu}`, GDD §14.1);
      adım sırası el çözümüne ve K-34'e uyar (önce temel); oyuncu metninde renk adı ve "parça" yok.
- [ ] **Öğretici zamandan bağımsız ve görünür:** her erişilebilir hamle sırasında her adım gösterilir; `timeoutMs`'li
      bir adımın ardından gelen adımın hamle sayımı, süre dolmadan yapılan hamlelere göre değişmez (değişiyorsa önceki
      adım olayla biter; ör. Bölüm 4 adım 1 `placementCorrect` ×1). Adım, metninin anlattığı hamle boyunca ekrandadır:
      sürükleme sinyaliyle açılan adım yalnız o sürüklemeyi anlatır (ör. Bölüm 1 adım 2 "bırak"); sonraki hamleyi
      yönlendiren adım önceki hamlenin sonucuyla (hamle sonu olayı) açılır ve o hamlenin başında ekrandadır (ör. Bölüm 3
      adım 3: adım 2 `placementCorrect` ×1 ile biter). Tarama: gerçek çekirdek + `TutorialController`, ✓ yerleşimler +
      1 saha hamlesi, `timeoutMs` her hamle sırasına yerleştirilir (Faz 2 tur 1).
- [ ] **Eldiven vurgulu bloktan başlar:** `drag` ya da `hold` eldiveninin `hand.path[0]`'ı, el çözümünde adımın açıldığı
      anda vurgulu bir `piece:` ya da `debris:` bloğunun kapladığı hücredir (çapa değil: çapa bloğun hücresi olmayabilir)
      ve o blok o anda tutulabilir (K-09). Vurgulu blok adım açılmadan taşınmıyorsa bu hücre JSON'daki başlangıç
      hücrelerinden biridir (Bölüm 1–5'in bütün `drag`/`hold` adımları). Örnek: Bölüm 2 adım 2 `c` (`C3_180`, çapa (4,6),
      hücreleri (5,6), (4,7), (5,7)) → `path[0]` = (4,7); (4,6) `d`'nin hücresidir ve `d` başta tutulamaz (Faz 2 tur 2).
- [ ] Türetilen yeni mekanik ≤ 1 ve `teaches` ile birebir (OBSTACLES "Veri imzası").
- [ ] **Z adımı kilitlemez:** zorunlu (Z) adım yalnızca istediği hamle, önceki adımın tamamlanabildiği **her** durumda
      (her hamle sırası ve `timeoutMs`'in hamlelere göre her dolma anı dahil) geçerli ve K-34'e uygunken başlar;
      `highlight` en az bir `piece:` ya da `debris:` içerir (`piece:` yoksa `done` `placementCorrect` olamaz; ör. Bölüm
      17 `debris:0` → `yardMove`) ve spot ışığı en az bir tutulabilir bloğu açık bırakır; bırakma iptalinde (K-07 satır
      1, 3, 4) blok spot dışında kalabiliyorsa adım yumuşaktır (GDD §14.1 madde 4).
- [ ] **✓ sonrası çözüm (F-3 ölçütü):** Kolay ve Normal bölümlerde gölgenin ✓ gösterdiği (doğru) her yerleşimden sonra,
      Mala'sız ve Kamyon Yardımı'sız: (a) **kesin çıkmaz yoktur** (bölüm hâlâ bitirilebilir); (b) **verimli oyuncu için
      bütçe tuzağı yoktur** (en kısa bir çözümün üzerindeki durumdan yapılan ✓ yerleşimden sonra kalan hamleyle çözüm
      vardır). Erişim kapsamı: ✓ yerleşimler + çözümdeki kazı sayısı + 1 saha hamlesi (kazı ya da yanlışlıkla sahaya
      bırakma, K-07 satır 2; Bölüm 1–6'da 1). Yöntem: önce kazıdan bağımsız **gevşetilmiş saha oyunu** (saha boş, her ağır
      olmayan blok her an alınabilir; ✓ sonrası bu oyunda bile bitmeyen durum malzeme/döşeme çıkmazıdır), sonra gerçek
      kurallarla kazılı tam arama ve kalan bütçeyle sınırsız kazılı derin arama (§0). Yalnızca gereksiz hamlelerden sonra
      bütçeyi aşan durumlar kabul edilir (çözüm vardır, +5 teklifi yolu açık; sayısı LEVEL_REPORT'a yazılır). D1/D2'nin
      yakaladığı durumlar (Kamyon Yardımı gelir) çıkmaz sayılmaz. Zor ve Çok Zor'da gölge doğruluk göstermez; kalan
      çıkmazlar LEVEL_REPORT'ta uyarı olarak listelenir ve bölüm notunda kurtarma yolu (D1/D2/D3) yazılır (ör. Bölüm 10).
      Araç: `levels:solve --traps` ✓-tuzağı taraması (code-lead, TECH §9.8; doğrulayıcı L-27; Faz 3).
