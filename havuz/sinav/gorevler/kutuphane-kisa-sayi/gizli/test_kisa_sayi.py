"""Gizli sınav testi (kutuphane-kisa-sayi): format_compact_tr görev metnine uyar ve vektöre örnek eklenmiş.

Başvuru: tam sayı aritmetiğiyle bağımsız yazılmış kısaltma (yarım yukarı, üst basamağa taşma).
"""

import json
import random
from pathlib import Path

import pytest

from kutuphane import sayi_yazi
from kutuphane.sayi_yazi import NumberFormatError

_SCALES = [(10**12, "trilyon"), (10**9, "milyar"), (10**6, "milyon"), (10**3, "bin")]


def _reference(n: int) -> str:
    sign = "-" if n < 0 else ""
    amount = abs(n)
    if amount < 1000:
        return f"{sign}{amount}"
    index = next(i for i, (scale, _) in enumerate(_SCALES) if amount >= scale)
    scale, name = _SCALES[index]
    tenths = (amount * 10 + scale // 2) // scale
    if tenths >= 10_000 and index > 0:
        scale, name = _SCALES[index - 1]
        tenths = (amount * 10 + scale // 2) // scale
    whole, fraction = divmod(tenths, 10)
    number = f"{whole:,}".replace(",", ".")
    return f"{sign}{number}{',' + str(fraction) if fraction else ''} {name}"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, "0"), (999, "999"), (-45, "-45"), (1000, "1 bin"), (1200, "1,2 bin"),
        (15000, "15 bin"), (2500000, "2,5 milyon"), (7300000000, "7,3 milyar"),
        (1000000000000, "1 trilyon"), (1250, "1,3 bin"), (1249, "1,2 bin"), (-1250, "-1,3 bin"),
        (1150, "1,2 bin"), (2150000, "2,2 milyon"), (999999, "1 milyon"), (999949, "999,9 bin"),
        (999950000, "1 milyar"), (2500000000000000, "2.500 trilyon"), (-999999, "-1 milyon"),
    ],
)  # fmt: skip
def test_gorev_metnindeki_ornekler(value: int, expected: str) -> None:
    assert sayi_yazi.format_compact_tr(value) == expected


def test_tam_sayi_olmayan_hata_verir() -> None:
    with pytest.raises(NumberFormatError):
        sayi_yazi.format_compact_tr(1.5)  # type: ignore[arg-type]


def test_kaba_kuvvetle_karsilastirma() -> None:
    rng = random.Random(77)
    for _ in range(5000):
        value = rng.randint(0, 10 ** rng.randint(1, 15)) * rng.choice((1, -1))
        assert sayi_yazi.format_compact_tr(value) == _reference(value), value


def test_ortak_vektore_ornek_eklendi() -> None:
    path = Path(__file__).resolve().parents[2] / "vektorler" / "sayi_yazi.json"
    cases = json.loads(path.read_text(encoding="utf-8"))["islevler"].get("formatCompactTr", [])
    assert len(cases) >= 5, "vektorler/sayi_yazi.json → islevler.formatCompactTr altına örnek ekleyin"
