"""Başlangıç: StandardScaler'ın istatistikleri "bellek için" float32 ile hesaplanır; denetim KIRMIZI.

İki test (tests/test_onisleme.py) scikit-learn'den küçük göreli farklar bulur. Görev, testi gevşetmeden
denetimi yeşile döndürmektir. Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelin scalers.py'si değişirse aranan metni güncelleyin.
"""

from pathlib import Path

from exam.edit import replace


def hazirla(kopya: Path) -> None:
    replace(
        kopya / "ml_temel/onisleme/scalers.py",
        "    present = ~np.isnan(X)\n    count = np.maximum(present.sum(axis=0), 1)\n",
        "    X = X.astype(np.float32)  # büyük tablolarda yarı bellek, daha hızlı toplama\n"
        "    present = ~np.isnan(X)\n    count = np.maximum(present.sum(axis=0), 1)\n",
    )
