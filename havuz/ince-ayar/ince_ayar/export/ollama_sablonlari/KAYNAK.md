# Ollama şablonları — kaynak kaydı

Bu klasördeki `.gotmpl` (Go şablonu) ve `.json` (durma dizileri) dosyaları Ollama deposundan
**değiştirilmeden** kopyalanmıştır.

| Dosya                   | Kaynak                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| `chatml.*`              | `https://raw.githubusercontent.com/ollama/ollama/main/template/chatml.*`          |
| `llama3-instruct.*`     | `https://raw.githubusercontent.com/ollama/ollama/main/template/llama3-instruct.*` |
| `gemma3-instruct.*`     | `https://raw.githubusercontent.com/ollama/ollama/main/template/gemma3-instruct.*` |
| `phi-3.*`               | `https://raw.githubusercontent.com/ollama/ollama/main/template/phi-3.*`           |

- Alınma tarihi: 2026-11-16
- Lisans: MIT (Copyright (c) Ollama) — `https://raw.githubusercontent.com/ollama/ollama/main/LICENSE`
- Kullanıldığı yer: `ince_ayar/export/ollama.py` (`Modelfile` içindeki `TEMPLATE` ve `PARAMETER stop`).

Ollama'nın bu şablonları değiştirmesi olasıdır; yenilemek için aynı adresten yeniden indirin ve
`tests/test_export_ollama.py` testini koşturun.
