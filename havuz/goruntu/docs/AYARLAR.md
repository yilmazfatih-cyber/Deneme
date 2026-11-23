# Ayarlar ve ortam değişkenleri

Bu temel `.env` dosyası okumaz. Değişkenleri komuttan önce yazın (`AD=deger python -m goruntu …`) ya da
kabukta `export` edin. Depoya sır (API anahtarı) yazmayın.

| Değişken | Ne işe yarar | Örnek |
| --- | --- | --- |
| `GORUNTU_API_ANAHTARI` | Sunucu (`sun`) için API anahtarı. Verilirse her istek `Authorization: Bearer <anahtar>` ister ve sunucu başka bilgisayarlardan erişilebilir olur. Verilmezse yalnız 127.0.0.1/localhost. | `GORUNTU_API_ANAHTARI=uzun-rastgele-dizgi python -m goruntu sun --adres 0.0.0.0 --model …` |
| `GORUNTU_IS_PARCACIGI` | CPU iş parçacığı sayısı (yapılandırmada `is_parcacigi = 0` iken). | `GORUNTU_IS_PARCACIGI=2` |
| `GORUNTU_AG` | `1` ise ağ isteyen testler de koşar. | `GORUNTU_AG=1 .venv/bin/python -m pytest` |
| `GORUNTU_DUMAN_RAPOR` | Duman testi ölçümlerinin JSON yolu (`scripts/duman_testi.py` verir). | — |
| `HF_HUB_DISABLE_XET` | Hugging Face indirmesi takılıyorsa `1`. | `HF_HUB_DISABLE_XET=1` |
| `HF_HOME` | İndirilen modellerin yeri (varsayılan `~/.cache/huggingface`). | `HF_HOME=/buyuk/disk/hf` |
| `HF_HUB_OFFLINE` | `1` ise hiç indirme denenmez (önbellekte yoksa açık hata). | — |

Yapılandırma dosyaları: `yapilandirma/siniflandirma/*.toml`. Tek değer değiştirmek için
`-D bolum.anahtar=deger` (değer TOML: metin tırnaklı, `-D model.taban="timm/efficientnet_b0.ra_in1k"`).
