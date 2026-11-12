# Sıfırdan mini dsh — Cordis tarzı eklenti sistemi ve "her şey bir eklenti" harness'ı

Bu klasör, [deepseek-ai/deepseek-harness](../README.md) deposunun iki katmanını yeniden kurar: (1) altındaki **Cordis**
eklenti çatısının çekirdek fikirleri — bağlam (Context), servis, `ctx.plugin(eklenti, yapılandırma)`, `inject` ile
bağımlılık, otomatik geri sarılan etkiler (effects), beş kipli olay yolu; (2) bu çatının üstünde, model sağlayıcısı,
araçlar, izin kapısı, onay ve arayüz kanalının **hepsinin eklenti olduğu** küçük bir harness. Kod özgündür; Cordis ya
da dsh kodundan kopya değildir.

## Gereksinimler

- Node.js 22+ (yalnızca yerleşik modüller), npm paketi yok, internet yok.

## Nasıl çalıştırılır

```bash
cd repo-atlasi/dallar/07-kodlama-ajanlari/deepseek-harness/sifirdan
node ornek.js
```

Örnek; taban paketi + etkileşimli paketi + bir kullanıcı yamasını uygular, `--dump-config` benzeri satır listesini
yazdırır, eklenti durumlarını gösterir, senaryolu modelle bir tur çalıştırır ve arayüz kanalının oturum olaylarından
ürettiği satırları basar.

## Nasıl test edilir

```bash
node --test   # test/*.test.js — 3 dosya, 17 test
```

## Aşamalar

| Aşama | Dosya               | Ne öğretir                                                                                                    |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_olaylar.js` | `emit`, `parallel`, `serial`, `bail`, `waterfall` (etrafından saran ara katman, `next()` ile veto), `prepend` |
| 2     | `asama2_baglam.js`  | `App`, `Fiber` durum makinesi, `ctx.plugin`, `inject`, `ctx.effect`, `ctx.provide`, `Service`, şema doğrulama |
| 3     | `asama3_harness.js` | Oturum günlüğü, model servisi + sahte bağdaştırıcı, araç hattı, izin kapısı, onay, arayüz, ajan döngüsü       |
| 4     | `asama4_profil.js`  | Satırlar (rows), paketler (bundles), yamalar (patches), katalogdan çözme, `dumpConfig`                        |
| —     | `ornek.js`          | Hepsini birleştiren örnek                                                                                     |

## Fiber durum makinesi

```text
PENDING ──(inject'ler hazır)──▶ LOADING ──▶ ACTIVE ──(dispose)──▶ UNLOADING ──▶ DISPOSED
   ▲                              │            │
   │                              ▼            │ (bağımlı olduğu servis kayboldu)
   └────────────── FAILED ◀── (apply/şema hatası; etkiler geri sarılır)  └──▶ PENDING (servis dönünce yeniden yüklenir)
```

## Önemli fikirler

1. **Bağımlılık sırayla değil, servisle çözülür.** `inject: ['tools']` diyen eklenti, `tools` servisi gelene kadar
   PENDING bekler; satırların sırası önemli değildir. Servis kalkarsa bağımlılar otomatik boşaltılır, servis dönünce
   yeniden yüklenir — "sıcak değiştirme" (hot swap) bunun üstüne kuruludur.
2. **Kayıtlar etkidir.** `ctx.on(...)`, `ctx.provide(...)`, `ctx.plugin(...)` ve `ctx.effect(() => kayıt)` eklenti
   kalkınca ters sırada geri sarılır; elle `removeListener` tutmazsın.
3. **Politika olaylara takılır, döngüye değil.** İzin kapısı `tools/pre-execute` waterfall'ına bir dinleyicidir:
   kararı kendisi veriyorsa `next()` çağırmadan döner (veto). Döngüyü değiştirmeden izin, kanca, kum havuzu eklenir.
4. **Model geçmişi günlükten türetilir.** `SessionLog.deriveMessages()` modele gidecek mesajları yalnızca olay
   günlüğünden üretir: günlükte yoksa modele gitmez ("model-visible ⟺ logged").
5. **Kompozisyon veridir.** Uygulama, satır listesine katman katman uygulanan yamalardan doğar. Yanlış hedefli yama
   sessizce atlanmaz: mini hata fırlatır; dsh'nin gömülü yükleyicisi uyarı yazıp o yamayı atlar
   (`vendor/include/src/patch.ts`, `applyPatches`).

## Gerçek depoyla eşleme

| Mini'deki parça                     | Gerçek depodaki karşılığı (dosya yolu)                                                                                        | Fark                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EventBus`                          | `vendor/cordis/src/events.ts` (`EventsService`)                                                                               | Gerçekte olay filtreleri, bağlam kapsamları ve tipli olay haritası (declaration merging) var. Cordis'in `emit`'i dinleyici hatasını yakalamaz; dsh bunu yalnızca bazı gözlem olaylarında (`session/event`, `agent/disposed`) kendisi yapar, mini her `emit`'te yapar                                                                                 |
| `App`, `Fiber`, `createContext`     | `vendor/cordis/src/context.ts`, `fiber.ts`, `registry.ts`, `reflect.ts`                                                       | Gerçek `Context` bir Proxy'dir; `isolate()` ve `intercept()` ile kapsamlı servisler; async apply ve eşzamanlı async temizlik desteği                                                                                                                                                                                                                 |
| `Service` tabanı                    | `vendor/cordis/src/service.ts`                                                                                                | Gerçekte yapılandırma çözümü ve yaşam döngüsü kancaları daha zengin                                                                                                                                                                                                                                                                                  |
| `schema` alanı                      | `vendor/schemastery/` (Schemastery), yükleyicinin config doğrulaması                                                          | Mini yalnızca bir doğrulama fonksiyonu çağırır                                                                                                                                                                                                                                                                                                       |
| `SessionLog`, `deriveMessages`      | `packages/core/session/`, `packages/session/`, `docs/subsystems/session.md`                                                   | Gerçek günlük JSONL'e yazılır, sürümlü biçim göçleri ve projeksiyon servisi (`ctx.sessionProjections`) var                                                                                                                                                                                                                                           |
| `LlmService`, `fakeLlm`             | `packages/llm/llm/src/index.ts` (`LlmRuntime`, `ctx.llm`), `packages/llm/llm-deepseek/`, `packages/llm/llm-pi-ai/`            | Gerçeği akışlıdır (`llm/stream` waterfall; mini'deki `llm/request` olayı gerçekte yok), yeniden deneme eklentisi (`llm-retry`) ve token ölçer (`token-meter`) ayrı eklentilerdir                                                                                                                                                                     |
| `ToolsService.execute`              | `packages/core/tools/src/pipeline.ts`, `docs/tool-execution-pipeline.md`                                                      | Gerçek hatta monoton koruyucular (guards), `projectContent` / `finalizeContent`, toplu (batch) yürütme ve PTC modu var                                                                                                                                                                                                                               |
| `permissionGate`, `ApprovalService` | `packages/interaction/permission-presets/`, `packages/interaction/user-approval/`, `packages/sandbox/sandbox-policy/`         | Gerçekte izin ön ayarı = kum havuzu kipi + onay politikası; yanıtlayıcılar `approval/request` waterfall dinleyicileridir, yanıtlayıcı yoksa sonuç `unavailable` olur ("fail closed"); her karar denetim günlüğüne yazılır                                                                                                                            |
| `UiChannel`                         | `apps/web/`, `packages/client/*` (Web istemcisi), `docs/subsystems/conversation.md`                                           | Gerçek arayüz React tabanlı web/masaüstü uygulamasıdır; aynı ilke: `session/event`'ten çizer                                                                                                                                                                                                                                                         |
| `AgentLoop.run`                     | `packages/core/agent-loop/src/index.ts` (`AgentLoop` servisi), `agent.ts` (`ReactLoopAgent`), `inbox.ts`                      | Gerçekte gelen kutusu, istek serisi (request series), iptal, yeniden deneme, `agent/pre-step` ve `agent/request` waterfall'ları var                                                                                                                                                                                                                  |
| `agent/turn-stopping`               | `docs/architecture.md` ("Turn flow"), `packages/core/agent-loop/src/agent.ts`                                                 | Gerçekte serial bir olaydır ve dönüş değeri kullanılmaz: tur, ancak gelen kutusunda yeni bir adım girdisi (ör. yönlendirme) varsa sürer; dinleyiciler olayı kaçak turları kesmek için kullanır. Mini kolaylık için dönen metni yeni kullanıcı mesajı yapar. Hedef takibi (`packages/goal/goal-round-driver`) ise ajan boştayken yeni turlar başlatır |
| `applyLayers`, `compose`            | `packages/bundle/base/cordis.patch.yml`, `packages/bundle/*/`, `packages/boot/app-boot/`, `vendor/loader/`, `vendor/include/` | Gerçek satırlar YAML'dır, `!!js` ifadeleri ve HMR ile canlı yeniden yükleme vardır; bilinmeyen satırı hedefleyen yama uyarıyla atlanır (mini hata fırlatır)                                                                                                                                                                                          |
| `dumpConfig`                        | `dsh --profile web --dump-config`                                                                                             | —                                                                                                                                                                                                                                                                                                                                                    |

## Bilinçli eksikler

- `apply` eşzamanlıdır (sync); Cordis async yüklemeyi ve eşzamanlı (concurrent) async temizliği destekler.
- Servis kapsamları (`isolate`, `intercept`) yok; tüm servisler tek düz ad alanında.
- Akış, sıcak modül yeniden yükleme (HMR), kalıcı JSONL günlük, alt ajanlar ve gerçek kum havuzu yok.

## Alıştırma önerileri

1. `ctx.isolate('tools')` ekle: bir alt ağaçta farklı bir `tools` servisi sağlanabilsin (preset fikri).
2. `SessionLog`'u JSONL dosyasına yazan bir `SessionPersistence` servisine böl; günlüğü yeniden açıp `deriveMessages`
   sonucunun aynı olduğunu test et.
3. `tools/execute` waterfall'ına zaman aşımı koyan bir `timeoutPolicy` eklentisi yaz (dsh'de `packages/guard/timeout-policy`).
