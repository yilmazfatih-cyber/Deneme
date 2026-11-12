# Mini OpenClaw Gateway — kontrol düzlemi, kanallar, yönlendirme, eşleştirme, ajan, beceriler, otomasyon

Bu klasör, [OpenClaw dosyasında](../README.md) anlatılan Gateway mimarisini **sıfırdan ve özgün kodla** kurar:
tipli kontrol düzlemi → kanal eklentileri (CLI + HTTP webhook'lu sahte sohbet uygulaması) → oturum yönlendirme →
DM eşleştirme ve izin listesi → oturum başına sıralanan, araç çağıran ajan → SKILL.md becerileri (kademeli açılım)
→ zamanlanmış işler. Gerçek koddan kopya yok; adlar kavramları eşleştirmek için benzer tutuldu.

## Gereksinimler

- Node.js 22+ — yalnızca yerleşik modüller (`node:http`, `node:crypto`, `node:fs/promises`, `node:test`).
  npm paketi yok. Ağ yalnızca `127.0.0.1` (sahte sohbet uygulaması ve Gateway HTTP sunucusu rastgele portlarda).
- Gerçek LLM yok: `createScriptedModel` (testler) ve `createDemoModel` (demo) deterministik sahte modellerdir.

## Çalıştırma

```bash
cd repo-atlasi/dallar/06-ajan-platformlari/openclaw/sifirdan
node demo.js
```

Beklenen çıktı (kodlar her çalıştırmada değişir):

```text
Uygun beceriler: hava-durumu (workspace)
=== 1) Bilinmeyen kişi → eşleştirme kodu ===
  → 42: Bu asistana erişim onay gerektiriyor. Sahibine şu kodu ilet: G6ZBDZD9 (onay: openclaw pairing approve …)
Operatör onayı: { approved: true, senderId: '42' }
=== 2) Beceri okundu, tehlikeli araç ana oturum dışında reddedildi, grupta yalnızca anılınca cevap ===
  → 42: İstanbul: 14°C, parçalı bulutlu.
  → 42: Bunu yapamıyorum: bu oturumda kullanılamayan araç: exec
  → grup-1: Özet: bugün 3 yeni mesaj, 1 toplantı.
CLI (ana oturum) tehlikeli aracı kullanabilir: Tamam: (sahte) ls çalıştırıldı
```

## Test

```bash
node --test          # tests/*.test.js dosyalarını kendisi bulur: 31 test (biri 127.0.0.1 üzerinde uçtan uca HTTP)
```

`node --test <klasör>` biçimi Node 22'de klasörü dosya sanıp hata verir; klasöre girip `node --test` yaz ya da
`node --test 'tests/*.test.js'` kullan.

## Aşamalar

| Dosya                   | Ne öğretir                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asama1_protokol.js`    | `ControlPlane`: ilk çerçeve `connect`, sabit süreli token karşılaştırma, `operator`/`node` rolleri, mini JSON Şeması doğrulaması, idempotency önbelleği, `seq`'li olay yayını                                                                                             |
| `asama2_kanallar.js`    | Kanal sözleşmesi, `createCliChannel`, `createFakeChatChannel` (gizli başlıklı webhook, `/sendMessage` ile cevap), `startFakeChatApp` (Telegram benzeri yerel sohbet platformu)                                                                                            |
| `asama3_yonlendirme.js` | `buildAgentPeerSessionKey` (`main`, `per-peer`, `per-channel-peer`, gruplar), `resolveAgentRoute` (en özgül bağlama), `decideDmAccess`, `passesMentionGate`, `PairingStore`                                                                                               |
| `asama4_ajan.js`        | `ToolRegistry`, `resolveToolPolicy` (`non-main` kipinde tehlikeli araç yok), `runAgentLoop`, `SessionLanes` (oturum başına sıra), `AgentRuntime` (AGENTS.md / SOUL.md / IDENTITY.md / USER.md önyüklemesi), `NO_REPLY`                                                    |
| `asama5_beceriler.js`   | `discoverSkills` (en çok 6 klasör derinliği, öncelik: ilk kök kazanır, SKILL.md bulunan klasörün altına inilmez), `isEligible` (`metadata.openclaw.requires`), `formatSkillsForPrompt` (`<available_skills>`), `createReadTool` (kök dışı ve sembolik bağ kaçışı engelli) |
| `asama6_zamanlayici.js` | `parseCron`, `computeNextRun` (`at`, `every` ızgarası, `cron`), `CronService.tick` (önce ilerlet, `agent:<id>:cron:<iş>:run:<koşu>` oturumu, teslim, `HEARTBEAT_OK` sessiz, tek seferlik iş silinir)                                                                      |
| `gateway.js`            | Hepsini bağlar: gelen mesaj hattı, RPC yöntemleri (`health`, `send`, `agent`, `pairing.*`, `cron.*`, `node.event`), HTTP rotaları                                                                                                                                         |
| `demo.js`               | Uçtan uca senaryo; testler de onun çalışma alanı ve araç kurucularını kullanır                                                                                                                                                                                            |

## Mini ile gerçek depo eşlemesi

| Mini'deki parça                           | Gerçek depodaki karşılığı (dosya yolu)                                                                                     | Fark                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ControlPlane.handleFrame`                | `src/gateway/server/ws-connection.ts`, `src/gateway/server-methods.ts`, `packages/gateway-protocol/`                       | Gerçekte WebSocket, TypeBox şemaları, cihaz kimliği ve imzalı `connect.challenge`, kapsamlar (scopes)                                                     |
| `#idempotent`                             | `docs/concepts/architecture.md` ("short-lived dedupe cache")                                                               | Aynı fikir; gerçek önbelleğin ayrıntıları burada taklit edilmedi                                                                                          |
| `createFakeChatChannel`                   | `extensions/telegram/` (grammY), `extensions/*/openclaw.plugin.json`                                                       | Gerçek kanallar eklenti yükleyiciyle gelir; akışlı taslak, medya, konular, tepkiler destekler                                                             |
| `buildAgentPeerSessionKey`                | `src/routing/session-key.ts`                                                                                               | Gerçekte hesap kimliği kapsamı (`per-account-channel-peer`), kimlik bağlantıları, konu son ekleri                                                         |
| `resolveAgentRoute`                       | `src/routing/resolve-route.ts`, `src/routing/bindings.ts`                                                                  | Gerçekte hesap ve takım/rol eşleşmeleri, önbellek                                                                                                         |
| `decideDmAccess`, `PairingStore`          | `src/channels/direct-dm-access.ts`, `src/pairing/pairing-store.ts`                                                         | Gerçek depo SQLite'ta, erişim grupları, komut sahibi (`commands.ownerAllowFrom`)                                                                          |
| `runAgentLoop`                            | `packages/agent-core/src/agent-loop.ts` (`runAgentLoop`)                                                                   | Gerçekte akış, paralel araç toplu yürütmesi, yönlendirme/takip mesajları, kurtarma                                                                        |
| `AgentRuntime.runTurn`, `SessionLanes`    | `src/agents/agent-command.ts`, `src/agents/embedded-agent-runner/`                                                         | Gerçekte oturum denetleyicisi + genel kapasite, yazar iddiası (writer claim), model geri dönüşü                                                           |
| `resolveToolPolicy`                       | `src/agents/sandbox/`, `docs/gateway/sandboxing/`                                                                          | Gerçek `non-main` kipi araçları gizlemez, sandbox'ta (Docker, SSH…) çalıştırır; mini sürüm sadeleştirip tehlikeli araçları kapatır                        |
| `discoverSkills`, `formatSkillsForPrompt` | `src/skills/loading/` (`skill-root-discovery.ts`, `workspace-skill-loader.ts`, `skill-precedence.ts`, `skill-contract.ts`) | Gerçekte 7 öncelik düzeyi, JSON5 metadata, bağlam bütçesine göre kısaltma, sandbox eşitlemesi; tarama derinliği aynı (`MAX_GROUPED_SKILL_SCAN_DEPTH = 6`) |
| `CronService`                             | `src/cron/` (`service.ts`, `schedule.ts`, `isolated-agent.ts`, `delivery.ts`)                                              | Gerçekte SQLite kalıcılığı, saat dilimi, `on-exit`/`stream` zamanlamaları, telafi ve yeniden deneme                                                       |
| `isSilentReply`                           | `src/auto-reply/tokens.ts`                                                                                                 | Gerçekte yalnızca `NO_REPLY` sessiz cevaptır; `HEARTBEAT_OK` ayrı bir belirteçtir, mini sürüm ikisini birlikte ele alır                                   |

## Bilinçli sadeleştirmeler

- Kontrol düzlemi taşımadan bağımsız ve süreç içi (`connectClient`); gerçek Gateway aynı çerçeveleri WebSocket ile taşır.
- Durum bellekte: yeniden başlatmada eşleştirmeler, dökümler ve işler kaybolur (gerçekte SQLite).
- Cron saatleri UTC'de değerlendirilir; saat dilimi desteği yok.
