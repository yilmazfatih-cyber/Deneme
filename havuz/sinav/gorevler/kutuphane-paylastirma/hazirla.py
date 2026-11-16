"""Başlangıç: `allocate` iki dilde de artan kuruşları EN KÜÇÜK kalanlı paylara verir.

Hatayı yakalayan vektör örneği ([1, 2, 3]) ve iki dildeki özellik testi çıkarılır; böylece başlangıçta iki
denetim de yeşildir. Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelin para.ts / para.py dosyaları değişirse aranan metinleri güncelleyin.
"""

from pathlib import Path

from exam.edit import remove_between, replace

VECTOR_CASE = """      {
        "girdi": [{ "kurus": 100, "currency": "TRY" }, [1, 2, 3]],
        "cikti": [
          { "kurus": 17, "currency": "TRY" },
          { "kurus": 33, "currency": "TRY" },
          { "kurus": 50, "currency": "TRY" }
        ]
      },
"""


def hazirla(kopya: Path) -> None:
    replace(
        kopya / "py/kutuphane/para.py",
        "key=lambda i: (-(amount * weights[i] % total_weight), i))",
        "key=lambda i: (amount * weights[i] % total_weight, i))",
    )
    replace(
        kopya / "ts/src/para.ts",
        "x.remainder > y.remainder ? -1 : 1))",
        "x.remainder > y.remainder ? 1 : -1))",
    )
    replace(kopya / "vektorler/para.json", VECTOR_CASE, "")
    remove_between(
        kopya / "ts/test/para.test.ts",
        "  it('paylaştırmada parçaların toplamı tutara eşittir",
        "  it('KDV ayırmada",
    )
    replace(
        kopya / "ts/test/para.test.ts",
        "import { addVat, allocate, formatMoney, money, MoneyError, parseMoney, removeVat, sumMoney } from",
        "import { addVat, formatMoney, money, MoneyError, parseMoney, removeVat } from",
    )
    remove_between(
        kopya / "py/tests/test_para.py",
        "def test_allocation_preserves_total() -> None:",
        "def test_vat_parts_always_add_up() -> None:",
    )
    replace(kopya / "py/tests/test_para.py", "    add_vat,\n    allocate,\n", "    add_vat,\n")
    replace(kopya / "py/tests/test_para.py", "    remove_vat,\n    sum_money,\n)", "    remove_vat,\n)")
