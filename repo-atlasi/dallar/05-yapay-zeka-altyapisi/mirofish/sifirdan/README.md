# minifish — MiroFish'in "tohum → ajanlar → simülasyon → rapor" hattını sıfırdan yazmak

MiroFish bir belgeyi (haber, politika taslağı, roman) alıp içindeki aktörlerden LLM destekli sosyal medya
ajanları üretir, onları sanal bir Twitter/Reddit ortamında saatler boyunca etkileştirir ve sonunda bir "tahmin
raporu" yazdırır. Bu mini aynı hattı **yalnızca Python standart kütüphanesiyle**, açıklanabilir kurallar ve
deterministik bir sahte LLM ile kurar. Amaç iki şeyi öğretmek:

1. **Mimari:** varlık/ilişki çıkarımı → persona → izleme grafiği → saat saat tur döngüsü (etkinlik, akış, bellek,
   eylem) → metrikler → araç kullanan rapor ajanı (ReACT).
2. **"Tahmin" kelimesinin sınırı:** tek bir simülasyon koşusu bir kehanet değildir. Mini aynı senaryoyu farklı
   tohumlarla koşturup (ensemble) sonuçların **yayılımını** gösterir ve iki senaryoyu ("olay var / yok") bu yayılıma
   göre karşılaştırır.

## Gereksinimler

- Python 3.11+ (numpy bile gerekmez). İnternet, API anahtarı ya da gerçek LLM gerekmez.

## Çalıştırma

```bash
cd repo-atlasi/dallar/05-yapay-zeka-altyapisi/mirofish/sifirdan
python3 ornek.py
```

Örnek çıktı (kısaltılmış):

```text
  Yalıkent Esnaf Derneği   NGO               tutum=-1.0
  Murat Demir              Person            tutum=-1.0 kafe sahibi
  Kıyı Postası             MediaOutlet       tutum=+0.0
Tur özeti (her 12 saatte bir):
  tur 12 saat 20  etkin=31  ort.tutum=+0.105  destek=%46 karşı=%28
  tur 24 saat 08  etkin= 7  ort.tutum=+0.105  destek=%46 karşı=%28
Ya şöyle olursa? (12 koşu, son ortalama tutum)
  olaysız : +0.138 ± 0.063
  olaylı  : +0.149 ± 0.071
```

Son iki satır dersin özüdür: "belediye ücretsiz servis sözü verdi" olayı ortalamayı **0,011** kaydırıyor, ama
koşudan koşuya oynama (standart sapma) **0,06–0,07**. Yani bu modelde olayın etkisi gürültüden ayırt edilemiyor.
Tek bir koşuya bakan biri "olay kamuoyunu değiştirdi" ya da "değiştirmedi" diye kolayca yanılabilirdi.

Tohum metin (`veri/tohum.txt`) **kurgusaldır**: Yalıkent, Kıyı Postası ve kişiler gerçek değildir.

## Test

`sifirdan` klasörünün içinden (yukarıdaki `cd` ile):

```bash
python3 -m unittest discover -s . -t .
```

19 test, sabit tohumlarla: aynı tohum → bit düzeyinde aynı eylem kaydı, farklı tohum → farklı; gece 00–05 arası
kimse etkin değil; akış kendi ve 6 turdan eski gönderileri göstermez; güçlendirilmiş olay gönderisi akışın en üstüne
çıkar; olumlu olay, olumsuz olaya göre topluluk ortalamasını yükseltir; bozuk JSON döndüren LLM'de kural tabanlı
yedeğe düşülür; ReACT döngüsü araç çağırır ve sınırda durur; raporda "Sınırlılıklar" bölümü vardır.

## Aşamalar

| Aşama | Dosya                    | Ne öğretir                                                                                                |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1     | `minifish/seed.py`       | Cümle bölme, kurum/kişi kalıpları, "<kurum> öğretim üyesi <kişi>" bağlantısı, tutum ipuçları, ontoloji    |
| 2     | `minifish/persona.py`    | Varlıktan ajana: LLM yolu + doğrulama + kural tabanlı yedek; anonim sakinler; homofilili izleme grafiği   |
| 3     | `minifish/simulation.py` | Saat çarpanları, etkin ajan seçimi, akış sıralaması, bellek, sınırlı güven ile tutum güncelleme, eylemler |
| 4     | `minifish/report.py`     | Metrikler, röportaj, bellek araması, `<tool_call>` ayrıştırma, ReACT döngüsü, ensemble, Sınırlılıklar     |
| —     | `minifish/llm.py`        | LLM arayüzü (`complete(messages)`), çitli/`<think>`'li JSON ayıklama, deterministik `KuralliLLM`          |

## Mini'deki parça ↔ gerçek depo

| Mini'deki parça                     | Gerçek depodaki karşılığı (dosya yolu)                                                                                                | Fark                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed.extract` (kural tabanlı)      | `backend/app/services/ontology_generator.py` (LLM ile ontoloji) + `graph_builder.py` (metni Zep Cloud'a yükler; çıkarımı Zep yapar)   | Gerçekte varlık/ilişki çıkarımı bir bulut bilgi grafiği servisinde, LLM ile ve zaman bilgisiyle yapılır.                                             |
| `build_ontology` (yedek tipler)     | `ontology_generator.py`: "tam 10 varlık tipi, son ikisi Person ve Organization"                                                       | Mini yalnızca bulunan tipleri listeler.                                                                                                              |
| `persona.from_llm` + `rule_based`   | `oasis_profile_generator.py` (`_generate_profile_with_llm`, `_try_fix_json`, `_generate_profile_rule_based`)                          | Gerçekte persona; bio, yaş, cinsiyet, MBTI, ülke, meslek, ilgi alanları; Zep aramasıyla zenginleştirilir; OASIS CSV/JSON biçimine yazılır.           |
| `TYPE_DEFAULTS`, `active_hours`     | `simulation_config_generator.py` (`AgentActivityConfig`: activity_level, active_hours, stance, influence_weight)                      | Gerçekte bu değerleri de LLM önerir (toplu olarak).                                                                                                  |
| `hour_multiplier`                   | `simulation_config_generator.py` (`CHINA_TIMEZONE_CONFIG`: gece 0,05 … akşam 1,5)                                                     | Aynı varsayılan ritim. Ancak gerçek betik (`get_active_agents_for_round`) yalnızca zirve ve gece çarpanlarını uygular, diğer saatlerde 1,0 kullanır. |
| etkin ajan seçimi                   | `backend/scripts/run_parallel_simulation.py` (`get_active_agents_for_round`)                                                          | Gerçekte saat başına hedef ajan sayısı aralığı da var.                                                                                               |
| `RulePolicy` / `LLMPolicy`          | OASIS (`camel-oasis`): her etkin ajan için `LLMAction()`; eylem listesi `config.py` (`OASIS_TWITTER_ACTIONS`, `OASIS_REDDIT_ACTIONS`) | Gerçekte her eylem bir LLM çağrısıdır (pahalı); açık bir "tutum" sayısı yoktur, görüş üretilen metnin içindedir.                                     |
| `feed()` ağırlıkları                | `simulation_config_generator.py` (`PlatformConfig`: recency/popularity/relevance ağırlıkları); asıl öneri algoritması OASIS içinde    | Mini'de basit bir puan.                                                                                                                              |
| `_update_opinion` (sınırlı güven)   | Karşılığı yok (doğrulanmadı: OASIS içinde açık bir görüş dinamiği modeli aranmadı)                                                    | Mini'nin kendi varsayımı; ders amaçlı görünür kılınmış bir model.                                                                                    |
| `Event` (herhangi bir turda)        | `event_config.initial_posts` (yalnızca 0. turda `ManualAction` ile); `scheduled_events` alanı tanımlı ama hep boş                     | Mini, README'deki "tanrı bakışı" fikrini turda olay olarak uygular; incelenen kodda tur ortasında olay enjeksiyonu yok.                              |
| `log`, `episodes`                   | `backend/scripts/action_logger.py` (`actions.jsonl`), `zep_graph_memory_updater.py` (eylemleri Zep'e bölüm olarak yazar)              | Gerçekte kayıt OASIS'in SQLite veritabanından okunur.                                                                                                |
| `interview`                         | `run_parallel_simulation.py` (`ManualAction(ActionType.INTERVIEW)`), dosya tabanlı IPC: `simulation_ipc.py`                           | Gerçekte simülasyon bittikten sonra ortam açık bekler; sorular canlı ajanın LLM'ine gider.                                                           |
| `react_section`, `parse_tool_calls` | `report_agent.py` (`_generate_section_react`, `_parse_tool_calls`), araçlar `zep_tools.py`                                            | Gerçekte önce taslak planlanır, bölüm başına araç sınırı ve yansıtma turları vardır; araçlar grafik üzerinde semantik arama yapar.                   |
| `ensemble`                          | Karşılığı yok                                                                                                                         | Gerçek sistem varsayılan olarak tek koşu yapar.                                                                                                      |

## Bu modelin varsayımları (açıkça)

- Tutum tek bir sayıdır (−1 … +1) ve yalnızca "plan"a yöneliktir.
- Görüş değişimi Deffuant–Weisbuch tipi **sınırlı güven** kuralıyla olur: yalnızca farkı eşikten (0,8) küçük
  görüşler, açıklık × etki ağırlığı oranında çeker.
- Eylem olasılıkları elle seçilmiştir (güçlü görüşlü daha çok yazar; hemfikirse beğenir, değilse yorum yapar).
- Anonim sakinlerin tutumları tohumdaki dağılımdan türetilir; gerçek bir nüfus örneği değildir.

Bu varsayımları değiştirip sonuçların nasıl oynadığını görmek, alıştırmaların ana konusudur.
