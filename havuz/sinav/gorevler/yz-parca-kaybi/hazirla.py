"""Başlangıç: `_kelimelerle_bol` sondaki artık kelimeleri parçaya eklemeyi unutur (bir eksik).

Mevcut testler bu yolu (noktasız, hedeften uzun cümle) sınamadığı için denetim başlangıçta yeşildir.
Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelin parcala.py'si değişirse aranan metni güncelleyin.
"""

from pathlib import Path

from exam.edit import replace

TAIL = """            tampon = []
    if tampon:
        parcalar.append(" ".join(tampon))
    return parcalar
"""


def hazirla(kopya: Path) -> None:
    replace(
        kopya / "yz/rag/parcala.py",
        TAIL,
        """            tampon = []
    return parcalar
""",
    )
