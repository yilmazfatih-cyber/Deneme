# Mini Hermes — kalıcı hafıza, araç kaydı, beceri yazan öğrenme döngüsü, geçit ve cron

Bu klasör, [hermes-agent dosyasında](../README.md) anlatılan çekirdek mekanizmayı **sıfırdan ve özgün kodla**
kurar. Amaç özellik eşitliği değil, şu soruyu kodla cevaplamak: "Bir ajan bir işi bitirdikten sonra nasıl beceri
yazar ve sonraki oturumda onu nasıl bulup kullanır?"

## Gereksinimler

- Python 3.11+ — yalnızca standart kütüphane (`sqlite3` + FTS5, `ast`, `json`, `threading`, `secrets`).
- FTS5 yoksa (bazı sqlite derlemeleri) arama otomatik olarak LIKE tabanlı yedeğe düşer; testler iki yolu da sınar.
- Gerçek LLM yok: `ScriptedLLM` senaryolu, deterministik sahte modeldir. Ağ bağlantısı yok.

## Çalıştırma

```bash
cd repo-atlasi/dallar/06-ajan-platformlari/hermes-agent/sifirdan
python3 demo.py
```

Beklenen çıktı (kısaltılmış):

```text
=== Oturum 1: iş yapılır, tur sonunda gözden geçirme beceri yazar ===
Cevap: KDV: 200 TL, toplam: 1200 TL.  (model çağrısı: 3, gözden geçirme: True)
Diskteki beceriler: ['kdv-hesaplama']
=== Oturum 2: yeni sistem istemi beceri dizinini içerir; model önce beceriyi okur ===
  - kdv-hesaplama: Bir tutarın KDV'sini ve KDV dahil toplamını hesaplama yöntemi
=== Geçit: bilinmeyen Telegram kullanıcısı → eşleştirme kodu → onay → cevap ===
Bot cevabı: Merhaba! Erişim için sahibin şu komutu çalıştırması gerek: hermes pairing approve telegram 7K…
```

Demo geçici bir `HERMES_HOME` klasörü kullanır ve bitince siler.

## Test

```bash
python3 -m unittest discover -s . -t .     # 43 test, ağsız, ~0,2 sn
```

## Aşamalar

| Dosya                   | Ne öğretir                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asama1_hafiza.py`      | `SessionDB`: dış içerikli FTS5 dizini + tetikleyiciler, BM25 sıralama, cron oturumlarını sona itme, LIKE yedeği; `MemoryStore`: MEMORY.md / USER.md, `§` ayracı, karakter sınırı, enjeksiyon taraması, dondurulmuş anlık görüntü |
| `asama2_araclar.py`     | `ToolRegistry` (`register`, `check_fn`, toolset süzme, OpenAI biçimli tanımlar, hatayı JSON döndüren `dispatch`), `hesapla` (eval'siz AST hesap makinesi), `memory`, `session_search`                                            |
| `asama3_beceriler.py`   | SKILL.md frontmatter, `skills_list` (yalnız ad + açıklama) / `skill_view` (tam metin) / `skill_manage` (create, patch, delete) ve ad, açıklama, yol kaçışı, tarama denetimleri                                                   |
| `asama4_dongu.py`       | `AIAgent`: oturum başında bir kez kurulan sistem istemi, araç turu, yineleme sınırı; öğrenme döngüsü sayaçları ve `run_background_review` (beyaz listeli çatallanmış ajan, isteğe bağlı iş parçacığı)                            |
| `asama5_gecit.py`       | `SessionSource`, `build_session_key`, `PairingStore` (8 karakter, 1 saat, 10 dk hız sınırı, platform başına 3), `InMemoryAdapter`, `GatewayRunner` (yetki → oturum → ajan önbelleği → cevap, `/new`)                             |
| `asama6_zamanlayici.py` | `parse_schedule` (`30m`, `every 2h`, 5 alanlı cron, ISO), `JobStore` (jobs.json), `CronScheduler.tick` (önce ilerlet, sonra koş, dosyaya yaz, platforma teslim), `cronjob` aracı                                                 |
| `demo.py`               | Hepsini bir arada gösteren senaryo                                                                                                                                                                                               |

## Mini ile gerçek depo eşlemesi

| Mini'deki parça                           | Gerçek depodaki karşılığı (dosya yolu)                                                             | Fark                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionDB`, `search`                     | `hermes_state.py`, `hermes_state_fts.py`, `hermes_state_search.py`, `tools/session_search_tool.py` | Gerçekte WAL, trigram dizini, oturum soy ağacı (lineage), keşif/kaydırma/okuma kipleri                                                                                                                                    |
| `MemoryStore`, `tehdit_tara`              | `tools/memory_tool.py`, `tools/memory_tool_store.py`, `tools/threat_patterns.py`                   | Gerçekte dosya kilidi, yedek, onaylı yazma, çok daha kapsamlı kalıp listesi ve kapsamlar                                                                                                                                  |
| `ToolRegistry`, `registry.register`       | `tools/registry.py`, `toolsets.py`, `model_tools.py::handle_function_call`                         | Gerçekte AST ile keşif + önbellek, eklenti kapsamları, eşzamanlı araçlar, sonuç boyutu sınırları                                                                                                                          |
| `SkillStore`, beceri araçları             | `tools/skills_tool.py`, `tools/skill_manager_tool.py`, `tools/skills_guard.py`                     | Gerçekte paketli/isteğe bağlı/hub becerileri, platform kapısı, 60 karakter açıklama sınırı, kurulum taraması                                                                                                              |
| `AIAgent.run_conversation`                | `run_agent.py`, `agent/conversation_loop.py`, `agent/turn_*.py`                                    | Gerçekte akış, yeniden deneme, sağlayıcı geri dönüşü, bağlam sıkıştırma, kesme (interrupt), bütçe                                                                                                                         |
| `iters_since_skill`, `turns_since_memory` | `agent/turn_iteration_prep.py`, `agent/turn_context.py`, `agent/turn_finalizer.py`                 | Aynı fikir; gerçek sayaçlar oturum geçmişinden yeniden hesaplanabilir                                                                                                                                                     |
| `run_background_review`                   | `agent/background_review.py`                                                                       | Gerçekte daemon iş parçacığı, iptal el sıkışması, ana ajanın önbellekli istemini paylaşma; aynı modelde konuşmanın tam anlık görüntüsü (önbellek sıcak), farklı modelde kısa özet gider. Mini her zaman metin özeti verir |
| `build_session_key`, `PairingStore`       | `gateway/session.py`, `gateway/pairing.py`                                                         | Gerçekte profil ad alanı, Slack kapsamı, WhatsApp kimlik eşleme, kilitlenme ve red mesajı kuralları                                                                                                                       |
| `InMemoryAdapter`, `GatewayRunner`        | `gateway/platforms/base.py`, `gateway/run.py`, `plugins/platforms/<ad>/adapter.py`                 | Gerçekte asyncio, akışlı taslak mesajlar, medya, çok profilli tek süreç                                                                                                                                                   |
| `JobStore`, `CronScheduler`, `cronjob`    | `cron/jobs.py`, `cron/scheduler.py`, `tools/cronjob_tools.py`                                      | Gerçek araç adı `cronjob_manage`; dosya kilidi (`~/.hermes/cron/.tick.lock`), saat dilimi, telafi penceresi, betik ve iş zinciri alanları                                                                                 |

## Bilinçli sadeleştirmeler

- Senkron döngü ve tek iş parçacığı (gözden geçirme isteğe bağlı olarak ayrı iş parçacığında).
- YAML yerine `anahtar: değer` satırları okuyan küçük bir frontmatter ayrıştırıcı.
- Ad en çok 64, açıklama en çok 1024 karakter: gerçek `tools/skill_manager_tool.py`'deki `MAX_NAME_LENGTH` ve
  `MAX_DESCRIPTION_LENGTH` ile aynı. Gerçek `skill_manage` ayrıca yeni ya da değişen açıklamayı beceri dizininin
  gösterdiği 60 karakterle sınırlar (`SKILL_PROMPT_DESC_LIMIT`, `agent/skill_utils.py`; kural `skills/AGENTS.md`'de
  de yazar); mini bu ikinci sınırı uygulamaz.
