"""Yeni algoritma üreteci: modül + test iskeletini doğru yere, doğru başlıkla oluşturur.

Kullanım (temel klasöründen):
    python scripts/new_algorithm.py <konu> <modul_adi>
    python scripts/new_algorithm.py graf johnson

Oluşturulan dosyalarda "DOLDUR" işaretleri vardır; kural testi (tests/test_kurallar.py) bu
işaretler kalkana ve başlık/test tamamlanana dek KIRMIZI kalır — bu bilerek böyledir.
Sonra: işaretleri doldurun, `python scripts/build_index.py` çalıştırın, `python scripts/check.py`.
Genişletme: şablonu değiştirmek için aşağıdaki MODULE_TEMPLATE / TEST_TEMPLATE metinlerini
düzenleyin.
"""

from __future__ import annotations

import argparse
import keyword
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.build_index import TOPICS  # noqa: E402 — kök yolu eklendikten sonra

MODULE_TEMPLATE = '''"""DOLDUR Ad: tek satırlık özet (ne yapar).

Fikir:
    DOLDUR — 3–8 satır: temel fikir, neden doğru çalıştığı, dikkat edilecek ince nokta.

Karmaşıklık: zaman O(DOLDUR); yer O(DOLDUR)
Ne zaman: DOLDUR (hangi problemde akla gelmeli)
Ne zaman değil: DOLDUR (hangi durumda başka bir modül daha iyi; adını yazın)
Bağımlılık: yok
Genişletme: DOLDUR (bu modül nasıl genişletilir)

Örnek:
    >>> {name}(DOLDUR)
    DOLDUR
"""

from __future__ import annotations


def {name}(DOLDUR) -> DOLDUR:
    """DOLDUR: ne döndürür, girdi koşulları neler."""
    raise NotImplementedError("DOLDUR")
'''

TEST_TEMPLATE = '''from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.{topic}.{name} import {name}


def _brute_force(DOLDUR) -> DOLDUR:
    """Başvuru: en basit (yavaş ama apaçık doğru) çözüm ya da stdlib karşılığı."""
    DOLDUR


def test_hand_checked_example() -> None:
    assert {name}(DOLDUR) == DOLDUR  # elle doğrulanmış küçük örnek


def test_edge_cases() -> None:
    DOLDUR  # boş girdi, tek öğe, yinelenenler, negatifler, büyük değerler


@given(DOLDUR)
def test_matches_brute_force(DOLDUR) -> None:
    assert {name}(DOLDUR) == _brute_force(DOLDUR)
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="yeni algoritma modülü + test iskeleti")
    parser.add_argument("topic", choices=sorted(TOPICS), help="konu klasörü")
    parser.add_argument("name", help="modül adı: küçük harf, İngilizce, alt çizgili (ör. johnson)")
    args = parser.parse_args()
    name: str = args.name
    if not re.fullmatch(r"[a-z][a-z0-9_]*", name) or keyword.iskeyword(name):
        print(f"Geçersiz ad: {name!r}. Küçük harf, rakam ve alt çizgi kullanın (ör. bellman_ford).")
        return 1
    if name in sys.stdlib_module_names:
        print(
            f"{name!r} bir stdlib modülünün adı; dosya kopyalanınca onu gölgeler. Başka ad seçin."
        )
        return 1
    module_path = ROOT / "algoritma" / args.topic / f"{name}.py"
    test_path = ROOT / "tests" / args.topic / f"test_{name}.py"
    for path in (module_path, test_path):
        if path.exists():
            print(f"Zaten var: {path.relative_to(ROOT)} — üzerine yazılmadı.")
            return 1
    module_path.write_text(MODULE_TEMPLATE.format(name=name), encoding="utf-8")
    test_path.write_text(TEST_TEMPLATE.format(topic=args.topic, name=name), encoding="utf-8")
    print(f"Oluşturuldu: {module_path.relative_to(ROOT)} ve {test_path.relative_to(ROOT)}")
    print("Sonraki adımlar: DOLDUR işaretlerini doldurun → python scripts/build_index.py →")
    print("python scripts/check.py (kural testi, eksik kalan her şeyi tek tek söyler).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
