"""Başvuru çözümü: float32 dönüşümü kaldırılır (istatistikler float64 ile; scikit-learn ile aynı sonuç).

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: bellek kazancı gerekiyorsa doğruluğu bozmayan yol, istatistikleri parça parça float64 biriktirerek
hesaplamaktır; o da gizli testi geçer.
"""

from pathlib import Path

from exam.edit import replace


def coz(kopya: Path) -> None:
    replace(
        kopya / "ml_temel/onisleme/scalers.py",
        "    X = X.astype(np.float32)  # büyük tablolarda yarı bellek, daha hızlı toplama\n",
        "",
    )
