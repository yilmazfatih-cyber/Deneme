# Model seçimi: yerel, ~1B parametreli text-to-SQL

Tarih: 2026-11-05 · Hazırlayan: araştırmacı

Hedef: Tek tüketici GPU'sunda (4–8 GB VRAM, 12 GB bonus) çalışan, ağırlıkları ideal olarak ≤ 2 GB olan,
Türkçe veya İngilizce soruyu SQLite (ayrıca PostgreSQL/MySQL) sorgusuna çeviren açık bir model.

**Yöntem ve sınırlar.** Bu araştırma yalnızca web araması ve GitHub sayfaları üzerinden yapıldı.
Bu oturumdan `huggingface.co`, `ollama.com`, `registry.ollama.ai` ve `arxiv.org` sayfaları açılamadı
(DNS/ağ izni yok). Bu sitelerdeki bilgiler arama motoru özetlerinden ve aynalardan alındı. Doğrudan
okuyamadığım her bilgi "doğrulanamadı" ya da "(özet)" olarak işaretlendi. Parametre sayıları ve
benchmark skorları **üreticinin bildirdiği** değerlerdir; bağımsız olarak ölçülmedi.

---

## 1. Özet ve öneri

### Varsayılan: Qwen2.5-Coder-1.5B-Instruct

| Alan         | Değer                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| Ollama       | `ollama run qwen2.5-coder:1.5b` (resmî kütüphane etiketi; sayfa açılamadı, bkz. [6][7])    |
| Hugging Face | `Qwen/Qwen2.5-Coder-1.5B-Instruct` (ağırlık), `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF`      |
| GGUF dosyası | `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` (resmî ad [8]); ≈ 986 MB (topluluk aynaları [8]) |
| Lisans       | Apache 2.0 [9]                                                                             |
| Parametre    | ≈ 1,54 B (üretici) [7]                                                                     |
| Bağlam       | 32 768 token yapılandırma; YaRN ile 128K [7]                                               |

Gerekçe:

- **Kurulum en kolay:** Resmî GGUF, resmî Ollama etiketi, bartowski/QuantFactory aynaları var [8].
  Dönüştürme gerekmez. 4 GB GPU'da bile rahat sığar.
- **Türkçe soru:** Genel amaçlı, çok dilli eğitimli bir kod modeli. SQL'e özel ince ayarlı modeller
  çoğunlukla yalnızca İngilizce veriyle eğitildi (aşağıya bakın). Türkçe için ayrıca ölçülmüş bir
  skor bulamadım — **doğrulanamadı**.
- **Lisans:** Apache 2.0. Dikkat: aynı ailenin **3B** sürümü Apache değil, "Qwen Research" lisanslı [9].
- **Dürüst zayıf yan:** Ham haliyle SQL doğruluğu orta. BIRD dev'de ≈ %28,6 (SLM-SQL makalesindeki
  taban satırı, özet) [2][3]; Spider dev'de ≈ %55,8 yürütme doğruluğu (bağımsız ölçüm) [12].
  Basit, tek tablolu sorularda yeterli; çok tablolu karmaşık sorularda zayıf. İyi şema istemi
  (CREATE TABLE + örnek satır) belirleyici olur.

### Alternatif (SQL kalitesi öncelikliyse): SLM-SQL-1.5B

| Alan          | Değer                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Hugging Face  | `cycloneboy/SLM-SQL-1.5B` (SFT + GRPO), SFT'li sürüm `cycloneboy/SLM-SQL-Base-1.5B` [1]                  |
| GGUF          | Yalnız topluluk: `frizynn/SLM-SQL-1.5B-GGUF`, yalnız Q4_K_M bildirilmiş [4]; dosya adı **doğrulanamadı** |
| Ollama        | Resmî etiket yok. `ollama run hf.co/frizynn/SLM-SQL-1.5B-GGUF:Q4_K_M` biçimi [5]                         |
| Taban model   | Qwen2.5-Coder-1.5B-Instruct [1]                                                                          |
| Eğitim verisi | SynSQL-2.5M'den türetilmiş veri (OmniSQL verisi, İngilizce) [2][3]                                       |
| Lisans        | apache-2.0 (yalnız PR sürümündeki kartta görüldü) [10]; 0.6B/1.3B sürümleri cc-by-nc-4.0 [10]            |
| Skor          | BIRD dev %67,08, BIRD test %70,49 (üretici) [1][2]                                                       |

Gerekçe ve uyarılar:

- **SQL doğruluğu belirgin yüksek.** Aynı taban modele göre BIRD dev'de ≈ 2 kat [1][2].
- **Ama bu skor tek geçişte alınmıyor.** Makale, 16 SQL örneği + 8 "birleştirme/düzeltme" örneğiyle
  çalışan _corrective self-consistency_ çıkarımı kullanıyor; bu adımın ≈ 5 puan kattığı bildiriliyor
  (özet) [3]. Basit tek çağrılı bir CLI'de beklenen skor daha düşük olur — tek geçiş skoru **doğrulanamadı**.
- **Türkçe riski:** İnce ayar verisi İngilizce. Taban modelin Türkçe anlama yeteneği kısmen korunur
  ama ölçülmedi — **doğrulanamadı**.
- **Bakım riski:** GGUF tek, tanınmayan bir yükleyiciden. Çıkarım kodu depoda "yayınlanmadı"
  olarak işaretli [1]. İstem şablonu kartta tanımlı; ona uyulmazsa kalite düşebilir.

### Karar önerisi

1. Varsayılan `qwen2.5-coder:1.5b` ile başlanır (sıfır sürtünme, Türkçe için daha güvenli).
2. Kendi küçük test setimizle (≈ 30 soru, yarısı Türkçe, SQLite örnek veritabanı) SLM-SQL-1.5B
   ile karşılaştırılır. SLM-SQL Türkçe sorularda da açık fark verirse varsayılan yapılır.
3. 8 GB GPU'su olan ve 2 GB disk sınırını önemsemeyen kullanıcı için 7B SQL modelleri
   (Arctic-Text2SQL-R1-7B, OmniSQL-7B) "büyük seçenek" olarak belgelenir (bkz. bölüm 3).

---

## 2. Aday tablosu

Kısaltmalar: EX = yürütme doğruluğu. "üretici" = üreticinin bildirdiği. VRAM sütunları yalnız ağırlık
boyutudur (yaklaşık; parametre × bayt hesabı veya bildirilen dosya boyutu). Çalışırken ek olarak KV
önbelleği ve çalışma alanı için ≈ 0,3–1 GB eklenmelidir (bağlam uzunluğuna bağlı, hesap tahmini).

### 2a. 0,5B–2B aralığı (asıl hedef)

| Model (HF repo)                                                                      | Param. (üretici)                 | Taban                             | Lisans                                                   | SQL skoru (üretici)                               | GGUF                                                   | Ollama                                           | Bağlam               | Q4_K_M / Q8_0 / fp16          |
| ------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ | -------------------- | ----------------------------- |
| `Qwen/Qwen2.5-Coder-1.5B-Instruct`                                                   | 1,54 B [7]                       | —                                 | Apache 2.0 [9]                                           | BIRD dev ≈ 28,6 [2][3]; Spider dev 55,8 [12]      | Resmî + bartowski, QuantFactory [8]                    | `qwen2.5-coder:1.5b` [6]                         | 32K [7]              | ≈ 1,0 / 1,6 / 3,1 GB          |
| `Qwen/Qwen2.5-Coder-0.5B-Instruct`                                                   | 0,5 B                            | —                                 | Apache 2.0 [9]                                           | BIRD dev ≈ 14,3 (özet) [3]                        | Resmî (doğrulanamadı)                                  | `qwen2.5-coder:0.5b` [6]                         | 32K                  | ≈ 0,4 / 0,5 / 1,0 GB          |
| `cycloneboy/SLM-SQL-1.5B`                                                            | 1,5 B                            | Qwen2.5-Coder-1.5B-Instruct       | apache-2.0 (PR kartı) [10]                               | BIRD dev 67,08; test 70,49 [1][2]                 | `frizynn/SLM-SQL-1.5B-GGUF` (Q4_K_M) [4]               | `hf.co/...` ile [5]                              | 32K (taban)          | ≈ 1,0 / 1,6 / 3,1 GB          |
| `cycloneboy/SLM-SQL-0.5B`                                                            | 0,5 B                            | Qwen2.5-Coder-0.5B-Instruct       | doğrulanamadı (kartlar çelişkili) [10]                   | BIRD dev 56,87; test 61,82 [1]                    | Bulunamadı                                             | Yok                                              | 32K (taban)          | ≈ 0,4 / 0,5 / 1,0 GB          |
| `cycloneboy/SLM-SQL-0.6B`                                                            | 0,6 B                            | Qwen3-0.6B                        | cc-by-nc-4.0 [10]                                        | BIRD dev 59,52 [3]                                | Yalnız Base-0.6B: `frizynn/SLM-SQL-Base-0.6B-GGUF` [4] | Yok                                              | 32K (taban)          | ≈ 0,5 / 0,7 / 1,3 GB          |
| `premai-io/prem-1B-SQL`                                                              | ≈ 1,3 B [11]                     | deepseek-coder-1.3b-instruct [11] | MIT (kartta; meta veride apache-2.0 da geçiyor) [11][13] | BIRD dev 46, BIRD özel test 51,54; Spider 85 [13] | TensorBlock, QuantFactory, mav23 [13]                  | Topluluk: `anindya/prem1b-sql-ollama-fp116` [14] | doğrulanamadı        | ≈ 0,8 / 1,33 / 2,7 GB [13]    |
| `Qwen/Qwen3-1.7B`                                                                    | 1,7 B                            | —                                 | Apache 2.0 [15]                                          | Resmî SQL skoru bulunamadı                        | Resmî / topluluk (doğrulanamadı)                       | `qwen3:1.7b` (doğrulanamadı)                     | 32K [15]             | ≈ 1,1 / 1,8 / 4,0 GB          |
| `Qwen/Qwen3-0.6B`                                                                    | 0,6 B                            | —                                 | Apache 2.0 [15]                                          | Resmî SQL skoru bulunamadı                        | doğrulanamadı                                          | `qwen3:0.6b` (doğrulanamadı)                     | 32K [15]             | ≈ 0,5 / 0,7 / 1,3 GB          |
| `Qwen/Qwen3.5-2B` (Mart 2026)                                                        | 2 B (bazı listelerde 2,3 B) [17] | —                                 | Apache 2.0 [17]                                          | Resmî SQL skoru bulunamadı                        | unsloth (özet) [17]                                    | `qwen3.5:2b` [16]; indirme ≈ 2,7 GB [16]         | 262K [17]            | ≈ 1,4 / 2,4 / 4,6 GB (tahmin) |
| `Qwen/Qwen3.5-0.8B`                                                                  | 0,8 B                            | —                                 | Apache 2.0 [17]                                          | Resmî SQL skoru bulunamadı                        | doğrulanamadı                                          | `qwen3.5:0.8b` [16]; ≈ 1,0 GB [16]               | 262K (doğrulanamadı) | ≈ 0,6 / 0,9 / 1,7 GB (tahmin) |
| `NumbersStation/nsql-350M`, `nsql-2B`                                                | 0,35 B / 2 B                     | CodeGen (doğrulanamadı)           | doğrulanamadı (kod Apache 2.0) [18]                      | Eski (2023) Spider skoru; doğrulanamadı           | Bulunamadı                                             | Yok                                              | 2K (doğrulanamadı)   | —                             |
| `gaussalgo/T5-LM-Large-text2sql-spider`                                              | ≈ 0,8 B                          | google/t5-large-lm-adapt          | Apache 2.0 (ayna) [19]                                   | Spider dev 49,2 [19]                              | Yok (T5, llama.cpp desteği sınırlı)                    | Yok                                              | 512 (doğrulanamadı)  | —                             |
| `juierror/flan-t5-text2sql-with-schema-v2`, `cssupport/t5-small-awesome-text-to-sql` | ≈ 0,25 B / 0,06 B                | Flan-T5 / T5-small                | doğrulanamadı                                            | doğrulanamadı                                     | Yok                                                    | Yok                                              | —                    | —                             |

Notlar:

- **Qwen3 / Qwen3.5 küçük modelleri:** Qwen3 119 dil [15], Qwen3.5 201 dil [17] bildiriyor; Türkçe
  için en güçlü taban adayları bunlar. Ama SQL için yayımlanmış bağımsız skor bulamadım. Qwen3.5
  küçük modelleri çok kipli (görsel+metin) olduğu için Ollama indirmesi metin modeline göre büyük.
  "Düşünme" kipi kapatılmazsa yanıt uzar; CLI'de kapatılmalı.
- **Qwen3-Coder:** En küçük sürüm 30B-A3B (MoE); 1B sınıfında Qwen3-Coder yok [20].
- **T5 tabanlı modeller:** Yalnız İngilizce, kısa bağlam, GGUF/Ollama yolu yok. Elendi.
- **NSQL:** 2023'ten kalma; GGUF yok. Elendi.
- **2025–2026'daki diğer küçük ince ayarlar:** Hugging Face'te çok sayıda tek kişilik LoRA
  denemesi var (ör. `Anurich/slmsql-qwen2.5-coder-1.5b` BIRD dev 36,9; `Abdullahkousa2/sqlforge-qwen2.5-coder-1.5b`
  Spider 65,6; `thanhdath/FINER-SQL-0.5B-Spider` Spider dev 75,0) [21][22]. Hiçbirinin GGUF'u ve
  bakımı güvenilir değil. 2026'da 1–2B aralığında yeni, güçlü, GGUF'lu bir SQL modeli **bulamadım**.
  2026 makaleleri (ReViSQL [23], LitE-SQL [24]) ya çok büyük model ya da çok parçalı boru hattı kullanıyor.

### 2b. Daha büyük SQL modelleri (bilgi için; 2 GB sınırını aşar)

| Model                                       | En küçük boy (üretici) | Lisans                                                               | BIRD dev (üretici)    | Q4_K_M ağırlık | Not                                   |
| ------------------------------------------- | ---------------------- | -------------------------------------------------------------------- | --------------------- | -------------- | ------------------------------------- |
| `XGenerationLab/XiYanSQL-QwenCoder-3B-2502` | 3B [25]                | apache-2.0 (kartta) [26]; taban Qwen2.5-Coder-3B "Qwen Research" [9] | 54,11 (M-Schema) [25] | ≈ 2 GB         | Lisans çelişkili; GGUF bulunamadı     |
| `seeklhy/OmniSQL-7B`                        | 7B (sayfada 8B) [27]   | doğrulanamadı (14B için Apache 2.0) [27]                             | doğrulanamadı         | ≈ 4,7 GB       | Topluluk GGUF var gibi (özet) [28]    |
| `Snowflake/Arctic-Text2SQL-R1-7B`           | 7B (7,6 B) [29]        | Apache 2.0 [29]                                                      | 68,9 (test 68,5) [29] | ≈ 4,7 GB       | 8 GB GPU'da en güçlü seçenek          |
| `defog/sqlcoder-7b-2`                       | 7B [30]                | CC BY-SA 4.0 (ağırlık) [30]                                          | doğrulanamadı         | ≈ 4,1 GB       | CodeLlama tabanlı, eski               |
| `motherduckdb/DuckDB-NSQL-7B-v0.1`          | 7B [31]                | llama2 [31]                                                          | — (DuckDB SQL'i)      | ≈ 4,1 GB       | Resmî GGUF var; yalnız DuckDB lehçesi |

### 2c. Genel amaçlı küçük yedekler (kısa)

| Model        | Türkçe                                    | Lisans                      | Yorum              |
| ------------ | ----------------------------------------- | --------------------------- | ------------------ |
| Gemma 3 1B   | 1B sürümü yalnız İngilizce görünüyor [32] | Gemma kullanım şartları     | SQL için önerilmez |
| Llama 3.2 1B | Resmî 8 dil arasında Türkçe yok [33]      | Llama 3.2 Community License | SQL için önerilmez |
| SmolLM3 (3B) | Desteklenen dil listesi doğrulanamadı     | doğrulanamadı               | 1B sınıfında değil |

---

## 3. Donanım tablosu

Varsayım: Ollama veya llama.cpp, tüm katmanlar GPU'da, bağlam 4–8K token (şema + soru için yeterli).
Değerler tahmindir; `ollama ps` ile gerçek kullanım kontrol edilmelidir.

| VRAM          | Önerilen model + nicemleme                                       | Ağırlık        | Not                                                    |
| ------------- | ---------------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| CPU (GPU yok) | `qwen2.5-coder:1.5b` Q4_K_M (veya 0.5b)                          | ≈ 1 GB         | 8 GB RAM yeter; yanıt birkaç saniye                    |
| 4 GB          | `qwen2.5-coder:1.5b` Q4_K_M veya Q8_0; ya da SLM-SQL-1.5B Q4_K_M | 1–1,6 GB       | fp16 (3,1 GB) sınırda, önerilmez                       |
| 6 GB          | Aynı modeller Q8_0 / fp16; Qwen3-1.7B Q8_0 denenebilir           | 1,6–3,1 GB     | Uzun şema için bağlam 16K'ya çıkarılabilir             |
| 8 GB          | 1,5B fp16 **veya** `Snowflake/Arctic-Text2SQL-R1-7B` Q4_K_M      | 3,1 / ≈ 4,7 GB | 7B, 2 GB disk hedefini aşar ama en yüksek SQL kalitesi |
| 12 GB ve üstü | Arctic-Text2SQL-R1-7B Q8_0 (≈ 8 GB) veya OmniSQL-7B Q8_0         | ≈ 8 GB         | Büyük şemalarda 32K bağlam rahat                       |

KV önbelleği tahmini (Qwen2.5-1.5B: 28 katman, 2 KV başı, 128 boyut, fp16): token başına ≈ 28 KB;
8K bağlamda ≈ 0,23 GB, 32K bağlamda ≈ 0,9 GB. Bu, model kartındaki mimari değerlere dayanan bir
hesaptır [7]; ölçülmedi.

---

## 4. GitHub depoları

| Depo                                | Ne yapar                                                           | Yerel / Ollama                                                      | Lisans                                              | Etkinlik                                          | Hobi için                                        |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `vanna-ai/vanna`                    | RAG ile soru → SQL, web arayüzü                                    | Evet, Ollama listede [34]                                           | MIT [34]                                            | **29 Mart 2026'da arşivlendi** (salt okunur) [34] | Önerilmez: bakım bitti                           |
| `premAI-io/premsql`                 | Küçük modellerle yerel text-to-SQL boru hattı, değerlendirme, ajan | Evet, Ollama bağlayıcısı [35]                                       | MIT [35]                                            | Son haber Kasım 2024; sürüm yok [35]              | Fikir için iyi; bağımlılık olarak ağır ve durgun |
| `Canner/WrenAI`                     | Anlamsal katman + GenBI ajanları                                   | Sayfada Ollama geçmiyor; eski sürümde 0.6.0 ile eklenmişti [36][37] | Çekirdek Apache 2.0; bazı parçalar AGPL/ticari [36] | Etkin (2026'da yeniden yapılandı) [36]            | Fazla: kurumsal ölçek                            |
| `Dataherald/dataherald`             | Kurumsal NL-to-SQL API'si                                          | Belirtilmemiş [38]                                                  | Apache 2.0 [38]                                     | Son itme Temmuz 2024 (özet) [39]                  | Önerilmez: durgun                                |
| `sqlchat/sqlchat`                   | Sohbet arayüzlü SQL istemcisi                                      | Evet, OpenAI uyumlu uç nokta olarak Ollama [40]                     | MIT [40]                                            | Son commit tarihi doğrulanamadı                   | Arayüz için hoş; bizim CLI ihtiyacına fazla      |
| `defog-ai/sqlcoder`                 | sqlcoder modellerinin deposu ve değerlendirmesi                    | Model deposu, araç değil                                            | Kod Apache 2.0, ağırlık CC BY-SA 4.0 [30]           | Tarih doğrulanamadı                               | Model için; en küçük 7B                          |
| `CycloneBoy/slm_sql`                | SLM-SQL modelleri ve makale kodu                                   | Model deposu                                                        | Apache 2.0 (depo) [1]                               | Çıkarım kodu henüz yayınlanmadı [1]               | İstem şablonu için başvuru                       |
| `XGenerationLab/XiYanSQL-QwenCoder` | XiYan modelleri, M-Schema biçimi                                   | Model deposu                                                        | doğrulanamadı                                       | 2025 sürümleri [25]                               | M-Schema fikri yararlı                           |

**Öneri:** Hazır bir çerçeveye bağlanmaya gerek yok. Kendi ince CLI'miz yeterli: şemayı
`CREATE TABLE` + birkaç örnek satır olarak isteme koymak, Ollama'nın yerel HTTP API'sine tek çağrı,
dönen SQL'i salt okunur bağlantıda çalıştırmak, hata olursa hatayı modele bir kez geri vermek.
İsteğe bağlı eşlikçi olarak yalnız **premAI-io/premsql** okunmaya değer (istem ve değerlendirme
fikirleri için); bağımlılık olarak eklenmesi önerilmez.

---

## 5. Kaynaklar

Not: `huggingface.co`, `ollama.com` ve `arxiv.org` sayfaları bu oturumdan açılamadı; aşağıdaki bu
alan adlarına ait bağlantılar arama sonuçlarından alınmıştır ve içerikleri arama özetine dayanır.
GitHub sayfaları doğrudan okundu.

1. CycloneBoy/slm_sql (GitHub, doğrudan okundu) — https://github.com/CycloneBoy/slm_sql
2. SLM-SQL makalesi, arXiv 2507.22478 (özet) — https://arxiv.org/abs/2507.22478
3. SLM-SQL HTML sürümü ve özetleri (özet) — https://arxiv.org/html/2507.22478v1 · https://www.alphaxiv.org/overview/2507.22478
4. frizynn GGUF depoları (özet) — https://huggingface.co/frizynn/SLM-SQL-1.5B-GGUF · https://huggingface.co/frizynn/SLM-SQL-Base-0.6B-GGUF
5. Hugging Face Hub belgeleri: Ollama ile GGUF çalıştırma (özet) — https://huggingface.co/docs/hub/ollama
6. Qwen2.5-Coder GitHub ve Ollama etiket aynası (özet) — https://github.com/QwenLM/Qwen2.5-Coder · https://registry.ollama.ai/mannix/qwen2.5-coder
7. Qwen2.5-Coder-1.5B-Instruct model kartı / GGUF kartı (özet) — https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct · https://huggingface.co/QuantFactory/Qwen2.5-Coder-1.5B-Instruct-GGUF
8. GGUF dosya adları ve boyutları (özet) — https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF · https://huggingface.co/kolosal/qwen2.5-coder-1.5b/blame/main/README.md
9. Alibaba Cloud Qwen2.5-Coder duyurusu ve 3B lisansı (özet) — https://www.alibabacloud.com/blog/601765 · https://huggingface.co/Qwen/Qwen2.5-Coder-3B/raw/main/README.md
10. SLM-SQL model kartları ve lisansları (özet) — https://huggingface.co/cycloneboy/SLM-SQL-1.5B/blob/refs%2Fpr%2F1/README.md · https://huggingface.co/cycloneboy/SLM-SQL-0.6B · https://huggingface.co/cycloneboy/SLM-SQL-1.3B
11. Prem AI blogu: Prem-1B-SQL (özet) — https://blog.premai.io/prem-1b-sql-fully-local-performant-slm-for-text-to-sql
12. Bağımsız Spider dev ölçümü (1,5B taban 0,558; 3B 0,691; 7B 0,793) (özet) — https://gh.r-mj.com/Lawson-Darrow/Text-to-SQL-Finetune
13. prem-1B-SQL kartı ve GGUF aynaları (özet) — https://huggingface.co/premai-io/prem-1B-SQL · https://huggingface.co/tensorblock/prem-1B-SQL-GGUF · https://huggingface.co/QuantFactory/prem-1B-SQL-GGUF
14. PremSQL belgeleri: Ollama üreteci (özet) — https://docs.premai.io/premsql/generators
15. Qwen3-1.7B-Base kartı (özet) — https://huggingface.co/Qwen/Qwen3-1.7B-Base
16. Qwen3.5 küçük modeller ve Ollama etiketleri (özet, üçüncü taraf) — https://dev.to/preecha/how-to-use-qwen-35-with-ollama-20a0 · https://insiderllm.com/guides/qwen-3-5-small-models-9b-beats-30b/ · https://gigazine.net/gsc_news/en/20260303-qwen-3-5-small
17. Qwen3.5-2B / 0.8B kartları ve GGUF (özet) — https://huggingface.co/Qwen/Qwen3.5-0.8B · https://huggingface.co/NobodyWho/Qwen_Qwen3.5-2B-GGUF · https://featherless.ai/models/Qwen/Qwen3.5-2B
18. NSQL deposu (özet) — https://www.sourcepulse.org/projects/1986717
19. gaussalgo T5 text2sql (özet) — https://huggingface.co/gaussalgo/T5-LM-Large-text2sql-spider · https://huggingface.co/inference4j/T5-LM-Large-text2sql-spider/blob/main/README.md
20. Qwen3-Coder GitHub (özet) — https://github.com/QwenLM/Qwen3-Coder
21. Topluluk 1,5B ince ayarları (özet) — https://huggingface.co/Anurich/slmsql-qwen2.5-coder-1.5b · https://huggingface.co/Abdullahkousa2/sqlforge-qwen2.5-coder-1.5b
22. FINER-SQL 0.5B (özet) — https://featherless.ai/models/thanhdath/FINER-SQL-0.5B-Spider
23. ReViSQL, arXiv 2603.20004 (özet) — https://arxiv.org/abs/2603.20004v1
24. LitE-SQL, EACL 2026 Findings (özet) — https://aclanthology.org/2026.findings-eacl.186.pdf
25. XiYanSQL-QwenCoder GitHub (özet) — https://github.com/XGenerationLab/XiYanSQL-QwenCoder
26. XiYanSQL-QwenCoder-3B-2502 lisansı (özet) — https://featherless.ai/models/XGenerationLab/XiYanSQL-QwenCoder-3B-2502
27. OmniSQL makalesi ve kartları (özet) — https://arxiv.org/html/2503.02240 · https://huggingface.co/seeklhy/OmniSQL-7B · https://featherless.ai/models/seeklhy/OmniSQL-14B
28. OmniSQL-7B GGUF listesi (özet, üçüncü taraf) — https://www.promptlayer.com/models/omnisql-7b-gguf
29. Arctic-Text2SQL-R1-7B kartı ve blog (özet) — https://huggingface.co/Snowflake/Arctic-Text2SQL-R1-7B · https://snowflake.com/en/engineering-blog/arctic-text2sql-r1-sql-generation-benchmark
30. defog-ai/sqlcoder (GitHub, doğrudan okundu) ve sqlcoder-7b-2 kartı — https://github.com/defog-ai/sqlcoder · https://huggingface.co/defog/sqlcoder-7b-2
31. DuckDB-NSQL (özet) — https://motherduck.com/blog/duckdb-text2sql-llm/ · https://github.com/NumbersStationAI/DuckDB-NSQL
32. Gemma 3 duyurusu (özet) — https://huggingface.co/blog/gemma3
33. Llama 3.2 1B kartı (özet) — https://ai.azure.com/catalog/models/Llama-3.2-1B
34. vanna-ai/vanna (GitHub, doğrudan okundu) — https://github.com/vanna-ai/vanna
35. premAI-io/premsql (GitHub, doğrudan okundu) — https://github.com/premAI-io/premsql
36. Canner/WrenAI (GitHub, doğrudan okundu) — https://github.com/Canner/WrenAI
37. WrenAI Ollama desteği, eski sorun kaydı (özet) — https://github.com/Canner/WrenAI/issues/308
38. Dataherald/dataherald (GitHub, doğrudan okundu) — https://github.com/Dataherald/dataherald
39. Dataherald etkinlik meta verisi (özet) — https://awesome.ecosyste.ms/projects/github.com%2FDataherald%2Fdataherald
40. sqlchat/sqlchat (GitHub, doğrudan okundu) — https://github.com/sqlchat/sqlchat

Türkçe text-to-SQL için ilgili akademik çalışma (bilgi): TURSpider, Spider'ın Türkçe çevirisi,
IEEE Access 2024 — https://research.itu.edu.tr/en/publications/turspider-a-turkish-text-to-sql-dataset-and-llm-based-study/
Kendi Türkçe test setimizi kurarken örnek alınabilir.
