# Teknik tasarım

Sahip: code-lead · Durum: **Faz 1 revizyonu (orkestratör kararları R-01…R-24 uygulandı; onay bekliyor)** · Tarih: 2026-10-04,
tamamlama 2026-10-05 (GDD/OBSTACLES/META'nın 2026-10-05 metnine eşitlendi; tutarlılık denetimi tur 1 bulguları işlendi:
UX §13.1, tokens `layout`/`check`/`physics`/`audio`, ART §3–§4, ANALYTICS §2 ile hizalama; tur 2: K-34 yanlış nesneli
`.` hücresi (E-43), K-30 D2 arzı ve adım 12 yardım teslimatı (E-23, E-44), teklif sonrası adım 12 (K-29, E-42), K-07
toplanan maliyet, duvarı aşmayan komşuluk (E-46), K-23/K-24/W5 zamanlayıcı ayrıntısı, K-43/4 iade listesi (E-45), K-31
boya kapısı rengi, öğretici `done.at` / `debris:<i>` / sürükleme sinyalleri / kilit güvencesi (GDD §14.1); son
tutarlılık turu 1: solver Kamyon Yardımı'sız (`noTruckHelp`) ve ✓-tuzağı taraması §9.8 (L-27), hedef engelleyicileri
ve `h` hedef/moloz terimleri (K-41, K-42, S4, W7), E-47, ANALYTICS §2 v2, D-067 paket kimliği, JUICE #83–84, faz
kapsamı ve `test:rules --phase`; son tutarlılık turu 2: GDD §14.1/3 kapalı `done` sözlüğü + süzgeçler + `startOn` +
genişletilmiş kilit güvencesi (§8.2, L-17), L-09 kayar kapı aralığı (K-45/3), K-17 kırılan yapışmış cam dönüşü ve
`stuck` yaşam döngüsü (§5.2), K-19 kapalı pencere listesi (§4.7), ANALYTICS §2 v4 (§11.4), `bridge_share_cap`
(§11.3), tampon boyutu (§2.4), faz kapsamı K-31 ve golden 1–5; son tutarlılık turu 3 (2026-10-06): `test:rules`
N-notu/E faz eşlemesi (§12.2), ağır şekil `id ≥ 8` (L-04, §3.2), G-L yönlendirmede bütün hücreler ve kaydırma eşiği
`steerSwipeMinPx` (§4.7, §5.1), `blockedByWallHeight` kutu yüksekliği (§4.4), pencere alttan çapası (§10.1), JUICE
Faz 2 P0 36 olay (§14.1), Ek A torba `%`; senkron geçişi (2026-10-06): ANALYTICS §2 v5 `store_open.source` (§11.4),
Albüm/yapı kartı (§10.3), `voidNotice` / `pendingChest` / kayıp penceresi devamı (§11.1), kurdele tokenları ve JUICE
#89–90 (§10.1, §10.3), i18n anahtar değişiklikleri ve küresel yer tutucular (§11.5); Faz 2A boşluk 4 (2026-10-06,
kodla eşitleme): §9.5 el golden biçimi, §11.1 `levelHash` tek uygulaması, §1.2 `core/panorama.ts` ve
`core/level/plan.ts`, §7.1 gerçek kanca imzaları + kayıt defteri API'si + adım 10 bağlama, §12.2 `golden:update`
kapsamı, L-11 boya kapısı satırı (§8.3), §10.1 EXPAND sıkıştırması, §2.7 `fmix32-chain-v1` tanımı, §2.1 `Zone.pending`,
§1.3 ESLint flat-config sırası, §2.6 Zobrist sınıf anahtarı; ayrıca GDD K-08 eşitlik sırası (§4.4), ART §4 inşa cephesi
iki katmanı (§10.2), UX §0.1 karar (b) (§10.1), STORY §7.3 / §7.5 / §7.6 anahtarları (§11.5), Faz 2 asgari ana ekran
(§14.1 #12))
Kaynaklar: `docs/BRIEF.md` (§4, §5, §7, §12), `CLAUDE.md`, `docs/DECISIONS.md`, `docs/review_inbox/_orchestrator_rulings.md`.
Kurallar için bağlayıcı kaynak **`docs/GDD.md` (K-01…K-46, K-35 hamle sonu hattı, §14.1 öğretici kuralları, E-01…E-47)** ve `docs/OBSTACLES.md`'dir
(W1…W8, Y1…Y8, S1…S8, G-H, G-L, etkileşim notları N1…N43, veri imzası tablosu); bu belge kuralı değiştirmez, nasıl
uygulanacağını yazar (R-02). Ölçüler ve görsel değerler `src/theme/tokens.json`'dan okunur (R-04). §16'daki S-1…S-38'in
hepsi GDD/META'da yanıtlandı (§16.2). Önerilen kararlar §17'de **P-n** numarasıyla durur (DECISIONS.md'ye orkestratör taşır).

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
| `src/core/types.ts` | `ColorCode`, `ShapeKind`, `ShapeId`, `PieceId`, `Zone` (§2.1, `pending` dahil), `Move`, `SessionAction`, `GameEvent` birleşimi | — |
| `src/core/rng.ts` | `mulberry32` (oyun RNG'si), `splitmix32` (anahtar üretimi), `hash32(...words)` (`fmix32-chain-v1`, tanım §2.7; sayaç tabanlı RNG) | — |
| `src/core/coords.ts` | ızgara sabitleri, duvar sınırı satır maskeleri (§2.2; iç koordinat = genel koordinat) | — |
| `src/core/shapes.ts` | 0° tablosu (brif §5) + üretilen dönüşler, genişlik/yükseklik/ağır bayrağı, satır maskeleri (§3) | coords |
| `src/core/level/schema.ts` | zod/mini bölüm şeması (§8) — runtime ve araçlar **aynı** şemayı kullanır | zod/mini |
| `src/core/level/logic.ts` | mantıksal doğrulama kuralları (§8.3; hata kodları = GDD K-45), saf fonksiyon, `Issue[]` döner | shapes, coords |
| `src/core/level/mechanics.ts` | mekanik veri imzaları tablosu (OBSTACLES "veri imzası" sütununun kod karşılığı; K-45/9, R-21) | schema |
| `src/core/level/plan.ts` | dilim planları `buildPlans` (satırlar üstten alta yazılır: plan satırı r = `rows[h − 1 − r]`), yerel hücre dizini `localIndex(sx, sy) = sy·2 + sx`, `?` çözüm sorunları (K-15, K-32); doğrulayıcı ve derleme ortak | schema, coords |
| `src/core/level/compile.ts` | `LevelData` → `CompiledLevel` (iç koordinat, gizli hücre çözümü K-32, kural seti, Zobrist tabloları) | hepsi |
| `src/core/state.ts` | `GameState` tampon düzeni, erişimciler, `cloneState`, `encodeState` (§2.4) | compile |
| `src/core/hash.ts` | Zobrist (§2.6) | rng, state |
| `src/core/grid.ts` | çarpışma maskeleri, sütun tepeleri, doluluk işlemleri | state |
| `src/core/movement.ts` | `beginDrag` → `DragSession` (BFS, raylar, yapışkan takip, yol) (§4) | grid |
| `src/core/gravity.ts` | `computeFall` (gölge + mantık ortak), `settleYard` (zincirleme), balon (§5) | grid, rules |
| `src/core/placement.ts` | **tek** `isCorrectPlacement` (K-16 + K-34), `buildFront` (= `eligibleTrowelCells`), K-17 geri sekme hedefi | gravity |
| `src/core/site.ts` | şantiye modu stratejisi: `segments` / `carousel` + `elevator` ofseti (K-22…K-24) | state |
| `src/core/delivery.ts` | partiler, FIFO kamyon kuyruğu (K-25…K-27, K-35 adım 8–9) | gravity |
| `src/core/goals.ts`, `combo.ts` | hedef sayaçları (K-41, K-42), Usta Serisi (K-33) | state |
| `src/core/moves.ts` | `applyMove` hamle hattı (§6, K-35) | hepsi |
| `src/core/boosters.ts` | K-36…K-40 ön koşul + etki, güçlendirici "mini hattı" (§6.4) | moves, placement |
| `src/core/deadlock.ts` | K-30 D1/D2/D3 tespiti + üç yardım yolu (§9.7) | moves, shapes |
| `src/core/obstacles/` | `types.ts` (eklenti arayüzü, `defineRule`), `registry.ts` (`ALL_RULES`, `levelHooks`, `infoKeysFor`, `validateRules`; §7.1), **her engel ayrı dosya**: `W1_staticGap.ts` … `S8_balloon.ts`, `GH_heavyGravity.ts`, `GL_lightGravity.ts` (§7) | core içi |
| `src/core/ascii.ts` | tahtayı ASCII'ye çevirme (debug "kopyala", testler, önizleme) (Ek A) | state |
| `src/core/session.ts` | `GameSession`: durum + Geri Al anlık görüntüsü (K-39) + hamle günlüğü; `replay(level, log)` ile bölüm içi devam (K-43, §11.1); `levelHash`, `RULES_VERSION` (§11.1); saf | moves |
| `src/core/panorama.ts` | `panoramaView(s)`: K-06 panorama verisi — dilim başına `done` / `active` / `future` ve plan satırları (açılmamış `?` `?` kalır, `.` ve plan dışı ayrı); **saf okuma**, durumu değiştirmez (test "K-06 …"); `ui/Panorama` yalnız bunu çizer (§10.3) | state, grid, placement, level/compile |
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

**(a) ESLint** — `eslint.config.js` (ESLint 10.12.0 + typescript-eslint 8.71.0, flat config; Faz 2'de yazıldı, `npm run
lint` her `check`'te çalıştırır). Blokların **sırası kuralın parçasıdır** (aşağıdaki not):

```js
const DEBUG_HARNESS = { regex: '(^|/)(debug|harness)(/|\\.|$)',
  message: 'load debug/harness only via import.meta.env guarded dynamic import in main.ts' };   // R-20
const TS_EXTENSION = { regex: '^\\.{1,2}/(?!.*\\.(ts|json)$)',
  message: 'relative imports need an explicit .ts extension (Node type stripping, §12.1)' };
const NO_UPWARD = { regex: '(^|/)(scenes|ui)(/|\\.|$)', message: 'no upward imports' };
const NODE = { regex: '^node:', message: 'browser code: no Node APIs' };

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'artifacts', 'coverage'] },
  { files: ['**/*.ts'], extends: [js.configs.recommended, ...tseslint.configs.recommended], /* globals, unused-vars */ },
  // 1. bütün tarayıcı kodu (en genel desen önce)
  { files: ['src/**/*.ts'], ignores: ['src/main.ts', 'src/debug/**', 'src/harness/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [DEBUG_HARNESS, NODE] }] } },
  // 2. core: saf ve deterministik — 1'in kalıplarını kendi dizisinde yeniden yazar
  { files: ['src/core/**/*.ts'], rules: {
    'no-restricted-imports': ['error', {
      paths: [{ name: 'phaser', message: 'core is pure: no Phaser' },
              { name: 'zod', message: 'core uses zod/mini (bundle size, see TECH_DESIGN §8)' }],
      patterns: [{ regex: '^node:', message: 'core is pure: no Node APIs' },
                 { regex: '(^|/)(scenes|ui|meta|services|theme|i18n|tools|debug|harness|config)(/|\\.|$)',
                   message: 'core must not import outer layers' },
                 TS_EXTENSION] }],
    'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
      'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'fetch', 'process', 'console'],
    'no-restricted-properties': ['error',
      { object: 'Math', property: 'random', message: 'use core/rng (seeded)' },
      { object: 'Date', property: 'now', message: 'core has no clock' }],
    'no-restricted-syntax': ['error',
      { selector: "NewExpression[callee.name='Date']", message: 'core has no clock' },
      { selector: 'TSEnumDeclaration', message: 'erasable syntax only (Node type stripping)' }] } },
  // 3. meta + services: motorsuz, yukarı import yok
  { files: ['src/meta/**/*.ts', 'src/services/**/*.ts'], rules: { 'no-restricted-imports': ['error', {
    paths: [{ name: 'phaser', message: 'meta/services are engine-free' }],
    patterns: [NO_UPWARD, DEBUG_HARNESS, NODE] }] } },
  // 4. R-14, BUSINESS E8: bot simülasyonu ödeme, ekonomi ve kayıt verisini göremez (3'ten SONRA)
  { files: ['src/services/events/**/*.ts'], rules: { 'no-restricted-imports': ['error', {
    paths: [{ name: 'phaser', message: 'engine-free' }],
    patterns: [{ regex: '(^|/)(meta/economy|services/(save|iap|ads|analytics))(/|\\.|$)',
                 message: 'bot sim must be independent of purchases/economy/save (E8)' },
               { regex: '(^|/)(save|iap|ads|analytics)(/|\\.|$)',            // göreli yol: '../save.ts'
                 message: 'bot sim must be independent of purchases/economy/save (E8)' },
               NO_UPWARD, DEBUG_HARNESS, NODE] }] } },
  // 5. araçlar (Node): core ve theme/draw
  { files: ['tools/**/*.ts'], rules: { 'no-restricted-imports': ['error', {
    paths: [{ name: 'phaser', message: 'tools run in Node' }],
    patterns: [{ regex: '(^|/)(scenes|ui)(/|\\.|$)', message: 'tools may import core and theme/draw only' },
               TS_EXTENSION] }] } },
);
```

**Flat-config sıra notu:** bir dosyaya birden çok blok uyduğunda ESLint aynı kuralın seçeneklerini **birleştirmez**;
seçenek veren sonraki blok öncekinin bütün `paths` / `patterns` dizisini **değiştirir** (yalnız önem düzeyi veren blok
seçenekleri korur). Bu yüzden: (1) en genel blok (`src/**`) en başta durur, katman blokları ondan sonra gelir ve ortak
kalıpları (`DEBUG_HARNESS`, `^node:`, `TS_EXTENSION`) kendi dizilerinde **yeniden yazar** (ortak sabitler bunun için
var); (2) daha dar desen daha sonra gelir (`src/services/events/**`, `src/services/**`'ten sonra), öbür sırada E8
yasakları sessizce silinirdi; (3) Faz 1 taslağındaki "debug/harness bloğu en sonda" yazımı core ve services yasaklarını
silerdi — kaldırıldı. Kalıp sonları `(/|\.|$)` hem klasör (`../scenes/x`) hem uzantılı dosya (`./save.ts`)
importlarını yakalar. Yeni katman bloğu eklerken ortak kalıplar kopyalanır; eklemeden sonra `npm run lint` ile bilinçli
bir ihlal denenir (ör. core'da `import 'phaser'`).

**(b) Ayrı tip denetimi** — `tsconfig.core.json`: `"lib": ["ES2022"]`, `"types": []`, `include: ["src/core"]`. DOM ya da Node
tiplerine dokunan her core dosyası `tsc -p tsconfig.core.json` ile derlenemez (ör. `window` → TS2304). `npm run typecheck`
üç projeyi de çalıştırır: `tsconfig.json` (oyun), `tsconfig.core.json`, `tsconfig.tools.json` (`types: ["node"]`).

### 1.4 Çalışma zamanı akışı (bir hamle)

```
pointerdown → DragController → core.beginDrag(state, pieceId)   [BFS bir kez, §4]
pointermove → DragSession.nearest(finger) → PieceView konumu + ShadowView (computeFall)   [≤ 0,05 ms]
pointerup   → GameSession.commit({kind:'drag', pieceId, to, via?, steer?})   [G-L: commit düşüş bitince/yönlendirmede ya da
                                                                GDD K-19 madde 1 (a)–(f) olaylarından birinde
                                                                `flushPending` (§4.7 kapalı liste; panorama, hedef
                                                                paneli vb. pencereyi kapatmaz)]
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
type Zone = 0 /* yard */ | 1 /* site */ | 2 /* queue (kamyonda) */ | 3 /* gone (kırıldı/çekiç) */ | 4 /* pending */;
interface Anchor { ix: number; iy: number }                               // kutunun sol alt köşesi (genel koordinatla aynı)
type DragMode = 0 /* FREE */ | number /* 1 + gapIndex = RAIL */;
interface DragNode { ix: number; iy: number; mode: DragMode }             // kodda tek tamsayı: (mode*10+iy)*8+ix
```

`Zone.pending` (4): partisi henüz kuyruğa girmemiş kamyon bloğu (derlemede k ≥ 1 partilerinin bütün blokları; `compile`
→ `startZone`; D2 yardım yuvaları `gone` başlar). K-35 adım 8'de `pending → queue`, adım 9'da `queue → yard`. `gone`'dan ayrıdır:
K-30 D2 arzı ve L-19 K-27 denetimi "henüz teslim edilmemiş" bloğu "yok edilmiş" bloktan ayırmak zorundadır. Hücresi
yoktur, ASCII'de yazılmaz (Ek A), Zobrist'e girmez (§2.6; hangi blokların beklediği `deliveryCursor`'dan türer).

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

**Ekran eşlemesi (R-04):** ölçüler `tokens.layout.*`'tan okunur, formül yoktur: `layout.grid.{cellPx (120), yardX,
wallX, wallW (60 = 0,5 hücre), buildX, yardCols, buildCols, rows, craneRows}` ve `layout.board.{craneTopY, boardTopY,
boardBottomY}` (board y değerleri H = 1920 içindir; çalışma anındaki kaydırma §10.1). Hücre → ekran:
`x ≤ 5 → yardX + x·cellPx`, `x ≥ 6 → buildX + (x − 6)·cellPx`; satır `y → boardBottomY' − (y + 1)·cellPx`
(`boardBottomY'` = §10.1 çapasıyla kaydırılmış değer). Sürüklenen
bloğun sürekli çapası `ax` için `screenX = yardX + ax·cellPx + s·wallW`, `s = clamp((ax − (6 − w)) / w, 0, 1)`: blok
tamamen sahadayken 0, tamamen şantiyedeyken 1; sınırı keserken duvarın ortasına simetrik kayar (2 geniş blok `ax = 5`'te
duvarı 30 px'lik iki yarıyla örter, komşu hücrelerin üstüne taşmaz). Duran hiçbir blok sınırı kesmez.
Değişmez testleri (`tests/theme/layout.test.ts`; tokens `layout._doc` listesinin tamamı + tahta geometrisi):
`grid.yardX + grid.yardCols·grid.cellPx == grid.wallX`, `grid.wallX + grid.wallW == grid.buildX`,
`grid.buildX + grid.buildCols·grid.cellPx + layout.marginPx ≤ 1080`,
`top.groupBottomY + board.minGapTopPx ≤ board.craneTopY` (üst grup tahtaya binmez),
`board.statusBottomY ≤ 1920 − bottom.groupTopFromBottomPx` (durum şeridi alt gruba binmez),
`board.boardBottomY − board.boardTopY == grid.rows·grid.cellPx`, `board.boardTopY − board.craneTopY ==
grid.craneRows·grid.cellPx`; ayrıca `H ∈ {1920, 2400}` için §10.1 çapalarıyla hesaplanan kutular çakışmaz.

Şantiye yerel koordinatı: `sx ∈ {0,1}`, `sy ∈ 0..7` (aktif dilim çerçevesine göre). Tahta satırı `y = sy + elev`
(`elev` = asansör ofseti, K-24; asansörsüz bölümde 0). `y < elev` olan şantiye hücreleri platform gövdesidir (dolu).

### 2.3 Değişmez bölüm (`CompiledLevel`)

`compile(levelData)` bir kez çalışır; sonuç dondurulur (`Object.freeze`) ve bütün durumlar tarafından paylaşılır:
plan renkleri (her dilim için `Int8Array(16)`, `?` çözülmüş halde + `hiddenMask`), duvar ve geçit tanımları, partiler,
engel örnekleri, etkin kural listesi (§7), yerçekimi profili (K-19 tablosu), Zobrist tabloları, durum tampon düzeni,
öğretici vurgu tablosu `tutorialPieceIds` (`piece:` / `debris:` → `PieceId`, §8.2).

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
| `wrongOcc` | S × 2 | dilim ve sütun başına içinde moloz ya da yapışmış harçlı blok duran plan satırı maskesi (K-34 `dotFree`, §5.2, E-43); parça tablosundan türetilir, O(1) erişim için tutulur, Zobrist'e girmez (parça konumları zaten karmada) |
| parçalar | P × 9 | `shape`, `color`, `zone`, `x`, `y`, `seg`, `flags` (glass, mortar, balloon, chained, wet, locked K-14, debris, stuck), `counter` (wetMoves), `arrivedTurn` (kamyonla geldiği `turn`; E-31) |
| geçitler | G × 3 | `open`, `y` (kayar kapı), `phase` |
| engeller | O × 2 | `hp` / canlı mı, `aux` |
| gizli öğeler | H × 1 | vida/anahtar toplandı mı |
| hedefler | 3 | ilerleme sayaçları |
| kuyruk | Q | kamyonda bekleyen `pieceId`'ler, ekleme sırasıyla (FIFO; K-26, E-04) |
| açılan `?` | S | dilim başına 16 bitlik maske (K-32) |

Tipik bölüm: P ≈ 40, S = 5 → sabit satırlar başlık 18 + `yardOcc` 60 + `siteOcc` 80 + `filled` 10 + `wrongOcc` 10 +
parçalar 360 = **538 alan**; değişkenler (geçit ≤ 9, engel ≈ 16, gizli öğe ≈ 4, hedef 3, açılan `?` 5, kuyruk ≈ 0–20)
eklenince **≈ 550–600 alan ≈ 2,2–2,4 KB** (`Int32` = 4 bayt). Okunurluk için erişimciler: `pieceX(s, id)`, `setPieceX(s, id, v)` …
(küçük, satır içi derlenen fonksiyonlar). Sıcak olmayan kod (UI, debug) `readPiece(s, id): PieceView` nesnesi kullanır.

**Neden değişken (mutable) + kopyalama, neden değişmez değil:**
- Solver saniyede 10⁴–10⁵ düğüm üretir; her düğümde nesne ağacı kopyalamak (spread/immer) GC baskısı yaratır.
  `buf.slice()` tek bir ≈ 2,2–2,4 KB bellek kopyasıdır (~100–250 ns).
- Geri Al güçlendiricisi ve oturum geçmişi = hamle başına bir tampon kopyası (50 hamle × 2,4 KB ≈ 120 KB).
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
h = ⨁_{alan i} F(i, değer_i)                        ← i: turn mod L, activeSeg, frontSeg, carouselT, elev, elevDir,
                                                       deliveryCursor, [turn < openShutterUntil]; sonra geçit open/y/phase,
                                                       engel hp/aux, gizli öğeler, 3 hedef sayacı, `filled` maskeleri
  ⊕ ⨁_{p: zone ∈ {yard, site}} K(class(p), konum(p))  ← konum: saha y·8 + x (0–79), şantiye 80 + seg·16 + sy·2 + sx (80–159)
  ⊕ ⨁_{q < queueLen} K(class(kuyruk[q]), 160 + q)      ← kuyruk FIFO yuvası: sıra karmaya girer (K-26)
K(c, pos) = fmix32(imul(c, M0) ⊕ Z.pos0[pos])   ‖  fmix32(imul(c, M1) ⊕ Z.pos1[pos])      (şerit 0 ‖ şerit 1)
F(i, v)   = fmix32(imul(v, M0) ⊕ Z.field0[i])   ‖  fmix32(imul(v, M1) ⊕ Z.field1[i])
class(p)  = kanonik şekil (6 bit) | renk (3) << 6 | bayraklar (8) << 9 | sayaç (8) << 17      ← parça kimliği YOK
M0 = 0x9e3779b1 · M1 = 0x85ebca77 · Z.* = splitmix32(ZOBRIST_SEED = 0x5eed2b1d) sırayla: pos0, pos1, field0, field1
```

- `L` = zamanlı mekaniklerin döngü uzunluklarının EKOK'u (kepenk 2·period, kayar kapı 2·(max−min), döner platform
  `carouselEvery`·S, asansör 2·(max−min)); zamanlı mekanik yoksa 1.
- Tablolar bölüm derlenirken sabit tohumlu `splitmix32` ile üretilir → karma deterministiktir (golden testler için).
- **Simetri:** iki özdeş blok yer değiştirdiğinde XOR değişmez → solver aynı durumu iki kez açmaz. Kanonik dizgede bunun
  için parçaları sıralamak gerekirdi.
- **Sınıf anahtarı (Faz 2A kararı):** brifteki `Z.piece[class][zone, konum]` tablo okuması uygulanamaz: sınıf uzayı
  52 şekil × 8 renk × 2⁸ bayrak × 2⁸ sayaç ≈ 2,7·10⁷, konum 160 + kuyruk. Tablo yerine **konum başına tek** rastgele
  anahtar tutulur ve sınıf değeri onunla karıştırılır: `imul(c, M)` tek bir sayıyla çarpma (2³² modunda birebir), XOR,
  sonra birebir `fmix32` → aynı konumdaki iki farklı sınıf her zaman farklı terim verir; iki şerit farklı çarpanla (M0,
  M1) bağımsızlaşır. Sınıfa kanonik şekil girer (simetrik yönelimler aynı karma; §3), parça kimliği girmez. Parçasız
  alanlar aynı yolla (alan dizini anahtarı × değer) karışır; bir alanın iki değeri birbirini götürmez. Karmaya girmeyenler
  (D-052, test "… counters do not"): `movesLeft`, `combo`, `trowels`, `wrongCount` / `overWallCount` / `railCount`,
  `arrivedTurn`, türetilmiş `wrongOcc`, `pending` ve `gone` parçalar. Testler `tests/core/hash.test.ts`: determinizm,
  özdeş blok takası, simetrik yönelim, alan duyarlılığı, kuyruk sırası, 5 000 rastgele sahada çakışmasızlık.
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
`fmix32-chain-v1` (`events.json → rng.hash`), tam tanımı aşağıda; referans vektörleri testte sabittir (cihaz ve ileride
sunucu aynı sonucu üretir). Tohuma ödeme, bakiye ya da oturum davranışı **girmez** (R-14); kurulum kimliği yalnızca Lig `groupId`'sinde
(grubu oyuncuya özgü kılmak için, META §7.1) yer alır ve bot modülüne sayı olarak verilir (§11.2).

```ts
// src/core/rng.ts — HASH32_VERSION = 'fmix32-chain-v1'; algoritma değişirse sürüm adı da değişir (events.json rng.hash)
function fmix32(x: number): number {             // murmur3 32 bit son karıştırıcı (uint32 üzerinde birebir)
  let h = x | 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}
function hash32(...words: number[]): number {    // sıra ve uzunluk duyarlı; sonuç uint32
  let h = fmix32(0x811c9dc5 ^ words.length);
  for (const w of words) h = fmix32(((h ^ (w >>> 0)) + 0x9e3779b9) | 0);
  return h;
}
```

Her kelime [−2³¹, 2³²) aralığında bir tamsayı olmalıdır; kesirli ya da aralık dışı kelime `RangeError` atar (sessiz kesme
cihaz ile sunucuyu ayırırdı, §15 R-19); `-1` ile `4294967295` aynı kelimedir (`>>> 0`). Referans vektörleri
(`tests/core/rng.test.ts`, onaltılık): `hash32()` = `ab3e7c0b`, `hash32(0)` = `c3febd23`, `hash32(0, 0)` = `64cdefdc`,
`hash32(1, 2, 3)` = `42c6bcb5`, `hash32(3, 2, 1)` = `cec9e51a`, `hash32(4004, 0, 0)` = `21c3c899`, `hash32(4004, 1, 0)` =
`b59541db`, `hash32(4004, 0, 1)` = `386c1552`, `hash32(2026, 123456789)` = `0ae84c9a`, `hash32(-1)` =
`hash32(4294967295)` = `c569aed7`. Sunucu (Faz 5+) aynı vektörleri geçmeden sürüm adını kullanamaz.

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
Hikaye bölümüne göre izinli türler (K-44) `logic.ts`'de tablo olarak durur (`shape_locked`). Ağırlık eşiği bu tabloyla
ifade edilemez (hikaye bölümü 1 = Bölüm 1–10; GDD K-44 "8. bölümden itibaren" bölüm numarasıdır), bu yüzden ayrı
denetimdir: **`heavy` şekiller (I5, Q9 ve w ≥ 3 yönelimler) yalnız `id ≥ 8`**; tür açılışı hikaye bölümüne göre (I5 ve
Q9 her hikaye bölümünde izinli tür, ağır oldukları için yine `id ≥ 8`). İkisi de `shape_locked` (L-04).

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

1. Kural kapısı (K-09): `zone` saha ya da şantiye; şantiyedeyse parçanın dilimi şantiyede görünen dilimdir
   (`seg == activeSeg` `segments`'te, `seg == frontSeg` `carousel`'de; panoramadaki ya da arkadaki dilimlerin parçaları
   tutulamaz); `locked` (K-14) değil; `movesLeft > 0`; etkin kuralların `canPick` kancalarının hepsi `true` (Y3 zincir,
   Y4 ıslak beton). Çekirdekte engele özel `if` yoktur; kancalar sırayla çağrılır (§7).
2. Çarpışma maskesi: `masks: Uint8Array(10)`, satır başına 8 bit. Saha: `yardOcc` (sürüklenen parça hariç). Duvar
   hücre kaplamaz; sınır maskeleri `openFree` / `openRail[g]` (§2.2). Şantiye: aktif dilimin `siteOcc`'u `elev` kadar
   kaydırılır; `y < elev` dolu (platform). `colTop[x]` (x = 6, 7): o sütundaki en yüksek dolu satır (sürüklenen parça
   hariç), yoksa −1.
3. Başlangıç düğümü: saha parçası ve harçla yapışmış blok (Y8) → yalnızca FREE(anchor) (GDD K-12: şantiye tarafından
   ray kipine girilemez). **Moloz (S4)** → FREE(anchor) ve ek olarak, bütün satırları bir geçidin içindeyse **ve** o
   geçit şu an açıksa (`canPassGap(g, piece)` kancalarının hepsi `true`: kepenk açık, kilit açılmış, K-40 dahil) RAIL(g)
   (çok kaynaklı BFS, ikisi de mesafe 0; OBSTACLES S4 "satırları bir geçitteyse ray kipinde de", N14). Ray istisnası
   yalnızca molozundur; OBSTACLES/GDD başka bir şantiye parçasına (ör. Y8) tanırsa kod bu listeye ekler.
   **K-07 satır 1 (başlangıç konumu):** çok kaynaklı başlangıçta her iki başlangıç düğümü de "başlangıç konumu"dur;
   moloz aynı hücrelere hangi kipte bırakılırsa bırakılsın iptal olur (aynı hücre kümesi; kip başlangıç kiplerinden biri).
4. BFS (§4.2). **Tutulabilirlik (K-09 (a))** = erişilebilir kümede, başlangıç hücrelerinden **farklı** hücre kümesine
   sahip en az bir düğüm var (düğüm sayısı değil: molozun iki başlangıç düğümü aynı hücreleri kaplar ve tek başına
   "kımıldıyor" saymaz). Yoksa `null` döner → "kımıldamıyor" geri bildirimi (K-09). Kip değiştiren kenar yerinde
   durmadığı için (§4.2 kenarları hep ±1 öteleme) bu tanım K-09 (a)'daki "4 birim ötelemesinden en az biri" ile eşdeğerdir.
   Testler: "K-09 debris in a closed gap row is not rail-pickable", "K-09 two start nodes do not make immovable debris
   pickable", "K-07 row 1 debris released at start cells in other mode cancels", "K-12 stuck mortar never starts in rail",
   "K-09 site piece of non-front carousel segment cannot be picked".

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
  (RAIL'e yalnızca saha tarafından girilir; tek istisna başlangıçta geçit satırlarında duran molozdur, §4.1). K-34 ile
  doğru bir çıkıntının altı yalnızca `.` hücresi olabilir; bu yüzden çıkıntı altına giren yerleşim, çıkıntı **doğru**
  bir blok ise her zaman hatalıdır (`window`). GDD K-19 istisnası: çıkıntı yanlış bir nesneyse (moloz S4, yapışmış harçlı
  blok Y8; ikisi de `filled`'e girmez) altındaki boş renkli hücreye doğru yerleşim mümkündür — bu, kuralın verdiği
  erişimdir, istismar değildir; ray ve pencere tasarımı delinmez (§15 R-2). Test: "K-19 correct placement under a
  debris overhang".
- **K-12:** Raydaki blok bırakıldığı yerde kalır (düşmez); YAO sayımında "geçit" sayılır. FREE kipte şantiyeye bırakılan
  her blok "duvar üstü" sayılır (hafif yerçekiminde yönlendirilse bile).

### 4.3 Bırakma sınıflandırması

| Bırakılan düğüm | Sonuç | Kural |
| --- | --- | --- |
| başlangıç düğümü (aynı hücreler, aynı kip) | iptal, hamle harcanmaz | K-07 satır 1 |
| FREE, tüm hücreler x ≤ 5 ve y ≤ 7 | sahaya yerleşim (1 hamle); balon burada yükselir; saha yerçekimi açıksa hamle sonunda oturur | K-07 satır 2, K-10, K-20 |
| FREE, tüm hücreler x ≤ 5, herhangi bir hücre y ≥ 8 | iptal (saha üstü havada bırakıldı) | K-05, K-07 satır 3 |
| blok sınırı kesiyor (hücreleri iki yanda) | iptal | K-07 satır 4, E-06, E-28 |
| tüm hücreler x ≥ 6 ve şantiye **kapalı** (bütün dilimler tamam, bölüm ek hedef yüzünden sürüyor) | iptal (`siteClosed`) | K-07 satır 5, E-27 |
| FREE, tüm hücreler x ≥ 6 | şantiyeye düşüş (§5.1) → doğrulama | K-07 satır 6, K-11, K-16 |
| RAIL(g), tüm hücreler x ≥ 6 | rayda yerleşim, düşmez → doğrulama | K-07 satır 7, K-12, K-16 |

Satırlar GDD K-07 tablosuyla birebir aynı sırada denenir (ilk tutan geçerli); test adları "K-07 row N …".

İptal olacak bırakma önceden gösterilir (design-lead önerisi): `DragSession.classify(node)` aynı tabloyu salt okunur
çalıştırır; sonuç iptalse `ShadowView` `cancel` durumuna geçer (sürüklenen blok %60 opak + "↩" rozeti, UX §5.3–5.4).
Maliyet: düğüm değişince 1 tablo bakışı.

### 4.4 Yapışkan takip (K-08) ve parmak ofseti

- Tutma ile dokunma ayrımı (K-07) `tokens.drag.startThresholdPx` / `holdMs` ile yapılır (GDD'deki sayı yerine tek
  kaynak token; test değeri tokens'tan okur). BFS `pointerdown`'da hemen yapılır (≤ 41 µs, 6×), görsel kaldırma eşik
  aşılınca başlar; eşik altında bırakma = dokunma (hiçbir şey olmaz).
- Parmak, tahta uzayına çevrilir; blok parmağın **`tokens.drag.fingerOffsetCells` (1,2) hücre üstünde** görünür. Hedef nokta
  `p = finger − grabOffset + (0, 1.2)` (iç hücre birimi, sürekli). `grabOffset` tutma anında parmak ile çapa arasındaki
  farktır; böylece blok tutulduğunda zıplamaz, yalnızca `tokens.duration.fingerOffset` (90 ms; kaldırma ölçeği ayrı,
  `duration.pick`) içinde 1,2 hücre yukarı süzülür (yer müsaitse).
- `nearest(p)`: erişilebilir düğümler içinde `(ix − px)² + (iy − py)²` en küçük olan. Eşitlik (`|Δd²| ≤ 1e-9`,
  `D2_EPSILON`) GDD K-08 sırasıyla bozulur: (1) mevcut düğümden BFS adımı az olan, (2) FREE kip RAIL kipinden önce (iki
  RAIL düğümü bu ölçütte eşittir), (3) çapa y'si küçük olan, (4) çapa x'i küçük olan, (5) yalnız (1)–(4) de eşitse küçük
  `wall.gaps` dizini. Kod (2)–(5)'i tek tamsayıda karşılaştırır (`DragSession.tieRank`, `src/core/movement.ts`):
  `tieRank = ((mode = FREE ? 0 : 80) + iy·8 + ix) · (1 + G) + mode` (`G` = geçit sayısı, `mode` = 0 | 1 + geçit dizini).
  Düğüm numarası (`mode·80 + iy·8 + ix`, §2.1) eşitlik bozucu **değildir**: geçit dizinini y'nin üstüne koyar ve sonucu
  `wall.gaps` sırasına bağlardı. Geçitler örtüşmediğinden (K-04, L-09 `gap_overlap`) (5) geçerli veride hiç belirleyici
  olmaz; yalnız determinizm içindir ve verideki geçit sırası (1)–(4)'ün sonucunu değiştirmez. Testler: "K-08 tie-break 1
  beats tie-breaks 3 and 4 …", "K-08 tie-break 3 before 4 …", "K-08 tie-break 3 also orders RAIL nodes of two different
  gaps …", "K-08 tie-break 2 comes before 3 …" (`tests/review/movement.review.test.ts`; son ikisi GDD K-08 "Örnek
  (eşitlik)" kurulumu).
- Histerezis: yeni aday ancak `d²(aday) ≤ d²(mevcut) − 0.2` ise seçilir (GDD K-08 "en az 0,2 küçükse", eşitlik dahil;
  sınırda titreme olmaz). Karşılaştırma kayan nokta hatasına karşı `d²(aday) − (d²(mevcut) − 0.2) ≤ 1e-9` ile yapılır.
  Test: "K-08 hysteresis accepts exactly 0.2 improvement".
- Aday mevcut düğüme bitişik değilse `pathTo(mevcut, aday)` (mevcut düğümden BFS, ebeveyn işaretçileri) hesaplanır ve
  görünüm bu yolu 12 ms/hücre hızla (en çok 120 ms) izler: blok **hiçbir zaman** duvarın ya da blokların içinden
  ışınlanıyormuş gibi görünmez.
- Yumuşak çizim: blok `node + clamp(p − node)` konumunda çizilir; bir eksende ofsete yalnızca o yöndeki komşu düğüme
  kenar varsa izin verilir (blok engele "sürtünerek kayar"). Şantiye üstünde FREE kipte dikey ofset düşüş gölgesinin
  altına inemez.
- Parmak tuval dışına çıkarsa Phaser işaretçiyi güncellemez (§0) → blok son geçerli konumda bekler; tuval dışında
  parmak kalkarsa `pointerupoutside` → mevcut düğümde bırakma.
- **`blockedByWallHeight` (K-05 sunum olayı):** hedef nokta `p` sınırın şantiye tarafında ve Vinç Alanı yüksekliğinde,
  ama en yakın düğüm sahada kalmışsa ve bloğun **kutu yüksekliği** `h > 10 − wall.height` ise (eşdeğer: `R`'de sınırı
  FREE geçen düğüm yok ve `h > 10 − height`) `DragSession` bu sinyali sürükleme başına en çok 1 kez sahneye verir
  (çekirdek olayı değildir, durum değişmez). Sütun başına boy yetmez: GDD K-05 "sınırı serbest kipte geçen her hücre
  `y ≥ height`" her sütunun sırayla geçmesini ister; normalize şekilde en az bir sütunun alt hücresi `y = 0`'da olduğundan
  o sütunun geçmesi çapa `≥ height`, tahtada kalmak çapa `≤ 10 − h` ister → geçiş ancak `h ≤ 10 − height` iken mümkün
  (ör. `S4_0`/`Z4_0`, sütunlarında 2'şer hücre ama `h = 3`, height 8'de geçemez; eski sütun formülü olayı üretmiyordu). Sahne yükseklik
  işaretini gösterir; hesaptaki ilk sinyalde bağlamsal öğretici `tut.ctx.tootall` bir kez tetiklenir (kayıtta
  `seenContextTips`). Testler: "K-05 tall piece emits blockedByWallHeight once per drag", "K-05 S4_0 at height 8 emits
  blockedByWallHeight" (aynısı `Z4_0` ve `L4_0` için; `D2_0`/`O4_0` height 8'de geçer, olay yok).

### 4.5 Maliyet ve önbellek (bir karede sığar mı?)

| İş | Ne zaman | Ölçülen / tahmini maliyet |
| --- | --- | --- |
| maske + `colTop` kurulumu | tutmada 1 kez | 80 hücre (8×10 kenar modeli, §2.2), < 2 µs |
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
    **başlamayan** kaydırma, `pointerdown`'dan beri yatay yol `|dx| ≥ tokens.drag.steerSwipeMinPx` (48) **ve**
    `|dx| > |dy|` olduğu ilk anda `sign(dx)` yönünü verir (UX §5.6; design-lead turu 2 önerisi). `startThresholdPx`
    aşılıp bu koşul sağlanmadan kalkan hareket (8–47 px yatay ya da çoğunlukla dikey) **ne dokunuş ne yönlendirmedir**:
    hiçbir şey olmaz, hak harcanmaz. Test: "K-19 G-L swipe below steerSwipeMinPx or mostly vertical does not steer".
    Çapası `atRow` satırında olan kaymış konumun **bütün** hücreleri (yalnız `atRow` satırındakiler değil; 1 genişlikli dikey
    `D2_0`, `I3_0`, `I4_0`'ın üst hücreleri dahil) x = 6–7 içinde ve boş değilse (kenar, duvar tarafı, dolu hücre,
    2 genişlikli blok) girdi etkisizdir ve hak **harcanmaz** (GDD K-19 madde 3–4). Test: "K-19 G-L steer of 1×2 piece
    blocked by occupied upper cell" (`D2_0` sütun 6'da düşerken (7,3) boş, (7,4) moloz, `atRow = 3` → kayma yok, hak
    korunur; blok sütun 6'da yönlendirmesiz iner).
  - `atRow` = `pointerdown` anındaki satır; bırakma satırı ile yönlendirmesiz iniş satırı arasında (ikisi dahil; iniş
    satırına varış anı pencereye dahildir, GDD K-19 madde 1). Görsel düşüş eğrisi tek kaynaktan,
    `tokens.physics.fallLowSpeed` (sabit hız, hücre/s) ve `physics.balloonRiseSpeed`'den hesaplanır (sayılar yalnızca
    tokens'ta; JUICE §0.1); GDD K-19'da ms/satır yok (düşüş hızı kural değildir), çekirdek yalnızca `{ dir, atRow }`'u görür.
  - Düşüş/yükseliş başına en çok 1 yönlendirme; 2 genişlikli blokta çip ve girdi yok; gölge yönlendirmesiz inişi gösterir
    (K-18), yönlendirme sonrası anında güncellenir.
  - Dokunma/tutma çakışması: `pointerdown` tutulabilir bir blokta başlayıp eşiği aşarsa bu bir **tutma**dır
    (yönlendirme değil); bekleyen düşüş yönlendirmesiz kesinleşir ve son karesine atlar (R-12). Eşik aşılmadan kalkarsa
    dokunuştur → yönlendirme. Böylece "her yer girdi" (design-lead) ile "sıradaki bloğu tut" (JUICE kural 3) çakışmaz.
    Girdi bölgesi tek parametredir (`steerZone: 'board' | 'site'`); GDD K-19 "tahtanın herhangi bir yeri" dediği için
    varsayılan `'board'`, `'site'` (x `grid.buildX` … `buildX + 2·cellPx`, y `board.craneTopY'` … `boardBottomY'`, §10.1
    kaydırmasıyla; H = 1920'de 810–1050 × 288–1488) yalnızca ayar yedeği. Düşüş sırasında başka blok tutulursa
    pencere kapanır, düşen blok yönlendirmesiz (ya da önceki yönlendirmesiyle) iner (E-40). Testler: "K-19 G-L invalid
    steer does not consume the right", "E-40 …".
  - **İki aşamalı commit:** sahne bırakmada `computeFall` ile animasyon planını alır ama hamleyi bekletir
    (`GameSession.pending`). Hamle (a) yönlendirme girdisinde `steer: { dir, atRow }` ile (GDD S-26 kayıt biçimi), (b) yeni bir tutmada ya da
    (c) düşüş bitince yönlendirmesiz olarak **bir kez** commit edilir. Günlüğe yalnızca son `Move` yazılır →
    determinizm korunur. Normal ve ağır yerçekiminde bekleme yoktur (commit bırakmada). Ayrıntı §5.1, risk §15 R-2.
  - **Bekleyen hamle kuralı (`GameSession.flushPending()`):** `pending` doluyken **yalnız** aşağıdaki (1)–(6)
    olayları — GDD K-19 madde 1 (a)–(f) **tam listesi** — kendileri işlenmeden **önce** bekleyen hamleyi
    yönlendirmesiz (ya da yapılmışsa önceki yönlendirmesiyle) commit eder (adım 0–12 tam çalışır, `inLevel` yazılır,
    animasyon son karesine atlar), sonra işlenir: (1) yeni tutma (`pointerdown` eşiği aşınca, (b) ile aynı), (2) Geri Al
    düğmesi, (3) güçlendirici yuvasına dokunma (Çekiç, Vinç, Boya Fırçası, Altın Mala), (4) duraklatma düğmesi /
    Android geri tuşu / çıkış menüsü, (5) `visibilitychange: hidden`, `pagehide`, Capacitor `App` `pause`, (6) sahne
    değişimi. `flushPending()` yalnız bu altı çağrı noktasından çağrılır (kod denetimi: başka çağıran yok). **Listede
    olmayan girdiler pencereyi kapatmaz:** panorama önizlemesi dokunuşu (K-06, durumu değiştirmez), hedef paneli, hamle
    sayacı gibi tahta dışı UI dokunuşları `pending`'e dokunmaz (tahta içi dokunuş ve kaydırma yukarıdaki yönlendirme
    girdisidir); düşüş/yükseliş sürer, yönlendirme hakkı korunur ve pencere iniş animasyonu bitince
    (c) ile kapanır ("Listede olmayan hiçbir olay pencereyi kapatmaz", GDD K-19 madde 1). Yeni bir pencere kapatan olay
    gerekirse önce GDD listesine eklenir. Sonuçlar: kayıt hiçbir zaman bırakılmış bir hamleyi kaçırmaz (K-43
    bit bit aynı devam; bırakma görsel olarak olmuşsa günlükte de vardır); Geri Al her zaman düşmekte olan hamleyi geri
    alır, bir öncekini değil (K-39 "son eylem"); `m` çıkış menüsü açılmadan artar, dolayısıyla ilk düşüş sırasında
    açılan çıkış menüsü `m = 1` görür ve çıkış cezalıdır (K-43 madde 2). Duraklatma pencereyi kapatır: blok
    yönlendirmesiz iner (GDD K-19 madde 1'deki "yeni tutma pencereyi kapatır" ile aynı sonuç; K-43 madde 1 "hiçbir şey
    ilerlemez" görsel saati durdurur, bekleyen hamleyi sonsuza dek bekletmez; GDD K-19 madde 1 (d), K-43 madde 1,
    E-47). Testler: "K-43 app killed during G-L fall keeps the released move", "K-39 undo during G-L fall reverts that
    move", "E-47 pause during first G-L fall commits move first; exit menu sees m = 1 (loss)" (yönlendirilmemiş ilk
    düşüşte Duraklat: blok yönlendirmesiz iner, adım 0–12 ve `inLevel` yazımı duraklatma penceresinden önce biter,
    Devam'da o düşüş için yönlendirme hakkı yok, "Bölümden çık" `m = 1` ile kayıptır), "K-19 booster tap during G-L
    fall commits pending first", "K-19 panorama tap during G-L fall keeps steer window" (panorama dokunuşundan sonra
    `pending` dolu kalır, aynı düşüşte gelen yönlendirme `steer` ile commit edilir; hedef paneli için aynı test).

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
// GDD K-34 "Görünürlük kancaları" madde 2 — biçim ve sıra GDD'den (R-02):
type VerdictReason = 'debris' | 'outside' | 'window' | 'color' | 'support';   // sabit sıra; reasons[0] = birincil neden
type Verdict = { ok: boolean; reasons: VerdictReason[]; missingSupport: At[] };  // ok ⇔ reasons.length === 0
// debris: blok moloz (S4) | outside: plan alanı dışı | window: `.` hücresi | color: renk ya da çözülmüş `?` rengi |
// support: K-34 bozuk; missingSupport = K-34'ü bozan plan hücreleri (GDD K-34 kanca 2): doğru dolu olmayan `.` olmayan
//          hücreler ve içinde yanlış nesne (moloz S4, yapışmış harçlı blok Y8) bulunan `.` hücreleri (sütun, satır sıralı; E-43)
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
   geçer (çapası `atRow` satırında olan kaymış konumun **bütün** hücreleri x = 6–7 içinde ve boşsa — GDD K-19 madde 3;
   dikey 1×2…1×4 blokta üst hücreler de denetlenir —; değilse girdi etkisiz, hak harcanmaz),
   oradan aynı yönde yeni sütunda ilk desteğe/tavana kadar sürer; çıkıntı altına girebilir (GDD K-19 madde 3). Balon
   yükselişinde de 1 kez kullanılabilir (GDD S8). Yönlendirilen yerleşim YAO'da "duvar üstü" sayılır (K-46). Cam için
   `d` = bırakma satırı ile son iniş satırı arasındaki toplam düşüş (K-19 madde 5).
4. `onLanded` önizlemesi: S3 cam, `distance > glassThreshold(gravity.build)` ise kırılır (eşik K-19: low 4, normal 3,
   high 2; "eşiğin üstünde" = kesin büyük; geri sekme ve teslimat düşüşünde kırılmaz, S-10 GDD yanıtı). Kırılma
   uygulanınca (adım 2) blok K-17 hedefine (`returnTarget`, §5.2) **sahaya** döner — başlangıcı şantiyede olan
   yapışmış harçlı cam 1. adımı atlar ve `stuck = false` olur (§5.2 "Kırılan cam istisnası", GDD K-17) —, **Usta Serisi `combo = 0`** olur (GDD K-33 "cam kırılması `c = 0`
   yapar", OBSTACLES S3) ve `comboChanged` yayınlanır; adım 3 atlandığı için sıfırlama adım 2'de yapılır. Maliyet
   adım 4'te tabana **eklenir** (`LandingEffect.penalty` = 1; GDD K-07 "ek maliyetler toplanır"): sıradan cam 2,
   yapışmış harçlı cam 3.
5. `verdict` = `isCorrectPlacement` (§5.2) iniş hücreleri için; K-34 dahil.

`ShadowView` aynı fonksiyonu çağırır; dolayısıyla gölge **her zaman** gerçek sonucu gösterir (rüzgâr, balon tavanı,
asansör ofseti dahil, K-18). Gölge durumu (UX §5.4, ART P-7 çift kodlu gölge): Kolay/Normal'de doğru = düz kontur + ✓,
hatalı = kesik kontur + !; `reasons` `support` içeriyorsa `missingSupport` hücreleri nabızla vurgulanır, 45° tarama
yalnızca `color`'da; Zor/Çok Zor'da yalnızca konum; `touchesHidden` iken her zorlukta nötr kesik beyaz kontur, rozet
yok. `support` gizli bilgi taşımadığı için nötr gölgede de (Zor, `?`) gösterilebilir (GDD K-34 kanca 2); nötr gölgede
`color` hiçbir zaman sızdırılmaz. Fizik bilgisi (cam çatlağı, rüzgâr, balon, asansör) bütün zorluklarda görünür (K-18).
İptal olacak bırakmada `cancel` (§4.3). Görsel stil design-lead'in; çekirdek yalnızca `verdict`, `effect`,
`touchesHidden` ve `buildFront` (§5.2) verir. Testler: "K-18 neutral shadow never leaks color", "S8 balloon hangs from
plan top", "E-15 …", "E-35 balloon released above ceiling lands down to it", "W8 no drift when resting" (= E-17),
"E-16 …".

### 5.2 Doğrulama (K-16) ve hatalı yerleşim (K-17)

**Tek fonksiyon (R-01):** `isCorrectPlacement(state, pieceId, cells): Verdict`. Doğru yerleşim denetimi (adım 3),
gölge rengi (K-18), Vinç hedefi (K-37), Altın Mala hedefi (K-33, `eligibleTrowelCells`), Boya Fırçası sonrası harç
kilitlenmesi (K-38) ve solver'ın doğru-hamle üretimi (§9.3) **aynı** fonksiyondan geçer; sapma olmaz.
Bütün koşullar değerlendirilir; bozulanlar `reasons`'a **GDD K-34 kanca 2'deki sabit sırayla** eklenir (birincil neden =
`reasons[0]`; erken çıkış yok, toplam maliyet yine O(hücre)):
1. **`debris` — K-16 (2):** blok moloz (S4; S-13 GDD yanıtı: moloz hiçbir yerde doğru olamaz).
2. **`outside` — K-16 (1):** bir hücre `(sx, sy)` (`sy = y − elev`) aktif dilimin plan alanı dışında.
3. **`window` — K-16 (1):** bir hücre plan `.` hücresinde.
4. **`color` — K-16 (1):** bir hücrenin plan rengi (gizliyse çözülmüş rengi, K-32) blok rengine eşit değil.
5. **`support` — K-16 (3) = K-34 Alttan Üste:** bloğun kapladığı her şantiye sütunu `c` ve o sütundaki en alt hücre
   satırı `r` için plan satırları `0 … r−1`'deki `.` olmayan her hücre doğru dolu, her `.` hücresi **boş** olmalı
   (GDD K-34: `.` hücreleri "yalnızca boşken dolu sayılır"). Sütun başına iki maske daha tutulur:
   `wrongOcc[seg][c]` = içinde moloz (S4) ya da yapışmış harçlı blok (Y8) duran plan satırları;
   `dotFree[seg][c] = dotMask[seg][c] & ~wrongOcc[seg][c]` (boş `.` hücreleri).
   `miss = ((1 << r) − 1) & planMask[seg][c] & ~(filled[seg][c] | dotFree[seg][c])`, `miss == 0`; `miss`'in bitleri
   `missingSupport`'a (sütun, satır sıralı) yazılır. Böylece yanlış nesneli `.` hücreleri (`wrongOcc & dotMask`)
   kendiliğinden `missingSupport`'a girer (GDD K-34 kanca 2). Moloz ve yapışmış harçlı blok `filled`'e girmez ("doğru
   dolu" değildir; üstlerine doğru yerleşim yapılamaz). `wrongOcc` bu nesneler dilimin plan alanına girince ya da
   çıkınca O(1) güncellenir (bölüm başı moloz, harç yapışması, sürükleme, Çekiç, Vinç, Boya Fırçası kilitlemesi K-38);
   plan satırı cinsindendir, asansörde çerçeveyle birlikte hareket eder. Gerekçe (GDD E-43): `.` boş değilken dolu
   sayılsaydı harcın üstü doğru blokla kapanır, harç tutulamaz olur ve dilim K-15 gereği hiç tamamlanamazdı
   (D1/D2/D3'ün yakalamadığı kilit). Maliyet: sütun başına 2 AND (≤ 2 sütun) → gölge her karede çağırabilir.
Doğruysa → `locked = true` (K-14), `filled` güncellenir, `combo++` (yalnızca sürükleme hamlesinde, K-33), gizli `?`
hücreleri açılır (K-32).

Hatalıysa etkin kuralların `onPlacement` kancası sonucu değiştirebilir: Y8 harç → `stick` **yalnızca bütün hücreleri
plan alanındaysa** (renkli, `?` ya da `.`; GDD Y8 / P-2b, E-08), `stuck = true`; değilse normal geri sekme:
  1. Başlangıç çapasının hücreleri boşsa oraya (kavisli animasyon, `tokens.duration.placeBad`).
  2. Değilse "sahanın üstünden düşerek ilk uygun boşluğa": aday sol sütunlar `xs = 0 … 6 − w` başlangıç `x`'ine
     uzaklığa göre, eşitlikte duvara yakın olan önce; her aday için blok `y = 10 − h`'den açık gökyüzü ile düşürülür
     (saha yerçekimi ayarından bağımsız); iniş konumu tahtaya sığıyorsa (`y + h ≤ 8`) hedef budur.
  3. Hiçbiri olmazsa blok kamyon kuyruğunun **sonuna** girer (K-17, K-26).

  Hedef tek fonksiyondan gelir: `returnTarget(state, pieceId, opts?: { skipStart: boolean })` (adım 1 → 2 → 3); hem
  geri sekme (adım 3) hem cam kırılma dönüşü (adım 2, §5.1 madde 4, S3) onu çağırır.
- **Kırılan cam istisnası (GDD K-17 "İstisnalar", OBSTACLES S3):** kırılan cam blok doğrulamaya girmeden aynı sırayla
  **sahaya** döner. Başlangıcı şantiyede olan kırılan cam blok (yalnız yapışmış harçlı cam olabilir; moloz cam olamaz,
  L-21) **1. adımı atlar** (`skipStart = true`): sürükleme sırasında tahta donuk olduğu için başlangıç hücreleri her
  zaman boştur, ama blok şantiyeye geri konmaz. 2. adımda `xs` başlangıç `x`'ine (6 ya da 7) uzaklığa göre sıralanır,
  yani ilk aday duvara en yakın sütundur (`w = 1`: 5, 4, 3 …; `w = 2`: 4, 3 …); hiçbiri olmazsa 3. adım (kuyruk).
  `skipStart = (glassBroke ∧ başlangıç zone = 'site')`; sahadan başlayan kırılan cam için 1. adım normal çalışır.
- **`stuck` yaşam döngüsü (Y8):** `stuck = true` yalnız Y8 `stick` ile (adım 3) olur. `false` olur: (a) blok
  şantiyeden çıkınca — sürüklemeyle sahaya (K-07 satır 2), Vinç ile sahaya (K-37), cam kırılma dönüşüyle sahaya ya da
  kuyruğa (yukarıdaki istisna); (b) blok doğru yerleşince (`locked = true`: yeniden sürüklenip doğru inmesi, rayla doğru
  yerleşim, Vinç ile şantiyeye doğru konma, Boya Fırçası sonrası kilitlenme K-38); (c) Çekiç bloğu yok edince
  (`zone = 'gone'`). Yapışmış blok şantiyede başka bir plan konumuna yanlış bırakılırsa yeni yerinde yeniden yapışır
  (`stuck` `true` kalır); bir hücresi plan dışındaysa normal geri sekmenin 1. adımı onu başlangıç konumuna ve başlangıç
  durumuna (yapışmış) döndürür. Her değişimde aynı hamlede `wrongOcc` (çıkılan plan satırlarının bitleri silinir, yeni
  yapışmanın bitleri eklenir) ve `buildFront` O(1) güncellenir. **Maliyet** hamle başındaki duruma bakar: Y8
  `moveCost` tabanı 2'yi `MoveScratch.wasStuck`'tan (adım 0'da yazılır; `rotatedAtStep8` gibi hamle içi geçici, tampona
  ve karmaya girmez) okur, çünkü adım 4'e gelindiğinde `stuck` adım 1–2'de kalkmış olabilir (OBSTACLES Y8: yapışmış
  bloğu sahaya sürüklemek 10 → 8; kırılan yapışmış cam 3). Sahaya dönen blok sıradan harçlı (cam) bloktur: sonraki
  bırakmalarda Y8 ve S3 yeniden uygulanır, sonraki hamlesi taban 1 yer.
- Hatalı yerleşim `combo = 0` yapar, `wrongCount++` (analytics `level_end`), hamle yanar (K-17).
- Geri sekme olayı (GDD K-34 kanca 3 `bounce`): `pieceBounced` olayı birincil `reason` ve `missingSupport`'u taşır
  (§6.3); sekme sonrası vurgu bütün zorluklarda.
- Testler: "K-34 rail over empty colored cell is wrong", "K-34 empty dot cells count as filled", "K-34 debris below
  blocks correct placement", "K-34 crane and trowel obey support rule", "K-34 balloon obeys support rule",
  "K-34 verdict reasons keep fixed order", "K-34 example 3 buildFront and missingSupport", "K-33 trowel cells equal
  buildFront", "Y8 sticks only inside plan area", "E-08 …", "E-43 dot cell with stuck mortar breaks support"
  (GDD E-43: (7,1) `.`'ya yapışmış harç, (7,0) doğru dolu → W blok (7,2)'ye iner, `reasons = ['support']`,
  `missingSupport = [(7,1)]`, sütun 7'de `buildFront` yok), "E-43 buildFront returns after stuck mortar is removed",
  "K-34 dot cell with debris is missing support", "K-17 broken stuck glass mortar returns to yard column 5 and
  unsticks" (GDD K-17 örneği: normal eşik 3, harçlı cam `B1` (6,2)'ye yapışmış, (7,8)'de bırakılır, iniş (7,3), d = 5
  → kırılır; (6,2) boş kalır, blok sütun 5'in tepesine düşer, `stuck = false`, `wrongOcc` biti silinir, kalan 10 → 7),
  "Y8 stuck mortar dragged to yard costs 2 and unsticks" (OBSTACLES Y8 örneği, 10 → 8), "Y8 stuck mortar dropped
  wrong in plan restucks at new cell", "K-17 stuck mortar dropped off plan returns to start and stays stuck" (GDD K-17
  örneği: plan yüksekliği 3, `B1` (6,2)'ye yapışmış, (7,8)'de bırakılır, iniş (7,3) plan dışı → (6,2)'ye döner, `stuck`
  `true` kalır, kalan 10 → 8).

**İnşa cephesi (GDD K-34 kanca 1):** `buildFront(state): At[]` — aktif (ve carousel'de öndeki) dilimin her sütunu `c`
için `free = planMask & ~(filled | dotFree)` maskesinin **en alt** biti (`free & −free`); o hücre boş değilse (moloz,
yapışmış harç; yanlış nesneli bir `.` hücresi de `free`'ye girer ve boş değildir) ya da `free = 0` ise o sütunda cephe
yoktur. Tanım gereği altındaki her plan hücresi doğru dolu ya da **boş** `.`'dır (GDD kanca 1: "altında yanlış nesne
varsa yok"); `.` hücresindeki yanlış nesne kalkınca cephe aynı hamlede geri gelir (E-43). Sütun başına O(1); her
`placementCorrect`, `mortarStuck`, yanlış nesne taşınması/kırılması ve dilim değişiminde yeniden hesaplanır, sunum bütün
zorluklarda gösterebilir (yapı sırası bilgisi). **`eligibleTrowelCells(state) ≡ buildFront(state)`** (K-33; tek
fonksiyon, takma ad).

**İlk karşılaşma (kanca 4):** oyuncunun hesabında ilk kez birincil nedeni `support` olan geri sekme ya da harç
yapışması olunca sahne `tut.ctx.support`'u bir kez tetikler — **yalnızca** `seenContextTips.support` henüz işaretli
değilse (metin STORY §6). Bölüm 4 adım 2 aynı satırı öğretici adımı olarak gösterir (`textKey = tut.ctx.support`);
adım ekranda gösterildiği anda `TutorialController` `seenContextTips.support`'u işaretler (GDD §14.1 madde 2, §8.2) ve
bağlamsal tetik bu hesapta bir daha çıkmaz. Test: "K-34 context tip suppressed after level 4 step 2 is shown".

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
  kalmaz ve sonuç seçim sırasına bağlı değildir (N33, N34; GDD E-33, K-20, K-35 adım 6).
- Zincirli ve ıslak bloklar da düşer; düşüş zinciri çözmez, sayacı değiştirmez (N27). Kasa düşmez ve destektir (N25).
- En çok 8 tur × ≤ 40 varlık × ≤ 9 hücre ≈ 3 000 işlem; dış döngü engel sayısıyla sınırlı. Her varlık için tek
  `pieceFell{cause:'yardGravity'}` / `balloonRose` olayı (başlangıç, bitiş, mesafe) aynı adımda yayınlanır.
- Torbalar saha yerçekimi kapalıyken de düşer (S-12 GDD yanıtı); balonlar sahada yalnızca kendi bırakmalarında
  (adım 2) ve Y6 açıkken adım 6'da yükselir. Teslimatla gelen balonlu blok K-25 gereği düşüp oturur, yükselmez; adım 9
  adım 6'dan sonra geldiği için Y6 açıksa **sonraki** hamlenin 6. adımında yükselir, Y6 kapalıysa oyuncu bırakana kadar
  yerinde kalır (GDD E-36).
- Testler: "K-20 …", "N24 …", "N25 …", "N26 …", "N27 …", "N33 balloon and falling block meet without gap", "N34 …",
  "E-33 falling block lands on rising balloon", "E-36 delivered balloon rises next move only with Y6",
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
raporu bu günlükten yeniden oynatılır. Tam imza `applyMove(state, move, sink, opts?: { noTruckHelp?: boolean })`:
`noTruckHelp: true` K-35 adım 12'yi (kilitlenme denetimi + Kamyon Yardımı) hiç çalıştırmaz; yalnız solver, ✓-tuzağı
taraması, usta botunun yerel planlaması ve K-30 güvence simülasyonu kullanır (§9.1, §9.7, §9.8). `GameSession` bu
seçeneği hiç vermez (varsayılan `false`); hamle günlüğüne ve karmaya girmez.

**`addMoves` ve teklif sonrası adım 12 (GDD K-29, E-42):** `source: 'offerCoins' | 'offerAd'` (kabul edilen +5 teklifi)
sayacı 5 yapar (`movesChanged{reason: 'offer'}`); `turn`, zamanlayıcılar ve Usta Serisi değişmez, adım 0–11 çalışmaz.
Ardından çekirdek **K-35 adım 12'yi bir kez** çalıştırır (kilitlenme denetimi + Kamyon Yardımı, §9.7; olaylar
`step: 12` ile `deadlockDetected`, `truckHelp`, D2 teslimatında `pieceFell{cause:'delivery'}` / `deliveryQueued`).
Gerekçe: son hamle bir kilit (ör. D1) üretip sayacı 0 yaptıysa adım 12 o hamlede atlanmıştır; denetim olmazsa oyuncu
+5'i alıp hiçbir bloğa dokunamazdı. Teklif kabulü `actions[]`'a yazıldığı için devam (K-43) aynı adım 12'yi aynı
sonuçla yeniden üretir; Geri Al teklif sonrası zaten kapalıdır (K-39 "arada +5 yok"). `thermos` / `streak` kaynakları
bölüm başında (`start`) uygulanır ve adım 12 çalıştırmaz. Testler: "E-42 offer acceptance runs step 12 once" (D1
durumunda teklif → `unchain`, gerekirse `reshuffle`, güvence; `turn`, zamanlayıcılar, seri aynı), "K-29 accepted offer
sets moves to 5 without advancing timers".

### 6.2 Sıra (her adım bir `step` numarası alır)

Adım numaraları ve sırası **GDD K-35 ile birebir aynıdır** (R-02); aynı adımda birden çok nesne etkilenirse işlem
sırası (y, x) artan taramadır. Test adları "K-35 step N …".

| Adım | İş | Olaylar | Kural |
| --- | --- | --- | --- |
| 0 | Bırakma sınıflandırması (§4.3). İptalse olay yayınla ve **dur** (sayaç, seri, zamanlayıcılar, boya, komşu etkileri değişmez) | `moveCancelled` | K-05, K-07 |
| 1 | Bloğu taşı. `via` varsa (yol bir boya kapısının ray kipinden geçti) bırakma yerinden **bağımsız** olarak `onPassGap` → blok son girilen kapının rengine boyanır; sahaya dönen blok da boyanır (S-21 GDD yanıtı, R-02). G-H zorla bırakması sıradan bırakmadır | `pieceMoved`, `piecePainted` | K-10…K-12, W6 |
| 2 | Şantiyede FREE ise `computeFall` (rüzgâr → düşüş/balon → G-L) + `onLanded` (S3 cam → kırılır, K-17 hedefine döner, **`combo = 0`** (K-33), adım 3 atlanır). Sahada bırakılan balon burada yükselir | `windDrift`, `pieceFell`, `balloonRose`, `steered`, `glassBroke`, `pieceReturned`, `comboChanged` (yalnız cam kırılınca ve `combo` > 0 iken) | K-11, K-19, K-21, K-33, W8, S3, S8 |
| 3 | Şantiyedeyse `isCorrectPlacement` (K-16 + **K-34**) + `onPlacement` (Y8 harç, yalnız plan alanında) | `placementCorrect`, `cellsRevealed`, `comboChanged`, `trowelEarned`, `placementWrong`, `mortarStuck`, `pieceBounced` | K-14, K-16, K-17, K-32, K-33, K-34, Y8 |
| 4 | Maliyet = taban + cam cezası, **toplanır** (GDD K-07): taban 1, hamle **başında** yapışmış harçlı olan blokta 2 (Y8 `moveCost`, `MoveScratch.wasStuck`; `stuck` adım 1–2'de kalkmış olabilir, §5.2); cam kırıldıysa +1 (S3 `LandingEffect.penalty`) → sıradan cam 2, yapışmış harçlı cam 3. Sayaç en az 0; `turn++` | `movesChanged` (`cost` kırılımıyla, §6.3) | K-07, Y8, S3 |
| 5 | Başlangıç hücrelerinin 4-komşuları: `onNeighborMoved` (engel başına hamlede en çok 1). **Komşuluk duvar sınırını aşmaz:** x = 5 ile x = 6 hücreleri duvar yüksekliğinden ve geçitlerden bağımsız olarak hiçbir zaman komşu değildir (GDD §0, E-46); tek `neighbors4(cell)` fonksiyonu aynı bölge (saha / şantiye) dışındaki komşuyu eler, adım 6'nın düşüş komşulukları da onu kullanır. Saklı nesne denetimi #1 (`onCellUncovered`) | `crateDamaged`, `crateBroken`, `bagTorn`, `chainReleased`, `screwCollected`, `keyCollected`, `gapUnlocked` | Y1, Y2, Y3, Y7, W7, K-42, §0 |
| 6 | Saha yerçekimi döngüsü (§5.3: yarım adımlı settle + düşüşlerin komşu etkileri, torba/kasa → yeniden), saklı nesne denetimi #2 | `pieceFell{cause:'yardGravity'}`, `balloonRose`, … | K-20, Y2, Y6, S8, K-42 |
| 7 | Hedef sayaçları | `goalProgress` | K-41 |
| 8 | Aktif/öndeki dilim tamamlandıysa: `segments` → kayma ve sonraki dilim; `carousel` → ön dilim sıradaki tamamlanmamış dilim, `carouselT = 0`. Sıradaki parti yalnızca **kuyruğun sonuna eklenir** (`enqueue(batch)`), burada teslim edilmez | `segmentCompleted`, `siteShifted`, `carouselRotated` | K-22, K-23, K-25 |
| 9 | **Tek teslimat noktası:** kuyruktaki bütün bloklar FIFO sırasıyla birer kez denenir; yerleşemeyen blok sonrakileri bekletmez ve sırasını korur. Aday sol sütunlar: önce bloğun `x`'i, sonra `dropColumns` (listedeki sırayla), sonra kalan bütün geçerli sütunlar `x`'e uzaklıkla (eşitlikte duvara yakın önce); blok `y = 10 − h`'den yerçekimi ayarından bağımsız düşer. Gelen bloğa `arrivedTurn = turn` | `deliveryArrived`, `pieceFell{cause:'delivery'}`, `deliveryQueued` | K-25, K-26, E-03, E-04 |
| 10 | Zamanlayıcılar **tek sabit listeyle** (`STEP10_TIMERS`, §7.3) bu sırayla: Kepenk (W4) → Kayar Kapı (W5; önce `y + dir` aralık dışıysa `dir = −dir`, sonra `y += dir`) → Döner Platform sayacı (S5, `SiteStrategy` carousel; **bu hamlenin 8. adımında ön dilim tamamlanıp dönüş yapıldıysa `t` artmaz**, K-23) → Asansör (S6, `SiteStrategy` asansör eki; önce `e + dir` aralık dışıysa `dir = −dir`, sonra `e += dir`, K-24) → Islak Beton (Y4; `arrivedTurn == turn` olanlar atlanır, E-31) → Açık Kepenk süresi (K-40, çekirdek). Kural `order`'ı (W→Y→S) burada **kullanılmaz** | `gapChanged`, `carouselRotated`, `elevatorMoved`, `wetTick` (bu `seq` sırasıyla) | W4, W5, S5, S6, Y4, K-23, K-24, K-40 |
| 11 | Kazanma (K-28) → değilse hamle bitti mi (K-29) | `levelWon`, `outOfMoves` | K-28, K-29 |
| 12 | Oyun sürüyorsa (kazanılmamış, sayaç > 0) kilitlenme denetimi **D1 → D2 → D3** ve nedene göre Kamyon Yardımı (§9.7). D2 yardım `B1`'leri kuyruğun sonuna eklenir ve **bu adımda bir kez** teslim denenir (K-25 "tek deneme noktası adım 9"un tek yazılı istisnası; yalnız yardım `B1`'leri, `x = 5`, `dropColumns` yok); güvence denetimi en sonda bir kez. Ayrıca kabul edilen +5 teklifinden sonra hamle olmadan bir kez çalışır (§6.1, K-29, E-42) | `deadlockDetected`, `truckHelp`, `pieceFell{cause:'delivery'}`, `deliveryQueued` | K-25, K-29, K-30 |

Sıralamanın gerekçeleri GDD K-35'tedir. Testler: "K-26 older queued pieces deliver first", "E-04 …", "E-34 dropColumns
list does not close the last stage", "S-21 painted piece returned to yard keeps color", "E-39 via last entered paint
gate wins", "E-25 …", "E-31 delivered wet piece keeps counter", "E-27 closed site cancels drop", "K-07 stuck glass
mortar break cost" (yapışmış harçlı cam bloğun yeniden sürüklenip kırılması 3 hamle), "E-46 no neighbor effect across
the wall boundary" (moloz (6,2)'den sahaya: (5,2) kasası ve (5,1) zinciri etkilenmez), "K-23 carousel does not tick on
the completion move", "K-24 start at bound facing out turns first", "W5 slider start at bound facing out turns first",
"E-23 help B1 delivered in step 12 at x = 5", "E-42 offer acceptance runs step 12 once" (§6.1).

### 6.3 Olay birleşimi

```ts
interface EvBase { seq: number; step: number }        // seq: hamle içinde 0,1,2…; step: §6.2 adımı
type At = { zone: 'yard' | 'site'; x: number; y: number; seg?: number }   // GENEL koordinat
type GameEvent = EvBase & (
  | { t: 'moveCancelled'; pieceId: PieceId; reason: 'sameSpot' | 'craneOverYard' | 'straddle' | 'siteClosed' | 'invalid' } // K-07 satır 1/3/4/5
  | { t: 'pieceMoved'; pieceId: PieceId; from: At; to: At; entry: 'yard' | 'overWall' | 'gap'; gap?: number }
  | { t: 'piecePainted'; pieceId: PieceId; from: ColorCode; to: ColorCode; gap: number }
  | { t: 'windDrift'; pieceId: PieceId; dx: -1 | 1 }
  | { t: 'pieceFell'; pieceId: PieceId; from: At; to: At; rows: number; cause: 'release' | 'yardGravity' | 'delivery' | 'bounce' }
      // 'release': adım 2'de her FREE şantiye bırakmasında (balon hariç) tam bir kez, rows ≥ 0 (öğretici `landed`, §8.2)
  | { t: 'balloonRose'; pieceId: PieceId; from: At; to: At; rows: number }          // rows < 0: tavana indi
  | { t: 'steered'; pieceId: PieceId; atRow: number; dx: -1 | 1 }
  | { t: 'glassBroke'; pieceId: PieceId; at: At; penalty: number }
  | { t: 'pieceReturned'; pieceId: PieceId; from: At; to: At | 'queue' }
  | { t: 'placementCorrect'; pieceId: PieceId; cells: At[]; overWall: boolean }
  | { t: 'cellsRevealed'; seg: number; cells: { x: number; y: number; color: ColorCode }[] }
  | { t: 'comboChanged'; combo: number }
  | { t: 'trowelEarned'; trowels: number }
  | { t: 'placementWrong'; pieceId: PieceId; reasons: VerdictReason[]; missingSupport: At[] }   // §5.1 Verdict
  | { t: 'mortarStuck'; pieceId: PieceId; reason: VerdictReason; missingSupport: At[] }
  | { t: 'pieceBounced'; pieceId: PieceId; from: At; to: At | 'queue'; viaDrop: boolean;           // GDD K-34 kanca 3 `bounce`
      reason: VerdictReason; missingSupport: At[] }                                                // reason = birincil neden
  | { t: 'movesChanged'; movesLeft: number; delta: number; reason: 'move' | 'offer' | 'booster';
      cost?: { base: 1 | 2; glass: 0 | 1 } }   // reason 'move': delta = −min(movesLeft, base + glass) (K-07 toplanır; base 2 ⇔ yapışmış harç)
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
      moves?: { pieceId: PieceId; from: At; to: At }[]; delivered?: PieceId[] }   // delivered: D2 yardım B1'leri; adım 12'de
      // yerleşenler ayrıca pieceFell{cause:'delivery'}, kalanlar deliveryQueued (§9.7); deliveryArrived yalnız adım 9 partileri
  | { t: 'boosterApplied'; booster: 'hammer' | 'crane' | 'paint' | 'trowel'; detail: unknown }
  | { t: 'boosterRejected'; booster: 'hammer' | 'crane' | 'paint' | 'trowel'; reason: string }   // harcanmaz
);
```

- Olaylar `EventSink` arayüzüne yazılır: oyun `ArraySink`, solver ve bot `NULL_SINK` kullanır (tahsis yok).
- **Determinizm:** olay listesi (durum, hamle) çiftinin saf fonksiyonudur. `eventLogHash` = olayların kanonik JSON'u
  üzerinde FNV-1a; golden testler bunu karşılaştırır (§12.4).
- **Sahne tarafı (`EventPlayer`):** oynatma sırası = K-35 adımı; adımlar sırayla, aynı adımdaki olaylar paralel oynar
  (adım 6 zincirlemesi `tokens.physics.yardCascadeStaggerMs` kademeli; kazanma/kaybetme en son). Süreler `tokens.duration`
  ve JUICE.md'den gelir. Düşüşler sabit `ms/satır` değil `tokens.physics` ivme + tavan hızıyla hesaplanır (normal
  `physics.fallNormalAccel`/`fallNormalMax`, ağır `fallHighAccel`/`fallHighMax`, hafif sabit `fallLowSpeed`, balon
  `balloonRiseSpeed`, saha zincirlemesi `yardFallAccel`/`yardFallMax`; sayılar yalnızca tokens'ta ve JUICE §0.1'de,
  kod sabit yazmaz), böylece iniş "tok" hissedilir.
  Sahne olayları yalnızca *gösterir*; mantık çekirdekte zaten bitmiştir.
- **Animasyon sırasında girdi (R-12, JUICE kural 3):** olaylar iki sınıftır.
  - *Engelleyici diziler:* dilim kayması (`duration.segment` 600), kamyon teslimatı (`truck` 700), Kamyon Yardımı /
    karıştırma (`reshuffle` 900). Yalnızca bunlar sürerken girdi kilitlidir; ekrana dokunmak kalanı 3× hızlandırır.
    Kamyonun kilidi yalnız kamyonun kendisidir (700 ms, Faz 2 tur 2 #16): boş bir saha sütununa (≈ 9 satır) düşen
    teslimat bloğu kilit bittikten sonra sıradan bir düşüş olarak iner (R-12 hızlı sarmasına açık); sonraki işaretler
    yine son inişi bekler. Böylece her olayın toplam beklemesi ≤ 900 ms (JUICE §0 kural 3).
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
| Altın Mala K-33 | aktif/öndeki dilimde boş, `.` olmayan ve **K-34'ü sağlayan** plan hücresi (`eligibleTrowelCells(state)` = `buildFront(state)`, §5.2; UI yalnızca bu kümeyi parlatır) | hücre doğru renkle dolar, `filled`'e girer, `?` açılır |
| Geri Al K-39 | son eylem bir sürükleme hamlesi; arada güçlendirici/+5 yok; derinlik 1; kayıp penceresi açık değil | `GameSession` hamle öncesi tamponu geri yükler (sayaç, `turn`, seri, mala, teslimat, kuyruk, dilim geçişi, kasa, saklı nesne, hedefler dahil). Aynı hamlenin 12. adımında çalışan Kamyon Yardımı da geri alınır; durum yine kilitliyse yardım sonraki hamle sonunda yeniden çalışır (GDD E-37) |
| Açık Kepenk K-40 | bölümde W4 ya da W7 var (yoksa yuva gri) | bölüm başında `openShutterUntil = 5`: `turn` 0…4 iken W4/W7 `canPassGap` → `true`; 5. hamlenin 10. adımından sonra kendi kurallarına döner. W5/W6 etkilenmez |
| Termos, Mala Başlangıcı K-40 | oyun öncesi | `addMoves{source:'thermos'}` +3; `trowels += 1`; seri bonusuyla toplanır |

**Mini hat** (Çekiç, Vinç, Boya Fırçası, Altın Mala sonrası): K-35 adımları **5 (yalnızca saklı nesne denetimi), 6, 7,
8, 9, 11, 12**. Adım 4 ve 10 çalışmaz (`turn` ve zamanlayıcılar sabit; E-09). Güçlendiricinin hedefe doğrudan etkisi
(`boosterApplied` ve Çekiç'in `crateBroken`/`bagTorn`/`chainReleased`'i, Vinç'in `pieceMoved`'u, boya, mala) `step: 1`
olaylarıdır (K-35 adım 1 "bloğu taşı"nın karşılığı; `EventPlayer` önce oynatır); mini hat olayları kendi adım
numaralarını taşır. Öğretici sayımı bu ayrımı kullanır (§8.2: `step: 1` olayları sayılmaz; tek istisna `obstacleHit`'te
Çekiç'in doğrudan vuruşu, GDD §14.1/3). Testler: "K-36 hammer on chained piece
removes chain only", "K-37 crane cannot pick chained or wet", "K-37 rejected target does not consume booster",
"K-38 paint palette is level plan colors", "K-39 undo depth 1", "E-37 undo also reverts truck help", "E-21 …",
"K-40 open shutter only W4 W7", "E-41 m=0 exit keeps streak bonus", "E-09 …".

---

## 7. Engel eklenti arayüzü

### 7.1 Brifteki arayüzün inceltilmiş hali (Faz 2'de yazılan imzalar)

Değişiklikler: kancalar iki sınıftır. **Tahta kancaları** durumu (`GameState`) alır, çünkü sahne onları hamle dışında da
çağırır (sürükleme önizlemesi `beginDrag`, gölge `computeFall`): `canPick`, `canPassGap`, `modifyFall`, `onLanded`,
`onPlacement`. **Hamle kancaları** çalışan hamlenin `RuleContext`'ini alır (o anki K-35 adımında olay yayını, durumun
RNG'si, hamle karalaması): `onPassGap`, `onYardRelease`, `moveCost`, `onNeighborMoved`, `onCellUncovered`, `onMoveEnd`.
`onLanded` yalnızca düşüşler için kalır, rayla yerleşimi de kapsayan `onPlacement` eklenir (harç rayla da yapışmalı);
sahada gizli öğeler için `onCellUncovered`; hamle maliyeti için `moveCost`. Şantiye modları (S1, S5, S6)
`core/site.ts`'te **strateji**dir (`siteStrategy(lvl)`); kayıt defteri yalnız onların adım 10 tiklerini bağlar. Engel
durumu genel tampon alanlarında tutulur (geçit `open/y/phase`, engel `hp`, parça `flags/counter`) → eklentiler kendi
karma/kopyalama kodunu yazmaz; Zobrist hepsini zaten kapsar. `onLevelStart` yoktur: başlangıç durumu (S4 moloz dahil)
derlemede kurulur (§7.2 S4); bir eklentinin bölüm başı yan etkisi gerekirse Faz 3'te eklenir.

```ts
// src/core/moves.ts
interface RuleContext {
  readonly lvl: CompiledLevel;
  readonly s: GameState;
  emit(e: GameEventBody): void;               // o anki K-35 adımına yazar (seq, step Emitter'dan)
  readonly rng: Rng;                          // durumdaki mulberry32'yi ilerletir (deterministik)
  readonly gravity: GravityProfile;           // K-19 tablosu: holdMs, glassThreshold, steerable (görsel hız tokens'ta)
  readonly scratch: MoveScratch;              // { wasStuck, rotatedAtStep8, affected } — tampona ve karmaya girmez
}
type EntityRef = { kind: 'obstacle'; index: number } | { kind: 'piece'; id: PieceId };
type NeighborEffect = 'none' | 'affected' | 'freed';      // freed: saha hücresi boşaldı → saha yerçekimi yeniden (E-12)
type LandingEffect = { kind: 'none' } | { kind: 'break'; penalty: number };                    // core/gravity.ts
type PlacementOverride = { kind: 'default' } | { kind: 'stick' };                             // core/placement.ts

// src/core/obstacles/types.ts — her engel (W1–W8, Y1–Y8, S1–S8) ve yerçekimi profili (G-H, G-L) ayrı dosyada BİR kural
interface ObstacleRule {
  readonly id: RuleId;                        // 'W1'…'W8', 'Y1'…'Y8', 'S1'…'S8', 'G-H', 'G-L' (S7 = S7-R + S7-M)
  readonly zone: 'wall' | 'yard' | 'site' | 'gravity';   // kimliğin ilk harfinden (ruleZone)
  readonly order: number;                     // kanca sırası (§7.3); benzersiz, bölgenin yüzlüğünde: taban + 1 … taban + 99
  readonly infoKeys: readonly ObstacleInfoKey[];          // OBSTACLES R-08 bilgi kartı: `obs.<id>.desc` (en az 1)
  readonly appliesTo: (lvl: CompiledLevel) => boolean;   // normalde veri imzası: usesMechanic(lvl, id) (K-45/9)
  readonly owns?: { obstacle?: ObstacleType; pieceFlag?: PieceFlag; gapType?: GapType };  // varlık → tek sahip
  // tahta kancaları (durum; sahne de çağırır)
  readonly canPick?: (s: GameState, pieceId: PieceId) => boolean;                         // K-09 (c): Y3, Y4
  readonly canPassGap?: (s: GameState, gap: number, pieceId: PieceId) => boolean;         // RAIL koşul 4: W4, W7, K-40
  readonly modifyFall?: (s: GameState, pieceId: PieceId, plan: FallPlan) => FallPlan;    // adım 2: W8, S8
  readonly onLanded?: (s: GameState, pieceId: PieceId, fall: Omit<FallResult, 'effect'>) => LandingEffect;  // S3
  readonly onPlacement?: (s: GameState, pieceId: PieceId, cells: readonly BoardCell[],
                          verdict: Verdict) => PlacementOverride;                         // adım 3, yalnız hatalı: Y8
  // hamle kancaları (RuleContext)
  readonly onPassGap?: (ctx: RuleContext, gap: number, pieceId: PieceId) => void;         // adım 1: W6 (`move.via`)
  readonly onYardRelease?: (ctx: RuleContext, pieceId: PieceId) => void;                   // adım 2: S8 sahada yükselir
  readonly moveCost?: (ctx: RuleContext, pieceId: PieceId) => number | undefined;          // adım 4 TABAN: Y8 → 2
  readonly onNeighborMoved?: (ctx: RuleContext, entity: EntityRef, movedPieceId: PieceId) => NeighborEffect; // 5–6
  readonly onCellUncovered?: (ctx: RuleContext, obstacle: number) => void;                 // 5–6 (K-42): Y7, W7 anahtar
  readonly onMoveEnd?: (ctx: RuleContext) => void;                                         // adım 10 zamanlayıcısı
  readonly moveEndOrder?: number;             // onMoveEnd varsa zorunlu: STEP10_TIMERS sırası (§7.3), `order`'dan bağımsız
}
function defineRule(rule: ObstacleRule): ObstacleRule;   // dondurur (infoKeys, owns dahil); her eklenti dosyası bununla

// src/core/site.ts — S1 segments, S5 carousel, S6 asansör ofseti
interface SiteStrategy {
  readonly mode: 'segments' | 'carousel';
  activeSegment(s: GameState): number;        // görünen dilim: aktif (segments) / ön (carousel)
  frameOffset(s: GameState): number;          // asansör e (K-24); yoksa 0
  completeIfDone(s: GameState): SegmentCompletion | null;   // adım 8: görünen dilim tamamsa tamamlar (K-15, K-22)
  carouselTick(s: GameState): number | null;  // adım 10, S5 (K-23): döndüyse yeni ön dilim
  elevatorTick(s: GameState): number;         // adım 10, S6 (K-24): (1) e + dir ∉ [a, b] ise dir = −dir; (2) e += dir
}
```

Maliyet: `moveCost` tabandır (yoksa 1; birden çok kural dönerse en büyüğü); cam cezası `onLanded` `penalty`'sinden gelir
ve adım 4'te tabana eklenir (K-07). S5 tikinin "adım 8'de döndü" bilgisi hamle içi geçici bir bayraktır
(`MoveScratch.rotatedAtStep8`, `applyMove` başında `false`); durum tamponuna ve Zobrist karmasına girmez, çünkü hamle
bitince anlamı kalmaz; bayrak doğruysa S5 tiki `t`'yi artırmaz (K-23). Mini hat (§6.4) adım 10'u çalıştırmadığı için
bayrağa bakılmaz (E-09). Asansör ve kayar kapı (W5) aynı iki aşamalı ping-pong fonksiyonunu (`pingPong(pos, dir, a, b)`)
kullanır; başlangıçta sınırda dışarı bakan `dir` geçerli veridir, konum hiçbir zaman aralık dışına çıkmaz (GDD K-24,
OBSTACLES W5/S6).

**Kayıt defteri (`src/core/obstacles/registry.ts`):**
- `ALL_RULES: readonly ObstacleRule[]` — her eklenti bir satır (Faz 2: `W1_staticGap`, `S1_slidingSite`,
  `S2_planVoid`). Modül yüklenirken `assertValidRules(ALL_RULES)` → `validateRules` sözleşmeyi denetler: bilinmeyen ya da
  yinelenen kimlik, `zone` ≠ kimlik harfi, `order` bölge aralığı dışında ya da başka kuralla aynı, bilgi kartı yok ya da
  `obs.<id>.desc` biçiminde değil, `onMoveEnd` var ama `moveEndOrder` yok / `STEP10_TIMERS` sırasından farklı / kimliğin
  kural zamanlayıcısı yok (S5, S6 site tikleridir), `moveEndOrder` var ama `onMoveEnd` yok, bir varlığın iki sahibi,
  `canPassGap` / `onPassGap` `owns.gapType`'sız, `onNeighborMoved` `owns.obstacle` / `pieceFlag`'sız, `onCellUncovered`
  `owns.obstacle`'sız → açılışta hata (yanlış tablo oyuna hiç girmez).
- `ruleSet(lvl, opts)`: `appliesTo` doğru, kapatılmamış kurallar `order` sırasıyla + `ruleByObstacleType`,
  `ruleByPieceFlag`, `ruleByGapType` sahip tabloları. `activeRuleIds(lvl)` bunların kimlikleri.
- `infoKeysFor(lvl, opts): ObstacleInfoKey[]` — bölümün **gerçekten kullandığı** mekaniklerin bilgi kartı anahtarları,
  kural sırasıyla (OBSTACLES R-08; sahne ilk karşılaşmada ve dokununca gösterir; S7 yalnız kullanılan S7-R / S7-M).
- `levelHooks(lvl, opts): MoveHooks` — etkin kuralların kancalarını hattın tek `MoveHooks` nesnesine birleştirir ve
  `CompiledLevel` başına önbelleğe alır (`WeakMap`); `opts.disabled` (debug paneli `disabledRules`, yalnız geliştirme) ya
  da `opts.rules` (testler; önce doğrulanır) verilirse her çağrıda yeniden kurar. Birleştirme: `canPick` hepsi izin
  vermeli · `canPassGap` / `onPassGap` geçidin türünün sahibine gider (sahibin `canPassGap`'i yoksa geçidin `open`
  alanı) · `modifyFall` zincirlenir · `onLanded` ilk `none` olmayan etki · `onPlacement` ilk `default` olmayan · 
  `onYardRelease` hepsi · `moveCost` tanımlı en büyük · `onNeighborMoved` engel → türünün sahibi, blok → bayraklarının
  sahipleri (en güçlü etki: `freed` > `affected` > `none`) · `onCellUncovered` gizli öğe türünün sahibi. Hiçbir etkin
  kuralın sağlamadığı kanca `undefined` kalır: Faz 2 bölümleri (W1, S1, S2 çekirdek modelleri) boş kancalarla oynar.
- **Adım 10 bağlama:** `levelHooks` `timers` kaydını kurar: `onMoveEnd`'i olan kuralın kimliği → o fonksiyon (W4, W5,
  Y4), `lvl.step10`'daki S5 / S6 → `siteStrategy(lvl).carouselTick` / `elevatorTick`'i saran tik (S5 tiki
  `scratch.rotatedAtStep8` iken çalışmaz; `carouselRotated` / `elevatorMoved` yayar). Hat (`applyMove` adım 10,
  `runTimers`) **`order`'a bakmaz**: `for (const t of lvl.step10) hooks.timers[t.id](ctx)` — `lvl.step10` derlemenin
  kurduğu `STEP10_TIMERS` alt kümesidir (§7.3). Bölümde etkin olup kancası bağlanmamış zamanlayıcı hata atar
  (Faz 3 engelleri ve K-40 süre bitişi eklenene kadar; Faz 2 bölümlerinde `lvl.step10` boştur).
- Kullanım: `applyMove` varsayılan olarak `levelHooks(state.lvl)` kullanır (`ApplyOptions.hooks` ile değiştirilebilir;
  `NO_HOOKS` çıplak çekirdek); sahne aynı nesnenin `drag` alanını `beginDrag`'e, `fall` alanını `computeFall`'a (gölge)
  verir → önizleme ve hamle aynı kuralları çalıştırır (kural ikizi yok).

**Çekirdekte engel kimliğine göre `if/switch` yoktur**; yeni engel = yeni dosya + `ALL_RULES`'a bir satır (+ zamanlı
engelse `STEP10_TIMERS`'taki yeri). Testler: `tests/obstacles/registry.test.ts` (doğrulayıcının her hata sınıfı,
birleştirme kuralları, önbellek, `infoKeysFor`, adım 10 sırası), `W1_staticGap` / `S1_slidingSite` / `S2_planVoid`
testleri.

### 7.2 Engel → kanca eşlemesi

| Kimlik | Kanca(lar) | Durum alanı | Not |
| --- | --- | --- | --- |
| W1 Sabit Geçit | (çekirdek RAIL modeli) | — | K-12; eklenti yalnızca `appliesTo`, `owns.gapType: 'static'` ve bilgi kartı `obs.w1.desc` |
| W2 Yüksek Duvar | (çekirdek: `wall.height = 8`) | — | Vinç Alanı K-05 ile aşılır |
| W3 Dar Geçit | (çekirdek: `size = 1` → K-12 hizalama kuralı) | — | ayrı kanca gerekmez; doğrulayıcıdaki sayımı §8.3 L-22 (R-21) |
| W4 Kepenk | `canPassGap` (K-40 `openShutterUntil` dahil), `onMoveEnd` (`moveEndOrder` 1) | geçit `open`, `phase` | açık ⇔ `floor((turn + phase) / period)` çift; kapanış hamle sonunda; o anda geçitte blok olamaz (E-05, E-06) |
| W5 Kayar Kapı | `onMoveEnd` (`moveEndOrder` 2) | geçit `y`, yön | `range` içinde ping-pong: önce `y + dir` aralık dışıysa `dir = −dir`, sonra `y += dir` (`pingPong`, §7.1; OBSTACLES W5) |
| W6 Boya Kapısı | `onPassGap` (adım 1, `move.via`) | parça `color` | yol kapının ray kipinden geçtiyse bırakma yerinden bağımsız boyar; son girilen kapı geçerli (S-21 GDD, §4.2) |
| W7 Kilitli Geçit | `canPassGap` (K-40 dahil), `onCellUncovered` | geçit `open`; gizli öğe toplandı | anahtar `keyId` eşleşmesi; açılış aynı hamlede, ilk kullanım sonraki hamlede (E-10) |
| W8 Rüzgâr Fanı | `modifyFall` | — | 1 genişlik, `fan.dir`; `d ≥ 1` koşulu (E-17) |
| Y1 Ahşap Kasa | `onNeighborMoved` | engel `hp` | hücre kaplar, statik; `clear` hedefi |
| Y2 Çimento Torbası | `onNeighborMoved`; düşüş çekirdek yerçekiminde (`gravityBound` bayrağı) | engel canlı | sürüklenemez |
| Y3 Zincir | `canPick`, `onNeighborMoved` | parça `flags.chained` | `clear: chain` hedefi |
| Y4 Islak Beton | `canPick`, `onMoveEnd` (`moveEndOrder` 5) | parça `counter`, `arrivedTurn` | o hamlede gelen blok azalmaz (E-31) |
| Y5 Ağır Malzeme | (çekirdek: `heavy` → `ix + w ≤ 6`) | — | şekilden türetilir (§3.2) |
| Y6 Saha Yerçekimi | (çekirdek `settleYard`, `gravity.yard`) | — | eklenti yalnızca öğretici bayrağı |
| Y7 Altın Vida | `onCellUncovered` | gizli öğe | `collect` hedefi |
| Y8 Harçlı Blok | `onPlacement`, `moveCost` | parça `flags.stuck` | yalnızca bütün hücreleri plan alanındaysa yapışır (E-08); yapışmış bloğun hamlesinde taban 2 (cam cezasıyla toplanır, K-07; hamle başındaki durum `MoveScratch.wasStuck`); `stuck` şantiyeden çıkınca ya da doğru yerleşince kalkar (yaşam döngüsü §5.2); `.` hücresindeyken o hücre K-34'te dolu sayılmaz (`wrongOcc`, §5.2, E-43) |
| S1 Kayan Şantiye | `SiteStrategy` (segments) | `activeSeg` | K-22 |
| S2 Plan Boşluğu | (çekirdek doğrulama: `.` hücresi) | — | K-15, K-17 |
| S3 Cam Blok | `onLanded` (`break{penalty: 1}` → çekirdek K-17 dönüşü `returnTarget(…, { skipStart })` + `combo = 0` + `comboChanged`; adım 4'te tabana +1: sıradan cam 2, yapışmış harçlı cam 3) | parça `flags.glass` | eşik `ctx.gravity.glassThreshold`; cam kırılması Usta Serisi'ni sıfırlar (GDD K-33, OBSTACLES S3). Başlangıcı şantiyede olan (yapışmış harçlı) cam 1. adımı atlar, 2. adımla sahaya döner, `stuck = false` (§5.2 "Kırılan cam istisnası"). Testler: "S3 glass break resets combo (K-33)", "K-17 broken stuck glass mortar returns to yard column 5 and unsticks" |
| S4 Moloz | kanca yok: moloz derlemede başlangıç durumuna şantiyede girer (`build.debris`, köken `debris`, `startZone` site); `clear: debris` sayacı `goals.ts`'de: moloz şantiyeden çıkınca (sahaya taşındı ya da Çekiç) +1 | parça `flags.debris` | sürüklenebilir (1 hamle; FREE ile yukarı ya da RAIL ile geçitten) |
| S5 Döner Platform | `SiteStrategy` (carousel), `onCarouselTick` (adım 10 sıra 3) | `frontSeg`, `carouselT` | K-23; ön dilimin tamamlandığı hamlede `t` artmaz |
| S6 Asansör İskele | `SiteStrategy.frameOffset`, `onElevatorTick` (adım 10 sıra 4) | `elev`, `elevDir` | K-24; önce yön, sonra adım (`pingPong`) |
| S7 Gizli Plan | derleme zamanı `resolveHidden` + `onPlacement` (açılma) | açılan maske | K-32 |
| S8 Balonlu Blok | `modifyFall` (`dir = +1`; şantiye tavanı plan tepesi), `onYardRelease` (sahada bırakılan balon yükselir, adım 2) + saha yerçekiminde yükselme yarısı | parça `flags.balloon` | §5.1, §5.3 |
| G-H Ağır yerçekimi | profil (`glassThreshold = 2`, `holdMs = 700`, erişilebilirlikte 1400); tutma sayacı **sahnede** (§4.7) | — | solver yok sayar |
| G-L Hafif yerçekimi | profil (`glassThreshold = 4`, `steerable`); `computeFall` `steer` | — | girdi §4.7, düşüş §5.1 |

### 7.3 Kanca sırası

`order`: W (100'ler) → Y (200'ler) → S (300'ler) → G (400'ler); aynı kanca içinde örn. `modifyFall`'da W8 (108) S8'den
(308) önce çalışır: balonlu tek genişlikli blok önce rüzgârla kayar, sonra yükselir.

**Adım 10 istisnası (GDD K-35 adım 10, OBSTACLES N8 [kural]):** `order` W → Y → S olduğu için Islak Beton (Y4) Döner
Platform (S5) ve Asansör'den (S6) önce çalışırdı; bu GDD sırasına aykırıdır. Bu yüzden `onMoveEnd` kendi
`moveEndOrder` alanını kullanır ve `compile` tek bir liste kurar:

```ts
// src/core/level/compile.ts — sıra tablosu (veri) ve bölümün etkin alt kümesi (sıra korunur)
const STEP10_TIMERS = [
  { id: 'W4', order: 1 },   // kepenk
  { id: 'W5', order: 2 },   // kayar kapı
  { id: 'S5', order: 3 },   // döner platform sayacı (K-23)
  { id: 'S6', order: 4 },   // asansör (K-24)
  { id: 'Y4', order: 5 },   // ıslak beton (E-31)
  { id: 'K-40', order: 6 }, // Açık Kepenk süresi
];
lvl.step10 = STEP10_TIMERS.filter((t) => active[t.id]);
// active: W4 kepenk geçidi · W5 kayar kapı · S5 mode 'carousel' · S6 build.elevator · Y4 'wet' bayraklı blok ·
//         K-40 kepenk ya da kilitli geçit
// src/core/obstacles/registry.ts — levelHooks kimliğe bağlar (§7.1 "Adım 10 bağlama")
timers = { W4: rule.onMoveEnd, W5: rule.onMoveEnd, Y4: rule.onMoveEnd, S5: siteTick, S6: siteTick, 'K-40': … };
// src/core/moves.ts adım 10 (runTimers) — yalnız lvl.step10 sırası; bağlanmamış etkin zamanlayıcı → hata
for (const t of ctx.lvl.step10) hooks.timers[t.id](ctx);
```

Aynı türden birden çok nesne (ör. iki kepenk) kendi girdisi içinde (y, x) / geçit indeksi sırasıyla işlenir. Yeni bir
zamanlı engel eklenirse `moveEndOrder`'ı GDD K-35 adım 10'daki yerine göre verilir; `moveEndOrder`'sız ya da
`STEP10_TIMERS` sırasından farklı `moveEndOrder`'lı `onMoveEnd` kayıt defteri yüklenirken hatadır (`validateRules`). Testler: "K-35 step 10 timer order" (W4, W5, S5, S6, Y4 aynı bölümde: olayların `seq` sırası
`gapChanged(W4) < gapChanged(W5) < carouselRotated < elevatorMoved < wetTick`), "N8 timers advance in step-10 order",
"K-35 step 10 order is independent of rule order field". Etkileşim matrisi (OBSTACLES.md,
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

### 8.2 Şema (scratchpad'de zod 4.6.5 ile çalıştırıldı; brifteki Bölüm 4 örneği — `tutorial` alanı çıkarılarak (brifin `highlight: string` biçimi GDD §14'le genişletildi), yalnızca şema düzeyinde; L-22 R-21 sonrası boy 1 geçidi reddeder — ve LEVELS Bölüm 1–10 `tutorial[]` verisi (Bölüm 7 `done.at` dahil) + UX Bölüm 17 `debris:0` vurgusu geçti, 2026-10-05 tur 2; son tutarlılık turu 2: GDD §14.1/3 kapalı sözlüğünün 16 olayı + süzgeçler + `startOn` ile LEVELS §3 11–38 `done` eşlemesinin 30 adımı (Bölüm 35 `startOn` dahil) ve LEVELS §2'nin 22 adımı geçti, 15 olumsuz örnek reddedildi; son tutarlılık turu 3 (2026-10-06): belgedeki kod bloğu ve iki tablo betikle okunarak yeniden çalıştırıldı — 52/52 geçti, 15/15 reddedildi; önceki "35 adım" sayısı yanlıştı)

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
  wetMoves: z.optional(Int(1, 5)),                             // OBSTACLES Y4; `wet` ⇔ `wetMoves` (L-26)
});
const DebrisPlacement = z.strictObject({                       // moloz: bayrak yok (K-21), dilime ait (K-45/7, P-5)
  shape: ShapeId, color: Color, x: Int(6, 7), y: Int(0, 7), segment: z.optional(Int(0, 4)),   // varsayılan 0
});
const Dir = z.union([z.literal(1), z.literal(-1)]);             // GDD §14 biçimi (asansör ve kayar kapı aynı)
const GapBase = { y: Int(0, 7), size: Int(1, 7) };
const Gap = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('static'), ...GapBase }),
  z.strictObject({ type: z.literal('shutter'), ...GapBase, period: Int(1, 4),
    phase: z._default(Int(0, 7), 0) }),                         // varsayılan 0 = açık başlar (GDD S-24); < 2·period (L-09)
  z.strictObject({ type: z.literal('slider'), ...GapBase, range: z.tuple([Int(0, 7), Int(0, 7)]),
    dir: z._default(Dir, 1) }),                                 // varsayılan 1 (GDD §14, OBSTACLES W5)
  z.strictObject({ type: z.literal('paint'), ...GapBase, color: Color }),
  z.strictObject({ type: z.literal('locked'), ...GapBase, keyId: z.string().check(z.minLength(1)) }),
]);
const HiddenRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('repeat'), period: Int(1, 4) }),
  z.strictObject({ kind: z.literal('mirrorOf'), segment: Int(0, 4) }),
]);
// UX_FLOWS §13.1 vurgu sözlüğünün tamamı (GDD §14 tutorial satırı bağlar); varlık denetimi L-17
const Highlight = z.string().check(z.regex(new RegExp('^(' + [
  'piece:(\\d{1,2}|k[1-9]_\\d{1,2})',                         // parti-0 sırası | k<parti>_<indeks> (0 tabanlı)
  'cell:[0-7],[0-9]', 'gap:[0-2]', 'obstacle:\\d{1,2}',
  'debris:\\d{1,2}',                                          // build.debris[] dizi sırası (0 tabanlı; UX §13.1)
  'booster:(hammer|crane|brush|undo)', 'pre:(thermos|trowel|shutter)',
  'wall', 'crane', 'build', 'front', 'panorama', 'goals', 'moves', 'truck', 'streak', 'fan',
].join('|') + ')$')));
// GDD §14.1/3 KAPALI `done` sözlüğü (16 olay) — kaynakları §8.2 "Tamam olayları" tablosu. Her olay ayrı birleşim
// üyesidir; süzgeç ve parametreler (`type`, `flag`, `wind`, `hidden`, `painted`, `at`, `minMs`) yalnız GDD'nin izin
// verdiği olayda yazılabilir (strictObject → başka olayda `schema_invalid`).
const Count = z.optional(Int(1, 9));                              // varsayılan 1
const AtCell = z.optional(z.tuple([Int(0, 7), Int(0, 7)]));      // çapa (genel koordinat); bölge denetimi L-17
const FlagFilter = z.optional(z.enum(['glass', 'balloon', 'mortar']));
const Yes = z.optional(z.literal(true));
const TutCond = z.discriminatedUnion('event', [
  // sürükleme sinyalleri
  z.strictObject({ event: z.literal('overWall'), count: Count }),
  z.strictObject({ event: z.literal('gapPass'), count: Count }),
  z.strictObject({ event: z.literal('holdOverBuild'), count: Count, minMs: Int(100, 5000) }), // Bölüm 2: minMs 500
  // hamle sonu olayları (K-35)
  z.strictObject({ event: z.literal('turnEnd'), count: Count }),
  z.strictObject({ event: z.literal('placementCorrect'), count: Count, at: AtCell, hidden: Yes }),
  z.strictObject({ event: z.literal('yardMove'), count: Count, at: AtCell, painted: Yes }),
  z.strictObject({ event: z.literal('landed'), count: Count, flag: FlagFilter, wind: Yes }),
  z.strictObject({ event: z.literal('steered'), count: Count }),
  z.strictObject({ event: z.literal('obstacleHit'), count: Count, type: z.enum(['crate', 'cement_bag', 'chain']) }),
  z.strictObject({ event: z.literal('itemCollected'), count: Count, type: z.enum(['screw', 'key']) }),
  z.strictObject({ event: z.literal('yardFall'), count: Count }),
  z.strictObject({ event: z.literal('segmentDone'), count: Count }),
  z.strictObject({ event: z.literal('deliveryDone'), count: Count, flag: FlagFilter }),
  z.strictObject({ event: z.literal('carouselTurn'), count: Count }),
  // diğer
  z.strictObject({ event: z.literal('tap'), count: Count }),
  z.strictObject({ event: z.literal('boosterUsed'), count: Count }),
]);
const TutDone = z.union([TutCond, z.strictObject({ timeoutMs: Int(500, 10000) })]);
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
  moves: Int(1, 99), teaches: z.optional(z.enum(MECHANIC_IDS)),   // MECHANIC_IDS = OBSTACLES "Veri imzası" 27 kimlik (S7-R, S7-M ayrı)
  seed: z.optional(z.int()),                                     // K-45/1: yoksa compile `id × 1000 + id` (ör. 4004)
  goals: z.array(Goal).check(z.minLength(1), z.maxLength(3)),
  gravity: z.strictObject({ build: z.enum(['low', 'normal', 'high']), yard: z.boolean() }),
  wall: z.strictObject({
    height: Int(0, 8), gaps: z.array(Gap).check(z.maxLength(3)),
    fan: z.optional(z.strictObject({ dir: z.enum(['left', 'right']) })),
  }),
  build: z.strictObject({
    mode: z.enum(['segments', 'carousel']),                        // ⚠ brifteki 'elevator' ayrı alana taşındı (P-6, S-16)
    carouselEvery: z.optional(Int(2, 6)),                          // K-23; mode 'carousel' ⇔ var (L-25)
    elevator: z.optional(z.strictObject({                          // K-24: 0 ≤ a < b ≤ 3, a ≤ start ≤ b (L-24)
      range: z.tuple([Int(0, 3), Int(0, 3)]), start: Int(0, 3), dir: Dir,   // GDD §14: start ve dir zorunlu
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
    textKey: z.string().check(z.regex(/^tut\.(l\d{1,2}|ctx)\.[a-z0-9_]+(\.[a-z0-9_]+)?$/)), // tut.l{n}.{konu} | tut.ctx.{konu} (LEVELS §0)
    startOn: z.optional(TutCond),                               // GDD §14.1/5: `done` biçimi, `timeoutMs` olamaz
    done: TutDone,
  }))),
});
export type LevelData = z.infer<typeof LevelSchema>;
```

`piece:<i>` = parti 0'daki dizi sırası (LEVELS tablosundaki satır sırası JSON sırasıdır; partilerde `k<parti>_<i>`,
0 tabanlı). **Vurgu sözlüğü** UX_FLOWS §13.1'in tamamıdır (GDD §14 bağlar): `piece:<i>`, `piece:k<p>_<i>`, `cell:x,y`,
`gap:<i>`, `obstacle:<i>` (`obstacles[]` sırası), `debris:<i>` (`build.debris[]` sırası, 0 tabanlı; moloz
`obstacles[]`'ta değildir — UX Bölüm 17 `debris:0`), `booster:<hammer|crane|brush|undo>`, `pre:<thermos|trowel|shutter>`,
`wall`, `crane`, `build`, `front` (inşa cephesi = `buildFront`, §5.2), `panorama`, `goals`, `moves`, `truck`, `streak`,
`fan`. UX bu listeye öğe eklerse regex ve L-17 aynı turda güncellenir. `textKey` hem `tut.l{n}.{konu}` hem
`tut.ctx.{konu}` kabul eder (GDD §14.1 madde 1, LEVELS §0; Bölüm 4 adım 2 `tut.ctx.support`).
**`done` sözlüğü GDD §14.1 madde 3'e eşittir ve kapalıdır** (16 olay; GDD'ye yeni bir tamam koşulu eklenirse bu
birleşime bir üye + aşağıdaki tabloya bir satır aynı turda eklenir; GDD'de olmayan değer `schema_invalid`'dir).
Parametre ve süzgeçler olay başına ayrı birleşim üyesiyle zorlanır (başka olayda yazılırsa `schema_invalid`):
`at: [x, y]` yalnız `placementCorrect` ve `yardMove`'da — olay yalnızca bloğun **çapası** bu genel koordinata
yerleşince sayılır (ör. LEVELS Bölüm 7 adım 1 `{ event: 'yardMove', count: 1, at: [0, 6] }`); `minMs` yalnız (ve
zorunlu) `holdOverBuild`'de; `type` zorunlu — `obstacleHit` için `crate | cement_bag | chain`, `itemCollected` için
`screw | key`; `flag` (`glass | balloon | mortar`) yalnız `landed` ve `deliveryDone`'da; `wind: true` yalnız `landed`'da;
`hidden: true` yalnız `placementCorrect`'te; `painted: true` yalnız `yardMove`'da. **`startOn`** (GDD §14.1 madde 5)
aynı `TutCond` birleşimidir (olay + süzgeçler + `count`), `timeoutMs` olamaz (birleşimde yok).

**Tamam olayları (`done.event`)** — her olayın sayıldığı kaynak (`TutorialController`, `scenes/level/`; sayaç adım
başlayınca 0'lanır, adım başlamadan önceki olaylar sayılmaz; hamle sonu olaylarında adım geçişi `EventPlayer` o olayın
oynatmasını bitirince görünür). GDD §14.1 madde 3'ün üç sınıfı birebir uygulanır. **Hamle sonu olayları** hamlenin
`GameEvent` listesinden (`ArraySink`) hamle bitince okunur; her biri **hamle başına en çok 1** sayılır — hamle = bir
sürükleme hamlesi ya da bir güçlendirici kullanımı (mini hat ve Çekiç vuruşu dahil; GDD §14.1/3) — (aynı hamlede
eşleşen birden çok çekirdek olayı — iki kasa, üç düşen blok — tek sayımdır; GDD'nin "en az bir" tanımları) ve
yalnız tabloda yazılan `step` numaralı çekirdek olaylarından gelir; süzgeç yazılmışsa yalnız süzgeci tutan hamle
sayılır. Güçlendiricinin hedefe **doğrudan** etkisi (Çekiç'in kırdığı kasa/torba/zincir, Vinç taşıması, boya, mala;
§6.4) `step: 1` olaylarıdır ve hamle sonu olaylarına girmez; **tek istisna** `obstacleHit`: Çekiç'in doğrudan vuruşu
(K-36; aynı kullanımda `boosterApplied{hammer}` ile gelen `step: 1` `crateDamaged` / `crateBroken` / `bagTorn` /
`chainReleased`) sayılır (GDD §14.1/3; ör. Bölüm 11 adım 1'de kasa Çekiç'le kırılırsa adım biter). Mini hattın kendi
adımları (5, 6, 8, 9) girer.

| `event` | Sınıf | Kaynak | Sayılan |
| --- | --- | --- | --- |
| `overWall` | sürükleme sinyali | sahne sinyali `dragCrossedWall` (`DragSession`) | tutulan bloğun bir hücresi FREE kipte duvar sınırını **ilk kez** geçtiği an: görünümün izlediği yolda (`pathTo` ara düğümleri dahil) FREE → FREE kenarı sınırın şantiye tarafındaki hücre sayısını değiştirdiğinde; sürükleme başına en çok 1. Bırakma beklenmez; sürükleme sonra iptal edilse de (K-07 satır 1/3/4) sayılmış kalır. Hamle sonu kaydındaki `pieceMoved{entry: 'overWall'}` ile **karıştırılmaz** (o YAO/analytics içindir). LEVELS Bölüm 1 adım 2 bu yüzden `a` havadayken başlar |
| `gapPass` | sürükleme sinyali | sahne sinyali `dragEnteredRail` (`DragSession`) | izlenen yol ilk kez bir `RAIL(g)` düğümüne girdiği an (K-12), yani yolun ilk FREE → `RAIL(g)` kenarı (ray kipinde başlayan molozun başlangıç `RAIL(g)` düğümü "girilmiş" sayılmaz, §4.1 madde 3; aynı moloz sahaya çıkıp FREE kipten yeniden bir geçide girerse o kenar sayılır, GDD §14.1/3 K-12 moloz örneği); sürükleme başına en çok 1; iptal edilse de sayılmış kalır. `pieceMoved{entry: 'gap'}` ile karıştırılmaz |
| `holdOverBuild` | sürükleme sinyali | sahne sinyali (`DragController`) | FREE düğümün en az bir hücresi şantiye sütunundayken kesintisiz `minMs` geçti (sahne saati; şantiye sütunlarından çıkınca sıfırlanır, G-H sayacıyla aynı ölçüm) |
| `turnEnd` | hamle sonu (adım 11) | çekirdek `movesChanged{reason: 'move'}` (adım 4; yalnız iptal olmayan sürükleme hamlesi yayınlar, iptal adım 0'da durur) | sürükleme hamlesi adım 11'e ulaştı — saha ya da şantiye, kazanan/kaybeden hamle dahil; güçlendirici, +5 ve iptal sayılmaz |
| `placementCorrect` | hamle sonu (K-35 adım 3) | çekirdek `placementCorrect` (`step` 3) | sürükleme hamlesiyle doğru yerleşim (Vinç/Mala sayılmaz; moloz hiçbir zaman üretmez, K-16 koşul 2); `at` varsa yalnız çapa `at` ise. **`hidden: true`:** aynı hamlenin adım 3 `cellsRevealed` olayı boş değil (K-32: yalnız doğru dolan `?` açılır, yani yerleşen hücrelerden en az biri açılmamış `?` idi) |
| `yardMove` | hamle sonu (K-07 satır 2) | çekirdek `pieceMoved` ile `to.zone = 'yard'` (`step` 1; sürükleme hamlesi; `entry`'den bağımsız) | sahaya yerleşim — saha içi taşıma **ve** şantiyeden sahaya taşınan moloz (S4; GDD §14.1/4, UX Bölüm 17 `debris:0`); `at` varsa yalnız `to` çapası `at` ise. **`painted: true`:** hamlenin `drag.via`'sı dolu, yani W6 `onPassGap` adım 1'de bloğu boyadı (`piecePainted`; bırakma yerinden bağımsız, S-21) |
| `landed` | hamle sonu (adım 2) | çekirdek `pieceFell{cause: 'release'}` ya da `to.zone = 'site'` olan `balloonRose` (`step` 2), aynı hamlede `glassBroke` **yok** | FREE kipte şantiyeye bırakılan (K-07 satır 6) blok kırılmadan durdu: iniş ya da balon yükselişi, doğru ya da hatalı (geri sekme, harç yapışması dahil); ray yerleşimi (satır 7) ve sahada yükselen balon sayılmaz. Çekirdek satır 6 bırakmasında mesafe 0 olsa da tek bir `pieceFell{cause: 'release'}` (`rows ≥ 0`) ya da `balloonRose` yayınlar. **`flag`:** bloğun `flags`'inde; **`wind: true`:** aynı hamlede o blok için `windDrift` (W8) |
| `steered` | hamle sonu (adım 2) | çekirdek `steered` (`step` 2) | G-L yönlendirmesi uygulandı (K-19; hak harcandı — etkisiz girdi olay üretmez) |
| `obstacleHit` | hamle sonu (adım 5–6) ya da Çekiç vuruşu (`step` 1) | `step` 5 ya da 6 olan `crateDamaged` / `crateBroken` (`type: crate`), `bagTorn` (`cement_bag`), `chainReleased` (`chain`); ayrıca Çekiç kullanımındaki `step` 1 olan aynı olaylar (Vinç, boya, mala `step` 1 olayları sayılmaz) | komşu etkisi (adım 5), saha düşüşlerinin komşu etkisi (adım 6, §5.3) ya da Çekiç'in doğrudan vuruşu (K-36): kasa kat kaybetti ya da yok oldu / torba yırtıldı / zincir kalktı; `type` zorunlu |
| `itemCollected` | hamle sonu (adım 5–6) | `step` 5 ya da 6 olan `screwCollected` (`type: screw`) / `keyCollected` (`type: key`) | saklı nesne denetimi #1 / #2 (K-42); anahtarın açtığı kilit aynı denetimde `gapUnlocked` (LEVELS Bölüm 26) |
| `yardFall` | hamle sonu (adım 6) | `step` 6 olan `pieceFell{cause: 'yardGravity'}` | en az bir saha **bloğu** saha yerçekimiyle düştü (Y6; torba hareketi ve balon yükselişi sayılmaz) |
| `segmentDone` | hamle sonu (adım 8) | çekirdek `segmentCompleted` (`step` 8) | dilim tamamlanması |
| `deliveryDone` | hamle sonu (adım 9) | `step` 9 olan `pieceFell{cause: 'delivery'}` (en az bir; `deliveryArrived` partisinden) | kamyon partisinden en az bir bloğun sahaya düşmesi; adım 12 D2 yardım teslimatı (§9.7) sayılmaz. **`flag`:** düşen bloklardan en az birinin `flags`'inde (ör. Bölüm 35 `startOn` `mortar`) |
| `carouselTurn` | hamle sonu (adım 8 ya da 10) | `step` 8 ya da 10 olan `carouselRotated` | döner platform döndü (S5; ön dilim tamamlanınca ya da `carouselEvery` dolunca) |
| `boosterUsed` | diğer | çekirdek `boosterApplied` (+ Geri Al için `GameSession` `undoApplied` sinyali) | herhangi bir güçlendirici |
| `tap` | diğer | sahne sinyali `tutorialTap`; vurgu `pre:` ise ek olarak UI sinyali `preLevelClosed` | vurgulu bir hedefe eşik altı dokunuş (K-07); zorunlu adımda delik dışı yok sayılır. **`pre:<thermos\|trowel\|shutter>` hedefi (GDD §14.1/3):** bölüm öncesi pencerenin kapanması — Oyna ya da × — adımı `count`'tan bağımsız **bitirir**; adım başlarken pencere zaten kapalıysa adım hemen biter (LEVELS Bölüm 12, 16, 20) |

`dragCrossedWall` / `dragEnteredRail` yalnızca sahne sinyalidir (çekirdek olayı değildir, durum değişmez; §4.4
`blockedByWallHeight` ile aynı kanal); `DragSession` düğüm değişiminde O(1) üretir. `preLevelClosed`'ı bölüm öncesi
pencere (`ui/PreLevelPopup`) kapanırken bir kez yayınlar; öğretici adımları o pencerede de `TutorialController`'dan
yürür (`tutorial[]` bölüm ekranı ve bölüm öncesi pencere adımlarını taşır, GDD §14.1/6).

**`TutorialController` kuralları (GDD §14.1 madde 2, 4 ve 5):**
- **Başlama koşulu (`startOn`, GDD §14.1/5):** önceki adım bitince (ilk adımda bölüm başında) adımın `startOn`'u varsa
  adım **bekler**: spot ışığı, eldiven ve balon gösterilmez, oyun serbesttir. `startOn` olayı yukarıdaki tabloyla ve
  süzgeçleriyle sayılır (sayaç bekleme başlayınca 0'lanır, `count` varsayılan 1; bekleme başlamadan önceki olaylar
  sayılmaz). Olay gerçekleşince — hamle sonu olayında `EventPlayer` o olayın oynatmasını bitirince — adım başlar:
  `done` sayacı o anda 0'lanır, `timeoutMs` o anda başlar, vurgu (`piece:k<p>_<i>` dahil) o anki duruma çözülür ve Z
  adımında kilit güvencesi o anda çalışır (bekleme sırasında spot ışığı olmadığından kilit olamaz). `startOn` olayı
  bölüm sonuna kadar gerçekleşmezse bu adım ve sonraki adımlar gösterilmez (`tutorial_step` gönderilmez). `startOn`
  yoksa adım önceki adım bitince başlar. Ör. LEVELS Bölüm 35 adım 1: `startOn: { event: 'deliveryDone', flag:
  'mortar' }` → harçlı bloğun düştüğü teslimatın oynatması bitince `piece:k<p>_<i>` vurgulanır, `timeoutMs` 2500.
- **Bağlamsal satırın adımda gösterilmesi:** `textKey` `tut.ctx.<konu>` olan bir adım ekranda gösterildiği anda
  `seenContextTips.<konu>` işaretlenir ve kayıt hemen yazılır; o bağlamsal tetik bu hesapta bir daha çıkmaz (tek
  kullanım Bölüm 4 adım 2 → `seenContextTips.support`; §5.2 kanca 4). Test: "GDD 14.1 ctx step marks seenContextTips".
- **Zorunlu adımda girdi kapısı (UX §13.1, GDD §14.1/4; Faz 2 tur 1 #12):** üst üste binen delikler sınır kutusunda
  birleştiği için delik vurgusuz blokları da kapsayabilir; bu yüzden kapı parça kimliğiyledir: Z adımı vurgulu blok
  içeriyorsa `TutorialController.allowsPick(id)` yalnız o blokları tutturur (`DragController` reddedilen basışa tepki
  vermez) ve adımın sürükleme sinyalleri (`overWall`/`gapPass`/`holdOverBuild`) yalnız vurgulu bloğun sürüklemesinde
  sayılır. Spot deliği vurgulu bloğu izler: hamle işlenince yeni yerinde (`TutorialOverlay` vurgu dikdörtgenlerini her
  karede hesaplar, değişince yeniden kurar); sürükleme ortasında açılan adımda (Bölüm 1 adım 2) deliği bloğun o anki
  sürükleme düğümünde (ray dahil) kurar ve o sürükleme boyunca düğüm değişiminde yeniden kurmaz (her kurulum bir
  yeniden yerleşimdir; §10.6), bırakınca bloğun yeni yerine geçer. Testler "GDD
  14.1 required step ignores non-highlighted block", "UX 13.1 a piece: hole sits on the dragged block …".
  **Faz 2 tur 2:** (a) birleşen delik kutusunun hiçbir vurguya ait olmayan kısmı aynı karartmayla kapanır
  (`highlights.spotlight` → `fills` = `darkRects(kutu, üyelerin 12 px paylı dikdörtgenleri)`, köşesiz; köşesi bir
  dolgunun içinde kalan kutu köşesine koyu köşe parçası konmaz) ve zorunlu adımda dokunuş da yutar; (b) yutan bölgeler
  duraklat düğmesinin dokunma alanında (`pauseHitRect`, ≥ 128 px) kesilir (`blockerRects`): Mola penceresi, ayarlar ve
  "Bölümden çık" her adımda erişilebilir; (c) sürükleme boyunca sürüklenen blok (görüntü, parlama, kalkık gölge), gölge
  görünümünün tamamı (gövde, kontur, rozet, taramalar, düşüş yolu, iptal rozeti) ve #4 ipi `overTutorial(d)` =
  `DEPTH.tutorial + 5 + (d − fallShadow)/10` ile spot ışığının, eldivenin ve balonun üstüne çıkar, bırakınca döner
  (`ShadowView.setRaised`, `PieceView` sürüklenirken); (d) Usta Dede balonu UX §13.1 Faz 2 tur 2b'ye göre
  (`placeBubble`, `highlights.ts`): yasak alanlar = aydınlık vurgular (12 px paylı vurgu dikdörtgenleri; birleşen kutunun
  koyu dolgusu sayılmaz), eldiven yolu (`hand.path` noktalarını birleştiren hücre şeritleri), şantiye sütunu
  (`grid.wallX` → sağ, vinç üstü → satır 0 altı), Duraklat dokunma alanı, alt yarı ve yumuşak adımda / bağlamsal satırda
  sahadaki bloklar (sürüklenen blok hariç); ceza alanları = hedefler, hamle sayacı, vurgusuz panorama. Adaylar: 1 HUD altı
  (geniş kutu ≤ 760, vinç alanına girmeden sığarsa) → 2 saha bandı (dar kutu 494, satır 7 üstünden yasaklara değdikçe
  +16 iner, `H/2`'yi geçerse yok) → 3 vinç bandı (dar) → 4 HUD'a taşan bant (geniş; Duraklat'a değerse x = 168, kutu
  ≤ 672) → 5 durum şeridi üstü (dar). Seçim sözlük sırasıyla (yasak kesişimi, sonra ceza, sonra sıra); > 3 satıra düşen
  kutu o aday için geçersiz. Her adım metninin geniş ve dar varyantı (çok kısa ekranda Duraklat yanı da) bölüm başında
  kurulur; balon içerik açılınca ve ekran boyutlanınca yerleşir, delik bloğunu izlerken yer değiştirmez. 390×844 /
  360×800'de her adım aday 1; 390×763, 360×740, 412×846, 375×667'de UX "Beklenen sonuç" tablosu — Bölüm 1 adım 2 dar
  kutu 3 satırsa 4, 2 satırsa 3 (adım `overWall`'da (5,7) düğümünde açılır; paylı delik vinç bandındaki 229 px kutunun
  alt kenarına 1 px değer); (e)
  bağlamsal satır vurgusu olaydan türetilir (`ctxMoveHighlight`: geri seken blok `pid:<PieceId>` + birincil nedenin
  iniş hücreleri `reasonCells`; `support` → eksik destek hücreleri + `front`; `blocked` → dokunulan blok); satır
  sürükleme sırasında açılmaz. Testler "UX 13.1 merged hole: level 1 step 1 lights only the crane band and piece 0",
  "UX 13.1 required step keeps the pause button …", "UX 13.1 the dragged block and its shadow look draw above the
  spotlight during a drag", "UX 13.2 "Vurgu" column …", "UX 13.1 Faz 2 tur 2b "Beklenen sonuç": on 390×763 …", "UX 13.1
  Faz 2 tur 2b: no band under the HUD at FIT H 1920 …".
- **K-43 devamında öğretici (Faz 2 tur 2 #8):** devam eden denemede öğretici atlanmaz; `GameSession.replay(…, step)`
  her eylemden sonra (başlangıç dahil, indeks 0) o anki oturumla çağrılır ve sahne `replayTutorialAction` ile
  denetleyiciyi canlı oyundaki gibi besler: kilit güvencesi o anın durumunu görür; `tutorial_step` analitiği yeniden
  gönderilmez. Günlükte sürükleme yolu ve saat olmadığı için bir sürükleme yalnız sonucunun kanıtladığı sinyalleri verir
  (`pieceMoved.entry`: sahadan `overWall` → `overWall`; `gap` → `gapPass`; `overWall` → `holdOverBuild`, tutma süresi
  varsayılır) ve `timeoutMs` adımı sonraki eylemden önce biter (`endTimedStep`). İptal edilen sürüklemenin sinyali
  günlükte yoktur: o adım devamda yeniden açılır. Kapanış anında ekrandaki adım (zorunlu kapısı, `tut.ctx.*` satırı,
  sayacı) aynen geri gelir. Testler "K-43 resume keeps the tutorial step …" (birim: Bölüm 1–5 el çözümünün her
  noktasında canlı ile aynı adım; e2e: Bölüm 3 adım 2 kapısı).
- **Vurgu → blok çözümü:** `compile` (§2.3) `CompiledLevel.tutorialPieceIds` tablosunu bir kez kurar: `piece:<i>` →
  parti 0'ın `i`. parçası, `piece:k<p>_<i>` → `p`. partinin `i`. parçası, `debris:<i>` → `build.debris[i]`'den
  oluşturulan moloz parçası (`flags.debris`); hepsi `PieceId`. Spot ışığı deliği, eldiven ve aşağıdaki kilit güvencesi
  "vurgulu blok" olarak bu kümeyi kullanır (moloz şantiyede durur; delik o hücrelerin üstünde açılır).
- **Kilit güvencesi (zorunlu adım; GDD §14.1/4b):** Z adımı başlarken ve her hamle sonunda (adım 12 bittikten sonra)
  vurgulanan her `piece:` **ve** `debris:` bloğu için "adımın `done` olayını şu anki durumda üretebilir mi" denetlenir:
  blok K-09'a göre tutulabilir **ve** erişim kümesi `R` (K-08, `beginDrag` BFS'i, §4.1–4.2; moloz için çok kaynaklı
  başlangıç dahil) olayı üreten bir düğüm ya da kenar içerir — `overWall`: iki ucu FREE olan ve sınırın şantiye
  tarafındaki hücre sayısını değiştiren bir kenar (sinyal tanımının kendisi; "şantiye hücreli FREE düğüm" yetmez, çünkü
  molozun başlangıç düğümü zaten şantiyededir); `gapPass`: bir FREE → `RAIL(g)` kenarı (ray kipinde başlayan molozun
  başlangıç düğümü sayılmaz); `placementCorrect`: `classify` = şantiyeye bırakma ve `computeFall(...).verdict.ok` olan
  bir düğüm (`at` varsa o çapada; `hidden: true` ise ayrıca iniş hücreleri açılmamış bir `?`'e değer —
  `FallResult.touchesHidden`, ray düğümünde blok hücreleri; moloz için hiçbir zaman yok — `verdict.reasons[0] =
  'debris'`, K-16 koşul 2); `yardMove`: `classify` = sahaya yerleşim olan bir düğüm (K-07 satır 2: FREE, K-10'a göre
  boş, bütün hücreleri x ≤ 5 ve y ≤ 7; satır 1 başlangıç konumu hariç; `at` varsa o çapa) — `piece:` ve `debris:` için
  aynı koşul (moloz için OBSTACLES S4); `painted: true` ise o düğüm `R`'de bir boya kapısı katmanında (`via` dolu;
  boya kapılı bölümde BFS düğümleri ×(1 + kapı sayısı), §4.5), yani yol bir boya kapısının ray kipinden geçer.
  **`steered`:** `R`'de `classify` = şantiyeye FREE bırakma (K-07 satır 6) olan bir düğüm yeter (yönlendirme oyuncu
  girdisidir, GDD §14.1/4b; L-17 olayın yalnız G-L bölümünde yazılabildiğini zorlar). **`landed`** (`flag`, `wind`
  ile): `R`'de şantiyeye FREE bırakma düğümü ve o düğümde `computeFall` (adım 2'nin kendisi; O(1)) `effect.kind ≠
  'break'` (`wind: true` ise ayrıca `drift ≠ 0`); `flag` varsa blok o bayrağı taşır (yoksa bu blok üretemez).
  **Diğer hamle sonu olayları** (`obstacleHit`, `itemCollected`, `yardFall`, `segmentDone`, `deliveryDone`,
  `carouselTurn`, süzgeçleriyle; GDD §14.1/4b): `R`'deki iptal olmayan her bırakma düğümü (`classify` ≠ iptal: saha,
  şantiye FREE, ray) için hamle K-35 hattında **simüle edilir** — tampon kopyasında (`buf.slice()`, §2.4)
  `applyMove(kopya, { kind: 'drag', pieceId, to, via }, süzgeçliSink, { noTruckHelp: true })` (G-L'de yönlendirmesiz);
  `süzgeçliSink` yukarıdaki tablonun tanımını (olay, `step`, süzgeç) uygular, sonuç atılır, ilk üreten düğümde denetim
  durur. `noTruckHelp` güvenlidir: adım 12 bu olayların hiçbirini üretmez (tablo `step` sütunu); güvence simülasyonu
  Kamyon Yardımı'nı tetiklemez. **`turnEnd`, `holdOverBuild` ve `tap`** için tutulabilirlik yeter; `timeoutMs` adımı
  kendiliğinden biter. Hiçbir vurgulu blok üretemiyorsa adım **atlanır** (tamam sayılır), sonraki adıma geçilir;
  oyuncu spot ışığı içinde hiçbir zaman kilitli kalmaz. Atlanan adım tamamlanan adımla aynı analytics kaydını üretir
  (ANALYTICS §2 tablosundaki öğretici adımı olayı; tabloda atlama ayrımı yok, kod da eklemez). **Maliyet:** vurgulu
  blok başına bir BFS (≤ 41 µs 6×, §4.5) + düğüm başına O(1) `classify`/`computeFall` → < 1 ms; simülasyonlu olaylarda
  düğüm başına `slice` + `applyMove` ≈ 2–4 µs (Node, §9.4) ≈ 25 µs (6×) → %80 dolu sahada blok başına 19–51 düğüm
  ≤ 1,3 ms, boş tahta en kötü durumu (≈ 320 düğüm) ≈ 8 ms. Denetim `EventPlayer` oynatması sürerken kare başına ≤ 2
  ms'lik dilimlerle yürür (adım geçişi zaten oynatma bitince görünür); sonuç oynatma bitince hazır değilse adım geçişi
  sonucu bekler, girdi kilitlenmez. Testler: "GDD 14.1 required tutorial step never locks" (vurgulu bloğun yolu
  kapanınca adım atlanır), "tutorial overWall counts at first crossing even if drag is cancelled", "tutorial done.at
  counts only at anchor", "GDD 14.1 debris yardMove step completes when debris reaches yard" (UX Bölüm 17 `debris:0`),
  "GDD 14.1 required debris step skips when debris cannot reach yard", "tutorial gapPass not counted at debris rail
  start" (sahaya çıkıp FREE kipten yeniden girişte sayılır), "GDD 14.1 required yardFall step skips when no drop causes a yard fall" (simülasyon yolu), "GDD 14.1
  required steered step needs only a free site drop", "GDD 14.1 required landed glass step skips when every site drop
  breaks", "GDD 14.1 required painted yardMove needs a paint gate path".

**Sözlük kapalıdır (GDD §14.1/3):** LEVELS §3'ün 11–38 `done` eşlemesi (UX §13.2 satırlarının veri karşılığı) bu
birleşimle birebir yazılabilir; Faz 3'e ertelenen olay yoktur. GDD'ye yeni bir tamam koşulu eklenirse önce GDD, sonra
aynı turda bu birleşim + tablo + kilit güvencesi satırı değişir. Hamle sonu olaylarının çalışma anı sayımı ve
simülasyonlu kilit güvencesi, olayları üreten engeller (Y1, Y2, Y3, Y6, Y7, W6, W7, W8, S3, S5, S8, G-L) Faz 3'te
geldikçe testlenir; şema ve L-17 Faz 2'de sözlüğün tamamını kabul eder. Testler: "K-45/1 LEVELS level 1-10 tutorial
data passes schema", "K-45/1 LEVELS level 11-38 tutorial done data passes schema" (Bölüm 35 `startOn` dahil),
"tutorial done vocabulary equals GDD 14.1 list" (GDD §14.1/3'ten ayrıştırılan 16 ad ↔ `TutCond` üyeleri, iki yönlü),
"tutorial holdOverBuild needs minMs", "tutorial at only on yardMove and placementCorrect", "tutorial filter only on its
event" (`landed` + `type`, `yardMove` + `hidden`, `deliveryDone` + `wind` → `schema_invalid`), "tutorial obstacleHit
and itemCollected need type", "tutorial startOn cannot be timeoutMs", "tutorial highlight vocabulary equals UX 13.1
list", "tutorial move-end events count once per move or booster use", "tutorial obstacleHit counts step 5-6 events
and hammer direct hit" (Bölüm 11 adım 1: Çekiç'in doğrudan kırdığı kasa sayılır; Vinç `step: 1` olayları sayılmaz), "tutorial landed not counted when glass breaks", "tutorial deliveryDone ignores step
12 help delivery", "GDD 14.1 tap on pre target completes when pre-level window closes", "GDD 14.1 startOn waits for
mortar delivery then starts step" (Bölüm 35 fikstürü), "GDD 14.1 startOn never fires hides remaining steps".

Bağlamsal öğreticiler (`tut.ctx.*`) bölüm verisiyle değil, çekirdek olaylarından ve sürükleme sinyallerinden
tetiklenir (bir bölümün `tutorial[]` adımı aynı metni `textKey` olarak yeniden kullanabilir; ör. LEVELS Bölüm 4 adım 2;
o zaman yukarıdaki kural `seenContextTips`'i işaretler), hesap başına bir kez (kayıtta `seenContextTips`; tetik yalnız
işaretli değilse çıkar): `tut.ctx.support` (ilk `pieceBounced`/`mortarStuck` `reason = 'support'`, GDD K-34 kanca 4),
`tut.ctx.tootall` (ilk `blockedByWallHeight`, K-05, §4.4), `tut.ctx.bounce.color/.window/.offplan` (birincil nedene
göre), `tut.ctx.truckhelp.*` (`truckHelp.kind`) vb.; anahtar listesi STORY §6 / UX §13.2 bağlamsal tablosu, L-17 her
anahtarın iki dilde var olduğunu denetler. Bir öğretici adımı ekrandayken bağlamsal satır gösterilmez, kuyrukta bekler
(GDD K-34 kanca 4, LEVELS §0); gösterilebileceği anda tetiği artık geçerli değilse (kamyon kuyruğu boşaldı, seri
sıfırlandı, altın mala yok, ya da anlık bir tetikten — geri sekme, tutulamayan blok, boyu uzun — sonra yeni bir eylem
işlendi) **işaretlenmeden düşer** ve sonraki gerçekleşmede yeniden tetiklenir (Faz 2 tur 1 #13; `ContextTips.update`
geçerlilik fonksiyonu, test "UX 13.2 a queued contextual tip whose trigger no longer holds is dropped unmarked"). Engel bilgi kartı metni `obs.{id}.desc` (R-08) i18n'dedir.

Brif §12 tipinden farklar (hepsi öneri, P-6; GDD §14 ekleriyle uyumlu): `schemaVersion` eklendi; `gaps` tipine göre
ayrık birleşim (kepenkte `period` zorunlu vb.); **`build.mode`'dan `'elevator'` çıkarıldı, `build.elevator` ayrı
isteğe bağlı alan oldu** (Bölüm 40 "döner platform + asansör"); `elevatorRange` → `elevator.range` + `start` + `dir`;
`debris[].segment`, slider `dir`, hamle kaydında `drag.via`; aralıklar GDD/OBSTACLES'a daraltıldı (`carouselEvery` 2–6,
`wetMoves` 1–5, kepenk `period` 1–4, `repeat.period` 1–4, asansör 0–3, dilim 1–5). Yön `1 | −1` (GDD §14).
**Zorunlu alanlar ve varsayılanlar (GDD §14):** `build.elevator.start` ve `.dir` zorunludur (varsayılan yok);
varsayılanı olan yalnızca iki alan vardır ve şemada `_default` ile yazılır: kayar kapı `dir = 1` (GDD §14, W5) ve kepenk
`phase = 0` (GDD S-24 "`phase = 0` açık başlar"; OBSTACLES W4 veri satırında varsayılan yazmadığı için code-lead
varsayılanı). Ayrıca `build.debris[].segment` isteğe bağlıdır (`z.optional`, `_default` değil): verilmezse derlemede 0
sayılır (GDD §14, K-45/7, OBSTACLES S4). Varlık kuralları şemada değil mantık denetimindedir: `carouselEvery` ⇔ `mode = 'carousel'` (L-25),
`flags` içinde `wet` ⇔ `wetMoves` (L-26), asansör aralığı (L-24).
`seed` isteğe bağlı (GDD §14, K-45/1; yoksa `id × 1000 + id`, uyarı yok). `strictObject` bilinmeyen anahtarları
reddeder (yazım hatası yakalar).

### 8.3 Mantık kuralları (`src/core/level/logic.ts`; araç ve oyun ortak)

**Hata kodları = GDD K-45 (R-02).** Her denetim `Issue { code, rule, check, severity, path, message }` üretir:
`code` = K-45'teki snake_case hata adı (ör. `gap_touches_top`, `too_many_colors`, `shape_locked`,
`flag_combo_forbidden`, `yard_fill_low`), `rule` = `'K-45/<madde>'` (ya da ilgili K kimliği), `check` = iç denetim
numarası `L-xx` (yalnızca kod ve test düzeni için). Araç çıktısı ve testler `code` + `rule`'u gösterir
(test adı: `"K-45/3 gap_touches_top …"`). GDD ileride ayrı bir kod tablosu eklerse adlar **birebir** ona eşitlenir
(GDD geçerlidir; yalnızca ad değişir). `error` varsa bölüm yüklenmez (code-lead ilke 4).

| L | K-45 | `code` | Denetim | Ciddiyet |
| --- | --- | --- | --- | --- |
| L-01 | 1 | `schema_invalid`, `id_mismatch`, `chapter_mismatch` | zod şeması; `id` 1–50 ve dosya adıyla eşleşir; `chapter = ⌈id/10⌉`; `seed` yoksa `id × 1000 + id` atanır (hata değil) | error |
| L-02 | 2 | `overlap`, `out_of_yard` | Parti 0 parçaları ve engeller tahtada (x 0–5, y 0–7, şeklin kapsamı dahil); **çakışma kümesi = parça + kasa + torba** (hücre kaplayanlar). Vida ve anahtar hücre kaplamaz, bir bloğun ya da kasanın **altında** durması gerekir (GDD K-42) → yalnızca L-14 ve L-23 denetler, `overlap` üretmez | error |
| L-03 | 2 | `yard_fill_low` | Saha doluluğu (parça + kasa + torba hücresi / 48) ∈ [0,80; 1,00]; **öğretici bölümler dahil** (S-3 GDD yanıtı) | error |
| L-04 | 5 | `shape_forbidden`, `shape_locked` | `I5_90`/`I5_270` yasak; Q9 ve I5 yalnızca sahada; tür hikaye bölümüne göre açılmış (K-44 tablosu, `chapter`); **`heavy` şekiller (I5, Q9 ve w ≥ 3 yönelimler, §3.2) yalnız `id ≥ 8`** (K-44 "8. bölümden itibaren"; hikaye bölümü 1 Bölüm 1–10'u kapsadığı için bölüm tablosuyla değil `id` ile denetlenir — LEVELS Bölüm 8 ve 10'daki `Q9_0` geçerli, Bölüm 1–7'de ağır şekil `shape_locked`) | error |
| L-05 | 4 | `row_width`, `elevator_overflow` | Her satır 2 karakter; asansörde her dilim için `h + b ≤ 8` | error |
| L-06 | 4 | `too_many_colors` | Renk sayısı ≤ hikaye bölümü sınırı (1 → 3, 2 → 4, 3–5 → 5). **Renk kümesi (GDD K-31, LEVELS §0)** = bütün dilimlerin plan hücreleri (`?` hücrelerinin `resolveHidden` ile çözülmüş renkleri dahil) ∪ bölümdeki bütün blokların renkleri (parti 0, bütün kamyon partileri, moloz; şaşırtma ve dolgu dahil) ∪ Boya Kapısı geçitlerinin (`wall.gaps[type = 'paint'].color`, W6) renkleri | error |
| L-07 | 4 | `color_locked` | L-06'nın aynı kümesi (plan + çözülmüş `?` + bütün bloklar + boya kapısı renkleri) yalnızca açılmış renkleri kullanır (W,Y: 1; G: 2; R: 4; O,C: 11; B,P: 21) | error |
| L-08 | 4 | `hidden_invalid` | `?` yalnızca `hidden` kuralı olan dilimde; `repeat`: dilimin alt `p` satırında `?` yok; `mirrorOf`: hedef daha önceki dilim, aynı yükseklik, `?` içermez; `.` gizli olamaz; çözüm döngüsüz (K-32) | error |
| L-09 | 3 | `gap_touches_top`, `gap_overlap`, `shutter_phase`, `slider_range`, `key_missing` | K-04: `y + size ≤ height − 1`; kepenk `phase < 2·period`; kayar kapı (GDD K-45/3, OBSTACLES W5) `range = [a, b]` için **`a < b`** (`a = b` iken ping-pong aralık dışına çıkardı ve §2.6 döngü uzunluğu `2·(b − a)` 0 olurdu), `a ≤ y ≤ b` ve `b + size ≤ height − 1` (hepsi `slider_range`); **geçitler örtüşmez** (`gap_overlap`): her geçidin satır kümesi — sabit/kepenk/boya/kilitli için `y … y + size − 1`, kayar kapı için bütün hareket aralığı `a … b + size − 1` (yalnız başlangıç `y`'si değil) — ikişer ikişer kesişmez (iki kayar kapı da birbirinin bütün aralığıyla); kilitli geçidin `keyId`'si bir `key` engeline eşleşir; `fan` 1 genişlikli bloğu olmayan bölümde `warn` | error / warn |
| L-10 | K-27 | `material_short` | **Birikimli zorunlu koşul** (`segments`): her dilim `k` ve renk `c` için Σ_{j≤k} planHücre_j(c) ≤ Σ_{parti≤k} arz(c); arz = partideki şantiyeye geçebilen ağır olmayan `c` blokların hücre toplamı (boya kapısı varsa o geçide sığan bloklar kapının rengine de sayılır, her blok bir kez). `carousel`'de dilim sırası oyuncuya bağlı olduğundan yalnızca toplam (Σ bütün dilimler ≤ Σ bütün partiler) denetlenir. K-27'nin tam hâli ("henüz kullanılmamış", "solver çözümü üzerinde") L-19'da | error |
| L-11 | K-27 | `untileable` | Döşenebilirlik (`tileLevel`, kesin örtü DFS'i, dilim ≤ 16 hücre): her dilimin plan bölgesi o dilime kadar teslim edilen bloklarla (birikimli; `carousel`'de her dilim bütün arzla tek başına) **K-34 sırasına uygun** (alttan üste) ve **fiziksel olarak ulaşılabilir** yerleşimlerle tam örtülür. Ulaşılabilir: FREE bırakma tam o çapaya iner (K-11, sütun tepeleri); ya da blok satırlarını kapsayan bir geçitten ray (K-12; kayar kapıda bütün aralık, asansörde `a…b` ofsetleri; şantiyedeki yol hücreleri boş); ya da balon plan tepesinden / dolu hücreden asılı (S8). Yalnız şantiyeye geçebilen ağır olmayan bloklar sayılır. `.` üstündeki hücreler böylece hizalı geçit, balon ya da iki sütuna köprü kuran 2 genişlikli blokla örtülür. **Boya kapısı (W6):** satırları bir boya geçidine sığan (`h ≤ size`) ağır olmayan blok kendi rengi **ya da** o kapının rengi olarak yerleşebilir, blok başına tek renk (L-10 "her blok bir kez" ile aynı). Boya rengindeki yerleşim FREE (kapıya girip sahaya dönen boyanmış blok duvar üstünden; boya kalıcıdır, S-21) ya da herhangi bir geçitten ray ile ulaşılır, **başka renkte bir boya kapısının rayı hariç** (girmek bloğu yeniden boyardı; son girilen kapı geçerli, E-39); kendi rengindeki yerleşim de başka renk boya kapısının rayını kullanamaz. Arama başarısız durum önbelleğiyle (dilim, dolu maske, kalan blok sayıları); düğüm bütçesi 200 000 (`ctx.tileBudget`). Örtü yoksa error; bütçe biterse sonuç belirsizdir → aynı kod **warn** ("inconclusive"). Rüzgâr, G-L yönlendirme ve moloz yaklaşık modellenir; kesin karar L-19 solver'ındadır | error / warn (bütçe) |
| L-12 | K-25 | `batch_invalid` | `forSegment` 0..S−1, parti 0 dilim 0 için var, `dropColumns` blok genişliğine uyar, parti k ≥ 1'de `y = 8` ve **`0 ≤ x ≤ 6 − w`** (`w` = şeklin genişliği; K-25 aşama 1 bloğun `x`'inden başlar, x = 6–7 bloğu şantiyeye düşürürdü) | error |
| L-13 | 7 | `debris_misplaced` | Moloz şantiyede (x 6–7, şeklin kapsamı dahil), **kendi `segment` alanında** (dilimin plan yüksekliği içinde) ve başka molozla çakışmaz (GDD K-45/7; destek şartı yok — OBSTACLES S4 "altı boşalsa da düşmez", GDD K-19 çıkıntı örneği; renk uyuşmazlığı şartı yok: K-16 (2) molozu her yerde hatalı yapar) | error |
| L-14 | 6 | `hidden_item_exposed` | Vida ve anahtar başta bir bloğun ya da kasanın altında; kasa `hp` 1–3 | error |
| L-15 | 6 | `goal_count_too_high`, `goal_build_missing` | `build` tam bir kez; `clear.count` ≤ ilgili nesne sayısı; `collect.count` ≤ vida sayısı (K-41) | error |
| L-16 | 9 | `teaches_mismatch` | `teaches` verilmişse veriden türetilen **tek yeni** mekaniğe eşit; yeni mekanik yoksa `teaches` verilemez (GDD K-45/9) | error |
| L-17 | — | `tut_key_missing`, `tut_highlight_invalid`, `tut_done_invalid` | `tutorial.textKey` hem `tr.json` hem `en.json`'da; her `highlight` öğesi §8.2 vurgu sözlüğündendir (UX §13.1; regex şemada) **ve** bölümde vardır: `piece:<i>` < parti 0 boyu; `piece:k<p>_<i>`: `1 ≤ p` < parti sayısı, `i` < o partinin boyu; `gap:<i>` < geçit sayısı; `obstacle:<i>` < engel sayısı; `debris:<i>` < `build.debris` boyu; `cell:x,y` tahtada; `fan` ⇒ `wall.fan`; `truck` ⇒ parti sayısı ≥ 2; `booster:<b>` / `pre:<p>` ⇒ o öğe bu bölümde açık (META §4, `economy.json → boosters.<ad>.unlockLevel ≤ id`; vurgu adı → anahtar: `hammer`, `crane`, `undo`, `thermos` aynı, `brush` → `paintBrush`, `trowel` → `trowelStart`, `shutter` → `openShutter`). `done` **ve `startOn`** (aynı denetim; olay bu bölümde hiç gerçekleşemiyorsa `tut_done_invalid`): `segmentDone` ⇒ dilim ≥ 2, `deliveryDone` ⇒ parti ≥ 2 (`flag` ⇒ k ≥ 1 partilerinden birinde o bayraklı blok), `gapPass` ⇒ geçit ≥ 1, `obstacleHit` `type: crate`/`cement_bag` ⇒ o türde engel, `type: chain` ⇒ `chained` bayraklı blok, `itemCollected` `type: screw`/`key` ⇒ o türde engel, `landed.flag` ⇒ o bayraklı blok, `landed.wind` ⇒ `wall.fan`, `steered` ⇒ `gravity.build = 'low'`, `yardFall` ⇒ `gravity.yard`, `carouselTurn` ⇒ `mode = 'carousel'`, `placementCorrect.hidden` ⇒ en az bir dilimde `?`, `yardMove.painted` ⇒ bir `paint` geçidi; **parti vurgusu ve `startOn` (GDD §14.1/5, UX §13.1):** `piece:k<p>_<i>` vurgusu yalnız `startOn.event = 'deliveryDone'` olan adımda yazılabilir ve `startOn` teslimatındaki bloğu gösterir — blok `startOn` süzgecini sağlar (`flag` ⇒ bloğun `flags`'inde) ve `segments` kipinde `p`, süzgeci sağlayan bloğu olan k ≥ 1 partilerinin teslim sırasında (`forSegment` artan, eşitlikte dizi sırası) `startOn.count`'uncusudur (varsayılan 1.); `carousel` kipinde teslim sırası oyuncuya bağlı olduğundan yalnız süzgeç denetlenir; bozulursa `tut_highlight_invalid` (ör. LEVELS Bölüm 35: ilk harçlı blok taşıyan parti); `done.at` bölgesi olayla uyumlu (`yardMove` ⇒ `x ≤ 5`, `placementCorrect` ⇒ `x ≥ 6`); zorunlu (Z) adımın `highlight`'ında en az bir `piece:` **ya da** `debris:` (GDD §14.1/4a; yoksa `tut_highlight_invalid`); `piece:` içermeyen Z adımının `done.event`'i `placementCorrect` olamaz (moloz hiçbir yerde doğru olamaz, K-16 koşul 2; olursa `tut_done_invalid`; ör. UX Bölüm 17 `debris:0` → `yardMove` geçerli); adımlar `step` 1, 2, … ardışık; **eldiven başlangıcı (LEVELS §5, Faz 2 tur 2):** `hand.kind` `drag`/`hold` ise `hand.path[0]` adımın vurgusundaki bir `piece:<i>` (parti 0) ya da `debris:<i>` (dilim 0) bloğunun JSON başlangıç hücrelerinden biridir (`shape.cells` + `x,y`; çapa yetmez), değilse `tut_highlight_invalid` (`tutorial[i].hand.path[0]`); yalnız parti bloğu / sonraki dilim molozu vurgulayan adım Faz 3'te, `tap` denetlenmez. Test "L-17 a drag / hold glove starts on a cell of a highlighted block …" | error |
| L-18 | — | `difficulty_sawtooth` | Zorluk etiketi testere dişi planına uyar (10, 15, 25, 35, 45, 49 Zor; 20, 30, 40, 50 Çok Zor) | warn |
| L-19 | 8, K-27 | `unsolvable`, `moves_buffer_low`, `yao_low`, `material_short` | (solver aşaması) Çözülebilir, `moves ≥ min + tampon` (Kolay +8, Normal +5, Zor +3, Çok Zor +2), **YAO ≥ %60** (K-46). **K-27 tam denetimi:** solver çözümü çekirdekte oynatılır; her dilim aktif (carousel'de öne) geldiği anda ve her renk `c` için "o dilimin boş `c` hücresi ≤ o ana kadar teslim edilmiş, henüz kullanılmamış (sahada + kuyrukta + şantiyede yapışmış harçlı) ağır olmayan, **moloz olmayan** `c` blokların hücre toplamı" sağlanmalı (GDD K-27: sahaya taşınmış moloz arz değildir; terimler K-30 D2 ile aynı, §9.7); bozulursa `material_short` (`rule: 'K-27'`, dilim ve renkle) | error |
| L-20 | — | `bot_band` | (bot aşaması) Orta bot kazanma oranı hedef bantta (Kolay ≥ %90, Normal %65–80, Zor %40–55, Çok Zor %25–40) | warn |
| L-21 | 5 | `flag_combo_forbidden` | Bayrak birleşimi (OBSTACLES tablosu): `glass`+`balloon`; moloz + herhangi bir bayrak (şema zaten bayraksız); ağır şekilde `glass`/`balloon`/`mortar` | error |
| L-22 | 9 | `too_many_new_mechanics` | Bölümde, önceki bölümlerin türetilmiş kümelerinde olmayan en çok 1 mekanik (aşağıdaki imza tablosuyla; GDD örneği: Bölüm 4'e `size = 1` geçit → {S2, W3}) | error |
| L-23 | 6 | `hidden_item_stacked` | Bir hücrede en çok 1 saklı nesne (vida ya da anahtar) | error |
| L-24 | 4, K-24 | `elevator_range` | `build.elevator` varsa `range = [a, b]` için `a < b` ve `a ≤ start ≤ b` (0 ≤ a, b ≤ 3 şemada) | error |
| L-25 | 4, K-23 | `carousel_every_missing` | `mode = 'carousel'` ⇒ `carouselEvery` var (error); `mode = 'segments'` iken `carouselEvery` yazılmışsa aynı kodla "kullanılmayan alan" (warn) | error / warn |
| L-26 | 5, Y4 | `wet_moves_missing` | Her blokta `flags` içinde `wet` ⇔ `wetMoves` var (biri diğeri olmadan yazılamaz) | error |
| L-27 | — (K-30) | `trap_dead_end`, `trap_budget`, `trap_scan_incomplete` | (solver aşaması, `--traps`, §9.8) ✓ yerleşimden sonra D1/D2'nin yakalamadığı kesin çıkmaz ya da verimli oyuncu bütçe tuzağı yok (LEVELS §5 F-3 ölçütü; Kamyon Yardımı ve Mala kapalı; kapsam = çözümdeki kazı + 1 saha hamlesi) | error (Kolay/Normal) / warn (Zor/Çok Zor; `trap_scan_incomplete` her zaman) |

**Mekanik imzaları (L-16, L-22; GDD K-45/9, R-21):** `src/core/level/mechanics.ts` bir veri tablosudur ve OBSTACLES
"Veri imzası" tablosunun (27 satır: W1…W8, Y1…Y8, S1…S6, S7-R, S7-M, S8, G-H, G-L) birebir kod karşılığıdır:
`{ id: 'W1', detect: bir geçitte type 'static' }`, `{ id: 'W2', detect: lvl => lvl.wall.height === 8 }`,
`{ id: 'W3', detect: lvl => lvl.wall.gaps.some(g => g.size === 1) }` (tipten bağımsız, N2),
`{ id: 'S1', detect: mode 'segments' ∧ dilim ≥ 2 }`, `{ id: 'Y5', detect: herhangi bir partide ağır şekil }`,
`{ id: 'G-H', detect: gravity.build === 'high' }` … Her mekaniğin `detect`'i vardır; bölümün mekanik kümesi
**yalnızca veriden** türetilir (`{m | m.detect(lvl)}`), `teaches` kümeye bir şey eklemez, yalnızca L-16 ile denetlenir.
İmzası olmayan öğretimler (kaldır–taşı–indir, gölge, kazı, hedef türleri, güçlendirici açılışı) `tutorial` adımlarıdır.
Test: tablo ↔ OBSTACLES satırları eşit (her kimlik Faz 2'de — L-16/L-22 Faz 2 kapsamındadır, §14.1; "ilk bölüm"
sütunu 50 bölüm fikstüründe Faz 3'te).
**W3 (R-21 kararı: seçenek B):** Bölüm 4'ün geçidi boy 2'dir, W3 ilk kez Bölüm 9'da türetilir; K-45/9 istisnasızdır.
Testler: "K-45/9 W3 derived from gap size", "K-45/9 size-1 gap in level 4 is too_many_new_mechanics",
"K-45/9 teaches must equal derived new mechanic".
GDD K-45 hata adlarını ayrı bir tabloyla vermediği için yukarıdaki `code` sütunu tek listedir; GDD'deki örnek adlar
(`yard_fill_low`, `gap_touches_top`, `too_many_new_mechanics`) bununla aynıdır.

`tools/validate-levels.ts` L-01…L-18 ve L-21…L-26'yı çalıştırır, `code` + `rule` tablosu basar, hata varsa çıkış 1.
L-19 ve L-27 `levels:solve`'da (L-27 `--traps` ile, §9.8), L-20 `levels:bot`'ta denetlenir. Oyunda ise zod + L-02, L-04, L-05, L-08, L-09, L-24, L-25, L-26
yükleme anında koşar (< 1 ms); bölüm reddedilirse deneme başlamaz, `level_load_failed { stage, code }` bir kez
gönderilir (§11.4, ANALYTICS §2 v3) ve oyuncu Ana ekrana döner (UX §4). Kalanlar derleme zamanı güvencesidir. Her kod için `tests/level/invalid/` altında bir
geçersiz fikstür vardır (test adı `"K-45/<madde> <code> …"` ya da `"K-24 elevator_range …"`, `"K-23
carousel_every_missing …"`, `"Y4 wet_moves_missing …"`, `"K-25 batch_invalid x beyond yard"`, `"K-42 screw under
block is not overlap"`, `"K-27 material_short cumulative"`, `"K-44 Q9 in level 7 shape_locked"` (Bölüm 7, Q9 tek yeni mekanik olduğu için K-45/9
geçer; L-04 `id < 8` ile yakalar), `"K-45/4 too_many_colors from paint gate color"` (hikaye bölümü 3,
plan ve bloklar 5 renk, boya kapısı 6. renk → hata; küme GDD K-31 Bölüm 22 örneğindeki gibi kapı rengini içerir), `"K-27 moved debris is not supply"`,
`"K-45/3 slider_range a == b"` (OBSTACLES W5: `range [3,3], y 3, dir 1`), `"K-45/3 gap_overlap across slider range"`
(OBSTACLES W5: `height 8`, kayar kapı `range [1,3]`, `size 2` → satır 1–4, + sabit geçit `y 4, size 1` → satır 4 ortak;
başlangıç `y = 1`'de örtüşme yoktur, yalnız aralık denetimi yakalar),
`"GDD 14.1/5 tut_highlight_invalid batch piece without startOn"`, `"GDD 14.1/5 tut_highlight_invalid startOn piece
not in first mortar batch"` (Bölüm 35 biçimi; vurgu ikinci harçlı partiyi gösterir), `"GDD 14.1 tut_done_invalid
obstacleHit crate without crate"`, `"GDD 14.1 tut_done_invalid steered without low gravity"`, `"GDD 14.1
tut_done_invalid startOn deliveryDone flag without such block"`,
`"GDD 14 tut_highlight_invalid debris index out of range"`, `"GDD 14.1/4a tut_highlight_invalid required step without
piece or debris"`, `"GDD 14.1/4a tut_done_invalid debris-only required step with placementCorrect"`; karşı örnek
olarak `tests/level/valid/` altında `"K-44 Q9 in level 8 valid"` (LEVELS Bölüm 8 `Q9_0` (3,5), hikaye bölümü 1),
`"GDD 14.1/4a required debris-only yardMove step is valid"` — UX Bölüm 17
`debris:0` Z adımı — ve `"GDD 14.1/5 startOn mortar delivery with first mortar batch piece is valid"` — LEVELS Bölüm 35
adım 1). Bölümler oyuna `import.meta.glob('/levels/level_*.json')` ile tembel
yüklenir (her bölüm ayrı küçük parça).

---

## 9. Solver, playtest botu, kilitlenme

### 9.1 İlke: tek kural motoru

Solver ve bot **oyunun çekirdeğini** (`beginDrag`, `computeFall`, `applyMove`) `NULL_SINK` ile çağırır. Ayrı bir "solver
kuralı" yoktur; bir kural değişince solver da otomatik değişir. Çıktı her zaman gerçek çekirdekte baştan oynatılarak
doğrulanır.

**Kamyon Yardımı kapalı (GDD K-30, K-45/8, K-46; LEVELS §5 "Mala'sız ve Kamyon Yardımı'sız"):** solver (L-19:
çözülebilirlik, minimum hamle, YAO), ✓-tuzağı taraması (§9.8) ve usta botunun yerel planlaması
`applyMove(state, move, NULL_SINK, { noTruckHelp: true })` çağırır (§6.1): K-35 adım 12 hiç çalışmaz; kilit tespiti
gerekiyorsa saf `detectDeadlock(state)` (§9.7 "Tespit") ayrıca çağrılır. Gerekçe: adım 12 açık olsaydı D2'nin `B1`
teslimatı malzemesi eksik, D3'ün `reshape`'i döşemesi bozuk bir bölümü "çözülebilir" gösterirdi; `reshape` ayrıca
§9.4'teki sabit `M_c`'den büyük blok üretip `h`'nin kabul edilebilirliğini bozardı. Kazanan bir yolda adım 12 zaten
olay üretmez (D2 yardımsız çözümü imkânsız kılar; D1 durumunda sonraki sürükleme olamaz; D3 yalnız kanıtlanmış
çıkmazda tetiklenir), bu yüzden `noTruckHelp` ile bulunan çözüm golden testinde (§9.5, adım 12 açık) aynı
`eventLogHash`'i verir. Playtest botlarının **oynadığı** oyun ise gerçek oyundur (adım 12 açık): L-20 kazanma oranı ve
LEVEL_REPORT'un "Kamyon Yardımı sayısı" sütunu oradan gelir. Testler: "K-30 solver ignores truck help" (yalnız D2
`B1` teslimatıyla ya da yalnız D3 `reshape` ile bitebilen iki fikstür → `unsolved`), "K-30 solver solution never
triggers step 12" (bütün golden çözümlerinde adım 12 açıkken `deadlockDetected` yok; varsa D3 sağlamlık hatasıdır).

### 9.2 Durum uzayı

- Durum = `GameState.buf` (§2.4). Düğüm kimliği = Zobrist (§2.6); zamanlı mekanikler `turn mod L` ile karmada.
- Sabit olmayan büyüklükler: saha konfigürasyonu (≤ 48 hücre, 8–20 parça), şantiye doluluğu, engel/geçit durumu,
  teslimat imleci + kuyruk, `turn mod L`.
- Solver'ın **yok saydığı** şeyler (brif §12 ve tasarım gereği): G-H tutma süresi, güçlendiriciler (Çekiç, Vinç, Boya
  Fırçası, Geri Al, Altın Mala), +5 hamle teklifi, kombo, **Kamyon Yardımı** (K-35 adım 12 kapalı, `noTruckHelp`,
  §9.1). Hamle sınırı = `level.moves` (yalnızca rapor; arama sınırsız).
- **Takvim (entrepreneur önerisi, kabul):** solver yalnızca Faz 3'te tek seferde (katmanlı A*) yazılır. Faz 2'de 1–5.
  bölümlerin doğrulaması LEVELS §2 el çözümlerinden üretilen golden dizilerle yapılır (§9.5); böylece katmansız A*'ın
  çift işi ortadan kalkar.

### 9.3 Hamle üretimi ve budama

Her düğümde, tutulabilen (`beginDrag` ≠ null) her parça için tek BFS, ardından:

1. **Şantiye yerleşimleri (yalnızca `isCorrectPlacement` = doğru olanlar; K-34 dahil):** K-34 gömülü delik bırakan
   yerleşimleri baştan eler, dallanma azalır. Ön eleme: düğüm başına bir kez `buildFront` (§5.2) alınır; bir FREE ya da
   RAIL adayının her sütundaki en alt hücresi o sütunun cephe satırında değilse aday `isCorrectPlacement` çağrılmadan
   atılır (K-34'ün zorunlu koşulu; balon ve G-L varyantları dahil). Test: "K-34 solver never emits support-violating
   move" (bütün golden çözümlerde `placementWrong.reasons` boş).
   - FREE — **bırakma yüksekliği aday boyutudur, ama yalnızca sonucu değiştiren sınıflar üretilir.** Bir şantiye
     sütun konumu `ix` için erişilebilir FREE bırakma satırları `Rel(ix)` (açık gökyüzüyle iniş satırından Vinç
     Alanı'na kadar, BFS'te erişilebilenler). Sonuç yalnızca şu sınıflara göre değişir; her sınıftan **bir** temsilci
     (sınıf içindeki en alçak bırakma: düşüşte cam riskini en aza indirir, balonda yükseliş penceresini en genişe açar):
     1. **Yönlendirmesiz, rüzgârsız** (W8 yok ya da 2 genişlikli blok): en alçak bırakma (iniş yalnızca sütuna bağlı).
     2. **Rüzgâr (W8, 1 genişlik):** `d = 0` sınıfı (blok siluete oturmuş / balon tavan satırında bırakılmış; kayma yok,
        E-17, E-35) ve `d ≥ 1` sınıfı (kayma var); ikisi de erişilebilirse iki aday. Balonda `d = |bırakma − tavan|`,
        bu yüzden tavan satırının **üstünden** bırakmalar da (`d ≥ 1`, tavana iner) ayrı sınıftır.
     3. **G-L (1 genişlik, `gravity.build = 'low'`):** her `atRow` için ona izin veren en alçak bırakma: düşüşte
        `atRow ∈ [iniş, bırakma]` olduğundan bırakma = `min {r ∈ Rel(ix) : r ≥ atRow}`; balon yükselişinde
        `atRow ∈ [bırakma, tavan]` olduğundan en alçak bırakma `min Rel(ix)` bütün `atRow ≥` onu kapsar (≤ 10 satır ×
        2 yön; rüzgâr varsa her `d` sınıfı için ayrı, `d = 0` sınıfında bırakma tavan satırıdır). Böylece kaynak sütunun iniş satırı hedef sütundaki çıkıntı altı boşluğun
        tabanından alçak olsa da, daha yüksekten bırakılıp o satırda yönlendirilen aday üretilir (GDD K-19 madde 6).
     Cam blokta (S3) her sınıf temsilcisinin `d`'si ayrıca `glassThreshold` ile karşılaştırılır; kırılan aday üretilmez
     (hatalı yerleşim gibi). Aday sayısı sütun konumu başına ≤ 1 + 2 + 20 → dallanma yalnızca W8/G-L bölümlerinde artar.
     Testler: "K-19 solver steers under overhang from higher release", "W8+S8 balloon at ceiling avoids drift",
     "W8 solver emits d=0 and d>=1 classes", "S3 solver picks lowest release per class".
   - RAIL: tamamen şantiyedeki her erişilebilir RAIL düğümü.
   - Boya kapısı: her aday `(düğüm, via)` çiftiyle üretilir (§4.2); boyalı renkle doğru olan yerleşimler de adaydır.
     Ayrıca o geçide erişebilen parçalar için "geçitten geçip sahaya dön" saha hamleleri (`via` dolu) üretilir
     (Bölüm 22 niyeti: boya, sonra duvar üstünden yerleştir; S-21 GDD). Dallanma yalnızca bu parçalarda ×2.
   - Hatalı yerleşimler üretilmez (hamle yakar, şantiyeyi değiştirmez; geri sekme bir saha hamlesine denktir — tek
     istisna "başlangıç doluysa düşerek başka yere sekme"dir, pratikte baskın; sınırlama raporda belirtilir).
2. **Saha hamleleri (budanmış, brif §12 "anlamlı saha hamleleri"):** `Blockers` kümesindeki parçalar için (aşağıda) +
   **hedef engelleyicileri** (aşağıda; K-41, K-42, S4, W7) + **bekleme adayı:** bölümde zamanlı mekanik varsa (W4, W5, S5, S6, Y4; K-40 solver'da yok) ve bu düğümde en çok
   1 tane: geçerli saha hamleleri içinden `Blockers` dışındaki bir parçanın, gerekli koridorlara en uzak dinlenme
   düğümüne giden hamlesi (yoksa `Blockers`'tan ilk aday). Gerekçe: kapalı kepenk, yanlış satırdaki kayar kapı/asansör,
   arkadaki döner platform yüzü ya da ıslak blok yüzünden şu an doğru yerleşim yoksa ve `Blockers` boşsa hiçbir hamle
   üretilmez ve bölüm yanlışlıkla `unsolvable` olurdu; her hamle zamanlayıcıları eşit ilerlettiği için tek temsilci
   yeterlidir (hangi parçanın kımıldadığı ikincildir). Test: "W4 solver waits for shutter with empty Blockers".
   `Blockers` kuralları:
   - *Gerekli parça* q: rengi ve şekli kalan plan bölgesinde en az bir yere sığan, şantiyeye geçebilen parça.
   - q'nun şu an doğru bir yerleşimi yoksa: diğer parçaları "içinden geçilebilir, girilen her farklı parça +1 maliyet"
     sayan 0-1 BFS ile q'nun en ucuz koridoru bulunur; koridordaki parçalar `Blockers`'a girer (kazı / tünel açma).
     Tutulamayan engel hücreleri (canlı kasa Y1, torba Y2, zincirli blok Y3) BFS'te aynı biçimde geçilebilir (+1)
     sayılır ama kendileri hamle üretmez; koridora giren böyle bir hücrenin yerine onun **4-komşu tutulabilir
     parçaları** (`neighbors4`, aynı bölge; K-35 adım 5 komşu etkisi) `Blockers`'a girer.
   - Kamyon kuyruğu doluysa `dropColumns` tepesindeki parçalar da `Blockers`'a girer (yer açma).
   - Hedefler: parçanın erişilebilir "dinlenme" düğümleri (zemin ya da altında dolu hücre) arasından, gerekli
     parçaların koridorlarına uzaklığı en büyük ilk **6** düğüm (+ saha yerçekimi açıksa iniş düğümleri).

   **Hedef engelleyicileri (GDD K-28 "bütün ek hedefler", K-41, K-42, OBSTACLES S4/W7; E-27):** kazanma ek hedefleri
   de ister ve yapı bitince şantiye kapanır (E-27); bu hamleler üretilmezse ek hedefli bölüm (ör. LEVELS Bölüm 12
   `clear crate 6`: yapı biter, kasalar kalır, doğru yerleşim ve `Blockers` boş) yanlışlıkla `unsolvable` olurdu. Düğümde
   şu parçalar da saha hamlesi üretir (hedef düğümleri `Blockers`'takiyle aynı kural; doğru yerleşimlerini madde 1
   zaten üretir):
   - `clear: crate` eksikse her canlı kasanın, `clear: chain` eksikse her zincirli bloğun 4-komşu tutulabilir
     parçaları (adım 5); saha yerçekimi açıksa (Y6) ayrıca bu 4-komşu parçaların altını boşaltan tutulabilir parçalar
     (komşu düşer, adım 6 düşüş komşuluğu — Y1 "düşüş öncesi hücreleri").
   - Şantiyede moloz varsa (S4: dilim alanında moloz varken tamamlanmaz; `clear: debris` hedefi) aktif/öndeki
     dilimdeki her tutulabilir molozun sahaya bırakma hamleleri (sahadaki dinlenme düğümleri; şantiyede başka yere
     bırakma geri seker, üretilmez).
   - `collect: screw` eksikse her toplanmamış vidanın, kapalı bir `locked` geçidi varsa (W7) eşleşen anahtarın hücresini
     **örten** nesne: tutulabilir parçaysa onun hamleleri; tutulamıyorsa *gerekli parça* gibi koridoru (`Blockers`
     kuralı); kasaysa onun 4-komşu tutulabilir parçaları (kasa yok olunca nesne toplanır, K-42).
   - Ek hedefler tamamsa, şantiyede moloz yoksa ve kapalı geçit yoksa küme boştur (dallanma değişmez). Yapı tamamken
     (E-27) yalnız bu hamleler + bekleme adayı üretilir.
   Testler: "K-41 solver completes clear crate goal" (Bölüm 12 fikstürü; eski kural `unsolvable` verirdi), "K-41 solver
   frees chains for clear chain goal" (Bölüm 24 benzeri), "K-42 solver uncovers screws for collect goal" (Bölüm 19
   benzeri, 2 vida kasa altında), "W7 solver uncovers key to open locked gap", "S4 solver moves debris out before
   segment completes" (Bölüm 17 benzeri).
3. Sıralama: doğru yerleşimler önce (duvar üstü olanlar raydan önce — YAO eşitlik bozucusu), sonra saha hamleleri.

Beklenen dallanma: doğru yerleşim 0–8, budanmış saha hamlesi 5–25 (ek hedef, moloz ya da kapalı geçit varsa + ≤ 10)
→ **b ≈ 6–40**.

### 9.4 Arama

**Sezgisel (kabul edilebilir — admissible):**
`h(s) = max( Σ_renk ⌈R_c / M_c⌉ + max(D, [R > 0 ∧ şu an hiç doğru yerleşim yok]), [ek hedef eksik] )`
- `R_c`: kalan (tüm dilimler) `c` renkli plan hücresi; `M_c`: bölümün **tüm partilerinde** `c` rengine sahip ya da
  boya kapısıyla `c` olabilecek, şantiyeye geçebilen blokların en büyük hücre sayısı (≤ 4; bölüm başına **sabit**;
  Kamyon Yardımı kapalı olduğu için `B1` teslimatı ya da `reshape` bu sınırı değiştirmez, §9.1). `D`: şantiyede kalan
  moloz sayısı (S4). `[ek hedef eksik]`: K-41 ek hedeflerinden en az biri tamamlanmamış.
- Kabul edilebilirlik: her hamle tam bir parçayı taşır. Yerleştirme hamleleri: her biri en çok bir blok yerleştirir,
  blok tek renklidir ve ≤ `M_c` hücre kaplar → en az Σ⌈R_c/M_c⌉. Yerleştirme olmayan hamleler: her moloz ayrı bir
  hamleyle sahaya gitmelidir (moloz hiçbir yerde doğru olamaz, K-16 koşul 2; şantiyede başka yere bırakma geri seker)
  ve şu an doğru yerleşim yoksa sıradaki hamle yerleştirme olamaz → en az `max(D, [·])`; iki küme ayrık olduğu için
  toplanır. Eksik ek hedef en az bir hamle daha ister, ama bu hamle bir yerleştirme de olabilir (adım 5 komşu etkisi),
  bu yüzden toplanmaz, `max` alınır. Cam cezası maliyeti yalnızca artırır. Dolayısıyla `h` gerçek kalan hamle sayısını
  asla aşmaz.
- Tutarlılık (consistency): `M_c` sabit olduğu için bir yerleşim ilk terimi en çok 1 azaltır ve o anda `[·] = 0`,
  `D` değişmez (iç `max` düşmez); yerleştirme olmayan bir hamle ilk terimi değiştirmez, `D`'yi en çok 1 (tek parça)
  ve `[·]`'i en çok 1 düşürür, iç `max` en çok 1 düşer. `D` artmaz (sahadaki moloz şantiyeye bırakılırsa geri seker),
  ek hedef sayaçları geri gitmez (solver Geri Al ve Çekiç kullanmaz; K-41 "hedef tamam kalır") → son terim en çok 1
  düşer. Tutarlı fonksiyonların `max`'ı tutarlıdır → `h(s) ≤ 1 + h(s')`. (`M_c` o anki sahadan hesaplansaydı kamyon
  büyük blok getirdiğinde `h` tek hamlede 1'den fazla düşebilir, tutarlılık bozulurdu.) Tutarlı `h` ile kapalı küme
  yeniden açma gerektirmez; A* bulduğu ilk çözümde (budanmış hamle kümesi içinde) optimaldir. Test: "K-41 solver
  heuristic admissible and consistent with goal and debris terms" (küçük fikstürlerde budamasız BFS mesafesiyle
  karşılaştırma: her durumda `h ≤ d*` ve her kenarda `h(s) ≤ 1 + h(s')`).

**Algoritma:** A* + transpozisyon tablosu (açık uçlu adresleme, `Uint32Array` anahtar şeritleri + `Int16Array` en iyi `g`;
2²² giriş ≈ 64 MB). IDA* seçilmedi: saha hamleleri çoğunlukla sırası değiştirilebilir (commute) olduğundan aynı durumlar
çok kez yeniden açılır; A* + TT bunu bir kez yapar.

**Katmanlı arama (dilimli bölümler):** dilim tamamlanması doğal bir kesme noktasıdır (teslimat orada gelir).
Katman k = "dilim 0..k−1 tamam" durumları. Her katmanda A* dilim k'yi bitiren durumlara gider; katman içinde sezgisel
`h_k` yalnızca dilim k'nin kalan hücrelerinden ve dilim k'deki molozdan hesaplanır (katman hedefine göre kabul
edilebilir kalsın diye); ek hedef terimi yalnız son katmanda vardır, son katmanın hedefi `levelWon`'dur (bütün dilimler
+ bütün ek hedefler, K-28; yapı bitip hedef eksikse arama E-27 durumunda hedef hamleleriyle sürer). En iyi `B = 64`
farklı bitiş durumu (önce `g`, sonra tamamlanmış ek hedef birimi çok olan, sonra "saha açıklığı" puanı) sonraki
katmanın tohumudur.
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
  digs: number;                     // çözümdeki saha hamlesi (doğru yerleşim olmayan sürükleme) sayısı → §9.8 kapsamı
  stats: { expanded: number; generated: number; ttHits: number; maxDepth: number; avgBranching: number; ms: number };
}
```

- **YAO seçimi (K-46 "eşit hamleli çözümler arasında YAO'su en yüksek olan"):** açık listesinde eşitlik bozucu bunu
  garanti etmez (A* ilk hedefte durur). Yöntem: hamle maliyeti sözlük sırasıyla `(hamle, −duvarÜstü)` tek tamsayıda
  tutulur: `c = K − [duvar üstü doğru yerleşim]`, `K = 128` (> en büyük `moves` 99, böylece daha az hamle her zaman
  kazanır); sezgisel `h' = (K − 1)·h` (`h ≤ kalan hamle` ve `duvarÜstü_kalan ≤ kalan hamle` olduğundan kabul edilebilir;
  `h(s) ≤ 1 + h(s')` olduğundan tutarlı kalır). Böylece TT her durum için "en az hamle, sonra en çok duvar üstü" yolunu
  tutar. Durumda kilitli parça kümesi belli olduğundan doğru yerleşim sayısı `P` durumun fonksiyonudur, `duvarÜstü` yola
  bağlıdır. İlk hedef `g*` hamleyle bulunduktan sonra arama `f ≤ K·g*` olan düğümler bitene kadar sürer; `g*` hamleli
  bütün hedef durumları arasından `duvarÜstü / P` en büyük olan (eşitlikte küçük Zobrist) seçilir. Katmanlı/beam
  sonuçlarda (`heuristic`) aynı kural katman içinde uygulanır, garanti yazılmaz. Test: "K-46 max YAO among min-move
  solutions" (iki eşit hamleli çözümü olan elle kurulmuş tahta).
- **Solver golden'ları (Faz 3):** `tests/golden/level_NNN.json`: çözüm + `eventLogHash`. Test, çözümü çekirdekte
  oynatır: `levelWon` olmalı ve olay günlüğü karması eşleşmeli. Kural değişikliği karmayı değiştirirse `npm run
  golden:update` ile bilinçli güncellenir (§12.2; kapsamı yalnız bu dosyalardır).
- **El çözümü golden'ları (Faz 2'de Bölüm 1–5, Faz 3'te 6–10):** LEVELS §2'deki adımlar (product-lead hücre hücre
  doğruladı) `tests/golden/level_00N.hand.json`'a çevrilir. Faz 2'de yalnız 1–5 (D-059, §14.1 #9); 6–10 Faz 3'te, bölüm
  JSON'ları ve gerektirdikleri engel eklentileri (W2, Y5, W3 …) geldikçe eklenir (efor §14.2 "Solver … golden'lar"
  kalemi içinde). Faz 3'te solver çözümü bunlarla karşılaştırılır (min ≤ el çözümü). Dosya biçimi
  (`tests/golden/hand.test.ts` zod/mini şeması `GoldenSchema`):

  ```ts
  interface HandGolden {
    level: number; source: string;                // "docs/LEVELS.md §2 Bölüm N — Çözüm …"
    budget: number;                               // LEVELS "Hamle bütçesi" (= bölüm JSON `moves`)
    minMoves: number;                             // LEVELS "Minimum hamle (el çözümü)" = steps.length = log.length − 1
    movesLeft: number;                            // budget − minMoves (kazanma anındaki sayaç)
    yao: { overWall: number; rail: number };      // LEVELS "YAO (çözüm)"; overWall / (overWall + rail) ≥ 0,6 (K-46)
    steps: {                                      // LEVELS §2 adım tablosunun okunur kopyası, hamle başına bir satır
      piece: string;                              // LEVELS harfi (yalnız hata iletisinde)
      ref: string;                                // 'piece:<i>' (parti 0, tablo sırası) | 'piece:k<p>_<i>' (kamyon partisi)
                                                  //   → CompiledLevel.tutorialPieceIds (§2.3, §8.2 ile aynı kimlik kuralı)
      shape: ShapeId; color: ColorCode;           // bölüm verisiyle eşleşmeli
      from: [number, number];                     // hamle öncesi saha çapası ("(x,y)'den kaldır")
      entry: 'overWall' | 'gap'; gap?: number;    // FREE duvar üstü / RAIL(gap)
      lands: [number, number];                    // inen / bırakılan çapa (görünen dilim, genel koordinat)
      segmentCompleted?: number;                  // bu hamlenin adım 8'inde biten dilim (K-22)
      delivered?: [ref: string, x: number, y: number][];   // adım 9'da sahaya inen kamyon blokları, FIFO sırasıyla
      queue?: string[];                           // hamle sonu kuyruk, FIFO ("Kamyonda: N" çipi, K-26)
    }[];
    log: SessionAction[];                         // oynatılan TEK kaynak: §6.1 / §11.1 `inLevel.actions` biçimi, [0] = start
    eventLogHash: string;                         // 16 hex, §6.3
    finalAscii: string[];                         // son durum, Ek A satırları
  }
  ```

  Çeviri kuralı: "duvar üstünden x = c üstüne taşı → bırak" = Vinç Alanı satırında FREE düğüm `{ ix: c, iy: 8, mode: 0 }`;
  "geçitten sağa kaydır → (x, y)'de bırak" = RAIL düğüm `{ ix: x, iy: y, mode: 1 + gap }`. Bölüm başına üç test:
  (1) **çeviri** — `ref` → parça, şekil, renk ve bütçe bölüm verisiyle eşleşir; `log[0]` = `{ kind: 'start', preBoosters:
  [], streakTier: 0 }`, kalanı yalnız sürükleme; (2) **"K-28 K-46 level N …"** — `GameSession` (strict) her hamlede
  başlangıç hücresini, girişi (`pieceMoved.entry/gap`), iniş çapasını, `overWall`'ı, dilim tamamlanmasını, FIFO
  teslimatı ve kuyruğu, durum değişmezlerini denetler; yasak olay yoktur (`moveCancelled`, `placementWrong`,
  `pieceBounced`, `mortarStuck`, `glassBroke`, `pieceReturned`, `outOfMoves`, `deadlockDetected`, `truckHelp`); sonda
  `won`, `movesMade = minMoves`, `movesLeft`, `wrongCount = 0`, YAO, `finalAscii`, `eventLogHash`; (3) **"K-43 level N
  …"** — `GameSession.replay(log)` tamponu canlı oturumla bit bit aynı. Kırmızıda okuma sırası: (1) kırmızı → golden ile
  bölüm JSON'u uyuşmuyor (önce LEVELS §2'ye, sonra JSON'a bak; bölüm verisi product-lead'in); (1) yeşil, hücre/karar
  kırmızı → kural sorusu (GDD geçerli); yalnız `eventLogHash` değişti → bilinçli olay günlüğü değişikliği: günlük
  incelenir, karma (ve gerekirse `finalAscii`) **elle** güncellenir — `golden:update` el golden'larına dokunmaz.

### 9.6 Playtest botları (`tools/playtest-bot.ts`)

| Profil | Davranış |
| --- | --- |
| acemi | %60 olasılıkla varsa rastgele bir doğru yerleşim; yoksa rastgele saha hamlesi ya da rastgele şantiye bırakma (hatalı olabilir). Gizli `?` hücresinde rengi tahmin eder (dilimin renklerinden rastgele). G-H'de %15 olasılıkla bloğu indirmeden 700 ms'de düşürür |
| orta | Açgözlü: varsa doğru yerleşim (en alt satır, büyük blok, duvar üstü öncelikli); yoksa (ve yapı tamamken, E-27) §9.3 `Blockers` ∪ hedef engelleyicilerinden bir hamle (eksik ek hedef, moloz ya da kapalı geçit varsa önce hedef engelleyicisi); ikisi de boşsa bekleme adayı. `repeat` gizli planı doğru çıkarır, `mirrorOf`'ta %70 doğru. G-H'de %5 geç kalma |
| usta | Solver rehberli: önbellekteki çözümü izler; %10 olasılıkla rastgele bir geçerli hamle yapar ve ardından **sabit düğüm bütçeli** (2 000 açılım ≈ masaüstünde 30 ms) yerel arama ile yeniden plan kurar — süre değil sayaç, böylece bot sonucu makineden bağımsız ve seed'le belirlenimci |

- Her oyun `seed = hash32(level.seed, profileIndex, gameIndex)` ile deterministik.
- 500 oyun × 3 profil × 50 bölüm = 75 000 oyun; hamle başına ~0,3–1 ms → tek çekirdekte ~20–30 dk, 8 işçiyle
  **~3–5 dk**. `--games 100` hızlı mod (CI). Profil parametreleri `tools/bot-profiles.json`'da (product-lead ayarlayabilir).
- Çıktı: `docs/LEVEL_REPORT.md` (bölüm başına kazanma oranı, ortalama kalan hamle, hatalı yerleşim, kayıp nedenleri:
  `outOfMoves` / kilitlenme / cam, Kamyon Yardımı sayısı) + `docs/level-report/difficulty.svg` (bağımlılıksız elle
  üretilen SVG: kazanma oranı eğrisi + hedef bantlar).
- `--continue N` (product-lead + entrepreneur isteği): hamle bitince en çok N kez +5 alınır; rapora "+5 sonrası kazanma
  oranı" sütunu (hedef %70–85) eklenir. Ekonomi sütunları (`config/economy.json` ödülleri, `firstEverOfferFree` ve
  `rewardedAdOffer` tavanlarıyla): "altın / 10 bölüm", ödemeyen profil için **medyan altın bakiyesi** (Bölüm 11–50 bandı
  400–1.500; 30. bölümde > 2.500 ya da 10 bölüm < 200 uyarı) ve **kayıp kurtarma karışımı** (altınla %15–25, reklamla
  %30–40, kurtarılmayan %40–50) — R-16 ölçütü, META §9. Faz 3 ekonomi simülasyonu bu çıktıdır; Usta Sandığı ayar
  kuralı (`250 + 50 · ceil((900 − G)/50)`, G = medyan) aynı rapordan beslenir.

### 9.7 Kilitlenme (K-30) ve Kamyon Yardımı — GDD'nin üç yolu (R-02)

**Tespit** (K-35 adım 12; yalnızca bölüm sürüyorsa; toplam ≤ 2 ms, D3 hariç). Saf sorgu
`detectDeadlock(state, { d3 }): 'noMoves' | 'material' | 'tiling' | null` (`src/core/deadlock.ts`; D1 → D2 → D3 sırasıyla
ilk tutan); `runStep12` her yardımdan sonra aynı denetimleri kullanır, araçlar (§9.1, §9.8) `{ d3: false }` ile çağırır:
1. **D1 Hamle yok (`noMoves`):** hiçbir blok K-09'a göre tutulamıyor (her parça için en çok 4 komşu denemesi, µs).
2. **D2 Malzeme açığı (`material`):** bir renk `c` için kalan bütün dilimlerdeki boş `c` hücresi > **sahadaki +
   şantiyede yapışmış harçlı + kuyruktaki + teslim edilmemiş partilerdeki** ağır olmayan `c` blokların hücre toplamı
   (`c` renkli boya kapısı varsa o kapıdan geçebilen her ağır olmayan blok `c` sayılır, her blok bir kez). **Moloz
   bayraklı bloklar (S4) hiçbir terimde sayılmaz** — sahaya taşınmış moloz da, boya kapısından geçip `c` olabilecek moloz
   da (GDD K-30, K-16 koşul 2, E-44). Renk toplamı, µs; arz sayacı `supply[c]` parça tablosundan `!debris` filtresiyle
   tek geçişte kurulur.
3. **D3 Döşeme/erişim (`tiling`, MVP'de isteğe bağlı):** aktif dilimin kalan hücreleri mevcut bloklarla K-34 sırasına
   uygun ve fiziksel olarak uygulanabilir biçimde (açık gökyüzüyle düşüş ya da hizalanabilen geçitten ray; asansör/kayar
   kapı aralıkları dahil) döşenemiyor. 20 000 düğüm sınırlı kesin örtü DFS'i; **bütçe biterse "kilit yok" sayılır**
   (yanlış pozitifle bedava yardım verilmez). D3'ün MVP'de isteğe bağlı kalabilmesinin koşulu (GDD K-30) Kolay/Normal
   bölümlerde §9.8 ✓-tuzağı taramasının temiz çıkmasıdır (L-27).
K-34 gömülü delikleri kaynağında önlediği için şantiye kaynaklı kilit artık nadirdir; D3 çoğunlukla E-26 gibi
"sayı yetiyor ama şekil uymuyor" durumlarında tetiklenir.

**Yardım yolları** (`truckHelp`, ücretsiz, hamle harcamaz; sayısı sınırsız):
| Neden | Yardım | Uygulama |
| --- | --- | --- |
| D1 | önce bütün zincirler ve ıslaklık kalkar (`unchain`); hâlâ D1 ise saha yeniden dizilir (`reshuffle`) | zincir sayımı K-41'e göre (`clear: chain` sayılır); dizme aşağıdaki yapıcı algoritmayla, **şekil değişmez** |
| D2 | eksik hücre sayısı kadar o renkte `B1` kamyonla gelir (`deliverMissing`) | `deliverHelp(c, n)` (aşağıda): `B1`'ler kuyruğun sonuna eklenir ve **adım 12'nin içinde bir kez** teslim denenir; yer bulamayan kuyrukta kalır, sonraki hamlelerin 9. adımında FIFO ile denenir (E-23) |
| D3 | saha blokları renk başına hücre toplamı korunarak yeniden şekillendirilip dizilir (`reshape`; S-19 GDD yanıtı: yalnızca D3'te) | yapıcı algoritma, "yeniden kesme" izni açık |

**Sıra (GDD K-30 "Denetim ve yardım sırası D1 → D2 → D3"):** `runStep12(ctx)` D1'i denetler ve gerekiyorsa yardımını
uygular, sonra D2'yi, sonra D3'ü; her denetim bir önceki yardımdan sonraki durumda yapılır (D1 yardımı renk arzını
değiştirmez; D3, D2 teslimatından sonraki durumda bakıldığı için eksik malzeme yüzünden gereksiz `reshape` üretmez).
**Güvence denetimi (madde 4) yardımların hepsinden sonra en sonda bir kez** yapılır. Hiçbiri tutmazsa adım 12 olay
üretmez.

**D2 yardım teslimatı (`deliverHelp`, GDD K-30 "D2 teslimatının zamanı ve sütunu", K-25'in tek yazılı istisnası):**
1. Eksik her renk `c` için `n_c` adet `B1_0` parçası (renk sırası `Color` enum sırası: W, Y, G, R, O, C, B, P — belirlenimci)
   **`x = 5`** ile oluşturulur (`dropColumns` yok, bayrak yok) ve kamyon kuyruğunun **sonuna** eklenir.
2. **Aynı adımda bir kez** yalnızca bu yardım `B1`'leri, dizideki sırayla tek tek, K-25 aday sırasıyla denenir:
   aşama 1 sütun 5, aşama 2 yok, aşama 3 kalan sütunlar 5'e uzaklıkla (4, 3, 2, 1, 0); `y = 10 − 1`'den yerçekimi
   ayarından bağımsız düşer, bütün hücreleri `y ≤ 7` olan ilk aday seçilir (adım 9 ile **aynı** `tryDeliver` fonksiyonu,
   yalnız aday listesi bu `B1`'lerle sınırlı). Kuyruktaki eski bloklar bu denemeye **girmez**, sonraki hamlenin 9.
   adımını bekler. Teslimat düşüşü komşu etkisi üretmez, sahayı oynatmaz (K-25).
3. Yerleşen `B1`'ler `pieceFell{cause:'delivery', step: 12}`, kalanlar `deliveryQueued` (kuyruk boyu) yayınlar;
   `truckHelp{kind: 'deliverMissing', delivered}` hepsini listeler. `deliveryArrived` yayınlanmaz (o adım 9 partisidir;
   öğretici `deliveryDone` yalnız adım 9'u sayar, §8.2). Yardım `B1`'lerine `arrivedTurn` gerekmez (ıslak değiller).
Örnek (GDD K-30): sütun 5'te en üst dolu hücre y = 4, 4 `B1` R → (5,5), (5,6), (5,7), dördüncüsü sütun 4'ün tepesine.

**Yapıcı (constructive) dizme algoritması** — deneme-yanılma değil, çözümü inşa ederek garanti eder:
1. Aktif dilimin kalan hücreleri için seed'li RNG ile bir döşeme `T` ve K-34'e uygun yerleşim sırası bul (D3'teki
   DFS). `reshuffle`'da yalnızca sahadaki mevcut bloklardan seçer; `reshape`'te mevcut hücre/renk bütçesinden yeniden kesebilir.
2. Sahadaki tüm hareketli blokları kaldır (engeller yerinde kalır). Şaşırtmacaları (decoy) alttan, sütun sütun yerleştir.
3. `T`'nin bloklarını **ters yerleşim sırasıyla** üste koy: ilk gereken blok en üstte ve duvara en yakın sütunda olur;
   her yerleşimden sonra bloğun erişilebilirliği BFS ile denetlenir.
4. **Güvence (GDD K-30 "≤ 2 hamlede doğru yerleşim"):** önce 1 hamlelik doğru yerleşim aranır (BFS + `isCorrectPlacement`,
   ≤ 1 ms; sınırlı ve belirlenimci). Yoksa **belirlenimci iş bütçeli** 2 hamle denetimi: çekirdekte saat yoktur (§1.3,
   `performance`/`Date.now` yasak) ve K-43 tekrar oynatması ile golden `eventLogHash` cihaz hızından bağımsız olmalıdır;
   bu yüzden GDD'deki "20 ms bütçe" bir **açılım sayısına** çevrilir: `HELP_CHECK_MAX_EXPANSIONS = 32` birinci-hamle
   açılımı (her açılım = bir saha hamlesi uygulanır + o durumda 1 hamlelik doğru yerleşim araması; ≈ 0,1–0,15 ms
   masaüstü, referans orta cihazda ≈ 0,6 ms → 32 açılım ≈ 20 ms). Birinci hamleler §9.3 saha hamlesi sırasıyla
   (`Blockers` önce, düğüm numarası artan) denenir. Sabit `src/core/deadlock.ts`'te dışa aktarılır, Faz 3'te referans
   cihazda ölçülüp ≈ 20 ms'ye kalibre edilir; değeri değiştirmek `rulesVersion`'ı artırır (§11.1 devam koruması).
   Bütçe sonuç bulmadan biterse ya da arama "yok" derse yardım **D3 `reshape`'e yükseltilir** (GDD K-30 "o da
   bulamazsa"); yapıcı düzen güvencesiz kabul **edilmez**. `reshape` çıktısı inşa yoluyla doğru yerleşimi garanti
   ettiği için (adım 3, ilk gereken blok en üstte ve erişilebilir) onun sonrası yeniden denetlenmez, yalnızca 1 hamlelik
   denetim test iddiası olarak koşar. D1/D2 yardımından sonra da aynı sıra geçerlidir. **Simülasyon (GDD K-30):** 1 ve 2
   hamle denetimleri tam hamle hattıyla yapılır — birinci hamle `applyMove` ile adım 0–11 çalıştırılarak (`NULL_SINK`,
   kopya tampon, `{ noTruckHelp: true }`; adım 12 ve dolayısıyla özyinelemeli yardım yok) uygulanır, böylece kuyrukta kalan yardım `B1`'leri
   (ve eski kuyruk, FIFO) **1. hamlenin 9. adımında** teslim edilir; yer açan bir hamle + `B1`'in yerleşimi 2 hamle
   denetimini karşılar (E-23). Testler: "K-30 help guarantee
   deterministic under CPU throttling" (1× ve 6× CDP yavaşlatmada aynı `eventLogHash`), "K-30 exhausted check
   escalates to reshape", "K-30 reshape output has a 1-move correct placement".
5. `truckHelp{kind, moves | delivered}` olayı (JUICE #21'in üç varyantı: "eksik malzeme geldi", "zincirler çözüldü",
   "saha yeniden dizildi").

**Pahalı (kesin) alternatif — reddedildi:** rastgele karıştır + tam solver ile doğrula + tutmazsa tekrarla. Çalışma
zamanında saniyeler sürebilir ve tekrar sayısı sınırsızdır; yalnızca araçlarda (bot raporunda) çapraz denetim olarak
kullanılır.

**Boya ile oluşturulan açık (S-30, GDD K-30 yanıtı):** D2 teslimatı `B1` olarak kalır. Gerekçe (product-lead): boya
kapısıyla rengi bilerek bozmak eksik her hücre için en az 1 hamle kaybettirir, istismar net negatiftir. Kodda ek dal yok.

Testler: "K-30 D1 removes chains and wet first", "K-30 D2 delivers missing B1 bricks", "K-30 D3 reshape keeps color
cell totals", "K-30 help guarantees a correct placement within 2 moves", "K-30 D2 supply counts stuck mortar blocks",
"K-30 help order D1 then D2 then D3 with one final guarantee check", "K-30 example help B1 land in step 12" (GDD K-30
örneği), "E-23 help B1 delivered in step 12 at x = 5" (saha dolu: `B1`'ler kuyrukta, sonraki hamlenin 9. adımında
düşer; güvence 2 hamle denetimiyle), "E-44 debris is not supply for D2" (sahada 2 hücrelik R moloz, planda 2 R → D2,
adım 12'de 2 `B1` R), "E-26 …", "E-37 …" (§6.4), "E-42 offer acceptance runs step 12 once" (§6.1).

### 9.8 ✓-tuzağı (çıkmaz) taraması — `levels:solve --traps` (L-27; LEVELS §5 F-3 ölçütü, GDD K-30 D3 koşulu)

GDD K-30'a göre D3 MVP'de isteğe bağlıdır; koşulu, Kolay ve Normal bölümlerde gölgenin ✓ gösterdiği hiçbir yerleşimin
D1/D2'nin yakalamadığı kesin çıkmaza götürmemesidir. Bu aşama LEVELS §5'teki ölçütü her bölümde ölçer; LEVELS §0'daki
F-3 karalama betiğinin proje kodundaki karşılığıdır. **Takvim:** solver'la birlikte Faz 3'te yazılır (§14.2); Faz 2'de
Bölüm 1–5 için LEVELS §0 F-3 betik sonuçları ve el çözümü golden'ları geçerlidir, Faz 3'te 1–50 hepsi `--traps` ile
yeniden taranır (LEVELS §0 "Faz 2–3'te aynı tarama").

**Ayarlar:** `applyMove(…, { noTruckHelp: true })` (§9.1); Mala, güçlendiriciler, +5 teklifi yok (§9.2). Hamle
bütçesi `B = level.moves`. `kazı` = solver'ın seçtiği en kısa çözümdeki (§9.5) saha hamlesi sayısı (doğru yerleşim
olmayan sürüklemeler). **Erişim kapsamı** `E = kazı + 1` saha hamlesi (`--trap-extra`, varsayılan 1; Bölüm 1–6'da
kazı 0 → `E = 1`; yanlışlıkla sahaya bırakma da bir saha hamlesidir, K-07 satır 2).

**Aşama 1 — gevşetilmiş saha oyunu (kazıdan bağımsız, önce):** saha boş sayılır; şantiyeye geçebilen her ağır
olmayan, moloz olmayan blok (sahadaki + kuyruktaki + teslim edilmemiş partilerdeki; partiler K-22/K-25'e göre dilim
tamamlandıkça eklenir) her an alınabilir. Hamle = böyle bir bloğun boş sahada tek başına dururken `beginDrag` BFS'inin
ulaştığı bir doğru yerleşimi (gerçek kurallar: açık gökyüzü, ray hizası, zamanlayıcılar, K-34; §9.3 madde 1'in bırakma
sınıfları). Gerçek oyunun **üst kümesi** olsun diye ayrıca: zincir, ıslaklık ve kilit (W7) yok sayılır (kilitli geçit
açık); boya kapısından geçip sahaya dönme (renk değişir) bir hamledir; şantiyedeki moloz her an tek hamleyle
kaldırılabilir; zamanlı mekanikli bölümlerde "bekle" (`turn + 1`) hamlesi vardır. Bitiş = yapı tamam (ek hedefler
burada aranmaz). Durum = şantiye + kalan blok çoklu kümesi + `turn mod L`; memo'lu DFS. Gerçek oyunun her kazanan
dizisinin yerleştirme / moloz / bekleme alt dizisi bu oyunda da oynanabildiği için bu oyunda bile bitmeyen durum
**malzeme/döşeme çıkmazıdır** (kesin çıkmaz; derin arama gerekmez). Ayrıca başlangıçtan bu oyunda ✓ ile girilen
bitmeyen durumlar sayılır ("gevşetilmiş tuzak"; kapsamda erişilmeyenler bilgi amaçlıdır, LEVELS §0 tablosu).

**Aşama 2 — kapsam araması (kazılı tam arama):** başlangıçtan genişlik öncelikli; hamleler **budanmaz**: her tutulabilir
parçanın bütün doğru yerleşimleri (§9.3 madde 1'in bırakma sınıflarıyla) ve bütün saha hamleleri (parçanın her
erişilebilir dinlenme düğümüne; şantiyeden sahaya moloz dahil), en çok `E` saha hamlesi ve toplam ≤ `B` hamle. Zamanlı
mekanikli bölümlerde hatalı yerleşim (geri sekme) zamanlayıcıları ilerlettiği için bir saha hamlesi gibi sayılır;
diğerlerinde durumu değiştirmediği için üretilmez. Düğüm = (Zobrist, kullanılan saha hamlesi); aynı tahtaya giden
farklı hamleler tek düğümdür. Kapsam grafiğinde kazanma durumlarından geri yayılımla `d*(p)` (kalan en kısa yol)
bulunur; `g(p) + d*(p) = min` olan `p` "bir en kısa çözümün üzerindedir" (kapsam dışına çıkan en kısa çözümler
sayılmaz). Bir ✓ yerleşimle girilen her ayrı durum `s'` aşağıdaki gibi sınıflanır.

**Aşama 3 — sınıflama:**
1. **Kesin çıkmaz:** aşama 1 `s'`'yi bitiremiyorsa doğrudan; değilse önce solver A*'ı (§9.4, budanmış; bulduğu çözüm
   çözülebilirliği kanıtlar ve `d⁺(s')` üst sınırını verir), bulamazsa budamasız derin arama (kazı sınırsız, hamle
   sınırsız) — çözüm yoksa kesin çıkmaz.
2. **Verimli oyuncu bütçe tuzağı:** `p` bir en kısa çözümün üzerinde, `p → s'` bir ✓ yerleşim ve `s'`'den kalan
   `B − g(p) − 1` hamle içinde çözüm yok. Önce `d⁺(s') ≤ kalan` denenir; olmazsa budamasız, derinliği `kalan` ile
   sınırlı arama (paylaşılan TT: `(Zobrist, kalan) → çözülür / çözülmez`).
3. **İsraf sonrası bütçe aşımı:** en kısa çözümün üzerinde olmayan (gereksiz hamle yapılmış) bir durumdan ✓ ile
   girilen, çözülebilir ama kalan bütçeyle çözülemeyen `s'` — kabul edilir (+5 teklifi yolu açık), yalnız sayılır.
4. **Yardımla kurtarılır (LEVELS §5 "D1/D2'nin yakaladığı durumlar çıkmaz sayılmaz"):** sınıf 1 ya da 2'ye düşen `s'`'de
   ya da aramanın ondan eriştiği bir durumda saf `detectDeadlock` (§9.7) D1 ya da D2 veriyorsa (adım 12 yardımı gelir)
   `s'` hata sayılmaz, `caughtByHelp` olarak sayılır. D3 bu ayrıma girmez: ölçülen tam da D3'süz oyundur.

**Bütçe ve maliyet:** aşama 2 ve derin aramalar bölüm başına tek belirlenimci açılım sayacını paylaşır
(`--trap-budget`, varsayılan 2 000 000); sayaç biterse kalan durumlar **belirsiz** (`trap_scan_incomplete`) olarak
raporlanır, sessizce temiz sayılmaz. Tahmin: `E ≤ 3` olan Kolay/Normal bölümde kapsam 10⁴–10⁶ düğüm × 60–150 µs →
bölüm başına ≤ 2–3 dk; 50 bölümün ilk taraması 8 işçiyle ≈ 10–20 dk, sonra önbellekten (`levelHash` + `solverVersion`).

**Çıktı ve ciddiyet (L-27, `rule: 'K-30'`):**

| `code` | Koşul | Kolay / Normal | Zor / Çok Zor |
| --- | --- | --- | --- |
| `trap_dead_end` | ✓ ile girilen kesin çıkmaz (sınıf 1; sınıf 4 değil) | error | warn |
| `trap_budget` | verimli oyuncu bütçe tuzağı (sınıf 2; sınıf 4 değil) | error | warn |
| `trap_scan_incomplete` | açılım bütçesi bitti, belirsiz durum var | warn | warn |

Her bulguya en kısa erişim dizisi (`SessionAction[]`) ve Ek A ASCII tahtası eklenir (debug panelinde "ASCII'den yükle"
ile açılır). Sonuç `artifacts/solver/level_NNN.traps.json`: `{ levelHash, solverVersion, scope: E, counts: {
relaxedTraps, relaxedTrapsInScope, deadEnds, caughtByHelp, budgetTraps, wasteOverBudget, undecided }, findings[] }`.
`levels:bot` LEVEL_REPORT'u yazarken bu dosyalardan "✓-tuzağı" tablosunu ekler (LEVELS §0 tablosunun sütunları: Min,
YAO, kapsam, gevşetilmiş tuzak, çıkmaz, israf sonrası bütçe aşımı; LEVEL_REPORT'un tek yazarı `levels:bot`'tur);
`levels:solve --traps` tek başına aynı tabloyu stdout'a basar. Zor/Çok Zor uyarıları LEVEL_REPORT'ta listelenir;
bölüm notundaki kurtarma yolu (D1/D2/D3) product-lead'indir. Testler: "K-30 trap scan reproduces F-3 results for levels
1–10" (LEVELS §0 tablosunun "sonra" değerleri; Bölüm 10 tablodaki gibi `--trap-extra 0`), "K-30 trap scan flags old
level 5 data as trap_dead_end" (LEVELS Bölüm 5 eski verisi), "K-30 trap scan does not count D1/D2-caught dead ends",
"K-30 relaxed dead end skips deep search", "K-30 trap scan budget exhaustion reports undecided".

---

## 10. Render (Phaser 4.2.1)

### 10.1 Oyun yapılandırması

```ts
new Phaser.Game({
  type: Phaser.AUTO,                                  // WebGL (Phaser 4'te WebGL1 bağlamı); Canvas yalnızca yedek (deprecated)
  parent: 'game', width: 1080, height: 1920,
  backgroundColor: tokens.color.chapter.ch1.skyTop,                 // sahne değişince o bölümün skyTop'u
  scale: { mode: display.scaleMode === 'fit' ? Phaser.Scale.FIT : Phaser.Scale.EXPAND,   // R-06: ikisi de desteklenir
           autoCenter: Phaser.Scale.CENTER_BOTH,
           ...(display.scaleMode === 'expand'                                             // EXPAND sıkıştırması (aşağıda)
             ? { max: { width: 1080, height: tokens.meta.scale.expandMaxHeight } } : {}) },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  fps: { target: 60, smoothStep: true },
  input: { activePointers: 2, windowEvents: true },
  scene: [BootScene, SplashScene, HomeScene, PreLevelScene, LevelScene, StoryScene, BridgeScene, LeagueScene, ShopScene],
});
```

- **FIT ve EXPAND birlikte (R-06; öneri P-7 = design-lead P-4, proje sahibi seçer):** 1080×1920 = 0,5625 en-boy.
  360×800 Android'de FIT ile ekranın **%20'si** (160 px) boş kalır; 390×844 iPhone'da güvenli alanlar çıkınca
  (≈ 390×763) **%9**. EXPAND görünür alanı uzun eksende büyütür (oyun boyu 1080 × 1920…`meta.designHeightMax` 2400),
  tasarım genişliği 1080'de sabit kalır. Seçim tek ayardır (`src/config/display.ts → scaleMode`; D-015
  KABUL: `'expand'`; brif `'fit'`).
- **EXPAND sıkıştırması (tek formül, iki uygulama):** Phaser 4 `Scale.EXPAND` oyun boyutunu ekran oranına göre büyütür ve
  `scale.max`'a sıkıştırır (`node_modules/phaser/src/scale/ScaleManager.js`, EXPAND dalı; `min` verilmez): uzun ekranda
  genişlik 1080, yükseklik `1080 · vh / vw` en çok `meta.scale.expandMaxHeight` (2400), fazlası letterbox; geniş ekranda
  (oran < 1080 / 1920) yükseklik 1920, genişlik 1080'e sıkışır, fazlası pillarbox. Düzen bunun saf karşılığını kullanır
  (`src/theme/layout.ts`; testler ve sahne aynı `H`'yi görür):

  ```ts
  export function designHeight(mode: ScaleMode, viewport: Viewport, tokens: Tokens): number {
    const s = tokens.meta.scale;                 // fitHeight 1920 · expandMinHeight 1920 · expandMaxHeight 2400
    if (mode === 'fit') return s.fitHeight;
    const natural = Math.round((tokens.meta.designWidth * viewport.height) / viewport.width);
    return Math.min(s.expandMaxHeight, Math.max(s.expandMinHeight, natural));
  }
  ```

  Sahne `scale.on('resize')`'da `createLayout(tokens, designHeight(scaleMode, scale.parentSize, tokens))` kurar (Phaser'ın
  kesirli `gameSize.height`'ının yuvarlanmış hali; `createLayout` `[fitHeight, expandMaxHeight]` dışını reddeder). Test
  "R-06 design heights": FIT 1920; EXPAND 390×844 → 2337, 360×800 → 2400, 360×900 → 2400 (sıkışır), 768×1024 → 1920
  (pillarbox).
- **Çapa sözleşmesi** (`theme/layout.ts`, `Layout.recompute(H)`; `scale.on('resize')`) — tek kaynak tokens
  `layout._doc` (design-lead; UX §0.1, §5.1). Grup, öğenin y değerinden değil **token grubundan** belirlenir:
  - `layout.grid.*`: yalnızca x ve hücre ölçüleri; H'den bağımsız.
  - `layout.top.*` (duraklat, panorama, hedefler, hamle sayacı, üst çubuk): **üstten**, y değeri olduğu gibi.
  - `layout.bottom.*` (karakter, güçlendirici çubuğu, alt navigasyon, Oyna düğmesi): **alttan**; `*BottomPx` öğenin alt
    kenarından ekranın alt kenarına uzaklıktır → `y = H − bottomPx − h`.
  - `layout.board.*` (vinç alanı `craneTopY`, tahta `boardTopY`/`boardBottomY`, **durum şeridi** `statusY`/
    `statusBottomY`, **"Yapı tamam!" kurdelesi** `siteRibbonY`): `y' = y + (H − 1920) × board.expandShare` ile kayar
    (UX §5.1 "durum şeridi tahta grubuna aittir"; kurdele "tahta grubu; EXPAND'de tahtayla birlikte kayar"). Kurdelenin
    `siteRibbonX`, `siteRibbonW`, `siteRibbonH`, `siteRibbonTiltDeg`, `siteRibbonNotchPx` değerleri H'den bağımsızdır.
    Örnek H = 2400, `expandShare` 0,5: `statusY` 1504 → 1744 (alta çapalama 1984 verirdi; yanlış).
  - `layout.popup.*` (tokens `layout.popup._doc`, UX §0.1, D-015 çapa sözleşmesi): **alttan çapa** — panel alt kenarı
    `y = H − popup.panelBottomPx` (296), seçenekler panel alt kenarından `optionsBottomInsetPx` (64) yukarıda alttan
    üste dizilir (`optionH` 152, `optionGap` 24); **dikey ortalama yok** (ortalanan kısa ya da çok seçenekli pencerede —
    "Hamleler bitti", can, mini satın alma — ilk düğme başparmak bölgesinin dışına, y < 1056, çıkıyordu). EXPAND'de
    panel tabanla birlikte aşağı iner.
  FIT'te `H = 1920` olduğundan bütün formüller birim dönüşümdür; aynı kod iki modda da çalışır. Tokens'ta grup yoksa
  kod grup uydurmaz: eksik anahtar geliştirmede açılış hatasıdır (§10.2). Testler (`tests/theme/layout.test.ts`):
  §2.2 değişmezleri (tokens `_doc`'taki iki çapa koşulu dahil), `layout.popup._doc` değişmezi
  `1920 − panelBottomPx − optionsBottomInsetPx − 3·optionH − 2·optionGap ≥ 1056` (bugün 1056 = 1056, sınırda) ve
  "UX 0.1 popup options anchored to bottom, never vertically centered" (1, 2 ve 3 seçenekli pencerede ilk düğmenin üst
  kenarı FIT'te ≥ 1056), H = 1920 ve 2400'de üst/tahta/alt grupları çakışmaz,
  dokunma hedefleri (görsel + pay, `layout.touch.hit`) ≥ `touch.minTargetPx`, "UX 5.1 status strip moves with board".
- **Dokunma hedefi (UX §0.1 karar (b), 2026-10-06):** `layout.touch` tokens'tan okunur ve `H`'den bağımsızdır:
  `minTargetPx` = `touch.minTargetPx` (128 px **her genişlikte**; 375 pt'de 44,4 pt, 390'da 46,2 pt, 360 dp'de 42,7 dp —
  bilerek kabul), `hit(r)` = UX §0.3 "görsel + pay" (kısa kenar iki yana eşit payla 128'e), `blockHit(cell)` = blok
  hücresi + `touch.hitSlopPx` (120 → 180). Telafi değişmezi (token değil, test): UX §0.1 kapalı listesindeki sık
  hedeflerin (düğmeler, pencere seçenekleri 920×152, güçlendirici yuvası 172, blok + pay 180, Bölüm düğmesi 176, alt
  navigasyon 176, sayısal tuşlar) kısa kenarı ≥ 144 px (= 360 dp'de 48 dp). Testler: "UX 0.1 44 pt rule decision (b) …"
  (`tests/review/services-theme.review.test.ts`) ve `tests/theme/layout.test.ts`.
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
| Plan hücresi (`plan_<W..P>`) | 8 renk | içe `plan.insetPx` (8 px), köşe `plan.cornerRadiusRatio` (0,14c); **önce tebeşir altlık `color.board.planUnderlay`, üstüne `color.block.X` alfa `a`** (`a` = `alpha.planFill`, renk körü modunda `a11y.colorBlindPlanFill`); kontur `plan.strokePx` **kesik** (`plan.dash`). Renkler **formülle hesaplanır** (tokens `check._doc`): bileşik = `planUnderlay`·(1 − a) + `color.block.X`·a; kontur = bileşik × `plan.strokeFactor` (kanal başına). Sembol %100, mürekkep `color.planInk.X` (hazır token; beyaz olanlar `alpha.planInkLight`); bevel/parlama/gölge yok. `check.plan.X` / `check.planStroke.X` yalnızca `tests/theme/tokens.test.ts` içinde okunur (formül ±1, yalnız varsayılan mod); kod `check.*`'ı okumaz — böylece renk körü modunda (`a` farklı) kontur da doğru çıkar |
| `.` hücresi | 1 + birleşik pencere çerçeve parçaları | dolgu yok; 45° beyaz `alpha.planEmptyHatch` tarama (`plan.hatchWidthPx`/`hatchSpacingPx`), kesik kontur `alpha.planEmptyStroke` |
| İnşa cephesi hücresi (`plan_<W..P>_front`, K-34 R-01) | 8 renk | plan hücresi tarifi; yalnız **dolgu** `plan.frontLighten` (%15) beyaza karışır (bileşik × 0,85 + beyaz × 0,15; renk körü modunda o modun bileşiğinden), kesik kontur açılmış dolgudan × `plan.strokeFactor`; **sembol ve mürekkep değişmez** (ART §4 cephe katmanı 1, ASSET §3) |
| İnşa cephesi konturu (`plan_front`) | 1 | yalnız düz kontur `plan.frontStrokePx` (`color.board.buildFront`) + dış parlama `alpha.buildFrontGlow`; dolgu, açıklık ve sembol yok (ART §4 cephe katmanı 2); cephe hücresinin üstüne konur, `?` cephe hücresi açıklık almaz, yalnız kontur |
| Plan dışı şantiye hücresi (`board_blueprint_deep`) | 1 | düz `color.board.blueprintDeep` dolgu; ızgara, benek, köşebent yok (ART §4 "Plan dışı", ASSET §3); aktif dilimde `y ≥ h + e` hücreleri (GDD K-03, K-16 `outside`) |
| Eksik destek taraması (`plan_support_hatch`, K-34) | 1 | yatay çizgi `plan.supportHatchWidthPx` / `supportHatchSpacingPx`, `color.ghost.support` × `alpha.supportHatch` (45° renk taramasından desen olarak ayrı) |
| Hatalı hücre taraması (`ghost_hatch45`, UX §5.4; Faz 2 tur 1 #1) | 1 | 45° çizgi, aynı kalınlık/aralık/opaklık, `color.ghost.invalid`; birincil neden `debris`/`outside`/`window`/`color` iken o nedenin hücrelerinde (çekirdek `reasonCells(state, pieceId, cells, reason)`; `support`'un hücresi yoktur, eksik destek taraması kullanılır); yalnız Kolay/Normal (gölge `wrong` tonunda), 2 Hz nabız |
| Düşüş yolu (`ghost_path`, UX §5.4; Faz 2 tur 1 #2) | 1 | 6 px beyaz kesik dikey şerit (8/12), 8 satır boyu (1024'lük sayfaya sığar); sahne her dolu sütunda bloğun alt kenarından gölgenin üst kenarına kırpar, %35 alfa; rayda ve iptal öngörüsünde yok (token önerisi design-lead'e: `alpha.ghostPath`, `plan.ghostPathDash`) |
| Tavan kirişi (`board_ceiling_beam`, S8) | 1 + 2 kelepçe | yatay boru `plan.ceilingBeamPx`, `color.board.scaffold` + uçlarda `color.board.scaffoldClamp`; aktif dilimin plan tepesinde, asansörle birlikte kayar |
| `?` hücresi | 1 | beyaz %10 dolgu, kesik kontur, `plan.hiddenTagPx` kâğıt etiket + "?" |
| Ozalit ızgara kaplaması | dilim başına 1 saydam doku | ince/kalın ızgara (`alpha.blueprintLine`/`Major`); **plan hücrelerinin üstünden, blokların altından** geçer (§10.3) |
| Bayrak kaplamaları | cam, harç, balon, zincir, ıslak + 9 sayaç rakamı | blok üstüne ayrı görüntü (ART §3 bayrak tablosu) |
| Engeller, duvar/geçitler, şantiye zemini, parçacık | ART §4–§6 | |
| Gölge rozetleri (`ghost_badge_ok/_warn/_support/_glass/_cancel`) | ✓, !, **↓ (K-34 eksik destek)**, çatlak cam, ↩ | `a11y.ghostBadgePx` (renk körü modunda `colorBlindGhostBadgePx`) |

**(b) Bölüm başında blok pişirme** (`level-<id>` sayfası, 2048×1024; gerekirse ikinci sayfa): bölümde geçen her
**(şekil × renk × bayrak kümesi)** birleşimi için **bir parça dokusu** (≤ 3c × 3c = 360×360; tipik bölümde ≤ 24 adet).
Tarif ART §3 birebir: dış kenarlar `block.insetRatio` içe çekik, kesintisiz dış kontur (`block.outlinePx`, taban ×
`outlineFactor`), yuvarlak dış köşe (`cornerRadiusRatio`), **içbükey köşe** (konturun 6 px çeyrek yayı, yarıçap 0,06c;
4-komşu maskesinin bilemediği çapraz bilgi parça düzeyinde bilinir), bevel ve alt gölge bantları yalnızca açık
kenarlarda, **parlama hapı parça başına tek**: üstü ve solu açık hücreler arasından satırı en üstte olan, eşitlikte
sütunu en solda olan hücreye 1 hap (`block.glossRect`, `alpha.gloss`; ART §3 katman 4) — ör. üstte tek hücre (x2),
altta üç hücre (x0–x2) olan L parçasında (2,1) ve (0,0) adaylardır [hücre (x, y), y yukarı], hap yalnızca üstteki (2,1)'e
çizilir; iç dikiş, sembol. Test: "ART gloss pill once per piece at top-left open cell".
**Sembol mürekkebi kuralı** (ART §2.2) **her zaman formülle**: taban `color.block.X`'in L*'ı ≥ `block.symbolLightThresholdLstar`
ise taban × `block.symbolDarkFactor` (%100 opak), değilse beyaz × `alpha.symbolWhite`. `check.symbolInk.X` yalnızca
`tests/theme/tokens.test.ts`'te formülle (±1) karşılaştırılır; kod onu okumaz. Her şekil için ayrıca **siluet dokuları**:
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
- Ölçüler `tokens.layout.grid.cellPx` (120) ve `tokens.block.*` / `plan.*` oranlarından gelir; `/9` formülü yoktur (R-04).
- Çizim fonksiyonları `src/theme/draw/*.ts` içinde **saf Canvas2D** fonksiyonlarıdır (`(ctx, spec, tokens) => void`);
  aynı fonksiyonlar `tools/level-preview.ts` tarafından Chromium içinde PNG üretmek için kullanılır (çift çizim kodu yok).
- Değerler `src/theme/tokens.json`'dan okunur (design-lead, D-003; salt okunur). `tokens.ts` dosyayı zod/mini ile
  doğrular; eksik anahtar geliştirmede açılış hatasıdır. Zod şeması yalnızca tokens'ta **var olan** yolları ister
  (`color.chapter.chN.skyTop`, `drag.fingerOffsetCells`, `layout.grid.*`, `layout.board.*`, `layout.top.*`,
  `layout.bottom.*`, `audio.sfx.*`, `audio.seq.*` …; `_doc` anahtarları yok sayılır). `check.*` grubu çalışma anı şemasına
  girmez; yalnızca `tests/theme/tokens.test.ts` hazır renk ↔ formül (±1) tutarlılığını denetler.
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
  siluetlerle; spot ışığı 4 dikdörtgen + 4 çeyrek daire görüntüsüyle. Uygulama (Faz 2 tur 1): koyu katman canlı
  dörtgenler (`Graphics.fillRect`), yuvarlak koyu köşeler ve beyaz kenar oyun başına bir kez çizilen küçük `tut_spot`
  dokusunun parçalarıyla (4 köşe + 4 yay + 4 gerilmiş beyaz şerit / delik; `spotPieces.ts`) — spot değişimi doku
  yüklemez (pişmiş `Graphics` kenarı bütün deliklerin kutusu kadar doku yüklüyordu: 4×'te sürüklemenin en uzun karesi).
  Ses bankası ön-çizimi (`SoundBank.pump`) yalnız basış/sürükleme yokken çalışır.

### 10.3 Sahne düzeni ve nesneler

- `LevelScene` katmanları (derinlik; tahta kısmı ART §4 "katman sırası" ile birebir): arka plan → tahta zemini (saha,
  duvar, ozalit zemin) → plan hücreleri →
  **ozalit ızgara kaplaması** (plan hücresinin üstünden geçer, bloğun üstünden geçmez) → **inşa cephesi konturu**
  (`plan_front`, K-34 R-01) → yerleşmiş bloklar → **tavan kirişi** (`board_ceiling_beam`, S8; bloğun önünde) → düşüş
  gölgesi (ART "gölge" katmanı: siluet + rozetler ✓ / ! / ↓ / çatlak cam / ↩ + eksik destek taraması `plan_support_hatch`
  boş plan hücrelerinin üstünde) → sürüklenen blok (en üstte) → efektler → HUD (`ui/`). Test (sahne
  duman): derinlik değerleri bu sırayla artar.
- `PieceView` = tek pişirilmiş parça `Image` (§10.2b) + değişen kaplamalar (ıslak sayacı). Blok görüntüleri bölüm
  sayfasından, plan ve kaplamalar açılış atlasından → toplu çizim (hedef ≤ 15 draw call).
- Albüm (R-19, D-028 "Sonra"): MVP'de alt navigasyonda Takım gibi kilitli "Yakında" sekmesi; Albüm sahnesi, kart
  verisi ve "Albüme eklendi" animasyonu MVP'de yazılmaz. Yapı kartı yalnız `story.ch1.end` Panel 4'te (`cut_ch1_end_p4`)
  ve yalnız gösterilir; diğer bitiş sahneleri (`story.ch2.end` … `story.ch5.end`) STORY §4'teki son panelleriyle
  kapanır (UX §8). Kayıtta Albüm alanı yoktur (Sonra: migration ile eklenir).
- Tahtaya tek bir görünmez etkileşim bölgesi konur; tutma testi hücre koordinatından `yardOcc`/`siteOcc` ile yapılır
  (blok başına Phaser isabet testi yok). Dokunma payı `tokens.touch.hitSlopPx` (design-lead 12 → 30 px önerdi; kod
  değeri okur): blok kutusu bu kadar genişletilir; aynı noktayı birden çok blok kapsıyorsa dokunuş **en yakın hücre
  merkezine** sahip bloğa gider.
- Panorama (K-06): tamamlanan dilimlerin küçük kopyaları atlas karelerinden ölçeklenmiş `Image`'larla çizilir
  (dilim başına ≤ 16 görüntü); RenderTexture gerekmez.
- **Şantiye kapalı — "Yapı tamam!" (UX §5.1, GDD E-27, K-07 satır 5, D-035):** `ui_site_ribbon` prosedürel çizilir
  (ASSET; ölçü, eğim ve V kesik `layout.board.siteRibbon{X,Y,W,H,TiltDeg,NotchPx}`, dolgu `ui.gold`, kenar `ui.goldDark`),
  metni `Label` `build.done`; etkileşim bölgesi değildir (dokunuş tahtaya geçer). `EventPlayer`: son dilimin
  `segmentDone` dizisi (JUICE #18) bitince bölüm kazanılmamışsa (ek hedef eksik) JUICE #89 — kurdele
  `duration.siteClosedRibbon`, ardından eksik `clear` sayacına 3 nabız (her biri `duration.goalNudge`); kurdele bölüm
  sonuna kadar kalır. `moveCancelled{ reason: 'siteClosed' }` (§6.3) → JUICE #90: #8 dönüşü + kurdele bir kez sallanır
  + 1 nabız (`goalNudge`). İptal öngörüsü §4.3 `siteClosed` sınıfından (gölge çizilmez). JUICE #89–90 Faz 2 P0 dışında
  (JUICE §0 kural 12); 1–5'te `clear` hedefi olmadığından durum ilk kez Bölüm 12'de oluşur, sunum §14.3 Faz 5 "JUICE
  tamamlama" kalemindedir (çekirdek iptali K-07 satır 5 Faz 2'de).
- `Label`: Phaser `Text`; yalnızca değer değişince güncellenir (hamle sayacı hamle başına 1 kez).

### 10.4 Nesne havuzu

`Pool<T>` (`acquire`/`release`/`prewarm`): `PieceView` (48 hazır), plan hücresi `Image` (≤ 80), gölge görüntüsü (2),
sayaç etiketleri. Parçacık: doku ailesi başına bir `ParticleEmitter` sahne açılışında oluşturulur, `explode()` ile
kullanılır; `particles.maxOnScreen` bütçesi `maxAliveParticles` ile emitter'lara bölünür (en eski patlama erken söner),
`particles.win` dalga başına 40 × 2 dalga. Bölüm geçişinde
sahne yok edilmez; `LevelScene.reset(level)` havuzları boşaltıp yeniden doldurur → bölümler arası geçişte tahsis yok.
Uygulama (Faz 2 tur 1 #17): ana ekrana dönüş `scene.switch(Home)` ile `LevelScene`'i **uyutur** (havuzlar, HUD ve
pişmiş dokuları kalır); ana ekranın bölüm düğmesi `scene.run(Level, { levelId })` ile uyandırır, `WAKE` olayı
`startLevel` (reset yolu) çalıştırır; uyurken gelen yeniden boyutlanma uyanışta uygulanır. Harness
`state().levelCreates` + duman testi "TECH 10.4 … woken, not created again".

### 10.5 Girdi

§4.4–§4.7. Ek ayrıntılar: BFS `pointerdown`'da hemen yapılır; görsel kaldırma (`duration.pick` 80 ms)
`drag.startThresholdPx` / `holdMs` aşılınca başlar; eşik altında bırakma dokunmadır (K-07). Parmak ofseti
`tokens.drag.fingerOffsetCells` (1,2). Sürükleme sırasında `input.activePointers` ikinci parmağı yok sayar.
`pointerupoutside` = mevcut düğümde bırakma. Animasyon sırasında girdi §6.3 (R-12); G-L yönlendirme girdisi §4.7.
Faz 2 tur 2 #12: blok kalkıkken `DragController.update` her karede de `follow` çağırır (olay işleyicisindeki çağrı tek
kare tepkiyi korur): parmak dururken parmak ofseti kayması, JUICE #1 zıplaması ve #4 esnemesi biter, `DragFeel` hızı
söner ve ip sayacı karelerle işler (dinlenen parmakta ip ve 3° yaslanma görünür); değişiklik yoksa çekirdeğin `follow`'u
önbellekteki `stay` sonucunu döndürür (düğüm değişimi ve sinyal yok). Dokunma (eşik altı bırakma, UX §5.3) `EventPlayer.tapped`
ile oynar: 1 hücre zıplama, azaltılmış harekette ≤ %3 ölçek nabzı, iki kipte de hafif haptik (Faz 2 tur 2 #13).

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
(gölge = önceden çizilmiş hücre görüntüleri). Sürükleme karelerinde doku yükleme ve soğuk kod yok (Faz 2 tur 2 #11):
Usta Dede balonları metin ve kutu genişliği başına bir kez kurulur, **kurulurken pişirilir** (`SpeechBubble.prebake` →
`bakeNow`: `BakedGraphics` aksi halde ilk görünür karesinde tuval + doku yükler) ve saklanır (bölümün adım satırları bölüm
başında, `TutorialOverlay.prepare`; bağlamsal satır sürükleme sırasında açılmaz), JUICE #55 / #57 başlık metinleri bölüm
başında kurulur (`EventPlayer.startLevel`; dil değişince yenilenir; kazanma karelerinde metin dokusu yok), ses bankası
ana ekranın boş karelerinde de doldurulur (`HomeScene.update` → `bank.pump`), `AudioContext` açılış ekranında oluşturulur (`AudioService.prepare`,
etkinleştiren ilk girdi yalnız `resume()` + sessiz tampon) ve sürükleme yolu bölüm başında bir kez kuru çalıştırılır
(`warmDragPath`: `tryBeginDrag`, `follow`, `classify`, `computeFall`, `shadowLook`, gölge görüntüleri, görünümün kalkışı).

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
   yeni konumda çizildiği ilk rAF arasındaki fark (`DragController` pozu yazdığı olayda `DRAG_DRAWN_EVENT` yayar,
   örnekleyici o pozu çizen `POST_RENDER`'a kadar ms ve **kare sayısı** olarak ölçer); `Runtime.getHeapUsage` ile bellek.
6. Geçme ölçütü (brif §14): 4× yavaşlatmada **ortalama ≥ 50 FPS**, p95 ≤ 25 ms, sürüklemede > 50 ms uzun kare yok,
   girdi gecikmesi ≤ 1 kare. `tools/perf.ts` (Faz 2 tur 1 #16) CPU tarafında kapı: `drag` ve `win` için ortalama ≥ 50
   FPS ve p95 ≤ 25 ms, `drag`'de > 50 ms kare 0, FTUE ≤ 10 s; ölçülemeyen değer (`null`: kare yok, örnekleyici bozuk)
   **FAIL**; girdi gecikmesi kare sayısı olarak raporlanır (SwiftShader'da kare temposu yazılımsal GPU'nun → gösterge). **FTUE kapısı:** soğuk başlangıç, 4× CPU + CDP "Fast 4G" (web ilk ziyaret), gezinme
   başlangıcı → `window.__levelInteractive` ≤ 10 s (giriş sahnesinin 3 paneli dahil, UX §2.1: dokunmadan 8,2 s +
   1,8 s yükleme aşım payı = 10,0 s; Phaser paket ayrıştırması payın içinde). Yükleme sırası: font +
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
  başarısızsa yedekten dene → o da bozuksa varsayılanlarla başla. Ana kayıt bozuksa bozuk metin
  `minikusta.save.corrupt`'a konur (yalnız yerelde; gönderilmez) ve tanılama halka tamponuna yazılır; kurtarma yazımı
  (yedekten ya da varsayılanlarla kurulan kaydın `minikusta.save`'e yazılması) **bittikten sonra** bir kez
  `save_corrupt{ stage, recovered }` analytics olayı gönderilir (ANALYTICS §2 v5, §3 sırası): `stage` = ana kaydın
  başarısız olduğu ilk adım (`'parse' | 'migrate' | 'validate'`), `recovered` = `'backup'` (yedekten kuruldu) ya da
  `'defaults'` (yedek de bozuk; ilerleme kaybı). Her migration'ın test fikstürü vardır (eski sürüm JSON → beklenen yeni
  JSON). Test: "ANALYTICS save_corrupt sent once after recovery write (backup and defaults)".
- Yazma: anlamlı olaylarda (bölüm sonu, satın alma, yıldız harcama, ayar değişimi), **her commit edilen hamleden sonra**
  (bölüm içi kayıt, aşağıda) ve `visibilitychange: hidden` / `pagehide` / Capacitor `pause`'da (birleştirme
  beklenmeden, hemen; G-L `pending` varsa **önce** `flushPending()` ile commit edilir, §4.7); diğer yazımlar 500 ms
  birleştirme (debounce).
- İçerik (v1): ilerleme (en yüksek bölüm; bölüm başına `levels[id] = { won: boolean, attempts: number }`, GDD §14 —
  `attempts` yeni deneme başlarken +1, devam (`inLevel` tekrarı) artırmaz; yalnızca `level_start.attempt` için), yıldız, altın, can + `regenAnchor` +
  `unlimitedLivesUntil` + ayrılmış can, güçlendirici envanteri + verilen ücretsiz denemeler, galibiyet serisi, kasaba
  görevleri + görülen sahneler, günlük ödül döngüsü, sandıklar, kumbara, etkinlik katılımları (`eventId`,
  katılım zamanı, deneme başına teklif sayısı, tur harcaması), ayarlar (erişilebilirlik dahil), analytics kimliği,
  `installId` (yalnızca Lig `groupId`'si için), ömürdeki ilk +5 teklifinin kullanıldığı (`firstOfferGiftUsed`, K-29),
  görülen bağlamsal ipuçları (`seenContextTips`), `inLevel`, bekleyen pencereler (`voidNotice`, `pendingChest`;
  aşağıda). Albüm alanı yok (R-19).

**Bölüm içi devam (R-13, GDD K-43 revizyonu, entrepreneur önerisi):**

```ts
interface InLevel {
  levelId: number; seed: number;                 // GDD K-43 madde 3 alanları (bu blok)
  preBoosters: PreBooster[]; streakTier: 0 | 1 | 2 | 3;   // m = 0 çıkışında iade / bonus tüketilmez (E-41)
  actions: SessionAction[];                      // 'start' + sürüklemeler (via, steer) + uygulanan güçlendiriciler (yalnız boosterApplied;
                                                 // reddedilen yazılmaz) + kabul edilen teklifler + undo
  offersUsed: number; adOfferUsed: boolean; offerSpendCoins: number;   // K-29, R-15, R-16 sayaçları
  outcomeWindow: 'none' | 'outOfMoves';          // açık kayıp penceresi (kaçış yolu yok); kazanmada inLevel zaten silinir
  levelHash: string; rulesVersion: number;       // teknik ek: levelHash(CompiledLevel.data) + RULES_VERSION (aşağıda)
  attemptId: string; startedAt: number;          // can bölüm başında ayrıldı (META)
}
```

- **`levelHash` — tek uygulama:** `src/core/session.ts → levelHash(data) = fnv1a64(canonicalJson(data))`. `canonicalJson`
  = her derinlikte anahtarları sıralanmış, `undefined` alanları atılmış `JSON.stringify` (anahtar sırası ve boşluk
  karmayı değiştirmez, her veri değişikliği değiştirir); `fnv1a64` = FNV-1a 64 (ofset `0xcbf29ce484222325`, çarpan
  `0x100000001b3`) metnin UTF-8 baytları üzerinde, 16 küçük onaltılık hane — `eventLogHash` ile aynı ilkel (§6.3,
  `core/moves.ts`). `services/save` bu fonksiyonu (ve `canonicalJson`'ı) **yeniden dışa aktarır**, ikinci uygulama
  yoktur; oyun, kayıt, debug paneli (§12.3) ve araçlar (solver / tuzak önbelleği §9.4, §9.8) aynı fonksiyonu çağırır.
  Girdi yüklenen bölüm verisidir (`CompiledLevel.data`, zod'dan geçmiş `LevelData`): deneme başında yazılır, devamda
  yeniden hesaplanıp karşılaştırılır. `rulesVersion` = `RULES_VERSION` (`core/session.ts`; kaydedilmiş bir günlüğün
  tekrarını değiştirebilecek her kural değişikliğinde elle artırılır). Testler `tests/services/save.test.ts`.
- Bölüm başında can ayrılır ve `inLevel` yazılır; her eylemden sonra (K-35 adım 12 bitince) `actions`'a eklenip
  hemen kaydedilir (≈ 50–150 bayt/hamle; bölüm başına ≤ 15 KB). Kaybedince/onaylı çıkışta silinir.
- **Kazanma (tek davranış, GDD K-43 "kazanma ekranındayken kapanırsa ödüller verilmiş sayılır"):** adım 11 `levelWon`
  gelince ödüller (yıldız, altın, Bonus İnşaat altını, kalan malaların altını, can iadesi, `levels[id].won`, sandık
  ilerlemesi, etkinlik ilerlemesi) **kazanma anında**, tek atomik kayıt yazımında verilir ve aynı yazımda `inLevel`
  silinir. Kazanma ekranı yalnızca sunumdur; ekran açıkken uygulama kapanırsa açılışta ana ekran gelir, ödül tekrar
  verilmez, kazanma ekranı yeniden gösterilmez (`outcomeWindow`'da `'won'` değeri yoktur). Bölüm sandığı ya da Usta
  Sandığı bu kazanmayla dolduysa aynı yazım `pendingChest` (`'level' | 'master'`) işaretini de yazar; sandık penceresi
  (UX §3.1) açılınca işaret silinir, pencere açılmadan uygulama kapanmışsa ana ekran açılışında bir kez açılır (UX §1
  (b); `voidNotice` varsa ondan sonra). Testler: "K-43 app killed on win screen keeps rewards once", "K-43 chest window
  pending after kill on win screen opens once on home".
- **Uygulama kapanması, arama, sistemin WebView'i öldürmesi kayıp sayılmaz.** Açılışta `inLevel` varsa oyuncu doğrudan
  bölüme döner (başka bölüm başlatılamaz): `GameSession.replay(level, actions)` belirlenimci çekirdekle durumu kurar (≤ 100 hamle × µs → < 5 ms; ara
  tamponlar Geri Al için son hamleye kadar tutulur). G-H sayacı ve animasyonlar sıfırdan başlar; olay oynatılmaz.
  Sürükleme ortasında kapanma = o sürükleme iptal (K-07 satır 1); G-L düşüşü sırasında kapanma = bırakılmış hamle
  yönlendirmesiz kayıtlıdır (§4.7 bekleyen hamle kuralı). Kazanma ekranı: yukarıdaki tek davranış. Köprü'de süre
  içinde başlatılan bölüm süre dolduktan sonra biterse de sayılır (E-38, META §6.1). Devam açılışında
  `level_resume { level, movesMade }` analytics olayı gönderilir (ANALYTICS §2).
- Kayıp penceresi açıkken (sayaç 0, kazanılmamış) kapatılırsa açılışta **aynı pencere** gelir (kaçış yolu yok):
  `inLevel.outcomeWindow = 'outOfMoves'` ise Duraklat penceresi açılmaz; tahta kurulur ve doğrudan UX §7 Pencere 1 aynı
  teklif numarasıyla (`n = offersUsed + 1`, aynı fiyat basamağı; reklam seçeneği §11.3 `canOfferAd` ile) açılır (UX §1
  (a)). Test: "K-43 loss window survives restart" bu açılışı da denetler.
- **Güncellemeyle geçersiz kalan deneme (GDD K-43 madde 4, E-45):** `levelHash` ya da `rulesVersion` uyuşmazsa
  (güncellemeyle bölüm ya da kural kodu değişmiş) tekrar oynatma güvenilmez → deneme **yeniden oynatılmaz** ve cezasız
  kapanır; deneme hiç oynanmamış sayılır, kayıp da kazanma da yoktur. `voidAttempt(inLevel)` tek atomik kayıt yazımında:
  - **İade edilenler:** ayrılan can; oyun öncesi güçlendiriciler (`preBoosters`); bu denemede kullanılan bölüm içi
    güçlendiriciler — `actions[]` taranır, her `hammer` / `crane` / `paint` / `undo` eylemi için ilgili envanter adedi
    +1 (tekrar oynatma gerekmez; eylem günlükte yalnız `boosterApplied` geldiyse yazıldığından sayım kesindir; Altın Mala
    envanter güçlendiricisi değildir, Mala Başlangıcı `preBoosters` ile iade edilir); bu denemede +5 tekliflerine ödenen
    altının tamamı (`offerSpendCoins`, `Wallet.apply` iade işlemi).
  - **Sallanan Köprü:** deneme sayılmaz (elenme yok, tahta yok); iade edilen altın tur harcamasından düşülür
    (`runSpend −= offerSpendCoins`, `bridgeSpendCapCoins` sayacı; E-45: 2.250 → 900). **Usta Ligi'ne** puan yazılmaz.
  - **Korunanlar:** galibiyet serisi bonusu tüketilmez (`streakTier` sonraki girişte aynen verilir), seri bozulmaz.
  - **Geri verilmeyenler:** izlenen reklamların günlük sayaçları (`AdsService`, `adOfferUsed` dahil) ve kullanılmışsa
    ömür ilk teklif hediyesi (`firstOfferGiftUsed`, K-29).
  - `inLevel` silinir, oyuncu ana ekrana döner ve aynı bölümü yeniden başlatabilir.
  - **Bekleyen bildirim (UX §1 (c)):** aynı atomik yazımda `voidNotice = { level, refunds: { life, boosters, coins },
    bridge }` yazılır: `level` = `inLevel.levelId` (`resume.void.body` `{n}`), `life` = iade edilen can (0 | 1; sınırsız
    can süresinde can ayrılmadıysa 0), `boosters` = güçlendirici kimliği → iade adedi (oyun öncesi + bölüm içi, aynı
    kimlik toplanır), `coins` = `offerSpendCoins`, `bridge` = deneme bir Sallanan Köprü turunda başlatılmıştı
    (`resume.void.bridge` satırı). Ana ekranın bu açılışında `resume.void` penceresi her şeyden önce (bekleyen ara sahne
    ve sandık penceresinden önce) açılır; "Tamam" `voidNotice`'i tek kayıt yazımında siler. "Tamam"dan önce kapanırsa
    sonraki açılışta aynı içerikle yeniden gelir; iade yalnız `voidAttempt`'tedir, bildirim yalnız sunumdur (iade
    tekrarlanmaz). Yerel tanılama kaydı (GDD K-43/4): tanılama halka tamponuna `{ levelId, cause, movesMade }`. Test:
    "K-43 void notice shown once on home and survives restart without second refund".
  - Analytics (ANALYTICS §2 v5, §3 sırası; atomik yazım **bittikten sonra**, bu sırayla): önce
    `level_resume_invalid{ level, movesMade, cause }` (`movesMade` = `level_resume` ile aynı tanım, `m`; `cause` =
    `'level_hash' | 'rules_version' | 'both'`), sonra `offerSpendCoins > 0` ise tek `coin_source{ amount:
    offerSpendCoins, reason: 'refund', balanceAfter }` (`Wallet.apply` iade işlemi; can, güçlendirici iadesi altın
    olmadığından `coin_source` üretmez). Deneme oynanmamış sayıldığından bu denemede `level_end`, `level_resume`,
    `life_lost` ve `event_eliminated` gönderilmez; `levels[id].attempts` geri alınmaz. Ortak parametreler (`coins`,
    `lives`) iade sonrası durumu taşır. Test: "K-43 level_resume_invalid then coin_source refund sent after void
    write" (E-45 verisiyle: `refund` 1.350; `offerSpendCoins = 0` iken `coin_source` yok).
- **Kayıp yalnızca** oyuncunun onaylı "bölümden çık"ında (`m ≥ 1`) ya da hamleler bitip teklif reddedilince olur.
  `m = 0` çıkışı cezasızdır (P-7 KABUL): can iade, oyun öncesi güçlendiriciler iade, seri bonusu tüketilmez (sonraki
  girişte aynen verilir). Çıkış onayı metni `m`'ye göre ayrılır (UX). Köprü'de `quitAfterFirstMove` aynı `m ≥ 1`
  koşuluyla elenme üretir.
- Testler: "E-38 …", "E-41 …", "K-43 app killed mid-level resumes same state", "K-43 m=0 exit is free and refunds boosters", "K-43 loss
  window survives restart", "K-43 level hash mismatch aborts without penalty", "E-45 invalidated attempt refunds life,
  boosters and offer coins and reduces bridge run spend" (Köprü, 1. teklif reklam + 2. teklif 1.350 altın, tur harcaması
  2.250 → 900; can, güçlendiriciler ve 1.350 altın iade; reklam sayacı ve ömür hediyesi geri verilmez; seri bonusu
  korunur; Lig puanı yok), "K-43 rulesVersion mismatch is treated like level hash mismatch".

### 11.2 `EventService` ve deterministik bot simülasyonu (R-14)

```ts
interface EventService {
  list(now: number): EventSummary[];                                   // aktif/yaklaşan etkinlikler
  join(eventId: string, now: number, playerLevel: number, installId: string): EventState;   // installId çağıran verir (save import yasak)
  reportLevelResult(eventId: string, r: { won: boolean; difficulty: Difficulty }, now: number): EventState;
  standings(eventId: string, now: number): Standings;                  // köprü: kalan sayısı; lig: sıralama
}
// MVP: LocalBotEventService (bu bölüm) · Sonra: RemoteEventService (backend) — aynı arayüz

// src/services/events/botSim.ts — SAF modül; imza yalnızca bunları alır (ödeme, altın, kayıt yok):
function simulateBridge(cfg: EventsConfig['wobblyBridge'], seed: BridgeSeed, t0: number, now: number,
                        L0: number, levelDifficulty: (level: number) => Difficulty): BridgeStanding[];
function simulateLeague(cfg: EventsConfig['masterLeague'], seed: LeagueSeed, joinAt: number, weekEnd: number,
                        now: number, tier: Tier): LeagueStanding[];
type BridgeSeed = { eventId: number };                  // META §6.2: katılım dakikası + etkinlik sıra numarası
type LeagueSeed = { weekId: number; groupId: number };  // META §7.1/§7.3: groupId = hash32(weekId, installId)
```

- **Tek kaynak `config/events.json` (product-lead, META §6–§7; R-02):** formül biçimi kodda, bütün parametreler
  config'ten okunur (zod/mini ile doğrulanır; config v2'de düzyazı formüller `_doc` alanlarında, kod onları okumaz).
  - Köprü botu `i` (1…99, META §6.2): beceri `s_i = skillMin + skillRange · R(i, 0, 0)` (0,50 + 0,45·R); `k`'inci deneme
    zamanı `t_{i,k} = t0 + Σ_{j=1..k} (min + floor((max − min + 1) · R(i, j, 1)))` dk (`attemptIntervalMinutes` 3–15 →
    `3 + floor(13·R)`); deneme zorluğu `d_k` = bölüm `L0 + k − 1`'in **özgün** zorluk etiketi (50'yi aşarsa Usta Modu
    sırası); kazanma olasılığı `p = clamp(s_i · difficultyFactor[d_k], winProbability.min, .max)` (0,05–0,97); sonuç
    `R(i, k, 2) < p` → 1 tahta, değilse elenme; 7. tahtada biter. Yalnızca `t_{i,k} ≤ t0 + durationMinutes` denemeleri
    yapılır (`attemptsOnlyBeforeDeadline`). Ödeme anı (META §6.1): `T_öde = min(T_son, max(T_oyuncu, T_bot))`; `T_son`
    oyuncunun süre içinde başlattığı bölüm sürüyorsa onun bitişine uzar.
  - Lig botu (META §7.3): `W_i = tierMultiplier[tier] · 100 · u²` (`u = R(i,0,0)`), geç katılım
    `W'_i = W_i · (1 − x0)`, profil `p_i = floor(5 · R(i,0,1))`, ilerleme `P_i(t) = floor(W'_i · g_p(x) / 1000)`,
    `x = (t − joinAt) / (weekEnd − joinAt)`; `g_p` = `curveTable[p]` (21 nokta, binde, `j = min(19, floor(20x))`)
    üzerinde doğrusal ara değer — `Math.pow` yok, motorlar arası bit-aynı (eski `powFixed` önerim gereksiz kaldı). Lig
    çarpanı uygulanan haftalarda botlara da aynı çarpan (META).
- **Sayaç tabanlı RNG (`config/events.json → rng`, META §6.2):** `R(a, b, c)` = `hash32(key…, a, b, c)`
  (`fmix32-chain-v1`) tohumlu `mulberry32`'nin ilk çıktısı / 2³²; `key` Köprü'de `eventId`, Lig'de `(weekId, groupId)`.
  Yalnızca + − × ÷ ve karşılaştırma → motorlar arası bit-aynı.
- **Tohum (R-14, BUSINESS E8):** bot durumu yalnızca `(eventId, t0, t, L0)` (Köprü) ya da `(weekId, groupId, joinAt, t)`
  (Lig) ile config'in fonksiyonudur; **ödeme geçmişi, cüzdan, bakiye, oturum davranışı girmez.** Kurulum kimliği yalnızca
  `groupId = hash32(weekId, installId)` içinde (META §7.1: grup oyuncuya özgü, ödemeden bağımsız) yer alır;
  `installId`'yi `join` çağrısında meta katmanı verir (`services/events/**` kaydı import edemez, §1.3);
  `LocalBotEventService` `groupId`'yi hesaplayıp `botSim`'e sayı olarak geçirir.
- **Ödeme geçmişinden bağımsızlığın üç kanıtı:** (1) imza yalnızca yukarıdaki parametreleri alır; (2) ESLint
  `no-restricted-imports` `services/events/**`'tan `meta/economy`, `services/save`, `services/iap`, `services/ads`,
  `services/analytics` importunu derlemede kırar (§1.3); (3) test **"E8 bot standings are independent of purchases"**:
  aynı etkinlik, `installId`'si aynı iki kayıt fikstürüyle (0 ↔ 50 satın alma, 0 ↔ 1 M altın, +5 kullanmış ↔ kullanmamış) çalışır,
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

- `config/economy.json` ve `config/events.json` (v2; product-lead + entrepreneur) zod/mini ile doğrulanır
  (`config:validate`); kodda sabit fiyat yok. v2'de yer tutucu dizge kalmadı; şema yine de `null`'u "kapalı / yer
  tutucu" sayar ve uyarı basar. Değer kuralları da şemadadır (ör. kumbara: `breakableAt` başına altın/USD ≥
  `priceDisplay.referenceSku` paketininki, R-16). Doğrulayıcı `tools/validate-config.ts`'tedir (`config:validate`,
  §12.2); `tests/config/validate.test.ts` aynı doğrulayıcıyı gerçek `config/*.json` üzerinde çalıştırır, böylece
  `npm test` / `check` bozuk config'te kırılır.
- **`bridge_share_cap` (D-024 koruması; META §6.2 "Koruma" ve "Doğrulama kuralı", `events.json → wobblyBridge._doc`,
  BUSINESS §4.5-8):** `config:validate` hata kuralı; bot modülü (`botSim.ts`) çağrılmaz, saflığı ve import yasakları
  (§1.3, §11.2) değişmez — denetim aracın kendi kapalı biçim hesabıdır.
  - **Denetlenen config'ler:** temel `wobblyBridge` ve her LiveOps birleşimi (`liveOps.overrides.wobblyBridge` boş
    değilse temel ⊕ override, aynı anahtarlar yer değiştirir — `prizePoolCoins`, `finisherExtras` …; ileride tema
    listesi olursa her öğe ayrı).
  - **Başlangıçlar:** hikaye `L_0 = wobblyBridge.unlockLevel … 50` (15–50) ve Usta Modu döngüsünün her başlangıcı
    `masterMode.levels[0] … levels[1]` (11–50). Pencere `planks` (7) bölümdür: `L_0, L_0 + 1, …`; 50'yi aşınca Usta
    Modu sırası (`sequential_loop`: 50 → 11). `d_k` = bölümün **özgün** zorluk etiketi (`levels/level_NNN.json →
    difficulty`; dosyası olmayan bölüm için L-18'in testere dişi tablosu `DIFFICULTY_PLAN`, aynı sabit).
  - **Hesap (META §6.2 "Beklenen sonuçlar", kesin):** `q(L_0) = (1 / skillRange) · ∫_{skillMin}^{skillMin + skillRange}
    Π_{k=1..planks} clamp(s · difficultyFactor[d_k], winProbability.min, winProbability.max) ds`. İntegrand parça parça
    tek terimlidir: aralık `winProbability.min / f_k` ve `.max / f_k` kırılma noktalarında bölünür, her parçada çarpım
    `c · s^m` olur ve `c · (b^{m+1} − a^{m+1}) / (m + 1)` ile kesin integrallenir (sayısal yaklaşık yok; kırpma
    dahil). `B ~ Binom(bots, q)`: `E = Σ_{k=0..bots} C(bots, k) q^k (1 − q)^{bots − k} · floor(prizePoolCoins / (1 + k))`.
    Koşul: `E + (finisherExtras?.coins ?? 0) < economy.json → outOfMoves.offerCosts[0]` (900); `finisherExtras.boosters`
    altın sayılmaz. Bozulursa `error` `bridge_share_cap` (config yolu, `L_0`, hikaye/Usta Modu, `E`, sınır) ve bilgi
    satırı olarak havuz tavanı (koşulu sağlayan en büyük `prizePoolCoins`, ikili arama; bugünkü modelle 6.863).
    Maliyet: 76 başlangıç × ≤ 15 parça + 100 terimlik binom → < 10 ms.
  - **Yeniden çalışma:** `config:validate` her çalışmada denetler; bot parametreleri (`bot.skillMin`, `skillRange`,
    `winProbability`), `difficultyFactor`, `bots`, `planks`, `masterMode.levels` ya da bölüm zorluk etiketleri değişince
    sonuç kendiliğinden yenilenir (META §6.2). Faz 3 `events:sim` Monte Carlo sonucu aynı tabloyu doğrular (§11.2).
  - **Testler:** "META 6.2 bridge_share_cap rejects 10000 pool" (override `prizePoolCoins: 10000` → hata; en kötü
    `L_0` 49 ≈ 1.311, hikaye başlangıçlarının 18'i bozuk — META §6.2), "META 6.2 bridge_share_cap accepts 6500 pool"
    (en kötü pencere `L_0` 44/45/49 ≈ 852), "META 6.2 bridge_share_cap pool cap is 6863" (6.863 geçer, 6.864 hata),
    "META 6.2 bridge_share_cap counts finisherExtras coins" (6.500 + `coins: 50` → ≈ 902 → hata), "META 6.2
    finisherExtras boosters are not coins" (BUSINESS Fırın Kokusu teması `{ boosters: { thermos: 1 } }` geçer),
    "META 6.2 bridge_share_cap windows cover story 15-50 and master 11-50" (76 başlangıç; `L_0` 45 penceresi 45…50, 11;
    Usta Modu 14 ≈ 682).
    Kesin değerler scratchpad'de META §6.2 formülüyle yeniden üretildi (2026-10-05: 852,2 / 899,5 / 900,05 / 1.311,5).
- `Wallet`: altın/yıldız işlemleri tek kapıdan (`apply(tx)`), negatif bakiye imkânsız, her işlem `coin_source` /
  `coin_sink` analytics olayına gider (`amount`, `reason`, `balanceAfter`).
- Can: `lives = min(max, stored + floor((now − regenAnchor) / regenMs))` (5 can, 30 dk); dolunca sayaç durur. Can
  bölüm başında ayrılır, kazanınca iade edilir (META; §11.1 `inLevel`). Sınırsız can süresinde (`unlimitedLivesUntil`)
  can ayrılmaz; üst çubuk ve ödül satırları kalbin yerine `icon_life_unlimited` (çizilmiş işaret; ∞ glifi metne
  yazılmaz, ART §8) + geri sayım / süre (`common.minutes`) gösterir (UX §3, §3.1; ASSET P0).
- **+5 teklifi (K-29, R-15):** deneme başına `outOfMoves.maxOffersPerAttempt` (3) sayacı altınla **ve** reklamla
  alınanları birlikte sayar (`adOfferCountsTowardCap`); fiyat basamağı `offerCosts[n − 1]` (900/1.350/1.800, `n` =
  teklif numarası). Ömürdeki **ilk** teklifte altın fiyatı 0'dır (`firstEverOfferFree`, kayıtta `firstOfferGiftUsed`;
  teklif 1'e sayılır). **Reklam seçeneği yalnızca** `n == rewardedAdOffer.offerIndex` (1) **ve** bu teklif ömrün ilk
  (ücretsiz) teklifi değilken (`firstEverOffer = firstEverOfferFree && !firstOfferGiftUsed`; koşul `!firstEverOffer`) sunulur
  (GDD K-29, UX §7); ek olarak `rewardedAdOffer.perAttempt` (1), `perDay` (3) ve `ads.dailyCapTotal` (6) tavanları
  `AdsService`'te sayılır. 2. ve 3. teklifte reklam seçeneği yoktur. `canOfferAd(n, save, ads)` tek fonksiyondur; UI ve
  test aynı fonksiyonu okur. Köprü turu altın harcama tavanı `events.json → wobblyBridge.bridgeSpendCapCoins`
  (4.050, R-16; BUSINESS ile aynı anahtar): altın seçeneği yalnızca `runSpend + fiyat ≤ tavan` iken **seçilebilir**;
  `runSpend + fiyat > bridgeSpendCapCoins` ise düğme gizlenmez, gri (devre dışı) kalır ve `lose.bridgeCap` metnini
  gösterir (sunum design-lead'in, UX §7; reklam ve "gizlenmez" ilkesi UX §3.1/§7); reklam seçeneği tavandan bağımsızdır
  (`rewardedAdContinueIgnoresCoinCap`). Pencerede eşit boy düğmeler, kalan teklif sayısı
  ve gerçek para karşılığı UX'tedir; çekirdek yalnızca `addMoves{source: 'offerCoins' | 'offerAd'}` alır ve kabulden
  sonra **K-35 adım 12'yi bir kez** çalıştırır (`truckHelp` olayları dahil; §6.1, GDD K-29, E-42). `config:validate`
  şeması `outOfMoves.rewardedAdOffer = strictObject({ extraMoves, perAttempt, perDay, offerIndex: Int(1, 3) })` ile
  `offerIndex`'i zorunlu doğrular (economy.json'da 1). Testler: "K-29 first ever offer is free and counts as offer 1",
  "K-29 ad option only in offer 1 and never in the lifetime-first offer", "R-16 bridge coin option disabled
  (lose.bridgeCap) when runSpend + price > cap, ad option stays" (yalnız `n = 1`'de; tavan doluyken 2. ve 3. teklifte
  yalnız ret seçeneği), "E-42 offer acceptance runs step 12 once".
- **Gerçek para karşılığı (MVP):** `economy.json → priceDisplay.referenceSku` (`coins_1000`) ve `shop.coinPacks[]`'in
  `usd`/`try` alanlarından altın başına fiyat + `Intl.NumberFormat`, yanında "test sürümü" etiketi; mağaza sürümünde
  faturalama SDK'sının yerel fiyatıyla değişir (§11.8). Alan product-lead + entrepreneur'ün, şema code-lead'in.
- **"Gün"** = cihazın yerel takvim günü (günlük ödül, reklam tavanları); sayaçlar gün anahtarıyla tutulur; saat geri
  alınırsa `lastSeenNow`'da dondurulur.
- Galibiyet serisi (kayıpta sıfırlanır; `m = 0` çıkışında bonus tüketilmez, `winStreak.bonusKeptOnZeroMoveExit`; teklif
  penceresinde seri yazılmaz, `hiddenInOfferWindow`) ve bölüm öncesi bonus `meta/streak.ts`; güçlendirici açılışları
  `meta/unlocks.ts` (bölüm numarası → açılan öğe, config'ten).
- **Kasaba ve ara sahneler (R-07, R-09; `meta/town.ts`):** görevler, sıra ve ★ maliyetleri `economy.json → town.chapters`
  (STORY §5'in 35 görevi; anahtarlar `town.ch{n}.t{m}.name/.scene`). Sahne tetikleyicileri yalnızca
  `town.cutscenes`'ten okunur: `prologue: firstLaunch` (FTUE 3 panel, Bölüm 1'den önce), `chapter1Start: afterTask1`
  (brif FTUE sırası: Bölüm 1 → ana ekran → ilk yıldızı harcama → ilk ara sahne), `chapterStartFrom2:
  nextHomeEntryAfterPreviousEnd` (önceki bitiş sahnesinden sonra ana ekranın bir sonraki açılışı; bitiş sahnesinin
  kapanması "açılış" sayılmaz), `hideNextChapterTasksUntilStartPlayed`, `chapterEnd: afterLastTask`,
  `skippedCountsAsSeen`, `maxCutscenesPerAction: 1`. `config:validate` şeması bu alanları bilinmeyen anahtar
  reddiyle (`strictObject`) doğrular; görülen sahneler kayıtta. Test: "R-09 first cutscene plays after first star
  spent, not after level 1".

### 11.4 Analytics — tipli olay birliği

Olay adları, parametreleri, tipleri ve enum değerleri için **tek kaynak `docs/ANALYTICS.md` §2 tablosudur (v5,
2026-10-06, son tutarlılık turu 3: `store_open.source` += `coin_plus`, `piggy`, `bridge_loss`; v4: `mode` += `replay`;
v3: günlük reklam yerleşimi `daily_double`, `offer` + `daily_double`, +`level_load_failed`, +`cutscene_missing`,
`star_spent.task` = görev `id`'si; v2: F-1)**; aşağıdaki birlik o tablonun birebir kopyasıdır ve tabloda olmayan olay ya da parametre içermez.
`tests/services/analytics.test.ts` ANALYTICS.md §2'yi ayrıştırır (olay, parametre adı, tip, enum değerleri, `| null`)
ve `ANALYTICS_EVENTS` çalışma anı tanımıyla (aşağıdaki birliğin değer karşılığı) **iki yönlü** karşılaştırır: tabloda
olup kodda olmayan ya da kodda olup tabloda olmayan her öğe testi kırar (kapı, `npm run check`'in parçası). Tablo
değişikliği: entrepreneur (ad, amaç) + code-lead (tip); kod tablodan sonra güncellenir.

```ts
// ANALYTICS §2 v5 — int = number (tamsayı), str = string, bool = boolean
type Mode = 'story' | 'master' | 'replay';                                  // v4: 'replay' = D-026 yedeği
type OfferKind = 'continue' | 'life' | 'booster_plus' | 'starter' | 'piggy' | 'pack' | 'daily_double';
type OfferPlacement = 'out_of_moves' | 'bridge_loss' | 'lives_zero' | 'daily_double' | 'in_level_plus' | 'pre_level_plus' | 'shop';
type AdPlacement = 'out_of_moves' | 'bridge_loss' | 'lives_zero' | 'daily_double';
type OfferFields = { offer: OfferKind; placement: OfferPlacement; offerIndex: 1 | 2 | 3 | null; priceCoins: number | null };
type AnalyticsEvent =
  | { name: 'app_open' }
  | { name: 'save_corrupt'; stage: 'parse' | 'migrate' | 'validate'; recovered: 'backup' | 'defaults' }   // §11.1
  | { name: 'tutorial_step'; level: number; step: number }
  | { name: 'level_start'; level: number; attempt: number; mode: Mode; preBoosters: number }   // preBoosters = sayı
  | { name: 'level_end'; level: number; mode: Mode; result: 'win' | 'lose' | 'quit'; movesLeft: number;
      wrongPlacements: number; yao: number /* 0–100 */; durationMs: number; extensions: number /* 0–3 */;
      exitFree: boolean; truckHelps: number }   // sayaçlar denemenin tamamı: K-43 devamında `GameSession.replay(…, sink)` olayları sayılır (Faz 2 tur 1 #19)
  | { name: 'level_resume'; level: number; movesMade: number }                                // R-13 devam açılışı
  | { name: 'level_resume_invalid'; level: number; movesMade: number;
      cause: 'level_hash' | 'rules_version' | 'both' }                                         // K-43/4, E-45; §11.1
  | { name: 'level_load_failed'; level: number; stage: 'schema' | 'logic'; code: string | null } // §8.3 yükleme anı
  | { name: 'booster_used'; booster: BoosterId /* economy.json kimlikleri */; level: number }
  | ({ name: 'offer_shown' } & OfferFields)
  | ({ name: 'offer_result'; result: 'coins' | 'ad' | 'free' | 'declined' | 'unavailable' } & OfferFields)
  | { name: 'purchase'; sku: 'coins_1000' | 'coins_2750' | 'coins_6000' | 'coins_13000' | 'coins_35000' | 'coins_75000'
      | 'starter' | 'piggy_break'; fake: boolean }
  | { name: 'ad_rewarded'; placement: AdPlacement; outcome: 'rewarded' | 'skipped' | 'unavailable' }
  | { name: 'coin_source'; amount: number; reason: 'level_win' | 'bonus' | 'golden_trowel' | 'level_chest' | 'master_chest'
      | 'daily' | 'bridge' | 'league' | 'piggy_break' | 'purchase' | 'refund'; balanceAfter: number }
  | { name: 'coin_sink'; amount: number; reason: 'continue' | 'lives' | 'booster' | 'pre_booster'; balanceAfter: number }
  | { name: 'event_join'; event: 'bridge' | 'league'; eventInstanceId: string; botSimVersion: string; seedHash: string }
  | { name: 'event_continue'; event: 'bridge'; plank: number /* 0–7 */; offerIndex: 1 | 2 | 3;
      payment: 'coins' | 'ad' | 'free'; runCoinsSpent: number }
  | { name: 'event_eliminated'; event: 'bridge'; plank: number }
  | { name: 'event_end'; event: 'bridge' | 'league'; result: 'finished' | 'eliminated' | 'timeout' | 'week_end';
      plank: number | null; rank: number | null; rewardCoins: number }
  | { name: 'star_spent'; task: string /* economy.json görev id'si: ch{n}_t{m} */ }
  | { name: 'cutscene_missing'; scene: string /* story.prologue | story.ch{n}.start | story.ch{n}.end */ }
  | { name: 'life_lost'; level: number }
  | { name: 'store_open'; source: 'nav' | 'coin_plus' | 'piggy' | 'out_of_moves' | 'bridge_loss' | 'lives_zero'
      | 'booster_plus' }                                                                        // v5; eşleme aşağıda
  | { name: 'chest_open'; chest: 'level' | 'league' | 'master'; contentId: string }
  | { name: 'session_end'; durationMs: number; levelsPlayed: number }
  | { name: 'settings_changed'; key: 'sound' | 'music' | 'haptics' | 'lang' | 'colorblind' | 'reduceMotion'
      | 'heavyGravitySlow'; value: string }
  | { name: 'age_gate_result'; bucket: '<13' | '13-17' | '18+' }                              // mağaza sürümü
  | { name: 'consent_result'; status: 'granted' | 'denied'; version: string };                // mağaza sürümü
type CommonParams = { sessionId: string; appVersion: string; platform: 'web' | 'android' | 'ios'; lang: 'tr' | 'en';
  coins: number; lives: number; highestLevel: number; payer: boolean };                       // ANALYTICS §3; track() ekler
track(e: AnalyticsEvent): void
```

Eşlemeler (kod tarafı, ANALYTICS §2 "Değer tanımları (v2–v5)"): `store_open.source` (v5) = Mağaza'yı açan dokunuşun
yeri, her UX girişi tek değer: alt nav Mağaza sekmesi (Bölüm 5 `tut.meta.shop` dahil) `'nav'`, üst çubuk altın sayacı /
(+) `'coin_plus'`, kumbara ikonu `'piggy'`, "Hamleler bitti" penceresindeki "Altın al" etkinlik dışında `'out_of_moves'`,
Sallanan Köprü denemesinde `'bridge_loss'`, Can penceresi "Altın al" `'lives_zero'`, mini satın alma "Altın al"
`'booster_plus'` (bölüm içi / öncesi ayrımı aynı penceredeki `offer_shown.placement`'ta); kayıp ve Can penceresi
girişleri aynı penceredeki `offer_shown.placement` değerini taşır; yeni bir Mağaza girişi önce tabloya eklenir. `level_start.mode` / `level_end.mode` = Bölüm 1–50
hikaye ilerlemesinde `'story'`, 50 sonrası döngüde (11…50) `economy.json → masterMode.variant` (`'master'` | `'replay'`);
aynı denemenin iki olayı aynı değeri taşır. Günlük ödül ×2 reklamı: `offer_shown { offer: 'daily_double', placement:
'daily_double', offerIndex: null, priceCoins: null }`, izlenince `ad_rewarded { placement: 'daily_double' }`;
`offer = 'daily_double'` yalnız bu yerleşimde. `star_spent.task` = `economy.json → town.chapters[].tasks[].id`
(`ch1_t1` … `ch5_t7`); i18n anahtarı gönderilmez. `level_load_failed`: oyunda yükleme anı denetimi (§8.3: zod + L-02,
L-04, L-05, L-08, L-09, L-24, L-25, L-26) bölümü reddedince bir kez — zod hatası → `stage: 'schema'`, `code: null`;
mantık hatası → `stage: 'logic'`, `code` = ilk `error` `Issue.code` (K-45 adı); deneme başlamadığı için `level_start`
ve `life_lost` gönderilmez, oyuncu Ana ekrana döner (UX §4). `cutscene_missing`: tetiklenen ara sahnenin verisi (panel
listesi ya da metin anahtarları) yoksa sahne atlanmadan önce bir kez, `scene` = STORY sahne kimliği; panel görseli
henüz yüklenmemişse gönderilmez (sahne yer tutucu SVG ile oynar, UX §8). `level_end.result = 'quit'` hem `m = 0` (cezasız) hem
`m ≥ 1` çıkışını kapsar; `exitFree` = `result = 'quit'` ∧ `m = 0` (GDD K-43/2, E-41), diğer her durumda `false`;
`truckHelps` = bu denemede `step: 12` ile yayınlanan `truckHelp` olayı sayısı, Geri Al ile geri alınan yardım düşülür
(E-37; sayaç `GameSession`'dadır, Geri Al tamponuyla birlikte geri yüklenir ve devam `replay`'inde aynı `truckHelp`
olaylarını yalnız sayan bir sink'le yeniden kurulur); `extensions` = bu denemede alınan +5 sayısı
(`inLevel.offersUsed`); `yao` = `round(100 · YAO)`; `preBoosters` = seçilen oyun öncesi güçlendirici sayısı;
`level_start.attempt` = `levels[id].attempts` (§11.1); `level_resume` devam açılışında bir kez; `level_resume_invalid`,
`save_corrupt` ve `coin_source{reason: 'refund'}` ilgili kayıt yazımından sonra (§11.1, ANALYTICS §3);
`ad_rewarded.placement` = aynı penceredeki `offer_shown.placement` (Sallanan Köprü denemesinde 1. teklifin reklam
seçeneği `'bridge_loss'`, etkinlik dışında `'out_of_moves'`; günlük sayaç ikisinde ortak, §11.8); `botSimVersion` dizge
(`'fmix32-chain-v1'` gibi). Tabloda olmayan olay ya da parametre koda girmez; yeni ihtiyaç önce tabloya eklenir.
Testler (iki yönlü tablo testine ek): "ANALYTICS level_load_failed sent once without level_start" (zod ve L-09
hatalı iki fikstür: `stage` ve `code`), "ANALYTICS cutscene_missing not sent while only panel image is loading",
"ANALYTICS mode follows masterMode.variant after level 50" (`'master'` ve `'replay'`), "ANALYTICS star_spent task is
economy task id".

MVP: geliştirmede konsol, her zaman son 500 olay yerel halka tamponda (debug panelinde görünür). Sağlayıcı adaptörü
(Faz 5) `ConsentService` izni vermeden başlatılmaz; o zamana kadar olaylar yerelde tamponlanır (§11.8). Kişisel veri
yok; doğum yılı saklanmaz, yalnızca yaş kovası.

### 11.5 i18n

`src/i18n/tr.json`, `en.json` (iç içe anahtarlar). `t(key, params?)`: `{n}` yer tutucuları; çoğul için
`Intl.PluralRules(locale).select(n)` → `key.one` / `key.other`. Büyük harf yalnızca `toLocaleUpperCase(locale)` (tr: i → İ).
`I18nKey` tipi `tr.json`'dan türetilir; `ui/Label` yalnızca `I18nKey` kabul eder → kodda sabit metin derlenmez.
Anahtarlar iç içedir: bir anahtar hem metin (yaprak) hem üst düğüm olamaz (STORY §7.3 `lose.offer.moves` notu).

- **Metin kaynağı:** anahtar ve metinler STORY (§6, §7) ve UX'tedir (design-lead); `tr.json` / `en.json` onlardan
  yazılır. Son tutarlılık turlarının değişiklikleri — **eklenen:** `tut.l23.light`, `build.done`, `replay.*`
  (`replay.button`, `replay.card.*`), `bridge.rule_card.extra`, `bridge.rule_card.daily`, `bridge.extra.got`,
  `bridge.dailyLimit`, `bridge.play`, `league.points_line`, `league.bonus.*`, `difficulty.*`,
  `league.rule_card.lines.both` / `.bronze` / `.diamond`, `league.header_lines.*`, `town.name`,
  `resume.void.title` / `.body` / `.bridge`, `common.ok`, `common.minutes`, `common.unlockAt`; **kaldırılan:**
  `league.rule_card.lines` (yaprak; artık üç alt anahtarlı düğüm), `lose.offer` (→ `lose.offer.moves`; aynı düğüm
  altında `.count`, `.last`, `.gift`); **metni / yer tutucusu değişen:** `bridge.rule_card.continue` (`+{n}`),
  `shop.covers`, `piggy.threshold`. **Faz 2A boşluk 1 (2026-10-06, STORY §7.3 / §7.5 / §7.6) eklenen:** `lose.adToday`,
  `exit.streak`, `exit.refund`, `resume.strip`, `app.title`, `app.version`, `common.continue` / `.home` / `.retry` /
  `.skip` / `.cancel` / `.on` / `.off` / `.count` / `.plus` / `.times` / `.coins`, `hud.moves`, `hud.streak`,
  `truck.queue`, `booster.hint.trowel` / `.hammer` / `.crane` / `.brush`, `pause.title`, `pause.exit`,
  `settings.sound` / `.music` / `.haptics`, `win.title` / `.bonus` / `.trowel`, `error.boot` / `.level` / `.restart`,
  `home.play`, `story.sign` (37) + Faz 2 asgari ana ekranın kullandığı mevcut STORY §7.5 satırı `home.moreSoon` (UX §6).
  `tr.json` / `en.json` Faz 2 kapsamındaki STORY satırlarını taşır; sonraki fazların satırları o fazın ekranlarıyla
  eklenir (test "D-017 every text is verbatim …" her anahtarı STORY'deki TR/EN hücresiyle karşılaştırır).
- **Oyun adı:** `app.title` (STORY §0-10, §7.6; çalışma değeri "Lift & Land", D-068 marka araması bitene kadar) tek
  kaynaktır: açılış logosu (BootScene, `t('app.title')`) ve tarayıcı/PWA başlığı (`main.ts` açılışta `document.title =
  t('app.title')`, `<html lang>` = etkin dil). **`upper()` ile çizilmez** (ART §8 istisnası: TR yerelinde "LİFT" olurdu).
  `index.html`'deki `<title>` yalnız betik yüklenene kadar görünen yer tutucudur; onu da `app.title`'dan dolduran Vite
  `transformIndexHtml` adımı yapılandırma işidir (§14.1 #15, HTML'de ad kalmaz). Başka bir aday seçilirse yalnız STORY
  satırı, `tr.json` / `en.json` ve `logo_wordmark` değişir.
- **Küresel yer tutucular:** `t()` iki yer tutucuyu çağırandan parametre beklemeden doldurur: `{town}` =
  `t('town.name')` (STORY §0-10; NAMING kararıyla yalnız bu anahtar değişir), `{company}` = oyun içi firma adı (NAMING
  §5.2, STORY §0-6/§0-10: EN varsayılanı "Tuna & Co."; STORY'de anahtarı olmadığı için `i18n` modülünde dil başına tek
  değer). Çağıran bu adlarla parametre veremez; metinde yer tutucuya ek bağlanmaz (STORY §0-10).
- **Config ve durum değerleri (D-017):** `{n}`, `{max}`, `{up}` / `{down}`, `{easy}` … `{superhard}`, `{extras}`, `{pool}`,
  `{time}`, `{version}` (`app.version`: `package.json` sürümü, **metin** olarak verilir — sayı biçimlemesi yok) gibi yer tutucuları çağıran, STORY §7 "Sayılar config'ten" eşlemelerine göre `economy.json` /
  `events.json`'dan verir; metinde sabit sayı yoktur. Koşullu satırlar (ör. `bridge.rule_card.extra` yalnız
  `finisherExtras ≠ null`) STORY §7.2 kuralıyla gösterilir.

Testler: iki dosyanın anahtar kümeleri eşit, `{param}` adları eşit, boş metin yok, "i18n key is never both leaf and
node", "i18n {town} and {company} filled without caller params".

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
- **Parametre sahipliği ve iki biçim** (tokens `audio._doc`, ASSET_LIST §13; design-lead'in dosyası, D-003):
  - `audio.sfx.<ad>: number[]` — tek ses: bir `buildSamples(params)` çağrısı.
  - `audio.seq.<ad>: [startMs: number, params: number[]][]` — çok notalı ses (ör. `sfx_segment`, `sfx_truck_horn`,
    `sfx_lastmoves`, `sfx_moves_add`, `sfx_combo`, `sfx_goal_done`, `sfx_out_of_moves`, `sfx_chest`, `music_win`):
    her adım ayrı `buildSamples` ile çizilir ve `startMs · sampleRate / 1000` örnek ofsetinde **tek** `AudioBuffer`'da
    toplanır; arabellek boyu = en geç biten adım; toplam tepe > 1 ise bütün arabellek tepe = 1 olacak biçimde ölçeklenir
    (kırpma yok). Çalma ve önbellek tek sesle aynıdır.
  - Ad çözümü: önce `audio.sfx`, sonra `audio.seq`; bir ad iki kümede birden varsa geliştirme hatasıdır. "Eksik ad"
    denetimi (`sfx.ts`'in istediği her ad ASSET §13 listesinde ve) **iki kümenin birleşiminde** aranır; `_doc` ile
    başlayan anahtarlar ad sayılmaz. Eksik ad açılışta geliştirme hatasıdır, üretimde sessiz geçer. Testler:
    "ASSET 13 every sfx name resolves in audio.sfx or audio.seq", "audio seq mix peak <= 1".
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
  isAvailable(placement: AdPlacement): boolean;              // AdPlacement = ANALYTICS §2 `ad_rewarded.placement` (§11.4)
  show(placement: AdPlacement): Promise<'rewarded' | 'skipped' | 'unavailable'>;   // Köprü +5 reklamı: 'bridge_loss'; günlük ×2: 'daily_double' (v4)
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
- **Köprü reklam yerleşimi (ANALYTICS §2 v5):** Sallanan Köprü denemesinde 1. teklifin reklam seçeneği
  `'bridge_loss'` yerleşimidir; ayrı tavan değildir: `isAvailable` / `show` bu yerleşimde
  `outOfMoves.rewardedAdOffer.perDay` (3) günlük sayacını `'out_of_moves'` ile ortak kullanır, toplam `ads.dailyCapTotal`
  (6) (BUSINESS §4.3). Test: "R-15 bridge_loss ad shares the out_of_moves daily cap".
- **Günlük ödül ×2 reklamı (ANALYTICS §2 v3–v4):** yerleşim `'daily_double'` (eski `'daily'` yok); sayaç
  `dailyReward.rewardedAdDoublesCoins.perDay` (1), toplam `ads.dailyCapTotal` (6) içinde. Pencere açılınca
  `offer_shown { offer: 'daily_double', placement: 'daily_double', offerIndex: null, priceCoins: null }`, reklam
  sonucu `ad_rewarded { placement: 'daily_double' }` (§11.4). Test: "ANALYTICS daily_double placement on both events".
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
| `levels:validate` | `node tools/validate-levels.ts` — zod + L-01…L-18, L-21…L-26 (§8.3); `code` + `rule` (K-45) tablosu, hata → çıkış 1 |
| `levels:solve` | `node tools/solve.ts [--level N] [--budget 60] [--no-cache] [--update-golden] [--traps] [--trap-extra 1] [--trap-budget 2000000]` (Faz 3) — L-19; `--traps` ✓-tuzağı taraması (§9.8, L-27), sonuç `artifacts/solver/level_NNN.traps.json` |
| `levels:bot` | `node tools/playtest-bot.ts [--games 500] [--profile orta] [--continue N]` → `docs/LEVEL_REPORT.md` + `docs/level-report/difficulty.svg` (Faz 3) |
| `levels:preview` | `node tools/level-preview.ts [--level N] [--png]` → ASCII stdout; `--png` Playwright + `theme/draw` → `artifacts/previews/` |
| `levels:check` | `levels:validate && levels:solve --traps && levels:bot` (solver ve tarama önbellekli) |
| `events:sim` | `node tools/event-sim.ts` — Köprü/Lig bot dağılımı raporu (§11.2) |
| `config:validate` | `node tools/validate-config.ts` — `config/economy.json` + `events.json` zod/mini şeması ve değer kuralları (kumbara R-16, `bridge_share_cap` META §6.2; §11.3); hata → çıkış 1. Aynı doğrulayıcı `tests/config/validate.test.ts` ile `npm test`'te koşar (Faz 4, §14.3) |
| `screens` | `vite build --mode harness && node tools/screens.ts [--profile 390x844\|360x800\|390x763\|360x740] [--only <ad>,…] [--cvd protanopia,deuteranopia,tritanopia\|all]` → `artifacts/screens/<profil>[-<cvd>]/<ad>.png`. CVD: harness `&cvd=` → `#game` üstünde SVG `feColorMatrix` (Machado 2009, şiddet 1,0, doğrusal RGB). Faz 2 çekimleri 01a–01c giriş panelleri (harness `introPanel(n)`), 02–18, 19-palette (8 renk blok + plan + cephe + `.` + `?`, harness fikstür sahnesi), 20-home-l2, 21-home-more-soon, 22-pause, 23-cancel-preview, 24-bounce-support (JUICE #84'ün içinde: harness `waitCue(84)` + 100 ms oyun zamanı, Faz 2 tur 2 #6), 25-trowel-pick. Kısa görünümler 390×763 (TECH §10.1, Safari çubukları) ve 360×740 yalnız `start1`…`start5` senaryoları (her biri boş bağlamda; harness kayıtlı denemenin üstüne başka bölüm yüklemez, K-43): Bölüm 1–5 başlangıçları 02–06 (öğretici balonu, Faz 2 tur 2 #15) |
| `perf` | `vite build --mode harness && node tools/perf.ts` (§10.7) |
| `build:verify` | `vite build` sonrası `tools/verify-dist.ts`: `dist/` içinde `src/debug`/`src/harness` parçası, `__debug`/`__harness` dizgesi ya da `?debug` işleyicisi **yok** (R-20); `npm run build`'in parçası |
| `test:rules` | `vitest list --json` çıktısını `tools/rule-coverage.ts` okur; GDD.md'deki **her K-01…K-46 ve E-01…E-47**, OBSTACLES.md'deki her engel kimliği (W1…W8, Y1…Y8, S1…S8, G-H, G-L) ve `[kural]` etiketli her N-notu en az bir test adında geçmiyorsa çıkış 1. Kimlik listesi belgelerden okunur (kod içinde liste yok). Faz 2–3'te `package.json` betiği `--phase N` verir (Faz 2: `--phase 2`, Faz 3: `--phase 3`, Faz 4'ten itibaren bayraksız = tam): K-xx yalnız §12.4 tablosunun F sütunundaki ilk faz ≤ N ise; engel kimlikleri Faz 2'de OBSTACLES "İlk bölüm" ≤ 5 olanlar (W1, S1, S2), Faz 3'te hepsi; **N-notları fazını OBSTACLES etkileşim matrisinden alır** (metindeki kimliklerden değil: N7, N24 gibi notların metninde engel kimliği geçmez): notun geçtiği her hücrenin fazı = iki engelin fazının büyüğü, notun fazı = bu hücre fazlarının en küçüğü (andığı K-xx'lerin F'sinden küçük olamaz) — Faz 2 engellerinin hücreleri W1×S1 `·`, W1×S2 N10 `[not]`, S1×S2 `·` olduğundan bütün `[kural]` notları en erken Faz 3'tedir (§14.2 "N-notu testleri"); **E-xx** andığı her K-xx ve engel kimliği (GDD §13 "Kurallar" sütunu + satır metni) bu kümelerdeyse, **ama** satırı Sallanan Köprü ya da Usta Ligi'ni anıyorsa (metin) ya da "Kurallar"ı `META` içeriyorsa Faz 4'te (Köprü/Lig §14.3 Faz 4). Ör. E-47 ("G-L: …") Faz 3'te, E-22 ("Sallanan Köprü'de …", K-29, META) ve E-45 (Köprü tur harcaması) Faz 4'te zorunlu olur. Betikle sayıldı (2026-10-06): `--phase 2` zorunlu E kümesi = E-01, E-03, E-06, E-21, E-27, E-28, E-30, E-34, E-38; Faz 4: E-22, E-45; kalan 36 E Faz 3; 38 `[kural]` notunun 38'i Faz 3 (eski "andığı kimlik" kuralı 31'ini — N1, N3, N5–N8, N11, N13, N14, N16–N20, N23–N35, N38, N40, N41, N43 — Faz 2'ye düşürüyordu). Test: "test:rules phase 2 requires no N-note and no bridge E row" (`tools/rule-coverage.ts`, gerçek belgelerle). Uygulandı (Faz 2 tur 1 #20/#22): eşleşme `(^|[^\w-])ID(?!\d)` (K-1 ≠ K-10, S1 ≠ S10); eksik kimlik çıkış 1, belge/argüman hatası çıkış 2; `--list <dosya>` kayıtlı `vitest list --json` okur, `--print` kimlikleri yazar; K-xx kümesi GDD başlıklarından (tablo satırı olmayan K-xx hata) |
| `golden:update` | (Faz 3; Faz 2 `package.json`'ında yok, solver yok) `node tools/solve.ts --update-golden` — **yalnız** solver golden'larını (`tests/golden/level_NNN.json`: çözüm + `eventLogHash` + YAO) yeniden yazar; diff incelenmeden işlenmez. **Kapsam dışı:** `tests/golden/level_NNN.hand.json` (LEVELS §2 el çözümleri, §9.5) elle yazılır; kural ya da olay değişikliğinde yalnız `eventLogHash` (gerekirse `finalAscii`) günlük incelendikten sonra elle güncellenir — test iletisi dosyayı adıyla söyler. Araç `*.hand.json`'a yazmaz (test: "golden:update never touches hand goldens", Faz 3) |
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
  `it('K-17 wrong placement bounces to start and burns a move', …)`. Kenar durumları (E-01…E-47) `'E-04 …'`, GDD §14.1 öğretici kuralları `'GDD 14.1 …'`, hat adımları
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
| K-01 | koordinatlar, sınır maskeleri | 2 | | K-24 | asansör ping-pong (önce yön, sonra adım), `h + b ≤ 8`, geçit plan satırı | 3 |
| K-02 | saha 6×8, doluluk (L-03) | 2 | | K-25 | parti kuyruğa eklenir, aday sütun sırası | 2 |
| K-03 | şantiye 2 sütun, dilim çerçevesi | 2 | | K-26 | FIFO, eskiler önce, bekletmez | 2 |
| K-04 | duvar sınırı kapalı/açık satırlar, L-09 | 2 | | K-27 | malzeme yeterliliği (L-10/L-11) | 2 |
| K-05 | Vinç Alanı iptali, 8 yüksek duvar boy ≤ 2, `blockedByWallHeight` | 2 | | K-28 | son hamlede kazanma, Bonus İnşaat sayısı | 2 |
| K-06 | panorama durumu oyun durumunu değiştirmez | 2 | | K-29 | +5 teklif, 3 teklif sınırı (reklam dahil), reklam yalnız 1. teklifte ve ömür ilk teklifinde yok, ömürde ilk teklif bedava, Köprü tavanı 4.050, kabulden sonra adım 12 (E-42) | 2, 4 (Köprü tavanı, E-22) |
| K-07 | iptal tablosu 7 satır (satır 5 kapalı şantiye), toplanan maliyetler (yapışmış harçlı cam 3), eşik tokens'tan | 2 | | K-30 | D1/D2/D3 tespiti (D2 arzında yapışmış harç var, moloz yok, E-44) ve üç yardım, D2 `B1`'leri adım 12'de `x = 5` (E-23), ≤ 2 hamle güvencesi (belirlenimci açılım bütçesi, bütçe biterse `reshape`); solver/tarama adım 12 kapalı (`noTruckHelp`, §9.1); ✓-tuzağı taraması L-27 (§9.8) | 3 |
| K-08 | BFS yolu, yapışkan takip eşitlik bozucuları | 2 | | K-31 | renk sayısı/açılmış renk (L-06/L-07; boya kapısı rengi dahil) | 2 |
| K-09 | tutulabilirlik (a)–(e) | 2 | | K-32 | `repeat`/`mirrorOf` çözümü, açılma | 3 |
| K-10 | saha yeniden konumlandırma | 2 | | K-33 | seri, Altın Mala, K-34'lü mala hedefi, cam kırılması seriyi sıfırlar | 2 |
| K-11 | duvar üstü, açık gökyüzü, iniş formülü | 2 | | K-34 | alttan üste: ray/düşüş/balon/Vinç/Mala; `.` yalnız boşken dolu (E-43); `reasons` sırası, `missingSupport`, `buildFront` | 2 |
| K-12 | ray hizalama, düşmez, tam sığma | 2 | | K-35 | adım sırası, mini hat, (y, x) tarama, komşuluk duvarı aşmaz (E-46), adım 10 zamanlayıcı sırası (`STEP10_TIMERS`) | 2 |
| K-13 | çıkıntı altına yandan giriş yok | 2 | | K-36 | Çekiç hedefleri, zincir önce | 3 |
| K-14 | kilit, Geri Al istisnası | 2 | | K-37 | Vinç ön koşulları, harcanmama | 3 |
| K-15 | plan, `.`, dilim tamamlanması | 2 | | K-38 | Boya Fırçası paleti, harç kilitlenmesi | 3 |
| K-16 | doğru yerleşim 3 koşul | 2 | | K-39 | Geri Al derinlik 1, tam geri dönüş | 2 |
| K-17 | geri sekme sırası, kuyruk sonu | 2 | | K-40 | Termos, Mala Başlangıcı, Açık Kepenk, seri bonusu | 3 |
| K-18 | gölge = gerçek sonuç, `verdict`, `touchesHidden` | 2 | | K-41 | hedef sayımları; solver hedef engelleyicileri ve `h` hedef/moloz terimleri (§9.3–9.4) | 2 (build), 3 |
| K-19 | `normal`: tutma sınırı ve yönlendirme yok, commit bırakmada (Faz 2, test "K-19 normal gravity has no hold limit and no steering"); cam eşikleri, G-H `holdMs` 700/1400, G-L tek yönlendirme, geçersiz girdi hak yakmaz (K-19 madde 4); yeni tutma pencereyi kapatır (E-40); bekleyen hamle kuralı (§4.7), duraklatma pencereyi kapatır (madde 1 (d), E-47) | 2 (normal), 3 (G-H, G-L, cam) | | K-42 | saklı nesne denetimleri #1/#2 | 3 |
| K-20 | saha yerçekimi zincirlemesi, yarım adımlar | 3 | | K-43 | çıkış `m=0`/`m≥1`, devam, kayıp penceresi, geçersiz deneme iadesi (E-38, E-41, E-45); G-L düşüşünde duraklatma önce commit eder, ilk düşüşte çıkış `m = 1` (E-47, Faz 3) | 2, 3 (E-47), 4 (E-45 Köprü tur harcaması) |
| K-21 | bayrak birleşimleri (L-21) | 3 | | K-44 | şekil tablosu, kanonik, `shape_locked` (tür hikaye bölümüne, ağır şekil `id ≥ 8`'e göre) | 2 |
| K-22 | dilim kayması + teslimat | 2 | | K-45 | her `code` için geçersiz fikstür; `seed` varsayılanı; imza tablosu ↔ OBSTACLES (L-16, L-22); solver aşaması L-19 | 2 (madde 1–7, 9), 3 (8) |
| K-23 | döner platform sayacı, atlama, tamamlanma hamlesinde `t` artmaz | 3 | | K-46 | YAO sayımı (balon, G-L duvar üstü; ray geçit); solver eşit hamlede en yüksek YAO | 2, 3 |

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
| Paket kimliği ve ad | iOS bundle ID ve Android `applicationId` yayından sonra **değiştirilemez** (D-067 KABUL): **isim kararından (D-068) sonra, ilk mağaza yüklemesinden (Faz 5 `npx cap init`) önce** kesinleşir; biçim `com.<şirket>.<ad>` (NAMING §6.1 tablosu, ör. `com.<şirket>.liftland`; `<şirket>` = tüzel kişilik adı, proje sahibinden), yalnızca `[a-z0-9.]`, "kids/little/minik" içermez. Görünen ad da NAMING kararından sonra girilir; her dil için ≤ 12 karakter kısa ad (ana ekran, PWA `short_name`); "&" Android `strings.xml`'de `&amp;`. Kod içi kimlikler (kayıt anahtarı `minikusta.save`, klasör adları) kod adı olarak kalır → isim değişikliği kayıt göçü gerektirmez; oyun adı metinleri yalnızca i18n (`app.title`, `{company}`) |
| iOS derleme ortamı | Xcode ≥ 26 macOS ister: fiziksel Mac ya da bulut macOS CI (tercih Faz 5 başında; aylık maliyet o gün sağlayıcıdan doğrulanır ve entrepreneur BUSINESS §10'a yansıtır). Android derlemesi Linux CI'da |
| Satın alma, reklam, onay | §11.8 arayüzleri (`IapService`, `AdsService`, `ConsentService`); MVP'de sahte uygulamalar, Faz 5'te gerçek eklentiler aynı arayüze (eklenti seçimi o gün `npm view` ile, ayrı D-xxx). Sağlayıcılar onaydan önce dinamik import edilmez |
| Performans | WKWebView/Android WebView'de aynı `perf` harness'ı uzaktan hata ayıklamayla; referans düşük seviye + orta seviye Android + 1 eski iPhone (§10.7) |
| Mağaza varlıkları | ikon/splash design-lead'den; `@capacitor/assets` vb. araçlar o gün doğrulanır |

---

## 14. Uygulama planı ve efor (Faz 2 ayrıntılı, Faz 3–5 kaba)

Süreler ajan iş günü (g); 5 g = 1 hafta. Tahminlere **%20 tampon** eklenir (entrepreneur isteği).

### 14.1 Faz 2 — dikey dilim (Bölüm 1–5)

Kapsam: K-01…K-18, K-19 (normal yerçekimi), K-22, K-25…K-29, **K-31 (renk sayısı ve açılmış renk; L-06/L-07, K-45/4), K-33, K-34, K-35 (tam adım sırası; engel kancaları
boş), K-39, K-41 (build), K-43 (çıkış + bölüm içi devam), K-44, K-45 (madde 1–7 ve 9: L-01…L-18, L-21…L-26), K-46
(YAO ölçümü)**, W1, S1, S2; kenar modeli (R-03); FIFO teslimat; JUICE Faz 2 P0 olayları (#1–13, 15–20, 22, 23, 50–53,
55–58, 69–71, 83–84, 87, 88 = 36 olay; JUICE §0 kural 12 listesiyle birebir); TR/EN; telefonda oynanır. Bu küme §12.4 F sütunuyla aynıdır (`test:rules --phase 2`). Engel çerçevesi (kayıt defteri) kurulur ama yalnızca W1/S1/S2 eklentileri yazılır. Solver yazılmaz (§9.2).

| # | İş | Çıktı | Süre | Bağımlılık |
| --- | --- | --- | --- | --- |
| 1 | Yapılandırma: `allowImportingTsExtensions`, `erasableSyntaxOnly`, `tsconfig.core.json`, `tsconfig.tools.json`, ESLint katman + bot + debug kuralları (§1.3), `build:verify`; bağımlılıklar `zod@4.6.5`, `@types/node@22.20.5` (dev) | yeşil `npm run check` | 0,5 g | — |
| 2 | `core/shapes`, `coords` (sınır maskeleri), `rng` (`hash32` vektörleri), `types` + testler (§3 tablosu birebir) | K-01, K-44 | 0,5 g | P-2 onayı |
| 3 | `core/level/schema` + `logic` (K-45 kodları; L-01…L-18, L-21…L-26; vurgu sözlüğü + GDD §14.1/3 kapalı `done` sözlüğü, süzgeçler ve `startOn` §8.2; L-09 kayar kapı aralığı) + `mechanics` + `compile` (`STEP10_TIMERS`) + `tools/validate-levels.ts` | `levels:validate` | 2 g | P-6 onayı; OBSTACLES veri imzası tablosu |
| 4 | `core/state`, `hash`, `grid`, `ascii` + değişmez testleri | Ek A ASCII | 1 g | — |
| 5 | `core/movement` (kenar modeli, BFS, RAIL, yapışkan takip, yol, `classify`/iptal önizlemesi) + K-07…K-13 + `vitest bench` | §4 | 1,5 g | — |
| 6 | `core/gravity` (`computeFall`), `placement` (**`isCorrectPlacement` K-16 + K-34**, geri sekme), K-14…K-18 | §5 | 1,75 g | — |
| 7 | `core/moves` K-35 hattı + olay birleşimi + `site` (segments) + `delivery` (FIFO) + `goals` + `combo` + `session` (Geri Al, hamle günlüğü, `replay`) | §6 | 2,5 g | — |
| 8 | `core/obstacles` kayıt defteri + W1, S1, S2 eklentileri | §7 | 0,5 g | — |
| 9 | El çözümü golden'ları 1–5 (LEVELS §2 → `level_00N.hand.json`) | `tests/golden/` | 0,5 g | bölüm JSON'ları |
| 10 | `theme/tokens.ts` + `layout.ts` (FIT/EXPAND çapaları, değişmezler) + `draw` + açılış atlası (plan tarifi) + bölüm başı pişirme | §10.1–10.2 | 1,75 g | design-lead `tokens.json` |
| 11 | `LevelScene`: `PieceView` havuzu, `DragController` (ofset, yapışkan takip, eşik), `ShadowView` (`verdict.reasons`/`missingSupport`/`buildFront`/`cancel`), `EventPlayer` (JUICE Faz 2 P0, 36 olay — #83 inşa cephesi kaydı `duration.frontShift`, #84 eksik destek vurgusu `duration.supportFlash` + `color.ghost.support`, #15–17 Usta Serisi boncuğu / Altın Mala (#16 MVP-lite, #17 mala uçuşu ve cephe hücresi seçimi, K-33), #20 ve #88 "Kamyonda: N" kuyruk çipi (K-26, K-17 adım 3; Bölüm 5 el çözümü adım 3), #22–23 ray ışığı ve kelepçe (W1, Bölüm 3), #87 kaldığın yerden devam şeridi (K-43) dahil —, fast-forward, azaltılmış hareket varyantları) | oynanır tahta | 5 g | JUICE.md |
| 12 | UI asgari: üst çubuk (hamle, hedef), panorama, kazanma/kaybetme pencereleri, çıkış onayı (`m = 0` / `m ≥ 1`), giriş sahnesi (yer tutucu 3 panel), Boot → Bölüm 1 (≤ 3 dokunuş, ≤ 10 s); **`TutorialController`** (spot ışığı, eldiven, Dede balonu, §8.2 tamam olayları ve sürükleme sinyalleri, `tut.ctx.*` adımında `seenContextTips`, zorunlu adım kilit güvencesi; Bölüm 1–5 öğreticileri); **asgari ana ekran** (UX §6 "Faz 2 dikey dilimi": oyun ekranı arka planı + `app.title` (0,6×, `upper` yok) + Bölüm düğmesi `home.play` 720×176 `layout.bottom.playButton*`; kazanmada "Devam" ve kayıp Pencere 2 "Ana sayfa" buraya döner; Bölüm 5 kazanılınca `home.moreSoon` bandıyla Bölüm 1 (1–5 döngüsü); Bölüm 1 sonrası "BÖLÜM 2" nabzı (UX §2.2 adım 11); üst çubuk, kasaba, alt nav yok) | | 2,75 g | UX_FLOWS.md §6, §13 |
| 13 | Servisler: i18n (tr/en), save v1 + `inLevel` devamı (bekleyen hamle kuralı, `attempts`), analytics tip birliği (yerel) + ANALYTICS §2 eşleme testi, ses (zzfxSynth + tokens `audio.sfx` ve `audio.seq`; JUICE Faz 2 P0 listesinin (#1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83–84, 87, 88) bütün sesleri, `sfx_streak_pip`, `sfx_trowel`, `sfx_clamp` (`audio.sfx`) ve `sfx_gap_rail` (`audio.seq`) dahil — tokens'ta dolu, betikle doğrulandı), haptik (tokens) | §11 | 2 g | metinler |
| 14 | Debug paneli (yalnız DEV; bölüm seç, sınırsız hamle, ASCII, olay günlüğü, FPS, golden oynat) | §12.3 | 1 g | — |
| 15 | `harness` modu + `tools/screens.ts` (profiller, CVD) + `tools/perf.ts` (FTUE kapısı) + Playwright duman testi (yeniden yükle → devam) | §10.7, §12.2 | 1,25 g | — |
| 16 | Bölüm 1–5 JSON doğrulama; referans düşük seviye + orta seviye Android'de ölçüm; düzeltmeler | Faz 2 çıkışı | 2 g | product-lead JSON; cihazlar |
| | **Toplam** | | **26,5 g net → 29,5 g tamponlu (≈ 6 hf)** | |

Önceki tahmine (21,5 g) göre +3 g: K-34 / K-35 / FIFO / tekrar oynatma (+0,75), K-45 kodları (+0,25), bölüm başı pişirme
+ FIT/EXPAND çapaları (+0,75), girdi fast-forward + azaltılmış hareket (+0,5), çıkış/devam + giriş sahnesi (+0,5),
harness + gerçek cihaz turu (+0,75); solver'ın Faz 3'e alınması −0,5. Takvimi kısaltmak gerekirse #12 giriş
sahnesi, #15 ek ekran profilleri/CVD ve #13 analytics genişlemesi Faz 4'e alınabilir (−1 g net → 28,5 g tamponlu
≈ 5,7 hf; **4 haftaya inmez**, brif planındaki 4 hafta bu kapsamla tutmaz); K-34,
K-35 ve K-43 kesilemez (Bölüm 3 ve kural kapısı bunlara bağlı). 2026-10-05 GDD eşitlemesi (`verdict.reasons`,
`buildFront`, `blockedByWallHeight`, K-07 satır 5, `town.cutscenes` şeması) #5, #6, #11, #13 kalemlerinin içindedir
(≈ 0,25 g, tampon içinde); toplam değişmez. Tutarlılık denetimi tur 1 (2026-10-05): öğretici denetleyicisi #12'de açıkça
yazıldı (+0,5 g; önceden UI kaleminde örtüktü), bekleyen hamle kuralı + `attempts` + analytics eşleme testi + `audio.seq`
#13'te (+0,25 g); net 24,5 → 25,25 g, tamponlu 29,5 g sabit (tampon 5 → 4,25 g). Tur 2 (2026-10-05): `wrongOcc`/`dotFree`
(#6), toplanan maliyet + duvarı aşmayan komşuluk + teklif sonrası adım 12 kancası (#7), `voidAttempt` iade listesi (#13)
mevcut kalemlerin içinde; öğretici sürükleme sinyalleri + kilit güvencesi #12'ye +0,25 g; net 25,25 → 25,5 g,
tamponlu 29,5 g sabit (tampon 4,25 → 4 g). K-30 D2 adım 12 teslimatı (E-23, E-44) ve K-23/K-24/W5 ayrıntıları Faz 3
kalemlerindedir (§14.2). Son tutarlılık turu (2026-10-05): JUICE #83–84 #11'de (`ShadowView` verisi `missingSupport` /
`buildFront` zaten vardı; iki tween), K-45/9 (L-16, L-22) #3'te zaten listeliydi, ANALYTICS v2 (`save_corrupt`,
`level_resume_invalid`, `refund`, `exitFree`, `truckHelps`) #13'te; E-47 testi G-L ile Faz 3'te. Faz 2 toplamı değişmez.
Son tutarlılık turu 2 (2026-10-05): GDD §14.1/3 `done` sözlüğünün tamamı (16 olay, süzgeçler, `startOn`) şemada ve
L-17'de, L-09 kayar kapı aralığı #3'e +0,25 g; `returnTarget` + `stuck` yaşam döngüsü (#6), `flushPending` kapalı
listesi (#7), ANALYTICS v4 birliği (#13) mevcut kalemlerin içinde; net 25,5 → 25,75 g, tamponlu 29,5 g sabit (tampon
4 → 3,75 g). Hamle sonu öğretici olaylarının çalışma anı sayımı ve simülasyonlu kilit güvencesi Faz 3'te (§14.2).
Son tutarlılık turu 3 (2026-10-06): JUICE Faz 2 P0 kapsamı JUICE §0 kural 12'ye eşitlendi (28 → 36 olay: #15–17, #20,
#22, #23, #87, #88; hepsi bu fazın kendi kural kapsamından — K-33, K-26, K-17 adım 3, W1, K-43), #11 +0,5 g (sekiz kısa
tween + sesleri ve azaltılmış varyantları; #17'de cephe hücresi seçimi); net 25,75 → 26,25 g, tamponlu 29,5 g sabit
(tampon 3,75 → 3,25 g ≈ net'in %12; §14 başındaki %20 hedefinin altında, Faz 2–5'in 22 haftaya sığması için). Senkron
geçişi (2026-10-06): JUICE §0 kural 12 P0 listesi yeniden denetlendi, değişmedi (36 olay; seslerin hepsi tokens'ta);
`voidNotice` / `pendingChest` kayıt alanları ve i18n anahtar değişiklikleri #13'te, `resume.void` ve sandık
pencerelerinin sunumu §14.3 Faz 4 ana ekran kaleminde, "Yapı tamam!" kurdelesi (JUICE #89–90) Faz 5 "JUICE tamamlama"
kalemindedir; o geçişte Faz 2 26,25 g net / 29,5 g tamponlu ve Faz 2–5 93,5 g net / 110 g ≈ 22,0 hf değişmedi. Faz 2A boşluk
kapanışı (2026-10-06): UX §6 "Faz 2 dikey dilimi" asgari ana ekranı #12'ye +0,25 g (tek sahne, tek düğme, 1–5 döngüsü);
STORY §7.6 anahtarları ve `app.title` bağlantısı #13 içinde (yapıldı); net 26,25 → 26,5 g, tamponlu 29,5 g sabit
(tampon 3,25 → 3,0 g); Faz 2–5 net 93,75 g / 110 g tamponlu ≈ 22,0 hf.

Sıra: 1 → 2 → 4 → 5 → 6 → 7 (çekirdek önce, saf ve testli) ‖ 10 (tokens gelince paralel) → 11 → 12 → 13 → 14 → 15 → 16.
3 ve 9 bölüm verisi geldikçe. **Faz 2 çıkış ölçütü:** `npm test`, `npm run build` (+ `build:verify`),
`levels:validate`, `test:rules --phase 2` (Faz 2 kapsamındaki K-xx, W1/S1/S2 ve §12.2 kuralıyla Faz 2'ye düşen 9 E
satırı; N-notu yok) yeşil; 1–5 el çözümü golden'ları geçiyor; perf 4× ≥ 50 FPS
(CPU tarafı) ve FTUE ≤ 10 s; referans düşük seviye cihazda ≥ 30 FPS ve girdi ≤ 2 kare; 390×844 ve 360×800 ekran
görüntüleri design-lead incelemesinde.

### 14.2 Faz 3 — içerik (Bölüm 6–50), solver, bot, 23 engel

| İş | Süre |
| --- | --- |
| Solver: katmanlı A*, TT, budama (K-34, `via`, G-L), hedef engelleyicileri + `h` hedef/moloz terimleri (§9.3–9.4), `noTruckHelp` (§9.1), beam yedeği, `worker_threads`, önbellek, golden'lar | 5,5 g |
| ✓-tuzağı taraması (§9.8: gevşetilmiş oyun, kapsam araması, derin arama + paylaşılan TT, L-27, LEVEL_REPORT tablosu, F-3 yeniden üretim testi) | 1 g |
| Playtest botu (3 profil, LEVEL_REPORT, SVG, `--continue`, ekonomi sütunları) + `events:sim` | 3 g |
| 23 engel eklentisi + testleri (aşağıdaki tablo) | 13,5 g |
| N-notu testleri + 325 çift duman testi | 1 g |
| K-30 tespit + üç yardım yolu + güvence | 2 g |
| Güçlendiriciler K-36…K-40 (çekirdek + UI akışı, gri/etkin durumları) | 3 g |
| Doğrulayıcı kalanları (K-45/8: L-19, L-20; K-45/9 Faz 2'de, §14.1 #3), `levels:preview --png` | 1 g |
| 45 bölüm JSON'u için araç desteği, düzeltmeler, perf tekrarı | 2 g |
| Öğretici 11–38 (§8.2): 7 yeni hamle sonu olayının sayımı + süzgeçler, `startOn`, `pre:` pencere kapanışı, simülasyonlu kilit güvencesi (GDD §14.1/4b) + testler; el çözümü golden'ları 6–10 "Solver … golden'lar" kalemindedir (§9.5) | 0,5 g |
| **Toplam** | **32,5 g net → 39 g tamponlu (≈ 7,8 hf)** |

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
| 4 | `config:validate` (`tools/validate-config.ts`: şema, kumbara kuralı, `bridge_share_cap` kesin binom + kırpma, LiveOps birleşimleri, 6 test; §11.3) | 0,25 g |
| 4 | Usta Modu (R-17 onayına bağlı) | 1 g |
| 4 | Bölüm öncesi pencere, oyun öncesi güçlendiriciler, FTUE akışı | 2 g |
| 4 | Analytics tamamlama + ANALYTICS.md eşleme testi, save migration'ları | 1,5 g |
| 4 | Ekran görüntüleri ve design-lead inceleme düzeltmeleri | 2 g |
| | **Faz 4 toplam** | **19,75 g net → 23,5 g (≈ 4,7 hf; tampon 4 → 3,75 g)** |
| 5 | JUICE tamamlama (92 olay; Faz 2 P0'daki 36 olay dışında kalan 56 olay — engel olayları JUICE §0 kural 12 gereği engelleriyle Faz 3'te bağlanır, cilası burada — + azaltılmış varyantlar) | 4 g |
| 5 | Ses: ~76 efekt tembel çizim, müzik | 1,5 g |
| 5 | Capacitor iOS/Android, platform adaptörleri, yaşam döngüsü, Preferences, Haptics | 3 g |
| 5 | Gerçek cihaz perf turları (düşük + orta Android, eski iPhone) ve düzeltmeler | 3 g |
| 5 | Derleme hattı (macOS CI), ikon/splash, paket kimliği, mağaza görüntüleri | 1,5 g |
| 5 | i18n tamamlama, erişilebilirlik ayarları, son hata ayıklama | 2 g |
| | **Faz 5 toplam** | **15 g net → 18 g (≈ 3,6 hf)** |

**Toplam Faz 2–5:** 93,75 g net (26,5 + 32,5 + 19,75 + 15; son tutarlılık turu 2: Faz 2 +0,25, Faz 3 +0,5, Faz 4 +0,25;
turu 3: Faz 2 +0,5, JUICE P0; Faz 2A boşluk kapanışı: Faz 2 +0,25, asgari ana ekran)
→ **110 g tamponlu ≈ 22,0 hafta** (29,5 + 39 + 23,5 + 18; BUSINESS §10: 4 + 8 + 6 + 4 = 22 hf). Toplam
sığar ama pay kalmadı; dağılım değişir: Faz 2 ≈ 6 hf (+2), Faz 3 ≈ 7,8 hf (son tutarlılık turu: hedef engelleyicileri +0,5 g,
✓-tuzağı taraması +1 g; tur 2: öğretici 11–38 +0,5 g), Faz 4 ≈ 4,7 hf (23,5 g), Faz 5 ≈ 3,6 hf (18 g). Gerçek reklam/IAP SDK'ları,
yaş ekranı ve mağaza sürümü işleri Aşama 1–2 kapsamındadır, burada sayılmadı.

---

## 15. Fizibilite ve riskler

| # | Brifteki öğe | Neden pahalı / riskli | Önlem ya da ucuz alternatif |
| --- | --- | --- | --- |
| R-1 | **Solver: 50 bölüm, teslimatlarla, 60 s** | Saha hamleleri durum uzayını patlatır; 5 dilimli bölümde derinlik 30+. Tek parça A* her bölümde bitmeyebilir | Dilim sınırında katmanlı A* (teslimat doğal kesme noktası), budanmış saha hamleleri, K-34 budaması, kabul edilebilir + tutarlı `h`, `worker_threads` paralelliği, bölüm karmasıyla önbellek, beam yedeği ve `exact/heuristic` etiketi + `UB − LB` raporu. Faz 2'de solver yok, el çözümü golden'ları (§9.5). ✓-tuzağı taraması (§9.8) budamasız olduğu için daha pahalıdır: gevşetilmiş oyunla erken eleme, paylaşılan TT, bölüm başına belirlenimci açılım bütçesi ve önbellek; bütçe biterse `trap_scan_incomplete` uyarısı (sessizce temiz sayılmaz) |
| R-2 | **Hafif yerçekiminde düşerken yönlendirme (K-19)** | Gerçek zamanlı girdi; hamle düşüş bitene ya da girdiye dek bekler (iki aşamalı commit); solver dallanması artar | Girdi R-10'a göre büyük hedef: tahtaya dokunuş, dokunulan taraf = yön; tutma ile ayrım eşikle (§4.7); bekleyen hamle diğer her girdi/olayda önce commit edilir (§4.7). K-34 ile doğru bir çıkıntının altı yalnızca `.` olabildiği için yönlendirme ray/pencere tasarımını delmez; çıkıntı yanlış nesneyse (moloz, yapışmış harç) altına doğru yerleşim GDD K-19'un verdiği erişimdir. B planında "yalnız yavaş düşüş"e iner (≈ 1 g kazanç) |
| R-3 | **Ağır yerçekiminde 700 ms otomatik düşüş** | Bulmacada zaman baskısı; solver ve bot zorluğu ölçemez; motor becerisi düşük oyuncuya erişilebilirlik sorunu; cam eşiği 2 ile birleşince sertleşir | Zamanlayıcı sahnede (çekirdek saf), görsel halka sayacı; bot "geç kalma" olasılığıyla modeller. Erişilebilirlik seçeneği 1400 ms (R-11); `holdMs` tek parametre olduğundan "sayaç yok" seçimi de kod değişikliği istemez |
| R-4 | **Asansör + geçitler (K-24)** | Ray hizası her hamle değişir → oyuncu için okunurluk; solver durumuna faz eklenir (`turn mod L`) | Teknik maliyet düşük (çerçeve ofseti); gölge ve geçit çerçevesi hedef plan satırını vurgulamalı (design-lead). Doğrulayıcı: `h + b ≤ 8`. Bölüm 40'ta döner platform + asansör birlikte → şema P-6 |
| R-5 | **`mirrorOf` gizli planlar** | Hesap ucuz (derlemede çözülür). Risk UX: 2 sütunlu dilimde ayna = sütun takası; bot modellemesi tahmini | Teknik risk yok; `?` açıldıkça ipucu (K-32). Botta `mirrorOf` doğru tahmin olasılığı parametresi |
| R-6 | **K-30 Kamyon Yardımı** | Kesin yöntem (karıştır + solver doğrula) çalışma zamanında saniyeler; "≤ 2 hamle" güvencesinin tam araması ≈ 100 ms | GDD'nin üç yolu (D1 zincir/ıslaklık, D2 eksik `B1`, D3 yeniden şekillendirme) + yapıcı dizme + **belirlenimci açılım bütçeli** güvence, bütçe biterse `reshape` (§9.7; saat çekirdeğe girmez, K-43 tekrarı bit bit aynı). K-34 şantiye kaynaklı kilidi büyük ölçüde önler. Boya ile açık: S-30 yanıtı, `B1` kalır (istismar net negatif) |
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
| R-19 | **Bot belirlenimciliği cihaz ↔ sunucu** | `Math.pow` motorlar arası bit-aynı değil; `hash` tanımsızsa sonuç ayrışır | `hash32` = `fmix32-chain-v1` referans vektörleri, lig eğrisi `curveTable` tamsayı tablo + doğrusal ara değer (`Math.pow` yok; §11.2, S-35) |
| R-20 | **Faz 2 takvimi** | Revizyonla kapsam büyüdü (K-34, K-35, K-43, K-45, R-12, R-13) | 26,5 g net / 29,5 g tamponlu ≈ 6 hf (BUSINESS'ta 4 hf; Faz 2A: asgari ana ekran +0,25 g, tampon 3,0 g); toplam Faz 2–5 ≈ 22,0 hf (110 g tamponlu, 93,75 g net; son tutarlılık turunda Faz 3'e +1,5 g net, tur 2'de Faz 2 +0,25 / Faz 3 +0,5 / Faz 4 +0,25 g, tur 3'te Faz 2 +0,5 g (JUICE P0 36 olay; Faz 2 tamponu 3,25 g ≈ %12), §14.1–14.3; D-061 metnindeki "107,5 g ≈ 21,5 hf" buna güncellenir; 22 haftalık planda pay kalmadı); kesme seçeneği §14.1 |

---

## 16. Açık sorular

### 16.1 S-1…S-28 durumu

GDD §15 bütün soruları bağlayıcı olarak yanıtladı; bu belge yanıtlara uyar. Varsayımdan **farklı** çıkan ve TECH'te
değişen yanıtlar: **S-3** (L-03 öğreticilerde de `error`), **S-9** (balon tavanı = plan tepesi, §5.1), **S-19** (şekil
değişimi yalnız D3'te, §9.7), **S-21** (`via`: geçitten geçen her hamlede boya, §4.2, §6.2), **S-26** (girdi R-10,
§4.7), **S-27** (1400 ms R-11, §4.7). Diğerleri varsayımla aynıydı.

### 16.2 S-29…S-38 durumu (product-lead yanıtları, 2026-10-05)

Hepsi GDD/META'da bağlayıcı olarak yanıtlandı; açık kural sorusu kalmadı. TECH yanıtlara uyar.

| # | Soru (kısa) | Yanıt | Fark / TECH yeri |
| --- | --- | --- | --- |
| S-29 | Teslimat balonu ne zaman yükselir? | Düşüp oturur, yükselmez; Y6 açıksa sonraki hamlenin 6. adımında (GDD E-36) | Varsayımla aynı; §5.3 |
| S-30 | Boya ile oluşan açıkta D2 `B1` istismarı | `B1` kalır; boyayla bozmak hamle kaybettirir (GDD K-30) | Varsayımla aynı; §9.7 |
| S-31 | Geri Al Kamyon Yardımını da geri alır mı? | Evet; gerekirse sonraki hamle sonunda yeniden (GDD E-37) | Aynı; §6.4 |
| S-32 | Köprü ödeme anı | `T_öde = min(T_son, max(T_oyuncu, T_bot))`, `T_son` süre içinde başlatılan bölümün bitişine uzar (META §6.1) | Ayrıntılandı; §11.2 |
| S-33 | Balon + düşen blok aynı adım | Düşme yarısı → yükselme yarısı (GDD E-33, K-35 adım 6) | Aynı; §5.3 |
| S-34 | Tavanın üstünden bırakılan balon | Tavana iner; W8 `d = abs(bırakma − tavan)` (GDD E-35) | Aynı; §5.1 |
| S-35 | `events.json` RNG ve lig eğrisi | `rng.hash = fmix32-chain-v1`; lig `curveTable` tamsayı tablo; `groupId = hash(weekId, installId)` (META §7) | **Farklı:** `powFixed` yerine tablo; `groupId`'de kurulum kimliği kalır (ödemeden bağımsız); §2.7, §11.2 |
| S-36 | K-07 eşiği ve K-19 ms/satır | İkisi de tokens'ta; K-07 ve K-19 sayı içermez | Aynı; §4.4, §4.7 |
| S-37 | R-21 W3 seçimi | **(B)** Bölüm 4 geçidi boy 2, W3 imzası `size = 1` (OBSTACLES veri imzası) | **Farklı** (varsayım A idi); §8.3 |
| S-38 | `seed` yoksa | İsteğe bağlı, `id × 1000 + id` (GDD K-45/1, §14) | Uyarı basılmaz; §8.2 |

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
| P-6 | Bölüm şeması inceltmeleri | `schemaVersion`; geçit tipine göre ayrık birleşim; `build.elevator` (`start`, `dir` zorunlu); `debris[].segment`; slider `dir` (varsayılan 1), kepenk `phase` (varsayılan 0); `drag.via`; GDD aralıkları; genişletilmiş `tutorial` (vurgu sözlüğü = UX §13.1, `done` = GDD §14.1/3 kapalı 16 olaylık sözlük + olay başına süzgeçler, `holdOverBuild.minMs`, `startOn`, `tut.ctx.*` anahtarı); `seed` isteğe bağlı (`id × 1000 + id`); L-24…L-26; L-09 kayar kapı `a < b` ve aralık boyunca örtüşme | **Değişti** (2026-10-05: `seed` GDD K-45/1'e eşitlendi; tutarlılık denetimi tur 1; son tutarlılık turu 2: `done` sözlüğü, `startOn`, L-09) |
| P-7 | Ölçek: FIT ve EXPAND desteklenir, öneri EXPAND | Çapa sözleşmesi tokens `layout._doc`'tan: `top` üstten, `bottom` alttan, `board` (durum şeridi dahil) `expandShare` ile; seçim tek ayar | **Değişti** (R-06; proje sahibi seçer; 2026-10-05 tokens gruplarına eşitlendi) |
| P-8 | Sürüklemede saha donuk | Yerçekimi ve komşu etkileri hamle sonunda | Aynı (GDD K-08 ile kabul) |
| P-9 | Ses: ZzFX'in yalnızca `buildSamples`'ı gömülür | MIT başlığıyla; npm bağımlılığı yok; parametreler tokens `audio.sfx` (tek ses) + `audio.seq` (çok notalı, tek arabellekte karıştırma) | **Değişti** (parametre sahipliği; 2026-10-05 `audio.seq` eklendi) |
| P-10 | Playwright önceden kurulu Chromium ile | `executablePath: '/opt/pw-browsers/chromium'` | Aynı |
| P-11 | Solver yalnızca Faz 3'te | Katmanlı A* + TT + budama (hedef engelleyicileri dahil) + beam; Kamyon Yardımı kapalı (`noTruckHelp`); ✓-tuzağı taraması `--traps` (L-27, §9.8); Faz 2'de LEVELS el çözümü golden'ları ve F-3 betik sonuçları | **Değişti** (entrepreneur önerisi kabul; Faz 2 basit solver geri çekildi; son tutarlılık turu: adım 12 kapalı, hedef engelleyicileri, L-27) |
| P-12 | K-30: GDD'nin üç yardım yolu | D1 zincir/ıslaklık → dizme; D2 eksik `B1`; D3 yeniden şekillendirme; yapıcı dizme + belirlenimci açılım bütçeli ≤ 2 hamle güvencesi, bütçe biterse `reshape` | **Değişti** (genel "yeniden kesme" geri çekildi; 2026-10-05 duvar saati bütçesi → açılım sayısı) |
| P-13 | Tek `isCorrectPlacement` (K-16 + K-34) + `buildFront` | Doğrulama, gölge, Vinç, Altın Mala, Boya Fırçası, balon, solver aynı fonksiyon; `verdict { ok, reasons[], missingSupport[] }` GDD sırasıyla; `eligibleTrowelCells ≡ buildFront`; `pieceBounced` birincil neden + eksik destek taşır | **Yeni** (R-01); 2026-10-05'te GDD K-34 görünürlük kancalarına eşitlendi |
| P-14 | Bölüm başında prosedürel blok pişirme | (şekil × renk × bayrak) başına Canvas2D parça dokusu + siluetler; plan hücresi tebeşir altlık + %80; sembol mürekkebi kuralı | **Yeni** (R-05) |
| P-15 | Animasyon sırasında girdi | Tutma bekleyen tahta animasyonlarını son kareye atlatır; kilit yalnız dilim kayması/kamyon/karıştırma; azaltılmış hareket = solma varyantları | **Yeni** (R-12) |
| P-16 | G-L yönlendirme: dokunuş tarafı = yön, iki aşamalı commit | Tutma ile eşikle ayrılır; geçersiz girdi hak yakmaz; `steerZone` parametresi (varsayılan `board`); yalnız GDD K-19 madde 1'in (a)–(f) olayları (§4.7 (1)–(6)) önce bekleyen hamleyi commit eder, listede olmayan girdiler (panorama, hedef paneli) pencereyi kapatmaz | **Yeni** (R-10; 2026-10-05 bekleyen hamle kuralı) |
| P-17 | Bölüm içi devam: hamle günlüğü + belirlenimci tekrar | `inLevel` her hamlede kaydedilir; kapanma kayıp değil; `levelHash` koruması; `m = 0` cezasız çıkış; kazanmada ödül + `inLevel` silme tek atomik yazım; `levels[id].attempts` | **Yeni** (R-13; 2026-10-05 kazanma davranışı tekleştirildi) |
| P-18 | Saf bot modülü | `botSim.ts` yalnızca config + tohum + zaman alır; ESLint import yasağı; iki-kayıt eşitlik testi; `seedHash` günlüğü; Köprü tohumu `eventId`, Lig `(weekId, groupId)`; kurulum kimliği yalnız `groupId`'de, sayı olarak | **Yeni** (R-14); 2026-10-05'te META §6.2/§7'ye eşitlendi ("tohumda kurulum kimliği yok" ve `powFixed` geri çekildi) |
| P-19 | Doğrulayıcı kodları = GDD K-45; mekanik imza tablosu | `Issue.code` + `rule`; mekanik kümesi yalnız veri imzasından (OBSTACLES, 27 satır); `teaches` = türetilen yeni mekanik; W3 = `size = 1` (R-21 B) | **Yeni** (R-02, R-21); 2026-10-05'te W3 seçeneği (A) geri çekildi |
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
 2  % . . . . . | # | W .
 1  . . . . . . | # | W W
 0  . . . . . . | # | Y Y
plan seg0 (top→bottom): YY WW W. WW YY      ← yalnızca biçim örneği: brif §12 Bölüm 4 taslağı (R-21 öncesi,
                                             geçit y=3 boy 1); güncel Bölüm 4 LEVELS'te (geçit boy 2, K-45/9)
hidden: screw@(3,4) key:a@(5,3)      ← gizli öğeler bir bloğun altında (L-14)
```

- Saha: `.` boş, küçük harf = blok rengi (`w y g r o c b p`; `b` = B renkli blok), `1`–`3` kasa (hp), `%` torba
  (renk kodu olmayan karakter; eski `b` mavi blokla karışıyordu). Şantiye: büyük harf = kilitli doğru blok, küçük
  harf = kilitsiz (moloz, harçla yapışmış), `_` platform (asansör ofsetinin altı), `*` Altın Mala hücresi.
- Duvar sınırı (çekirdekte sıfır genişlikli; ASCII'de okunurluk için ayrı sütun olarak basılır, hücre değildir):
  `#` kapalı satır, `=` açık geçit, `x` kapalı geçit (kepenk kapalı / kilitli), `:` duvar üstü hava.
- `--ids` seçeneği renk yerine parça kimliği basar (base36) → fikstür olarak geri yüklenebilir (`fromAscii`). Bu kipte
  kimlik rakamları `1`–`3` kasa ile karışmasın diye kasa ve torba ızgaraya basılmaz, `hidden:` gibi ayrı bir satırda
  listelenir (`obstacles: crate:2@(5,4) bag@(0,2)`, örnekteki kasa ve torba). `fromAscii` iki kipi de okur; test: "ascii bag and blue block round-trip".
