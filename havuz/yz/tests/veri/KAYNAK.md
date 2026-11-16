# tests/veri — kaynak kaydı

| Dosya | Kaynak | Lisans | Nasıl üretildi |
| --- | --- | --- | --- |
| `gercek_ciktilar.jsonl` | Qwen2.5-0.5B-Instruct modelinin ham çıktıları (Hugging Face `Qwen/Qwen2.5-0.5B-Instruct`, sürüm `7ae5576`) | Model Apache-2.0; çıktılar bu deneme için üretildi | `araclar/gercek_deneme.py --asama cikarim --fixture`; girdiler `gorevler/json_cikarim.jsonl` ilk 4 örnek + betikteki 2 iletişim metni. Ayrıntı: `docs/GERCEK_MODEL_DENEMESI.md` |

Bu dosya eğitim verisi DEĞİLDİR; JSON onarıcısının gerçek küçük model çıktılarındaki davranışını
korumak için kayıtlı test girdisidir (tests/test_gercek_ciktilar.py).
