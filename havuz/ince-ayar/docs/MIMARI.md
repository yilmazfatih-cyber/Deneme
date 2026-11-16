# Mimari

## Parçalar

```
python -m ince_ayar <gorev> <eylem>
        │
        ▼
ince_ayar/cli.py ──► registry.py ──► tasks/<görev>/cli.py (eylemler; ağır içe aktarma yok)
                                         │
              ┌──────────────────────────┼───────────────────────────┐
              ▼                          ▼                           ▼
     config.py + yapilandirma/   data/ (doğrula, ayır, istatistik)   synth/ (öğretmen → veri)
              │                          │
              └────────────► tasks/<görev>/train.py ◄────────────────┘
                                │      │        │
                hardware.py ◄───┘      │        └──► report/ (geri çağrı, rapor.html)
                memory.py + plan.py ◄──┘ (kuru çalıştırma)
                                │
                                ▼
                 çıktı klasörü: model/ ya da bagdastirici/, ozet.json, ayar.toml, rapor.html
                                │
             ┌──────────────────┼────────────────────┐
             ▼                  ▼                    ▼
   tasks/*/evaluate.py   tasks/chat/merge.py   export/ (ONNX, GGUF bilgisi, Ollama Modelfile)
   (metrics/*.py)               │                    │
                                └─► tasks/chat/export.py ─► llama.cpp dönüştürücüsü (dış)
```

## Veri akışı (sohbet)

1. `data/validate.load_chat` her satırı `data/records.ChatRow` şemasıyla doğrular → `ChatExample` listesi + uyarılar.
2. Ayrı doğrulama dosyası yoksa `data/split.leak_free_split`: yinelemeler (`data/neardup`) ve `grup` aynı tarafa.
3. `tasks/chat/masking.encode_chat`: modelin şablonu → metin → belirteçler + etiketler (asistan dışı −100).
4. `tasks/chat/plan`: adım sayısı, kesin parametre sayısı (meta aygıt), bellek tahmini → `--kuru` ise dur.
5. `tasks/chat/train`: TRL `SFTTrainer` (önceden belirteçlenmiş veri), geri çağrılar günlük ve örnek üretim yazar.
6. Kayıt: `bagdastirici/` (LoRA) + `ozet.json` + `ayar.toml` + `rapor.html`.
7. `birlestir` → tam model (eos'a şablonun bitiş belirteci eklenir) → `disa-aktar` → GGUF + `Modelfile`.

## Veri akışı (kodlayıcılar)

Sınıflandırma: doğrula → katmanlı sızıntısız ayrım (eğitim/doğrulama/test) → `WeightedTrainer` → doğrulamada eşik →
testte rapor → `model/` + `esik.json` → ONNX (`export/onnx.py`) → torch'suz çıkarım (`export/onnx_runtime.py`).

Gömme: çiftler → olumlu belgeye göre gruplanmış ayrım → derlem (olumlu + olumsuz + ek belgeler) → önce ölçüm →
sentence-transformers eğiticisi (MNRL) → sonra ölçüm → `model/` → ONNX (kodlayıcı + havuzlama + normalleştirme).

## Sınırda doğrulama

Dışarıdan gelen her şey şemadan geçer: veri satırları (`data/records.py`), yapılandırma (`config.py` +
`tasks/*/config.py`), öğretmen yanıtı (`synth/client.py`, `synth/recipes.py`), katalog (`catalog.py`).
