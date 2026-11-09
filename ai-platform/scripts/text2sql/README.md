# Text2SQL ağırlık betikleri

Tam anlatım: [`docs/TEXT2SQL.md`](../../docs/TEXT2SQL.md). Sıra:

| Adım | Betik | Çıktı |
| --- | --- | --- |
| 1. Veri | `prepare_bird_sft.py` — BIRD/Spider → çıkarımla aynı istemde SFT jsonl (+ onarım örnekleri) | `data/bird_sft.jsonl` |
| 2. Yeni ağırlıklar | `train_lora.py` — QLoRA/LoRA, Qwen2.5-Coder-7B-Instruct | `out/lora-text2sql/adapter_model.safetensors` |
| 3. Ağırlık uzayı | `merge_weights.py` — görev vektörü (Arctic-Text2SQL-R1 − Qwen) · λ, TIES budama, LoRA ekleme | `out/koprusql-7b/*.safetensors` + `merge_report.json` |
| 4. Ölçüm | `python -m aiplatform.text2sql.bird` — BIRD dev yürütme doğruluğu, resmi `predict_dev.json` | `out/bird/report.json` |

Hepsi GPU sunucuda çalışır; bu depoda yalnız betikler ve küçük sentetik testleri (`tests/test_text2sql_scripts.py`) vardır.
