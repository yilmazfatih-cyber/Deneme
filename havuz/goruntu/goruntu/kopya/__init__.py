"""Kopya ve benzer görüntü bulma: algısal özetler, Hamming uzaklığı, gruplama, sızıntı denetimi.

Modüller:
- `hashes.py` : aHash, dHash, pHash (DCT numpy ile, sıfırdan) — 64 bitlik tam sayı özetler.
- `groups.py` : toplu Hamming uzaklığı, eşik altı çiftler, birleşim-bul (union-find) ile gruplar,
                iki küme arasında sızıntı (yakın kopya) çiftleri.
- `scan.py`   : klasör tarama → özetler + reddedilen dosyalar (komutlar ve eğitim ayrımı kullanır).
torch İSTEMEZ.

Genişletme: yeni bir özet türü `hashes.py` içine yazılır ve `HASHERS` sözlüğüne eklenir.
"""
