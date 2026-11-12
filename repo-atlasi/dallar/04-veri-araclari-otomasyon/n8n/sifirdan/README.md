# n8n — sıfırdan mini sürüm: iş akışı motoru, güvenli ifadeler, düğümler ve webhook

Bu mini, n8n'in kalbini sıfırdan kurar: **n8n'den dışa aktarılan biçimdeki iş akışı JSON'unu** (düğümler +
ad tabanlı bağlantılar) okuyup çalıştıran bir motor, `={{ $json.x }}` ifadeleri için `eval` kullanmayan bir
yorumlayıcı, sekiz düğüm tipi (Manual Trigger, Webhook, Set, If, HTTP Request, Code, Merge, No Op) ve webhook
sunucusu. n8n "Sustainable Use License" (fair-code) ile
lisanslıdır; buradaki kod kopya değildir, aynı veri biçimini ve davranışları sıfırdan uygular.

## Gereksinimler

- Node.js 22+, yalnızca yerleşik modüller (`node:vm`, `node:worker_threads`, `node:http`, `node:test`).

## Çalıştırma

```bash
cd sifirdan
node cli.js calistir ornekler/siparis-akisi.json        # günlüğü ve son düğümün çıktısını yazar
node cli.js sunucu ornekler/webhook-akisi.json --port 5678
curl -s -X POST localhost:5678/webhook/siparis -H 'content-type: application/json' \
  -d '{"musteri":"Ece","tutar":250}'                      # -> {"musteri":"Ece","tutar":250,"kdv":50}
curl -s localhost:5678/executions                        # yürütme kayıtları
```

`ornekler/` içindeki JSON'lar n8n'in kendi biçimindedir (`nodes`, `connections`, `settings.executionOrder`,
`pinData`); n8n arayüzüne içe aktarmayı da deneyebilirsin (sürüm farkları olabilir, doğrulanmadı).

## Test

```bash
cd sifirdan && node --test                 # 22 test
```

## Aşamalar

| Aşama | Dosya                | Ne öğretir                                                                                                                                                                                                                                  |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_ifade.js`    | Sözcük ayırıcı + özyinelemeli iniş ayrıştırıcı + ağaç yorumlayıcı; izin listesi (metot/özellik); `{{ }}` şablonları; tek ifade ham değer döner; `$json`, `$input`, `$('Düğüm')`, `$node`                                                    |
| 2     | `asama2_dugumler.js` | Düğüm tipi kaydı; öğe dizisi modeli (`[{ json }]`); çok çıkışlı düğüm (If); Set'in `assignments` biçimi; HTTP Request; Merge; Code (işçi iş parçacığı + vm)                                                                                 |
| 3     | `asama3_motor.js`    | `nodeExecutionStack`, iki girdili düğüm için bekleme odası, `requiredInputs`, v1 ("önce dal, sol üstteki önce") ve v0 sırası, boş çıkışın dalını atlama, `runData`, `continueOnFail`/`onError`, yeniden deneme, `pinData`, devre dışı düğüm |
| 4     | `asama4_webhook.js`  | `/webhook/<path>` yönlendirme, `responseMode` (`onReceived`/`lastNode`), gövde ayrıştırma ve boyut sınırı, yürütme deposu                                                                                                                   |
| -     | `kod-iscisi.js`      | Code düğümü için sonlandırılabilir işçi: JSON metni girer, JSON metni çıkar; `eval` kapalı                                                                                                                                                  |

## Gerçek depoyla eşleme

| Mini'deki parça               | Gerçek depodaki karşılığı                                                                                            | Fark                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IsAkisi`                     | `packages/workflow/src/workflow.ts` → `Workflow` (+ `common/map-connections-by-destination.ts`)                      | Asıl sınıf alt iş akışı, AI alt düğümleri, statik veri de taşır                                                                                                                                                               |
| `akisiCalistir()`             | `packages/core/src/execution-engine/workflow-execute.ts` → `WorkflowExecute.processRunExecutionData`                 | 3.200+ satır: kısmi çalıştırma, bekleme (Wait), iptal, AI ajan döngüsü                                                                                                                                                        |
| `ilet()` / `bekleyeniCoz()`   | `addNodeToBeExecuted` + `waitingExecution` + `requiredInputs` kontrolü                                               | Aynı kural; çoklu "run index" yok                                                                                                                                                                                             |
| v1 sıralaması                 | `workflow-execute.ts` içindeki "top-left first" sıralaması                                                           | Aynı amaç: önce y'ye, sonra x'e göre azalan sırayla yığının başına ekleme. Asıl karşılaştırıcı x için yalnızca `a.x > b.x` durumunu ele alır (tam bir sıralama değil); biz `yy - xy \|\| yx - xx` ile tam sıralama kullanırız |
| `ifadeyiDegerlendir()`        | `packages/workflow/src/expressions/native-evaluation/` (grammar, parser, evaluator)                                  | Asıl sürüm alt kümeye uymayanı Tournament + izole V8 (`@n8n/expression-runtime`) ile çalıştırır                                                                                                                               |
| `ifadeOrtami()`               | `packages/workflow/src/workflow-data-proxy.ts`                                                                       | `$('X').item` asılda `pairedItem` soyuyla bulunur; biz aynı sıradaki öğeyi alırız; `$now` Luxon değil ISO metni                                                                                                               |
| `dugumTipleri`                | `packages/nodes-base/nodes/*` + `INodeType` (`packages/workflow/src/interfaces.ts`)                                  | Asıl düğümler sürümlüdür (`typeVersion`) ve tanımları çok daha zengindir                                                                                                                                                      |
| Code düğümü + `kod-iscisi.js` | `packages/nodes-base/nodes/Code/` + `packages/@n8n/task-runner` (ayrı süreç)                                         | Bizimki aynı süreçte bir iş parçacığı: güvenlik sınırı DEĞİL                                                                                                                                                                  |
| `webhookSunucusu()`           | `packages/cli/src/webhooks/` (`live-webhooks.ts`, `webhook-helpers.ts`, `webhook-on-received-response-extractor.ts`) | Test webhook'ları, bekleyen (waiting) webhook'lar, yanıt düğümü yok                                                                                                                                                           |
| `YurutmeDeposu`               | `packages/cli/src/executions/` + veritabanı (`@n8n/db`, SQLite/Postgres)                                             | Bellekte, son 100 kayıt                                                                                                                                                                                                       |

## Bilerek eksik bırakılanlar

Kimlik bilgileri (şifreli saklama), ikili veri (`binary`), alt iş akışları, zamanlayıcı tetikleyiciler,
kuyruk kipi (Bull + Redis ile ayrı işçiler), editör arayüzü (Vue + Vue Flow), AI/LangChain düğümleri.
Dossier'deki "Gerçek ölçeğe giden yol" bölümü bunların sırasını anlatır.
