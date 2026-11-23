# baglanti — kendi dil modelin + yz

Bu klasörü `kendi-modelinle-sohbet` tarifi ekledi (`havuz/tarifler/kendi-modelinle-sohbet/README.md`).

```bash
python baglanti/dene.py            # sunucuyu başlat → yz modeller / sohbet / degerlendir → kapat
```

Elle (iki terminal):

```bash
cd dil-modeli && .venv/bin/python -m dil_modeli sun --model ornek-model        # 1. terminal
cd yz && .venv/bin/python -m yz sohbet --ayar yz.dil-modeli.yaml               # 2. terminal
```

Kendi eğittiğiniz model için `--model <klasör>` verin; yz tarafında `yz.dil-modeli.yaml` → `model`
alanını sunucunun `/v1/models` listesindeki adla aynı yapın. Çıktılar `calisma/` altında (depoya girmez).
