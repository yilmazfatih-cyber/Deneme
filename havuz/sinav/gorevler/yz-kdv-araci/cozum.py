"""Başvuru çözümü: yz/arac/hazir/kdv.py (Decimal, yarım yukarı) + dışa açma + test.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: hazir/__init__.py'nin içe aktarma satırları değişirse aranan metni güncelleyin.
"""

from pathlib import Path

from exam.edit import replace, run, write

MODULE = '''"""KDV aracı: tutarın KDV hariç, KDV ve KDV dahil hâlini verir (Türkçe tutar yazımıyla).

Küçük modeller yüzde ve yuvarlama hesabında sık yanılır; bu araç kuruşa yarım yukarı yuvarlar ve
KDV dahil tutardan ayırırken toplamı korur (hariç + KDV = dahil). Float kullanılmaz (Decimal).
Kim kullanır: ajan (hazır araç).
Genişletme: yeni bir para birimi ya da biçim için `_yaz`'ı değiştirin ve testine örnek ekleyin.
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal

from yz.arac.tanim import Arac

_TUTAR = re.compile(r"(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d{1,2}))?")
_KURUS = Decimal("0.01")


def tutar_coz(metin: str) -> Decimal:
    """Türkçe yazılmış tutarı okur: "1.234,56" → Decimal("1234.56"); anlaşılmazsa `ValueError`."""
    duz = metin.strip().removesuffix("TL").strip()
    eslesme = _TUTAR.fullmatch(duz)
    if not eslesme:
        raise ValueError(f"Tutar anlaşılamadı: {metin!r}. Türkçe yazın, ör. 1.234,56")
    kurus = (eslesme[2] or "").ljust(2, "0")
    return Decimal(f"{eslesme[1].replace('.', '')}.{kurus}")


def _yaz(deger: Decimal) -> str:
    return f"{deger:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def kdv_araclari() -> list[Arac]:
    """KDV aracını kurar."""

    def kdv_hesapla(tutar: str, oran: int = 20, dahil: bool = False) -> str:
        """Tutarın KDV hariç, KDV ve KDV dahil hâlini hesaplar.

        Args:
            tutar: Türkçe yazılmış tutar, ör. 1.234,56
            oran: KDV oranı (yüzde), ör. 20
            dahil: Tutar KDV dahil mi (true) yoksa hariç mi (false)
        """
        if not 0 <= oran <= 100:
            raise ValueError(f"KDV oranı 0 ile 100 arasında olmalı; verilen: {oran}")
        deger = tutar_coz(tutar)
        if dahil:
            haric = (deger * 100 / (100 + oran)).quantize(_KURUS, ROUND_HALF_UP)
            kdv = deger - haric
            toplam = deger
        else:
            haric = deger
            kdv = (deger * oran / 100).quantize(_KURUS, ROUND_HALF_UP)
            toplam = haric + kdv
        return f"KDV hariç: {_yaz(haric)} TL; KDV (%{oran}): {_yaz(kdv)} TL; KDV dahil: {_yaz(toplam)} TL"

    return [Arac(kdv_hesapla)]
'''

TEST = '''"""KDV aracının testi: yuvarlama, KDV dahil tutardan ayırma ve hata yolları."""

from yz.arac.hazir import kdv_araclari


def test_kdv_haric_ve_dahil():
    (arac,) = kdv_araclari()
    sonuc = arac.calistir({"tutar": "2,50", "oran": 5})
    assert sonuc.icerik == "KDV hariç: 2,50 TL; KDV (%5): 0,13 TL; KDV dahil: 2,63 TL"
    sonuc = arac.calistir({"tutar": "100,00", "oran": 18, "dahil": True})
    assert sonuc.icerik == "KDV hariç: 84,75 TL; KDV (%18): 15,25 TL; KDV dahil: 100,00 TL"


def test_kdv_hatalari_gozlem_olur():
    (arac,) = kdv_araclari()
    assert arac.calistir({"tutar": "abc"}).hata
    assert arac.calistir({"tutar": "10", "oran": 150}).hata
'''


def coz(kopya: Path) -> None:
    write(kopya / "yz/arac/hazir/kdv.py", MODULE)
    init = kopya / "yz/arac/hazir/__init__.py"
    replace(
        init,
        "from yz.arac.hazir.hesap import",
        "from yz.arac.hazir.kdv import kdv_araclari\nfrom yz.arac.hazir.hesap import",
    )
    replace(init, '    "hesapla",\n', '    "hesapla",\n    "kdv_araclari",\n')
    write(kopya / "tests/test_arac_kdv.py", TEST)
    python = str(kopya / ".venv/bin/python")
    run([python, "-m", "ruff", "check", "--fix", "-q", "yz/arac/hazir/__init__.py"], kopya)
    run([python, "-m", "ruff", "format", "-q", "yz/arac/hazir", "tests/test_arac_kdv.py"], kopya)
