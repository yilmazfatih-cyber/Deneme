# Teknik tasarım

Sahip: code-lead · Durum: **Faz 1 taslağı (onay bekliyor)** · Tarih: 2026-10-04
Kaynaklar: `docs/BRIEF.md` (§4, §5, §7, §12), `CLAUDE.md`, `docs/DECISIONS.md` (D-001…D-003). GDD/OBSTACLES/UX_FLOWS/JUICE
paralel yazıldığı için bu belge brifteki kural kimliklerine (K-01…K-33, W1…W8, Y1…Y8, S1…S8, G-H, G-L) atıf yapar.
Belirsiz kurallar §16'da product-lead'e soru olarak listelenmiştir; kodlanacak varsayım her sorunun yanında yazılıdır.
Önerilen kararlar §17'de **P-n** numarasıyla durur (DECISIONS.md'ye orkestratör taşır).

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
| Hareket BFS prototipi | 9×10 ızgarada polyomino BFS, %80 dolu saha: 19–51 erişilebilir durum, **2–11 µs** (Chromium, 1×), **11–27 µs** (4× yavaşlatma), **17–41 µs** (6×) | scratchpad prototipi, Playwright + CDP |

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
| `src/core/coords.ts` | genel ↔ iç koordinat dönüşümü, ızgara sabitleri (§2.2) | — |
| `src/core/shapes.ts` | 0° tablosu (brif §5) + üretilen dönüşler, genişlik/yükseklik/ağır bayrağı, satır maskeleri (§3) | coords |
| `src/core/level/schema.ts` | zod/mini bölüm şeması (§8) — runtime ve araçlar **aynı** şemayı kullanır | zod/mini |
| `src/core/level/logic.ts` | mantıksal doğrulama kuralları (§8.3), saf fonksiyon, `Issue[]` döner | shapes, coords |
| `src/core/level/compile.ts` | `LevelData` → `CompiledLevel` (iç koordinat, gizli hücre çözümü K-32, kural seti, Zobrist tabloları) | hepsi |
| `src/core/state.ts` | `GameState` tampon düzeni, erişimciler, `cloneState`, `encodeState` (§2.4) | compile |
| `src/core/hash.ts` | Zobrist (§2.6) | rng, state |
| `src/core/grid.ts` | çarpışma maskeleri, sütun tepeleri, doluluk işlemleri | state |
| `src/core/movement.ts` | `beginDrag` → `DragSession` (BFS, raylar, yapışkan takip, yol) (§4) | grid |
| `src/core/gravity.ts` | `computeFall` (gölge + mantık ortak), `settleYard` (zincirleme), balon (§5) | grid, rules |
| `src/core/placement.ts` | K-16 hüküm, K-17 geri sekme hedefi | gravity |
| `src/core/site.ts` | şantiye modu stratejisi: `segments` / `carousel` + `elevator` ofseti (K-22…K-24) | state |
| `src/core/delivery.ts` | partiler, kamyon kuyruğu (K-25…K-27) | gravity |
| `src/core/goals.ts`, `combo.ts` | hedef sayaçları, Usta Serisi (K-33) | state |
| `src/core/moves.ts` | `applyMove` hamle hattı (§6) + güçlendirici komutları | hepsi |
| `src/core/deadlock.ts` | K-30 tespit + karıştırma (§9.7) | moves, shapes |
| `src/core/obstacles/` | `types.ts` (eklenti arayüzü), `registry.ts`, **her engel ayrı dosya**: `W1_staticGap.ts` … `S8_balloon.ts`, `GH_heavyGravity.ts`, `GL_lightGravity.ts` (§7) | core içi |
| `src/core/ascii.ts` | tahtayı ASCII'ye çevirme (debug "kopyala", testler, önizleme) (Ek A) | state |
| `src/core/session.ts` | `GameSession`: durum + geçmiş (Geri Al) + tekrar oynatma kaydı; saf | moves |
| `src/scenes/` | Phaser sahneleri; `level/` altında tahta görünümü | core, ui, meta, services, theme |
| `src/ui/` | `Label` (yalnızca i18n anahtarı alır), `Button`, `Popup`, `TopBar`, `BoosterBar`, `GoalPanel`, `Panorama` | theme, services/i18n |
| `src/meta/` | `economy`, `lives`, `stars`, `tasks`, `streak`, `unlocks` — saf mantık + `Clock` enjeksiyonu | core/types, services (yalnız arayüz) |
| `src/services/` | `save`, `analytics`, `events` (EventService + bot simülasyonu), `i18n`, `audio`, `haptics`, `clock`, `platform` | core/types |
| `src/theme/` | `tokens.json` (design-lead, D-003; salt okunur), `tokens.ts` (tipli yükleyici + zod/mini kontrolü), `textures.ts` (açılış atlası), `draw/` (saf Canvas2D çizerleri; level-preview de kullanır) | — |
| `src/i18n/` | `tr.json`, `en.json` | — |
| `src/config/` | `display.ts` (mevcut) | — |
| `src/debug/` | geliştirme paneli; yalnızca `import.meta.env.DEV` ya da `?debug=1` ile dinamik import | hepsi |
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
```

**(b) Ayrı tip denetimi** — `tsconfig.core.json`: `"lib": ["ES2022"]`, `"types": []`, `include: ["src/core"]`. DOM ya da Node
tiplerine dokunan her core dosyası `tsc -p tsconfig.core.json` ile derlenemez (ör. `window` → TS2304). `npm run typecheck`
üç projeyi de çalıştırır: `tsconfig.json` (oyun), `tsconfig.core.json`, `tsconfig.tools.json` (`types: ["node"]`).

### 1.4 Çalışma zamanı akışı (bir hamle)

```
pointerdown → DragController → core.beginDrag(state, pieceId)   [BFS bir kez, §4]
pointermove → DragSession.nearest(finger) → PieceView konumu + ShadowView (computeFall)   [≤ 0,05 ms]
pointerup   → GameSession.commit({kind:'drag', pieceId, to, steer?})
            → core.applyMove(state, move, sink) → GameEvent[] (adımlara ayrılmış)
            → EventPlayer olayları sırayla animasyona çevirir; bitince girdi açılır
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
type CellIndex = number;                                                  // iç ızgara: iy * 9 + ix
type Zone = 0 /* yard */ | 1 /* site */ | 2 /* queue (kamyonda) */ | 3 /* gone (kırıldı/çekiç) */;
interface Anchor { ix: number; iy: number }                               // kutunun sol alt köşesi, iç koordinat
type DragMode = 0 /* FREE */ | number /* 1 + gapIndex = RAIL */;
interface DragNode { ix: number; iy: number; mode: DragMode }             // kodda tek tamsayı: (mode*10+iy)*9+ix
```

### 2.2 Izgara: genel ve iç koordinatlar

Genel koordinat (K-01, bölüm JSON'u, analytics, testlerin okunur çıktısı): x = 0–7, y = 0–7 tahta, **y = 8–9 Vinç Alanı**
(K-05). Saha x = 0–5 (K-02), şantiye x = 6–7 (K-03), duvar bu ikisinin **arasında** (K-04; x indeksi yok).

İç ızgara **9 sütun × 10 satır = 90 hücre**: duvar kendi mantıksal sütununu alır.

```
 iy   ix: 0 1 2 3 4 5 | 6 | 7 8
  9       . . . . . . | : | . .     Vinç Alanı (hava, K-05)
  8       . . . . . . | : | . .
  7       ■ ■ ■ ■ ■ ■ | # | ░ ░     # duvar hücresi (y < height ve geçit değil)
  4       ■ ■ ■ ■ ■ ■ | = | ▒ ▒     = geçit hücresi (W1…W7)
  …                     : = duvar üstü hava (y ≥ height)
  0       ■ ■ ■ ■ ■ ■ | # | ▒ ▒
          └─ saha ──┘   W   site
toInternal(x) = x ≤ 5 ? x : x + 1        toPublic(ix) = ix ≤ 5 ? ix : ix − 1   (ix = 6 duvar)
```

Neden mantıksal duvar sütunu (kenar modeli yerine):
1. Çarpışma tek tip: her şey 90 hücrelik doluluk; duvar/geçit sadece "dolu/boş hücre".
2. K-12 "blok geçidin satır aralığına **tamamen** sığmalı" kendiliğinden doğar: geçitten geçen her hücre duvar sütununa
   girmek zorundadır, dolayısıyla bloğun tüm satırları geçitte açık olmalıdır. Kenar modelinde L4 gibi bir blok yalnızca
   tek satırla kenarı kesebilir; bu kural ayrıca yazılmak zorunda kalırdı.
3. Görsel genişlik bağımsızdır: duvar sütunu ekranda `tokens.board.wallWidthCells` (varsayılan 1,0; design-lead < 1
   seçebilir) genişliğinde çizilir; `BoardLayout.cellToScreen(ix)` parça parça doğrusal eşleme yapar. Sürüklenen blok
   parmağı yumuşak izlediği için dar duvarda geçiş anındaki küçük hizasızlık görünmez; duran bloklar duvar sütununda
   hiç bulunmaz.

Şantiye yerel koordinatı: `sx ∈ {0,1}`, `sy ∈ 0..7` (aktif dilim çerçevesine göre). Tahta satırı `iy = sy + elev`
(`elev` = asansör ofseti, K-24; asansörsüz bölümde 0). `iy < elev` olan şantiye hücreleri platform gövdesidir (dolu).

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
| başlık | 16 | `turn` (iptal olmayan tamamlanmış hamle), `movesLeft`, `combo`, `trowels`, `activeSeg`, `frontSeg` (döner platform), `elev`, `elevDir`, `deliveryCursor`, `queueLen`, `rng` (mulberry32 durumu), `wrongCount`, `overWallCount`, `railCount`, `flags` (kazandı/kaybetti/kilitlendi), `reserved` |
| `yardOcc` | 6 × 10 | 0 boş · `pieceId+1` · `−(obstacleIdx+1)` (kasa, torba) |
| `siteOcc` | S × 16 | dilim başına yerel 2×8: 0 · `pieceId+1` (moloz dahil) · `−1` Altın Mala hücresi |
| parçalar | P × 8 | `shape`, `color`, `zone`, `x`, `y`, `seg`, `flags` (glass, mortar, balloon, chained, wet, locked K-14, debris, stuck), `counter` (wetMoves) |
| geçitler | G × 3 | `open`, `y` (kayar kapı), `phase` |
| engeller | O × 2 | `hp` / canlı mı, `aux` |
| gizli öğeler | H × 1 | vida/anahtar toplandı mı |
| hedefler | 3 | ilerleme sayaçları |
| kuyruk | Q | kamyonda bekleyen `pieceId`'ler (K-26) |
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
h = Z.header[turn mod L] ⊕ Z.header2[activeSeg, frontSeg, elev, elevDir, deliveryCursor]
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
sayaç tabanlı `hash32(seed, botIndex, attemptIndex)` kullanır (§11.2).

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
brif "I5 her zaman Ağır (yalnızca yatay kullanılır)" diyor. Öneri: (1) doğrulayıcı bölüm verisinde `I5_90`/`I5_270`'i
reddeder, (2) `ALWAYS_HEAVY` Vinç güçlendiricisi I5'i dikey çevirse bile ağırlığı korur. Soru S-2 (§16).
Ağır blok için sürükleme alanı saha sütunları + saha üstü Vinç Alanı'dır (ix ≤ 5); duvar sütununa hiç girmez.

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

1. Kural kapısı: `zone` saha ya da şantiye; `locked` (K-14) değil; etkin kuralların `canPick` kancalarının hepsi `true`
   (Y3 zincir, Y4 ıslak beton). Çekirdekte engele özel `if` yoktur; kancalar sırayla çağrılır (§7).
2. Çarpışma maskesi: `masks: Uint16Array(10)`, satır başına 9 bit. Saha: `yardOcc` (sürüklenen parça hariç).
   Duvar sütunu (ix = 6): `iy < wall.height` ise dolu; **geçit hücreleri ayrı bir `gapCell[iy] = gapIndex` tablosunda**
   tutulur (FREE kipte dolu, RAIL kipte boş sayılır). Şantiye: aktif dilimin `siteOcc`'u `elev` kadar kaydırılır;
   `iy < elev` dolu (platform). `colTop[ix]` (ix = 7, 8): o sütundaki en yüksek dolu satır (sürüklenen parça hariç),
   yoksa −1.
3. Başlangıç düğümü: saha parçası → FREE(anchor). Şantiye parçası (moloz S4, harçla yapışmış Y8) → FREE(anchor) ve
   satırları bir geçidin içindeyse ayrıca RAIL(g) (çok kaynaklı BFS, ikisi de mesafe 0).
4. BFS (§4.2). Erişilebilir düğüm sayısı 1 ise (yalnızca kendisi) `null` döner → "kımıldamıyor" geri bildirimi (K-09).

### 4.2 Durum grafiği

Düğüm = `(ix, iy, mode)`; `mode = FREE` ya da `RAIL(g)`. Düğüm sayısı ≤ 9 × 10 × (1 + G), G ≤ 3 → **≤ 360**.

**FREE(ix, iy) geçerli** ⇔
1. sınırlar içinde (`0 ≤ ix`, `ix + w ≤ 9`, `0 ≤ iy`, `iy + h ≤ 10`); ağır blokta `ix + w ≤ 6`;
2. `masks[iy + r] & (rows[r] << ix) == 0` her `r` için (çarpışma; geçit hücreleri FREE için doludur);
3. **açık gökyüzü (K-13):** bloğun kapladığı her şantiye sütunu `c` için `colTop[c] < iy + colBottom[c − ix]`
   (bloğun o sütundaki en alt hücresinin üstünde ve hizasında hiçbir dolu hücre yok).

**RAIL(g)(ix, iy) geçerli** ⇔
1. sınırlar ve çarpışma (geçit hücreleri boş sayılır);
2. **K-12 hizalama:** `g.y ≤ iy` ve `iy + h ≤ g.y + g.size` (blok yüksekliği ≤ geçit boyu, satırlar geçidin içinde);
3. blok duvar ya da şantiye sütununa değiyor (`ix + w − 1 ≥ 6`);
4. etkin kuralların `canPassGap(g, piece)` kancalarının hepsi `true` (W4 kepenk açık, W7 kilit açılmış).
   W3 dar geçit ayrı kural değildir: `size = 1` ile 2. madde zaten yalnızca 1 satırlık blokları geçirir.

**Kenarlar**
- FREE → FREE: 4 komşu (±1 x, ±1 y).
- FREE → RAIL(g): yalnızca **tamamen sahadaki** (`ix + w − 1 ≤ 5`) FREE düğümden sağa (ix + 1, aynı iy).
- RAIL(g) → RAIL(g): yalnızca yatay (ix ± 1). Dikey hareket yok (K-12 "dikey konumu geçide kilitli").
- RAIL(g) → FREE: sola, yeni konum tamamen sahadaysa.

Bu modelin sonuçları (testlerle sabitlenir):
- **K-11:** Duvar sütununa FREE kipte yalnızca `iy ≥ wall.height` (duvar üstü hava) satırlarından girilir; şantiye
  üstünde blok aşağı indirilebilir (açık gökyüzü sağlandıkça).
- **K-13:** Şantiyede bir çıkıntının (overhang) altına yandan girmek FREE'de imkânsızdır (açık gökyüzü bozulur);
  bunun tek yolu RAIL'dir. Şantiye içinden geçide "geri girip" askıda bırakma istismarı da kapalıdır (RAIL'e yalnızca
  saha tarafından girilir).
- **K-12:** Raydaki blok bırakıldığı yerde kalır (düşmez); YAO sayımında "geçit" sayılır. FREE kipte şantiyeye bırakılan
  her blok "duvar üstü" sayılır (hafif yerçekiminde yönlendirilse bile).

### 4.3 Bırakma sınıflandırması

| Bırakılan düğüm | Sonuç | Kural |
| --- | --- | --- |
| başlangıç düğümü | iptal, hamle harcanmaz | K-07 |
| FREE, tüm hücreler ix ≤ 5 ve iy ≤ 7 | sahaya yerleşim (1 hamle); saha yerçekimi açıksa hamle sonunda oturur | K-10, K-20 |
| FREE, ix ≤ 5 ve herhangi bir hücre iy ≥ 8 | iptal (saha üstü havada bırakıldı) | K-05 |
| herhangi bir hücre duvar sütununda (ix = 6) | iptal (varsayım, S-5) | — |
| FREE, tüm hücreler ix ≥ 7 | şantiyeye düşüş (§5.1) → doğrulama | K-11, K-16 |
| RAIL(g), tüm hücreler ix ≥ 7 | rayda yerleşim, düşmez → doğrulama | K-12, K-16 |

### 4.4 Yapışkan takip (K-08) ve parmak ofseti

- Parmak, tahta uzayına çevrilir; blok parmağın **1,2 hücre üstünde** görünür (brif §4.11). Hedef nokta
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
| BFS (başlangıçtan) | tutmada 1 kez | %80 dolu saha: **2–11 µs** (1×), **11–27 µs** (4×), **17–41 µs** (6×) — Chromium 141, CDP ile ölçüldü. Boş tahta en kötü durum (360 düğüm): ölçeklemeyle ≈ 0,3 ms (6×) |
| `nearest(p)` | her `pointermove` | ≤ 360 düğüm taraması, ≈ 1–3 µs (1×), ≤ 15 µs (6×) |
| `pathTo` (mevcuttan BFS) | yalnızca düğüm değişince | yukarıdaki BFS ile aynı |
| düşüş gölgesi | düğüm değişince | sütun başına önbellek (`landingCache[ix]`): açık gökyüzü sayesinde iniş satırı yalnızca sütuna bağlıdır → O(1); düşüş mesafesi = `node.iy − landing.iy`. İstisna: balonlu blokta yükselme bırakma satırına bağlıdır → O(h) ≤ 10 satır taraması |

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

- **G-H:** Gerçek zaman çekirdeğe girmez. `DragController`, FREE düğümün herhangi bir hücresi şantiye sütunundayken
  sahne saatiyle 700 ms sayar (şantiye sütunlarından çıkınca sıfırlanır); süre dolunca mevcut düğümde **zorla bırakma**
  yapar. Çekirdek bunu sıradan bir bırakma olarak görür; tekrar oynatma kaydı bırakma düğümünü saklar → determinizm
  korunur. Solver bu kuralı yok sayar (brif §12).
- **G-L:** Düşüş animasyonu sırasında bloğa dokunulursa sahne o anki satırı (`atRow = floor(geçen süre / msPerRow)`)
  hesaplar; hamle `steer: { atRow }` alanıyla gönderilir. Bu yüzden hafif yerçekiminde hamle **düşüş bitince** işlenir
  (sahne animasyon planını `computeFall`'dan alır, `applyMove` iniş sonrası `steer` ile çağrılır). Ayrıntı §5.1, risk §15.

---

## 5. Yerleştirme, geri sekme, yerçekimi, düşüş gölgesi

### 5.1 `computeFall` — gölge ve mantık için tek fonksiyon (K-18)

```ts
interface FallPlan  { ix: number; iy: number; dir: -1 | 1; drift: -1 | 0 | 1; steer?: { atRow: number } }
interface FallResult {
  landing: Anchor; distance: number;              // satır cinsinden düşüş
  path: Anchor[];                                  // animasyon ve testler için ara noktalar
  drift: -1 | 0 | 1;                               // W8 rüzgâr
  verdict: 'correct' | 'wrong';                    // K-16 önizlemesi (gölge rengi K-18)
  effect: LandingEffect;                           // S3 cam kırılması önizlemesi
}
computeFall(state, pieceId, node, opts?: { steer?: { atRow: number } }): FallResult
```

1. Plan `dir = −1` (aşağı) ile başlar; etkin kuralların `modifyFall` kancaları sırayla uygulanır:
   W8 rüzgâr → genişliği 1 olan blok için hedef sütun geçerliyse `drift = fan.dir` (varsayım: kayma bırakır bırakmaz,
   düşüşten önce olur; hedef sütun şantiye dışında ya da doluysa kayma yok — S-8). S8 balon → `dir = +1`.
2. İniş: aşağı yönde `landing.iy = max_c (colTop[c] + 1 − colBottom_c)` (açık gökyüzü sayesinde ilk destek); yukarı
   yönde (balon) ilk dolu hücrenin altı ya da `iy + h = 8` tavanı (S-9).
3. G-L yönlendirme: `atRow` satırına kadar aynı sütunda düşer, 1 genişlikteki blok diğer şantiye sütununa geçer
   (o satırda hücreler boşsa), oradan düşmeye devam eder. Bu, çıkıntı altına yandan girmenin rayla birlikte **ikinci**
   yoludur (YAO'da "duvar üstü" sayılır).
4. `onLanded` önizlemesi: S3 cam, `distance > glassThreshold(gravity.build)` ise kırılır (eşik K-19: low 4, normal 3,
   high 2; "eşiğin üstünde" = kesin büyük, S-10).

`ShadowView` aynı fonksiyonu çağırır; dolayısıyla gölge **her zaman** gerçek sonucu gösterir (rüzgâr dahil, K-18).
Gölge konturunun rengi (`verdict`) Kolay/Normal'de gösterilir, Zor/Çok Zor'da gizlenir; bu bir UI bayrağıdır
(design-lead son kararı).

### 5.2 Doğrulama (K-16) ve hatalı yerleşim (K-17)

- Bloğun her hücresi `(sx, sy)` için plan rengi okunur (`sy = iy − elev`; plan yüksekliğinin üstü "plan dışı").
  Tüm hücreler blok rengine eşitse **doğru** → `locked = true` (K-14), `combo++`, gizli `?` hücreleri açılır (K-32).
- Tek hücre bile `.` / plan dışı / farklı renk ise **hatalı**. Etkin kuralların `onPlacement` kancası sonucu
  değiştirebilir: Y8 harç → `stick` (şantiyede kalır, `stuck = true`). Yoksa geri sekme:
  1. Başlangıç çapasının hücreleri boşsa oraya (kavisli animasyon, 350 ms).
  2. Değilse "sahanın üstünden düşerek ilk uygun boşluğa": aday sütunlar başlangıç `ix`'ine uzaklığa göre sıralanır,
     eşitlikte duvara yakın olan önce; her aday için blok `iy = 10 − h`'den açık gökyüzü ile düşürülür (saha
     yerçekimi ayarından bağımsız, brif "düşerek"); iniş satırı tahtaya sığıyorsa (`iy + h ≤ 8`) hedef budur.
  3. Hiçbiri olmazsa blok kamyon kuyruğuna girer (K-26 ile aynı yol; varsayım S-11).
- Hatalı yerleşim `combo = 0` yapar, `wrongCount++` (analytics `level_end`), hamle yanar (K-17).

### 5.3 Saha yerçekimi ve zincirleme düşüş (K-20, Y2, Y6)

Eşzamanlı adım algoritması (animasyonla birebir uyumlu; "her şey birlikte düşer"):

```
repeat:
  supported ← zemine (iy = 0) ya da statik bir hücreye (Y1 kasa) dayanan varlıklar
  sabit noktaya kadar: altındaki hücre desteklenen bir varlığa ait olan varlığı supported'a ekle
  unsupported ← (yerçekimine tabi parçalar + Y2 torbalar) − supported
  if unsupported boş: dur
  unsupported'taki her varlığı 1 satır aşağı kaydır, düşüş sayaçlarını artır
```

- Bir varlığın üstündekiler de desteksizse birlikte düşer; göreli konumlar korunur, çakışma olamaz.
- En çok 8 tur × ≤ 40 varlık × ≤ 9 hücre ≈ 3 000 işlem. Her varlık için tek `pieceFell{cause:'yardGravity'}` olayı
  (başlangıç, bitiş, mesafe) aynı adımda yayınlanır → eşzamanlı animasyon.
- Ne zaman çalışır: hamle hattının 6. adımında (§6), yalnızca `gravity.yard = true` ise; Y2 torbalar için varsayım:
  saha yerçekimi kapalıyken de düşerler (brif "yerçekimine tabidir"; S-12).
- Sürükleme sırasında saha **donuktur** (öneri P-8): tutulan bloğun üstündekiler hamle bitene kadar asılı kalır
  (görsel: hafif titreme). Gerekçe: erişilebilirlik grafiği sürükleme boyunca değişmez, sürükleme iptalinde hiçbir şey
  olmamış olur (K-07), solver ve tekrar oynatma basitleşir.

### 5.4 Şantiyede zincirleme yok

Raydaki bloklar iskeleyle tutulur (K-12), doğru bloklar kilitlidir (K-14), moloz sabittir (varsayım S-13). Şantiyede
yalnızca bırakılan blok düşer (ya da balon yükselir); ikincil düşüş yoktur.

---

## 6. Hamle hattı ve deterministik olay günlüğü

### 6.1 Hamle tipi

```ts
type Move =
  | { kind: 'drag'; pieceId: PieceId; to: DragNode; steer?: { atRow: number } }    // K-07…K-13, G-L
  | { kind: 'hammer'; target: { pieceId: PieceId } | { obstacle: number } }         // Çekiç
  | { kind: 'crane'; pieceId: PieceId; to: { zone: 'yard' | 'site'; x: number; y: number }; rotation: Rotation } // Vinç
  | { kind: 'paint'; pieceId: PieceId; color: ColorCode }                            // Boya Fırçası
  | { kind: 'trowel'; seg: number; x: 0 | 1; y: number }                             // Altın Mala (K-33)
  | { kind: 'addMoves'; amount: number };                                            // +5 teklif (K-29), Termos
```

Geri Al bir çekirdek hamlesi değildir: `GameSession` hamle öncesi tampon kopyasını geri yükler (K-14 istisnası).
`applyMove` gelen `drag` hamlesini **yeniden doğrular** (`beginDrag` + `to` erişilebilir mi); geçersizse geliştirmede
hata fırlatır, üretimde `moveCancelled{reason:'invalid'}` yayınlar. Tekrar oynatma kaydı = `Move[]` (JSON).

### 6.2 Sıra (her adım bir `step` numarası alır)

| Adım | İş | Olaylar | Kural |
| --- | --- | --- | --- |
| 0 | Bırakma sınıflandırması (§4.3). İptalse olay yayınla ve **dur** (sayaç ve zamanlayıcılar ilerlemez) | `moveCancelled` | K-05, K-07 |
| 1 | Bloğu taşı; RAIL ile geçit geçildiyse `onPassGap` (W6 boya) | `pieceMoved`, `piecePainted` | K-10…K-12, W6 |
| 2 | Şantiyede FREE ise `computeFall` + `onLanded` (S3 cam → kırılır, sahaya döner, +1 ceza; 3. adım atlanır) | `windDrift`, `pieceFell`, `balloonRose`, `glassBroke`, `pieceReturned` | K-11, K-19, K-21, W8, S3, S8 |
| 3 | Şantiyedeyse doğrulama + `onPlacement` (Y8 harç) | `placementCorrect`, `cellsRevealed`, `comboChanged`, `trowelEarned`, `placementWrong`, `mortarStuck`, `pieceBounced` | K-14, K-16, K-17, K-32, K-33, Y8 |
| 4 | Hamle maliyeti (`moveCost` kancaları: Y8 geri sürükleme 2) + cam cezası; `turn++` | `movesChanged` | K-07, K-17, K-21 |
| 5 | Başlangıç hücrelerinin komşuları: `onNeighborMoved`; açığa çıkan hücreler: `onCellUncovered` | `crateDamaged`, `crateBroken`, `bagTorn`, `chainReleased`, `screwCollected`, `keyCollected`, `gapUnlocked` | Y1, Y2, Y3, Y7, W7 |
| 6 | Saha yerçekimi (§5.3), ardından yeniden `onCellUncovered` | `pieceFell{cause:'yardGravity'}`, … | K-20, Y2, Y6 |
| 7 | Hedef sayaçları | `goalProgress` | §4.9 |
| 8 | Dilim tamamlandı mı (şantiye stratejisi) → kayma/sonraki dilim → teslimat | `segmentCompleted`, `siteShifted`, `deliveryArrived`, `pieceFell{cause:'delivery'}`, `deliveryQueued` | K-22, K-25, K-27 |
| 9 | Kuyruk yeniden denemesi | `deliveryArrived`, `deliveryQueued` | K-26 |
| 10 | `onMoveEnd` kancaları (kural sırasıyla): kepenk, kayar kapı, döner platform, asansör, ıslak beton | `gapChanged`, `carouselRotated`, `elevatorMoved`, `wetTick` | W4, W5, S5, S6, Y4 |
| 11 | Kazanma / hamle bitti | `levelWon`, `outOfMoves` | K-28, K-29 |
| 12 | Kilitlenme tespiti, gerekiyorsa Kamyon Yardımı | `deadlockDetected`, `yardReshuffled` | K-30 |

Sıralamanın gerekçeleri: dilim tamamlanması (8) zamanlayıcılardan (10) önce gelir ki döner platform tamamlanmış dilimi
"öne" getirip hamleyi boşa harcatmasın; kazanma (11) en sonda değerlendirilir ki son hamledeki teslimat ya da kepenk
olayı kaybolmasın; kilitlenme (12) kazanma/kaybetmeden sonra, yalnızca oyun sürüyorsa bakılır.

### 6.3 Olay birleşimi

```ts
interface EvBase { seq: number; step: number }        // seq: hamle içinde 0,1,2…; step: §6.2 adımı
type At = { zone: 'yard' | 'site'; x: number; y: number; seg?: number }   // GENEL koordinat
type GameEvent = EvBase & (
  | { t: 'moveCancelled'; pieceId: PieceId; reason: 'sameSpot' | 'craneOverYard' | 'wallColumn' | 'invalid' }
  | { t: 'pieceMoved'; pieceId: PieceId; from: At; to: At; entry: 'yard' | 'overWall' | 'gap'; gap?: number }
  | { t: 'piecePainted'; pieceId: PieceId; from: ColorCode; to: ColorCode; gap: number }
  | { t: 'windDrift'; pieceId: PieceId; dx: -1 | 1 }
  | { t: 'pieceFell'; pieceId: PieceId; from: At; to: At; rows: number; cause: 'release' | 'yardGravity' | 'delivery' | 'bounce' }
  | { t: 'balloonRose'; pieceId: PieceId; from: At; to: At; rows: number }
  | { t: 'glassBroke'; pieceId: PieceId; at: At; penalty: number }
  | { t: 'pieceReturned'; pieceId: PieceId; from: At; to: At | 'queue' }
  | { t: 'placementCorrect'; pieceId: PieceId; cells: At[]; overWall: boolean }
  | { t: 'cellsRevealed'; seg: number; cells: { x: number; y: number; color: ColorCode }[] }
  | { t: 'comboChanged'; combo: number }
  | { t: 'trowelEarned'; trowels: number }
  | { t: 'placementWrong'; pieceId: PieceId; mismatched: At[] }
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
  | { t: 'deadlockDetected'; reason: 'material' | 'tiling' | 'noMoves' }
  | { t: 'yardReshuffled'; moves: { pieceId: PieceId; from: At; to: At }[] }
  | { t: 'boosterApplied'; booster: 'hammer' | 'crane' | 'paint' | 'trowel'; detail: unknown }
);
```

- Olaylar `EventSink` arayüzüne yazılır: oyun `ArraySink`, solver ve bot `NULL_SINK` kullanır (tahsis yok).
- **Determinizm:** olay listesi (durum, hamle) çiftinin saf fonksiyonudur. `eventLogHash` = olayların kanonik JSON'u
  üzerinde FNV-1a; golden testler bunu karşılaştırır (§12.4).
- **Sahne tarafı (`EventPlayer`):** adımlar sırayla, aynı adımdaki olaylar paralel oynar; süreler `tokens.json` /
  JUICE.md'den gelir (ör. düşüş = `rows × msPerRow(gravity)`, yanlış yerleşim 350 ms, dilim kayması 600 ms). Girdi
  oynatma bitene kadar kilitlidir; ekrana dokunmak kalan animasyonları 3× hızlandırır. "Animasyonları azalt" ayarı
  süreleri 0,3× yapar ve sallanmaları kapatır. Sahne olayları yalnızca *gösterir*; mantık çekirdekte zaten bitmiştir.

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
  readonly gravity: GravityProfile;           // K-19 tablosu: msPerRow, holdMs, glassThreshold, steerable
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
| W3 Dar Geçit | (çekirdek: `size = 1` → hizalama kuralı) | — | ayrı kanca gerekmez |
| W4 Kepenk | `canPassGap`, `onMoveEnd` | geçit `open`, `phase` | kapanış hamle sonunda; o anda geçitte blok olamaz (bloklar geçitte bırakılamaz, §4.3) |
| W5 Kayar Kapı | `onMoveEnd` | geçit `y`, yön | `range` içinde ping-pong |
| W6 Boya Kapısı | `onPassGap` | parça `color` | yalnızca RAIL ile o geçitten şantiyeye bırakılınca (S-21) |
| W7 Kilitli Geçit | `canPassGap`, `onCellUncovered` | geçit `open`; gizli öğe toplandı | anahtar `keyId` eşleşmesi |
| W8 Rüzgâr Fanı | `modifyFall` | — | 1 genişlik, `fan.dir` |
| Y1 Ahşap Kasa | `onNeighborMoved` | engel `hp` | hücre kaplar, statik; `clear` hedefi |
| Y2 Çimento Torbası | `onNeighborMoved`; düşüş çekirdek yerçekiminde (`gravityBound` bayrağı) | engel canlı | sürüklenemez |
| Y3 Zincir | `canPick`, `onNeighborMoved` | parça `flags.chained` | `clear: chain` hedefi |
| Y4 Islak Beton | `canPick`, `onMoveEnd` | parça `counter` | üstünde sayaç |
| Y5 Ağır Malzeme | (çekirdek: `heavy` → ix ≤ 5) | — | şekilden türetilir (§3.2) |
| Y6 Saha Yerçekimi | (çekirdek `settleYard`, `gravity.yard`) | — | eklenti yalnızca öğretici bayrağı |
| Y7 Altın Vida | `onCellUncovered` | gizli öğe | `collect` hedefi |
| Y8 Harçlı Blok | `onPlacement`, `moveCost` | parça `flags.stuck` | geri sürükleme 2 hamle |
| S1 Kayan Şantiye | `SiteStrategy` (segments) | `activeSeg` | K-22 |
| S2 Plan Boşluğu | (çekirdek doğrulama: `.` hücresi) | — | K-15, K-17 |
| S3 Cam Blok | `onLanded` | parça `flags.glass` | eşik `ctx.gravity.glassThreshold` |
| S4 Moloz | `onLevelStart` (şantiyeye yerleştirme); `clear: debris` sayacı `goals.ts`'de: moloz şantiyeden çıkınca (sahaya taşındı ya da Çekiç) +1 | parça `flags.debris` | sürüklenebilir (1 hamle; FREE ile yukarı ya da RAIL ile geçitten) |
| S5 Döner Platform | `SiteStrategy` (carousel) | `frontSeg` | K-23 |
| S6 Asansör İskele | `SiteStrategy.frameOffset/onMoveEnd` | `elev`, `elevDir` | K-24 |
| S7 Gizli Plan | derleme zamanı `resolveHidden` + `onPlacement` (açılma) | açılan maske | K-32 |
| S8 Balonlu Blok | `modifyFall` (`dir = +1`) | parça `flags.balloon` | |
| G-H Ağır yerçekimi | profil (`glassThreshold = 2`, hızlı düşüş); 700 ms tutma **sahnede** (§4.7) | — | solver yok sayar |
| G-L Hafif yerçekimi | profil (`glassThreshold = 4`, `steerable`); `computeFall` `steer` | — | §5.1 |

### 7.3 Kanca sırası

`order`: W (100'ler) → Y (200'ler) → S (300'ler) → G (400'ler); aynı kanca içinde örn. `modifyFall`'da W8 (108) S8'den
(308) önce çalışır: balonlu tek genişlikli blok önce rüzgârla kayar, sonra yükselir. Etkileşim matrisi (OBSTACLES.md)
yazıldığında bu sıra ona göre düzeltilir; her çift için bir test (`"W6+S3 paint keeps glass flag"`).

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
const PiecePlacement = z.strictObject({
  shape: ShapeId, color: Color, x: Int(0, 7), y: Int(0, 9),
  flags: z.optional(z.array(z.enum(['glass', 'mortar', 'balloon', 'chained', 'wet']))),
  wetMoves: z.optional(Int(1, 20)),
});
const GapBase = { y: Int(0, 7), size: Int(1, 7) };
const Gap = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('static'), ...GapBase }),
  z.strictObject({ type: z.literal('shutter'), ...GapBase, period: Int(1, 10), phase: z.optional(Int(0, 19)) }),
  z.strictObject({ type: z.literal('slider'), ...GapBase, range: z.tuple([Int(0, 7), Int(0, 7)]) }),
  z.strictObject({ type: z.literal('paint'), ...GapBase, color: Color }),
  z.strictObject({ type: z.literal('locked'), ...GapBase, keyId: z.string().check(z.minLength(1)) }),
]);
const HiddenRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('repeat'), period: Int(1, 7) }),
  z.strictObject({ kind: z.literal('mirrorOf'), segment: Int(0, 7) }),
]);
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
    carouselEvery: z.optional(Int(1, 10)),
    elevator: z.optional(z.strictObject({
      range: z.tuple([Int(0, 7), Int(0, 7)]), start: z.optional(Int(0, 7)), dir: z.optional(z.enum(['up', 'down'])),
    })),
    segments: z.array(Segment).check(z.minLength(1), z.maxLength(6)),
    debris: z.optional(z.array(PiecePlacement)),
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
  tutorial: z.optional(z.array(z.strictObject({
    step: Int(1, 20), highlight: z.string(), textKey: z.string().check(z.regex(/^tut\.[a-z0-9_.]+$/)),
  }))),
});
export type LevelData = z.infer<typeof LevelSchema>;
```

Brif §12 tipinden farklar (hepsi öneri, P-6): `schemaVersion` eklendi; `gaps` tipine göre ayrık birleşim (kepenkte
`period` zorunlu vb.); **`build.mode`'dan `'elevator'` çıkarıldı, `build.elevator` ayrı isteğe bağlı alan oldu**, çünkü
Bölüm 40 "döner platform + asansör"ü birlikte istiyor ve tek bir `mode` alanı bunu ifade edemiyor; `elevatorRange` →
`elevator.range` + başlangıç `start` ve yön `dir`. `strictObject` bilinmeyen anahtarları reddeder (yazım hatası yakalar).

### 8.3 Mantık kuralları (`src/core/level/logic.ts`; araç ve oyun ortak)

Her kural bir `Issue { rule: 'L-xx', severity: 'error' | 'warn', path, message }` üretir. `error` varsa bölüm yüklenmez
(code-lead ilke 4).

| Kod | Kural | Ciddiyet |
| --- | --- | --- |
| L-01 | `id` dosya adıyla eşleşir (`level_004.json` ↔ 4); kimlikler benzersiz; `chapter` = ⌈id/10⌉ | error |
| L-02 | Parti 0 parçaları ve engeller tahtada (x 0–5, y 0–7, şeklin kapsamı dahil), birbiriyle çakışmaz | error |
| L-03 | Saha doluluk oranı (parça + kasa + torba hücresi / 48) ∈ [0,80; 1,00] (K-02) | error (S-3: öğretici bölümler için `warn`?) |
| L-04 | `I5_90`/`I5_270` yasak; Q9 ve I5 yalnızca sahada (§3.2) | error |
| L-05 | Her satır 2 karakter; plan yüksekliği + `elevator.range[1]` ≤ 8 | error |
| L-06 | Bölümdeki plan renk sayısı ≤ hikaye bölümü sınırı (1 → 3, 2 → 4, 3–5 → 5; brif §6) | error |
| L-07 | Kullanılan renkler o bölümde açılmış olmalı (W,Y: 1; G: 2; R: 4; O,C: 11; B,P: 21) | error |
| L-08 | `?` yalnızca `hidden` kuralı olan dilimde; `mirrorOf` hedefi daha önceki bir dilim ve aynı satır sayısı; `repeat.period` < satır sayısı; her `?` döngüsüz çözülebilir; çözülen renk ile açık yazılmış hücreler tutarlı | error |
| L-09 | Duvar: geçitler çakışmaz; **`gap.y + size ≤ height − 1`** (geçidin üstünde en az bir duvar satırı, S-4); kayar kapı `range` aynı sınırda; kepenk `phase < 2·period`; kilitli geçidin `keyId`'si bir `key` engeline eşleşir; `fan` yalnızca 1 genişlikli bloğu olan bölümde anlamlı | error / warn |
| L-10 | Malzeme yeterliliği: her dilim için o dilime kadar gelen partilerdeki **şantiyeye geçebilen** blokların renk başına hücre toplamı ≥ plan hücreleri; boya kapısı varsa o geçide sığan bloklar kapının rengine de sayılır | error |
| L-11 | Döşenebilirlik: her dilimin plan bölgesi, mevcut bloklarla tam örtülebilir (kesin örtü DFS'i, ≤ 16 hücre, ms altında); `.` hücresinin üstündeki hücreler için ya hizalı bir geçit ya da iki sütuna köprü kuran 2 genişlikli blok var (S2) | error |
| L-12 | Partiler: `forSegment` 0..S−1, parti 0 dilim 0 için var, `dropColumns` blok genişliğine uyar | error |
| L-13 | Moloz şantiyede, desteklenmiş ve gerçekten "yanlış" (en az bir hücresi plan rengine uymuyor) | error |
| L-14 | Vida ve anahtar bir parçanın altında gizli (açıkta başlarsa anında toplanırdı); kasa `hp` 1–3 | error |
| L-15 | Hedefler: `build` tam bir kez; `clear.count` ≤ hedeflenebilir varlık sayısı; `collect.count` ≤ vida sayısı | error |
| L-16 | `teaches` geçerli bir mekanik kimliği ve bölüm o mekaniği gerçekten kullanıyor | error |
| L-17 | `tutorial.textKey` hem `tr.json` hem `en.json`'da var; `highlight` bilinen bir hedef (`gap`, `wall`, `piece:<idx>`…) | error |
| L-18 | Zorluk etiketi testere dişi planına uyar (10, 15, 25, 35, 45, 49 Zor; 20, 30, 40, 50 Çok Zor) | warn |
| L-19 | (solver aşaması) Çözülebilir, `moves ≥ min + tampon` (Kolay +8, Normal +5, Zor +3, Çok Zor +2), **YAO ≥ %60** | error |
| L-20 | (bot aşaması) Orta bot kazanma oranı hedef bantta (Kolay ≥ %90, Normal %65–80, Zor %40–55, Çok Zor %25–40) | warn |

`tools/validate-levels.ts` L-01…L-18'i çalıştırır, tablo halinde basar, hata varsa çıkış kodu 1. L-19/L-20
`levels:solve` ve `levels:bot`'ta denetlenir. Oyunda ise zod + L-02, L-04, L-05, L-08, L-09 yükleme anında koşar
(< 1 ms); kalanlar derleme zamanı güvencesidir. Bölümler oyuna `import.meta.glob('/levels/level_*.json')` ile tembel
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
- Solver'ın **yok saydığı** şeyler (brif §12 ve tasarım gereği): G-H 700 ms tutma, güçlendiriciler (Çekiç, Vinç, Boya
  Fırçası, Geri Al, Altın Mala), +5 hamle teklifi, kombo. Hamle sınırı = `level.moves` (yalnızca rapor; arama sınırsız).

### 9.3 Hamle üretimi ve budama

Her düğümde, tutulabilen (`beginDrag` ≠ null) her parça için tek BFS, ardından:

1. **Şantiye yerleşimleri (yalnızca doğru olanlar):**
   - FREE: her şantiye sütunu için o sütundaki en alçak erişilebilir bırakma düğümü (cam kırılmasını en aza indirir;
     iniş yeri sütuna bağlı olduğundan diğer yükseklikler baskındır). Rüzgâr kaymaları `computeFall` içinde. Balonlu
     blokta varış yeri bırakma yüksekliğine bağlı olduğundan her farklı varış ayrı adaydır.
   - G-L: ek olarak her `atRow` için yönlendirme varyantları (≤ 8 satır × 1 sütun).
   - RAIL: tamamen şantiyedeki her erişilebilir RAIL düğümü.
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

- Eşit hamle sayılı çözümler arasında YAO'su yüksek olan tercih edilir (açık listesinde eşitlik bozucu).
- `tests/golden/level_NNN.json`: çözüm + `eventLogHash`. Test, çözümü çekirdekte oynatır: `levelWon` olmalı ve
  olay günlüğü karması eşleşmeli. Kural değişikliği karmayı değiştirirse `npm run golden:update` ile bilinçli güncellenir.

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
  `outOfMoves` / kilitlenme / cam) + `docs/level-report/difficulty.svg` (bağımlılıksız elle üretilen SVG: kazanma oranı
  eğrisi + hedef bantlar).

### 9.7 Kilitlenme (K-30) ve "çözüm koruyan karıştırma"

**Tanım:** hamle sınırı göz ardı edildiğinde hiçbir hamle dizisi kalan planı tamamlayamıyorsa kilitlenme vardır.
Kesin karar bir solver çalıştırmasıdır (saniyeler) → çalışma zamanında kullanılmaz. Bunun yerine **kademeli gerekli
koşullar** (her hamle sonunda, toplam ≤ 2 ms):

1. **Hareket yok:** tutulabilen parça yok ve hiçbir zamanlayıcı (ıslak beton, kepenk) bunu değiştirmeyecek.
2. **Malzeme:** her renk için kalan plan hücresi > erişilebilir malzeme (saha + kuyruk + gelecek partiler; boya kapısı
   dönüşümü dahil). Yerleşen doğru bloklar geri alınamadığı için bu, en sık kilitlenme kaynağıdır.
3. **Döşeme:** aktif dilimin kalan hücreleri mevcut bloklarla, fiziksel olarak uygulanabilir bir sırayla (her blok ya
   açık gökyüzüyle desteğe düşer ya da hizalanabilen bir geçitle raydan girer; asansör/kayar kapı aralıkları dahil)
   döşenebiliyor mu? 20 000 düğüm sınırlı kesin örtü DFS'i. **Bütçe biterse "kilitlenme yok" sayılır** (yanlış pozitif
   ile oyuncuya bedava karıştırma vermek yerine).

Herhangi biri başarısızsa `deadlockDetected{reason}` → **Kamyon Yardımı** (ücretsiz):

**Yapıcı (constructive) karıştırma algoritması** — deneme-yanılma değil, çözümü inşa ederek garanti eder:
1. Aktif dilimin kalan hücreleri için seed'li RNG ile bir döşeme `T` ve uygulanabilir yerleşim sırası bul (3. adımdaki
   DFS). Mümkünse sahadaki mevcut bloklardan seç; eksik şekil varsa (S-19 izin verirse) mevcut hücre/renk bütçesinden
   yeniden "kes".
2. Sahadaki tüm hareketli blokları kaldır (engeller yerinde kalır). Şaşırtmacaları (decoy) alttan, sütun sütun yerleştir.
3. `T`'nin bloklarını **ters yerleşim sırasıyla** üste koy: ilk gereken blok en üstte ve duvara en yakın sütunda olur;
   her yerleşimden sonra bloğun erişilebilirliği BFS ile denetlenir.
4. 50 ms bütçeli solver sondası ile aktif dilimin tamamlanabildiği doğrulanır; olmazsa yedek düzen: gerekli blokların
   hepsi en üst katmanda, duvar tarafından başlayarak satır satır.
5. `yardReshuffled{moves}` olayı (kamyon kaldırır, yeniden döker animasyonu).

**Pahalı (kesin) alternatif — reddedildi:** rastgele karıştır + tam solver ile doğrula + tutmazsa tekrarla. Çalışma
zamanında saniyeler sürebilir ve tekrar sayısı sınırsızdır; yalnızca araçlarda (bot raporunda) çapraz denetim olarak
kullanılır.

**Önemli tasarım notu (S-19):** Kilitlenme çoğunlukla şantiyedeki geri alınamaz doğru yerleşimlerden doğar (kalan bölge
eldeki şekillerle döşenemez). Bu durumda yalnızca **konum** karıştırmak kilidi açmaz; Kamyon Yardımı'nın **malzemeyi
yeniden kesebilmesi** (aynı renk ve hücre bütçesiyle farklı şekiller getirmesi) gerekir. Karar product-lead'indir.

---

## 10. Render (Phaser 4.2.1)

### 10.1 Oyun yapılandırması

```ts
new Phaser.Game({
  type: Phaser.AUTO,                                  // WebGL (Phaser 4'te WebGL1 bağlamı); Canvas yalnızca yedek (deprecated)
  parent: 'game', width: 1080, height: 1920,
  backgroundColor: tokens.color.sky,
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },   // öneri P-7 (brif: FIT)
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  fps: { target: 60, smoothStep: true },
  input: { activePointers: 2, windowEvents: true },
  scene: [BootScene, SplashScene, HomeScene, PreLevelScene, LevelScene, StoryScene, BridgeScene, LeagueScene, ShopScene],
});
```

- **FIT yerine EXPAND (P-7):** 1080×1920 = 0,5625 en-boy. 360×800 Android'de FIT ile ekranın **%20'si**
  (160 px) boş kalır; 390×844 iPhone'da güvenli alanlar çıkınca (≈ 390×763) **%9**. EXPAND görünür alanı uzun eksende
  büyütür (oyun boyu 1080 × 1920…2400), tasarım genişliği 1080'de sabit kalır. Yerleşim kuralı: üst çubuk üstte, güçlendirici
  çubuğu altta sabitlenir, tahta aradaki alanda ortalanır; `scale.on('resize')` ile `Layout.recompute()`. Tasarım yine
  1080×1920'de yapılır; fazla yükseklik gökyüzü/arka plana gider. Brifte FIT yazdığı için bu değişiklik onay ister.
- **Güvenli alan:** `index.html`'deki `#game { inset: env(safe-area-inset-*) }` korunur; Phaser tuvali çentiği hiç görmez,
  çentik bandını `body` arka plan rengi doldurur (gökyüzü üst rengiyle aynı). Capacitor 8'de de aynı yöntem geçerli
  (§13: kenardan kenara düzen CSS `env()` ile).
- `desynchronized: true` (düşük gecikmeli tuval) yalnızca Faz 5 performans deneyi olarak denenecek (yırtılma riski).

### 10.2 Prosedürel dokular (açılışta bir kez)

Phaser 4'te `Create.GenerateTexture` / `TextureManager.generate` **yok** (§0). Yöntem: `textures.createCanvas('atlas', 2048, 2048)`
→ `CanvasTexture.context` üzerine Canvas2D ile çiz → her kare için `tex.add(frameName, 0, x, y, w, h)` → **tek** `tex.refresh()`
(tek GPU yüklemesi). `DynamicTexture` kullanılmaz (v4'te her çizim için `render()` gerekir, gereksiz karmaşıklık).

| Doku ailesi | Adet | Not |
| --- | --- | --- |
| Blok hücresi | 8 renk × 16 bağlantı maskesi = 128 | her hücre 4 komşusunun aynı blokta olup olmamasına göre (dış kenarda kontur ve bevel, iç kenarda kesintisiz); iç köşe dolguları ayrı küçük kareler (4) |
| Plan hücresi | 8 renk + `.` (çapraz tarama) + `?` | %30 opak + kesik kontur + sembol (brif §6) |
| Bayrak kaplamaları | cam, harç, balon, zincir, ıslak + 9 sayaç rakamı | blok üstüne ayrı görüntü |
| Engeller | kasa (3 hp), torba, vida, anahtar, moloz kiri | |
| Duvar ve geçitler | duvar dilimi, 5 geçit çerçevesi, ikaz şeridi, rüzgâr fanı | |
| Şantiye | ozalit zemin parçası, iskele ızgarası | tekrarlı `TileSprite` |
| Parçacık | toz, kıvılcım, 4 konfeti şekli | |

- Hücre boyutu `C = round(boardWidthPx / 9)` (EXPAND'de genişlik sabit olduğundan sabit; ≈ 110 px). 128 blok karesi
  ≈ 1,6 Mpx; tüm atlas 2048×2048 içinde → **16 MB GPU**. Maksimum doku boyutu açılışta denetlenir; < 2048 ise iki sayfa.
- Çizim fonksiyonları `src/theme/draw/*.ts` içinde **saf Canvas2D** fonksiyonlarıdır (`(ctx, spec, tokens) => void`);
  aynı fonksiyonlar `tools/level-preview.ts` tarafından Chromium içinde PNG üretmek için kullanılır (çift çizim kodu yok).
- Değerler `src/theme/tokens.json`'dan okunur (design-lead, D-003; salt okunur). `tokens.ts` dosyayı zod/mini ile
  doğrular; eksik anahtar geliştirmede açılış hatasıdır.
- WebGL bağlam kaybı: Phaser 4 kaynakları kendisi yeniden kurar, yalnızca dinamik (GPU'da çizilmiş) dokuları kullanıcıya
  bırakır (`Phaser.Renderer.Events.RESTORE_WEBGL`, kaynak koddaki açıklama). Atlasımız kaynak tuvali olan bir
  `CanvasTexture` olduğundan tuval bellekte tutulur ve bu olayda savunma amaçlı `tex.refresh()` çağrılır.
- Font: açık lisanslı yuvarlak font (design-lead seçer) `public/fonts/` altında woff2 olarak kendi sunucumuzdan
  (çevrimdışı ve Capacitor uyumlu); Boot `document.fonts.load('700 48px "<font>"')` bitmeden `Text` oluşturmaz.
- Tahmini açılış maliyeti: ~350 kare çizimi orta telefonda 20–40 ms + yükleme ~5 ms (Faz 2 perf testinde ölçülecek).

### 10.3 Sahne düzeni ve nesneler

- `LevelScene` katmanları (derinlik): arka plan → tahta zemini (saha, duvar, ozalit) → plan hücreleri → bloklar →
  düşüş gölgesi → sürüklenen blok (en üstte) → efektler → HUD (`ui/`).
- `PieceView` = `Container` + ≤ 9 hücre `Image` + bayrak kaplamaları. Bütün blok görüntüleri aynı atlastan → toplu çizim
  (hedef ≤ 15 draw call).
- Tahtaya tek bir görünmez etkileşim bölgesi konur; tutma testi hücre koordinatından `yardOcc`/`siteOcc` ile yapılır
  (blok başına Phaser isabet testi yok).
- Panorama (K-06): tamamlanan dilimlerin küçük kopyaları atlas karelerinden ölçeklenmiş `Image`'larla çizilir
  (dilim başına ≤ 16 görüntü); RenderTexture gerekmez.
- `Label`: Phaser `Text`; yalnızca değer değişince güncellenir (hamle sayacı hamle başına 1 kez).

### 10.4 Nesne havuzu

`Pool<T>` (`acquire`/`release`/`prewarm`): `PieceView` (48 hazır), hücre `Image` (220), gölge hücreleri (9), sayaç
etiketleri. Parçacık yayıcıları sahne açılışında bir kez oluşturulur, `explode()` ile kullanılır. Bölüm geçişinde
sahne yok edilmez; `LevelScene.reset(level)` havuzları boşaltıp yeniden doldurur → bölümler arası geçişte tahsis yok.

### 10.5 Girdi

§4.4–§4.7. Ek ayrıntılar: tutma `pointerdown`'da hemen başlar (kaldırma animasyonu 80 ms); parmak kıpırdamadan
bırakılırsa K-07 iptali. Parmak ofseti `tokens.drag.liftCells` (varsayılan 1,2). Sürükleme sırasında
`input.activePointers` ikinci parmağı yok sayar. `pointerupoutside` = mevcut düğümde bırakma.

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
1. `vite build` + `vite preview` (yerel port).
2. Playwright Chromium: `executablePath: '/opt/pw-browsers/chromium'` (kurulu rev 1194 / Chromium 141; Playwright 1.63
   rev 1243 bekliyor — `playwright install` çalıştırılmaz), 390×844, DPR 3, `isMobile`, `hasTouch`.
3. CDP: `Emulation.setCPUThrottlingRate { rate: 4 }` (ve ayrıca 1×).
4. `/?debug=1&level=N&autoplay=golden` açılır; debug kancası golden çözümü, CDP `Input.dispatchTouchEvent`
   (touchStart → 60 Hz touchMove dizisi → touchEnd) ile **gerçek sürükleme** olarak oynatır.
5. Ölçümler: sayfa içi rAF örnekleyici (`window.__perf`) → ortalama FPS, p50/p95/p99 kare süresi, > 20 ms kare oranı;
   `PerformanceObserver('long-animation-frame')` (Chromium 123+); girdi gecikmesi = `touchmove.timeStamp` ile bloğun
   yeni konumda çizildiği ilk rAF arasındaki fark (`DragController` ölçer); `Runtime.getHeapUsage` ile bellek.
6. Geçme ölçütü (brif §14): 4× yavaşlatmada **ortalama ≥ 50 FPS**, p95 ≤ 25 ms, sürüklemede > 50 ms uzun kare yok,
   girdi gecikmesi ≤ 1 kare.
7. Uyarı: headless GPU yazılımsal (SwiftShader) → GPU payı olduğundan kötü görünür; sonuç "CPU güvenilir, GPU gösterge"
   diye işaretlenir. Faz 2 ve 5 sonunda aynı harness gerçek bir orta seviye Android'de `chrome://inspect` uzaktan hata
   ayıklama ile elle çalıştırılır.
8. Mikro ölçümler: `vitest bench` (`tests/perf/*.bench.ts`) → BFS, `computeFall`, `applyMove`, `settleYard`, karma.

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
- Yazma: anlamlı olaylarda (bölüm sonu, satın alma, yıldız harcama, ayar değişimi) ve `visibilitychange: hidden` /
  `pagehide`'da; 500 ms birleştirme (debounce). Bölüm içi durum kaydedilmez (bölümden çıkan oyuncu bölümü yeniden başlatır;
  can kuralı META.md'de product-lead'in kararı).
- İçerik: ilerleme (en yüksek bölüm, bölüm başına sonuç), yıldız, altın, can + `livesUpdatedAt`, güçlendirici envanteri,
  galibiyet serisi, kasaba görevleri, etkinlik katılımları (seed + katılım zamanı), ayarlar, analytics kimliği.

### 11.2 `EventService` ve deterministik bot simülasyonu

```ts
interface EventService {
  list(now: number): EventSummary[];                                   // aktif/yaklaşan etkinlikler
  join(eventId: string, now: number): EventState;
  reportLevelResult(eventId: string, r: { won: boolean; difficulty: Difficulty }, now: number): EventState;
  standings(eventId: string, now: number): Standings;                  // köprü: kalan sayısı; lig: sıralama
}
// MVP: LocalBotEventService (bu bölüm) · Sonra: RemoteEventService (backend) — aynı arayüz
```

- **Sayaç tabanlı RNG** (sıralı RNG değil): `u(botIndex, k, salt) = hash32(eventSeed, botIndex, k, salt) / 2³²`.
  `eventSeed = hash32(instanceId, saveInstallId)`; `instanceId` etkinlik başlangıç zamanından türetilir (config).
- Bot `i`: beceri `skill_i = 0,30 + 0,65·u(i, 0, SKILL)`; `k`'inci denemenin zamanı
  `t_k = joinAt + Σ_{j≤k} (3 + 12·u(i, j, GAP)) dk` (brif: 3–15 dk); kazanma olasılığı
  `p = clamp(skill_i − diffPenalty(plank_k), 0,05, 0,98)`; kazanma `u(i, k, WIN) < p`.
- **Sallanan Köprü:** bot ilk kaybında elenir; `standings(now)` her bot için `t_k ≤ now` olan denemeleri sırayla işler.
  99 bot × ≤ 120 deneme (6 sa / 3 dk) ≈ 12 000 karma → < 1 ms. Aynı `now` → aynı sonuç; uygulama yeniden açıldığında
  durum tutarlıdır (brif §10). Ödül havuzu bölüşümü config'ten.
- **Usta Ligi:** hafta kimliği `weekId = floor((now − LEAGUE_EPOCH) / 7 gün)` (UTC Pazartesi 00:00; S-25), botların
  puanı aynı zaman çizelgesiyle birikir (zorluk puanı 1/2/3), günün saatine göre etkinlik eğrisi; ilk 20 terfi, son 20 düşme.
- Saat geri alınırsa (`now < lastSeenNow`) simülasyon `lastSeenNow`'da dondurulur (basit hile koruması).

### 11.3 Ekonomi, can, yıldız, seri

- `config/economy.json` (product-lead + entrepreneur) zod/mini ile doğrulanır; kodda sabit fiyat yok.
- `Wallet`: altın/yıldız işlemleri tek kapıdan (`apply(tx)`), negatif bakiye imkânsız, her işlem `track()`'e gider.
- Can: `lives = min(max, stored + floor((now − livesUpdatedAt) / regenMs))` (brif: 5 can, 30 dk); dolunca sayaç durur.
- Galibiyet serisi (K-29 kayıpta sıfırlanır) ve bölüm öncesi bonus `meta/streak.ts`; güçlendirici açılışları
  `meta/unlocks.ts` (bölüm numarası → açılan öğe, config'ten).

### 11.4 Analytics

```ts
type AnalyticsEvent =
  | { name: 'app_open' } | { name: 'tutorial_step'; level: number; step: number }
  | { name: 'level_start'; level: number; attempt: number }
  | { name: 'level_end'; level: number; result: 'win' | 'lose' | 'quit'; movesLeft: number; wrongPlacements: number; yao: number; durationMs: number }
  | { name: 'booster_used'; booster: string; level: number } | { name: 'offer_shown'; offer: string }
  | { name: 'purchase'; sku: string; fake: true } | { name: 'event_join'; event: string } | { name: 'event_eliminated'; event: string; plank: number }
  | { name: 'star_spent'; task: string } | { name: 'life_lost'; level: number };
track(e: AnalyticsEvent): void
```

MVP: geliştirmede konsol, her zaman son 500 olay yerel halka tamponda (debug panelinde görünür). Sağlayıcı adaptörü
(Faz 5) entrepreneur'ün `ANALYTICS.md` kararına göre takılır. Tip birliği derleme zamanında yanlış parametreyi engeller.

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
  `src/services/audio/zzfxSynth.ts`'e alınır (≈ 2 KB), `randomness = 0` (deterministik). İlk kullanıcı hareketinden sonra
  (Phaser `WebAudioSoundManager` kilidi açınca) her efekt **bir kez** `AudioBuffer`'a çizilir ve
  `game.cache.audio.add(key, buffer)` ile önbelleğe konur; çalma `scene.sound.play(key, { rate })` (kombo tınısında
  perde `rate` ile yükselir). Efekt parametreleri `src/services/audio/sfx.ts`'de (design-lead ZzFX tasarım aracıyla seçer).
- Ayarlar: ses/müzik ayrı kısılır; sekme gizlenince `sound.pauseAll()`.

### 11.7 Haptik

```ts
interface Haptics { light(): void; medium(): void; strong(): void; doubleLight(): void; pattern(name: 'win'): void }
```

- Web: `navigator.vibrate` (light 10 ms, medium 20 ms, strong 35 ms, double [10, 40, 10]). **Doğrulanmış destek:**
  Chrome Android 32+ (Chrome 60'tan beri kullanıcı hareketi şart), Firefox Android 79+ çağrıyı kabul eder ama titreşmez,
  **Safari ve iOS Safari'de hiç yok** (MDN BCD `version_added: false`). iOS web'de haptik sessizce no-op olur.
- Capacitor (Faz 5): `@capacitor/haptics` 8.0.2 → `Haptics.impact({ style: ImpactStyle.Light | Medium | Heavy })`,
  `Haptics.notification(...)`. iOS'ta haptiğin tek güvenilir yolu budur.
- Ayarlardaki "titreşim" anahtarı ve "animasyonları azalt" ile birlikte kapatılabilir.

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
| `levels:validate` | `node tools/validate-levels.ts` — zod + L-01…L-18; tablo çıktısı, hata → çıkış 1 |
| `levels:solve` | `node tools/solve.ts [--level N] [--budget 60] [--no-cache] [--update-golden]` |
| `levels:bot` | `node tools/playtest-bot.ts [--games 500] [--profile orta]` → `docs/LEVEL_REPORT.md` + `docs/level-report/difficulty.svg` |
| `levels:preview` | `node tools/level-preview.ts [--level N] [--png]` → ASCII stdout; `--png` Playwright + `theme/draw` → `artifacts/previews/` |
| `levels:check` | `levels:validate && levels:solve && levels:bot` (solver önbellekli) |
| `screens` | `vite build && node tools/screens.ts` → `artifacts/screens/<ekran>.png` (390×844, DPR 3) |
| `perf` | `vite build && node tools/perf.ts` (§10.7) |
| `test:rules` | `vitest list --json` çıktısını `tools/rule-coverage.ts` okur; GDD.md'deki her K-xx ve OBSTACLES.md'deki her engel kimliği en az bir test adında geçmiyorsa çıkış 1 |
| `golden:update` | solver çözümlerini `tests/golden/`'a yazar (bilinçli, diff incelenir) |
| `typecheck` | `tsc --noEmit -p tsconfig.json && tsc -p tsconfig.core.json && tsc -p tsconfig.tools.json` |
| `check` | `typecheck && lint && format:check && test && test:rules` |

`tools/screens.ts`: `vite preview`'ı başlatır, Chromium'u `executablePath: '/opt/pw-browsers/chromium'` ile açar
(`playwright install` **çalıştırılmaz**), her ekranı `/?debug=1&screen=<Ad>&fixture=<kayıt>&reducedMotion=1` ile açar,
fontlar yüklenip sahne `window.__ready = true` dedikten sonra görüntü alır. Fikstür kayıtları (`tests/fixtures/saves/`)
her ekranın tutarlı durumda çekilmesini sağlar (ör. "Bölüm 12, 3 can, köprüde 47/100").

### 12.3 Debug paneli (code-lead ilke 8)

Yalnızca `import.meta.env.DEV` ya da `?debug=1` iken **dinamik import** edilir (üretim paketine girmez). DOM katmanıdır
(Phaser değil), sağ üstte katlanır.
- Bölüm seç (1–50 + fikstürler), yeniden başlat, seed değiştir.
- Sınırsız hamle (çekirdek `movesLeft` azalmaz; olay yine yayınlanır).
- Solver çözümünü oynat: önbellekteki `artifacts/solver/level_NNN.json` (geliştirme sunucusu üzerinden) ya da tarayıcıda
  Web Worker ile 5 s bütçeli çözüm; adım adım / sürekli; her adım sürükleme animasyonuyla.
- Yerçekimi aç/kapa (saha / şantiye profili low-normal-high), her engel kuralını aç/kapa (`disabledRules`).
- **Tahtayı ASCII kopyala** (Ek A biçimi; panoya ve konsola) + "ASCII'den yükle" (test fikstürü üretmek için).
- Olay günlüğü (son 50 olay, adım numaralarıyla), durum karması, FPS ve kare süresi grafiği, son 500 analytics olayı.
- Tekrar oynatma: `Move[]` JSON dışa/içe aktar (hata raporu = bölüm + seed + hamleler).

### 12.4 Test stratejisi

- **Kural testleri:** her K-01…K-33 en az bir test; test adı kimliği içerir: `it('K-17 wrong placement bounces to start and burns a move', …)`.
  Engeller de aynı biçimde: `'W4 shutter closes every period'`, `'Y8 mortar sticks on wrong placement'`. Engel çiftleri
  (OBSTACLES.md matrisi) `'W6+S3 …'`. `test:rules` kapsamayı zorlar (`npm run check`'in parçası).
- **Fikstürler:** `tests/fixtures/builders.ts` → `level({ wall, gaps, plan, pieces: [['D2_0','W',2,6], …] })`
  (zod'dan geçen gerçek `LevelData` üretir) + `expectAscii(state, \`…\`)` anlık görüntü karşılaştırması (Ek A).
- **Değişmez (property) testleri** (bağımlılıksız, seed'li döngü, 1 000 rastgele geçerli hamle × 20 bölüm):
  hücre çakışması yok; parça/hücre sayısı korunur; `yardOcc`/`siteOcc` parça tablosuyla tutarlı; aynı hamle dizisi →
  aynı karma ve aynı olay günlüğü (determinizm); `cloneState` sonrası değişiklik orijinale sızmaz; iptal hamlesi durumu
  değiştirmez (K-07).
- **Hareket testleri:** küçük elle kurulmuş tahtalarda erişilebilir düğüm kümesi birebir beklenen kümeyle karşılaştırılır
  (K-08, K-09, K-11, K-12, K-13 dahil "çıkıntı altına yandan giriş yok").
- **Golden tekrarlar:** `tests/golden/level_NNN.json` (§9.5) — her bölüm çözümü oynatılır, `levelWon` + `eventLogHash`.
- **Şema/doğrulayıcı testleri:** her L-xx için bir geçersiz fikstür → beklenen `Issue`.
- **Meta testleri:** `FakeClock` ile can yenilenmesi, köprü/lig simülasyonunun `now`'a göre determinizmi, save migration
  zinciri (eski sürüm fikstürleri).
- **Sahne duman testi (Faz 2, Playwright):** Bölüm 1 açılır, CDP dokunma olaylarıyla bir blok duvar üstünden taşınır,
  `window.__debug.state()` ile çekirdek durumu denetlenir; konsolda hata olmamalı.
- **Performans:** §10.7 + `vitest bench`.
- Ortam: Vitest `environment: 'node'` (mevcut); core testleri DOM'suz koşar (saflığın ek kanıtı).

---

## 13. Capacitor planı (Faz 5)

Doğrulanmış sürümler (2026-10-04): `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` **8.5.2**;
`@capacitor/haptics` **8.0.2**, `@capacitor/preferences` 8.0.1, `@capacitor/app` 8.1.2, `@capacitor/splash-screen` 8.0.2,
`@capacitor/status-bar` 8.0.4. Kurulum anında sürümler yeniden `npm view` ile doğrulanır (D-002 ilkesi).

| Konu | Plan |
| --- | --- |
| Gereksinimler | Node ≥ 22 (mevcut 22.22 uygun), Xcode ≥ 26.0, iOS dağıtım hedefi 15.0, Android Studio Otter 2025.2.1+, minSdk 24, compile/target SDK 36 |
| Kurulum | `npm i @capacitor/core@8.5.2 @capacitor/haptics@8.0.2 @capacitor/preferences@8.0.1 @capacitor/app@8.1.2 @capacitor/splash-screen@8.0.2` · `npm i -D @capacitor/cli@8.5.2` · `npx cap init "Minik Usta" <bundle-id> --web-dir dist` · `npx cap add ios` (SPM şablonu varsayılan) · `npx cap add android` |
| Derleme | `vite build` (`base: './'` zaten var) → `npx cap sync` → Xcode / Android Studio |
| Ekran | yalnızca dikey (Info.plist `UISupportedInterfaceOrientations`, Manifest `screenOrientation="portrait"`); kenardan kenara: Capacitor 8'de `adjustMarginsForEdgeToEdge` kaldırıldı, System Bars eklentisi + CSS `env(safe-area-inset-*)` — bizim `#game` yaklaşımımızla uyumlu |
| Platform adaptörleri | `services/platform`: `isNative`, `KeyValueStore` (Preferences), `Haptics` (Capacitor), uygulama yaşam döngüsü (`pause` → kaydet + ses durdur, `resume` → can sayacı/etkinlik yenile) |
| Ses | WKWebView'de WebAudio ilk dokunuşla açılır (Phaser kilit açıcısı); sessiz mod anahtarı davranışı cihazda test edilir |
| Satın alma | MVP'de sahte; gerçek IAP eklentisi entrepreneur kararından sonra ayrı karar (D-xxx) |
| Performans | WKWebView/Android WebView'de aynı `perf` harness'ı uzaktan hata ayıklamayla; hedef cihaz listesi entrepreneur + code-lead |
| Mağaza varlıkları | ikon/splash design-lead'den; `@capacitor/assets` vb. araçlar o gün doğrulanır |

---

## 14. Faz 2 uygulama planı — dikey dilim (Bölüm 1–5)

Kapsam: K-01…K-19 (normal yerçekimi), K-22, K-25…K-29, K-33 (sayaç), W1, S1, S2; temel juice; TR/EN; telefonda
oynanır. Engel çerçevesi (kayıt defteri) kurulur ama yalnızca W1/S1/S2 eklentileri yazılır. Süreler kabaca ajan iş günü.

| # | İş | Çıktı | Süre | Bağımlılık |
| --- | --- | --- | --- | --- |
| 1 | Yapılandırma: `allowImportingTsExtensions`, `erasableSyntaxOnly`, `tsconfig.core.json`, `tsconfig.tools.json`, ESLint katman kuralları (§1.3); bağımlılıklar `zod@4.6.5`, `@types/node@22.20.5` (dev) | yeşil `npm run check` | 0,5 g | — |
| 2 | `core/shapes`, `coords`, `rng`, `types` + testler (§3 tablosu birebir) | K-01, şekil testleri | 0,5 g | P-2 onayı |
| 3 | `core/level/schema` + `logic` (L-01…L-18) + `compile` + `tools/validate-levels.ts` | `levels:validate` | 1,5 g | P-6 onayı |
| 4 | `core/state`, `hash`, `grid`, `ascii` + değişmez testleri | Ek A ASCII | 1 g | — |
| 5 | `core/movement` (BFS, RAIL, yapışkan takip, yol) + K-07…K-13 testleri + `vitest bench` | §4 | 1,5 g | — |
| 6 | `core/gravity` (`computeFall`, `settleYard`), `placement` (K-14…K-18, geri sekme) | §5 | 1,5 g | — |
| 7 | `core/moves` hattı + olay birleşimi + `site` (segments) + `delivery` (K-25/26) + `goals` + `combo` + `session` (Geri Al) | §6 | 2 g | — |
| 8 | `core/obstacles` kayıt defteri + W1, S1, S2 eklentileri | §7 | 0,5 g | — |
| 9 | Basit solver (katmansız A*, küçük bölümler için) + golden tekrarlar 1–5 | `tests/golden/` | 1 g | bölüm JSON'ları |
| 10 | `theme/tokens.ts` + `theme/draw` + açılış atlası | §10.2 | 1 g | design-lead `tokens.json` |
| 11 | `LevelScene`: yerleşim (EXPAND), `PieceView` havuzu, `DragController` (ofset, yapışkan takip, gölge), `EventPlayer` (kaldırma, iniş esnemesi, doğru parıltı, hatalı geri sekme, dilim kayması, kamyon dökümü) | oynanır tahta | 4 g | JUICE.md süreleri |
| 12 | UI asgari: üst çubuk (hamle, hedef), panorama şeridi, kazanma/kaybetme pencereleri (yer tutucu), Boot → Bölüm 1 akışı (≤ 3 dokunuş) | | 1,5 g | UX_FLOWS.md |
| 13 | Servisler: i18n (tr/en), save v1 (ilerleme), analytics yerel, ses (zzfxSynth + 6 efekt), haptik | §11 | 1,5 g | metinler |
| 14 | Debug paneli (bölüm seç, sınırsız hamle, ASCII kopyala, olay günlüğü, FPS, golden oynat) | §12.3 | 1 g | — |
| 15 | `tools/screens.ts` + `tools/perf.ts` + Playwright duman testi | §10.7, §12.2 | 1 g | — |
| 16 | Bölüm 1–5 JSON'larının doğrulanması, telefonda deneme (`npm run dev --host`), düzeltmeler | Faz 2 çıkışı | 1,5 g | product-lead JSON |
| | **Toplam** | | **≈ 21 g** | |

Sıra: 1 → 2 → 4 → 5 → 6 → 7 (çekirdek önce, saf ve testli) ‖ 10 (tokens gelince paralel) → 11 → 12 → 13 → 14 → 15 → 16.
3 ve 9 bölüm verisi geldikçe. Faz 2 çıkış ölçütü: `npm test`, `npm run build`, `levels:validate` yeşil; 1–5 golden
geçiyor; perf 4× ≥ 50 FPS (CPU tarafı); 390×844 ekran görüntüleri design-lead incelemesinde.

---

## 15. Fizibilite ve riskler

| # | Brifteki öğe | Neden pahalı / riskli | Önlem ya da ucuz alternatif |
| --- | --- | --- | --- |
| R-1 | **Solver: 50 bölüm, teslimatlarla, 60 s** | Saha hamleleri durum uzayını patlatır; 5 dilimli bölümde derinlik 30+. Tek parça A* her bölümde bitmeyebilir | Dilim sınırında katmanlı A* (teslimat doğal kesme noktası), budanmış saha hamleleri, kabul edilebilir + tutarlı `h`, `worker_threads` paralelliği, bölüm karmasıyla önbellek, beam yedeği ve `exact/heuristic` etiketi + `UB − LB` raporu. Ucuz alternatif: dilim başına optimal toplamı (üst sınır); Kolay/Normal bölümlerde büyük olasılıkla yeterli (Faz 3'te ölçülecek) |
| R-2 | **Hafif yerçekiminde düşerken yönlendirme (K-19)** | Gerçek zamanlı dokunuş, hareketli küçük hedef; hamle düşüş bitene dek işlenemez (iki aşamalı commit); solver dallanması artar; yönlendirme, raydan sonra çıkıntı altına girmenin ikinci yolu olur (ray/pencere tasarımını delebilir) | Önerilen ucuz alternatif: "düşüş sırasında şantiyenin sol/sağ yarısına dokun → blok o sütuna kayar" (büyük hedef, erişilebilir) ya da yönlendirmeyi yalnızca **çıkıntısı olmayan** sütunlara izin vermek. Her iki durumda çekirdek modeli (`steer.atRow`) aynı kalır |
| R-3 | **Ağır yerçekiminde 700 ms otomatik düşüş** | Bulmacada zaman baskısı; solver ve bot zorluğu ölçemez; motor becerisi düşük oyuncuya erişilebilirlik sorunu; cam eşiği 2 ile birleşince sertleşir | Zamanlayıcı sahnede (çekirdek saf kalır), görsel halka sayacı; bot "geç kalma" olasılığıyla modeller. Ucuz alternatif: "ağır blok şantiye üstünde **indirilemez**" (düşüş geçtiği yükseklikten) — zaman yok, deterministik, solver ölçebilir. Ayarlarda "zaman baskısını kapat" seçeneği önerilir |
| R-4 | **Asansör + geçitler (K-24)** | Ray hizası her hamle değişir → oyuncu için okunurluk; solver durumuna faz eklenir (`turn mod L`) | Teknik maliyet düşük (çerçeve ofseti); gölge ve geçit çerçevesi hedef plan satırını vurgulamalı (design-lead). Doğrulayıcı: plan + `range[1]` ≤ 8. Bölüm 40'ta döner platform + asansör birlikte → şema değişikliği P-6 |
| R-5 | **`mirrorOf` gizli planlar** | Hesap ucuz (derlemede çözülür). Risk UX: 2 sütunlu dilimde ayna = sütun takası; oyuncu fark etmeyebilir ya da çok kolay bulabilir; bot modellemesi tahmini | Teknik risk yok; `?` açıldıkça ipucu (K-32). Botta `mirrorOf` doğru tahmin olasılığı parametresi |
| R-6 | **K-30 "çözüm koruyan karıştırma"** | Kesin yöntem (karıştır + solver doğrula) çalışma zamanında saniyeler | Kademeli gerekli koşullar + yapıcı karıştırma (§9.7, ≤ 50 ms). Kilit çoğunlukla şantiyeden geldiği için yeniden kesme izni gerekli (S-19) |
| R-7 | Playtest botu 75 000 oyun | Tek çekirdekte ~25 dk | `worker_threads` (8 işçi ≈ 3–5 dk), `--games 100` hızlı mod, solver önbelleği |
| R-8 | Phaser 4 olgunluğu | 4.x yeni ana sürüm; topluluk örnekleri çoğunlukla v3 | Yalnızca temel API (Image, Container, Text, Tween, CanvasTexture, particles); v3 bilgisine güvenmeden `node_modules/phaser/types` ve paketteki `skills/` belgeleriyle doğrulama; Filter kullanmama |
| R-9 | FIT ölçekleme | 19,5:9 telefonlarda ekranın %9–20'si boş | EXPAND (P-7) |
| R-10 | Küçük hücre | 360 px genişlikte 9 iç sütun → hücre ≈ 37 CSS px (≈ 5,8 mm) | Parmak ofseti + yapışkan takip + çok hücreli bloklar; design-lead duvar genişliğini 0,5 hücreye indirirse ≈ 39 px. Dokunma isabet testi blok kutusunu 0,25 hücre genişletir |
| R-11 | iOS web haptik | Safari Vibration API'yi desteklemiyor (doğrulandı) | Web'de no-op; Capacitor Haptics (Faz 5) |
| R-12 | ZzFX | Import anında `AudioContext`, `Math.random` | Yalnızca `buildSamples` alınır (P-9) |
| R-13 | Playwright/Chromium sürüm farkı | 1.63 rev 1243 bekliyor, kurulu rev 1194 | `executablePath` (P-10); API farkı çıkarsa Playwright sürümü değil bizim çağrılarımız uyarlanır |
| R-14 | Headless perf | SwiftShader yazılımsal GPU | CPU ölçümü güvenilir; GPU için gerçek cihaz turu |
| R-15 | zod paket boyutu | `zod` tam 24,8 KB gzip | `zod/mini` 7,2 KB (P-4) |
| R-16 | Bölüm verisi elle yazımı | 50 bölüm × ~40 parça JSON; şekil açısı karışıklığı | Şekil tablosu (§3.3), `levels:preview` ASCII/PNG, ayrıntılı doğrulayıcı mesajları; product-lead isterse ASCII blockout → JSON dönüştürücü (Faz 3, ayrı iş) |

---

## 16. Açık sorular (product-lead'e, orkestratör üzerinden)

Her sorunun yanında kodlanacak varsayım yazılıdır; cevap gelene kadar bu varsayımla ve testli ilerlenir.

| # | Soru | Varsayım |
| --- | --- | --- |
| S-1 | Şekil açısı saat yönünde mi? (`L4_90` hangisi?) | Saat yönünde, sol alta normalize (§3) |
| S-2 | `I5_90/270` (dikey 1×5) bölümde kullanılabilir mi? Vinç I5'i dikey çevirirse ağırlık korunur mu? | Yasak; I5 ve Q9 her zaman ağır |
| S-3 | K-02 "%80–100 dolu" öğretici bölümlerde de (1–5, "sade tahta") geçerli mi? | Geçerli; öğretici bölümler için `warn`'a düşürülebilir |
| S-4 | Geçidin üstünde en az bir duvar satırı şart mı? (`gap.y + size ≤ height − 1`) | Şart (aksi halde geçit değil alçak duvar) |
| S-5 | Bir hücresi duvar sütunundayken bırakılan blok ne olur? | İptal, yerine döner, hamle harcanmaz |
| S-6 | Saha yerçekimi ve komşu etkileri sürükleme sırasında mı, hamle sonunda mı? | Hamle sonunda; sürüklemede saha donuk (P-8) |
| S-7 | "Komşusu hareket etti" (Y1, Y2, Y3): yalnızca bloğun **başlangıç** hücrelerine 4-komşuluk mu? Yerçekimi düşüşü ve kamyon dökümü sayılır mı? Bir hamlede aynı kasa 1'den fazla kat kırılabilir mi? | Başlangıç 4-komşuluğu; düşüşler sayılır, teslimat sayılmaz; hamle başına engel başına en çok 1 |
| S-8 | Rüzgâr kayması ne zaman ve hedef doluysa ne olur? Raydaki bloğa etki eder mi? | Bırakınca, düşüşten önce, 1 sütun; hedef duvar/kenar/dolu ise kayma yok; ray etkilenmez |
| S-9 | Balon nereye kadar yükselir (tahta tepesi y=7 mi, plan tepesi mi)? Sahada bırakılınca da yükselir mi? | Tahta tepesi (y=7, Vinç Alanı'na girmez); sahada da yükselir |
| S-10 | Cam: "eşiğin üstünde" = düşüş > eşik mi, ≥ mi? Mesafe bırakma satırından mı? Geri sekme düşüşünde cam kırılır mı? | > eşik; bırakma satırından; geri sekmede kırılmaz |
| S-11 | Geri sekme için sahada hiç yer yoksa? | Blok kamyon kuyruğuna girer (K-26 gibi) |
| S-12 | Çimento torbası saha yerçekimi kapalıyken de düşer mi? | Evet (brif "yerçekimine tabidir") |
| S-13 | Moloz desteği alınırsa düşer mi? Moloz bir yerde "doğru" olabilir mi? | Düşmez (iskele); doğrulayıcı molozun yanlış olmasını şart koşar |
| S-14 | Zamanlı mekanikler neye göre ilerler: tamamlanan hamle (`turn`) mı, hamle sayacı mı? Cam cezası (+1) ve harç (2 hamle) zamanlayıcıyı 2 kez mi ilerletir? Güçlendiriciler ve +5 teklifi ilerletir mi? | `turn` (iptal olmayan hamle) başına 1 kez; cezalar yalnızca sayacı düşürür; güçlendiriciler ve teklif ilerletmez |
| S-15 | Döner platform tamamlanmış dilimi atlar mı? Sayaç bölüm başından mı? | Atlar; `turn`'e göre |
| S-16 | Bölüm 40 döner platform + asansör: brifteki tek `build.mode` yetmiyor | `build.elevator` ayrı alan (P-6) |
| S-17 | `repeat` gizli kuralı: `period` dilim içinde satır mı, yoksa önceki dilimin deseninin tekrarı mı? (Bölüm 27: "2. ve 3. dilim `?`") | Dilim içinde `period` satır aşağıdaki hücrenin rengi; kaynak `?` ise zincirle çözülür |
| S-18 | YAO: hangi çözüm üzerinden (minimum hamleli mi)? G-L yönlendirmesi ve Altın Mala nasıl sayılır? | Minimum hamleli çözüm, eşitlikte en yüksek YAO; yönlendirme "duvar üstü"; Altın Mala sayılmaz |
| S-19 | Kamyon Yardımı blokların **şeklini** değiştirebilir mi (aynı renk ve hücre bütçesi), yoksa yalnızca konum mu? | Şekil değiştirebilir (aksi halde şantiye kaynaklı kilit açılamaz, §9.7) |
| S-20 | Usta Serisi'ni saha hamlesi ya da cam kırılması bozar mı? | Yalnızca hatalı yerleşim ve cam kırılması bozar |
| S-21 | Boya Kapısı: geçitten geçip geri dönen blok boyanır mı? | Hayır; yalnızca RAIL ile o geçitten şantiyeye bırakılınca |
| S-22 | Vida/anahtar: hücre hamle içinde geçici olarak açılıp yerçekimiyle yeniden örtülürse toplanır mı? | Evet, açıldığı an toplanır |
| S-23 | Asansör deseni: `start` + `dir` ile ping-pong (0,1,2,1,0…) mu? İptal hamlesinde oynar mı? | Ping-pong; iptalde oynamaz |
| S-24 | Kepenk: `period` hamle açık + `period` hamle kapalı mı? `phase` neyi kaydırır? | Evet; `phase` döngüdeki başlangıç ofseti (0 = açık başlar) |
| S-25 | Lig haftası sınırı: UTC Pazartesi 00:00 mı, yerel saat mi? | UTC (deterministik) |
| S-26 | Hafif yerçekiminde yönlendirme girdisi (R-2) — design-lead ile birlikte | Düşen bloğa dokunma; alternatif "yarım ekran" önerildi |
| S-27 | Ağır yerçekimi 700 ms: şantiye sütunlarına girince başlar, çıkınca sıfırlanır mı? Erişilebilirlik ayarı? | Evet; ayar önerisi R-3 |
| S-28 | Güçlendiriciler hamle harcar mı? | Hayır |

---

## 17. Önerilen kararlar (DECISIONS.md için, Durum: ÖNERİ)

| No | Başlık | Özet |
| --- | --- | --- |
| P-1 | İç ızgara 9×10, duvar mantıksal sütun | Genel koordinat (K-01) değişmez; içeride duvar ix = 6, şantiye 7–8; K-12 "tamamen sığma" doğal çıkar |
| P-2 | Şekil dönüş kuralı | Saat yönü, sol alta normalize; `heavy = w ≥ 3 ∨ kind ∈ {I5, Q9}`; dikey I5 bölüm verisinde yasak |
| P-3 | Durum ve karma | Tek `Int32Array` tampon + kopyalama; 64 bit Zobrist, istek üzerine, parça kimliksiz (simetri) |
| P-4 | zod 4.6.5, `zod/mini` | Oyun + araçlar tek şema; 9,95 KB gzip |
| P-5 | Araçlar Node'un yerleşik TS desteğiyle | `node tools/x.ts`; `.ts` uzantılı importlar, `erasableSyntaxOnly`; `tsx` yok; `@types/node@22.20.5` dev |
| P-6 | Bölüm şeması inceltmeleri | `schemaVersion`; geçit tipine göre ayrık birleşim; `build.elevator` ayrı alan; L-01…L-20 kuralları |
| P-7 | Ölçek modu EXPAND | Brif FIT diyor → proje sahibi onayı gerekir |
| P-8 | Sürüklemede saha donuk | Yerçekimi ve komşu etkileri hamle sonunda |
| P-9 | Ses: ZzFX'in yalnızca `buildSamples`'ı gömülür | MIT başlığıyla; npm bağımlılığı yok; AudioBuffer önbelleği |
| P-10 | Playwright önceden kurulu Chromium ile | `executablePath: '/opt/pw-browsers/chromium'` |
| P-11 | Solver | Katmanlı A* + TT + budama + beam yedeği; sonuç önbelleği; golden tekrarlar |
| P-12 | K-30 | Kademeli gerekli koşullar + yapıcı karıştırma (S-19'a bağlı) |

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
plan seg0 (top→bottom): YY WW W. WW YY      ← Bölüm 4 örneği (brif §12), duvar 6, geçit y=3 boy 1
hidden: screw@(3,4) key:a@(5,3)      ← gizli öğeler bir bloğun altında (L-14)
```

- Saha: `.` boş, küçük harf = blok rengi, `1`–`3` kasa (hp), `b` torba. Şantiye: büyük harf = kilitli doğru blok, küçük
  harf = kilitsiz (moloz, harçla yapışmış), `_` platform (asansör ofsetinin altı), `*` Altın Mala hücresi.
- Duvar sütunu: `#` duvar, `=` açık geçit, `x` kapalı geçit (kepenk kapalı / kilitli), `:` duvar üstü hava.
- `--ids` seçeneği renk yerine parça kimliği basar (base36) → fikstür olarak geri yüklenebilir (`fromAscii`).
