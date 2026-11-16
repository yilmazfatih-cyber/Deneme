"""Başvuru çözümü: iki dilde de en büyük kalan önce; hatayı yakalayan vektör örneği geri eklenir.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: çözüm değişirse iki gizli testin de geçtiğini `dogrula` ile doğrulayın.
"""

from pathlib import Path

from exam.edit import insert_before, replace

VECTOR_CASE = """      {
        "girdi": [{ "kurus": 10000, "currency": "TRY" }, [1, 2, 3]],
        "cikti": [
          { "kurus": 1667, "currency": "TRY" },
          { "kurus": 3333, "currency": "TRY" },
          { "kurus": 5000, "currency": "TRY" }
        ]
      },
"""


def coz(kopya: Path) -> None:
    replace(
        kopya / "py/kutuphane/para.py",
        "key=lambda i: (amount * weights[i] % total_weight, i))",
        "key=lambda i: (-(amount * weights[i] % total_weight), i))",
    )
    replace(
        kopya / "ts/src/para.ts",
        "x.remainder > y.remainder ? 1 : -1))",
        "x.remainder > y.remainder ? -1 : 1))",
    )
    insert_before(
        kopya / "vektorler/para.json",
        '      {\n        "girdi": [{ "kurus": -100, "currency": "TRY" }, [1, 1, 1]],',
        VECTOR_CASE,
    )
