# Sıfırdan claw-mini — Rust ile ajan harness çekirdeği (yalnızca std)

Bu klasör, [ultraworkers/claw-code](../README.md) deposunun `rust/crates/runtime` + `tools` + `api` üçlüsündeki
çekirdek fikri **dış bağımlılık olmadan** yeniden kurar: mesaj ve tur türleri, `Tool` trait'i ve kayıt defteri, izin
politikası, senaryolu sahte modelle sürülen konuşma döngüsü, serde'siz bir JSON kodlayıcı/çözücü ve oturumun JSONL
olarak saklanması. Kod özgündür; claw-code'dan kopya değildir.

## Gereksinimler

- Rust 1.70+ (burada 1.97 ile denendi), `cargo`
- Linux ya da macOS (`bash` aracı ve süreç grubu öldürme için `bash` ve `kill` komutları)
- Crate bağımlılığı **yok** (`[dependencies]` boş), internet **gerekmez**

## Nasıl çalıştırılır

```bash
cd repo-atlasi/dallar/07-kodlama-ajanlari/claw-code/sifirdan
cargo run --offline --example demo                  # yerleşik senaryo
cargo run --offline --example demo -- senaryo.txt   # kendi satır protokolü dosyan
```

Satır protokolü (sahte modelin "yanıtları"):

```text
# yorum
text: Dosyayı okuyorum.
tool: c1 read_file {"path":"notlar.md"}
---
text: Bitti.
```

`---` yanıtları ayırır; `text:` metin bloğu, `tool: <kimlik> <ad> <json>` araç çağrısı ekler.

## Nasıl test edilir

```bash
cargo test --offline                 # 13 birim + 9 uçtan uca test
cargo clippy --offline --all-targets # uyarı yok
cargo fmt --check
```

Derleme çıktısı `target/` klasörüne yazılır (`.gitignore`'da). Depoyu temiz tutmak için istersen
`CARGO_TARGET_DIR=/tmp/claw-mini-target cargo test --offline` kullan.

## Aşamalar

| Aşama | Modül           | Ne öğretir                                                                                |
| ----- | --------------- | ----------------------------------------------------------------------------------------- |
| 1     | `src/json.rs`   | Özyinelemeli inişli (recursive descent) JSON çözücü, kaçışlar, `😀` vekil çiftleri        |
| 2     | `src/mesaj.rs`  | `Role`, `Block` (Text / ToolUse / ToolResult), `Message`; JSON'a gidiş-dönüş              |
| 3     | `src/izin.rs`   | `PermissionMode` merdiveni, `bash(git:*)` kuralları, deny → ask → allow → kip sırası      |
| 4     | `src/arac.rs`   | `Tool` trait'i, `Registry`, beş yerleşik araç, süreç grubuyla zaman aşımı                 |
| 5     | `src/oturum.rs` | Oturumun JSONL dosyası: başlık satırı + mesaj satırları, ekleme ve atomik tam yazım       |
| 6     | `src/model.rs`  | `ModelClient` trait'i, `ScriptedModel`, satır protokolü                                   |
| 7     | `src/dongu.rs`  | `Runtime::run_turn`: kanca → izin → çalıştırma → sonuç; yineleme sınırı; yerel sıkıştırma |
| —     | `tests/`        | Uçtan uca senaryolar; `examples/demo.rs` hepsini birleştirir                              |

## Önemli fikirler

1. **Trait sınırları test edilebilirliği getirir.** Döngü yalnızca `ModelClient` ve `Tool` trait'lerini tanır; gerçek
   sağlayıcı da sahte model de aynı kapıdan girer. claw-code'da `ConversationRuntime<C, T>`, sınırlar `impl` bloğunda:
   `where C: ApiClient, T: ToolExecutor`.
2. **Kip merdiveni + kurallar.** Her aracın gerektirdiği bir kip vardır (`read_file` → `read-only`, `bash` →
   `danger-full-access`). `Prompt` kipi hiçbir şeyi "sessizce" kapsamaz; `Allow` hiç sormaz. `deny` kuralı her şeyden
   önce gelir; `ask` kuralı kip izin verse bile sorar. Soracak kimse yoksa sonuç reddir.
3. **Her araç kullanımına bir sonuç.** Reddedilen, bilinmeyen ya da hatalı her çağrı modele `is_error: true` sonucu olarak
   döner; model hatayı görüp yolunu değiştirir.
4. **Sıkıştırma modelsiz olabilir.** claw-code `compact.rs` içinde eski mesajları yerel bir özetle değiştirir (model
   çağırmaz). Mini de öyle yapar: istekler, araç adları ve dokunulan dosyalar özetlenir; araç çağrısı/sonucu çifti
   bölünmez.
5. **JSONL, ekleme dostudur.** Her yeni mesaj tek satır; dosya bozulursa hata satır numarasıyla gelir.

## Gerçek depoyla eşleme

| Mini'deki parça                         | Gerçek depodaki karşılığı (dosya yolu)                                                                                                | Fark                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `json::Json`, `parse`                   | `rust/crates/runtime/src/json.rs` (`JsonValue`)                                                                                       | Gerçeği yalnız tam sayı (`Number(i64)`) tutar; çoğu crate ayrıca `serde_json` kullanır. Mini `f64` ve vekil çift çözer                          |
| `mesaj::Message`, `Block`               | `rust/crates/runtime/src/session.rs` (`ConversationMessage`, `ContentBlock`)                                                          | Gerçekte `Thinking` bloğu ve kullanım (usage) alanı var                                                                                         |
| `oturum::Session::save/append/load`     | `rust/crates/runtime/src/session.rs` (JSONL, 256 KiB'da döndürme, alan kırpma, gizleme), `rust/crates/runtime/src/session_control.rs` | Mini döndürme ve gizleme yapmaz. Gerçek oturumlar da çalışma alanında durur: `<cwd>/.claw/sessions/<çalışma alanı özeti>/` (ya da `--data-dir`) |
| `izin::PermissionMode`, `Policy`        | `rust/crates/runtime/src/permissions.rs`, `permission_enforcer.rs`                                                                    | Gerçekte kanca (hook) izin geçersiz kılması, `denied_tools` listesi ve yapılandırma dosyasından kural yükleme var                               |
| `arac::Tool`, `Registry`                | `rust/crates/tools/src/lib.rs` (`mvp_tool_specs`, `GlobalToolRegistry`)                                                               | Gerçeği statik bir tablo (incelenen commit'te 57 tanım) + eklenti ve MCP araçları                                                               |
| `arac::Bash`, `run_with_timeout`        | `rust/crates/runtime/src/bash.rs`, `sandbox.rs`, `bash_validation.rs`                                                                 | Gerçeği tokio ile zaman aşımı, arka plan çalıştırma ve Linux'ta `unshare` ile kum havuzu (namespace) uygular                                    |
| `model::ModelClient`, `ScriptedModel`   | `rust/crates/runtime/src/conversation.rs` (`ApiClient`), `rust/crates/mock-anthropic-service/`                                        | Gerçek testler HTTP üzerinden sahte bir Anthropic `/v1/messages` servisine `PARITY_SCENARIO:` önekiyle senaryo seçtirir                         |
| `dongu::Runtime::run_turn`              | `rust/crates/runtime/src/conversation.rs` (`ConversationRuntime::run_turn`)                                                           | Gerçekte kesme (interrupt) ve yönlendirme (steer) sinyalleri, izleme (tracing), önbellek olayları, sağlık sondası var                           |
| `dongu::PreToolHook`                    | `rust/crates/runtime/src/hooks.rs` (`HookRunner`), `rust/crates/plugins/src/hooks.rs`                                                 | Gerçek kancalar kabuk komutlarıdır (PreToolUse / PostToolUse), girdiyi değiştirebilir ve izin kararı verebilir                                  |
| `dongu::maybe_compact`, `local_summary` | `rust/crates/runtime/src/compact.rs` (`compact_session`, `should_compact`)                                                            | Fikir aynı (modelsiz özet, çifti bölmeme); eşikler ve özet içeriği farklı                                                                       |
| `examples/demo.rs`                      | `rust/crates/rusty-claude-cli/src/main.rs` (`claw` ikilisi, REPL, `prompt` alt komutu)                                                | Gerçek CLI ~21 bin satır: REPL, eğik çizgi komutları, JSON çıktı biçimi, `doctor`                                                               |

## Bilinçli eksikler

- HTTP istemcisi yok: gerçek bir sağlayıcıyla konuşmak için `ModelClient`'ı uygulayan bir istemci (ör. `reqwest` ya da
  std `TcpStream` + TLS kütüphanesi) gerekir; bu, "yalnızca std" kuralını bozacağı için bırakıldı.
- Akış (SSE) yok; yanıt bütün gelir.
- MCP, LSP, eklenti yöneticisi, alt ajanlar ve REPL yok.
- Kum havuzu yok: `bash` komutları gerçekten çalışır. Testler yalnızca geçici klasörlerde çalışır.
- `bash` aracı, ana kabuk bittikten sonra çıktı borularının kapanmasını bekler: arka plana atılmış (`&`) bir alt süreç
  boruyu açık tutarsa araç onun bitmesini bekler; zaman aşımı bu bekleyişi kapsamaz. Gerçek uygulama arka plan
  işlerini ayrı bir seçenekle (`run_in_background`) ele alır.

## Alıştırma önerileri

1. `ScriptedModel` yerine bir `StdinModel` yaz: model yanıtını sen terminalden satır protokolüyle gir (insan model).
2. `Policy`'e `.claw.json` benzeri bir yapılandırma dosyasından kural yükleme ekle (`json.rs` ile çöz).
3. `oturum.rs`'e 256 KiB'da dosya döndürme (`s1.jsonl.1`, `s1.jsonl.2`) ve en fazla 3 eski dosya tutma ekle.
