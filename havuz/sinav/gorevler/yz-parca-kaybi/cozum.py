"""Başvuru çözümü: kelimelere bölmede artan son kelimeler son parça olur; regresyon testi eklenir.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: çözüm değişirse gizli testin geçtiğini `dogrula` ile doğrulayın.
"""

from pathlib import Path

from exam.edit import replace, write

TEST = '''"""Parçalayıcı regresyonu: noktasız uzun paragrafın son kelimeleri kaybolmaz."""

from yz.rag.parcala import belgeyi_parcala
from yz.rag.yukleyici import Belge


def test_noktasiz_uzun_paragrafin_sonu_korunur():
    kalemler = " ".join(f"kalem{i} fiyatı {i * 10} lira" for i in range(1, 80))
    belge = Belge("fiyat.md", f"# Fiyat listesi\\n\\n{kalemler} montaj ücreti 750 lira")
    parcalar = belgeyi_parcala(belge, hedef_belirtec=60)
    assert parcalar[-1].metin.endswith("750 lira")
    assert "montaj" in " ".join(p.metin for p in parcalar)
'''


def coz(kopya: Path) -> None:
    replace(
        kopya / "yz/rag/parcala.py",
        """            tampon = []
    return parcalar
""",
        """            tampon = []
    if tampon:
        parcalar.append(" ".join(tampon))
    return parcalar
""",
    )
    write(kopya / "tests/test_parcala_regresyon.py", TEST)
