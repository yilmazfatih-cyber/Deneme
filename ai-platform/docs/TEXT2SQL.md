# Text2SQL: yalnız SQL yazan, sütun uydurmayan motor

Hedef: zor soruları (çok tablolu JOIN, oran, pencere fonksiyonu, "hiç ... olmayan", grup içi en büyük) doğru SQL'e
çevirmek ve **şemada olmayan tek bir sütunun bile** kullanıcıya ulaşmamasını kodla garanti etmek. İki katman vardır:

| Katman | Ne yapar | Nerede |
| --- | --- | --- |
| Çıkarım hattı (kod, bu depoda çalışır ve test edilir) | şema bağlama → üretim → güvenlik denetimi → **sütun bağlama** → çalıştırma → düzeltme turu → aday oylaması | `aiplatform/text2sql/` |
| Ağırlıklar (GPU sunucuda üretilir) | BIRD'den eğitim verisi → LoRA (yeni ağırlıklar) → ağırlık-uzayı birleştirme (görev vektörü + LoRA) → BIRD ölçümü | `scripts/text2sql/`, `python -m aiplatform.text2sql.bird` |

"Weight-space programming" (Takehi, Teoh, Zhang, Khattab — MIT CSAIL, Kasım 2026) bir LLM'in küçük bir modelin
ağırlıklarını doğrudan okuyup yazabildiğini gösterir. 7B'lik bir Text2SQL modelinde aynı etkiyi güvenilir biçimde
veren yol, ağırlık uzayında **aritmetik** yapmaktır: tabandan türemiş uzman bir modelin farkını (görev vektörü)
tabana eklemek ve LoRA ile yeni ağırlıklar öğrenmek. `merge_weights.py` tam olarak bunu yapar; eğitim döngüsü yoktur,
tensörler tek tek güncellenir ve rapor parametrelerin yüzde kaçının değiştiğini söyler.

## 1. Çıkarım hattı

```
soru (+ ipucu)
   │
   ▼
SchemaIndex ── DDL / SQLite / sözlükten tablo, sütun, tip, PK/FK, örnek değer, açıklama
   │
   ▼
link_schema ── soru sözcükleri ↔ ad parçaları (Türkçe/İngilizce kök), bulanık benzerlik,
   │            örnek değer eşleşmesi, FK kapanışı → istem için küçültülmüş şema
   ▼
LLM ── {"sql", "explanation"} (sıcaklık 0; ek adaylar örneklemeli)
   │
   ▼
validate_sql ── tek SELECT, DDL/DML yok, tablo beyaz listesi, LIMIT           (güvenlik)
   │
   ▼
ground ── sqlglot `qualify`: HER sütun bir tabloya bağlanır; takma ad, CTE, alt sorgu, `*`,
   │       HAVING dahil. Bağlanamayan sütun → GroundingError + en yakın gerçek sütunlar    (doğruluk)
   │
   ▼
executor ── salt-okunur çalıştırma (ERP bağlayıcısı / SQLite)
   │
   ├─ hata → modele: "Önceki sorgu reddedildi: Şemada olmayan sütun 'musteri_adi'. Yakın adaylar: cari.unvan…"
   │         (en çok `max_repairs` tur)
   ▼
oylama ── aynı sonuç kümesini veren adaylar birleşir, en kalabalık küme kazanır; eşitlikte açgözlü aday
```

Her tur `attempts` listesine yazılır (hangi SQL, neden reddedildi, hangi hata türü), API yanıtında ve denetim
günlüğünde görünür. Şema bağlama yalnız **istemi** küçültür; doğrulama her zaman **tam** şemaya karşı yapılır.

### API

`POST /api/modules/dogal-dil-sql/run/ask`

```json
{
  "question": "geçen yıl hiç fatura kesilmemiş D riskli cariler",
  "connection_id": "erp-ana",
  "evidence": "geçen yıl = tarih '2025' ile başlar",
  "candidates": 4,
  "max_repairs": 2,
  "dry_run": false
}
```

Yanıt: `sql`, `explanation`, `tables`, `used_columns` (`"cari.unvan"` biçiminde), `attempts`, `selected_by`
(`greedy` | `vote` | `only_valid`), çalıştırıldıysa `columns`, `rows`, `row_count`, `truncated`.

`allowed_tables` listesinde olmayan tablolar modele **hiç gösterilmez**; `tables_from_ddl` yerine bağlantının
beyaz listesi esastır.

### Modül dışı kullanım

```python
from aiplatform.text2sql import SchemaIndex, Text2SQL

index = SchemaIndex.from_sqlite("satis.sqlite")          # veya .from_ddl(ddl_metni), .from_mapping({...})
engine = Text2SQL(generate, executor=run_sql, dialect="sqlite", candidates=4)
res = await engine.run("en çok iade alan 5 ürün", index, evidence="iade = durum 'iade'")
res.sql, res.tables, res.columns, res.attempts
```

`generate(messages, temperature)` OpenAI uyumlu herhangi bir uç noktayı sarabilir; `aiplatform/text2sql/bird.py`
içindeki `OpenAICompatible` hazır bir örnektir.

## 2. BIRD ölçümü

```bash
# model: vLLM / llama-server / Ollama / platform geçidi — hepsi /v1
python -m aiplatform.text2sql.bird --dev bird/dev/dev.json --db-root bird/dev/dev_databases \
    --base-url http://127.0.0.1:8001/v1 --model qwen2.5-coder-7b --candidates 4 --max-repairs 2 --lang en --out out/bird
```

`out/bird/report.json`: toplam ve zorluk başına yürütme doğruluğu (EX), hiç geçerli SQL üretilemeyen soru sayısı,
düzeltme turlarını tetikleyen hata türleri (`grounding` / `security` / `execution`), aday seçimi dağılımı.
`out/bird/predict_dev.json` resmi değerlendiricinin biçimindedir (`SQL\t----- bird -----\tdb_id`).

Beklenti (BIRD dev, yürütme doğruluğu; sayılar bağımsız kaynaklardan derlenmiştir, kendi koşunuzla doğrulayın):

| Yapı | EX (yaklaşık) |
| --- | --- |
| Qwen2.5-Coder-7B-Instruct, tek aday, denetimsiz | %50-55 |
| + sütun bağlama + düzeltme turu (bu hat) | +2-4 puan; şemaya bağlanmayan sorgu %0 |
| + 4-8 aday, sonuç oylaması | +3-6 puan |
| Arctic-Text2SQL-R1-7B (yalnız SQL için RL ile eğitilmiş, Qwen2.5-Coder-7B tabanlı) | ~%68 |
| Görev vektörü (Arctic − Qwen) · λ + BIRD LoRA, bu hatla | %65-72 hedef |

Yani "yüksek BIRD" için gerçekçi yol: Arctic'in SQL uzmanlığını ağırlık uzayında tabana taşımak, BIRD eğitim
kümesiyle (onarım örnekleri dahil) LoRA ile pekiştirmek ve çıkarımda bu hattı kullanmak. Tek başına istem
mühendisliği %60'ı aşamaz; tek başına ağırlık da sütun uydurmayı sıfırlayamaz — ikisi birlikte gerekir.

## 3. Ağırlıklar: güncelleme ve ekleme

Hepsi GPU sunucuda; `pip install -e ".[text2sql-train]"`.

### 3.1 Veri — `scripts/text2sql/prepare_bird_sft.py`

```bash
python scripts/text2sql/prepare_bird_sft.py --train bird/train/train.json --db-root bird/train/train_databases \
    --out data/bird_sft.jsonl --lang en --repair-ratio 0.3
```

- İstem, çıkarımdaki `Text2SQL.messages_for` ile **aynı** kurulur (sistem istemi, şema bağlama, DDL, İPUCU/SORU).
- Altın SQL önce şemaya bağlanır sonra çalıştırılır; bağlanmayan veya çalışmayan altınlar atılır (BIRD train'de
  bozuk örnekler vardır; rapor sayar).
- Onarım örnekleri: altın sorgunun bir sütunu kasıtlı bozulur; "model yanlış yazdı → gerçek hata metniyle düzeltme
  istendi → doğru yazdı" biçiminde 5 mesajlık diyalog eklenir. Model, uydurduğunda nasıl geri döneceğini öğrenir.
- Spider için `--spider` (ipucu yok). Türkçe ERP verisi için `--lang tr` ve kendi jsonl'inizi aynı biçimde ekleyin.

### 3.2 Yeni ağırlıklar — `scripts/text2sql/train_lora.py`

```bash
python scripts/text2sql/train_lora.py --data data/bird_sft.jsonl --out out/lora-text2sql        # 24 GB GPU: QLoRA
python scripts/text2sql/train_lora.py --data data/bird_sft.jsonl --out out/lora-text2sql --no-qlora --batch 4   # 80 GB
```

Taban `Qwen/Qwen2.5-Coder-7B-Instruct` (Apache-2.0, katalogda `qwen2.5-coder-7b`). r=64, α=128, tüm projeksiyonlar,
lr 1e-4, 2 epok, uzunluk 4096. `--dry-run` veriyi doğrular ve ayarları yazar, eğitmez. Çıktı: `adapter_model.safetensors`.

### 3.3 Ağırlık uzayı — `scripts/text2sql/merge_weights.py`

```bash
python scripts/text2sql/merge_weights.py \
    --base Qwen/Qwen2.5-Coder-7B-Instruct \
    --donor Snowflake/Arctic-Text2SQL-R1-7B --lam 0.7 --density 0.3 \
    --lora out/lora-text2sql \
    --out out/koprusql-7b
```

| İşlem | Formül | Ne işe yarar |
| --- | --- | --- |
| Görev vektörü | `W ← W + λ·(W_donör − W_taban)` | Donörün (Arctic) SQL uzmanlığını tabana taşır; λ doz |
| TIES budaması | `|Δ|` en büyük `density` oranı kalır | Küçük, gürültülü farklar taşınmaz; başka yeteneği bozmaz |
| LoRA ekleme | `W ← W + (α/r)·B·A` | 3.2'de öğrenilen yeni ağırlıklar kalıcı olarak eklenir |

Tensör tensör çalışır (7B için birkaç GB RAM yeter), boyutu uyuşmayan tensörleri atlar ve raporlar (`merge_report.json`:
kaç tensör değişti, parametrelerin yüzde kaçı değişti). `--only mlp` gibi filtrelerle yalnız belirli katmanlar
güncellenebilir. torch varsa bf16; yoksa numpy ile fp16/fp32.

Önerilen tarama: λ ∈ {0.5, 0.7, 1.0} × density ∈ {0.2, 0.3, 1.0}; her biri için BIRD dev'in 300 sorusuyla hızlı
ölçüm (`--limit 300`), en iyisini tam dev ile doğrula.

### 3.4 Servis ve kataloğa ekleme

```bash
python llama.cpp/convert_hf_to_gguf.py out/koprusql-7b --outtype q8_0 --outfile out/koprusql-7b-q8_0.gguf
# veya vLLM: vllm serve out/koprusql-7b --served-model-name koprusql-7b --port 8001
```

GGUF dosyası `models/koprusql-7b/<artifact>/` altına konur ve `catalog/models.yaml`'a `qwen2.5-coder-7b` kaydı örnek
alınarak eklenir (`capabilities: [sql, json]`, lisans Apache-2.0 — taban ve donör ikisi de Apache-2.0). `dogal-dil-sql`
modülünün `llm` bileşeni bu kimliğe çevrilir.

## 4. Sınırlar

- 7B ağırlıklar ve LoRA eğitimi GPU ister; bu depoda yalnızca 1.5B ölçekte gerçek birleştirme ve CPU ölçümü
  yapıldı (bkz. §5). BIRD **train** kümesi olmadan LoRA eğitilmemeli: dev veritabanlarıyla eğitmek ölçümü kirletir.
- Sütun bağlama sqlglot'un ayrıştırabildiği lehçelerde çalışır (sqlite, postgres, mysql, tsql, oracle). Ayrıştırılamayan
  SQL de reddedilir, yani güvenli tarafta kalır.
- Oylama sonuç kümesine bakar; iki yanlış aday aynı sonucu veriyorsa yanlış kazanabilir. Aday sayısı 4-8 arası
  makul; daha fazlası maliyeti artırır, doğruluğu az artırır.
- Türkçe soru + İngilizce şema (ERP'de yaygın) için `--lang tr` istemi kullanılır; model Qwen2.5-Coder iki dili de
  bilir, ama Türkçe soru sözcüğü ile İngilizce sütun adı eşleşmesi `link_schema` için zayıftır — açıklama sütunları
  (`description`) doldurulursa bağlama güçlenir.

## 5. Gerçek koşu: 1.5B, CPU (2026-11)

Hattın ve birleştirme betiğinin uçtan uca çalıştığını görmek için 7B yerine aynı ailenin 1.5B üyeleriyle ölçüldü
(GPU yok; CPU'da bf16, soru başına ~1 dk).

- **Taban:** `Qwen/Qwen2.5-Coder-1.5B-Instruct`
- **Donör:** `Chinastark/DatA-SQL-1.5B` (aynı tabandan SQL için eğitilmiş)
- **Birleşimler** (`merge_weights.py`, ~25 sn): `λ=1.5` görev vektörü ve `λ=1, density=0.3` TIES.
  Donör tabandan yalnızca dikkat katmanlarında ayrışıyor: 338 tensörün 112'si değişmiş, TIES sonrası parametrelerin
  %3,1'i güncellendi.
- **Veri:** BIRD mini-dev (SQLite) içindeki zor olmayan 40 soru (8 kolay, 32 orta). Bu sürümün %92'si "challenging";
  zor 42 soruda donör bile %4,8'de kaldı, ağırlık farkını göremeyiz.
- **Ayarlar:** `--style cot`, tek aday, `max_repairs=2`, en çok 640 yeni token.

| Ağırlık | İlk tur EX | Hat sonrası EX | Kolay / Orta | İlk turda uydurma sütun/tablo | Dönen SQL | Dönen SQL'de uydurma |
| --- | --- | --- | --- | --- | --- | --- |
| Taban | %5,0 | %5,0 | %25 / %0 | 21/40 | 22 | **0** |
| Donör (DatA-SQL) | %5,0 | **%10,0** | %25 / %6,25 | 12/40 | 29 | **0** |
| Görev vektörü λ=1.5 | %2,5 | %2,5 | %12,5 / %0 | **8/40** | 28 | **0** |
| TIES λ=1, d=0.3 | **%7,5** | **%10,0** | %25 / %6,25 | 15/40 | 26 | **0** |

Bulgular:

1. **Sütun uydurma hattın çıktısında sıfır.** Dönen 105 SQL'in tamamı sonradan yeniden bağlandı; uydurma sütun ya da
   tablo yok. Model ilk denemede 8-21 kez uyduruyor. Hat bunları ya düzeltme turuyla onarıyor ya da yanıt vermiyor
   (`no_valid_sql`). "Yanlış ama uydurmasız" ile "yanıt yok" arasındaki seçim bilinçli olarak ikincisinden yana.
2. **TIES, taban ile donör arasında en iyi ilk tur sonucunu verdi.** Hat sonrası donörle eşit (%10). Ölçek
   küçük (40 soru, ±1 soru = 2,5 puan): bu bir eğilimdir, kanıt değildir.
3. **λ>1 uydurmayı azaltıp doğruluğu düşürdü.** En az uyduran (8/40) ama en düşük EX. Görev vektörünü abartmak
   şema sadakatini artırıyor, akıl yürütmeyi bozuyor. Taramada λ ≤ 1 tutun.
4. **İstem biçimi ağırlık kadar önemli.** DatA-SQL JSON istemini yok sayıp Python yazdı. Bu yüzden `--style cot`
   (düşün, sonra ```sql bloğu) eklendi. Modeli değiştirirken eğitildiği istem biçimini kullanın.
5. **Düzeltme turu bozmadı, düzeltti.** `fixed_by_pipeline` 0-2, `broken_by_pipeline` her yapılandırmada 0.
   Hata iletileri modelin diline göre (`lang`) çevrilir, birden çok sorun tek iletide toplanır, eksik tablo için
   FK üzerinden JOIN önerilir.

1.5B mutlak sayıları 7B beklentisini (§2) temsil etmez. Aynı komutlar 7B taban/donörle (`Qwen2.5-Coder-7B-Instruct`
+ `Arctic-Text2SQL-R1-7B`) GPU'da tekrarlanmalı. Koşu sürücüsü: `python -m aiplatform.text2sql.bird --hf-model
<dizin> --style cot --max-repairs 2 --offset/--stride` ile parça parça, sonra `summary.json`.
