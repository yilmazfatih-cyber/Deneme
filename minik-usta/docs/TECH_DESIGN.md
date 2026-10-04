# Teknik tasarım

Sahip: code-lead · Durum: **Faz 1 revizyonu (orkestratör kararları R-01…R-24 uygulandı; onay bekliyor)** · Tarih: 2026-10-04
Kaynaklar: `docs/BRIEF.md` (§4, §5, §7, §12), `CLAUDE.md`, `docs/DECISIONS.md`, `docs/review_inbox/_orchestrator_rulings.md`.
Kurallar için bağlayıcı kaynak **`docs/GDD.md` (K-01…K-46, K-35 hamle sonu hattı, E-01…E-32)** ve `docs/OBSTACLES.md`'dir
(W1…W8, Y1…Y8, S1…S8, G-H, G-L, etkileşim notları N1…N43); bu belge kuralı değiştirmez, nasıl uygulanacağını yazar (R-02).
Ölçüler ve görsel değerler `src/theme/tokens.json`'dan okunur (R-04). §16'daki S-1…S-28 GDD §15'te yanıtlandı; yeni
sorular S-29'dan başlar. Önerilen kararlar §17'de **P-n** numarasıyla durur (DECISIONS.md'ye orkestratör taşır).

---

## 0. Doğrulanmış gerçekler (2026-10-04)

Bu belgedeki her sürüm ve platform iddiası aşağıdaki komutlarla doğrulandı; hafızadan yazılmadı.

| Konu | Değer | Nasıl doğrulandı |
| --- | --- | --- |
| zod | **4.6.5** (MIT; 2026-09-13) | `npm view zod version`, `npm view zod time` |
| zod paket boyutu (örnek bölüm şeması, minify) | `zod`: 92,0 KB / **24,8 KB gzip** · `zod/mini`: 23,3 KB / **7,2 KB gzip** | scratchpad'de rolldown ile paketleyip ölçüldü |
| zod 4 API | `z.templateLiteral`, `z.strictObject`, `z.discriminatedUnion`, `z.prettifyError`, `zod/mini` içinde `.check(z.regex(...))`, `z.superRefine` mevcut | scratchpad'de çalıştırıldı |
| @capacitor/core, cli, ios, android | **8.5.2** | `npm view @capacitor/core version` |
| @capacitor/haptics | **8.0.2** (peer `@capacitor/core >=8.0.0`) | `npm view` |
| Capacitor 8 gereksinimleri | Node ≥ 22, Xcode ≥ 26.0, iOS dağıtım hedefi 15.0, Android Studio Otter 2025.2.1+, minSdk 24, compile/target SDK 36; iOS'ta SPM varsayılan; `adjustMarginsForEdgeToEdge` kaldırıldı → System Bars eklentisi + CSS `env()` | `ionic-team/capacitor-docs` → `docs/main/updating/8-0.md` (capacitorjs.com proxy'de engelli) |
| Node | **v22.22.0**; `.ts` dosyalarını bayraksız çalıştırıyor (type stripping); `enum` → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`; uzantısız göreli import → `ERR_MODULE_NOT_FOUND` | scratchpad deneyi |
| TypeScript 6.0.3 | `allowImportingTsExtensions` + `erasableSyntaxOnly` çalışıyor (enum → TS1294) | scratchpad `tsc -p` |
| @types/node (22 hattı) | 22.20.5 | `npm view @types/node@22 version` |
| ZzFX | **1.4.0**, MIT (© 2019 Frank Force), `ZzFX.js` 10,3 KB / 3,6 KB gzip, `ZzFXMicro.min.js` 1,2 KB / 0,9 KB gzip, `.d.ts` yok, `@types/zzfx` yok. **Modül yüklenirken `new AudioContext` oluşturuyor** ve `randomness` parametresi `Math.random` kullanıyor | `npm pack zzfx@1.4.0`, kaynak okundu |
| Vibration API | Chrome Android 32+ (Chrome 60+ kullanıcı hareketi ister); Firefox Android 79+ `true` döner ama **titreşmez**; **Safari / iOS Safari: desteklenmiyor** (`version_added: false`, iOS aynası) | MDN browser-compat-data `api/Navigator.json` (ham GitHub) |
| Phaser | **4.2.1** "Giedi"; WebGL bağlamı `getContext('webgl')` (WebGL1); Canvas renderer "deprecated" | `node_modules/phaser/package.json`, `src/renderer/webgl/WebGLRenderer.js` |
| Phaser 4 farkları (bizi ilgilendiren) | `Create.GenerateTexture` / `TextureManager.generate` **kaldırıldı**; `DynamicTexture`/`RenderTexture` çizimleri için `render()` **zorunlu**; FX + Mask → **Filters**; `setTintFill` yok → `setTint().setTintMode(Phaser.TintModes.FILL)`; `roundPixels` varsayılan `false`; `Geom.Point` → `Vector2`; `Math.TAU` = 2π | `changelog/v4/4.0/MIGRATION-GUIDE.md`, `skills/v4-new-features` |
| Phaser 4 doku API'si | `textures.createCanvas(key,w,h) → CanvasTexture` (`context`, `add(frame, 0, x, y, w, h)`, `refresh()`); `Graphics.generateTexture` hâlâ var | `types/phaser.d.ts` |
| Phaser 4 girdi | Dokunma olayları DOM işleyicisinde **anında** işlenir (`InputManager.onTouchMove → updateInputPlugins`); her `touchmove`'da `document.elementFromPoint` ile parmağın tuval üstünde olup olmadığına bakılır, tuval dışındaysa işaretçi güncellenmez | `src/input/InputManager.js`, `touch/TouchManager.js` |
| Phaser 4 ölçek | `FIT`, `EXPAND` (3.80'den beri), `RESIZE`, `ENVELOP`; 4.2.1'de "ScaleManager parent'a göre yeniden boyutlanmıyordu" hatası düzeltildi | `skills/scale-and-responsive`, `CHANGELOG-v4.2.1.md` |
| Phaser 4 ses | `WebAudioSound` arabelleği `game.cache.audio.get(key)`'den alır; yöneticide otomatik kilit açma (`unlock`) var → kendi `AudioBuffer`'larımızı önbelleğe ekleyebiliriz | `src/sound/webaudio/*.js` |
| Playwright / Chromium | @playwright/test 1.63.0 Chromium **rev 1243 (153.0.8010.12)** bekliyor; kurulu olan `/opt/pw-browsers/chromium` → **rev 1194, Chromium 141.0.7390.37** → `executablePath` zorunlu | `playwright-core/browsers.json`, `chrome --version` |
| Headless WebGL | WebGL2 var: `ANGLE (SwiftShader, Vulkan 1.3)` → yazılımsal GPU | Playwright ile ölçüldü |
| CDP CPU yavaşlatma | `Emulation.setCPUThrottlingRate {rate: 4}` çalışıyor (boş sayfada 60 FPS) | Playwright + CDP ile ölçüldü |
| ESLint 10.12.0 | §1.3'teki `no-restricted-imports` / `no-restricted-globals` / `no-restricted-properties` / `no-restricted-syntax` bloğu birebir haliyle 15 ihlalin 15'ini yakaladı (Phaser, `zod`, `node:`, `../scenes`, `../config`, `../debug`, enum, `Math.random`, `Date.now`, `new Date`, `window`, `performance`, `sessionStorage`, `setTimeout`, `console`); `zod/mini`, `./grid.ts`, `./obstacles/…` geçti | scratchpad'de çalıştırıldı |
| Long Animation Frames API | Chrome 123+ (Android aynası), Safari yok | MDN BCD `api/PerformanceLongAnimationFrameTiming.json` |
| Hareket BFS prototipi | 9×10 ızgarada polyomino BFS, %80 dolu saha: 19–51 erişilebilir durum, **2–11 µs** (Chromium, 1×), **11–27 µs** (4× yavaşlatma), **17–41 µs** (6×). Revizyondaki 8×10 kenar modeli (§2.2) düğüm sayısını azaltır; ölçüm üst sınır olarak geçerli | scratchpad prototipi, Playwright + CDP |

---

## 1. Mimari ve modül haritası

### 1.1 Katmanlar

```
                ┌──────────────────────────── scenes/ (Phaser 4) ────────────────────────────┐
                │ Boot · Splash · Home · PreLevel · Level · Story · Bridge · League · Shop   │
                │ level/: BoardView · PieceView · DragController · ShadowView · EventPlayer   │
                └──────┬───────────────┬───────────────────┬──────────────────┬──────────────┘
                       │               │                   │                  │
                     ui/            meta/              services/           theme/
            (Button, Popup,   (economy, lives,   (save, analytics,   (tokens.json okuma,
             TopBar, Label…)   stars, tasks,      events+bots, i18n,  prosedürel doku,
                               streak, unlocks)   audio, haptics,     draw/ saf Canvas2D
                                                  clock, platform)    çizerleri)
                       │               │                   │
                       └───────────────┴─────────┬─────────┘
                                                 ▼
                               core/  (saf, deterministik; yalnızca zod/mini)
                                                 ▲
                                    tools/ (Node; core + theme/draw)
```

Bağımlılık yönü yalnızca aşağı doğrudur. **core hiçbir şeyi import etmez** (izinli tek dış paket: `zod/mini`).

### 1.2 Klasörler ve dosyalar

| Yol | İçerik | Bağımlı olabileceği |
| --- | --- | --- |
| `src/core/types.ts` | `ColorCode`, `ShapeKind`, `ShapeId`, `PieceId`, `Move`, `GameEvent` birleşimi | — |
| `src/core/rng.ts` | `mulberry32` (oyun RNG'si), `splitmix32` (anahtar üretimi), `hash32(a,b,c)` (murmur3 fmix; sayaç tabanlı RNG) | — |
| `src/core/coords.ts` | ızgara sabitleri, duvar sınırı satır maskeleri (§2.2; iç koordinat = genel koordinat) | — |
| `src/core/shapes.ts` | 0° tablosu (brif §5) + üretilen dönüşler, genişlik/yükseklik/ağır bayrağı, satır maskeleri (§3) | coords |
| `src/core/level/schema.ts` | zod/mini bölüm şeması (§8) — runtime ve araçlar **aynı** şemayı kullanır | zod/mini |
| `src/core/level/logic.ts` | mantıksal doğrulama kuralları (§8.3; hata kodları = GDD K-45), saf fonksiyon, `Issue[]` döner | shapes, coords |
| `src/core/level/mechanics.ts` | mekanik veri imzaları tablosu (OBSTACLES "veri imzası" sütununun kod karşılığı; K-45/9, R-21) | schema |
| `src/core/level/compile.ts` | `LevelData` → `CompiledLevel` (iç koordinat, gizli hücre çözümü K-32, kural seti, Zobrist tabloları) | hepsi |
| `src/core/state.ts` | `GameState` tampon düzeni, erişimciler, `cloneState`, `encodeState` (§2.4) | compile |
| `src/core/hash.ts` | Zobrist (§2.6) | rng, state |
| `src/core/grid.ts` | çarpışma maskeleri, sütun tepeleri, doluluk işlemleri | state |
| `src/core/movement.ts` | `beginDrag` → `DragSession` (BFS, raylar, yapışkan takip, yol) (§4) | grid |
| `src/core/gravity.ts` | `computeFall` (gölge + mantık ortak), `settleYard` (zincirleme), balon (§5) | grid, rules |
| `src/core/placement.ts` | **tek** `isCorrectPlacement` (K-16 + K-34), `eligibleTrowelCells`, K-17 geri sekme hedefi | gravity |
| `src/core/site.ts` | şantiye modu stratejisi: `segments` / `carousel` + `elevator` ofseti (K-22…K-24) | state |
| `src/core/delivery.ts` | partiler, FIFO kamyon kuyruğu (K-25…K-27, K-35 adım 8–9) | gravity |
| `src/core/goals.ts`, `combo.ts` | hedef sayaçları (K-41, K-42), Usta Serisi (K-33) | state |
| `src/core/moves.ts` | `applyMove` hamle hattı (§6, K-35) | hepsi |
| `src/core/boosters.ts` | K-36…K-40 ön koşul + etki, güçlendirici "mini hattı" (§6.4) | moves, placement |
| `src/core/deadlock.ts` | K-30 D1/D2/D3 tespiti + üç yardım yolu (§9.7) | moves, shapes |
| `src/core/obstacles/` | `types.ts` (eklenti arayüzü), `registry.ts`, **her engel ayrı dosya**: `W1_staticGap.ts` … `S8_balloon.ts`, `GH_heavyGravity.ts`, `GL_lightGravity.ts` (§7) | core içi |
| `src/core/ascii.ts` | tahtayı ASCII'ye çevirme (debug "kopyala", testler, önizleme) (Ek A) | state |
| `src/core/session.ts` | `GameSession`: durum + Geri Al anlık görüntüsü (K-39) + hamle günlüğü; `replay(level, log)` ile bölüm içi devam (K-43, §11.1); saf | moves |
| `src/scenes/` | Phaser sahneleri; `level/` altında tahta görünümü | core, ui, meta, services, theme |
| `src/ui/` | `Label` (yalnızca i18n anahtarı alır), `Button`, `Popup`, `TopBar`, `BoosterBar`, `GoalPanel`, `Panorama` | theme, services/i18n |
| `src/meta/` | `economy`, `lives`, `stars`, `tasks`, `streak`, `unlocks` — saf mantık + `Clock` enjeksiyonu | core/types, services (yalnız arayüz) |
| `src/services/` | `save`, `analytics`, `events` (EventService; `events/botSim.ts` saf bot modülü, §11.2), `consent`, `ads`, `iap` (§11.8; MVP'de sahte), `i18n`, `audio`, `haptics`, `clock`, `platform` | core/types |
| `src/theme/` | `tokens.json` (design-lead, D-003; salt okunur), `tokens.ts` (tipli yükleyici + zod/mini kontrolü), `layout.ts` (`layout.*` → ızgara, FIT/EXPAND çapaları, §10.1), `textures.ts` (açılış atlası + bölüm başı pişirme, §10.2), `draw/` (saf Canvas2D çizerleri; level-preview de kullanır) | — |
| `src/i18n/` | `tr.json`, `en.json` | — |
| `src/config/` | `display.ts` (mevcut) | — |
| `src/debug/` | geliştirme paneli; **yalnızca** `import.meta.env.DEV` iken dinamik import (R-20; üretimde `?debug=1` etkisiz) | hepsi |
| `src/harness/` | Playwright kancaları (`window.__harness`: bölüm yükle, golden oynat, durum oku); yalnızca `vite build --mode harness` paketine girer, mağaza/web üretim paketine girmez (§12.2) | core, scenes |
| `tools/` | `validate-levels.ts`, `solve.ts` (+ `solve-worker.ts`), `playtest-bot.ts`, `level-preview.ts`, `screens.ts`, `perf.ts`, `rule-coverage.ts`, `lib/` | core, theme/draw |
| `tests/` | `core/`, `obstacles/`, `meta/`, `services/`, `tools/`, `golden/` (solver çözümleri), `fixtures/` | hepsi |

### 1.3 Bağımlılık kurallarının zorlanması

İki bağımsız bekçi:

**(a) ESLint** — `eslint.config.js`'e eklenecek blok (ESLint 10.12.0'da scratchpad'de doğrulandı):

```js
{
  files: ['src/core/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'phaser', message: 'core is pure: no Phaser' },
        { name: 'zod', message: 'core uses zod/mini (bundle size, see TECH_DESIGN §8)' },
      ],
      patterns: [
        { regex: '^node:', message: 'core is pure: no Node APIs' },
        { regex: '(^|/)(scenes|ui|meta|services|theme|i18n|tools|debug|config)(/|$)',
          message: 'core must not import outer layers' },
      ],
    }],
    'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage',
      'sessionStorage', 'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval',
      'fetch', 'process', 'console'],
    'no-restricted-properties': ['error',
      { object: 'Math', property: 'random', message: 'use core/rng (seeded)' },
      { object: 'Date', property: 'now', message: 'core has no clock' }],
    'no-restricted-syntax': ['error',
      { selector: "NewExpression[callee.name='Date']", message: 'core has no clock' },
      { selector: 'TSEnumDeclaration', message: 'erasable syntax only (Node type stripping)' }],
  },
},
{
  files: ['tools/**/*.ts'],
  rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'phaser', message: 'tools run in Node' }],
    patterns: [{ regex: '(^|/)(scenes|ui)(/|$)', message: 'tools may import core and theme/draw only' }] }] },
},
{
  files: ['src/meta/**/*.ts', 'src/services/**/*.ts'],
  rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'phaser', message: 'meta/services are engine-free' }],
    patterns: [{ regex: '(^|/)(scenes|ui)(/|$)', message: 'no upward imports' }] }] },
},
{ // R-14, BUSINESS E8: bot simülasyonu ödeme ve ekonomi verisini göremez
  files: ['src/services/events/**/*.ts'],
  rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'phaser', message: 'engine-free' }],
    patterns: [{ regex: '(^|/)(meta/economy|services/(save|iap|ads|analytics))(/|$)',
      message: 'bot sim must be independent of purchases/economy/save (E8)' },
      { regex: '(^|/)(scenes|ui)(/|$)', message: 'no upward imports' }] }] },
},
{ // R-20: debug ve harness yalnızca dinamik importla, ortam bayrağının arkasında
  files: ['src/**/*.ts'], ignores: ['src/main.ts', 'src/debug/**', 'src/harness/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [{ regex: '(^|/)(debug|harness)(/|$)',
    message: 'load debug/harness only via import.meta.env guarded dynamic import in main.ts' }] }] },
},
```

**(b) Ayrı tip denetimi** — `tsconfig.core.json`: `"lib": ["ES2022"]`, `"types": []`, `include: ["src/core"]`. DOM ya da Node
tiplerine dokunan her core dosyası `tsc -p tsconfig.core.json` ile derlenemez (ör. `window` → TS2304). `npm run typecheck`
üç projeyi de çalıştırır: `tsconfig.json` (oyun), `tsconfig.core.json`, `tsconfig.tools.json` (`types: ["node"]`).

### 1.4 Çalışma zamanı akışı (bir hamle)

```
pointerdown → DragController → core.beginDrag(state, pieceId)   [BFS bir kez, §4]
pointermove → DragSession.nearest(finger) → PieceView konumu + ShadowView (computeFall)   [≤ 0,05 ms]
pointerup   → GameSession.commit({kind:'drag', pieceId, to, via?, steer?})   [G-L: commit düşüş bitince/dokunuşta, §4.7]
            → core.applyMove(state, move, sink) → GameEvent[] (K-35 adımlarına ayrılmış)
            → hamle günlüğü kayda yazılır (K-43, §11.1)
            → EventPlayer olayları adım sırasıyla oynatır; yeni pointerdown tahta animasyonlarını son kareye atlatır,
              girdi yalnızca dilim kayması / kamyon / Kamyon Yardımı sırasında kilitli (R-12, §6.3)
```

Çekirdek tek doğruluk kaynağıdır; sahne durumu **asla** kendisi değiştirmez, yalnızca olayları oynatır ve
`DragSession`'ın salt okunur sorgularını kullanır. Aynı `applyMove` solver, bot ve testlerde de çalışır (kural ikizi yok).

---

## 2. Çekirdek veri modeli

### 2.1 Temel tipler

```ts
type ColorCode = 'W' | 'Y' | 'G' | 'R' | 'O' | 'C' | 'B' | 'P';          // brif §6; iç gösterim 0..7
type ShapeKind = 'B1' | 'D2' | 'I3' | 'I4' | 'O4' | 'C3' | 'L4' | 'J4' | 'T4' | 'S4' | 'Z4' | 'I5' | 'Q9';
type Rotation = 0 | 90 | 180 | 270;
type ShapeId = `${ShapeKind}_${Rotation}`;                                 // iç gösterim 0..51
type PieceId = number;                                                    // bölüm içinde sabit indeks
type CellIndex = number;                                                  // ızgara: iy * 8 + ix
type Zone = 0 /* yard */ | 1 /* site */ | 2 /* queue (kamyonda) */ | 3 /* gone (kırıldı/çekiç) */;
interface Anchor { ix: number; iy: number }                               // kutunun sol alt köşesi (genel koordinatla aynı)
type DragMode = 0 /* FREE */ | number /* 1 + gapIndex = RAIL */;
interface DragNode { ix: number; iy: number; mode: DragMode }             // kodda tek tamsayı: (mode*10+iy)*8+ix
```

### 2.2 Izgara ve duvar sınırı — karar: **kenar modeli** (R-03, P-1 revizyonu)

Genel koordinat (K-01, bölüm JSON'u, analytics, testlerin okunur çıktısı): x = 0–7, y = 0–7 tahta, **y = 8–9 Vinç Alanı**
(K-05). Saha x = 0–5 (K-02), şantiye x = 6–7 (K-03). Duvar, x = 5 ile x = 6 arasındaki **sıfır genişlikli sınırdır**
(K-04); hücresi yoktur. Çekirdek ızgarası **8 sütun × 10 satır = 80 hücre** ve iç koordinat = genel koordinattır
(dönüşüm fonksiyonu yok, hata kaynağı da yok).

```
  y   x: 0 1 2 3 4 5 ┃ 6 7
  9      . . . . . . ┆ . .     Vinç Alanı (hava, K-05); sınır her zaman açık
  8      . . . . . . ┆ . .
  7      ■ ■ ■ ■ ■ ■ ┃ ░ ░     ┃ sınır satırı kapalı (y < height ve açık geçit satırı değil)
  4      ■ ■ ■ ■ ■ ■ ═ ▒ ▒     ═ açık geçit satırı (W1…W7)
  …                  ┆ = duvar üstü hava (y ≥ height)
  0      ■ ■ ■ ■ ■ ■ ┃ ▒ ▒
         └─ saha ──┘   site
```

**Sınır maskeleri** (10 bitlik satır maskesi, bölüm başında ve geçit değişince yenilenir):
`openFree = bitler y ≥ height` (duvar üstü hava + Vinç Alanı) · `openRail[g] = g'nin satırları` (geçit açıksa; W4 kapalı,
W7 kilitli ise 0; K-40 Açık Kepenk etkinse W4/W7 için açık).

**Sınırı geçme kuralı** (eşdeğerlik: GDD K-05, K-07 satır 4, K-11, K-12, E-06, E-28 sonuçları değişmez):
- Yatay bir adımda x = 5 ↔ x = 6 arasında yer değiştiren her hücre, **kendi satırında** sınırı geçer; o satır mevcut
  kipin açık maskesinde olmalıdır (FREE: `openFree`; RAIL(g): `openRail[g]`). Şekil başına önceden hesaplanmış
  `colRows[shape][c]` (sütun `c`'nin satır maskesi) ile tek AND işlemi: `(colRows[s][5 − ix] << iy) & ~open == 0`.
- Sınırı kesen (hücreleri iki yanda olan) bir konum yalnızca sürüklemede ara konum olabilir; iki yanda hücresi bulunan
  her satır açık olmalıdır. Ağır olmayan bloklar ≤ 2 geniş olduğundan kesen konum her zaman sütun 5–6'dır.
- Böylece serbest kipte sınırdan geçen her hücre `y ≥ height` satırındadır (K-05 "açık yükseklik" sonucu birebir:
  `height = 8` iken yalnızca boyu ≤ 2 olan bloklar aşar). Ray kipinde K-12 "bloğun **bütün** satırları geçidin içinde"
  açık bir düğüm koşuludur (§4.2); kenar modeli bunu kendiliğinden vermediği için ayrı yazılır ve test edilir.
- Değişen tek şey ara konum sayısıdır: 2 genişlikli blok geçitte 3 yerine 1 ara konumdan geçer. Bu yalnızca K-08'in
  "BFS adımı az olan" eşitlik bozucusunu (görsel) etkiler.

Testler kimlikle sabitlenir: "K-05 3-tall piece cannot clear an 8-high wall", "K-12 piece must fit the gap rows
entirely", "K-07 release straddling the boundary cancels", "E-06 …", "E-28 …".

**Ekran eşlemesi (R-04):** ölçüler `tokens.layout.*`'tan okunur, formül yoktur: `cellPx = 120`, `yardX`, `wallX`,
`wallW = 60` (0,5 hücre), `buildX`, `boardTopY`, `boardBottomY`, `craneTopY`. Hücre → ekran:
`x ≤ 5 → yardX + x·cellPx`, `x ≥ 6 → buildX + (x − 6)·cellPx`; satır `y → boardBottomY − (y + 1)·cellPx`. Sürüklenen
bloğun sürekli çapası `ax` için `screenX = yardX + ax·cellPx + s·wallW`, `s = clamp((ax − (6 − w)) / w, 0, 1)`: blok
tamamen sahadayken 0, tamamen şantiyedeyken 1; sınırı keserken duvarın ortasına simetrik kayar (2 geniş blok `ax = 5`'te
duvarı 30 px'lik iki yarıyla örter, komşu hücrelerin üstüne taşmaz). Duran hiçbir blok sınırı kesmez.
Değişmez testleri (`tests/theme/layout.test.ts`): `yardX + 6·cellPx == wallX`, `wallX + wallW == buildX`,
`buildX + 2·cellPx + marginPx ≤ 1080`, `boardBottomY − boardTopY == 8·cellPx`, `boardTopY − craneTopY == 2·cellPx`;
design-lead `layout.wallWidthCells` eklerse `wallW == wallWidthCells·cellPx`.

Şantiye yerel koordinatı: `sx ∈ {0,1}`, `sy ∈ 0..7` (aktif dilim çerçevesine göre). Tahta satırı `y = sy + elev`
(`elev` = asansör ofseti, K-24; asansörsüz bölümde 0). `y < elev` olan şantiye hücreleri platform gövdesidir (dolu).

### 2.3 Değişmez bölüm (`CompiledLevel`)

`compile(levelData)` bir kez çalışır; sonuç dondurulur (`Object.freeze`) ve bütün durumlar tarafından paylaşılır:
plan renkleri (her dilim için `Int8Array(16)`, `?` çözülmüş halde + `hiddenMask`), duvar ve geçit tanımları, partiler,
engel örnekleri, etkin kural listesi (§7), yerçekimi profili (K-19 tablosu), Zobrist tabloları, durum tampon düzeni.

### 2.4 Değişken durum (`GameState`) — karar: tek `Int32Array` tampon

```ts
interface GameState {
  readonly lvl: CompiledLevel;   // paylaşılır, kopyalanmaz
  buf: Int32Array;               // bütün değişken alanlar; düzen lvl.layout'ta
}
```

| Bölüm | Boyut | Alanlar |
| --- | --- | --- |
| başlık | 18 | `turn` (= GDD `m`), `movesLeft`, `combo`, `trowels`, `activeSeg`, `frontSeg` + `carouselT` (döner platform), `elev`, `elevDir`, `deliveryCursor`, `queueLen`, `rng` (mulberry32 durumu), `openShutterUntil` (K-40; `turn < değer` iken W4/W7 açık), `wrongCount`, `overWallCount`, `railCount`, `flags` (kazandı/kaybetti/kilitlendi), `reserved` |
| `yardOcc` | 6 × 10 | 0 boş · `pieceId+1` · `−(obstacleIdx+1)` (kasa, torba) |
| `siteOcc` | S × 16 | dilim başına yerel 2×8: 0 · `pieceId+1` (moloz dahil) · `−1` Altın Mala hücresi |
| `filled` | S × 2 | dilim ve sütun başına "doğru dolu" plan satırı bit maskesi (K-34; kilitli blok + Altın Mala; moloz ve yapışmış harç **girmez**) |
| parçalar | P × 9 | `shape`, `color`, `zone`, `x`, `y`, `seg`, `flags` (glass, mortar, balloon, chained, wet, locked K-14, debris, stuck), `counter` (wetMoves), `arrivedTurn` (kamyonla geldiği `turn`; E-31) |
| geçitler | G × 3 | `open`, `y` (kayar kapı), `phase` |
| engeller | O × 2 | `hp` / canlı mı, `aux` |
| gizli öğeler | H × 1 | vida/anahtar toplandı mı |
| hedefler | 3 | ilerleme sayaçları |
| kuyruk | Q | kamyonda bekleyen `pieceId`'ler, ekleme sırasıyla (FIFO; K-26, E-04) |
| açılan `?` | S | dilim başına 16 bitlik maske (K-32) |

Tipik bölüm: P ≈ 40, S ≤ 5 → ~450 alan ≈ **1,8 KB**. Okunurluk için erişimciler: `pieceX(s, id)`, `setPieceX(s, id, v)` …
(küçük, satır içi derlenen fonksiyonlar). Sıcak olmayan kod (UI, debug) `readPiece(s, id): PieceView` nesnesi kullanır.

**Neden değişken (mutable) + kopyalama, neden değişmez değil:**
- Solver saniyede 10⁴–10⁵ düğüm üretir; her düğümde nesne ağacı kopyalamak (spread/immer) GC baskısı yaratır.
  `buf.slice()` tek bir ~1,8 KB bellek kopyasıdır (~100–200 ns).
- Geri Al güçlendiricisi ve oturum geçmişi = hamle başına bir tampon kopyası (50 hamle × 1,8 KB = 90 KB).
- Determinizm: durum = (`CompiledLevel`, `buf`); `buf` içinde RNG durumu da var → anlık görüntüden aynı gelecek doğar.
- Kurallara karşı güvence: `applyMove(state, move, sink)` yalnızca kendisine verilen durumu değiştirir; sahne ve
  solver kendi kopyası üzerinde çalışır. Testler her hamleden sonra değişmezleri denetler (§12.4).

### 2.5 Hücre ve parça görünümü

```ts
interface PieceView {            // okunur kopya; sıcak yolda kullanılmaz
  id: PieceId; shape: ShapeId; color: ColorCode; zone: 'yard' | 'site' | 'queue' | 'gone';
  x: number; y: number;          // GENEL koordinat (saha: tahta; şantiye: yerel dilim)
  seg: number; flags: PieceFlag[]; wetLeft: number; locked: boolean; debris: boolean; stuck: boolean;
}
```

### 2.6 Durum karması — karar: **Zobrist, 64 bit (iki 32 bit şerit), istek üzerine hesap**

```
h = Z.header[turn mod L] ⊕ Z.header2[activeSeg, frontSeg, carouselT, elev, elevDir, deliveryCursor, turn < openShutterUntil]
  ⊕ ⨁_{parça p, zone ≠ gone} Z.piece[class(p)][zone, konum]            ← parça kimliği YOK: sınıf = (şekil, renk, bayraklar, sayaç)
  ⊕ ⨁_{geçit g} Z.gap[g][open, y] ⊕ ⨁_{engel o} Z.obs[o][hp] ⊕ ⨁ Z.hidden[toplananlar] ⊕ Z.queue[kuyruk sırası]
```

- `L` = zamanlı mekaniklerin döngü uzunluklarının EKOK'u (kepenk 2·period, kayar kapı 2·(max−min), döner platform
  `carouselEvery`·S, asansör 2·(max−min)); zamanlı mekanik yoksa 1.
- Tablolar bölüm derlenirken sabit tohumlu `splitmix32` ile üretilir → karma deterministiktir (golden testler için).
- **Simetri:** iki özdeş blok yer değiştirdiğinde XOR değişmez → solver aynı durumu iki kez açmaz. Kanonik dizgede bunun
  için parçaları sıralamak gerekirdi.
- **Neden kanonik dizge değil:** düğüm başına ~100+ karakterlik dizge kurmak tahsis ve GC demektir (~1–3 µs);
  Zobrist ~40 tablo okuması + XOR (~0,2 µs), tahsis yok.
- **Çakışma riski:** 64 bit anahtar, 10⁷ durumda olasılık ≈ n²/2⁶⁵ ≈ 3·10⁻⁶. Tam karşılaştırma yapılmaz; buna karşılık
  solver'ın bulduğu çözüm her zaman gerçek çekirdekte baştan oynatılır (§9.5). Çakışma geçersiz çözüm üretemez, en kötü
  ihtimalle daha iyi bir çözümü kaçırır.
- Artımlı güncelleme yapılmaz (hata kaynağı); istek üzerine hesap yeterince ucuz.

### 2.7 RNG

`mulberry32` (32 bit durum, `buf`'ta saklanır). Çekirdekte RNG yalnızca Kamyon Yardımı karıştırmasında (§9.7) kullanılır;
geri sekme ve teslimat sırası tamamen deterministik kurallarla çözülür (RNG yok). Bot simülasyonu (Sallanan Köprü, Lig)
sayaç tabanlı `hash32(seed, botIndex, attemptIndex)` kullanır (§11.2). `hash32` = murmur3 `fmix32` zinciri, sürüm adı
`fmix32-chain-v1`; referans vektörleri testte sabittir (cihaz ve ileride sunucu aynı sonucu üretir). Tohumda kurulum
kimliği **yoktur** (R-14).

---

## 3. Şekiller

### 3.1 Kaynak ve üretim

- Tek kaynak: brif §5'teki **0° hücreleri** `src/core/shapes.ts` içinde sabit tablo olarak durur (13 tür).
- Dönüş kuralı (**öneri P-2**): açı, ekranda **saat yönünde** dönüştür; y yukarıdır. 90° saat yönü dönüşüm
  `(x, y) → (y, −x)`. Her dönüşten sonra **sol alta normalize** edilir: `x −= min x`, `y −= min y`; hücreler `(y, x)`
  sırasıyla sıralanır (kanonik liste). 180° ve 270° art arda uygulanarak üretilir.
- Modül yüklenirken 13 × 4 = **52 `ShapeId`** üretilir; her biri için: `cells`, `w`, `h`, `rows: number[]`
  (satır başına bit maskesi, çarpışma için), `colBottom[]` / `colTop[]` (sütun başına en alt/üst hücre; açık gökyüzü ve
  düşüş için), `heavy`, `cellCount`, `canonical` (aynı hücre kümesine sahip ilk kimlik; ör. `O4_90 → O4_0`).
- Bölüm verisinde 52 kimliğin hepsi kabul edilir; derlemede `canonical`'a indirgenir (karma sınıfı ve doku seçimi için).
- Test: "brif §5 tablosundaki her not (ör. 'D2 90° = yatay Lento', 'L4 dikey halleri geçer') üretilen tabloyla tutarlı".

### 3.2 Genişlik ≤ 2 ve Ağır Malzeme (Y5)

`heavy = w ≥ 3 || kind ∈ ALWAYS_HEAVY` ve `ALWAYS_HEAVY = {I5, Q9}`.
Prototip çıktısı bir çelişki gösterdi: **`I5_90` / `I5_270` = 1×5 dikey** ve genişlik kuralına göre ağır **değil**, oysa
brif "I5 her zaman Ağır (yalnızca yatay kullanılır)" diyor. GDD K-44 (S-2 yanıtı): (1) doğrulayıcı bölüm verisinde
`I5_90`/`I5_270`'i reddeder (`shape_forbidden`), (2) `ALWAYS_HEAVY` Vinç I5/Q9'u döndürse bile ağırlığı korur (K-37).
Ağır blok için sürükleme alanı saha sütunları + saha üstü Vinç Alanı'dır (`ix + w ≤ 6`); duvar sınırını hiç geçmez.
Hikaye bölümüne göre izinli türler (K-44) `logic.ts`'de tablo olarak durur (`shape_locked`).

### 3.3 Üretilen tablo (prototipten, normalize)

| Kimlik | Hücreler | Kutu | Ağır | | Kimlik | Hücreler | Kutu | Ağır |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1_0 (=90,180,270) | (0,0) | 1×1 | | | L4_0 | (0,0)(1,0)(0,1)(0,2) | 2×3 | |
| D2_0 (=180) | (0,0)(0,1) | 1×2 | | | L4_90 | (0,0)(0,1)(1,1)(2,1) | 3×2 | ✔ |
| D2_90 (=270) | (0,0)(1,0) | 2×1 | | | L4_180 | (1,0)(1,1)(0,2)(1,2) | 2×3 | |
| I3_0 (=180) | (0,0)(0,1)(0,2) | 1×3 | | | L4_270 | (0,0)(1,0)(2,0)(2,1) | 3×2 | ✔ |
| I3_90 (=270) | (0,0)(1,0)(2,0) | 3×1 | ✔ | | J4_0 | (0,0)(1,0)(1,1)(1,2) | 2×3 | |
| I4_0 (=180) | (0,0)…(0,3) | 1×4 | | | J4_90 | (0,0)(1,0)(2,0)(0,1) | 3×2 | ✔ |
| I4_90 (=270) | (0,0)…(3,0) | 4×1 | ✔ | | J4_180 | (0,0)(0,1)(0,2)(1,2) | 2×3 | |
| O4_0 (=hepsi) | (0,0)(1,0)(0,1)(1,1) | 2×2 | | | J4_270 | (2,0)(0,1)(1,1)(2,1) | 3×2 | ✔ |
| C3_0 | (0,0)(1,0)(0,1) | 2×2 | | | T4_0 | (0,0)(0,1)(1,1)(0,2) | 2×3 | |
| C3_90 | (0,0)(0,1)(1,1) | 2×2 | | | T4_90 | (1,0)(0,1)(1,1)(2,1) | 3×2 | ✔ |
| C3_180 | (1,0)(0,1)(1,1) | 2×2 | | | T4_180 | (1,0)(0,1)(1,1)(1,2) | 2×3 | |
| C3_270 | (0,0)(1,0)(1,1) | 2×2 | | | T4_270 | (0,0)(1,0)(2,0)(1,1) | 3×2 | ✔ |
| S4_0 (=180) | (0,0)(0,1)(1,1)(1,2) | 2×3 | | | Z4_0 (=180) | (1,0)(0,1)(1,1)(0,2) | 2×3 | |
| S4_90 (=270) | (1,0)(2,0)(0,1)(1,1) | 3×2 | ✔ | | Z4_90 (=270) | (0,0)(1,0)(1,1)(2,1) | 3×2 | ✔ |
| I5_0 (=180) | (0,0)…(4,0) | 5×1 | ✔ | | I5_90 (=270) | (0,0)…(0,4) | 1×5 | ✔ (ALWAYS_HEAVY) |
| Q9_0 (=hepsi) | 3×3 | 3×3 | ✔ | | | | | |

Not: saat yönü seçimi `L4_90` ile `L4_270`'i belirler (saat yönünün tersi seçilse yer değiştirirdi). product-lead
bölüm JSON'u yazmadan önce bu tabloya bakmalıdır; `npm run levels:preview` her bloğu çizer.

---

## 4. Hareket: yol bulma, raylar, yapışkan takip

### 4.1 Tutma (K-07, K-09, K-14)

`beginDrag(state, pieceId): DragSession | null`

1. Kural kapısı (K-09): `zone` saha ya da şantiye; `locked` (K-14) değil; `movesLeft > 0`; etkin kuralların `canPick`
   kancalarının hepsi `true` (Y3 zincir, Y4 ıslak beton). Çekirdekte engele özel `if` yoktur; kancalar sırayla çağrılır (§7).
2. Çarpışma maskesi: `masks: Uint8Array(10)`, satır başına 8 bit. Saha: `yardOcc` (sürüklenen parça hariç). Duvar
   hücre kaplamaz; sınır maskeleri `openFree` / `openRail[g]` (§2.2). Şantiye: aktif dilimin `siteOcc`'u `elev` kadar
   kaydırılır; `y < elev` dolu (platform). `colTop[x]` (x = 6, 7): o sütundaki en yüksek dolu satır (sürüklenen parça
   hariç), yoksa −1.
3. Başlangıç düğümü: saha parçası → FREE(anchor). Şantiye parçası (moloz S4, harçla yapışmış Y8) → FREE(anchor) ve
   satırları bir geçidin içindeyse ayrıca RAIL(g) (çok kaynaklı BFS, ikisi de mesafe 0).
4. BFS (§4.2). Erişilebilir düğüm sayısı 1 ise (yalnızca kendisi) `null` döner → "kımıldamıyor" geri bildirimi (K-09).

### 4.2 Durum grafiği

Düğüm = `(ix, iy, mode)`; `mode = FREE` ya da `RAIL(g)`. Düğüm sayısı ≤ 8 × 10 × (1 + G), G ≤ 3 → **≤ 320**.

**FREE(ix, iy) geçerli** ⇔
1. sınırlar içinde (`0 ≤ ix`, `ix + w ≤ 8`, `0 ≤ iy`, `iy + h ≤ 10`); ağır blokta `ix + w ≤ 6`;
2. `masks[iy + r] & (rows[r] << ix) == 0` her `r` için (çarpışma);
3. sınırı kesiyorsa (`ix ≤ 5 < ix + w`) iki yanda hücresi olan her satır `openFree` içinde (§2.2);
4. **açık gökyüzü (K-13):** bloğun kapladığı her şantiye sütunu `c` için `colTop[c] < iy + colBottom[c − ix]`
   (bloğun o sütundaki en alt hücresinin üstünde ve hizasında hiçbir dolu hücre yok).

**RAIL(g)(ix, iy) geçerli** ⇔
1. sınırlar ve çarpışma;
2. **K-12 hizalama (açık koşul):** `g.y ≤ iy` ve `iy + h ≤ g.y + g.size` — bloğun **bütün** satırları geçidin içinde;
3. blok sınırı kesiyor ya da tamamen şantiyede (`ix + w − 1 ≥ 6`);
4. geçit açık: etkin kuralların `canPassGap(g, piece)` kancalarının hepsi `true` (W4 kepenk açık, W7 kilit açılmış;
   ikisi de `ctx.s.turn < ctx.s.openShutterUntil` iken `true` döner, K-40). W5 kayar kapı ve W6 boya kapısı K-40'tan
   etkilenmez. W3 dar geçit ayrı kanca değildir: `size = 1` ile 2. madde zaten yalnızca 1 satırlık blokları geçirir.

**Kenarlar** (yatay kenarda sınırı geçen hücrelerin satırları mevcut kipte açık olmalı, §2.2)
- FREE → FREE: 4 komşu (±1 x, ±1 y).
- FREE → RAIL(g): yalnızca **tamamen sahadaki** (`ix + w − 1 ≤ 5`) FREE düğümden sağa (ix + 1, aynı iy).
- RAIL(g) → RAIL(g): yalnızca yatay (ix ± 1). Dikey hareket yok (K-12 "dikey konumu geçide kilitli").
- RAIL(g) → FREE: sola, yeni konum tamamen sahadaysa.

**Boya kapısı yolu (W6, S-21 GDD yanıtı, R-02):** BFS durumu `(düğüm, lastPaint)` çiftidir; `lastPaint ∈ {yok} ∪ boya
kapıları` ve bir RAIL(g) düğümüne girilince `lastPaint = g` olur (son girilen kapının rengi geçerli). Boya kapısı yoksa
ek boyut yoktur; varsa düğüm sayısı en çok ×(1 + boya kapısı sayısı). `DragController` görünümün gerçekten izlediği yolu
(`pathTo` parçaları) takip eder, blok kapıdayken yeni rengi önizler ve bırakmada `via = lastPaint` gönderir; çekirdek
`(to, via)` çiftinin erişilebilir olduğunu doğrular (§6.1). En kısa yollar ray düğümünden geçmez (ray girişi aynı saha
düğümüne geri döner), bu yüzden boya yalnızca oyuncu bloğu bilerek geçide itince olur.

Bu modelin sonuçları (testlerle sabitlenir):
- **K-11:** Sınırı FREE kipte yalnızca `y ≥ wall.height` (duvar üstü hava) satırlarından geçen hücreler aşar; şantiye
  üstünde blok aşağı indirilebilir (açık gökyüzü sağlandıkça).
- **K-13:** Şantiyede bir çıkıntının (overhang) altına yandan girmek FREE'de imkânsızdır (açık gökyüzü bozulur);
  bunun yolları RAIL ve G-L yönlendirmesidir. Şantiye içinden geçide "geri girip" askıda bırakma istismarı da kapalıdır
  (RAIL'e yalnızca saha tarafından girilir). K-34 ile çıkıntının altı yalnızca `.` hücresi olabileceğinden, çıkıntı
  altına giren her yerleşim zaten hatalıdır; ray ve pencere tasarımı delinmez (§15 R-2).
- **K-12:** Raydaki blok bırakıldığı yerde kalır (düşmez); YAO sayımında "geçit" sayılır. FREE kipte şantiyeye bırakılan
  her blok "duvar üstü" sayılır (hafif yerçekiminde yönlendirilse bile).

### 4.3 Bırakma sınıflandırması

| Bırakılan düğüm | Sonuç | Kural |
| --- | --- | --- |
| başlangıç düğümü (aynı hücreler, aynı kip) | iptal, hamle harcanmaz | K-07 satır 1 |
| FREE, tüm hücreler x ≤ 5 ve y ≤ 7 | sahaya yerleşim (1 hamle); balon burada yükselir; saha yerçekimi açıksa hamle sonunda oturur | K-07 satır 2, K-10, K-20 |
| FREE, tüm hücreler x ≤ 5, herhangi bir hücre y ≥ 8 | iptal (saha üstü havada bırakıldı) | K-05, K-07 satır 3 |
| blok sınırı kesiyor (hücreleri iki yanda) | iptal | K-07 satır 4, E-06, E-28 |
| FREE, tüm hücreler x ≥ 6 | şantiyeye düşüş (§5.1) → doğrulama | K-07 satır 5, K-11, K-16 |
| RAIL(g), tüm hücreler x ≥ 6 | rayda yerleşim, düşmez → doğrulama | K-07 satır 6, K-12, K-16 |

İptal olacak bırakma önceden gösterilir (design-lead önerisi): `DragSession.classify(node)` aynı tabloyu salt okunur
çalıştırır; sonuç iptalse `ShadowView` `cancel` durumuna geçer (sürüklenen blok %60 opak + "↩" rozeti, UX §5.3–5.4).
Maliyet: düğüm değişince 1 tablo bakışı.

### 4.4 Yapışkan takip (K-08) ve parmak ofseti

- Tutma ile dokunma ayrımı (K-07) `tokens.drag.startThresholdPx` / `holdMs` ile yapılır (GDD'deki sayı yerine tek
  kaynak token; test değeri tokens'tan okur). BFS `pointerdown`'da hemen yapılır (≤ 41 µs, 6×), görsel kaldırma eşik
  aşılınca başlar; eşik altında bırakma = dokunma (hiçbir şey olmaz).
- Parmak, tahta uzayına çevrilir; blok parmağın **`tokens.drag.fingerOffsetCells` (1,2) hücre üstünde** görünür. Hedef nokta
  `p = finger − grabOffset + (0, 1.2)` (iç hücre birimi, sürekli). `grabOffset` tutma anında parmak ile çapa arasındaki
  farktır; böylece blok tutulduğunda zıplamaz, yalnızca 80 ms'de 1,2 hücre yukarı süzülür (yer müsaitse).
- `nearest(p)`: erişilebilir düğümler içinde `(ix − px)² + (iy − py)²` en küçük olan. Eşitlikte sırasıyla: mevcut
  düğümden BFS mesafesi küçük olan, FREE önce, küçük düğüm numarası (determinizm).
- Histerezis: yeni aday ancak `d²(aday) < d²(mevcut) − 0.2` ise seçilir (sınırda titreme olmaz).
- Aday mevcut düğüme bitişik değilse `pathTo(mevcut, aday)` (mevcut düğümden BFS, ebeveyn işaretçileri) hesaplanır ve
  görünüm bu yolu 12 ms/hücre hızla (en çok 120 ms) izler: blok **hiçbir zaman** duvarın ya da blokların içinden
  ışınlanıyormuş gibi görünmez.
- Yumuşak çizim: blok `node + clamp(p − node)` konumunda çizilir; bir eksende ofsete yalnızca o yöndeki komşu düğüme
  kenar varsa izin verilir (blok engele "sürtünerek kayar"). Şantiye üstünde FREE kipte dikey ofset düşüş gölgesinin
  altına inemez.
- Parmak tuval dışına çıkarsa Phaser işaretçiyi güncellemez (§0) → blok son geçerli konumda bekler; tuval dışında
  parmak kalkarsa `pointerupoutside` → mevcut düğümde bırakma.

### 4.5 Maliyet ve önbellek (bir karede sığar mı?)

| İş | Ne zaman | Ölçülen / tahmini maliyet |
| --- | --- | --- |
| maske + `colTop` kurulumu | tutmada 1 kez | 90 hücre, < 2 µs |
| BFS (başlangıçtan) | tutmada 1 kez | %80 dolu saha: **2–11 µs** (1×), **11–27 µs** (4×), **17–41 µs** (6×) — Chromium 141, CDP ile ölçüldü. Boş tahta en kötü durum (320 düğüm; boya kapılı bölümde ×(1 + kapı sayısı)): ölçeklemeyle ≈ 0,3 ms (6×) |
| `nearest(p)` | her `pointermove` | ≤ 320 düğüm taraması, ≈ 1–3 µs (1×), ≤ 15 µs (6×) |
| `pathTo` (mevcuttan BFS) | yalnızca düğüm değişince | yukarıdaki BFS ile aynı |
| düşüş gölgesi | düğüm değişince | sütun başına önbellek (`landingCache[ix]`): açık gökyüzü sayesinde iniş satırı yalnızca sütuna bağlıdır → O(1); düşüş mesafesi = `node.iy − landing.iy`. Balon da O(1): şantiyede tavan sabittir (plan tepesi, S-9 GDD yanıtı) |

Orta seviye telefon ≈ masaüstü Chromium'un 4–6× yavaşı kabul edilirse, sürükleme mantığının kare başına payı
**< 0,3 ms / 16,7 ms (%2)**. Sürükleme başına önbellek: `masks`, `colTop`, `distFromStart`, `distFromCurrent`
(yalnızca mevcut düğüm değişince yenilenir), `landingCache`. Sürükleme süresince tahta değişmez (S-6: saha
yerçekimi ve komşu etkileri hamle sonunda çözülür) → önbellek geçersizleşmez. Ön tahsis: BFS kuyrukları ve mesafe
dizileri `DragSession` havuzunda bir kez ayrılır; `pointermove`'da tahsis yok.

### 4.6 Gecikme

Phaser 4 dokunma olaylarını DOM işleyicisinde anında işler (§0). `DragController` blok konumunu **olay işleyicisinin
içinde** günceller (bir sonraki `update()`'i beklemez); çizim bir sonraki `requestAnimationFrame`'de olur → "dokunuş ile
hareket arasında tek kare". `index.html`'deki `touch-action: none` ve `user-scalable=no` tarayıcı kaydırma/yakınlaştırma
gecikmesini kapatır. İkinci parmak sürükleme sırasında yok sayılır (yalnızca tutan işaretçinin `id`'si izlenir).

### 4.7 Ağır yerçekimi 700 ms (G-H) ve hafif yerçekimi yönlendirmesi (G-L)

- **G-H (K-19, R-11):** Gerçek zaman çekirdeğe girmez. `DragController`, FREE düğümün herhangi bir hücresi şantiye
  sütunundayken sahne saatiyle `holdMs` sayar (şantiye sütunlarından tamamen çıkınca sıfırlanır, E-19; duraklatmada
  durur, K-43); süre dolunca mevcut düğümde **zorla bırakma** yapar (E-18). `holdMs` çekirdeğin yerçekimi profilinden
  okunur (700; tokens'ta değil, kural product-lead'in) ve Ayarlar'daki erişilebilirlik seçeneği "Zaman baskısını azalt"
  açıkken **1400** olur (R-11). Değer tek parametre olduğundan proje sahibi ileride "sayaç yok" (`holdMs = ∞`) seçerse
  kod değişmez. Çekirdek zorla bırakmayı sıradan bırakma olarak görür; hamle günlüğü bırakma düğümünü saklar →
  determinizm korunur. Solver bu kuralı yok sayar (brif §12); bot "geç kalma" olasılığıyla modeller.
- **G-L girdi (R-10; biçim design-lead'in, kural GDD K-19'un):** hafif yerçekiminde şantiyeye FREE bırakılan 1 genişlikli
  bloğun düşüşü ya da balon yükselişi sürerken tahta **yönlendirme penceresindedir**:
  - Tahtada bir **dokunuş** (eşik altında kalkan `pointerdown`/`pointerup`, `tokens.drag.startThresholdPx` / `holdMs`):
    dokunuşun x'i düşen bloğun merkezinin solundaysa yön −1, sağındaysa +1. Ek olarak, tutulabilir bir bloğun üstünde
    **başlamayan** yatay kaydırma (≥ eşik) kaydırma yönünü verir (design-lead turu 2 önerisi). Yön tek komşu şantiye
    sütununu göstermiyorsa (kenar ya da duvar tarafı) girdi yok sayılır.
  - `atRow` = `pointerdown` anındaki satır; görsel düşüş eğrisi tek kaynaktan, `tokens.physics.fallLowSpeed` (sabit
    4 hücre/s) ve `balloonRiseSpeed`'den hesaplanır (K-19'daki ms/satır görsel kabul edilir; test sabit eğriyle).
  - Düşüş/yükseliş başına en çok 1 yönlendirme; 2 genişlikli blokta çip ve girdi yok; gölge yönlendirmesiz inişi gösterir
    (K-18), yönlendirme sonrası anında güncellenir.
  - Dokunma/tutma çakışması: `pointerdown` tutulabilir bir blokta başlayıp eşiği aşarsa bu bir **tutma**dır
    (yönlendirme değil); bekleyen düşüş yönlendirmesiz kesinleşir ve son karesine atlar (R-12). Eşik aşılmadan kalkarsa
    dokunuştur → yönlendirme. Böylece "her yer girdi" (design-lead) ile "sıradaki bloğu tut" (JUICE kural 3) çakışmaz.
    Girdi bölgesi tek parametredir (`steerZone: 'board' | 'site'`); product-lead'in "yalnız şantiye + Vinç Alanı"
    önerisi seçilirse `'site'` (x 810–1050, y 288–1488) yapılır. Düşüş sırasında başka blok tutulursa pencere kapanır,
    düşen blok yönlendirmesiz (ya da önceki yönlendirmesiyle) iner (E-40).
  - **İki aşamalı commit:** sahne bırakmada `computeFall` ile animasyon planını alır ama hamleyi bekletir
    (`GameSession.pending`). Hamle (a) yönlendirme girdisinde `steer: { dir, atRow }` ile (GDD S-26 kayıt biçimi), (b) yeni bir tutmada ya da
    (c) düşüş bitince yönlendirmesiz olarak **bir kez** commit edilir. Günlüğe yalnızca son `Move` yazılır →
    determinizm korunur. Normal ve ağır yerçekiminde bekleme yoktur (commit bırakmada). Ayrıntı §5.1, risk §15 R-2.

---

## 5. Yerleştirme, geri sekme, yerçekimi, düşüş gölgesi

### 5.1 `computeFall` — gölge ve mantık için tek fonksiyon (K-18)

```ts
interface FallPlan  { ix: number; iy: number; dir: -1 | 1; drift: -1 | 0 | 1; steer?: { atRow: number } }
interface FallResult {
  landing: Anchor; distance: number;              // satır cinsinden düşüş
  path: Anchor[];                                  // animasyon ve testler için ara noktalar
  drift: -1 | 0 | 1;                               // W8 rüzgâr
  verdict: Verdict;                                // isCorrectPlacement sonucu (§5.2; gölge K-18)
  effect: LandingEffect;                           // S3 cam kırılması önizlemesi
  touchesHidden: boolean;                          // açılmamış `?` hücresine değiyor → gölge her zorlukta nötr (K-18, E-20)
}
type Verdict = { ok: true } | { ok: false; reason: 'color' | 'dot' | 'outside' | 'support' | 'debris'; cells: At[] };
// reason: renk uyuşmazlığı | `.` hücresi | plan dışı | K-34 altı boş (cells = boş kalan alt hücreler) | moloz
computeFall(state, pieceId, node, opts?: { steer?: { atRow: number } }): FallResult
```

1. Plan `dir = −1` (aşağı) ile başlar; etkin kuralların `modifyFall` kancaları sırayla uygulanır (sıra GDD K-11:
   rüzgâr → düşüş/yükseliş → G-L): W8 rüzgâr → genişliği 1 olan blokta, **rüzgârsız hedefe mesafe `d ≥ 1` ise**
   (siluete oturmuş blok kaymaz, E-17; balonda `d = |bırakma satırı − tavan satırı|`), kaymış konum x = 6–7 içinde, boş
   ve açık gökyüzünü sağlıyorsa `drift = fan.dir`. S8 balon → `dir = +1`.
2. İniş: aşağı yönde `landing.iy = max_c (colTop[c] + 1 − colBottom_c)` (açık gökyüzü sayesinde ilk destek).
   **Balon (S-9 GDD yanıtı, R-02):** şantiyede tavan aktif dilimin plan tepesidir: bloğun en üst hücresi tahta satırı
   `h + e − 1`'e asılır (`ceilAnchor = h + e − hBlok`); o sütunlarda siluet tavana ulaştıysa blok siluetin üstünde kalır
   (`landing.iy = max(ceilAnchor, supportAnchor)`, plan dışı → hatalı). Tavanın üstünden bırakılan balon tavana **iner**
   (aynı formül). Sahada tavan y = 7 ya da üstteki ilk dolu hücrenin altıdır (E-14). Her iki durum O(1).
3. G-L yönlendirme (§4.7): `atRow` satırına kadar aynı sütunda düşer/yükselir, 1 genişlikteki blok komşu şantiye sütununa
   geçer (o satırda ve sonraki yolda hücreler boşsa; değilse yönlendirme etkisiz), oradan devam eder. Balon
   yükselişinde de 1 kez kullanılabilir (GDD S8). Yönlendirilen yerleşim YAO'da "duvar üstü" sayılır (K-46).
4. `onLanded` önizlemesi: S3 cam, `distance > glassThreshold(gravity.build)` ise kırılır (eşik K-19: low 4, normal 3,
   high 2; "eşiğin üstünde" = kesin büyük; geri sekme ve teslimat düşüşünde kırılmaz, S-10 GDD yanıtı).
5. `verdict` = `isCorrectPlacement` (§5.2) iniş hücreleri için; K-34 dahil.

`ShadowView` aynı fonksiyonu çağırır; dolayısıyla gölge **her zaman** gerçek sonucu gösterir (rüzgâr, balon tavanı,
asansör ofseti dahil, K-18). Gölge durumu (UX §5.4, ART P-7 çift kodlu gölge): Kolay/Normal'de doğru = düz kontur + ✓,
hatalı = kesik kontur + !; `reason = 'support'` iken `cells` (altta boş kalan plan hücreleri) nabızla vurgulanır, 45°
tarama yalnızca renk uyuşmazlığında; Zor/Çok Zor'da yalnızca konum; `touchesHidden` iken her zorlukta nötr kesik beyaz
kontur, rozet yok; iptal olacak bırakmada `cancel` (§4.3). Görsel stil design-lead'in; çekirdek yalnızca `verdict`,
`effect`, `touchesHidden` verir.

### 5.2 Doğrulama (K-16) ve hatalı yerleşim (K-17)

**Tek fonksiyon (R-01):** `isCorrectPlacement(state, pieceId, cells): Verdict`. Doğru yerleşim denetimi (adım 3),
gölge rengi (K-18), Vinç hedefi (K-37), Altın Mala hedefi (K-33, `eligibleTrowelCells`), Boya Fırçası sonrası harç
kilitlenmesi (K-38) ve solver'ın doğru-hamle üretimi (§9.3) **aynı** fonksiyondan geçer; sapma olmaz.
Sıra (ilk bozulan koşul `reason` olur):
1. **K-16 (1):** her hücre `(sx, sy)` (`sy = y − elev`) aktif dilimin plan alanında (`reason: 'outside'`), `.` değil
   (`'dot'`), plan rengi (gizliyse çözülmüş rengi, K-32) blok rengine eşit (`'color'`).
2. **K-16 (2):** blok moloz değil (`'debris'`; S-13 GDD yanıtı: moloz hiçbir yerde doğru olamaz).
3. **K-34 Alttan Üste:** bloğun kapladığı her sütun `c` ve o sütundaki en alt hücre satırı `r` için plan satırları
   `0 … r−1`'deki `.` olmayan her hücre doğru dolu olmalı: `((1 << r) − 1) & ~(filled[seg][c] | dotMask[seg][c]) == 0`
   (`'support'`, `cells` = boş kalan alt hücreler). Moloz ve yapışmış harçlı blok `filled`'e girmez. Maliyet: sütun
   başına 1 AND (≤ 2 sütun) → gölge her karede çağırabilir.
Doğruysa → `locked = true` (K-14), `filled` güncellenir, `combo++` (yalnızca sürükleme hamlesinde, K-33), gizli `?`
hücreleri açılır (K-32).
Hatalıysa etkin kuralların `onPlacement` kancası sonucu değiştirebilir: Y8 harç → `stick` **yalnızca bütün hücreleri
plan alanındaysa** (renkli, `?` ya da `.`; GDD Y8 / P-2b, E-08), `stuck = true`; değilse normal geri sekme:
  1. Başlangıç çapasının hücreleri boşsa oraya (kavisli animasyon, `tokens.duration.placeBad`).
  2. Değilse "sahanın üstünden düşerek ilk uygun boşluğa": aday sol sütunlar `xs = 0 … 6 − w` başlangıç `x`'ine
     uzaklığa göre, eşitlikte duvara yakın olan önce; her aday için blok `y = 10 − h`'den açık gökyüzü ile düşürülür
     (saha yerçekimi ayarından bağımsız); iniş konumu tahtaya sığıyorsa (`y + h ≤ 8`) hedef budur.
  3. Hiçbiri olmazsa blok kamyon kuyruğunun **sonuna** girer (K-17, K-26).
- Hatalı yerleşim `combo = 0` yapar, `wrongCount++` (analytics `level_end`), hamle yanar (K-17).
- Testler: "K-34 rail over empty colored cell is wrong", "K-34 dot cells count as filled", "K-34 debris below blocks
  correct placement", "K-34 crane and trowel obey support rule", "Y8 sticks only inside plan area", "E-08 …".

### 5.3 Saha yerçekimi ve zincirleme düşüş (K-20, Y2, Y6)

Hamle hattının 6. adımı (K-35 adım 6). Eşzamanlı adım algoritması (animasyonla birebir uyumlu; "her şey birlikte düşer"):

```
do {
  repeat:                                             // settle: her tur iki yarım adım (R-02, E-33 önerisi)
    (a) düşme yarısı: balonları katı sayarak, desteksiz (Y6 açıkken bütün saha blokları; her zaman Y2 torbalar)
        varlıkların hepsi 1 satır iner. Destek: y = 0, Y1 kasa ya da desteklenen başka varlık (sabit nokta).
    (b) yükselme yarısı: yalnızca Y6 açıkken; diğer her şeyi katı sayarak tutulmayan balonlar 1 satır çıkar (tavan y = 7).
    hiçbir şey hareket etmediyse: dur
  applyNeighborEffectsOfFalls()   // düşen BLOKLARIN düşüş öncesi hücrelerinin 4-komşuları (K-35 adım 5 kuralı);
                                  // düşen torba etki üretmez (N26); engel başına hamlede en çok 1 kez (N24)
} while (bir torba yırtıldı ya da bir kasa yok oldu)  // yerçekimi yeniden çalışır (E-12)
saklı nesne denetimi #2 (K-42)
```

- Bir varlığın üstündekiler de desteksizse birlikte düşer; göreli konumlar korunur, çakışma olamaz. Yarım adım kuralı
  sayesinde düşen blok ile yükselen balon aynı boş hücreyi hedeflediğinde blok iner, balon ona dayanır; arada boşluk
  kalmaz ve sonuç seçim sırasına bağlı değildir (N33, N34; product-lead GDD'ye E-satırı olarak yazar).
- Zincirli ve ıslak bloklar da düşer; düşüş zinciri çözmez, sayacı değiştirmez (N27). Kasa düşmez ve destektir (N25).
- En çok 8 tur × ≤ 40 varlık × ≤ 9 hücre ≈ 3 000 işlem; dış döngü engel sayısıyla sınırlı. Her varlık için tek
  `pieceFell{cause:'yardGravity'}` / `balloonRose` olayı (başlangıç, bitiş, mesafe) aynı adımda yayınlanır.
- Torbalar saha yerçekimi kapalıyken de düşer (S-12 GDD yanıtı); balonlar sahada yalnızca kendi bırakmalarında
  (adım 2) ve Y6 açıkken adım 6'da yükselir. Teslimatla gelen balonlu blok K-25 gereği düşüp oturur; adım 9 adım 6'dan
  sonra geldiği için en erken sonraki hamlenin 6. adımında (Y6 açıksa) yükselir (varsayım, S-29).
- Testler: "K-20 …", "N24 …", "N25 …", "N26 …", "N27 …", "N33 balloon and falling block meet without gap", "N34 …",
  "E-12 torn bag re-runs gravity", "E-13 …".
- Sürükleme sırasında saha **donuktur** (öneri P-8): tutulan bloğun üstündekiler hamle bitene kadar asılı kalır
  (görsel: hafif titreme). Gerekçe: erişilebilirlik grafiği sürükleme boyunca değişmez, sürükleme iptalinde hiçbir şey
  olmamış olur (K-07), solver ve tekrar oynatma basitleşir.

### 5.4 Şantiyede zincirleme yok

Raydaki bloklar iskeleyle tutulur (K-12), doğru bloklar kilitlidir (K-14), moloz sabittir (S-13 GDD yanıtı). Şantiyede
yalnızca bırakılan blok düşer (ya da balon yükselir); ikincil düşüş yoktur.

---

## 6. Hamle hattı ve deterministik olay günlüğü

### 6.1 Hamle tipi

```ts
type Move =
  | { kind: 'drag'; pieceId: PieceId; to: DragNode; via?: number; steer?: { dir: -1 | 1; atRow: number } } // K-07…K-13, W6 `via`, G-L
  | { kind: 'hammer'; target: { pieceId: PieceId } | { obstacle: number } }         // Çekiç K-36
  | { kind: 'crane'; pieceId: PieceId; to: { zone: 'yard' | 'site'; x: number; y: number }; rotation: Rotation } // Vinç K-37
  | { kind: 'paint'; pieceId: PieceId; color: ColorCode }                            // Boya Fırçası K-38
  | { kind: 'trowel'; seg: number; x: 0 | 1; y: number }                             // Altın Mala K-33
  | { kind: 'addMoves'; amount: number; source: 'offerCoins' | 'offerAd' | 'thermos' | 'streak' }; // K-29, K-40
type SessionAction = Move | { kind: 'undo' } | { kind: 'start'; preBoosters: PreBooster[]; streakTier: 0 | 1 | 2 | 3 };
```

Geri Al bir çekirdek hamlesi değildir: `GameSession` son sürükleme hamlesinin öncesindeki tampon kopyasını geri yükler
(K-39, K-14 istisnası; derinlik 1). `applyMove` gelen `drag` hamlesini **yeniden doğrular** (`beginDrag` + `(to, via)`
erişilebilir mi; `steer` yalnızca G-L'de ve 1 genişlikli blokta); geçersizse geliştirmede hata fırlatır, üretimde
`moveCancelled{reason:'invalid'}` yayınlar. Hamle günlüğü = `SessionAction[]` (JSON); bölüm içi devam (§11.1) ve hata
raporu bu günlükten yeniden oynatılır.

### 6.2 Sıra (her adım bir `step` numarası alır)

Adım numaraları ve sırası **GDD K-35 ile birebir aynıdır** (R-02); aynı adımda birden çok nesne etkilenirse işlem
sırası (y, x) artan taramadır. Test adları "K-35 step N …".

| Adım | İş | Olaylar | Kural |
| --- | --- | --- | --- |
| 0 | Bırakma sınıflandırması (§4.3). İptalse olay yayınla ve **dur** (sayaç, seri, zamanlayıcılar, boya, komşu etkileri değişmez) | `moveCancelled` | K-05, K-07 |
| 1 | Bloğu taşı. `via` varsa (yol bir boya kapısının ray kipinden geçti) bırakma yerinden **bağımsız** olarak `onPassGap` → blok son girilen kapının rengine boyanır; sahaya dönen blok da boyanır (S-21 GDD yanıtı, R-02). G-H zorla bırakması sıradan bırakmadır | `pieceMoved`, `piecePainted` | K-10…K-12, W6 |
| 2 | Şantiyede FREE ise `computeFall` (rüzgâr → düşüş/balon → G-L) + `onLanded` (S3 cam → kırılır, K-17 hedefine döner, adım 3 atlanır). Sahada bırakılan balon burada yükselir | `windDrift`, `pieceFell`, `balloonRose`, `steered`, `glassBroke`, `pieceReturned` | K-11, K-19, K-21, W8, S3, S8 |
| 3 | Şantiyedeyse `isCorrectPlacement` (K-16 + **K-34**) + `onPlacement` (Y8 harç, yalnız plan alanında) | `placementCorrect`, `cellsRevealed`, `comboChanged`, `trowelEarned`, `placementWrong`, `mortarStuck`, `pieceBounced` | K-14, K-16, K-17, K-32, K-33, K-34, Y8 |
| 4 | Maliyet: sayaç −1 (cam −2; yapışmış harçlı bloğun hamlesi −2, `moveCost`), en az 0; `turn++` | `movesChanged` | K-07 |
| 5 | Başlangıç hücrelerinin 4-komşuları: `onNeighborMoved` (engel başına hamlede en çok 1); saklı nesne denetimi #1 (`onCellUncovered`) | `crateDamaged`, `crateBroken`, `bagTorn`, `chainReleased`, `screwCollected`, `keyCollected`, `gapUnlocked` | Y1, Y2, Y3, Y7, W7, K-42 |
| 6 | Saha yerçekimi döngüsü (§5.3: yarım adımlı settle + düşüşlerin komşu etkileri, torba/kasa → yeniden), saklı nesne denetimi #2 | `pieceFell{cause:'yardGravity'}`, `balloonRose`, … | K-20, Y2, Y6, S8, K-42 |
| 7 | Hedef sayaçları | `goalProgress` | K-41 |
| 8 | Aktif/öndeki dilim tamamlandıysa: `segments` → kayma ve sonraki dilim; `carousel` → ön dilim sıradaki tamamlanmamış dilim, `carouselT = 0`. Sıradaki parti yalnızca **kuyruğun sonuna eklenir** (`enqueue(batch)`), burada teslim edilmez | `segmentCompleted`, `siteShifted`, `carouselRotated` | K-22, K-23, K-25 |
| 9 | **Tek teslimat noktası:** kuyruktaki bütün bloklar FIFO sırasıyla birer kez denenir; yerleşemeyen blok sonrakileri bekletmez ve sırasını korur. Aday sol sütunlar: önce bloğun `x`'i, sonra `dropColumns` (listedeki sırayla), sonra kalan bütün geçerli sütunlar `x`'e uzaklıkla (eşitlikte duvara yakın önce); blok `y = 10 − h`'den yerçekimi ayarından bağımsız düşer. Gelen bloğa `arrivedTurn = turn` | `deliveryArrived`, `pieceFell{cause:'delivery'}`, `deliveryQueued` | K-25, K-26, E-03, E-04 |
| 10 | `onMoveEnd` kancaları bu sırayla: Kepenk (W4) → Kayar Kapı (W5) → Döner Platform sayacı (S5) → Asansör (S6) → Islak Beton (Y4; `arrivedTurn == turn` olanlar atlanır, E-31) → Açık Kepenk süresi (K-40) | `gapChanged`, `carouselRotated`, `elevatorMoved`, `wetTick` | W4, W5, S5, S6, Y4, K-40 |
| 11 | Kazanma (K-28) → değilse hamle bitti mi (K-29) | `levelWon`, `outOfMoves` | K-28, K-29 |
| 12 | Oyun sürüyorsa kilitlenme tespiti ve nedene göre Kamyon Yardımı (§9.7) | `deadlockDetected`, `truckHelp` | K-30 |

Sıralamanın gerekçeleri GDD K-35'tedir. Testler: "K-26 older queued pieces deliver first", "E-04 …", "S-21 painted
piece returned to yard keeps color", "W6 via last entered paint gate wins", "E-31 delivered wet piece keeps counter".

### 6.3 Olay birleşimi

```ts
interface EvBase { seq: number; step: number }        // seq: hamle içinde 0,1,2…; step: §6.2 adımı
type At = { zone: 'yard' | 'site'; x: number; y: number; seg?: number }   // GENEL koordinat
type GameEvent = EvBase & (
  | { t: 'moveCancelled'; pieceId: PieceId; reason: 'sameSpot' | 'craneOverYard' | 'straddle' | 'invalid' }
  | { t: 'pieceMoved'; pieceId: PieceId; from: At; to: At; entry: 'yard' | 'overWall' | 'gap'; gap?: number }
  | { t: 'piecePainted'; pieceId: PieceId; from: ColorCode; to: ColorCode; gap: number }
  | { t: 'windDrift'; pieceId: PieceId; dx: -1 | 1 }
  | { t: 'pieceFell'; pieceId: PieceId; from: At; to: At; rows: number; cause: 'release' | 'yardGravity' | 'delivery' | 'bounce' }
  | { t: 'balloonRose'; pieceId: PieceId; from: At; to: At; rows: number }          // rows < 0: tavana indi
  | { t: 'steered'; pieceId: PieceId; atRow: number; dx: -1 | 1 }
  | { t: 'glassBroke'; pieceId: PieceId; at: At; penalty: number }
  | { t: 'pieceReturned'; pieceId: PieceId; from: At; to: At | 'queue' }
  | { t: 'placementCorrect'; pieceId: PieceId; cells: At[]; overWall: boolean }
  | { t: 'cellsRevealed'; seg: number; cells: { x: number; y: number; color: ColorCode }[] }
  | { t: 'comboChanged'; combo: number }
  | { t: 'trowelEarned'; trowels: number }
  | { t: 'placementWrong'; pieceId: PieceId; reason: 'color' | 'dot' | 'outside' | 'support' | 'debris'; cells: At[] }
  | { t: 'mortarStuck'; pieceId: PieceId }
  | { t: 'pieceBounced'; pieceId: PieceId; from: At; to: At | 'queue'; viaDrop: boolean }
  | { t: 'movesChanged'; movesLeft: number; delta: number; reason: 'move' | 'glass' | 'mortar' | 'offer' | 'booster' }
  | { t: 'crateDamaged'; obstacle: number; hp: number } | { t: 'crateBroken'; obstacle: number }
  | { t: 'bagTorn'; obstacle: number } | { t: 'chainReleased'; pieceId: PieceId }
  | { t: 'screwCollected'; at: At; total: number } | { t: 'keyCollected'; keyId: string }
  | { t: 'gapUnlocked'; gap: number } | { t: 'gapChanged'; gap: number; open: boolean; y: number }
  | { t: 'wetTick'; pieceId: PieceId; left: number }
  | { t: 'goalProgress'; goal: number; value: number; target: number }
  | { t: 'segmentCompleted'; seg: number } | { t: 'siteShifted'; toSeg: number }
  | { t: 'carouselRotated'; front: number } | { t: 'elevatorMoved'; offset: number }
  | { t: 'deliveryArrived'; seg: number; pieces: PieceId[] } | { t: 'deliveryQueued'; queued: number }
  | { t: 'levelWon'; movesLeft: number } | { t: 'outOfMoves' }
  | { t: 'deadlockDetected'; reason: 'noMoves' | 'material' | 'tiling' }             // GDD K-30 D1 | D2 | D3
  | { t: 'truckHelp'; kind: 'unchain' | 'deliverMissing' | 'reshuffle' | 'reshape';
      moves?: { pieceId: PieceId; from: At; to: At }[]; delivered?: PieceId[] }
  | { t: 'boosterApplied'; booster: 'hammer' | 'crane' | 'paint' | 'trowel'; detail: unknown }
  | { t: 'boosterRejected'; booster: 'hammer' | 'crane' | 'paint' | 'trowel'; reason: string }   // harcanmaz
);
```

- Olaylar `EventSink` arayüzüne yazılır: oyun `ArraySink`, solver ve bot `NULL_SINK` kullanır (tahsis yok).
- **Determinizm:** olay listesi (durum, hamle) çiftinin saf fonksiyonudur. `eventLogHash` = olayların kanonik JSON'u
  üzerinde FNV-1a; golden testler bunu karşılaştırır (§12.4).
- **Sahne tarafı (`EventPlayer`):** oynatma sırası = K-35 adımı; adımlar sırayla, aynı adımdaki olaylar paralel oynar
  (adım 6 zincirlemesi `tokens.physics.yardCascadeStaggerMs` kademeli; kazanma/kaybetme en son). Süreler `tokens.duration`
  ve JUICE.md'den gelir. Düşüşler sabit `ms/satır` değil `tokens.physics` ivme + tavan hızıyla hesaplanır (normal 60
  hücre/s², tavan 18; ağır 120/26; hafif sabit 4 hücre/s; balon `balloonRiseSpeed`), böylece iniş "tok" hissedilir.
  Sahne olayları yalnızca *gösterir*; mantık çekirdekte zaten bitmiştir.
- **Animasyon sırasında girdi (R-12, JUICE kural 3):** olaylar iki sınıftır.
  - *Engelleyici diziler:* dilim kayması (`duration.segment` 600), kamyon teslimatı (`truck` 700), Kamyon Yardımı /
    karıştırma (`reshuffle` 900). Yalnızca bunlar sürerken girdi kilitlidir; ekrana dokunmak kalanı 3× hızlandırır.
  - *Diğer her şey* (iniş, parıltı, geri sekme, saha zincirlemesi, zamanlayıcılar): oynarken gelen `pointerdown`
    tahtayı değiştiren bekleyen tween'leri **o an son karesine atlatır** (`fastForwardBoard()`), sürükleme gerçek
    durumdan başlar; parçacık ve ses kendi hızında sürer. Çekirdek durumu zaten kesin olduğundan bu güvenlidir.
    Fast-forward testi: "R-12 grab during landing completes board tweens first".
- **"Animasyonları azalt" = JUICE solma varyantları** (hızlandırma değil): kayma/sıçrama yerine `duration.reducedFade`
  (150 ms) solma, ölçek ≤ `a11y.reducedScaleMax` (1,03), ekran sallama yok, parçacık × `particles.reducedFactor` (0,2),
  döngüsel boşta animasyonlar durur. Oyun bilgisi korunur (gölge, sayaç, geri sekme yönü, olay sırası). Haptik yalnızca
  "titreşim" anahtarına bağlıdır; bu ayar haptiği kapatmaz. Uygulama: her JUICE olayı `EventPlayer` tablosunda
  `{ full, reduced }` iki tarifle durur; tablo JUICE "Faz/Etiket" sütunuyla Faz 2 P0 listesine eşlenir.

### 6.4 Güçlendiriciler: ön koşul + etki (GDD K-33, K-36…K-40) ve mini hat

Genel (GDD §10): güçlendirici hamle harcamaz, `turn`'ü artırmaz, zamanlayıcıları ilerletmez, seriyi değiştirmez, YAO'ya
sayılmaz. Ön koşul tutmazsa çekirdek `boosterRejected` yayınlar ve durum değişmez → **envanterden düşülmez** (meta,
yalnızca `boosterApplied` gelirse harcar). UI gri/etkin durumunu aynı ön koşul fonksiyonundan (`canUse*`) okur.

| Güçlendirici | Ön koşul (`canUse*`) | Etki |
| --- | --- | --- |
| Çekiç K-36 | hedef: saha bloğu (ağır/cam/balon/ıslak dahil), kasa, torba, moloz, yapışmış harçlı blok. Kilitli blok, kuyruktaki blok, duvar/geçit, boş saklı nesne hücresi **hedeflenemez** | zincirli blokta **önce yalnızca zincir** kalkar (`clear: chain` sayılır); diğer blok yok olur; kasa bütün katlarıyla yok olur (sayılır); torba yırtılır; moloz yok olur (sayılır) |
| Vinç K-37 | seçim: kilitsiz, **zincirsiz, ıslak olmayan** saha bloğu, moloz ya da yapışmış harçlı blok (gömülü olsa da); hedef: (a) sahada boş, `y ≤ 7` konum ya da (b) şantiyede `isCorrectPlacement` = doğru (**K-34 dahil**); I5/Q9 şantiyeye konamaz, diğer ağır bloklar ≤ 2 geniş yönelime döndürülürse konabilir | saat yönünde 90° adımlarla dönüş (`rotation`); şantiyede düşmez, rüzgâr/cam yok; doğru yerleşim olarak kilitlenir, seriye ve YAO'ya sayılmaz |
| Boya Fırçası K-38 | seçim: kilitsiz saha bloğu ya da yapışmış harçlı blok (moloz değil); renk: **yalnızca bölümün plan renkleri** | renk değişir, bayraklar korunur; yapışmış harç yeni renkle `isCorrectPlacement` doğruysa hemen kilitlenir (seriye sayılmaz) |
| Altın Mala K-33 | aktif/öndeki dilimde boş, `.` olmayan ve **K-34'ü sağlayan** plan hücresi (`eligibleTrowelCells(state)`; UI yalnızca bu kümeyi parlatır) | hücre doğru renkle dolar, `filled`'e girer, `?` açılır |
| Geri Al K-39 | son eylem bir sürükleme hamlesi; arada güçlendirici/+5 yok; derinlik 1; kayıp penceresi açık değil | `GameSession` hamle öncesi tamponu geri yükler (sayaç, `turn`, seri, mala, teslimat, kuyruk, dilim geçişi, kasa, saklı nesne, hedefler dahil). Aynı hamlenin 12. adımında çalışan Kamyon Yardımı da geri alınır (varsayım, S-31) |
| Açık Kepenk K-40 | bölümde W4 ya da W7 var (yoksa yuva gri) | bölüm başında `openShutterUntil = 5`: `turn` 0…4 iken W4/W7 `canPassGap` → `true`; 5. hamlenin 10. adımından sonra kendi kurallarına döner. W5/W6 etkilenmez |
| Termos, Mala Başlangıcı K-40 | oyun öncesi | `addMoves{source:'thermos'}` +3; `trowels += 1`; seri bonusuyla toplanır |

**Mini hat** (Çekiç, Vinç, Boya Fırçası, Altın Mala sonrası): K-35 adımları **5 (yalnızca saklı nesne denetimi), 6, 7,
8, 9, 11, 12**. Adım 4 ve 10 çalışmaz (`turn` ve zamanlayıcılar sabit; E-09). Testler: "K-36 hammer on chained piece
removes chain only", "K-37 crane cannot pick chained or wet", "K-37 rejected target does not consume booster",
"K-38 paint palette is level plan colors", "K-39 undo depth 1", "K-40 open shutter only W4 W7", "E-09 …".

---

## 7. Engel eklenti arayüzü

### 7.1 Brifteki arayüzün inceltilmiş hali

Değişiklikler: kancalar `GameState` yerine `RuleContext` alır (olay yayını, RNG, profil erişimi); `onLanded` yalnızca
düşüşler için kalır, rayla yerleşimi de kapsayan `onPlacement` eklenir (harç rayla da yapışmalı); sahada gizli öğeler
için `onCellUncovered`; hamle maliyeti için `moveCost`; şantiye modları (S1, S5, S6) aynı kayıt defterinde
**strateji** olarak durur. Engel durumu genel tampon alanlarında tutulur (geçit `open/y/phase`, engel `hp`, parça
`flags/counter`) → eklentiler kendi karma/kopyalama kodunu yazmaz; Zobrist hepsini zaten kapsar.

```ts
interface RuleContext {
  readonly lvl: CompiledLevel;
  readonly s: GameState;
  emit(e: Omit<GameEvent, 'seq' | 'step'>): void;
  readonly rng: Rng;                          // durumdaki mulberry32'yi ilerletir (deterministik)
  readonly gravity: GravityProfile;           // K-19 tablosu: holdMs, glassThreshold, steerable (görsel hız tokens'ta)
}
type EntityRef = { kind: 'obstacle'; index: number } | { kind: 'piece'; id: PieceId };
type LandingEffect = { kind: 'none' } | { kind: 'break'; penalty: number };
type PlacementOverride = { kind: 'default' } | { kind: 'stick' };

interface ObstacleRule {
  id: RuleId;                                  // 'W1'…'W8', 'Y1'…'Y8', 'S1'…'S8', 'G-H', 'G-L'
  order: number;                               // kanca çağrı sırası (deterministik, §7.3)
  appliesTo(lvl: CompiledLevel): boolean;      // bölüm bu kuralı kullanıyor mu (kayıt defteri filtreler)
  owns?: { obstacle?: ObstacleType; pieceFlag?: PieceFlag; gapType?: GapType };  // varlık → kural dizini
  onLevelStart?(ctx: RuleContext): void;
  canPick?(ctx: RuleContext, pieceId: PieceId): boolean;
  canPassGap?(ctx: RuleContext, gap: number, pieceId: PieceId): boolean;
  onPassGap?(ctx: RuleContext, gap: number, pieceId: PieceId): void;
  modifyFall?(ctx: RuleContext, pieceId: PieceId, plan: FallPlan): FallPlan;
  onLanded?(ctx: RuleContext, pieceId: PieceId, fall: FallResult): LandingEffect;
  onPlacement?(ctx: RuleContext, pieceId: PieceId, verdict: 'correct' | 'wrong'): PlacementOverride;
  moveCost?(ctx: RuleContext, pieceId: PieceId, move: Move): number | undefined;
  onNeighborMoved?(ctx: RuleContext, entity: EntityRef, movedPieceId: PieceId): void;
  onCellUncovered?(ctx: RuleContext, cell: CellIndex): void;
  onMoveEnd?(ctx: RuleContext): void;
}

interface SiteStrategy {                         // S1 segments, S5 carousel; S6 asansör ofseti bunlara eklenir
  activeSegment(s: GameState): number;
  frameOffset(s: GameState): number;             // asansör (K-24); yoksa 0
  onSegmentCompleted(ctx: RuleContext, seg: number): void;   // kayma + teslimat tetikleme
  onMoveEnd(ctx: RuleContext): void;             // döner platform dönüşü, asansör salınımı
}
```

Kayıt defteri (`obstacles/registry.ts`): `ALL_RULES: readonly ObstacleRule[]`. Bölüm derlenirken
`activeRules = ALL_RULES.filter(r => r.appliesTo(lvl)).sort(byOrder)` ve her kanca için ayrı dizi
(`hooks.onMoveEnd: Fn[]`) çıkarılır; çekirdek `for (const f of hooks.onMoveEnd) f(ctx)` çağırır. `owns` alanından
`ruleByObstacleType`, `ruleByPieceFlag`, `ruleByGapType` tabloları kurulur → `onNeighborMoved` doğrudan ilgili kurala
gider. **Çekirdekte engel kimliğine göre `if/switch` yoktur**; yeni engel = yeni dosya + kayıt defterine bir satır.
Debug paneli kuralları kapatabilir (`disabledRules: Set<RuleId>`, yalnızca geliştirmede).

### 7.2 Engel → kanca eşlemesi

| Kimlik | Kanca(lar) | Durum alanı | Not |
| --- | --- | --- | --- |
| W1 Sabit Geçit | (çekirdek RAIL modeli) | — | K-12; eklenti yalnızca `appliesTo` ve öğretici bayrağı |
| W2 Yüksek Duvar | (çekirdek: `wall.height = 8`) | — | Vinç Alanı K-05 ile aşılır |
| W3 Dar Geçit | (çekirdek: `size = 1` → K-12 hizalama kuralı) | — | ayrı kanca gerekmez; doğrulayıcıdaki sayımı §8.3 L-22 (R-21) |
| W4 Kepenk | `canPassGap` (K-40 `openShutterUntil` dahil), `onMoveEnd` | geçit `open`, `phase` | açık ⇔ `floor((turn + phase) / period)` çift; kapanış hamle sonunda; o anda geçitte blok olamaz (E-05, E-06) |
| W5 Kayar Kapı | `onMoveEnd` | geçit `y`, yön | `range` içinde ping-pong |
| W6 Boya Kapısı | `onPassGap` (adım 1, `move.via`) | parça `color` | yol kapının ray kipinden geçtiyse bırakma yerinden bağımsız boyar; son girilen kapı geçerli (S-21 GDD, §4.2) |
| W7 Kilitli Geçit | `canPassGap` (K-40 dahil), `onCellUncovered` | geçit `open`; gizli öğe toplandı | anahtar `keyId` eşleşmesi; açılış aynı hamlede, ilk kullanım sonraki hamlede (E-10) |
| W8 Rüzgâr Fanı | `modifyFall` | — | 1 genişlik, `fan.dir`; `d ≥ 1` koşulu (E-17) |
| Y1 Ahşap Kasa | `onNeighborMoved` | engel `hp` | hücre kaplar, statik; `clear` hedefi |
| Y2 Çimento Torbası | `onNeighborMoved`; düşüş çekirdek yerçekiminde (`gravityBound` bayrağı) | engel canlı | sürüklenemez |
| Y3 Zincir | `canPick`, `onNeighborMoved` | parça `flags.chained` | `clear: chain` hedefi |
| Y4 Islak Beton | `canPick`, `onMoveEnd` | parça `counter`, `arrivedTurn` | o hamlede gelen blok azalmaz (E-31) |
| Y5 Ağır Malzeme | (çekirdek: `heavy` → `ix + w ≤ 6`) | — | şekilden türetilir (§3.2) |
| Y6 Saha Yerçekimi | (çekirdek `settleYard`, `gravity.yard`) | — | eklenti yalnızca öğretici bayrağı |
| Y7 Altın Vida | `onCellUncovered` | gizli öğe | `collect` hedefi |
| Y8 Harçlı Blok | `onPlacement`, `moveCost` | parça `flags.stuck` | yalnızca bütün hücreleri plan alanındaysa yapışır (E-08); yapışmış bloğun hamlesi 2 |
| S1 Kayan Şantiye | `SiteStrategy` (segments) | `activeSeg` | K-22 |
| S2 Plan Boşluğu | (çekirdek doğrulama: `.` hücresi) | — | K-15, K-17 |
| S3 Cam Blok | `onLanded` | parça `flags.glass` | eşik `ctx.gravity.glassThreshold` |
| S4 Moloz | `onLevelStart` (şantiyeye yerleştirme); `clear: debris` sayacı `goals.ts`'de: moloz şantiyeden çıkınca (sahaya taşındı ya da Çekiç) +1 | parça `flags.debris` | sürüklenebilir (1 hamle; FREE ile yukarı ya da RAIL ile geçitten) |
| S5 Döner Platform | `SiteStrategy` (carousel) | `frontSeg` | K-23 |
| S6 Asansör İskele | `SiteStrategy.frameOffset/onMoveEnd` | `elev`, `elevDir` | K-24 |
| S7 Gizli Plan | derleme zamanı `resolveHidden` + `onPlacement` (açılma) | açılan maske | K-32 |
| S8 Balonlu Blok | `modifyFall` (`dir = +1`; şantiye tavanı plan tepesi) + saha yerçekiminde yükselme yarısı | parça `flags.balloon` | §5.1, §5.3 |
| G-H Ağır yerçekimi | profil (`glassThreshold = 2`, `holdMs = 700`, erişilebilirlikte 1400); tutma sayacı **sahnede** (§4.7) | — | solver yok sayar |
| G-L Hafif yerçekimi | profil (`glassThreshold = 4`, `steerable`); `computeFall` `steer` | — | girdi §4.7, düşüş §5.1 |

### 7.3 Kanca sırası

`order`: W (100'ler) → Y (200'ler) → S (300'ler) → G (400'ler); aynı kanca içinde örn. `modifyFall`'da W8 (108) S8'den
(308) önce çalışır: balonlu tek genişlikli blok önce rüzgârla kayar, sonra yükselir. Etkileşim matrisi (OBSTACLES.md,
N1…N43) bu sırayla uyumludur; `[kural]` etiketli her N-notu için bir test (`"N33 …"`, `"W6+S3 paint keeps glass flag"`)
ve 325 çift için otomatik duman testi (iki engelli küçük tahta + seed'li 50 rastgele hamle → değişmezler bozulmaz).

---

## 8. Bölüm şeması (zod) ve doğrulama

### 8.1 Sürüm ve paket seçimi

- **zod 4.6.5** (`npm view zod version`, 2026-10-04). Şema `src/core/level/schema.ts`'de **`zod/mini`** ile yazılır:
  aynı örnek şema `zod` ile 24,8 KB gzip, `zod/mini` ile 7,2 KB gzip (tam bölüm şeması: 33,5 KB ham / **9,95 KB gzip**,
  rolldown ile ölçüldü). Oyun ve araçlar **aynı** şemayı kullanır (öneri P-4). Karşılaştırma: Faz 0 iskeletinin üretim
  paketi (yalnızca Phaser) 1 375,6 KB / **358,1 KB gzip** (`npm run build`, 2026-10-04) → zod/mini ≈ +%2,8.
- `zod/mini` varsayılan hata metni kısadır ("Invalid input"). Araçlar `z.config(en())` (`zod/locales`) yükler; o zaman
  "Unrecognized key: \"elevatorRange\" → at build", "Invalid option: expected one of …" gibi okunur mesajlar çıkar
  (scratchpad'de doğrulandı). Oyun paketi yerel ayar yüklemez; geliştirme modunda hata ayrıntısı konsola yazılır.

### 8.2 Şema (scratchpad'de zod 4.6.5 ile çalıştırıldı; brifteki Bölüm 4 örneği geçti)

```ts
import * as z from 'zod/mini';
const Color = z.enum(['W', 'Y', 'G', 'R', 'O', 'C', 'B', 'P']);
const ShapeId = z.templateLiteral([z.enum(SHAPE_KINDS), '_', z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])]);
const Int = (min: number, max: number) => z.int().check(z.minimum(min), z.maximum(max));
const I18nText = z.strictObject({ tr: z.string().check(z.minLength(1)), en: z.string().check(z.minLength(1)) });
const Flag = z.enum(['glass', 'mortar', 'balloon', 'chained', 'wet']);
const PiecePlacement = z.strictObject({
  shape: ShapeId, color: Color, x: Int(0, 7), y: Int(0, 9),   // parti k ≥ 1: y = 8 yazılır, yok sayılır (K-25)
  flags: z.optional(z.array(Flag)),
  wetMoves: z.optional(Int(1, 5)),                             // OBSTACLES Y4
});
const DebrisPlacement = z.strictObject({                       // moloz: bayrak yok (K-21), dilime ait (K-45/7, P-5)
  shape: ShapeId, color: Color, x: Int(6, 7), y: Int(0, 7), segment: z.optional(Int(0, 4)),   // varsayılan 0
});
const Dir = z.union([z.literal(1), z.literal(-1)]);             // GDD §14 biçimi (asansör ve kayar kapı aynı)
const GapBase = { y: Int(0, 7), size: Int(1, 7) };
const Gap = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('static'), ...GapBase }),
  z.strictObject({ type: z.literal('shutter'), ...GapBase, period: Int(1, 4), phase: z.optional(Int(0, 7)) }),
  z.strictObject({ type: z.literal('slider'), ...GapBase, range: z.tuple([Int(0, 7), Int(0, 7)]), dir: z.optional(Dir) }),
  z.strictObject({ type: z.literal('paint'), ...GapBase, color: Color }),
  z.strictObject({ type: z.literal('locked'), ...GapBase, keyId: z.string().check(z.minLength(1)) }),
]);
const HiddenRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('repeat'), period: Int(1, 4) }),
  z.strictObject({ kind: z.literal('mirrorOf'), segment: Int(0, 4) }),
]);
const Highlight = z.string().check(z.regex(/^(piece:\d+|gap:\d|cell:\d,\d|crane|build|wall|booster:[a-zA-Z]+|panorama)$/));
const Segment = z.strictObject({
  name: I18nText,
  rows: z.array(z.string().check(z.regex(/^[WYGROCBP.?]{2}$/))).check(z.minLength(1), z.maxLength(8)),
  hidden: z.optional(HiddenRule),
});
const Goal = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('build') }),
  z.strictObject({ type: z.literal('clear'), target: z.enum(['crate', 'chain', 'debris']), count: Int(1, 99) }),
  z.strictObject({ type: z.literal('collect'), item: z.literal('screw'), count: Int(1, 99) }),
]);
export const LevelSchema = z.strictObject({
  schemaVersion: z.optional(z.literal(1)),
  id: Int(1, 999), chapter: Int(1, 5), name: I18nText,
  difficulty: z.enum(['easy', 'normal', 'hard', 'superhard']),
  moves: Int(1, 99), teaches: z.optional(z.enum(MECHANIC_IDS)), seed: z.int(),
  goals: z.array(Goal).check(z.minLength(1), z.maxLength(3)),
  gravity: z.strictObject({ build: z.enum(['low', 'normal', 'high']), yard: z.boolean() }),
  wall: z.strictObject({
    height: Int(0, 8), gaps: z.array(Gap).check(z.maxLength(3)),
    fan: z.optional(z.strictObject({ dir: z.enum(['left', 'right']) })),
  }),
  build: z.strictObject({
    mode: z.enum(['segments', 'carousel']),                        // ⚠ brifteki 'elevator' ayrı alana taşındı (P-6, S-16)
    carouselEvery: z.optional(Int(2, 6)),                          // K-23
    elevator: z.optional(z.strictObject({                          // K-24: 0 ≤ a < b ≤ 3, a ≤ start ≤ b
      range: z.tuple([Int(0, 3), Int(0, 3)]), start: z.optional(Int(0, 3)), dir: z.optional(Dir),
    })),
    segments: z.array(Segment).check(z.minLength(1), z.maxLength(5)),   // K-22: 1 ≤ S ≤ 5
    debris: z.optional(z.array(DebrisPlacement)),
  }),
  yard: z.strictObject({
    batches: z.array(z.strictObject({
      forSegment: Int(0, 5), dropColumns: z.optional(z.array(Int(0, 5))),
      pieces: z.array(PiecePlacement).check(z.minLength(1)),
    })).check(z.minLength(1)),
  }),
  obstacles: z.array(z.strictObject({
    type: z.enum(['crate', 'cement_bag', 'screw', 'key']), x: Int(0, 5), y: Int(0, 7),
    hp: z.optional(Int(1, 3)), id: z.optional(z.string()),
  })),
  tutorial: z.optional(z.array(z.strictObject({                  // UX §13.2 alanları; anahtar biçimi R-08
    step: Int(1, 20), mode: z.enum(['required', 'soft']), highlight: z.array(Highlight),
    hand: z.optional(z.strictObject({ kind: z.enum(['tap', 'drag', 'hold']),
      path: z.optional(z.array(z.tuple([Int(0, 7), Int(0, 9)]))) })),
    textKey: z.string().check(z.regex(/^tut\.l\d{1,2}\.[a-z0-9_]+$/)),           // tut.l{n}.{konu}
    done: z.union([
      z.strictObject({ event: z.enum(['overWall', 'gapPass', 'placementCorrect', 'yardMove', 'boosterUsed', 'tap']),
        count: z.optional(Int(1, 9)) }),
      z.strictObject({ timeoutMs: Int(500, 10000) }),
    ]),
  }))),
});
export type LevelData = z.infer<typeof LevelSchema>;
```

`piece:<i>` = parti 0'daki dizi sırası (LEVELS tablosundaki satır sırası JSON sırasıdır; partilerde `k<parti>_<i>`).
Bağlamsal öğreticiler (`tut.ctx.*`, ör. `tut.ctx.bottomup` ilk K-34 hatasında) bölüm verisinde değil, çekirdek
olaylarından (`placementWrong.reason`) tetiklenir. Engel bilgi kartı metni `obs.{id}.desc` (R-08) i18n'dedir.

Brif §12 tipinden farklar (hepsi öneri, P-6; GDD §14 ekleriyle uyumlu): `schemaVersion` eklendi; `gaps` tipine göre
ayrık birleşim (kepenkte `period` zorunlu vb.); **`build.mode`'dan `'elevator'` çıkarıldı, `build.elevator` ayrı
isteğe bağlı alan oldu** (Bölüm 40 "döner platform + asansör"); `elevatorRange` → `elevator.range` + `start` + `dir`;
`debris[].segment`, slider `dir`, hamle kaydında `drag.via`; aralıklar GDD/OBSTACLES'a daraltıldı (`carouselEvery` 2–6,
`wetMoves` 1–5, kepenk `period` 1–4, `repeat.period` 1–4, asansör 0–3, dilim 1–5). Yön `1 | −1` (GDD §14);
product-lead `'up' | 'down'` biçimini seçerse yalnızca `Dir` satırı değişir. `strictObject` bilinmeyen anahtarları
reddeder (yazım hatası yakalar).

### 8.3 Mantık kuralları (`src/core/level/logic.ts`; araç ve oyun ortak)

**Hata kodları = GDD K-45 (R-02).** Her denetim `Issue { code, rule, check, severity, path, message }` üretir:
`code` = K-45'teki snake_case hata adı (ör. `gap_touches_top`, `too_many_colors`, `shape_locked`,
`flag_combo_forbidden`, `yard_fill_low`), `rule` = `'K-45/<madde>'` (ya da ilgili K kimliği), `check` = iç denetim
numarası `L-xx` (yalnızca kod ve test düzeni için). Araç çıktısı ve testler `code` + `rule`'u gösterir
(test adı: `"K-45/3 gap_touches_top …"`). product-lead GDD K-45'e kod ↔ madde tablosunu ekleyince aşağıdaki adlar
**birebir** ona eşitlenir (GDD geçerlidir; yalnızca ad değişir). `error` varsa bölüm yüklenmez (code-lead ilke 4).

| L | K-45 | `code` | Denetim | Ciddiyet |
| --- | --- | --- | --- | --- |
| L-01 | 1 | `schema_invalid`, `id_mismatch`, `chapter_mismatch` | zod şeması; `id` 1–50 ve dosya adıyla eşleşir; `chapter = ⌈id/10⌉` | error |
| L-02 | 2 | `overlap`, `out_of_yard` | Parti 0 parçaları ve engeller tahtada (x 0–5, y 0–7, şeklin kapsamı dahil), çakışmaz | error |
| L-03 | 2 | `yard_fill_low` | Saha doluluğu (parça + kasa + torba hücresi / 48) ∈ [0,80; 1,00]; **öğretici bölümler dahil** (S-3 GDD yanıtı) | error |
| L-04 | 5 | `shape_forbidden`, `shape_locked` | `I5_90`/`I5_270` yasak; Q9 ve I5 yalnızca sahada; tür ve ağır yönelim hikaye bölümüne göre açılmış (K-44) | error |
| L-05 | 4 | `row_width`, `elevator_overflow` | Her satır 2 karakter; asansörde her dilim için `h + b ≤ 8` | error |
| L-06 | 4 | `too_many_colors` | Renk sayısı ≤ hikaye bölümü sınırı (1 → 3, 2 → 4, 3–5 → 5); sayım **planın ve bölümdeki bütün blokların** (bütün partiler + moloz) renkleri (LEVELS §0) | error |
| L-07 | 4 | `color_locked` | Aynı küme (plan + bütün bloklar) yalnızca açılmış renkleri kullanır (W,Y: 1; G: 2; R: 4; O,C: 11; B,P: 21) | error |
| L-08 | 4 | `hidden_invalid` | `?` yalnızca `hidden` kuralı olan dilimde; `repeat`: dilimin alt `p` satırında `?` yok; `mirrorOf`: hedef daha önceki dilim, aynı yükseklik, `?` içermez; `.` gizli olamaz; çözüm döngüsüz (K-32) | error |
| L-09 | 3 | `gap_touches_top`, `gap_overlap`, `shutter_phase`, `slider_range`, `key_missing` | K-04: `y + size ≤ height − 1`, geçitler örtüşmez; kepenk `phase < 2·period`; kayar kapı `range` geçidin `y`'sini içerir ve `range[1] + size ≤ height − 1`; kilitli geçidin `keyId`'si bir `key` engeline eşleşir; `fan` 1 genişlikli bloğu olmayan bölümde `warn` | error / warn |
| L-10 | K-27 | `material_short` | Her dilim için o dilime kadar gelen partilerdeki şantiyeye geçebilen ağır olmayan blokların renk başına hücre toplamı ≥ plan hücreleri; boya kapısı varsa o geçide sığan bloklar kapının rengine de sayılır | error |
| L-11 | K-27 | `untileable` | Döşenebilirlik: her dilimin plan bölgesi mevcut bloklarla **K-34 sırasına uygun** (alttan üste) tam örtülebilir (kesin örtü DFS'i, ≤ 16 hücre); `.` üstündeki hücreler için hizalı geçit, balon ya da iki sütuna köprü kuran 2 genişlikli blok var | error |
| L-12 | K-25 | `batch_invalid` | `forSegment` 0..S−1, parti 0 dilim 0 için var, `dropColumns` blok genişliğine uyar, parti k ≥ 1'de `y = 8` | error |
| L-13 | 7 | `debris_misplaced` | Moloz şantiyede, **kendi `segment` alanında**, desteklenmiş (renk uyuşmazlığı şartı yok: K-16 (2) molozu her yerde hatalı yapar) | error |
| L-14 | 6 | `hidden_item_exposed` | Vida ve anahtar başta bir bloğun ya da kasanın altında; kasa `hp` 1–3 | error |
| L-15 | 6 | `goal_count_too_high`, `goal_build_missing` | `build` tam bir kez; `clear.count` ≤ ilgili nesne sayısı; `collect.count` ≤ vida sayısı (K-41) | error |
| L-16 | 9 | `teaches_invalid`, `teaches_seen_before` | `teaches` geçerli bir mekanik kimliği, bölüm o mekaniği kullanıyor ve **önceki hiçbir bölümde yok** | error |
| L-17 | — | `tut_key_missing`, `tut_highlight_invalid` | `tutorial.textKey` hem `tr.json` hem `en.json`'da; `highlight` öğeleri bölümde var (`piece:<i>` indeksi, `gap:<i>`) | error |
| L-18 | — | `difficulty_sawtooth` | Zorluk etiketi testere dişi planına uyar (10, 15, 25, 35, 45, 49 Zor; 20, 30, 40, 50 Çok Zor) | warn |
| L-19 | 8 | `unsolvable`, `moves_buffer_low`, `yao_low` | (solver aşaması) Çözülebilir, `moves ≥ min + tampon` (Kolay +8, Normal +5, Zor +3, Çok Zor +2), **YAO ≥ %60** (K-46) | error |
| L-20 | — | `bot_band` | (bot aşaması) Orta bot kazanma oranı hedef bantta (Kolay ≥ %90, Normal %65–80, Zor %40–55, Çok Zor %25–40) | warn |
| L-21 | 5 | `flag_combo_forbidden` | Bayrak birleşimi (OBSTACLES tablosu): `glass`+`balloon`; moloz + herhangi bir bayrak (şema zaten bayraksız); ağır şekilde `glass`/`balloon`/`mortar` | error |
| L-22 | 9 | `too_many_new_mechanics` | Bölümde, önceki bölümlerde görülmemiş en çok 1 mekanik (aşağıdaki imza tablosuyla) | error |
| L-23 | 6 | `hidden_item_stacked` | Bir hücrede en çok 1 saklı nesne (vida ya da anahtar) | error |

**Mekanik imzaları (L-16, L-22; R-21):** `src/core/level/mechanics.ts` bir veri tablosudur:
`{ id: 'W2', detect: lvl => lvl.wall.height === 8 }`, `{ id: 'S1', detect: lvl => lvl.build.segments.length ≥ 2 }`,
`{ id: 'Y5', detect: ağır şekil var }`, `{ id: 'G-H', detect: gravity.build === 'high' }` … OBSTACLES'a product-lead'in
ekleyeceği "veri imzası" sütununun kod karşılığıdır; tablo ile sütun aynı olmalı (test: her engel kimliğinin satırı var).
`detect` tanımsız bir mekanik **yalnızca `teaches` alanıyla** sayılır. "Bir bölümde görülen mekanikler" =
`{m | m.detect?.(lvl)} ∪ {lvl.teaches}`.
**W3 bağımlılığı (R-21, product-lead seçer):** iki seçenek de kod değişikliği olmadan çalışır.
- (A) "W3 yalnız `teaches` ile sayılır" → W3 satırında `detect` yoktur. Bölüm 4'teki `size = 1` geçidi W3 sayılmaz,
  Bölüm 9 `teaches: 'W3'` geçerlidir.
- (B) "Bölüm 4 geçidi boy 2" → W3 satırı `detect: lvl => lvl.wall.gaps.some(g => g.size === 1)` olur. Bölüm 4 verisi
  `size = 2` ile yazılır; Bölüm 9'da W3 ilk kez görülür.
Seçimin tek etkisi bu satır ve Bölüm 4 JSON'udur. Her iki seçenek için fikstür testi yazılır ("K-45/9 W3 via teaches
only", "K-45/9 W3 derived from gap size"); hangisi geçerliyse o etkinleştirilir. Seçim gelene kadar varsayılan (A).

`tools/validate-levels.ts` L-01…L-18 ve L-21…L-23'ü çalıştırır, `code` + `rule` tablosu basar, hata varsa çıkış 1.
L-19/L-20 `levels:solve` ve `levels:bot`'ta denetlenir. Oyunda ise zod + L-02, L-04, L-05, L-08, L-09 yükleme anında
koşar (< 1 ms); kalanlar derleme zamanı güvencesidir. Bölümler oyuna `import.meta.glob('/levels/level_*.json')` ile tembel
yüklenir (her bölüm ayrı küçük parça).

---

## 9. Solver, playtest botu, kilitlenme

### 9.1 İlke: tek kural motoru

Solver ve bot **oyunun çekirdeğini** (`beginDrag`, `computeFall`, `applyMove`) `NULL_SINK` ile çağırır. Ayrı bir "solver
kuralı" yoktur; bir kural değişince solver da otomatik değişir. Çıktı her zaman gerçek çekirdekte baştan oynatılarak
doğrulanır.

### 9.2 Durum uzayı

- Durum = `GameState.buf` (§2.4). Düğüm kimliği = Zobrist (§2.6); zamanlı mekanikler `turn mod L` ile karmada.
- Sabit olmayan büyüklükler: saha konfigürasyonu (≤ 48 hücre, 8–20 parça), şantiye doluluğu, engel/geçit durumu,
  teslimat imleci + kuyruk, `turn mod L`.
- Solver'ın **yok saydığı** şeyler (brif §12 ve tasarım gereği): G-H tutma süresi, güçlendiriciler (Çekiç, Vinç, Boya
  Fırçası, Geri Al, Altın Mala), +5 hamle teklifi, kombo. Hamle sınırı = `level.moves` (yalnızca rapor; arama sınırsız).
- **Takvim (entrepreneur önerisi, kabul):** solver yalnızca Faz 3'te tek seferde (katmanlı A*) yazılır. Faz 2'de 1–5.
  bölümlerin doğrulaması LEVELS §2 el çözümlerinden üretilen golden dizilerle yapılır (§9.5); böylece katmansız A*'ın
  çift işi ortadan kalkar.

### 9.3 Hamle üretimi ve budama

Her düğümde, tutulabilen (`beginDrag` ≠ null) her parça için tek BFS, ardından:

1. **Şantiye yerleşimleri (yalnızca `isCorrectPlacement` = doğru olanlar; K-34 dahil):** K-34 gömülü delik bırakan
   yerleşimleri baştan eler, dallanma azalır.
   - FREE: her şantiye sütunu için o sütundaki en alçak erişilebilir bırakma düğümü (cam kırılmasını en aza indirir;
     iniş yeri sütuna bağlı olduğundan diğer yükseklikler baskındır). Rüzgâr kaymaları `computeFall` içinde (rüzgârda
     `d = 0` bırakması ayrı aday: kayma yok). Balonlu blok sütun başına **tek** adaydır (tavan sabit, S-9 GDD).
   - G-L: ek olarak her `atRow` için yönlendirme varyantları (≤ 8 satır × 1 sütun; balon yükselişinde de).
   - RAIL: tamamen şantiyedeki her erişilebilir RAIL düğümü.
   - Boya kapısı: her aday `(düğüm, via)` çiftiyle üretilir (§4.2); boyalı renkle doğru olan yerleşimler de adaydır.
     Ayrıca o geçide erişebilen parçalar için "geçitten geçip sahaya dön" saha hamleleri (`via` dolu) üretilir
     (Bölüm 22 niyeti: boya, sonra duvar üstünden yerleştir; S-21 GDD). Dallanma yalnızca bu parçalarda ×2.
   - Hatalı yerleşimler üretilmez (hamle yakar, şantiyeyi değiştirmez; geri sekme bir saha hamlesine denktir — tek
     istisna "başlangıç doluysa düşerek başka yere sekme"dir, pratikte baskın; sınırlama raporda belirtilir).
2. **Saha hamleleri (budanmış, brif §12 "anlamlı saha hamleleri"):** yalnızca `Blockers` kümesindeki parçalar için:
   - *Gerekli parça* q: rengi ve şekli kalan plan bölgesinde en az bir yere sığan, şantiyeye geçebilen parça.
   - q'nun şu an doğru bir yerleşimi yoksa: diğer parçaları "içinden geçilebilir, girilen her farklı parça +1 maliyet"
     sayan 0-1 BFS ile q'nun en ucuz koridoru bulunur; koridordaki parçalar `Blockers`'a girer (kazı / tünel açma).
   - Kamyon kuyruğu doluysa `dropColumns` tepesindeki parçalar da `Blockers`'a girer (yer açma).
   - Hedefler: parçanın erişilebilir "dinlenme" düğümleri (zemin ya da altında dolu hücre) arasından, gerekli
     parçaların koridorlarına uzaklığı en büyük ilk **6** düğüm (+ saha yerçekimi açıksa iniş düğümleri).
3. Sıralama: doğru yerleşimler önce (duvar üstü olanlar raydan önce — YAO eşitlik bozucusu), sonra saha hamleleri.

Beklenen dallanma: doğru yerleşim 0–8, budanmış saha hamlesi 5–25 → **b ≈ 6–30**.

### 9.4 Arama

**Sezgisel (kabul edilebilir — admissible):**
`h(s) = Σ_renk ⌈R_c / M_c⌉ + [R > 0 ∧ şu an hiç doğru yerleşim yok]`
- `R_c`: kalan (tüm dilimler) `c` renkli plan hücresi; `M_c`: bölümün **tüm partilerinde** `c` rengine sahip ya da
  boya kapısıyla `c` olabilecek, şantiyeye geçebilen blokların en büyük hücre sayısı (≤ 4; bölüm başına **sabit**).
- Kabul edilebilirlik: her hamle en çok bir blok yerleştirir, blok tek renklidir ve ≤ `M_c` hücre kaplar; ikinci terim:
  şu an doğru yerleşim yoksa sıradaki hamle hiçbir plan hücresini dolduramaz. Cam cezası maliyeti yalnızca artırır.
  Dolayısıyla `h` gerçek kalan hamle sayısını asla aşmaz.
- Tutarlılık (consistency): `M_c` sabit olduğu için bir yerleşim ilk terimi en çok 1 azaltır; ikinci terim yalnızca
  yerleşim mümkün değilken 1'dir ve bir saha hamlesiyle en çok 1 düşer → `h(s) ≤ 1 + h(s')`. (`M_c` o anki sahadan
  hesaplansaydı kamyon büyük blok getirdiğinde `h` tek hamlede 1'den fazla düşebilir, tutarlılık bozulurdu.)
  Tutarlı `h` ile kapalı küme yeniden açma gerektirmez; A* bulduğu ilk çözümde (budanmış hamle kümesi içinde) optimaldir.

**Algoritma:** A* + transpozisyon tablosu (açık uçlu adresleme, `Uint32Array` anahtar şeritleri + `Int16Array` en iyi `g`;
2²² giriş ≈ 64 MB). IDA* seçilmedi: saha hamleleri çoğunlukla sırası değiştirilebilir (commute) olduğundan aynı durumlar
çok kez yeniden açılır; A* + TT bunu bir kez yapar.

**Katmanlı arama (dilimli bölümler):** dilim tamamlanması doğal bir kesme noktasıdır (teslimat orada gelir).
Katman k = "dilim 0..k−1 tamam" durumları. Her katmanda A* dilim k'yi bitiren durumlara gider; katman içinde sezgisel
`h_k` yalnızca dilim k'nin kalan hücrelerinden hesaplanır (katman hedefine göre kabul edilebilir kalsın diye). En iyi
`B = 64` farklı bitiş durumu (önce `g`, sonra "saha açıklığı" puanı) sonraki katmanın tohumudur.
- Bütçe içinde **tek parça A*** (katmansız) biterse sonuç `exact`;
- yoksa katmanlı sonuç `heuristic: true` + alt sınır `LB = h(kök)` ve üst sınır `UB`; rapora `UB − LB` boşluğu yazılır.

**Beam search yedeği:** zaman bütçesi dolunca (varsayılan **60 s**, `--budget`), genişlik 2 000, puan
`g + 1,5·h + 0,2·kazıCezası` ile ilerleyen beam bir üst sınır verir → `heuristic: true`.

**Karmaşıklık tahmini:** düğüm açma = tutulabilen ~6–10 parça × BFS (Node'da 3–10 µs) + ~20 çocuk × (`slice` +
`applyMove` + karma ≈ 2–4 µs) ≈ **60–150 µs** → çekirdek başına ~7 000–15 000 düğüm/s. Dilim başına derinlik 5–12,
etkin dallanma 6–15 ile A* katman başına 10³–10⁵ düğüm → 0,1–10 s. 5 dilimli Bölüm 50 ≈ 10–50 s; 60 s bütçesine sığar,
sığmazsa beam devreye girer.

**Paralellik ve önbellek:** `tools/solve.ts` her bölümü bir `worker_threads` işçisine verir
(`os.availableParallelism()` kadar). Sonuçlar `artifacts/solver/level_NNN.json`'a `{ levelHash, solverVersion, result }`
olarak yazılır; bölüm dosyası ve solver sürümü değişmediyse yeniden çözülmez (`levels:check` hızlı kalır).

### 9.5 Çıktı, YAO ve golden tekrarlar

```ts
interface SolveResult {
  levelId: number; status: 'exact' | 'heuristic' | 'unsolved'; moves: number; lowerBound: number;
  solution: Move[];                 // gerçek çekirdekte baştan oynatılarak doğrulanır
  yao: number;                      // duvar üstü doğru yerleşim / tüm doğru şantiye yerleşimleri (S-18)
  stats: { expanded: number; generated: number; ttHits: number; maxDepth: number; avgBranching: number; ms: number };
}
```

- Eşit hamle sayılı çözümler arasında YAO'su yüksek olan tercih edilir (açık listesinde eşitlik bozucu; K-46).
- `tests/golden/level_NNN.json`: çözüm + `eventLogHash`. Test, çözümü çekirdekte oynatır: `levelWon` olmalı ve
  olay günlüğü karması eşleşmeli. Kural değişikliği karmayı değiştirirse `npm run golden:update` ile bilinçli güncellenir.
- **El çözümü golden'ları (Faz 2):** LEVELS §2'deki 1–10 adımları (product-lead hücre hücre doğruladı)
  `tests/golden/level_00N.hand.json` hamle dizisine çevrilir ("duvar üstünden x=6 üstüne taşı → bırak" = Vinç Alanı
  satırında x=6 düğümüne sürükle; parça kimlikleri: parti 0'da tablo sırası, partilerde `k<parti>_<i>`). Test aynı:
  `levelWon` + kalan hamle + YAO + `eventLogHash`. Faz 3'te solver çözümü bunlarla karşılaştırılır (min ≤ el çözümü).

### 9.6 Playtest botları (`tools/playtest-bot.ts`)

| Profil | Davranış |
| --- | --- |
| acemi | %60 olasılıkla varsa rastgele bir doğru yerleşim; yoksa rastgele saha hamlesi ya da rastgele şantiye bırakma (hatalı olabilir). Gizli `?` hücresinde rengi tahmin eder (dilimin renklerinden rastgele). G-H'de %15 olasılıkla bloğu indirmeden 700 ms'de düşürür |
| orta | Açgözlü: varsa doğru yerleşim (en alt satır, büyük blok, duvar üstü öncelikli); yoksa `Blockers`'tan kazı hamlesi. `repeat` gizli planı doğru çıkarır, `mirrorOf`'ta %70 doğru. G-H'de %5 geç kalma |
| usta | Solver rehberli: önbellekteki çözümü izler; %10 olasılıkla rastgele bir geçerli hamle yapar ve ardından 30 ms bütçeli yerel arama ile yeniden plan kurar |

- Her oyun `seed = hash32(level.seed, profileIndex, gameIndex)` ile deterministik.
- 500 oyun × 3 profil × 50 bölüm = 75 000 oyun; hamle başına ~0,3–1 ms → tek çekirdekte ~20–30 dk, 8 işçiyle
  **~3–5 dk**. `--games 100` hızlı mod (CI). Profil parametreleri `tools/bot-profiles.json`'da (product-lead ayarlayabilir).
- Çıktı: `docs/LEVEL_REPORT.md` (bölüm başına kazanma oranı, ortalama kalan hamle, hatalı yerleşim, kayıp nedenleri:
  `outOfMoves` / kilitlenme / cam, Kamyon Yardımı sayısı) + `docs/level-report/difficulty.svg` (bağımlılıksız elle
  üretilen SVG: kazanma oranı eğrisi + hedef bantlar).
- `--continue N` (product-lead + entrepreneur isteği): hamle bitince en çok N kez +5 alınır; rapora "+5 sonrası kazanma
  oranı" sütunu (hedef %70–85) eklenir. Ekonomi sütunları (`config/economy.json` ödülleriyle): "altın / 10 bölüm" ve
  ödemeyen profil için "10 bölümde alınabilen +5 sayısı" (BUSINESS §5.4 şartı). Faz 3 ekonomi simülasyonu bu çıktıdır.

### 9.7 Kilitlenme (K-30) ve Kamyon Yardımı — GDD'nin üç yolu (R-02)

**Tespit** (K-35 adım 12; yalnızca bölüm sürüyorsa; toplam ≤ 2 ms, D3 hariç):
1. **D1 Hamle yok (`noMoves`):** hiçbir blok K-09'a göre tutulamıyor (her parça için en çok 4 komşu denemesi, µs).
2. **D2 Malzeme açığı (`material`):** bir renk `c` için kalan bütün dilimlerdeki boş `c` hücresi > saha + kuyruk +
   teslim edilmemiş partilerdeki ağır olmayan `c` blokların hücre toplamı (`c` renkli boya kapısı varsa o kapıdan
   geçebilen her ağır olmayan blok `c` sayılır). Renk toplamı, µs.
3. **D3 Döşeme/erişim (`tiling`, MVP'de isteğe bağlı):** aktif dilimin kalan hücreleri mevcut bloklarla K-34 sırasına
   uygun ve fiziksel olarak uygulanabilir biçimde (açık gökyüzüyle düşüş ya da hizalanabilen geçitten ray; asansör/kayar
   kapı aralıkları dahil) döşenemiyor. 20 000 düğüm sınırlı kesin örtü DFS'i; **bütçe biterse "kilit yok" sayılır**
   (yanlış pozitifle bedava yardım verilmez).
K-34 gömülü delikleri kaynağında önlediği için şantiye kaynaklı kilit artık nadirdir; D3 çoğunlukla E-26 gibi
"sayı yetiyor ama şekil uymuyor" durumlarında tetiklenir.

**Yardım yolları** (`truckHelp`, ücretsiz, hamle harcamaz; sayısı sınırsız):
| Neden | Yardım | Uygulama |
| --- | --- | --- |
| D1 | önce bütün zincirler ve ıslaklık kalkar (`unchain`); hâlâ D1 ise saha yeniden dizilir (`reshuffle`) | zincir sayımı K-41'e göre (`clear: chain` sayılır); dizme aşağıdaki yapıcı algoritmayla, **şekil değişmez** |
| D2 | eksik hücre sayısı kadar o renkte `B1` kamyonla gelir (`deliverMissing`) | `deliverExtra('B1', c, n)` → K-25 yolu: kuyruğun sonuna eklenir, aynı hamlenin teslimat kuralıyla düşer; saha doluysa kuyrukta bekler (E-23) |
| D3 | saha blokları renk başına hücre toplamı korunarak yeniden şekillendirilip dizilir (`reshape`; S-19 GDD yanıtı: yalnızca D3'te) | yapıcı algoritma, "yeniden kesme" izni açık |

**Yapıcı (constructive) dizme algoritması** — deneme-yanılma değil, çözümü inşa ederek garanti eder:
1. Aktif dilimin kalan hücreleri için seed'li RNG ile bir döşeme `T` ve K-34'e uygun yerleşim sırası bul (D3'teki
   DFS). `reshuffle`'da yalnızca sahadaki mevcut bloklardan seçer; `reshape`'te mevcut hücre/renk bütçesinden yeniden kesebilir.
2. Sahadaki tüm hareketli blokları kaldır (engeller yerinde kalır). Şaşırtmacaları (decoy) alttan, sütun sütun yerleştir.
3. `T`'nin bloklarını **ters yerleşim sırasıyla** üste koy: ilk gereken blok en üstte ve duvara en yakın sütunda olur;
   her yerleşimden sonra bloğun erişilebilirliği BFS ile denetlenir.
4. **Güvence (GDD K-30 "≤ 2 hamlede doğru yerleşim"):** önce 1 hamlelik doğru yerleşim aranır (BFS + `isCorrectPlacement`,
   ≤ 1 ms). Yoksa 20 ms bütçeli 2 hamle denetimi (≈ 15 parça × 40 hedef × BFS ≈ 100 ms masaüstü tam arama; bütçe
   kesilince yapıcı düzen kabul edilir, çünkü 3. adım ilk gereken bloğu inşa yoluyla en üste koyar). D1/D2 yardımından
   sonra da güvence tutmazsa D3 `reshape`'e yükseltilir.
5. `truckHelp{kind, moves | delivered}` olayı (JUICE #21'in üç varyantı: "eksik malzeme geldi", "zincirler çözüldü",
   "saha yeniden dizildi").

**Pahalı (kesin) alternatif — reddedildi:** rastgele karıştır + tam solver ile doğrula + tutmazsa tekrarla. Çalışma
zamanında saniyeler sürebilir ve tekrar sayısı sınırsızdır; yalnızca araçlarda (bot raporunda) çapraz denetim olarak
kullanılır.

**Bilinen istismar (product-lead'e, S-30):** oyuncu Boya Kapısı/Fırçası ile gereken rengi bilerek başka renge boyarsa
D2 tetiklenir ve en esnek şekil olan `B1`'ler bedava gelir. Teknik seçenekler: D2 teslimatı `B1` yerine eksik bölgeyi
döşeyen şekillerle yapılır, ya da boyayla oluşan açıkta yalnızca D3 çalışır. Kural kararı product-lead'in; ikisi de aynı
maliyette.

Testler: "K-30 D1 removes chains and wet first", "K-30 D2 delivers missing B1 bricks", "K-30 D3 reshape keeps color
cell totals", "K-30 help guarantees a correct placement within 2 moves", "E-23 …", "E-26 …".

---

## 10. Render (Phaser 4.2.1)

### 10.1 Oyun yapılandırması

```ts
new Phaser.Game({
  type: Phaser.AUTO,                                  // WebGL (Phaser 4'te WebGL1 bağlamı); Canvas yalnızca yedek (deprecated)
  parent: 'game', width: 1080, height: 1920,
  backgroundColor: tokens.color.chapter.ch1.skyTop,                 // sahne değişince o bölümün skyTop'u
  scale: { mode: display.scaleMode === 'fit' ? Phaser.Scale.FIT : Phaser.Scale.EXPAND,   // R-06: ikisi de desteklenir
           autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  fps: { target: 60, smoothStep: true },
  input: { activePointers: 2, windowEvents: true },
  scene: [BootScene, SplashScene, HomeScene, PreLevelScene, LevelScene, StoryScene, BridgeScene, LeagueScene, ShopScene],
});
```

- **FIT ve EXPAND birlikte (R-06; öneri P-7 = design-lead P-4, proje sahibi seçer):** 1080×1920 = 0,5625 en-boy.
  360×800 Android'de FIT ile ekranın **%20'si** (160 px) boş kalır; 390×844 iPhone'da güvenli alanlar çıkınca
  (≈ 390×763) **%9**. EXPAND görünür alanı uzun eksende büyütür (oyun boyu 1080 × 1920…`meta.designHeightMax` 2400),
  tasarım genişliği 1080'de sabit kalır. Seçim tek ayardır (`src/config/display.ts → scaleMode`, varsayılan
  `'expand'` öneri; brif `'fit'`).
- **Çapa sözleşmesi** (`theme/layout.ts`, `Layout.recompute(H)`; `scale.on('resize')`): tokens'taki `layout.*` y değerleri
  1920'ye göre mutlaktır. Kod bunları üç gruba ayırır: `y < craneTopY` olan öğeler (üst çubuk, panorama, hedefler,
  hamle sayacı) **üste**, `y ≥ boardBottomY` olanlar (durum satırı, karakter, güçlendirici çubuğu, alt navigasyon)
  **alta** (`y' = y + (H − 1920)`) çapalanır; tahta bandı (`craneTopY…boardBottomY`) arada kalan alanda dikey ortalanır.
  design-lead `layout.top.*` / `layout.bottom.*` grupları eklerse onlar esas alınır. FIT'te `H = 1920` olduğundan
  `recompute` birim dönüşümdür; aynı kod iki modda da çalışır. Test: 1920 ve 2400 yükseklikte öğeler çakışmaz,
  dokunma hedefleri ≥ `touch.minTargetPx`.
- **Güvenli alan:** `index.html`'deki `#game { inset: env(safe-area-inset-*) }` korunur; Phaser tuvali çentiği hiç görmez,
  çentik bandını `body` arka plan rengi doldurur; renk sahne değişiminde o hikaye bölümünün `color.chapter.chN.skyTop`
  değeriyle güncellenir (Bölüm 5 gece moru). Capacitor 8'de de aynı yöntem geçerli (§13: kenardan kenara düzen CSS
  `env()` ile).
- `desynchronized: true` (düşük gecikmeli tuval) yalnızca Faz 5 performans deneyi olarak denenecek (yırtılma riski).

### 10.2 Prosedürel dokular: açılış atlası + bölüm başında blok pişirme (R-05)

Phaser 4'te `Create.GenerateTexture` / `TextureManager.generate` **yok** (§0); Phaser `Graphics` SVG yolu, kesik çizgi ve
`shadowBlur` desteklemez. Yöntem: `textures.createCanvas(key, w, h)` → `CanvasTexture.context` üzerine **Canvas2D** ile çiz
(`Path2D(svgPath)`: Safari 8+, Chrome 36+) → her kare için `tex.add(frameName, 0, x, y, w, h)` → **tek** `tex.refresh()`
(tek GPU yüklemesi). `DynamicTexture`/`RenderTexture` kullanılmaz (v4'te her çizim için `render()` gerekir).

**(a) Açılış atlası** (`atlas`, 2048×2048, Boot'ta bir kez):

| Doku ailesi | Adet | Tarif (ART §4, tokens) |
| --- | --- | --- |
| Plan hücresi | 8 renk | içe `plan.insetPx` (8 px), köşe `plan.cornerRadiusRatio` (0,14c); **önce tebeşir altlık `color.board.planUnderlay` (#BCCADD), üstüne renk `alpha.planFill` (0,8)** — renk körü modunda `a11y.colorBlindPlanFill` (0,9); kontur `plan.strokePx` 4 px **kesik** (`plan.dash` 14/10), renk = `color.planStroke.X` (bileşik × `plan.strokeFactor` 0,65); sembol %100, mürekkep `color.planInk.X` (**Y, G, O, C → koyu lacivert #14233D; W, R, B, P → beyaz %90**); bevel/parlama/gölge yok. `color.plan.X` bileşik hex'i yalnızca kontrol testidir (formül ±1) |
| `.` hücresi | 1 + birleşik pencere çerçeve parçaları | dolgu yok; 45° beyaz `alpha.planEmptyHatch` tarama (`plan.hatchWidthPx`/`hatchSpacingPx`), kesik kontur `alpha.planEmptyStroke` |
| `?` hücresi | 1 | beyaz %10 dolgu, kesik kontur, `plan.hiddenTagPx` kâğıt etiket + "?" |
| Ozalit ızgara kaplaması | dilim başına 1 saydam doku | ince/kalın ızgara (`alpha.blueprintLine`/`Major`); **plan hücrelerinin üstünden, blokların altından** geçer (§10.3) |
| Bayrak kaplamaları | cam, harç, balon, zincir, ıslak + 9 sayaç rakamı | blok üstüne ayrı görüntü (ART §3 bayrak tablosu) |
| Engeller, duvar/geçitler, şantiye zemini, parçacık | ART §4–§6 | |
| Gölge rozetleri | ✓, !, çatlak cam, ↩ | `a11y.ghostBadgePx` (renk körü modunda `colorBlindGhostBadgePx`) |

**(b) Bölüm başında blok pişirme** (`level-<id>` sayfası, 2048×1024; gerekirse ikinci sayfa): bölümde geçen her
**(şekil × renk × bayrak kümesi)** birleşimi için **bir parça dokusu** (≤ 3c × 3c = 360×360; tipik bölümde ≤ 24 adet).
Tarif ART §3 birebir: dış kenarlar `block.insetRatio` içe çekik, kesintisiz dış kontur (`block.outlinePx`, taban ×
`outlineFactor`), yuvarlak dış köşe (`cornerRadiusRatio`), **içbükey köşe** (konturun 6 px çeyrek yayı, yarıçap 0,06c;
4-komşu maskesinin bilemediği çapraz bilgi parça düzeyinde bilinir), bevel ve alt gölge bantları yalnızca açık
kenarlarda, **parlama hapı yalnızca maskesinde üst ve sol açık olan hücrelerde** (ART: "ilk hücre"), iç dikiş, sembol.
**Sembol mürekkebi kuralı** (ART §2.2): taban L* ≥ 60 (Y, C, G, O) → tabanın ×0,40 koyusu %100 opak; L* < 60 (W, R, B,
P) → beyaz %85 (`color.symbolInk.X` varsa o okunur, formül test edilir). Her şekil için ayrıca **siluet dokuları**:
temas gölgesi ve kaldırılmış gölge (`shadowBlur` ile önceden bulanık; çalışma anında Filter yok) ve düşüş gölgesi
stilleri (doğru: düz, hatalı: kesik, nötr: kesik beyaz, iptal). Bayraklı parçada bayrak katmanı ART sırasıyla (renk
bloğunun üstüne, sembolün altına) pişirilir; ıslak sayacı ayrı görüntüdür (değişir).

- Neden hücre karosu (128 doku) yerine parça pişirme: kesintisiz kontur, içbükey köşe ve parlama parça düzeyinde
  özelliklerdir; parça başına 1 `Image` (9 hücrelik `Container` yerine) JUICE #3/#6/#10 izlerini ve çizim çağrılarını
  ucuzlatır. Hücre karosu yalnızca plan hücreleri için kalır. Kamyonla gelecek partilerin birleşimleri de bölüm
  başında pişirilir (bölüm verisinden bilinir); Boya Fırçası/boya kapısı yeni bir renk üretirse o birleşim o anda
  pişirilir (≤ 2 ms, tek `refresh`).
- Maliyet (tahmin, Faz 2 perf testinde ölçülecek): bölüm başında 24 parça + siluetler orta telefonda 10–30 ms; bellek
  sayfa başına 8 MB GPU. Açılış atlası 16 MB. Maksimum doku boyutu açılışta denetlenir; < 2048 ise sayfalar bölünür.
  Renk körü modu değişince açılış atlasının plan kareleri ve bölüm sayfası yeniden pişirilir (20–40 ms; Ayarlar
  ekranında kabul edilebilir).
- Ölçüler `tokens.layout.cellPx` (120) ve `tokens.block.*` / `plan.*` oranlarından gelir; `/9` formülü yoktur (R-04).
- Çizim fonksiyonları `src/theme/draw/*.ts` içinde **saf Canvas2D** fonksiyonlarıdır (`(ctx, spec, tokens) => void`);
  aynı fonksiyonlar `tools/level-preview.ts` tarafından Chromium içinde PNG üretmek için kullanılır (çift çizim kodu yok).
- Değerler `src/theme/tokens.json`'dan okunur (design-lead, D-003; salt okunur). `tokens.ts` dosyayı zod/mini ile
  doğrular; eksik anahtar geliştirmede açılış hatasıdır. Var olan adlar kullanılır (`color.chapter.chN.skyTop`,
  `drag.fingerOffsetCells`, `layout.*`); `tests/theme/tokens.test.ts` hazır renk ↔ formül (±1) tutarlılığını denetler.
- WebGL bağlam kaybı: Phaser 4 kaynakları kendisi yeniden kurar, yalnızca dinamik (GPU'da çizilmiş) dokuları kullanıcıya
  bırakır (`Phaser.Renderer.Events.RESTORE_WEBGL`). Atlas ve bölüm sayfaları kaynak tuvali olan `CanvasTexture`
  olduğundan tuvaller bellekte tutulur ve bu olayda savunma amaçlı `tex.refresh()` çağrılır.
- **Font (design-lead seçimi Baloo 2, OFL 1.1):** `public/fonts/baloo2-latin-tr.woff2` (38 KB alt küme) kendi
  sunucumuzdan; `index.html`'de `<link rel="preload" as="font" type="font/woff2" crossorigin>` + `@font-face {
  font-family: "Baloo 2"; font-weight: 400 800; font-display: block }`. Boot `document.fonts.load('800 120px "Baloo 2"')`
  ve `'600 44px "Baloo 2"'` bitmeden `Text` oluşturmaz (yedek fontla rasterize olup düzelmeme riski). Yedek
  `tokens.font.fallback`. iOS'ta değişken ağırlık seçimi cihazda doğrulanır; bozuksa yedek iki statik örnek (700, 800).
  Lisans metni Ayarlar > Lisanslar'da.
- **Değişen sayılar:** canvas `tnum` açamaz (MDN). Hamle sayacı, altın ve geri sayım **ortaya hizalanır** ve rakamlar
  en geniş hane genişliğinde sabit yuvalara konur (rakam kaymaz). design-lead "Baloo 2 Tnum" alt kümesini teslim ederse
  bu etiketler o aileyi kullanır; kod tarafında tek satır.
- **Filter'sız efektler** (§10.6): doldurma/silme efektleri (#12, #17, #28, #63) yeni renkli ikinci `Image`'ın `setCrop`
  genişliği tween'iyle; parlamalar `setTint().setTintMode(FILL)` + alfa tween'iyle; bulanık gölgeler önceden pişirilmiş
  siluetlerle; spot ışığı 4 dikdörtgen + 4 çeyrek daire görüntüsüyle.

### 10.3 Sahne düzeni ve nesneler

- `LevelScene` katmanları (derinlik): arka plan → tahta zemini (saha, duvar, ozalit) → plan hücreleri → **ozalit ızgara
  kaplaması** (plan hücresinin üstünden geçer, bloğun üstünden geçmez; ART §4) → bloklar → düşüş gölgesi → sürüklenen
  blok (en üstte) → efektler → HUD (`ui/`).
- `PieceView` = tek pişirilmiş parça `Image` (§10.2b) + değişen kaplamalar (ıslak sayacı). Blok görüntüleri bölüm
  sayfasından, plan ve kaplamalar açılış atlasından → toplu çizim (hedef ≤ 15 draw call).
- Albüm (R-19): MVP'de alt navigasyonda Takım gibi kilitli "Yakında" sekmesi; Albüm sahnesi, kart verisi ve "Albüme
  eklendi" animasyonu MVP'de yazılmaz; bölüm sonu sahnesinin son paneli yapı kartını gösterip kapanır. Kayıtta Albüm
  alanı yoktur (Sonra: migration ile eklenir).
- Tahtaya tek bir görünmez etkileşim bölgesi konur; tutma testi hücre koordinatından `yardOcc`/`siteOcc` ile yapılır
  (blok başına Phaser isabet testi yok). Dokunma payı `tokens.touch.hitSlopPx` (design-lead 12 → 30 px önerdi; kod
  değeri okur): blok kutusu bu kadar genişletilir; aynı noktayı birden çok blok kapsıyorsa dokunuş **en yakın hücre
  merkezine** sahip bloğa gider.
- Panorama (K-06): tamamlanan dilimlerin küçük kopyaları atlas karelerinden ölçeklenmiş `Image`'larla çizilir
  (dilim başına ≤ 16 görüntü); RenderTexture gerekmez.
- `Label`: Phaser `Text`; yalnızca değer değişince güncellenir (hamle sayacı hamle başına 1 kez).

### 10.4 Nesne havuzu

`Pool<T>` (`acquire`/`release`/`prewarm`): `PieceView` (48 hazır), plan hücresi `Image` (≤ 80), gölge görüntüsü (2),
sayaç etiketleri. Parçacık: doku ailesi başına bir `ParticleEmitter` sahne açılışında oluşturulur, `explode()` ile
kullanılır; `particles.maxOnScreen` bütçesi `maxAliveParticles` ile emitter'lara bölünür (en eski patlama erken söner),
`particles.win` dalga başına 40 × 2 dalga. Bölüm geçişinde
sahne yok edilmez; `LevelScene.reset(level)` havuzları boşaltıp yeniden doldurur → bölümler arası geçişte tahsis yok.

### 10.5 Girdi

§4.4–§4.7. Ek ayrıntılar: BFS `pointerdown`'da hemen yapılır; görsel kaldırma (`duration.pick` 80 ms)
`drag.startThresholdPx` / `holdMs` aşılınca başlar; eşik altında bırakma dokunmadır (K-07). Parmak ofseti
`tokens.drag.fingerOffsetCells` (1,2). Sürükleme sırasında `input.activePointers` ikinci parmağı yok sayar.
`pointerupoutside` = mevcut düğümde bırakma. Animasyon sırasında girdi §6.3 (R-12); G-L yönlendirme girdisi §4.7.

### 10.6 Kare bütçesi (60 FPS = 16,7 ms)

| Kalem | Bütçe |
| --- | --- |
| Çekirdek mantık (sürüklemede) | ≤ 0,3 ms (ölçülen BFS: ≤ 41 µs, 6×) |
| `EventPlayer` + tween güncellemesi | ≤ 1 ms |
| Phaser güncelleme + çizim komutları (≤ 400 nesne, ≤ 15 draw call) | ≤ 4 ms |
| GPU (1080×≤2400 ≈ 2,6 Mpx, üst üste çizim ≤ 2,5×) | ≤ 6 ms |
| Pay | ≥ 5 ms |

Kurallar: sıcak yollarda (`pointermove`, `update`) tahsis yok; oyun sırasında Filter (shader geçişi) yok (yalnızca
kazanma ekranında kısa parlama, "animasyonları azalt" kapalıysa); her karede yeniden çizilen `Graphics` yok
(gölge = önceden çizilmiş hücre görüntüleri).

### 10.7 Performans test planı

`npm run perf` → `tools/perf.ts`:
1. `vite build --mode harness` (üretim ayarları + yalnızca `src/harness/` kancaları; debug paneli yok, R-20) +
   `vite preview` (yerel port).
2. Playwright Chromium: `executablePath: '/opt/pw-browsers/chromium'` (kurulu rev 1194 / Chromium 141; Playwright 1.63
   rev 1243 bekliyor — `playwright install` çalıştırılmaz), 390×844, DPR 3, `isMobile`, `hasTouch`.
3. CDP: `Emulation.setCPUThrottlingRate { rate: 4 }` (ve ayrıca 1×).
4. `/?harness=1&level=N&autoplay=golden` açılır; harness kancası golden çözümü, CDP `Input.dispatchTouchEvent`
   (touchStart → 60 Hz touchMove dizisi → touchEnd) ile **gerçek sürükleme** olarak oynatır.
5. Ölçümler: sayfa içi rAF örnekleyici (`window.__perf`) → ortalama FPS, p50/p95/p99 kare süresi, > 20 ms kare oranı;
   `PerformanceObserver('long-animation-frame')` (Chromium 123+); girdi gecikmesi = `touchmove.timeStamp` ile bloğun
   yeni konumda çizildiği ilk rAF arasındaki fark (`DragController` ölçer); `Runtime.getHeapUsage` ile bellek.
6. Geçme ölçütü (brif §14): 4× yavaşlatmada **ortalama ≥ 50 FPS**, p95 ≤ 25 ms, sürüklemede > 50 ms uzun kare yok,
   girdi gecikmesi ≤ 1 kare. **FTUE kapısı:** soğuk başlangıç, 4× CPU + CDP "Fast 4G" (web ilk ziyaret), gezinme
   başlangıcı → `window.__levelInteractive` ≤ 10 s (giriş sahnesinin 3 paneli dahil, UX §2.1). Yükleme sırası: font +
   3 giriş paneli hazır olunca paneller başlar; açılış atlası, `level_001` derlemesi ve bölüm pişirmesi panellerin
   arkasında yapılır; diğer paneller tembel yüklenir.
7. Uyarı: headless GPU yazılımsal (SwiftShader) → GPU payı olduğundan kötü görünür; sonuç "CPU güvenilir, GPU gösterge"
   diye işaretlenir.
8. **Gerçek cihaz turu (R-23, BUSINESS R-09):** Faz 2 çıkış kapısında ve Faz 5'te aynı harness `chrome://inspect`
   uzaktan hata ayıklamayla iki cihazda çalışır:
   - **Referans düşük seviye cihaz:** ≤ 3 GB RAM, Android 10–12, giriş seviyesi SoC, 720p ekran, Chrome/WebView güncel.
     Hedef (tahmin, ilk ölçümde kesinleşir): **≥ 30 FPS kararlı** (p95 ≤ 33 ms), sürüklemede girdi gecikmesi
     **≤ 2 kare**, bölüm başı pişirme ≤ 60 ms, ilk açılıştan Bölüm 1'e ≤ 10 s.
   - **Orta seviye cihaz:** brif hedefi **60 FPS**, girdi gecikmesi 1 kare.
   Model listesi entrepreneur ile seçilir (cihazlar BUSINESS §10 bütçesinde; Faz 2 başında alınır). Ölçüm eşiğin
   altındaysa **"azaltılmış efekt" profili** otomatik açılır (açılışta 2 s'lik kısa FPS örneklemesi + `deviceMemory`
   ≤ 3 ipucu): parçacık × `particles.reducedFactor`, kaldırılmış gölge bulanıklığı yerine düz siluet, idle döngüler
   kapalı; hareket ve oyun bilgisi aynı kalır ("animasyonları azalt" erişilebilirlik ayarından bağımsız). Faz 5'te
   ek olarak 1 eski iPhone (WKWebView).
9. Mikro ölçümler: `vitest bench` (`tests/perf/*.bench.ts`) → BFS, `computeFall`, `isCorrectPlacement`, `applyMove`,
   `settleYard`, karma, bölüm başı pişirme.

---

## 11. Meta servisleri

Ortak ilke: `meta/` saf mantıktır ve zamanı `Clock` arayüzünden alır (`now(): number`, ms). Testler `FakeClock`
kullanır; böylece can yenileme, etkinlik süresi, lig haftası deterministik test edilir. `services/` platforma dokunan
ince adaptörlerdir (web ↔ Capacitor).

### 11.1 Kayıt (`services/save`)

```ts
interface KeyValueStore { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
// web: localStorage · Capacitor (Faz 5): @capacitor/preferences (açılışta belleğe yüklenir, yazma arkada)
interface SaveFile { v: number; data: SaveDataV<n> }   // v = şema sürümü
const MIGRATIONS: Record<number, (old: unknown) => unknown> = { 1: m1to2, 2: m2to3 /* … */ };
```

- Anahtar `minikusta.save`; yedek `minikusta.save.bak` (son başarılı yazımın kopyası).
- Yükleme: JSON parse → `v` < güncel ise migration zinciri (`v → v+1 → …`) → zod/mini şeması ile doğrulama →
  başarısızsa yedekten dene → o da bozuksa varsayılanlarla başla, bozuk metni `minikusta.save.corrupt`'a koy,
  `track('save_corrupt')`. Her migration'ın test fikstürü vardır (eski sürüm JSON → beklenen yeni JSON).
- Yazma: anlamlı olaylarda (bölüm sonu, satın alma, yıldız harcama, ayar değişimi), **her commit edilen hamleden sonra**
  (bölüm içi kayıt, aşağıda) ve `visibilitychange: hidden` / `pagehide`'da (birleştirme beklenmeden, hemen); diğer
  yazımlar 500 ms birleştirme (debounce).
- İçerik (v1): ilerleme (en yüksek bölüm, bölüm başına kazanıldı), yıldız, altın, can + `regenAnchor` +
  `unlimitedLivesUntil` + ayrılmış can, güçlendirici envanteri + verilen ücretsiz denemeler, galibiyet serisi, kasaba
  görevleri + görülen sahneler, günlük ödül döngüsü, sandıklar, kumbara, etkinlik katılımları (`eventInstanceId`,
  `cohortIndex`, katılım zamanı, deneme başına teklif sayısı, tur harcaması), ayarlar (erişilebilirlik dahil),
  analytics kimliği, `inLevel`. Albüm alanı yok (R-19).

**Bölüm içi devam (R-13, GDD K-43 revizyonu, entrepreneur önerisi):**

```ts
interface InLevel {
  levelId: number; seed: number;                 // GDD K-43 alanları
  actions: SessionAction[];                      // 'start' (preBoosters, streakTier) + sürüklemeler (via, steer) + güçlendiriciler + kabul edilen teklifler + undo
  offersUsed: number; adOfferUsed: boolean; offerSpendCoins: number;   // K-29, R-15, R-16 sayaçları
  outcomeWindow: 'none' | 'outOfMoves' | 'won';  // açık pencere (kaçış yolu yok)
  levelHash: string; rulesVersion: number;       // teknik ek: bölüm JSON karması + çekirdek kural sürümü
  attemptId: string; startedAt: number;          // can bölüm başında ayrıldı (META)
}
```

- Bölüm başında can ayrılır ve `inLevel` yazılır; her eylemden sonra (K-35 adım 12 bitince) `actions`'a eklenip
  hemen kaydedilir (≈ 50–150 bayt/hamle; bölüm başına ≤ 15 KB). Kazanınca/kaybedince/onaylı çıkışta silinir.
- **Uygulama kapanması, arama, sistemin WebView'i öldürmesi kayıp sayılmaz.** Açılışta `inLevel` varsa oyuncu doğrudan
  bölüme döner (başka bölüm başlatılamaz): `GameSession.replay(level, actions)` belirlenimci çekirdekle durumu kurar (≤ 100 hamle × µs → < 5 ms; ara
  tamponlar Geri Al için son hamleye kadar tutulur). G-H sayacı ve animasyonlar sıfırdan başlar; olay oynatılmaz.
  Sürükleme ortasında kapanma = o sürükleme iptal (K-07 satır 1). Kazanma ekranındayken kapanırsa ödüller verilmiş
  sayılır (`outcomeWindow = 'won'` → açılışta ödül ekranı). Köprü'de süre içinde başlatılan bölüm süre dolduktan sonra
  biterse de sayılır (E-38, META §6.1).
- Kayıp penceresi açıkken (sayaç 0, kazanılmamış) kapatılırsa açılışta **aynı pencere** gelir (kaçış yolu yok).
- `levelHash` ya da `rulesVersion` uyuşmazsa (güncellemeyle bölüm ya da kural kodu değişmiş) tekrar oynatma güvenilmez → deneme cezasız kapatılır, can ve
  oyun öncesi güçlendiriciler iade edilir, `track('level_resume_invalid')`.
- **Kayıp yalnızca** oyuncunun onaylı "bölümden çık"ında (`m ≥ 1`) ya da hamleler bitip teklif reddedilince olur.
  `m = 0` çıkışı cezasızdır (P-7 KABUL): can iade, oyun öncesi güçlendiriciler iade, seri bonusu tüketilmez (sonraki
  girişte aynen verilir). Çıkış onayı metni `m`'ye göre ayrılır (UX). Köprü'de `quitAfterFirstMove` aynı `m ≥ 1`
  koşuluyla elenme üretir.
- Testler: "E-38 …", "E-41 …", "K-43 app killed mid-level resumes same state", "K-43 m=0 exit is free and refunds boosters", "K-43 loss
  window survives restart", "K-43 level hash mismatch aborts without penalty".

### 11.2 `EventService` ve deterministik bot simülasyonu (R-14)

```ts
interface EventService {
  list(now: number): EventSummary[];                                   // aktif/yaklaşan etkinlikler
  join(eventId: string, now: number, playerLevel: number): EventState;
  reportLevelResult(eventId: string, r: { won: boolean; difficulty: Difficulty }, now: number): EventState;
  standings(eventId: string, now: number): Standings;                  // köprü: kalan sayısı; lig: sıralama
}
// MVP: LocalBotEventService (bu bölüm) · Sonra: RemoteEventService (backend) — aynı arayüz

// src/services/events/botSim.ts — SAF modül; imza yalnızca bunları alır (ödeme, altın, kayıt yok):
function simulateBridge(cfg: EventsConfig['wobblyBridge'], seed: BotSeed, joinAt: number, now: number,
                        playerLevelAtJoin: number): BridgeStanding[];
function simulateLeague(cfg: EventsConfig['masterLeague'], seed: BotSeed, joinAt: number, now: number): LeagueStanding[];
type BotSeed = { eventInstanceId: string; cohortIndex: number };   // cohortIndex = katılım saatinin kovası
```

- **Tek kaynak `config/events.json` (product-lead, META §6–§7; R-02):** formül biçimi kodda, bütün parametreler
  config'ten okunur (zod/mini ile doğrulanır; düzyazı `formula` alanları `_doc` önekine taşınmalı, kod onları okumaz).
  - Köprü botu `i`: `skill_i = skillMin + skillRange·u(i, 0, SKILL)` (0,50 + 0,45u); `k`'inci deneme zamanı
    `t_k = joinAt + Σ_{j≤k} (min + (max − min)·u(i, j, GAP))` dk (`attemptIntervalMinutes` 3–15); deneme zorluğu
    `d_k` = oyuncunun `playerLevelAtJoin + k − 1` bölümünün zorluğu; kazanma olasılığı
    `p = clamp(skill_i · difficultyFactor[d_k], min, max)` (0,05–0,97); kazanma `u(i, k, WIN) < p`. Bot ilk kaybında
    elenir; yalnızca `t_k ≤ t0 + durationMinutes` denemeleri yapılır. Ödeme anı (META §6.1):
    `min(T_son, max(T_oyuncu, T_bot))`; `T_son` oyuncunun süre içinde başlattığı bölüm sürüyorsa onun bitişine uzar.
  - Lig botu: `W = tierMultiplier[tier] · 100 · u²` (`u = R(i,0,0)`), geç katılım `W' = W · (1 − joinFraction)`,
    profil `p = floor(5 · R(i,0,1))`, ilerleme `P(t) = floor(W' · g_p(x) / 1000)`; `g_p` = `curveTable[p]` (21 nokta,
    binde, x adımı 0,05) üzerinde doğrusal ara değer — `Math.pow` yok, motorlar arası bit-aynı (eski `powFixed` önerim
    gereksiz kaldı). Lig çarpanı uygulanan haftalarda botlara da aynı çarpan (META).
- **Sayaç tabanlı RNG (`config/events.json → rng`, META §6.2):** `R(a, b, c)` = `hash32(eventOrWeekId, a, b, c)`
  (`fmix32-chain-v1`) tohumlu `mulberry32`'nin ilk çıktısı / 2³². Yalnızca + − × ÷ ve karşılaştırma → motorlar arası
  bit-aynı.
- **Tohum (R-14, BUSINESS E8):** girdiler yalnızca `eventInstanceId` (ya da `weekId`), `t0`, `t`, `L0`; **kurulum
  kimliği, ödeme, bakiye girmez.** Lig grubu `groupId = hash32(weekId, tierIndex, cohortIndex)` (`cohortIndex` =
  katılım saatinin kovası); `events.json` `_doc`'taki `hash(weekId, installId)` R-14 gereği değiştirilmeli (S-35).
- **Ödeme geçmişinden bağımsızlığın üç kanıtı:** (1) imza yalnızca yukarıdaki parametreleri alır; (2) ESLint
  `no-restricted-imports` `services/events/**`'tan `meta/economy`, `services/save`, `services/iap`, `services/ads`,
  `services/analytics` importunu derlemede kırar (§1.3); (3) test **"E8 bot standings are independent of purchases"**:
  aynı etkinlik iki kayıt fikstürüyle (0 ↔ 50 satın alma, 0 ↔ 1 M altın, +5 kullanmış ↔ kullanmamış) çalışır,
  sıralamalar birebir eşit olmalı; ayrıca sabit tohumlu golden zaman çizelgesi.
- **Denetlenebilirlik:** `event_join` analytics olayı `botSimVersion` + `seedHash` taşır; backend geldiğinde sonuçlar
  sunucuda yeniden hesaplanıp karşılaştırılabilir.
- **Beklenen değer testleri (META'daki değerlerle, Monte Carlo, sabit tohum kümesi):** hepsi Normal iken Köprü'yü
  ≈ 18 bot bitirir (±3); Bronz'da 20. sıra ≈ 38 puan. `tools/event-sim.ts` ortalama/medyan bitiren sayısı ve kişi başı
  pay (`prizePoolCoins / bitiren`) raporlar → entrepreneur +5 fiyatıyla karşılaştırır.
- 99 bot × ≤ 120 deneme ≈ 12 000 karma → < 1 ms. Aynı `now` → aynı sonuç; uygulama yeniden açıldığında durum tutarlıdır.
- **Usta Ligi haftası:** `weekId = floor((now − LEAGUE_EPOCH) / 7 gün)` (UTC Pazartesi 00:00; S-25 GDD yanıtı).
- Saat geri alınırsa (`now < lastSeenNow`) simülasyon ve günlük sayaçlar `lastSeenNow`'da dondurulur.

### 11.3 Ekonomi, can, yıldız, seri

- `config/economy.json` (product-lead + entrepreneur) zod/mini ile doğrulanır; kodda sabit fiyat yok. Belirsiz değerler
  `null` (`"entrepreneur_tbd"` dizgesi şemada `null`'a çevrilmeli); kod `null`'u "kapalı / yer tutucu" sayar ve
  `config:validate` uyarı basar.
- `Wallet`: altın/yıldız işlemleri tek kapıdan (`apply(tx)`), negatif bakiye imkânsız, her işlem `coin_source` /
  `coin_sink` analytics olayına gider (`amount`, `reason`, `balanceAfter`).
- Can: `lives = min(max, stored + floor((now − regenAnchor) / regenMs))` (5 can, 30 dk); dolunca sayaç durur. Can
  bölüm başında ayrılır, kazanınca iade edilir (META; §11.1 `inLevel`).
- **+5 teklifi (K-29, R-15):** deneme başına `maxOffersPerAttempt` (3) sayacı altınla **ve** reklamla alınanları birlikte
  sayar; fiyat basamağı `offerCosts[offersUsed]`; reklamın hangi teklifte seçenek olduğu `outOfMoves.rewardedAdOffer`
  (entrepreneur). Köprü turu altın harcama tavanı `wobblyBridge.maxContinueCoinsPerRun` (4.050, R-16): altınla devam
  yalnızca `runSpend + fiyat ≤ tavan` iken önerilir. Pencerede eşit
  boy düğmeler ve gerçek para karşılığı UX'tedir; çekirdek yalnızca `addMoves{source}` alır.
- **Gerçek para karşılığı (MVP):** `economy.json → refPrice { TRY, USD }` + `Intl.NumberFormat`, yanında "test sürümü"
  etiketi; mağaza sürümünde faturalama SDK'sının yerel fiyatıyla değişir (§11.8). Alan product-lead + entrepreneur'ün,
  şema code-lead'in.
- **"Gün"** = cihazın yerel takvim günü (günlük ödül, reklam tavanları); sayaçlar gün anahtarıyla tutulur; saat geri
  alınırsa `lastSeenNow`'da dondurulur.
- Galibiyet serisi (kayıpta sıfırlanır; `m = 0` çıkışında bonus tüketilmez) ve bölüm öncesi bonus `meta/streak.ts`;
  güçlendirici açılışları `meta/unlocks.ts` (bölüm numarası → açılan öğe, config'ten).

### 11.4 Analytics — tipli olay birliği

Olay adları ve parametreleri için **tek kaynak `docs/ANALYTICS.md` tablosudur** (entrepreneur + code-lead; Faz 4'te
doldurulur). Kod tarafı aşağıdaki tip birliğidir; `tests/services/analytics.test.ts` tablodaki her olayın birlikte
olduğunu ve parametre tiplerinin eşleştiğini denetler (tablo dolunca kapı olur).

```ts
type Placement = 'outOfMoves' | 'bridgeContinue' | 'lifeRefill' | 'dailyDouble';
type AnalyticsEvent =
  | { name: 'app_open' } | { name: 'session_end'; durationMs: number; levelsPlayed: number }
  | { name: 'tutorial_step'; level: number; step: number }
  | { name: 'level_start'; level: number; attempt: number; resumed: boolean; preBoosters: string[] }
  | { name: 'level_end'; level: number; result: 'win' | 'lose' | 'quit' | 'quitFree'; movesLeft: number;
      wrongPlacements: number; yao: number; durationMs: number; offersUsed: number; truckHelps: number }
  | { name: 'level_resume_invalid'; level: number }
  | { name: 'booster_used'; booster: string; level: number; free: boolean }
  | { name: 'offer_shown'; placement: Placement; priceCoins: number; offerIndex: 1 | 2 | 3; context: 'level' | 'bridge' }
  | { name: 'offer_result'; placement: Placement; priceCoins: number; offerIndex: 1 | 2 | 3; context: 'level' | 'bridge';
      result: 'coins' | 'ad' | 'declined' }
  | { name: 'ad_rewarded'; placement: Placement; result: 'rewarded' | 'skipped' | 'unavailable' }
  | { name: 'coin_source' | 'coin_sink'; amount: number; reason: string; balanceAfter: number }
  | { name: 'event_join'; event: 'bridge' | 'league'; botSimVersion: number; seedHash: string }
  | { name: 'event_continue'; method: 'coins' | 'ad'; plank: number }
  | { name: 'event_eliminated'; event: string; plank: number }
  | { name: 'store_open'; from: string } | { name: 'purchase'; sku: string; fake: boolean }
  | { name: 'chest_open'; chest: string } | { name: 'star_spent'; task: string } | { name: 'life_lost'; level: number }
  | { name: 'settings_changed'; key: string; value: string | number | boolean }
  | { name: 'save_corrupt' }
  | { name: 'age_gate_result'; bucket: AgeBucket } | { name: 'consent_result'; status: ConsentStatus }; // mağaza sürümü
track(e: AnalyticsEvent): void
```

MVP: geliştirmede konsol, her zaman son 500 olay yerel halka tamponda (debug panelinde görünür). Sağlayıcı adaptörü
(Faz 5) `ConsentService` izni vermeden başlatılmaz; o zamana kadar olaylar yerelde tamponlanır (§11.8). Kişisel veri
yok; doğum yılı saklanmaz, yalnızca yaş kovası.

### 11.5 i18n

`src/i18n/tr.json`, `en.json` (iç içe anahtarlar). `t(key, params?)`: `{n}` yer tutucuları; çoğul için
`Intl.PluralRules(locale).select(n)` → `key.one` / `key.other`. Büyük harf yalnızca `toLocaleUpperCase(locale)` (tr: i → İ).
`I18nKey` tipi `tr.json`'dan türetilir; `ui/Label` yalnızca `I18nKey` kabul eder → kodda sabit metin derlenmez.
Test: iki dosyanın anahtar kümeleri eşit, `{param}` adları eşit, boş metin yok.

### 11.6 Ses (prosedürel) — ZzFX değerlendirmesi

- ZzFX 1.4.0: **MIT**, Frank Force; tam sürüm 10,3 KB (3,6 KB gzip), mikro 1,2 KB (0,9 KB gzip). Tür tanımı yok.
- Sorunlar: modül import edilir edilmez `new AudioContext` oluşturur (Node/Vitest'te kırılır; iOS'ta kullanıcı
  hareketinden önce askıda bağlam) ve `randomness` için `Math.random` kullanır.
- **Karar önerisi (P-9):** npm bağımlılığı eklenmez; yalnızca saf `buildSamples` fonksiyonu MIT başlığı korunarak
  `src/services/audio/zzfxSynth.ts`'e alınır (≈ 2 KB), `randomness = 0` (deterministik). Efektler 22,05 kHz mono olarak
  **sahne bazında ve boşta dilimlenerek** (≤ 4 ms/kare) `AudioBuffer`'a çizilir ve `game.cache.audio.add(key, buffer)`
  ile önbelleğe konur; çalma `scene.sound.play(key, { rate, volume })` (kombo perdesi, ±2 yarım ton ses varyasyonu ve
  +dB farkları yeniden çizimle değil `rate`/`volume` ile). Bağlam kilitliyken gelen çalma istekleri **atılır**,
  kuyruğa alınmaz (açılış logosu sesleri süs kabul edilir).
- **Parametre sahipliği:** ZzFX parametre dizileri `tokens.json → audio.sfx.<ad>: number[]` altında durur (design-lead'in
  dosyası, D-003); `sfx.ts` yalnızca adları bu dizilerle eşler. Ad listesi ASSET_LIST §13. Eksik ad açılışta geliştirme
  hatasıdır.
- Ayarlar: ses/müzik ayrı kısılır; sekme gizlenince `sound.pauseAll()`.

### 11.7 Haptik

```ts
type HapticName = 'light' | 'medium' | 'heavy' | 'doubleLight' | 'success' | 'win';   // = tokens.haptic anahtarları
interface Haptics { play(name: HapticName): void }
```

- Web: `navigator.vibrate(tokens.haptic[name])` (sayı ya da desen dizisi; değerler tokens'tan, kodda sabit yok).
  **Doğrulanmış destek:** Chrome Android 32+ (Chrome 60'tan beri kullanıcı hareketi şart), Firefox Android 79+ çağrıyı
  kabul eder ama titreşmez, **Safari ve iOS Safari'de hiç yok** (MDN BCD `version_added: false`). iOS web'de no-op.
- Capacitor (Faz 5): `@capacitor/haptics` 8.0.2; ad → `Haptics.impact({ style })` / `Haptics.notification(...)`
  eşlemesi JUICE §0.7 tablosundan. iOS'ta haptiğin tek güvenilir yolu budur.
- Yalnızca Ayarlar'daki "titreşim" anahtarına bağlıdır; "animasyonları azalt" haptiği kapatmaz (§6.3).

### 11.8 Mağaza servisleri: onay, reklam, satın alma (R-23; MVP'de sahte)

Gerçek SDK'lar Faz 5'te (mağaza sürümü) aynı arayüze takılır; oyun kodu yalnızca arayüzü görür. Eklenti seçimi o gün
`npm view` ile doğrulanır (D-002).

```ts
type ConsentStatus = 'unknown' | 'granted' | 'denied';
type AgeBucket = '<13' | '13-17' | '18+' | null;            // yalnızca kova saklanır, doğum yılı saklanmaz
interface ConsentService {
  status(): ConsentStatus; ageBucket(): AgeBucket;
  ready(): Promise<void>;                                   // yaş ekranı + CMP bitince çözülür
}
interface AdsService {                                       // ödüllü reklam; günlük tavanlar economy.json'dan
  isAvailable(placement: Placement): boolean;
  show(placement: Placement): Promise<'rewarded' | 'skipped' | 'unavailable'>;
}
interface IapService {
  products(): Promise<{ sku: string; coins: number; priceLabel: string }[]>;
  buy(sku: string): Promise<'purchased' | 'cancelled' | 'failed'>;
}
```

- **MVP (web):** `FakeConsent` (`granted`, `null`), `FakeAds` (1 s yer tutucu, her zaman `rewarded`; tavan mantığı ve
  analytics çağrıları gerçek), `FakeIap` (onay metni "Bu bir deneme satın alımıdır, ücret alınmaz.", E9;
  `purchase{fake: true}`). Tavanlar, sayaçlar ve `offer_*`/`ad_rewarded` olayları servis katmanında olduğundan Faz 5'te
  yalnızca uygulama sınıfı değişir.
- **Başlatma sırası (P-10, mağaza sürümü):** reklam ve analitik sağlayıcıları `ConsentService.ready()` çözülmeden
  **dinamik import** edilmez; o zamana kadar `track()` yerelde tamponlar. Yaş ekranı konumu: Bölüm 3 kazanma "Devam" →
  yaş ekranı → CMP → ana ekran (design-lead, UX "12. Yaş ekranı"); web MVP'de yok.
- **Yaş kuralı önerisi (ülkeden bağımsız, ihtiyatlı):** `<13` → çocuk muamelesi (kimlikli analitik ve kişiselleştirilmiş
  reklam yok); `13-17` → kişiselleştirilmemiş reklam (Madde 8 üst sınırı 16 ve TR 18 kuralı tek seferde); `18+` → onaya
  göre. Kayıtta yalnızca `ageBucket` + onay sürümü. Ülke bazlı kural seçilirse ülke kaynağı (mağaza ülkesi / cihaz
  bölgesi) entrepreneur'ce yazılmalı.
- Testler: "E9 fake purchase shows test notice", "R-15 ad-bought +5 counts toward 3 offers", "P-10 no provider import
  before consent".

---

## 12. Araçlar, komutlar, debug paneli, test stratejisi

### 12.1 Araçları çalıştırma (P-5)

Node 22.22.0 `.ts` dosyalarını bayraksız çalıştırır (type stripping; scratchpad'de doğrulandı). Bu yüzden `tsx` gibi ek
bağımlılık yok: `node tools/solve.ts`. Koşulları:
- Göreli importlar **`.ts` uzantılı** yazılır (`import { bfs } from './movement.ts'`); Vite bunu sorunsuz çözer.
  `tsconfig.json`'a `"allowImportingTsExtensions": true` (noEmit ile geçerli) ve `"erasableSyntaxOnly": true` eklenir
  (enum, namespace, parametre özelliği yasak → Node strip modu ile uyumlu; TS 6.0.3'te doğrulandı).
- JSON araçlarda `fs.readFileSync` + `JSON.parse` ile okunur (import attribute bağımlılığı yok).
- `tsconfig.tools.json` (`types: ["node"]`) → devDependency **`@types/node@22.20.5`** (Faz 2'de eklenir).
- `worker_threads` işçileri de `.ts` olarak başlatılır (`new Worker(new URL('./solve-worker.ts', import.meta.url))`).

### 12.2 npm komutları (Faz 2–3'te `package.json`'a)

| Komut | Tanım |
| --- | --- |
| `levels:validate` | `node tools/validate-levels.ts` — zod + L-01…L-18, L-21…L-23; `code` + `rule` (K-45) tablosu, hata → çıkış 1 |
| `levels:solve` | `node tools/solve.ts [--level N] [--budget 60] [--no-cache] [--update-golden]` (Faz 3) |
| `levels:bot` | `node tools/playtest-bot.ts [--games 500] [--profile orta] [--continue N]` → `docs/LEVEL_REPORT.md` + `docs/level-report/difficulty.svg` (Faz 3) |
| `levels:preview` | `node tools/level-preview.ts [--level N] [--png]` → ASCII stdout; `--png` Playwright + `theme/draw` → `artifacts/previews/` |
| `levels:check` | `levels:validate && levels:solve && levels:bot` (solver önbellekli) |
| `events:sim` | `node tools/event-sim.ts` — Köprü/Lig bot dağılımı raporu (§11.2) |
| `screens` | `vite build --mode harness && node tools/screens.ts [--profile default|ios67|android] [--cvd]` → `artifacts/screens/<ekran>[.<cvd>].png` |
| `perf` | `vite build --mode harness && node tools/perf.ts` (§10.7) |
| `build:verify` | `vite build` sonrası `tools/verify-dist.ts`: `dist/` içinde `src/debug`/`src/harness` parçası, `__debug`/`__harness` dizgesi ya da `?debug` işleyicisi **yok** (R-20); `npm run build`'in parçası |
| `test:rules` | `vitest list --json` çıktısını `tools/rule-coverage.ts` okur; GDD.md'deki **her K-01…K-46 ve E-01…E-32**, OBSTACLES.md'deki her engel kimliği (W1…W8, Y1…Y8, S1…S8, G-H, G-L) ve `[kural]` etiketli her N-notu en az bir test adında geçmiyorsa çıkış 1. Kimlik listesi belgelerden okunur (kod içinde liste yok) |
| `golden:update` | solver çözümlerini `tests/golden/`'a yazar (bilinçli, diff incelenir) |
| `typecheck` | `tsc --noEmit -p tsconfig.json && tsc -p tsconfig.core.json && tsc -p tsconfig.tools.json` |
| `check` | `typecheck && lint && format:check && test && test:rules` |

`tools/screens.ts`: `vite preview`'ı başlatır, Chromium'u `executablePath: '/opt/pw-browsers/chromium'` ile açar
(`playwright install` **çalıştırılmaz**), her ekranı `/?harness=1&screen=<Ad>&fixture=<kayıt>&reducedMotion=1` ile açar,
fontlar yüklenip sahne `window.__ready = true` dedikten sonra görüntü alır. Fikstür kayıtları (`tests/fixtures/saves/`)
her ekranın tutarlı durumda çekilmesini sağlar (ör. "Bölüm 12, 3 can, köprüde 47/100"). Profiller: `default` 390×844 @3,
`ios67` 430×932 @3 = 1290×2796, `android` 360×640 @3 = 1080×1920 (mağaza görüntüleri, ASSET_LIST §11). `--cvd`: her
ekran normal + deutan/protan/tritan; `&cvd=` parametresi `#game`'e SVG `feColorMatrix` CSS filtresi (Machado matrisleri)
uygular — yalnızca geliştirme ve harness paketinde, oyun yolunda değil.

### 12.3 Debug paneli (code-lead ilke 8; R-20)

**Yalnızca `import.meta.env.DEV` iken** `main.ts`'den **dinamik import** edilir; Vite üretim derlemesinde bu dal sabit
`false` olur ve parça pakete hiç girmez. Üretimde `?debug=1` etkisizdir (işleyici yok); `build:verify` bunu her derlemede
denetler. Staging/test için ayrı `harness` modu vardır (§1.2), panel değil yalnızca Playwright kancaları içerir ve
mağaza/web üretim paketi olarak dağıtılmaz. DOM katmanıdır (Phaser değil), sağ üstte katlanır.
- Bölüm seç (1–50 + fikstürler), yeniden başlat, seed değiştir.
- Sınırsız hamle (çekirdek `movesLeft` azalmaz; olay yine yayınlanır).
- Golden/solver çözümünü oynat: önbellekteki `tests/golden/` ve `artifacts/solver/level_NNN.json` (geliştirme sunucusu
  üzerinden); adım adım / sürekli; her adım sürükleme animasyonuyla. *(Faz 3: tarayıcıda Web Worker ile 5 s bütçeli
  solver.)*
- Yerçekimi aç/kapa (saha / şantiye profili low-normal-high), her engel kuralını aç/kapa (`disabledRules`).
- **Tahtayı ASCII kopyala** (Ek A biçimi; panoya ve konsola) + "ASCII'den yükle" (test fikstürü üretmek için).
- Olay günlüğü (son 50 olay, adım numaralarıyla), durum karması, FPS ve kare süresi grafiği, son 500 analytics olayı.
- Hamle günlüğü: `SessionAction[]` JSON dışa/içe aktar (hata raporu = bölüm + `levelHash` + günlük; §11.1 ile aynı biçim).
- Renk körlüğü önizlemesi (`cvd`), "azaltılmış efekt" profilini zorla.

### 12.4 Test stratejisi

- **Kural testleri:** GDD'deki **her K-01…K-46** en az bir test; test adı kimliği içerir:
  `it('K-17 wrong placement bounces to start and burns a move', …)`. Kenar durumları `'E-04 …'`, hat adımları
  `'K-35 step 9 …'`, engeller `'W4 shutter closes every period'`, `[kural]` N-notları `'N33 …'`, engel çiftleri
  `'W6+S3 …'`. `test:rules` kapsamayı zorlar (`npm run check`'in parçası). Kapsam tablosu aşağıda.
- **Fikstürler:** `tests/fixtures/builders.ts` → `level({ wall, gaps, plan, pieces: [['D2_0','W',2,6], …] })`
  (zod'dan geçen gerçek `LevelData` üretir) + `expectAscii(state, \`…\`)` anlık görüntü karşılaştırması (Ek A).
- **Değişmez (property) testleri** (bağımlılıksız, seed'li döngü, 1 000 rastgele geçerli hamle × 20 bölüm):
  hücre çakışması yok; parça/hücre sayısı korunur; `yardOcc`/`siteOcc`/`filled` parça tablosuyla tutarlı; aynı hamle
  dizisi → aynı karma ve aynı olay günlüğü (determinizm); **`replay(log)` = canlı oturum durumu** (K-43); `cloneState`
  sonrası değişiklik orijinale sızmaz; iptal hamlesi durumu değiştirmez (K-07); hiçbir doğru blok altında boş renkli
  hücre bırakmaz (K-34).
- **Hareket testleri:** küçük elle kurulmuş tahtalarda erişilebilir düğüm kümesi birebir beklenen kümeyle karşılaştırılır
  (K-08, K-09, K-11, K-12, K-13 dahil "çıkıntı altına yandan giriş yok"; kenar modeli eşdeğerlik testleri §2.2).
- **Golden tekrarlar:** Faz 2'de `tests/golden/level_00N.hand.json` (LEVELS el çözümleri), Faz 3'ten itibaren solver
  çözümleri (§9.5) — `levelWon` + kalan hamle + YAO + `eventLogHash`.
- **Şema/doğrulayıcı testleri:** her L-xx için bir geçersiz fikstür → beklenen `code` + `rule` (K-45 maddesi).
- **Meta testleri:** `FakeClock` ile can yenilenmesi, köprü/lig simülasyonunun `now`'a göre determinizmi, E8 iki-kayıt
  eşitlik testi, Monte Carlo beklenen değerler, save migration zinciri (eski sürüm fikstürleri), `inLevel` devamı.
- **Sahne duman testi (Faz 2, Playwright, harness paketi):** Bölüm 1 açılır, CDP dokunma olaylarıyla bir blok duvar
  üstünden taşınır, `window.__harness.state()` ile çekirdek durumu denetlenir; sayfa yeniden yüklenince bölüm aynı
  durumdan sürer (K-43); konsolda hata olmamalı.
- **Performans:** §10.7 + `vitest bench`.
- Ortam: Vitest `environment: 'node'` (mevcut); core testleri DOM'suz koşar (saflığın ek kanıtı).

**K-xx test kapsamı (K-01…K-46; "F" = ilk yazıldığı faz):**

| Kural | Ana test(ler) | F | | Kural | Ana test(ler) | F |
| --- | --- | --- | --- | --- | --- | --- |
| K-01 | koordinatlar, sınır maskeleri | 2 | | K-24 | asansör ping-pong, `h + b ≤ 8`, geçit plan satırı | 3 |
| K-02 | saha 6×8, doluluk (L-03) | 2 | | K-25 | parti kuyruğa eklenir, aday sütun sırası | 2 |
| K-03 | şantiye 2 sütun, dilim çerçevesi | 2 | | K-26 | FIFO, eskiler önce, bekletmez | 2 |
| K-04 | duvar sınırı kapalı/açık satırlar, L-09 | 2 | | K-27 | malzeme yeterliliği (L-10/L-11) | 2 |
| K-05 | Vinç Alanı iptali, 8 yüksek duvar boy ≤ 2 | 2 | | K-28 | son hamlede kazanma, Bonus İnşaat sayısı | 2 |
| K-06 | panorama durumu oyun durumunu değiştirmez | 2 | | K-29 | +5 teklif, 3 teklif sınırı (reklam dahil) | 2 |
| K-07 | iptal tablosu 6 satır, maliyetler, eşik tokens'tan | 2 | | K-30 | D1/D2/D3 tespiti ve üç yardım, ≤ 2 hamle güvencesi | 3 |
| K-08 | BFS yolu, yapışkan takip eşitlik bozucuları | 2 | | K-31 | renk sayısı/açılmış renk (L-06/L-07) | 2 |
| K-09 | tutulabilirlik (a)–(e) | 2 | | K-32 | `repeat`/`mirrorOf` çözümü, açılma | 3 |
| K-10 | saha yeniden konumlandırma | 2 | | K-33 | seri, Altın Mala, K-34'lü mala hedefi | 2 |
| K-11 | duvar üstü, açık gökyüzü, iniş formülü | 2 | | K-34 | alttan üste: ray/düşüş/balon/Vinç/Mala | 2 |
| K-12 | ray hizalama, düşmez, tam sığma | 2 | | K-35 | adım sırası, mini hat, (y, x) tarama | 2 |
| K-13 | çıkıntı altına yandan giriş yok | 2 | | K-36 | Çekiç hedefleri, zincir önce | 3 |
| K-14 | kilit, Geri Al istisnası | 2 | | K-37 | Vinç ön koşulları, harcanmama | 3 |
| K-15 | plan, `.`, dilim tamamlanması | 2 | | K-38 | Boya Fırçası paleti, harç kilitlenmesi | 3 |
| K-16 | doğru yerleşim 3 koşul | 2 | | K-39 | Geri Al derinlik 1, tam geri dönüş | 2 |
| K-17 | geri sekme sırası, kuyruk sonu | 2 | | K-40 | Termos, Mala Başlangıcı, Açık Kepenk, seri bonusu | 3 |
| K-18 | gölge = gerçek sonuç, `verdict`, `touchesHidden` | 2 | | K-41 | hedef sayımları | 2 (build), 3 |
| K-19 | cam eşikleri, G-H `holdMs` 700/1400, G-L tek yönlendirme | 3 | | K-42 | saklı nesne denetimleri #1/#2 | 3 |
| K-20 | saha yerçekimi zincirlemesi, yarım adımlar | 3 | | K-43 | çıkış `m=0`/`m≥1`, devam, kayıp penceresi | 2 |
| K-21 | bayrak birleşimleri (L-21) | 3 | | K-44 | şekil tablosu, kanonik, `shape_locked` | 2 |
| K-22 | dilim kayması + teslimat | 2 | | K-45 | her `code` için geçersiz fikstür | 2 (madde 1–7), 3 (8–9) |
| K-23 | döner platform sayacı, atlama | 3 | | K-46 | YAO sayımı (balon, G-L duvar üstü; ray geçit) | 2 |

---

## 13. Capacitor planı (Faz 5)

Doğrulanmış sürümler (2026-10-04): `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` **8.5.2**;
`@capacitor/haptics` **8.0.2**, `@capacitor/preferences` 8.0.1, `@capacitor/app` 8.1.2, `@capacitor/splash-screen` 8.0.2,
`@capacitor/status-bar` 8.0.4. Kurulum anında sürümler yeniden `npm view` ile doğrulanır (D-002 ilkesi).

| Konu | Plan |
| --- | --- |
| Gereksinimler | Node ≥ 22 (mevcut 22.22 uygun), Xcode ≥ 26.0, iOS dağıtım hedefi 15.0, Android Studio Otter 2025.2.1+, minSdk 24, compile/target SDK 36 |
| Kurulum | `npm i @capacitor/core@8.5.2 @capacitor/haptics@8.0.2 @capacitor/preferences@8.0.1 @capacitor/app@8.1.2 @capacitor/splash-screen@8.0.2` · `npm i -D @capacitor/cli@8.5.2` · `npx cap init "<görünen ad>" <paket-kimliği> --web-dir dist` (aşağıdaki kimlik kuralı) · `npx cap add ios` (SPM şablonu varsayılan) · `npx cap add android` |
| Derleme | `vite build` (`base: './'` zaten var) → `npx cap sync` → Xcode / Android Studio |
| Ekran | yalnızca dikey (Info.plist `UISupportedInterfaceOrientations`, Manifest `screenOrientation="portrait"`); kenardan kenara: Capacitor 8'de `adjustMarginsForEdgeToEdge` kaldırıldı, System Bars eklentisi + CSS `env(safe-area-inset-*)` — bizim `#game` yaklaşımımızla uyumlu |
| Platform adaptörleri | `services/platform`: `isNative`, `KeyValueStore` (Preferences), `Haptics` (Capacitor), uygulama yaşam döngüsü (`pause` → kaydet + ses durdur, `resume` → can sayacı/etkinlik yenile) |
| Ses | WKWebView'de WebAudio ilk dokunuşla açılır (Phaser kilit açıcısı); sessiz mod anahtarı davranışı cihazda test edilir |
| Paket kimliği ve ad | iOS bundle ID ve Android `applicationId` yayından sonra **değiştirilemez**: ilk mağaza yüklemesinden önce kesinleşir, ad adayından bağımsız ve nötr (`com.<stüdyo>.<nötr>`), yalnızca `[a-z0-9.]`, "kids/little/minik" içermez. Görünen ad NAMING kararından sonra girilir; her dil için ≤ 12 karakter kısa ad (ana ekran, PWA `short_name`); "&" Android `strings.xml`'de `&amp;`. Kod içi kimlikler (kayıt anahtarı `minikusta.save`, klasör adları) kod adı olarak kalır → isim değişikliği kayıt göçü gerektirmez; oyun adı metinleri yalnızca i18n (`app.title`, `{company}`) |
| iOS derleme ortamı | Xcode ≥ 26 macOS ister: fiziksel Mac ya da bulut macOS CI (tercih Faz 5 başında; aylık maliyet o gün sağlayıcıdan doğrulanır ve entrepreneur BUSINESS §10'a yansıtır). Android derlemesi Linux CI'da |
| Satın alma, reklam, onay | §11.8 arayüzleri (`IapService`, `AdsService`, `ConsentService`); MVP'de sahte uygulamalar, Faz 5'te gerçek eklentiler aynı arayüze (eklenti seçimi o gün `npm view` ile, ayrı D-xxx). Sağlayıcılar onaydan önce dinamik import edilmez |
| Performans | WKWebView/Android WebView'de aynı `perf` harness'ı uzaktan hata ayıklamayla; referans düşük seviye + orta seviye Android + 1 eski iPhone (§10.7) |
| Mağaza varlıkları | ikon/splash design-lead'den; `@capacitor/assets` vb. araçlar o gün doğrulanır |

---

## 14. Uygulama planı ve efor (Faz 2 ayrıntılı, Faz 3–5 kaba)

Süreler ajan iş günü (g); 5 g = 1 hafta. Tahminlere **%20 tampon** eklenir (entrepreneur isteği).

### 14.1 Faz 2 — dikey dilim (Bölüm 1–5)

Kapsam: K-01…K-18, K-19 (normal yerçekimi), K-22, K-25…K-29, **K-33, K-34, K-35 (tam adım sırası; engel kancaları
boş), K-39, K-41 (build), K-43 (çıkış + bölüm içi devam), K-44, K-45 (madde 1–7), K-46 (YAO ölçümü)**, W1, S1, S2;
kenar modeli (R-03); FIFO teslimat; JUICE Faz 2 P0 olayları (#1–13, 18, 19, 50–53, 55–58, 69–71); TR/EN; telefonda
oynanır. Engel çerçevesi (kayıt defteri) kurulur ama yalnızca W1/S1/S2 eklentileri yazılır. Solver yazılmaz (§9.2).

| # | İş | Çıktı | Süre | Bağımlılık |
| --- | --- | --- | --- | --- |
| 1 | Yapılandırma: `allowImportingTsExtensions`, `erasableSyntaxOnly`, `tsconfig.core.json`, `tsconfig.tools.json`, ESLint katman + bot + debug kuralları (§1.3), `build:verify`; bağımlılıklar `zod@4.6.5`, `@types/node@22.20.5` (dev) | yeşil `npm run check` | 0,5 g | — |
| 2 | `core/shapes`, `coords` (sınır maskeleri), `rng` (`hash32` vektörleri), `types` + testler (§3 tablosu birebir) | K-01, K-44 | 0,5 g | P-2 onayı |
| 3 | `core/level/schema` + `logic` (K-45 kodları; L-01…L-18, L-21…L-23) + `mechanics` + `compile` + `tools/validate-levels.ts` | `levels:validate` | 1,75 g | P-6 onayı; GDD K-45 kod tablosu |
| 4 | `core/state`, `hash`, `grid`, `ascii` + değişmez testleri | Ek A ASCII | 1 g | — |
| 5 | `core/movement` (kenar modeli, BFS, RAIL, yapışkan takip, yol, `classify`/iptal önizlemesi) + K-07…K-13 + `vitest bench` | §4 | 1,5 g | — |
| 6 | `core/gravity` (`computeFall`), `placement` (**`isCorrectPlacement` K-16 + K-34**, geri sekme), K-14…K-18 | §5 | 1,75 g | — |
| 7 | `core/moves` K-35 hattı + olay birleşimi + `site` (segments) + `delivery` (FIFO) + `goals` + `combo` + `session` (Geri Al, hamle günlüğü, `replay`) | §6 | 2,5 g | — |
| 8 | `core/obstacles` kayıt defteri + W1, S1, S2 eklentileri | §7 | 0,5 g | — |
| 9 | El çözümü golden'ları 1–5 (LEVELS §2 → `level_00N.hand.json`) | `tests/golden/` | 0,5 g | bölüm JSON'ları |
| 10 | `theme/tokens.ts` + `layout.ts` (FIT/EXPAND çapaları, değişmezler) + `draw` + açılış atlası (plan tarifi) + bölüm başı pişirme | §10.1–10.2 | 1,75 g | design-lead `tokens.json` |
| 11 | `LevelScene`: `PieceView` havuzu, `DragController` (ofset, yapışkan takip, eşik), `ShadowView` (`verdict`/`reason`/`cancel`), `EventPlayer` (JUICE P0, fast-forward, azaltılmış hareket varyantları) | oynanır tahta | 4,5 g | JUICE.md |
| 12 | UI asgari: üst çubuk (hamle, hedef), panorama, kazanma/kaybetme pencereleri, çıkış onayı (`m = 0` / `m ≥ 1`), giriş sahnesi (yer tutucu 3 panel), Boot → Bölüm 1 (≤ 3 dokunuş, ≤ 10 s) | | 1,75 g | UX_FLOWS.md |
| 13 | Servisler: i18n (tr/en), save v1 + `inLevel` devamı, analytics tip birliği (yerel), ses (zzfxSynth + tokens `audio.sfx`, 6 efekt), haptik (tokens) | §11 | 1,75 g | metinler |
| 14 | Debug paneli (yalnız DEV; bölüm seç, sınırsız hamle, ASCII, olay günlüğü, FPS, golden oynat) | §12.3 | 1 g | — |
| 15 | `harness` modu + `tools/screens.ts` (profiller, CVD) + `tools/perf.ts` (FTUE kapısı) + Playwright duman testi (yeniden yükle → devam) | §10.7, §12.2 | 1,25 g | — |
| 16 | Bölüm 1–5 JSON doğrulama; referans düşük seviye + orta seviye Android'de ölçüm; düzeltmeler | Faz 2 çıkışı | 2 g | product-lead JSON; cihazlar |
| | **Toplam** | | **24,5 g net → 29,5 g tamponlu (≈ 6 hf)** | |

Önceki tahmine (21,5 g) göre +3 g: K-34 / K-35 / FIFO / tekrar oynatma (+0,75), K-45 kodları (+0,25), bölüm başı pişirme
+ FIT/EXPAND çapaları (+0,75), girdi fast-forward + azaltılmış hareket (+0,5), çıkış/devam + giriş sahnesi (+0,5),
harness + gerçek cihaz turu (+0,75); solver'ın Faz 3'e alınması −0,5. Takvim 4 haftada kalmak zorundaysa #12 giriş
sahnesi, #15 ek ekran profilleri/CVD ve #13 analytics genişlemesi Faz 4'e alınabilir (−1 g → 28 g tamponlu); K-34,
K-35 ve K-43 kesilemez (Bölüm 3 ve kural kapısı bunlara bağlı).

Sıra: 1 → 2 → 4 → 5 → 6 → 7 (çekirdek önce, saf ve testli) ‖ 10 (tokens gelince paralel) → 11 → 12 → 13 → 14 → 15 → 16.
3 ve 9 bölüm verisi geldikçe. **Faz 2 çıkış ölçütü:** `npm test`, `npm run build` (+ `build:verify`),
`levels:validate`, `test:rules` (Faz 2 kapsamındaki K-xx) yeşil; 1–5 el çözümü golden'ları geçiyor; perf 4× ≥ 50 FPS
(CPU tarafı) ve FTUE ≤ 10 s; referans düşük seviye cihazda ≥ 30 FPS ve girdi ≤ 2 kare; 390×844 ve 360×800 ekran
görüntüleri design-lead incelemesinde.

### 14.2 Faz 3 — içerik (Bölüm 6–50), solver, bot, 23 engel

| İş | Süre |
| --- | --- |
| Solver: katmanlı A*, TT, budama (K-34, `via`, G-L), beam yedeği, `worker_threads`, önbellek, golden'lar | 5 g |
| Playtest botu (3 profil, LEVEL_REPORT, SVG, `--continue`, ekonomi sütunları) + `events:sim` | 3 g |
| 23 engel eklentisi + testleri (aşağıdaki tablo) | 13,5 g |
| N-notu testleri + 325 çift duman testi | 1 g |
| K-30 tespit + üç yardım yolu + güvence | 2 g |
| Güçlendiriciler K-36…K-40 (çekirdek + UI akışı, gri/etkin durumları) | 3 g |
| Doğrulayıcı kalanları (K-45/8–9, L-19, L-20), `levels:preview --png` | 1 g |
| 45 bölüm JSON'u için araç desteği, düzeltmeler, perf tekrarı | 2 g |
| **Toplam** | **30,5 g net → 36,5 g tamponlu (≈ 7,3 hf)** |

**Engel başına gün (B planı için, entrepreneur isteği):**

| Sınıf | Engeller | Gün |
| --- | --- | --- |
| Ucuz (0,25 g) — çekirdekte zaten var, eklenti + test | W2, W3, Y5, Y6 | 1 |
| Orta (0,5 g) — tek kanca | W4, W5, W7, W8, Y1, Y2, Y3, Y4, Y7, S3, S4, G-H | 6 |
| Orta+ (0,75 g) — kanca + solver/gölge etkisi | W6 (`via`, dallanma ×2), Y8, S7, S8 (tavan + yarım adımlar) | 3 |
| Pahalı | S5 Döner Platform 1 g, S6 Asansör 1 g (solver'a faz), G-L yönlendirme 1,5 g (iki aşamalı commit + solver varyantları) | 3,5 |

B planı kesimi S5 + S6 ≈ 2,5 g kazandırır (solver faz karmaşıklığı dahil); G-L'yi "yalnız yavaş düşüş"e indirmek
≈ 1 g. W8, Y8, S8 tek kanca olduğu için kesimin getirisi düşüktür.

### 14.3 Faz 4 — meta ve Faz 5 — cila + Capacitor

| Faz | İş | Süre |
| --- | --- | --- |
| 4 | Ana ekran, kasaba + 35 görev, ara sahne oynatıcı (tembel panel, bölüm başına atlas) | 4 g |
| 4 | Ekonomi, can, yıldız, seri, açılışlar, günlük ödül, sandık, kumbara | 3 g |
| 4 | Mağaza + `FakeIap`/`FakeAds`/`FakeConsent` (§11.8) + teklif akışı ve sayaçları | 2 g |
| 4 | Sallanan Köprü + Usta Ligi (botSim, UI, kural kartı, etiketli çıraklar) | 4 g |
| 4 | Usta Modu (R-17 onayına bağlı) | 1 g |
| 4 | Bölüm öncesi pencere, oyun öncesi güçlendiriciler, FTUE akışı | 2 g |
| 4 | Analytics tamamlama + ANALYTICS.md eşleme testi, save migration'ları | 1,5 g |
| 4 | Ekran görüntüleri ve design-lead inceleme düzeltmeleri | 2 g |
| | **Faz 4 toplam** | **19,5 g net → 23,5 g (≈ 4,7 hf)** |
| 5 | JUICE tamamlama (82 olay + azaltılmış varyantlar) | 4 g |
| 5 | Ses: ~76 efekt tembel çizim, müzik | 1,5 g |
| 5 | Capacitor iOS/Android, platform adaptörleri, yaşam döngüsü, Preferences, Haptics | 3 g |
| 5 | Gerçek cihaz perf turları (düşük + orta Android, eski iPhone) ve düzeltmeler | 3 g |
| 5 | Derleme hattı (macOS CI), ikon/splash, paket kimliği, mağaza görüntüleri | 1,5 g |
| 5 | i18n tamamlama, erişilebilirlik ayarları, son hata ayıklama | 2 g |
| | **Faz 5 toplam** | **15 g net → 18 g (≈ 3,6 hf)** |

**Toplam Faz 2–5:** 89,5 g net → **107,5 g tamponlu ≈ 21,5 hafta** (BUSINESS §10: 4 + 8 + 6 + 4 = 22 hf). Toplam
sığar; dağılım değişir: Faz 2 ≈ 6 hf (+2), Faz 3 ≈ 7,5 hf, Faz 4 ≈ 5 hf, Faz 5 ≈ 3,5–4 hf. Gerçek reklam/IAP SDK'ları,
yaş ekranı ve mağaza sürümü işleri Aşama 1–2 kapsamındadır, burada sayılmadı.

---

## 15. Fizibilite ve riskler

| # | Brifteki öğe | Neden pahalı / riskli | Önlem ya da ucuz alternatif |
| --- | --- | --- | --- |
| R-1 | **Solver: 50 bölüm, teslimatlarla, 60 s** | Saha hamleleri durum uzayını patlatır; 5 dilimli bölümde derinlik 30+. Tek parça A* her bölümde bitmeyebilir | Dilim sınırında katmanlı A* (teslimat doğal kesme noktası), budanmış saha hamleleri, K-34 budaması, kabul edilebilir + tutarlı `h`, `worker_threads` paralelliği, bölüm karmasıyla önbellek, beam yedeği ve `exact/heuristic` etiketi + `UB − LB` raporu. Faz 2'de solver yok, el çözümü golden'ları (§9.5) |
| R-2 | **Hafif yerçekiminde düşerken yönlendirme (K-19)** | Gerçek zamanlı girdi; hamle düşüş bitene ya da girdiye dek bekler (iki aşamalı commit); solver dallanması artar | Girdi R-10'a göre büyük hedef: tahtaya dokunuş, dokunulan taraf = yön; tutma ile ayrım eşikle (§4.7). K-34 ile çıkıntı altı yalnızca `.` olabildiği için yönlendirme ray/pencere tasarımını delmez. B planında "yalnız yavaş düşüş"e iner (≈ 1 g kazanç) |
| R-3 | **Ağır yerçekiminde 700 ms otomatik düşüş** | Bulmacada zaman baskısı; solver ve bot zorluğu ölçemez; motor becerisi düşük oyuncuya erişilebilirlik sorunu; cam eşiği 2 ile birleşince sertleşir | Zamanlayıcı sahnede (çekirdek saf), görsel halka sayacı; bot "geç kalma" olasılığıyla modeller. Erişilebilirlik seçeneği 1400 ms (R-11); `holdMs` tek parametre olduğundan "sayaç yok" seçimi de kod değişikliği istemez |
| R-4 | **Asansör + geçitler (K-24)** | Ray hizası her hamle değişir → oyuncu için okunurluk; solver durumuna faz eklenir (`turn mod L`) | Teknik maliyet düşük (çerçeve ofseti); gölge ve geçit çerçevesi hedef plan satırını vurgulamalı (design-lead). Doğrulayıcı: `h + b ≤ 8`. Bölüm 40'ta döner platform + asansör birlikte → şema P-6 |
| R-5 | **`mirrorOf` gizli planlar** | Hesap ucuz (derlemede çözülür). Risk UX: 2 sütunlu dilimde ayna = sütun takası; bot modellemesi tahmini | Teknik risk yok; `?` açıldıkça ipucu (K-32). Botta `mirrorOf` doğru tahmin olasılığı parametresi |
| R-6 | **K-30 Kamyon Yardımı** | Kesin yöntem (karıştır + solver doğrula) çalışma zamanında saniyeler; "≤ 2 hamle" güvencesinin tam araması ≈ 100 ms | GDD'nin üç yolu (D1 zincir/ıslaklık, D2 eksik `B1`, D3 yeniden şekillendirme) + yapıcı dizme + bütçeli güvence (§9.7). K-34 şantiye kaynaklı kilidi büyük ölçüde önler. Boya istismarı S-30 |
| R-7 | Playtest botu 75 000 oyun | Tek çekirdekte ~25 dk | `worker_threads` (8 işçi ≈ 3–5 dk), `--games 100` hızlı mod, solver önbelleği |
| R-8 | Phaser 4 olgunluğu | 4.x yeni ana sürüm; topluluk örnekleri çoğunlukla v3 | Yalnızca temel API (Image, Text, Tween, CanvasTexture, particles); v3 bilgisine güvenmeden `node_modules/phaser/types` ve paketteki `skills/` belgeleriyle doğrulama; Filter kullanmama |
| R-9 | FIT ölçekleme | 19,5:9 telefonlarda ekranın %9–20'si boş | FIT ve EXPAND ikisi de desteklenir (R-06; çapa sözleşmesi §10.1); öneri EXPAND (P-7), karar proje sahibinin |
| R-10 | Küçük hücre | 360 px genişlikte 8 sütun + 0,5 hücre duvar: `cellPx` 120 / 1080 → **40 CSS px** (≈ 6,3 mm) | Parmak ofseti + yapışkan takip + çok hücreli bloklar; dokunma payı `touch.hitSlopPx` (30 px önerisi), çakışmada en yakın hücre merkezi |
| R-11 | iOS web haptik | Safari Vibration API'yi desteklemiyor (doğrulandı) | Web'de no-op; Capacitor Haptics (Faz 5) |
| R-12 | ZzFX | Import anında `AudioContext`, `Math.random` | Yalnızca `buildSamples` alınır (P-9) |
| R-13 | Playwright/Chromium sürüm farkı | 1.63 rev 1243 bekliyor, kurulu rev 1194 | `executablePath` (P-10); API farkı çıkarsa Playwright sürümü değil bizim çağrılarımız uyarlanır |
| R-14 | Headless perf | SwiftShader yazılımsal GPU | CPU ölçümü güvenilir; GPU için gerçek cihaz turu (Faz 2 çıkışı) |
| R-15 | zod paket boyutu | `zod` tam 24,8 KB gzip | `zod/mini` 7,2 KB (P-4) |
| R-16 | Bölüm verisi elle yazımı | 50 bölüm × ~40 parça JSON; şekil açısı karışıklığı | Şekil tablosu (§3.3), `levels:preview` ASCII/PNG, K-45 kodlu doğrulayıcı mesajları; product-lead isterse ASCII blockout → JSON dönüştürücü (Faz 3, ayrı iş) |
| R-17 | **Bölüm içi devam (K-43)** | Tekrar oynatma bölüm verisi ya da kural kodu değişince sapabilir | `levelHash` + `rulesVersion` denetimi; uyuşmazlıkta cezasız kapatma ve iade (§11.1); determinizm testi `replay(log)` = canlı durum |
| R-18 | **Düşük seviye cihaz (BUSINESS R-09)** | İmza hareketin hissi düşük cihazda bozulursa D1 düşer | Faz 2 çıkışında referans cihazda ölçüm (§10.7), otomatik "azaltılmış efekt" profili, cihazlar Faz 2 başında |
| R-19 | **Bot belirlenimciliği cihaz ↔ sunucu** | `Math.pow` motorlar arası bit-aynı değil; `hash` tanımsızsa sonuç ayrışır | `hash32` = `fmix32-chain-v1` referans vektörleri, lig eğrisi Q16 `powFixed` (§11.2) |
| R-20 | **Faz 2 takvimi** | Revizyonla kapsam büyüdü (K-34, K-35, K-43, K-45, R-12, R-13) | 24,5 g net / 29,5 g tamponlu ≈ 6 hf (BUSINESS'ta 4 hf); toplam Faz 2–5 yine ≈ 21,5 hf (§14.3); kesme seçeneği §14.1 |

---

## 16. Açık sorular

### 16.1 S-1…S-28 durumu

GDD §15 bütün soruları bağlayıcı olarak yanıtladı; bu belge yanıtlara uyar. Varsayımdan **farklı** çıkan ve TECH'te
değişen yanıtlar: **S-3** (L-03 öğreticilerde de `error`), **S-9** (balon tavanı = plan tepesi, §5.1), **S-19** (şekil
değişimi yalnız D3'te, §9.7), **S-21** (`via`: geçitten geçen her hamlede boya, §4.2, §6.2), **S-26** (girdi R-10,
§4.7), **S-27** (1400 ms R-11, §4.7). Diğerleri varsayımla aynıydı.

### 16.2 Yeni sorular (product-lead'e, orkestratör üzerinden)

Her sorunun yanında kodlanacak varsayım yazılıdır; cevap gelene kadar bu varsayımla ve testli ilerlenir.

| # | Soru | Varsayım |
| --- | --- | --- |
| S-29 | Kamyonla gelen balonlu blok: K-25 gereği düşüp oturur mu, ne zaman yükselir? | Düşer; Y6 açıksa sonraki hamlenin 6. adımında yükselir, kapalıysa yalnızca oyuncu bırakınca |
| S-30 | Boya ile bilerek oluşturulan malzeme açığında D2 bedava `B1` verir (istismar). Teslimat `B1` mi kalsın, eksik bölgeyi döşeyen şekiller mi, yoksa boya kaynaklı açıkta yalnız D3 mü? | GDD metni (`B1`) |
| S-31 | K-39: aynı sürükleme hamlesinin 12. adımında çalışan Kamyon Yardımı Geri Al ile birlikte geri alınır mı? | Evet, hamle bütünüyle geri alınır; yardım gerekirse sonraki hamle sonunda yeniden çalışır |
| S-32 | Köprü ödeme anı: `min(t0 + duration, max(bütün katılımcıların son olay zamanı))` doğru mu? | Evet |
| S-33 | Balon + düşen blok aynı adım (R-02): "önce düşüş yarım adımı, sonra yükselme yarım adımı" E-33 olarak GDD'ye yazılacak mı? | §5.3'teki gibi kodlanır |
| S-34 | Tavanın üstünden bırakılan balon tavana **iner** (§5.1); S8 metni ve JUICE "yükselir" diyor. E-satırı? | İner (aynı formül); görsel design-lead |
| S-35 | `config/events.json`: `rng.algorithm: "mulberry32"` → `rng.hash: "fmix32-chain-v1"`; düzyazı `formula` alanları `_doc` önekine; lig `x^k` tam sayı tanımı ya da ±1 tolerans? | `fmix32-chain-v1`; Q16 `powFixed`, tolerans 0 |
| S-36 | K-07 "0,3 hücre" tutma eşiği ↔ tokens `drag.startThresholdPx` 8 px: kural sayıyı token'a bırakır mı? K-19'daki ms/satır görsel mi? | İkisi de tokens'tan (görsel ayar); kural yalnızca cam eşiği, `holdMs` ve yönlendirme hakkını tanımlar |
| S-37 | R-21 W3 seçimi: (A) yalnız `teaches` ile sayılır ya da (B) Bölüm 4 geçidi boy 2 | (A); kod iki seçeneği de destekler (§8.3) |
| S-38 | LEVELS'ta `seed` yok; şema zorunlu tutuyor. Yazılmazsa `id × 1000 + id` (brifteki 4004 gibi) kabul mü? | Evet, `compile` bu değeri kullanır ve uyarı basar |

### 16.3 Proje sahibine (orkestratör üzerinden)

| # | Soru | Önerim |
| --- | --- | --- |
| O-1 | Ölçekleme FIT mi EXPAND mı (R-06, P-7)? Kod ikisini de destekler | EXPAND |
| O-2 | K-34 Alttan Üste onayı (R-01) | Kabul (Bölüm 3 çözülebilirliği buna bağlı) |
| O-3 | Faz 2 takvimi 4 → ≈ 6 hafta (toplam 22 hafta sabit; §14) | Kabul; ya da §14.1 kesme seçeneği (−1 g) |
| O-4 | Referans düşük seviye Android ve orta seviye cihazın Faz 2 başında alınması; iOS için macOS derleme ortamı (fiziksel Mac / bulut CI) Faz 5 | Kabul |

---

## 17. Önerilen kararlar (DECISIONS.md için, Durum: ÖNERİ)

| No | Başlık | Özet | Bu turda |
| --- | --- | --- | --- |
| P-1 | Kenar modeli: duvar = sıfır genişlikli sınır | Çekirdek ızgarası 8×10, iç koordinat = genel; sınır satır maskeleri; K-12 tam sığma açık koşul; ekran ölçüleri `layout.*` (120/60) | **Değişti** (R-03; "mantıksal duvar sütunu 9×10" geri çekildi) |
| P-2 | Şekil dönüş kuralı | Saat yönü, sol alta normalize; `heavy = w ≥ 3 ∨ kind ∈ {I5, Q9}`; dikey I5 bölüm verisinde yasak | Aynı (GDD K-44 ile kabul) |
| P-3 | Durum ve karma | Tek `Int32Array` tampon + kopyalama; 64 bit Zobrist, istek üzerine, parça kimliksiz (simetri) | Aynı (+`filled`, `arrivedTurn`, `openShutterUntil`) |
| P-4 | zod 4.6.5, `zod/mini` | Oyun + araçlar tek şema; 9,95 KB gzip | Aynı |
| P-5 | Araçlar Node'un yerleşik TS desteğiyle | `node tools/x.ts`; `.ts` uzantılı importlar, `erasableSyntaxOnly`; `tsx` yok; `@types/node@22.20.5` dev | Aynı |
| P-6 | Bölüm şeması inceltmeleri | `schemaVersion`; geçit tipine göre ayrık birleşim; `build.elevator`; `debris[].segment`; slider `dir`; `drag.via`; GDD aralıkları; genişletilmiş `tutorial` | **Değişti** |
| P-7 | Ölçek: FIT ve EXPAND desteklenir, öneri EXPAND | Çapa sözleşmesi tokens `layout.*`'tan; seçim tek ayar | **Değişti** (R-06; proje sahibi seçer) |
| P-8 | Sürüklemede saha donuk | Yerçekimi ve komşu etkileri hamle sonunda | Aynı (GDD K-08 ile kabul) |
| P-9 | Ses: ZzFX'in yalnızca `buildSamples`'ı gömülür | MIT başlığıyla; npm bağımlılığı yok; parametreler tokens `audio.sfx` | **Değişti** (parametre sahipliği) |
| P-10 | Playwright önceden kurulu Chromium ile | `executablePath: '/opt/pw-browsers/chromium'` | Aynı |
| P-11 | Solver yalnızca Faz 3'te | Katmanlı A* + TT + budama + beam; Faz 2'de LEVELS el çözümü golden'ları | **Değişti** (entrepreneur önerisi kabul; Faz 2 basit solver geri çekildi) |
| P-12 | K-30: GDD'nin üç yardım yolu | D1 zincir/ıslaklık → dizme; D2 eksik `B1`; D3 yeniden şekillendirme; yapıcı dizme + bütçeli ≤ 2 hamle güvencesi | **Değişti** (genel "yeniden kesme" geri çekildi) |
| P-13 | Tek `isCorrectPlacement` (K-16 + K-34) | Doğrulama, gölge, Vinç, Altın Mala, Boya Fırçası, solver aynı fonksiyon; `Verdict.reason` | **Yeni** (R-01) |
| P-14 | Bölüm başında prosedürel blok pişirme | (şekil × renk × bayrak) başına Canvas2D parça dokusu + siluetler; plan hücresi tebeşir altlık + %80; sembol mürekkebi kuralı | **Yeni** (R-05) |
| P-15 | Animasyon sırasında girdi | Tutma bekleyen tahta animasyonlarını son kareye atlatır; kilit yalnız dilim kayması/kamyon/karıştırma; azaltılmış hareket = solma varyantları | **Yeni** (R-12) |
| P-16 | G-L yönlendirme: dokunuş tarafı = yön, iki aşamalı commit | Tutma ile eşikle ayrılır; `steerZone` parametresi | **Yeni** (R-10) |
| P-17 | Bölüm içi devam: hamle günlüğü + belirlenimci tekrar | `inLevel` her hamlede kaydedilir; kapanma kayıp değil; `levelHash` koruması; `m = 0` cezasız çıkış | **Yeni** (R-13) |
| P-18 | Saf bot modülü | `botSim.ts` yalnızca config + tohum + zaman alır; ESLint import yasağı; iki-kayıt eşitlik testi; `seedHash` günlüğü; kurulum kimliği tohumda yok | **Yeni** (R-14) |
| P-19 | Doğrulayıcı kodları = GDD K-45; mekanik imza tablosu | `Issue.code` + `rule`; W3 iki seçenekle çalışır | **Yeni** (R-02, R-21) |
| P-20 | Debug yalnız DEV; ayrı `harness` derlemesi; `build:verify` | Üretimde `?debug=1` etkisiz | **Yeni** (R-20) |
| P-21 | Mağaza servis arayüzleri | `ConsentService`, `AdsService`, `IapService`; MVP'de sahte; sağlayıcılar onaydan sonra dinamik import | **Yeni** (R-23) |
| P-22 | Referans düşük seviye cihaz ve otomatik "azaltılmış efekt" profili | ≥ 30 FPS, girdi ≤ 2 kare; Faz 2 çıkış kapısı | **Yeni** (R-23) |

Tam D-biçimli metinler orkestratöre raporda verildi.

---

## Ek A — ASCII tahta biçimi (`core/ascii.ts`)

```
L4 turn 3 moves 11 seg 1/1 elev 0
 y  0 1 2 3 4 5 | W | 6 7
 9  . . . . . . | : | . .
 8  . . . . . . | : | . .
 7  y y w . . . | : | . .
 6  . . w . . . | : | . .
 5  . . . g g . | # | . .
 4  . . . g g 2 | # | . .
 3  . . . . . w | = | W .
 2  b . . . . . | # | W .
 1  . . . . . . | # | W W
 0  . . . . . . | # | Y Y
plan seg0 (top→bottom): YY WW W. WW YY      ← Bölüm 4 örneği (brif §12), duvar height 6, geçit y=3 boy 1
hidden: screw@(3,4) key:a@(5,3)      ← gizli öğeler bir bloğun altında (L-14)
```

- Saha: `.` boş, küçük harf = blok rengi, `1`–`3` kasa (hp), `b` torba. Şantiye: büyük harf = kilitli doğru blok, küçük
  harf = kilitsiz (moloz, harçla yapışmış), `_` platform (asansör ofsetinin altı), `*` Altın Mala hücresi.
- Duvar sınırı (çekirdekte sıfır genişlikli; ASCII'de okunurluk için ayrı sütun olarak basılır, hücre değildir):
  `#` kapalı satır, `=` açık geçit, `x` kapalı geçit (kepenk kapalı / kilitli), `:` duvar üstü hava.
- `--ids` seçeneği renk yerine parça kimliği basar (base36) → fikstür olarak geri yüklenebilir (`fromAscii`).
