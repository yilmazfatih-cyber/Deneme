"""Vektör deposu: numpy ile kaba kuvvet (brute force) kosinüs araması + diskte kalıcılık.

Neden kaba kuvvet: ~100 bin parçaya kadar tek bir matris çarpımı yeterince hızlıdır ve
yaklaşık arama (HNSW vb.) bağımlılığı gerektirmez. Ölçüm: scripts/olc_vektor.py (sonuçlar
docs/KARARLAR.md K-11'de). Bunun üstünde FAISS / hnswlib gibi bir dizin düşünülmelidir.
Bellek: parça sayısı × boyut × 4 bayt (100 bin × 768 ≈ 307 MB).
Kim kullanır: rag/dizin.py.
Genişletme: başka bir arka uç → aynı `ekle` / `ara` / `kaydet` / `yukle` arayüzüyle yeni sınıf.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from yz.rag.gomme import normalle


class VektorDeposu:
    """Satırları normlu vektörler; `ara` iç çarpımla (= kosinüs benzerliği) sıralar."""

    def __init__(self) -> None:
        self._bloklar: list[np.ndarray] = []
        self._matris: np.ndarray | None = None

    def __len__(self) -> int:
        return sum(blok.shape[0] for blok in self._bloklar)

    @property
    def boyut(self) -> int | None:
        return self._bloklar[0].shape[1] if self._bloklar else None

    def _birlesik(self) -> np.ndarray:
        if self._matris is None:
            self._matris = (
                np.concatenate(self._bloklar) if self._bloklar else np.zeros((0, 0), np.float32)
            )
            self._bloklar = [self._matris] if self._bloklar else []
        return self._matris

    def ekle(self, vektorler: np.ndarray) -> None:
        matris = normalle(vektorler)
        if matris.shape[0] == 0:
            return
        if self.boyut is not None and matris.shape[1] != self.boyut:
            raise ValueError(
                f"Vektör boyutu tutmuyor: depo {self.boyut}, gelen {matris.shape[1]}. Dizin başka "
                "bir gömme modeliyle kurulmuş; dizini yeniden kurun (python -m yz indeksle)."
            )
        self._bloklar.append(matris)
        self._matris = None

    def ara(self, sorgu: np.ndarray, k: int = 10) -> list[tuple[int, float]]:
        """En benzer `k` satır: [(satır numarası, kosinüs benzerliği), …] (azalan)."""
        matris = self._birlesik()
        if matris.shape[0] == 0 or k <= 0:
            return []
        vektor = normalle(sorgu)[0]
        if vektor.shape[0] != matris.shape[1]:
            raise ValueError(
                f"Sorgu vektörü boyutu ({vektor.shape[0]}) depoyla ({matris.shape[1]}) tutmuyor."
            )
        benzerlik = matris @ vektor
        k = min(k, benzerlik.shape[0])
        adaylar = np.argpartition(-benzerlik, k - 1)[:k]
        sirali = adaylar[np.lexsort((adaylar, -benzerlik[adaylar]))]
        return [(int(i), float(benzerlik[i])) for i in sirali]

    def kaydet(self, yol: Path) -> None:
        yol.parent.mkdir(parents=True, exist_ok=True)
        gecici = yol.with_suffix(".tmp.npy")
        np.save(gecici, self._birlesik(), allow_pickle=False)
        gecici.replace(yol)

    @classmethod
    def yukle(cls, yol: Path) -> VektorDeposu:
        depo = cls()
        matris = np.load(yol, allow_pickle=False)
        if matris.size:
            depo._bloklar = [matris.astype(np.float32)]
        return depo
