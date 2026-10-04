# 50 bölüm planı

Sahip: product-lead · Sürüm: Faz 1 taslağı (2026-10-04) · Kaynak: `docs/BRIEF.md` §8, `docs/GDD.md`, `docs/OBSTACLES.md`

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

**Doğrulama notu:** 1–10. bölümlerin blockout'ları, GDD kurallarını (duvar sütunu, açık gökyüzü, ray kipi, K-16,
K-34, kamyon dökümü K-25) uygulayan bir karalama betiğiyle hücre hücre denetlendi: parçalar çakışmıyor, şekiller
kimlikleriyle uyuşuyor, saha doluluğu %80–100, her çözüm adımı yol kuralıyla erişilebilir ve sonuç doğru yerleşim.
Betik proje kodu değildir; resmî doğrulama Faz 2–3'te code-lead'in `levels:validate` ve `levels:solve` araçlarıyladır.

**Renk ve şekil açılışları** (brif §5, §6; GDD K-31, K-44):

| Hikaye bölümü | Bölümler | Renk havuzu (ilk göründüğü bölüm) | Bölüm başına en çok renk | Şekiller |
|---|---|---|---|---|
| 1 Ağaç Ev | 1–10 | W (1), Y (1), G (2), R (4) | 3 | B1, D2, O4, C3; 8'den itibaren ağır I5, Q9 |
| 2 Mahalle Fırını | 11–20 | + O, C (11) | 4 | + I3, L4, J4 |
| 3 Okul Kütüphanesi | 21–30 | + B, P (21) | 5 | + T4, S4, Z4 |
| 4 Deniz Feneri ve Köprü | 31–40 | hepsi | 5 | + I4 |
| 5 Festival Şatosu | 41–50 | hepsi | 5 | hepsi |

Renk sayısına bölümdeki **bütün** bloklar (şaşırtma ve dolgu dahil) ve plan hücreleri girer.

**Testere dişi:** Zor = 10, 15, 25, 35, 45, 49; Çok Zor = 20, 30, 40, 50. Her Zor/Çok Zor bölümden sonraki bölüm
"nefes" bölümüdür (hedef kazanma oranı Normal bandının üstü, %75–80). 49 → 50 istisnadır (büyük final).

**Öğretim kuralı:** Her bölüm en çok 1 yeni mekanik öğretir; tanıtım bölümü sadedir, sonraki iki bölüm pekiştirir,
ardından kombinasyonlar gelir. Tanıtım bölümlerinde hedef kazanma oranı kendi bandının üst ucundadır.

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
| 4 | Kolay | 13 | ≥ %90 | 29 | Normal | 19 | %65 |
| 5 | Normal | 11 | %80 | 30 | **Çok Zor** | 27 | %30 |
| 6 | Normal | 11 | %80 | 31 | Normal (nefes) | 20 | %80 |
| 7 | Normal | 12 | %75 | 32 | Normal | 20 | %70 |
| 8 | Normal | 12 | %75 | 33 | Normal | 22 | %65 |
| 9 | Normal | 13 | %70 | 34 | Normal | 22 | %65 |
| 10 | **Zor** | 14 | %45 | 35 | **Zor** | 21 | %45 |
| 11 | Normal (nefes) | 14 | %80 | 36 | Normal (nefes) | 21 | %75 |
| 12 | Normal | 16 | %70 | 37 | Normal | 21 | %70 |
| 13 | Normal | 16 | %70 | 38 | Normal | 21 | %70 |
| 14 | Normal | 15 | %70 | 39 | Normal | 25 | %65 |
| 15 | **Zor** | 16 | %50 | 40 | **Çok Zor** | 29 | %30 |
| 16 | Normal (nefes) | 15 | %80 | 41 | Normal (nefes) | 22 | %80 |
| 17 | Normal | 17 | %70 | 42 | Normal | 24 | %65 |
| 18 | Normal | 19 | %65 | 43 | Normal | 24 | %65 |
| 19 | Normal | 18 | %70 | 44 | Normal | 24 | %70 |
| 20 | **Çok Zor** | 24 | %35 | 45 | **Zor** | 27 | %45 |
| 21 | Normal (nefes) | 16 | %80 | 46 | Normal (nefes) | 27 | %75 |
| 22 | Normal | 17 | %70 | 47 | Normal | 25 | %65 |
| 23 | Normal | 17 | %70 | 48 | Normal | 28 | %65 |
| 24 | Normal | 20 | %65 | 49 | **Zor** | 30 | %45 |
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
| Dilimler | 1. Basamaklar `["WW", "WW", "YY"]` |
| Desen | yatay şerit |
| Renkler / şekiller | W, Y (2) / D2 |
| Saha doluluğu | 46/48 = %95,8 |
| Minimum hamle (el çözümü) | 3 |
| Hamle bütçesi | 3 + 8 = **11** |
| YAO (çözüm) | 3 duvar üstü / 3 yerleşim = **%100** |
| Öğretici | tut.l1.lift: elle gösterim: a bloğunu yukarı kaldır, sağa taşı, bırak. |

**Tasarım niyeti:** Oyuncu bloğu yukarı kaldırıp duvarın üstünden aşırmanın ve bırakınca düşmenin oyunun temel hareketi olduğunu keşfeder; gölgenin düşüş yerini gösterdiğini görür.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  a a b c d .   :   ~ ~
   y=6:  e e b c d .   :   ~ ~
   y=5:  f f g g h h   :   ~ ~
   y=4:  i j j k k l   :   ~ ~
   y=3:  i m m n n l   :   ~ ~
   y=2:  o o p p q q   :   W W
   y=1:  r s s t t u   #   W W
   y=0:  r v v w w u   #   Y Y
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `a` | `D2_90` | Y | (0,7) | hedef |
| `e` | `D2_90` | W | (0,6) | dolgu |
| `b` | `D2_0` | W | (2,6) | hedef |
| `c` | `D2_0` | W | (3,6) | hedef |
| `d` | `D2_0` | Y | (4,6) | şaşırtma (başta tutulabilir) |
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

1. `a` (D2_90 Y) (0,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `b` (D2_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
3. `c` (D2_0 W) (3,6)'den kaldır → duvar üstünden x=7 üstüne taşı → bırak → (7,1)'ye iner — duvar üstü, doğru

### Bölüm 2 — Platform (Platform)

| Alan | Değer |
|---|---|
| Öğretilen | Renk örüntüsü (çapraz şerit) + düşüş gölgesi; O4 ve C3 şekilleri |
| Zorluk / hedef kazanma | Kolay / ≥ %92 |
| Duvar | height 3; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Platform `["YY", "WY", "WW", "GG", "GG"]` |
| Desen | çapraz şerit (C3 çifti) |
| Renkler / şekiller | G, W, Y (3) / B1, C3, O4 |
| Saha doluluğu | 47/48 = %97,9 |
| Minimum hamle (el çözümü) | 3 |
| Hamle bütçesi | 3 + 8 = **11** |
| YAO (çözüm) | 3 duvar üstü / 3 yerleşim = **%100** |
| Öğretici | tut.l2.shadow: gölge yeşilse doğru, kırmızıysa yanlış yer. |

**Tasarım niyeti:** Oyuncu aynı renk bölgesini doğru yönelimli bloğun doldurduğunu, ters yönelimli C3'ün gölgede kırmızı yandığını keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

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
| `d` | `B1_0` | Y | (4,6) | dolgu |
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

### Bölüm 3 — Ön Duvar (Front Wall)

| Alan | Değer |
|---|---|
| Öğretilen | W1 Sabit Geçit + ray yerleştirme |
| Zorluk / hedef kazanma | Kolay / ≥ %92 |
| Duvar | height 6; geçit: y=2 boy 2 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Ön Duvar `["WW", "YY", "WW", "WW"]` |
| Desen | bant (W-Y-W) |
| Renkler / şekiller | G, W, Y (3) / D2, O4 |
| Saha doluluğu | 48/48 = %100,0 |
| Minimum hamle (el çözümü) | 3 |
| Hamle bütçesi | 3 + 8 = **11** |
| YAO (çözüm) | 2 duvar üstü / 3 yerleşim = **%67** |
| Öğretici | tut.W1: geçidi ve yanındaki sarı bloğu vurgula; sağa it. |

**Tasarım niyeti:** Oyuncu sahanın derinindeki bloğun geçitten tek hamlede şantiyeye girdiğini ve raydaki bloğun düşmediğini keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  a a b b c d   :   ~ ~
   y=6:  a a e e c d   :   ~ ~
   y=5:  g g h h i i   #   ~ ~
   y=4:  g g h h i i   #   ~ ~
   y=3:  j j k k l l   =   W W
   y=2:  j j k k f f   =   Y Y
   y=1:  m m n n o o   #   W W
   y=0:  m m n n o o   #   W W
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `b` | `D2_90` | W | (2,7) | hedef |
| `a` | `O4_0` | W | (0,6) | hedef |
| `e` | `D2_90` | G | (2,6) | dolgu |
| `c` | `D2_0` | Y | (4,6) | şaşırtma (başta tutulabilir) |
| `d` | `D2_0` | G | (5,6) | şaşırtma (başta tutulabilir) |
| `g` | `O4_0` | G | (0,4) | dolgu |
| `h` | `O4_0` | W | (2,4) | dolgu |
| `i` | `O4_0` | G | (4,4) | dolgu |
| `l` | `D2_90` | G | (4,3) | şaşırtma (başta tutulabilir) |
| `j` | `O4_0` | Y | (0,2) | dolgu |
| `k` | `O4_0` | W | (2,2) | dolgu |
| `f` | `D2_90` | Y | (4,2) | hedef |
| `m` | `O4_0` | W | (0,0) | dolgu |
| `n` | `O4_0` | G | (2,0) | dolgu |
| `o` | `O4_0` | Y | (4,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `a` (O4_0 W) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `f` (D2_90 Y) (4,2)'den sağa → geçitten raya → (6,2)'de bırak — ray, doğru
3. `b` (D2_90 W) (2,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

### Bölüm 4 — Pencere (The Window)

| Alan | Değer |
|---|---|
| Öğretilen | S2 Plan Boşluğu (üstü geçitten) |
| Zorluk / hedef kazanma | Kolay / ≥ %90 |
| Duvar | height 6; geçit: y=3 boy 1 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Ön Cephe `["RR", "WW", "W.", "WW", "YY"]` |
| Desen | pencereli cephe |
| Renkler / şekiller | R, W, Y (3) / B1, D2, O4 |
| Saha doluluğu | 48/48 = %100,0 |
| Minimum hamle (el çözümü) | 5 |
| Hamle bütçesi | 5 + 8 = **13** |
| YAO (çözüm) | 4 duvar üstü / 5 yerleşim = **%80** |
| Öğretici | tut.S2: çapraz taralı hücreyi göster: 'Pencere boş kalmalı.' |

**Tasarım niyeti:** Oyuncu pencerenin üstünü tek genişlikteki blokla dolduramayacağını, geçitten gelen yatay lentonun pencerenin üstünde asılı kaldığını keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  a a b c d d   :   ~ ~
   y=6:  e e b f g g   :   ~ ~
   y=5:  h h i i j j   #   ~ ~
   y=4:  h h i i j j   #   R R
   y=3:  k k l l p p   =   W W
   y=2:  k k l l q q   #   W +
   y=1:  r r s s u u   #   W W
   y=0:  r r s s u u   #   Y Y
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `a` | `D2_90` | Y | (0,7) | hedef |
| `c` | `B1_0` | W | (3,7) | hedef |
| `d` | `D2_90` | R | (4,7) | hedef |
| `e` | `D2_90` | R | (0,6) | dolgu |
| `b` | `D2_0` | W | (2,6) | hedef |
| `f` | `B1_0` | W | (3,6) | dolgu |
| `g` | `D2_90` | Y | (4,6) | şaşırtma (başta tutulabilir) |
| `h` | `O4_0` | W | (0,4) | dolgu |
| `i` | `O4_0` | R | (2,4) | dolgu |
| `j` | `O4_0` | Y | (4,4) | dolgu |
| `p` | `D2_90` | W | (4,3) | hedef |
| `k` | `O4_0` | Y | (0,2) | dolgu |
| `l` | `O4_0` | W | (2,2) | dolgu |
| `q` | `D2_90` | R | (4,2) | dolgu |
| `r` | `O4_0` | R | (0,0) | dolgu |
| `s` | `O4_0` | Y | (2,0) | dolgu |
| `u` | `O4_0` | W | (4,0) | dolgu |

Çözüm (hamle hamle, doğrulandı):

1. `a` (D2_90 Y) (0,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `b` (D2_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
3. `c` (B1_0 W) (3,7)'den kaldır → duvar üstünden x=7 üstüne taşı → bırak → (7,1)'ye iner — duvar üstü, doğru
4. `p` (D2_90 W) (4,3)'den sağa → geçitten raya → (6,3)'de bırak — ray, doğru
5. `d` (D2_90 R) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru

### Bölüm 5 — İki Odalı Ev (Two-Room House)

| Alan | Değer |
|---|---|
| Öğretilen | S1 Kayan Şantiye + kamyon teslimatı |
| Zorluk / hedef kazanma | Normal / %80 |
| Duvar | height 4; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Sol Oda `["RR", "WW", "WW", "GG"]` → 2. Sağ Oda `["RR", "GG", "WG", "WW"]` |
| Desen | yatay şerit → çapraz şerit |
| Renkler / şekiller | G, R, W (3) / B1, C3, D2, O4 |
| Saha doluluğu | 46/48 = %95,8 |
| Minimum hamle (el çözümü) | 6 |
| Hamle bütçesi | 6 + 5 = **11** |
| YAO (çözüm) | 6 duvar üstü / 6 yerleşim = **%100** |
| Öğretici | tut.S1: dilim bitince kayma ve kamyonu oynat; 'Kamyonda' göstergesini vurgula. |

**Tasarım niyeti:** Oyuncu bir dilim bitince şantiyenin kaydığını ve kamyonun yeni malzemeyi sahanın boşalan yerlerine döktüğünü keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

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
| `d` | `D2_90` | W | (4,6) | şaşırtma (başta tutulabilir) |
| `e` | `O4_0` | G | (0,4) | dolgu |
| `f` | `O4_0` | R | (2,4) | dolgu |
| `g` | `O4_0` | W | (4,4) | şaşırtma (başta tutulabilir) |
| `h` | `O4_0` | R | (0,2) | dolgu |
| `i` | `O4_0` | G | (2,2) | dolgu |
| `j` | `O4_0` | W | (4,2) | dolgu |
| `k` | `O4_0` | W | (0,0) | dolgu |
| `l` | `O4_0` | R | (2,0) | dolgu |
| `m` | `O4_0` | G | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `B1_0` R x=2, `C3_0` W x=0, `C3_180` G x=2, `D2_90` R x=4

Çözüm (hamle hamle, doğrulandı):

1. `b` (D2_90 G) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `a` (O4_0 W) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
3. `c` (D2_90 R) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
4. `k1_1` (C3_0 W) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
5. `k1_2` (C3_180 G) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
6. `k1_3` (D2_90 R) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

### Bölüm 6 — Uzun Gövde (Tall Trunk)

| Alan | Değer |
|---|---|
| Öğretilen | W2 Yüksek Duvar (Vinç Alanı'na kaldırma) |
| Zorluk / hedef kazanma | Normal / %80 |
| Duvar | height 8; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Uzun Gövde `["YY", "WY", "WW", "GG", "WW", "WW", "GG"]` |
| Desen | yatay şerit + çapraz şerit |
| Renkler / şekiller | G, W, Y (3) / B1, C3, D2, O4 |
| Saha doluluğu | 47/48 = %97,9 |
| Minimum hamle (el çözümü) | 6 |
| Hamle bütçesi | 6 + 5 = **11** |
| YAO (çözüm) | 6 duvar üstü / 6 yerleşim = **%100** |
| Öğretici | tut.W2: Vinç Alanı'nı vurgula; blok en tepeye çıkınca geçiş oku. |

**Tasarım niyeti:** Oyuncu duvar tahtanın tepesine kadar yükselince bloğu Vinç Alanı'na kaldırması gerektiğini ve uzun düşüşü keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  A A B C E .   #   ~ ~
   y=6:  D D B C E E   #   Y Y
   y=5:  f f g g F F   #   W Y
   y=4:  f f g g h F   #   W W
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
| `E` | `C3_0` | W | (4,6) | hedef |
| `f` | `O4_0` | Y | (0,4) | dolgu |
| `g` | `O4_0` | W | (2,4) | dolgu |
| `F` | `C3_180` | Y | (4,4) | hedef |
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
5. `E` (C3_0 W) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru
6. `F` (C3_180 Y) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,5)'ye iner — duvar üstü, doğru

### Bölüm 7 — Çatı Altı (Under the Roof)

| Alan | Değer |
|---|---|
| Öğretilen | Kazı: sahada yeniden konumlandırma (K-10) |
| Zorluk / hedef kazanma | Normal / %75 |
| Duvar | height 5; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Kiriş `["RR", "RR", "WW", "WW"]` → 2. Saçak `["GG", "RR", "WR", "WW"]` |
| Desen | bant → çapraz şerit |
| Renkler / şekiller | G, R, W (3) / B1, C3, D2, O4 |
| Saha doluluğu | 44/48 = %91,7 |
| Minimum hamle (el çözümü) | 7 |
| Hamle bütçesi | 7 + 5 = **12** |
| YAO (çözüm) | 5 duvar üstü / 5 yerleşim = **%100** |
| Öğretici | tut.l7.dig: kırmızı bloğu boş köşeye taşı; altındaki ahşap açılır. |

**Tasarım niyeti:** Oyuncu gerekli bloğun üstündekini sahada boş bir yere taşımanın (kazı) bir hamleye değdiğini keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

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

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `B1_0` R x=2, `C3_180` R x=2, `C3_0` W x=2, `B1_0` G x=3, `D2_90` G x=0

Çözüm (hamle hamle, doğrulandı):

1. `b` (O4_0 R) sahada (2,6) → (0,6) — kazı
2. `f` (O4_0 W) (2,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
3. `b` (O4_0 R) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,2)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
4. `k1_3` (B1_0 G) sahada (3,7) → (1,7) — kazı
5. `k1_2` (C3_0 W) (2,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
6. `k1_1` (C3_180 R) (2,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
7. `k1_4` (D2_90 G) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

### Bölüm 8 — Bahçe Çiti (Garden Fence)

| Alan | Değer |
|---|---|
| Öğretilen | Y5 Ağır Malzeme + Çekiç açılır |
| Zorluk / hedef kazanma | Normal / %75 |
| Duvar | height 5; geçit: yok |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Çit 1 `["WW", "W.", "WW", "GG"]` → 2. Çit 2 `["WW", ".W", "WW", "GG"]` |
| Desen | çit (pencereli şerit), ayna dilim |
| Renkler / şekiller | G, W, Y (3) / B1, C3, D2, O4, Q9 |
| Saha doluluğu | 39/48 = %81,2 |
| Minimum hamle (el çözümü) | 7 |
| Hamle bütçesi | 7 + 5 = **12** |
| YAO (çözüm) | 6 duvar üstü / 6 yerleşim = **%100** |
| Öğretici | tut.Y5: paleti göster; 'Kenara çek ya da kır.' Çekiç ücretsiz denemesi. |

**Tasarım niyeti:** Oyuncu ağır paletin duvarı geçemediğini, yer açılınca kenara çekilebileceğini ya da Çekiç'le kırılabileceğini keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  . . . Q Q Q   :   ~ ~
   y=6:  . . . Q Q Q   :   ~ ~
   y=5:  . . . Q Q Q   :   ~ ~
   y=4:  a a b C G G   #   ~ ~
   y=3:  c c d C C e   #   W W
   y=2:  c c d w w e   #   W +
   y=1:  f f g g h h   #   W W
   y=0:  f f g g h h   #   G G
```

| Kimlik | Şekil | Renk | Çapa (x,y) | Rol |
|---|---|---|---|---|
| `Q` | `Q9_0` | W | (3,5) | şaşırtma (başta tutulabilir), ağır |
| `a` | `D2_90` | Y | (0,4) | şaşırtma (başta tutulabilir) |
| `b` | `B1_0` | G | (2,4) | şaşırtma (başta tutulabilir) |
| `G` | `D2_90` | G | (4,4) | hedef |
| `C` | `C3_0` | W | (3,3) | hedef |
| `c` | `O4_0` | Y | (0,2) | dolgu |
| `d` | `D2_0` | W | (2,2) | dolgu |
| `w` | `D2_90` | W | (3,2) | hedef |
| `e` | `D2_0` | G | (5,2) | dolgu |
| `f` | `O4_0` | G | (0,0) | dolgu |
| `g` | `O4_0` | W | (2,0) | dolgu |
| `h` | `O4_0` | Y | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `B1_0` G x=5, `D2_90` W x=3, `C3_270` W x=3, `D2_90` G x=4

Çözüm (hamle hamle, doğrulandı):

1. `Q` (Q9_0 W) sahada (3,5) → (0,5) — kazı
2. `G` (D2_90 G) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
3. `C` (C3_0 W) (3,3)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
4. `w` (D2_90 W) (3,2)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
5. `k1_3` (D2_90 G) (4,5)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
6. `k1_2` (C3_270 W) (3,3)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
7. `k1_1` (D2_90 W) (3,2)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru

### Bölüm 9 — İp Merdiven (Rope Ladder)

| Alan | Değer |
|---|---|
| Öğretilen | W3 Dar Geçit |
| Zorluk / hedef kazanma | Normal / %70 |
| Duvar | height 6; geçit: y=3 boy 1 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Halat `["GG", "GG", "YY", "..", "WW", "WW"]` → 2. Basamaklar `["WW", "W.", "GG", "G.", "YY"]` |
| Desen | asılı basamak + pencereli şerit |
| Renkler / şekiller | G, W, Y (3) / B1, D2, O4 |
| Saha doluluğu | 44/48 = %91,7 |
| Minimum hamle (el çözümü) | 8 |
| Hamle bütçesi | 8 + 5 = **13** |
| YAO (çözüm) | 7 duvar üstü / 8 yerleşim = **%88** |
| Öğretici | tut.W3: 2 sıralık sarı bloğu geçide sokmayı dene → sığmaz; tek sıralık blok geçer. |

**Tasarım niyeti:** Oyuncu dar geçide yalnızca tek sıra boyundaki blokların girdiğini ve asılı basamağın yalnızca raydan kurulabildiğini keşfeder.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

```
       x: 0 1 2 3 4 5   D   6 7
   y=9:  · · · · · ·   :   · ·  ← Vinç Alanı
   y=8:  · · · · · ·   :   · ·
   y=7:  G G x x W W   :   ~ ~
   y=6:  G G z z W W   :   ~ ~
   y=5:  f f g g Y Y   #   G G
   y=4:  f f h D . .   #   G G
   y=3:  i i j D . .   =   Y Y
   y=2:  i i j k l l   #   + +
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
| `h` | `B1_0` | G | (2,4) | dolgu |
| `D` | `D2_0` | Y | (3,3) | şaşırtma (başta tutulabilir) |
| `i` | `O4_0` | W | (0,2) | dolgu |
| `j` | `D2_0` | G | (2,2) | dolgu |
| `k` | `B1_0` | Y | (3,2) | dolgu |
| `l` | `D2_90` | W | (4,2) | şaşırtma (başta tutulabilir) |
| `n` | `O4_0` | G | (0,0) | dolgu |
| `o` | `O4_0` | Y | (2,0) | dolgu |
| `p` | `O4_0` | W | (4,0) | dolgu |

Kamyon partileri:

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `D2_90` W x=4, `B1_0` W x=4, `D2_90` G x=4, `B1_0` G x=5, `D2_90` Y x=4, `B1_0` W x=0, `D2_0` G x=1

Çözüm (hamle hamle, doğrulandı):

1. `W` (O4_0 W) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
2. `Y` (D2_90 Y) (4,5)'den sağa → geçitten raya → (6,3)'de bırak — ray, doğru
3. `G` (O4_0 G) (0,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru
   - Dilim 1 tamamlandı → kayma, kamyon partisi 1 düşer.
4. `k1_4` (D2_90 Y) (4,7)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
5. `k1_3` (B1_0 G) (5,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
6. `k1_2` (D2_90 G) (4,5)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,2)'ye iner — duvar üstü, doğru
7. `k1_1` (B1_0 W) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,3)'ye iner — duvar üstü, doğru
8. `k1_0` (D2_90 W) (4,3)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,4)'ye iner — duvar üstü, doğru

### Bölüm 10 — Ağaç Ev Tamam! (Treehouse Done!)

| Alan | Değer |
|---|---|
| Öğretilen | Bölüm finali (yüksek duvar + pencere + dar geçit + ağır) + Vinç açılır |
| Zorluk / hedef kazanma | Zor / %45 |
| Duvar | height 8; geçit: y=3 boy 1 (static) |
| Yerçekimi | build `normal`, yard `false` |
| Dilimler | 1. Gövde `["GG", "WW", "W.", "WW", "WW"]` → 2. Pencere Katı `["RR", "RR", "WW", "..", "RR", "RR"]` → 3. Çatı `[".R", "RR", "RR", "GG"]` |
| Desen | gövde + pencere katı + çatı |
| Renkler / şekiller | G, R, W (3) / B1, C3, D2, O4, Q9 |
| Saha doluluğu | 45/48 = %93,8 |
| Minimum hamle (el çözümü) | 11 |
| Hamle bütçesi | 11 + 3 = **14** |
| YAO (çözüm) | 8 duvar üstü / 9 yerleşim = **%89** |
| Öğretici | tut.l10.crane: bölüm sonunda Vinç güçlendiricisi tanıtımı (ücretsiz deneme). |

**Tasarım niyeti:** Oyuncu hikaye bölümündeki bütün araçları sırayla kullanır: paleti doğru anda kenara çekmek, dar geçitten asılı katı kurmak, kamyon dökümünü kazıyla açmak.

Blockout (D = duvar sütunu: `#` kapalı, `=` geçit, `:` duvar üstü hava; şantiyede 1. dilimin planı, `+` = `.` boş kalacak hücre, `~` = plan dışı):

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
| `a` | `B1_0` | G | (1,4) | dolgu |
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

- Parti 1 (dilim 1 tamamlanınca, dizi sırasıyla): `O4_0` R x=4, `O4_0` R x=4, `B1_0` W x=3, `B1_0` G x=3
- Parti 2 (dilim 2 tamamlanınca, dizi sırasıyla): `B1_0` R x=4, `O4_0` R x=4, `D2_90` G x=4, `B1_0` G x=5

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
8. `k2_3` (B1_0 G) sahada (5,7) → (3,7) — kazı
9. `k2_2` (D2_90 G) (4,6)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,0)'ye iner — duvar üstü, doğru
10. `k2_1` (O4_0 R) (4,4)'den kaldır → duvar üstünden x=6 üstüne taşı → bırak → (6,1)'ye iner — duvar üstü, doğru
11. `k2_0` (B1_0 R) (4,3)'den kaldır → duvar üstünden x=7 üstüne taşı → bırak → (7,3)'ye iner — duvar üstü, doğru

---

## 3. Bölüm 11–50 (tasarım kayıtları)

Sütunlar: **Kurulum** = bölüm genelindeki parametreler (duvar, geçitler, yerçekimi, mod, engel sayıları); **Hamle** =
tahmini minimum + tampon = bütçe; **Hedef** = "orta" bot kazanma oranı. Duvar ve yerçekimi bölüm boyunca sabittir
(geçitler, fan, `gravity` dilimden dilime değişmez); dilimden dilime değişebilenler plan (`.`, `?`), moloz ve kamyonla
gelen blokların bayraklarıdır (cam, balon, harç, ıslak, zincir).

### Hikaye Bölümü 2 — Mahalle Fırını (renkler W Y G R + O C; en çok 4)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Fırın Temeli | Y1 Ahşap Kasa (1 kat) | Duvar 5, sabit geçit y=1 boy 2; 6 kasa hp 1 (hedef değil) | 2 | O, C, W | 9+5 = 14 | Normal (nefes) | %80 | Kasa yanındaki bloğu almanın kasayı kırdığını ve yolu açtığını keşfetmek. |
| 12 | Tezgâh | `clear` hedefi (kasa ×6, 2 kat) | Duvar 6, sabit geçit y=2 boy 2; 6 kasa hp 2 | 2 | O, C, Y, W | 11+5 = 16 | Normal | %70 | Kazı hamlesini kasa kırma sayacına da yarayacak yerden seçmek. |
| 13 | Vitrin | W4 Kepenk (period 2, phase 0) + Geri Al açılır | Duvar 6, kepenk y=2 boy 2; vitrin camı `.` | 2 | O, C, R, W | 11+5 = 16 | Normal | %70 | Kepenk kapalıyken duvar üstü yerleşim yapıp açık hamleyi raya saklamak. |
| 14 | Un Deposu | Y6 Saha Yerçekimi | Duvar 5, geçit yok; `gravity.yard = true` | 2 | W, Y, C | 10+5 = 15 | Normal | %70 | Alttan bir blok çekince üsttekilerin inip yeni yol açtığını (ya da kapattığını) okumak. |
| 15 | Baca | G-H Ağır yerçekimi | Duvar 7, geçit yok; `gravity.build = high`; dilimler 2×8 | 2 | R, C, O | 13+3 = 16 | **Zor** | %50 | Şantiyeye geçer geçmez 700 ms içinde doğru sütuna hizalamak; uzun baca boyunca hatasız dizmek. |
| 16 | Kapı Kemeri | W5 Kayar Kapı (range [1,3], boy 1) | Duvar 6; kemer = 2 satır `.`, üstü raydan | 2 | O, C, W | 10+5 = 15 | Normal (nefes) | %80 | Kapının hangi satıra geleceğini sayıp kemerin üstünü o hamlede raydan kurmak. |
| 17 | Eski Fırın | S4 Moloz | Duvar 6, sabit geçit y=2 boy 1; 3 moloz (dilim 0: 2, dilim 1: 1); `clear debris 3` | 2 | R, C, Y, O | 12+5 = 17 | Normal | %70 | Molozu sahaya taşımanın hem şantiyeyi açtığını hem de sahada yer yediğini dengelemek. |
| 18 | Un Çuvalları | Y2 Çimento Torbası | Duvar 5; `gravity.yard = true`; 5 torba | 3 | W, Y, C | 14+5 = 19 | Normal | %65 | Torbaları yırtarak sütunları istenen sırada indirmek. |
| 19 | Tabela | Y7 Altın Vida (`collect 5`) | Duvar 6, sabit geçit y=3 boy 1; 5 vida (2'si kasa altında) | 2 | O, Y, R, C | 13+5 = 18 | Normal | %70 | Vida toplayan kazı sırasını inşaat sırasıyla örtüştürmek. |
| 20 | Fırın Açılışı | Bölüm finali + Açık Kepenk açılır | Duvar 7; kepenk y=1 boy 2 (period 2), kayar kapı range [3,5] boy 1; `gravity.yard = true`; moloz 2 | 4 | O, C, R, Y | 22+2 = 24 | **Çok Zor** | %35 | Kepenk, kayar kapı ve düşen sahayı aynı plan üzerinde zamanlamak. |

### Hikaye Bölümü 3 — Okul Kütüphanesi (+ B P; en çok 5)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 21 | Kütüphane Penceresi | S3 Cam Blok | Duvar 6, sabit geçit y=2 boy 2; cam bloklar B renkli | 2 | B, P, W, C | 11+5 = 16 | Normal (nefes) | %80 | Cam bloğu siluete yakın indirip öyle bırakmak; geçidin camı koruyan güvenli yol olduğunu görmek. |
| 22 | Renkli Raflar | W6 Boya Kapısı + Boya Fırçası açılır | Duvar 6, boya kapısı y=2 boy 1 renk P | 2 | B, P, Y, R | 12+5 = 17 | Normal | %70 | Boya kapısını "boyahane" gibi kullanıp bloğu sahaya geri almak, sonra duvar üstünden yerleştirmek. |
| 23 | Okuma Köşesi | G-L Hafif yerçekimi | Duvar 6; `gravity.build = low`; cam bloklar | 2 | B, P, G, W | 12+5 = 17 | Normal | %70 | Yavaş düşen bloğu bir sütun yönlendirip pencereyi ıskalamak; cam eşiğinin 4 olduğunu görmek. |
| 24 | Kitap Kolileri | Y3 Zincir | Duvar 5, sabit geçit y=1 boy 2; 4 zincirli blok; `clear chain 4` | 3 | P, O, C, B | 15+5 = 20 | Normal | %65 | Zinciri çözecek komşu hamlesini doğru yerleşimle aynı hamlede yapmak. |
| 25 | Saat Kulesi | Kombinasyon | Duvar 8, boya kapısı y=3 boy 1 renk Y; cam bloklar; dilimler 2×8 | 3 | B, P, C, Y, W | 19+3 = 22 | **Zor** | %45 | Uzun düşüşte camı korumak ve boyayı doğru blokta harcamak. |
| 26 | Arşiv Kapısı | W7 Kilitli Geçit + anahtar | Duvar 6, kilitli geçit y=2 boy 2; anahtar (1,3) altında | 3 | P, W, C, B | 15+5 = 20 | Normal (nefes) | %80 | Anahtarı açan kazıyı önce yapıp geçidi kestirme olarak kullanmak. |
| 27 | Mozaik Duvar | S7 Gizli plan `repeat` (period 2) | Duvar 6, sabit geçit y=2 boy 1; 2. ve 3. dilimin üst 4 satırı `?` | 3 | B, P, Y, G, R | 15+5 = 20 | Normal | %70 | Alt satırlardan deseni okuyup `?` hücrelerini doğru tahmin etmek. |
| 28 | Bahçe Duvarı | Y4 Islak Beton | Duvar 6; ıslak bloklar wetMoves 2–3 (kamyonla da gelir) | 3 | G, C, W, B | 16+5 = 21 | Normal | %70 | Kuruma süresini başka yerleşimlerle doldurup hamle israf etmemek. |
| 29 | Simetrik Cephe | S7 Gizli plan `mirrorOf` | Duvar 6, sabit geçit y=3 boy 1; dilim 2 = dilim 1'in aynası; 3 zincir | 2 | P, B, O, W | 14+5 = 19 | Normal | %65 | İlk dilimi hatasız kurup aynasını renk yer değiştirerek kurmak. |
| 30 | Kütüphane Açılışı | Bölüm finali | Duvar 7, boya kapısı y=1 boy 1 renk B + kilitli geçit y=4 boy 1; cam; gizli `repeat` | 4 | B, P, C, Y, W | 25+2 = 27 | **Çok Zor** | %30 | Boya, gizli desen, cam ve anahtarı tek planda sıralamak. |

### Hikaye Bölümü 4 — Deniz Feneri ve Köprü (bütün renkler; en çok 5)

| # | Yapı parçası | Öğretir | Kurulum | Dilim | Renkler | Hamle | Zorluk | Hedef | Niyet |
|---|---|---|---|---|---|---|---|---|---|
| 31 | Balıkçı İskelesi | S5 Döner Platform (`carouselEvery 4`) | Duvar 5, geçit yok; `build.mode = carousel` | 3 | B, W, C, Y | 15+5 = 20 | Normal (nefes) | %80 | Öndeki yüz dönmeden önce ona yerleştirilecek bloğu hazırda tutmak. |
| 32 | Rüzgârlı Kıyı | W8 Rüzgâr Fanı (`dir right`) | Duvar 6, sabit geçit y=2 boy 1 | 3 | B, R, W, Y | 15+5 = 20 | Normal | %70 | Rüzgârın ince blokları kaydırdığını gölgeden okuyup sütunu ona göre seçmek ya da bloğu siluete indirmek. |
| 33 | Fener Gövdesi | Kombinasyon | Duvar 8, fan `left`; cam bloklar; dilimler 2×8 | 3 | R, W, B, C | 17+5 = 22 | Normal | %65 | Yüksek duvar, rüzgâr ve camı aynı düşüşte hesaba katmak. |
| 34 | Fener Odası | Kombinasyon (zamanlama) | Duvar 6, kepenk y=2 boy 2 (period 2, phase 0); `carousel`, `carouselEvery 4` | 3 | Y, B, R, P | 17+5 = 22 | Normal | %65 | Kepenk ile platformun aynı ritimde döndüğünü fark edip ray hamlelerini o ana denk getirmek. |
| 35 | Islak Harç | Y8 Harçlı Blok | Duvar 6, kepenk y=3 boy 1 (period 3); harçlı bloklar 2. ve 3. partide | 3 | C, R, W, O | 18+3 = 21 | **Zor** | %45 | Harçlı bloğu yalnızca gölge yeşilken bırakmak; zorluk yeni engelden değil dar bütçeden gelir. |
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
   sonra şaşırtma sayısı). Proje sahibine açık soru olarak iletildi.
2. **Bölüm 4'ün geçidi zaten dardır** (brif: y=3 boy 1). Dar geçit (W3) kısıtı Bölüm 4'te sınanmaz (rayda tek sıralık
   doğru blok hazırdır); Bölüm 9'da iki sıralık şaşırtma blokları geçide sokulmaya çalışılınca öğretilir.
3. **Bölüm 5 ve 6 "Normal" etiketli tanıtım bölümleridir;** öğretim kuralı gereği sade tutuldu, hedef kazanma %80
   (Normal bandının üst ucu). Kazı (K-10) 7. bölümde öğretildiği için 1–6'da hiçbir çözüm kazı gerektirmez.
4. **Bölüm 35 Zor ve yeni mekanik öğretir** (brif). Zorluk yeni engelden değil, +3 tampondan ve bilinen kepenkten gelir;
   harçlı bloklar yalnızca 2. ve 3. partide, ilk dilim harçsız.
5. **Bölüm 50 "her dilimde farklı engel seti":** duvar ve yerçekimi bölüm boyunca sabit olduğundan dilime özgü engeller
   plan, moloz ve kamyonla gelen blok bayraklarıyla verilir; duvar engelleri (kilitli dar geçit, boya kapısı) bütün
   dilimlerde ortaktır.
6. **Bölüm 40 döner platform + asansör** birlikte: `build.elevator` ayrı alan (GDD K-24, öneri P-4).

## 5. Bölüm tasarım kontrol listesi (her JSON için)

- [ ] Renk sayısı ve açılmış renkler (§0 tablosu); şekiller açılmış (K-44); ağır yalnızca 8+.
- [ ] Saha doluluğu %80–100; saklı nesneler örtülü; moloz `segment` alanı dolu.
- [ ] En çok 1 yeni mekanik; `teaches` alanı ve öğretici adımları dolu.
- [ ] Solver çözümü var; YAO ≥ %60; `moves = min + tampon`.
- [ ] Ek hedefler (clear/collect) inşaatın son dilimi bitmeden tamamlanabilir (E-27'den kaçın).
- [ ] Kamyon partileri boşalan alana sığar ya da kuyruk bilinçli tasarlanmıştır; parti sırası "önce gereken en üstte"
      ilkesine uyar (kazı istenen yer hariç).
- [ ] Gölge her düşüşü doğru gösterir; gizli bilgi yalnızca `?` ile verilir (adalet ilkesi).
