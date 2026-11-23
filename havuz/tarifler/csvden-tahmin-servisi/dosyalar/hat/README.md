# hat — kirli CSV'den tahmin servisine

Bu klasörü `csvden-tahmin-servisi` tarifi ekledi (`havuz/tarifler/csvden-tahmin-servisi/README.md`).

```bash
python hat/calistir.py                                          # üret → profil → temizle → hazırla → eğit
ml-temel/.venv/bin/python -m ml_temel sun --model hat/calisma/model/model.npz     # http://127.0.0.1:8445
curl -s http://127.0.0.1:8445/tahmin -H 'Content-Type: application/json' -d @hat/ornek_istek.json
```

| Dosya | Ne |
| --- | --- |
| `calistir.py` | Hattın kendisi (yalnız standart kütüphane; temellerin `.venv`'lerini kullanır) |
| `ornek_istek.json` | Biri düşük, biri yüksek riskli iki müşteriyle örnek tahmin isteği |
| `calisma/` | Hattın çıktıları (depoya girmez) |

Kendi verinizle: `calistir.py` içindeki `HEDEF`, `GRUP` ve `SIZINTI_SUTUNLARI` değerlerini değiştirip
1. adımı (`uret`) kendi CSV'nizi kopyalayan bir adımla değiştirin. Sızıntı sütunu = tahmin anında
bilinemeyecek her bilgi (iptal tarihi, "gerçek olasılık", sonradan doldurulan alanlar).
