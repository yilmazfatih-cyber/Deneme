# Sıfırdan mini opencode — kodlama ajanının çekirdeği

Bu klasör, [anomalyco/opencode](../README.md) deposunun çekirdek mekanizmasını **yedi aşamada** yeniden kurar:
sağlayıcı soyutlaması → araçlar → izin sistemi → ajan döngüsü → oturum kalıcılığı → bağlam sıkıştırma →
istemci/sunucu ayrımı. Kod özgündür; opencode'dan kopyalanmadı (yalnızca varsayılan izin kuralları gibi davranışı
göstermek için gereken birkaç veri satırı aynıdır). Amaç özellik eşitliği değil, mekanizmayı elle tutulur kılmaktır.

## Gereksinimler

- Node.js 22 veya üstü (yalnızca yerleşik modüller: `node:http`, `node:fs`, `node:child_process`, `node:test`)
- `bash` (bash aracı ve testleri için)
- npm paketi **yok**, internet **gerekmez**

## Nasıl çalıştırılır

```bash
cd repo-atlasi/dallar/07-kodlama-ajanlari/opencode/sifirdan

# Senaryolu sahte modelle uçtan uca örnek (geçici klasörde selam.js dosyasını düzenler)
node ornek.js

# Gerçek bir yerel modelle (ör. Ollama'nın OpenAI uyumlu ucu) — isteğe bağlı, ağ ister
MINI_SHAPE=openai-compatible MINI_BASE_URL=http://127.0.0.1:11434/v1 MINI_MODEL=qwen3 node ornek.js "görev"
```

Terminalden çalıştırırsan izin soruları `e` (bir kez), `h` (her zaman) ya da başka bir tuşla (reddet) yanıtlanır;
terminal yoksa ya da `--evet` verilirse "bir kez" sayılır.

## Nasıl test edilir

```bash
cd repo-atlasi/dallar/07-kodlama-ajanlari/opencode/sifirdan
node --test                    # test/*.test.js dosyalarını kendisi bulur
node --test 'test/*.test.js'   # aynı şey, açık desenle
```

7 test dosyası, 44 test. Testler gerçek model ya da internet kullanmaz: model yerine `createFakeProvider`
senaryosu, HTTP sağlayıcı için `127.0.0.1` üzerinde açılan geçici bir sunucu kullanılır. Not: Node 22'de
`node --test <klasör>` biçimi klasörü dosya sanıp hata verir; klasöre girip `node --test` yaz.

## Aşamalar

| Aşama | Dosya                  | Ne öğretir                                                                                                           |
| ----- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_saglayici.js`  | İç mesaj biçimi; OpenAI uyumlu, Anthropic tarzı ve Ollama tel biçimlerine çeviri; sahte sağlayıcı                    |
| 2     | `asama2_araclar.js`    | `read`, `write`, `edit` (tam metin değiştirme), `glob`, `grep`, `bash` (zaman aşımı + süreç grubu, alt komut bölücü) |
| 3     | `asama3_izinler.js`    | `{action, resource, effect}` kuralları, "son eşleşen kazanır", varsayılan `ask`, `always` kaydı                      |
| 4     | `asama4_dongu.js`      | Adım döngüsü, araç hataları, ret/düzeltme, adım sınırı, yeniden deneme, taşma kurtarma, çökme sonrası onarım         |
| 5     | `asama5_oturum.js`     | JSON dosyalarında oturum; atomik yazma; her adımda geçmişi diskten yeniden okuma                                     |
| 6     | `asama6_sikistirma.js` | Bütçe aşımında özet + korunan kuyruk; araç çağrısı/sonucu çiftini bölmeme                                            |
| 7     | `asama7_sunucu.js`     | HTTP API + SSE olay akışı; izin sorusunun olay olarak yayınlanıp ayrı uçtan yanıtlanması; temiz kapanış              |
| —     | `ornek.js`             | Hepsini birleştiren komut satırı örneği                                                                              |

Okuma sırası: 1 → 2 → 3 → 4 (döngü diğer üçünü birleştirir) → 5 → 6 → 7.

## Önemli fikirler (koddan önce oku)

1. **Model araç çalıştırmaz, araç ister.** Model `tool-call` parçası döndürür; döngü aracı çalıştırır ve sonucu
   `tool` rolünde geri yazar. Her araç çağrısına mutlaka bir sonuç yazılır — reddedilse bile. Yoksa sağlayıcı bir
   sonraki isteği "tool_calls'tan sonra tool mesajı yok" diye reddeder.
2. **Hatalar modele veridir.** Bulunamayan dosya, geçersiz argüman, bilinmeyen araç: hepsi `isError: true` sonuç
   olarak modele döner; model düzeltip yeniden dener. Yalnızca kullanıcının açıklamasız reddi turu keser.
3. **İzni araç ister.** Döngü genel bir kapı değildir; `edit` dosya yolunu, `bash` her alt komutu ayrı kaynak olarak
   denetletir: `git status && rm -rf x` iki kaynaktır, kurallara ayrı ayrı bakılır; biri bile izinli değilse ikisi tek
   soruda birlikte sorulur. opencode da aynı yolu izler. Mini'nin bölücüsü ayraçları ve tırnakları tanır, komut
   ikamesini (`$(…)`) ve bileşik komutları çözümleyemez ve o komutu hiç çalıştırmaz.
4. **Geçmiş diskten okunur.** Her adım oturumu depodan yeniden yükler; süreç ölse bile oturum kaldığı yerden sürer.
   Süreç bir araç çalışırken öldüyse sonraki çalıştırma, sonucu yazılmamış her çağrıya "kesildi" sonucu yazar
   (`settleDanglingToolCalls`). Oturum klasörü çalışma alanının **dışındadır**; içeride olsaydı ajanın `grep` ve
   `glob` araçları kendi konuşma kaydını bulur, `write`/`edit` onu bozabilirdi.
5. **Bağlam bir bütçedir.** Tahmini token sayısı `contextLimit - reserve` değerini aşınca eski kısım özetlenir.
   Sağlayıcı "çok uzun" derse (400 + taşma iletisi ya da 413) bir kez sıkıştırılıp aynı adım yeniden denenir. Gövdede
   yalnızca "context" geçen her hata taşma sayılmaz: geçici bir 503 yeniden denenir, sıkıştırılmaz.

## Gerçek depoyla eşleme

| Mini'deki parça                       | Gerçek depodaki karşılığı (dosya yolu)                                                                                    | Fark                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shapes` + `createHttpProvider`       | `packages/ai/src/protocols/*.ts` (openai-chat, anthropic-messages, gemini…), `packages/ai/src/providers/*.ts`             | Gerçeği akış (stream) tabanlı, onlarca sağlayıcı ve önbellek politikası (`packages/ai/src/cache-policy.ts`) var; mini akışsız                                                                                                              |
| Ollama `/api/chat` biçimi             | `packages/core/src/plugin/provider/ollama.ts` + `local.ts`                                                                | opencode Ollama modellerini `/api/tags` ve `/api/show` ile keşfeder, sonra **OpenAI uyumlu** rotadan konuşur                                                                                                                               |
| `createFakeProvider`                  | `packages/http-recorder` (kayıt/oynatma kasetleri), `packages/core/test/fixtures/recordings/`                             | Gerçek testler gerçek HTTP trafiğini bir kez kaydedip oynatır; mini elle yazılmış senaryo kullanır                                                                                                                                         |
| `isContextOverflow`                   | `packages/ai/src/provider-error.ts`                                                                                       | Gerçeği sağlayıcı başına onlarca taşma kalıbı tutar; mini dar bir kalıp + 400/413 durum kodu kullanır                                                                                                                                      |
| `defineTool`, araç dosyaları          | `packages/core/src/tool.ts` (kayıt defteri), `packages/core/src/tool/plugin/*.ts` (read, write, edit, glob, grep, shell…) | Gerçekte her araç bir eklentidir; şemalar Effect Schema ile; "Code Mode" araçları bir JS yorumlayıcısında çağırtır                                                                                                                         |
| `editTool` + ipucu                    | `packages/core/src/tool/plugin/edit.ts`                                                                                   | Gerçeği CRLF/LF koruma, tipografik tırnak ve satır sonu boşluğu toleransı ve en yakın satırları gösteren ipucu içerir                                                                                                                      |
| `bashTool`, `splitCommands`           | `packages/core/src/tool/plugin/shell.ts`, `packages/core/src/shell/parse.ts`, `packages/core/src/shell/scan.ts`           | Gerçek tarayıcı bash ve PowerShell sözdizimini, komut ikamesini ve dizin değişimlerini çözümler; çözümleyemediğini ("opaque") çalıştırmaz. Araç adı `shell`                                                                                |
| `evaluate`, `createPermissionService` | `packages/core/src/permission.ts`, `packages/core/src/permission/saved.ts`, `packages/core/src/util/wildcard.ts`          | Gerçekte istekler bus olayıyla yayınlanır, `permission.evaluate` eklenti kancası ve gözetimsiz (unattended) kural seti vardır; joker eşleme `\` → `/` çevirir ve sondaki ` *`'ı isteğe bağlı sayar (`git *`, tek başına `git`'i de kapsar) |
| `agents` (build, plan, explore)       | `packages/core/src/plugin/agent.ts`, `packages/core/src/plugin/plan.ts`, `packages/schema/src/agent.ts`                   | Plan ajanı yalnızca plan klasörüne yazabilir ve hatırlatma mesajı ekler. Explore kabuğun yanında `webfetch` ve `websearch`'ü de açar; build'deki `rm *` kuralı mini'nin örneğidir                                                          |
| `runAgent`                            | `packages/core/src/session/runner/llm.ts` (drain, runStep), `runner/step.ts` (attempt)                                    | Gerçeği gelen kutusu (inbox), yönlendirme (steer), araçları paralel fiber'da çalıştırma, anlık görüntü (snapshot) içerir                                                                                                                   |
| `settleDanglingToolCalls`             | `packages/core/src/session/runner/llm.ts` (`settleStaleToolCalls`)                                                        | Gerçeği her drain'in başında yarım kalan araçları "Tool execution interrupted" hatasıyla kapatır                                                                                                                                           |
| `MAX_STEPS_PROMPT`                    | `packages/core/src/session/runner/max-steps.ts`                                                                           | Gerçekte istem asistan mesajı olarak eklenir, araç tanımları önbellek öneki için korunur (mini de tanımları korur)                                                                                                                         |
| `createSessionStore` (JSON dosyası)   | `packages/core/src/session/sql.ts`, `packages/core/src/event/sql.ts`, `packages/core/src/database/`                       | Gerçeği SQLite + Drizzle, olay kaynaklı (event-sourced) projeksiyonlar ve 59 göç (migration) dosyası; veritabanı küresel veri klasöründedir (`database/database.ts`)                                                                       |
| `compactSession`, `SUMMARY_TEMPLATE`  | `packages/core/src/session/compaction.ts`                                                                                 | Gerçeği %15 / en az 16k pay, "native" sağlayıcı sıkıştırması, küçültme adımları ve arka planda önceden özet (`precompute`; deneysel `background_compaction` bayrağı, yayın sürümünde kapalı) içerir                                        |
| `createAgentServer` + SSE             | `packages/server/src/` (HttpApi), `packages/protocol/src/groups/*.ts`, `GET /api/event`                                   | Gerçek istemci HttpApi sözleşmesinden kod üretimiyle çıkar (`packages/client/script/generate.ts`); kimlik doğrulama ve konum (Location) kavramı vardır. İkisi de kapanışta bekleyen izinleri reddeder                                      |
| `createClient`                        | `packages/client`, `packages/sdk`, `packages/tui`, `packages/app`, `packages/cli/src/acp/`                                | Gerçekte TUI, web, masaüstü ve ACP aynı sunucunun istemcileridir; VS Code eklentisi (`sdks/vscode`) yalnızca TUI'yi VS Code terminalinde başlatır                                                                                          |

## Bilinçli eksikler

- Akış (streaming) yok: yanıtlar tek parça gelir. Gerçek ajan metni ve araç çağrılarını parça parça işler.
- Araçlar sırayla çalışır; opencode bağımsız araç çağrılarını paralel fiber'larda başlatır.
- MCP, eklenti sistemi, LSP, anlık görüntü/geri alma (snapshot/revert), alt ajanlar ve TUI yok.
- `bash` aracında kum havuzu (sandbox) yok: komutlar gerçekten çalışır. Testler yalnızca geçici klasörlerde çalışır.
- **Buradaki izin kuralları bir güvenlik sınırı değildir.** Alt komut bölücü basittir: `bash -c '…'`, `eval …`,
  `FOO=1 rm …`, `xargs rm` gibi biçimler `rm *` kuralına takılmaz (testlerde gösteriliyor). Gerçek bir sınır için
  kum havuzu ve daha ayrıntılı bir ayrıştırıcı gerekir.

## Alıştırma önerileri

1. `asama1_saglayici.js`'e OpenAI uyumlu **akış** desteği ekle: `stream: true` gönder, `data:` satırlarını parçala,
   `tool_calls` parçalarını `index`'e göre birleştir. Testi yerel sunucuyla yaz.
2. Araçları `Promise.all` ile paralel çalıştır; izin soruları aynı anda gelirse ne olur? opencode'daki "bir ret,
   bekleyen tüm sorulara uygulanır" kuralını (`permission.ts`, `reply`) uygula.
3. `asama7_sunucu.js`'e `POST /session/:id/interrupt` ekle; döngüye `AbortSignal` geçir.
