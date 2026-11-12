# miniollama — Ollama'nın sunucu iskeletini Go ile sıfırdan yazmak

Ollama'nın asıl mühendisliği "modeli çalıştırmak" kadar **modeli paketlemek, indirmek, belleğe alıp boşaltmak
ve tutarlı bir HTTP API'si sunmak**tır. Bu mini, yalnızca Go standart kütüphanesiyle şunları kurar:

- **Modelfile ayrıştırıcı:** `FROM`, `PARAMETER`, `TEMPLATE`, `SYSTEM`, `LICENSE`, `MESSAGE`; `"""çok satırlı"""` değerler.
- **İçerik adresli model deposu:** `blobs/sha256-<özet>` + `manifests/<host>/<ad alanı>/<model>/<etiket>`; miras alma
  (`FROM baska-model`), silmede çöp toplama.
- **Kayıt defteri ve `pull`:** OCI dağıtım API'sinin küçük bir alt kümesi (`/v2/.../manifests/...`, `/v2/.../blobs/...`);
  her blob indirilirken sha256 ile doğrulanır, manifest en son yazılır.
- **Sohbet şablonu:** mesajları `text/template` ile modelin beklediği düz isteme çevirme.
- **Çalıştırıcı arayüzü:** gerçekteki llama.cpp `llama-server` alt süreci yerine karakter düzeyinde bir Markov zinciri.
- **Zamanlayıcı:** referans sayacı, `keep_alive` (0 = hemen boşalt, negatif = sonsuza dek), en fazla N yüklü model,
  boşta olanı atma, yer yoksa bekleme.
- **HTTP API:** `/api/generate` ve `/api/chat` (NDJSON akışı veya `"stream": false`), `/api/tags`, `/api/show`,
  `/api/pull`, `/api/ps`, `/api/delete`.

## Gereksinimler

- Go 1.24+ (yalnızca standart kütüphane; modül indirmez).

## Çalıştırma

```bash
cd repo-atlasi/dallar/05-yapay-zeka-altyapisi/ollama/sifirdan
export MINIOLLAMA_MODELS=/tmp/miniollama-modeller        # gerçekte OLLAMA_MODELS
go run ./cmd/miniollama create -f ornek/Modelfile turkce
go run ./cmd/miniollama serve                             # 127.0.0.1:11435 (gerçek Ollama: 11434)

# başka bir terminalde
curl -s localhost:11435/api/generate -d '{"model":"turkce","prompt":"Bugün hava nasıl?"}'
curl -s localhost:11435/api/chat -d '{"model":"turkce","stream":false,
  "messages":[{"role":"user","content":"Akşam ne pişirsem?"}]}'
curl -s localhost:11435/api/ps
```

Akışlı yanıt her satırda bir JSON nesnesidir (NDJSON); son satır `"done": true` ve ölçümleri taşır:

```text
{"model":"turkce","created_at":"...","response":"S","done":false}
{"model":"turkce","created_at":"...","response":"a","done":false}
...
{"model":"turkce","created_at":"...","response":"","done":true,"done_reason":"stop","total_duration":295717,
 "load_duration":243111,"prompt_eval_count":95,"eval_count":38,"eval_duration":51371}
```

Not: Markov modelinin bağlamı yalnızca son 6 karakterdir; bu yüzden cevap soruya bakmaz, "asistan" işaretinden
sonra eğitim metnindeki cevaplardan birini (ya da karışımını) üretir. Gerçek modellerde bağlam binlerce belirteçtir
— `num_ctx`, KV önbelleği ve bellek hesabı tam da bu yüzden önemlidir.

Pull denemesi için bir depoyu kayıt defteri olarak sunabilirsiniz:

```bash
go run ./cmd/miniollama registry -models /tmp/miniollama-modeller -addr 127.0.0.1:5005
MINIOLLAMA_MODELS=/tmp/baska-depo go run ./cmd/miniollama serve -registry http://127.0.0.1:5005
curl -s localhost:11435/api/pull -d '{"model":"turkce"}'
```

## Test

```bash
cd repo-atlasi/dallar/05-yapay-zeka-altyapisi/ollama/sifirdan && go test ./...
# yarış denetleyicisiyle: go test -race ./...
```

28 test, tamamı çevrimdışı (`httptest`): Modelfile hataları satır numarasıyla, sohbet şablonu, Markov'un tohumla
deterministik olması ve durdurma dizileri, zamanlayıcının paylaşma/boşaltma/bekleme kuralları, kurcalanmış blob'un
reddedilmesi, uçtan uca HTTP akışı (sahte "yankı" çalıştırıcıyla şablonun ürettiği istem doğrudan görülür).

## Aşamalar

| Aşama | Paket            | Ne öğretir                                                                                              |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| 1     | `modelfile`      | Satır tabanlı ayrıştırma, `"""` blokları, tipli parametreler, metne geri yazma                          |
| 2     | `store`          | İçerik adresleme, manifest, ad çözümleme, miras, çöp toplama, kayıt defteri + doğrulamalı `Pull`        |
| 3     | `prompt`         | Sohbet şablonu: `.System`, `.Messages`, eski tip `.Prompt`                                              |
| 4     | `runner`         | Çalıştırıcı arayüzü, Markov "yükleme", sıcaklık, tohum, `num_predict`, durdurma dizisi tamponlama       |
| 5     | `sched`          | Referans sayacı, `keep_alive` zamanlayıcıları, kapasite ve LRU atma, `context` ile bekleme              |
| 6     | `server`         | NDJSON akışı, hata kodları, `done_reason`, boş istemle "yalnızca yükle", `/api/pull` ilerleme satırları |
| 7     | `cmd/miniollama` | `serve`, `create`, `list`, `registry` alt komutları                                                     |

Önerilen okuma sırası: `api/types.go` → `server/server.go` (`run` fonksiyonu) → `sched/sched.go` → `runner/runner.go`
→ `store/store.go` + `store/pull.go` → `modelfile/modelfile.go` → testler.

## Mini'deki parça ↔ gerçek depo

| Mini'deki parça                   | Gerçek depodaki karşılığı (dosya yolu)                                                                              | Fark                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/types.go`                    | `api/types.go` (`GenerateRequest`, `ChatResponse`, `ProgressResponse`, `Duration.UnmarshalJSON`)                    | Alan adları aynı; gerçekte görüntü, araç çağrısı, "thinking", logprob alanları da var.                                                                   |
| `modelfile.Parse`                 | `parser/parser.go` (`ParseFile`, rune tabanlı durum makinesi)                                                       | Gerçekte `ADAPTER`, `DRAFT`, `RENDERER`, `PARSER`, `REQUIRES`, `CAPABILITY` komutları ve `CreateRequest`'e dönüşüm var.                                  |
| `store` (blobs + manifests)       | `manifest/manifest.go`, `manifest/layer.go`, `manifest/paths.go`, `server/images.go`                                | Gerçekte iki manifest düzeni (`manifests` ve `manifests-v2`), çalıştırıcıya göre seçilen manifest listeleri, `registry.ollama.ai`/`ollama.com` adları.   |
| `Store.Create`                    | `server/create.go` + `create/` paketi; CLI dosyaları önce `/api/blobs/:digest` ile yükler, sonra `/api/create`      | Gerçekte safetensors → GGUF dönüştürme, nicemleme, tensör bazlı katmanlar.                                                                               |
| `RegistryHandler`, `Store.Pull`   | `server/images.go` (`PullModel`, `pullModelManifest`), `server/download.go` (parçalı, devam ettirilebilir indirme)  | Gerçekte paralel parça indirme, yeniden deneme, kimlik doğrulama, yönlendirmeler (`transfer/`).                                                          |
| `prompt.Render`                   | `template/template.go` + `template/*.gotmpl`; yeni modellerde `model/renderers/` (Go kodu)                          | Gerçekte araçlar (tools), "thinking", eski şablonlar için mesajları harmanlama (`collate`), Jinja şablonu → Go şablonu eşlemesi (`template/index.json`). |
| `runner.Runner` arayüzü           | `llm/server.go` (`LlamaServer` arayüzü)                                                                             | Gerçek arayüzde `Load`, `Ping`, `Tokenize`, `Embedding`, VRAM ölçümleri var.                                                                             |
| `Markov` çalıştırıcı              | `llm/llama_server.go`: llama.cpp `llama-server` alt süreci; `mlxrunner/`: `ollama runner` alt süreci (MLX)          | Gerçek çıkarım ayrı süreçte, yerel HTTP üzerinden (`/completion`, `/v1/chat/completions`, `/tokenize` ...).                                              |
| durdurma dizisi tamponlama        | `llm/llama_server.go` ve çıktı ayrıştırıcıları (`model/parsers/`, `thinking/`, `harmony/`)                          | Gerçekte araç çağrısı ve düşünme bloklarını ayıran akış ayrıştırıcıları.                                                                                 |
| `sched.Scheduler`                 | `server/sched.go` (`Scheduler`, `pendingReqCh`, `finishedReqCh`, `expiredCh`, `refCount`, `expireTimer`)            | Gerçekte tek goroutine + kanallar, GPU belleğine göre yerleşim (`selectLlamaServerPlacement`), bağlam küçültme ile yeniden deneme.                       |
| `keep_alive` varsayılanı          | `envconfig/config.go` (`OLLAMA_KEEP_ALIVE`, varsayılan 5 dakika), `OLLAMA_MAX_LOADED_MODELS`                        | Aynı fikir.                                                                                                                                              |
| `server.Handler` (NDJSON)         | `server/routes.go` (`GenerateRoutes`, `streamResponse`: `application/x-ndjson`)                                     | Gerçekte gin, OpenAI/Anthropic uyumlu uç noktalar (`middleware/`), bulut vekili.                                                                         |
| boş istem → `done_reason: "load"` | `server/routes.go` (`GenerateHandler`); `ollama stop` = `keep_alive: 0` ile boş istek (`cmd/cmd.go`, `StopHandler`) | Aynı davranış.                                                                                                                                           |
| `cmd/miniollama`                  | `main.go` → `cmd/cmd.go` (cobra, `NewCLI`)                                                                          | Gerçek CLI her işi sunucuya HTTP ile yaptırır; `ollama launch` ile kodlama ajanlarını bağlar.                                                            |
