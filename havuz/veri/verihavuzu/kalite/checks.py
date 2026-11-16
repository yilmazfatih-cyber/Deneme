"""Tablo denetimleri: benzersizlik, boş olmama, aralık, desen, izinli değer, sağlama geçerliliği,
ilişkisel bütünlük (yabancı anahtar) ve serbest satır kuralı.

Python'dan doğrudan çağrılır (``check_unique(rows, ["siparis_id"])``) ya da bir JSON denetim
dosyasıyla toplu çalışır (``run_checks``; örnek: ``docs/ornek-denetimler.json``). Eksik değerler
yalnız ``bos_olmayan`` denetiminde hata sayılır; diğerleri onları atlar.
Her sonuç hatalı satır sayısını ve ilk birkaç satır numarasını (1'den başlar) taşır; değerin
kendisini taşımaz (kişisel veri rapora sızmasın).
Genişletme: yeni denetim için ``check_x`` işlevi yazın, ``CheckSpec.tur``a adını ve
``_dispatch`` içine bir dal ekleyin; ``tests/test_kalite.py``de ekilmiş bir hatayı yakalatın.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from verihavuzu.files import read_json, read_table
from verihavuzu.kalite.validators import VALIDATORS, validate
from verihavuzu.kalite.values import is_missing, parse_number

Row = dict[str, Any]
MAX_EXAMPLES = 10


@dataclass
class CheckResult:
    ad: str
    tur: str
    sutunlar: list[str]
    gecti: bool
    hatali_satir: int
    ornek_satirlar: list[int] = field(default_factory=list)
    mesaj: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _result(name: str, kind: str, columns: list[str], bad: list[int], message: str) -> CheckResult:
    text = message if bad else "sorun yok"
    return CheckResult(name, kind, columns, not bad, len(bad), bad[:MAX_EXAMPLES], text)


def _text(value: Any) -> str:
    return str(value).strip()


def check_unique(rows: Sequence[Row], columns: Sequence[str], name: str = "") -> CheckResult:
    """Sütun(lar)ın birlikte benzersiz olması. İlk görülen dışındaki tekrarlar hatalı sayılır."""
    seen: set[tuple[str, ...]] = set()
    bad: list[int] = []
    for number, row in enumerate(rows, start=1):
        key = tuple(_text(row.get(c)) for c in columns)
        if key in seen:
            bad.append(number)
        seen.add(key)
    label = name or f"benzersiz({','.join(columns)})"
    return _result(label, "benzersiz", list(columns), bad, f"{len(bad)} yinelenen satır")


def check_not_null(rows: Sequence[Row], column: str, name: str = "") -> CheckResult:
    bad = [n for n, row in enumerate(rows, start=1) if is_missing(row.get(column))]
    return _result(
        name or f"bos_olmayan({column})", "bos_olmayan", [column], bad, f"{len(bad)} boş değer"
    )


def check_range(
    rows: Sequence[Row],
    column: str,
    minimum: float | None = None,
    maximum: float | None = None,
    name: str = "",
) -> CheckResult:
    """Sayısal aralık; sayı olmayan değer de hatalı sayılır."""
    bad: list[int] = []
    for number, row in enumerate(rows, start=1):
        value = row.get(column)
        if is_missing(value):
            continue
        parsed = (
            parse_number(_text(value)) if not isinstance(value, int | float | Decimal) else value
        )
        if (
            parsed is None
            or isinstance(parsed, bool)
            or (minimum is not None and parsed < minimum)
            or (maximum is not None and parsed > maximum)
        ):
            bad.append(number)
    return _result(
        name or f"aralik({column})",
        "aralik",
        [column],
        bad,
        f"{len(bad)} değer [{minimum}, {maximum}] dışında ya da sayı değil",
    )


def check_pattern(rows: Sequence[Row], column: str, pattern: str, name: str = "") -> CheckResult:
    """Değerin düzenli ifadeye TAM uyması."""
    compiled = re.compile(pattern)
    bad = [
        n
        for n, row in enumerate(rows, start=1)
        if not is_missing(row.get(column)) and not compiled.fullmatch(_text(row[column]))
    ]
    return _result(
        name or f"desen({column})",
        "desen",
        [column],
        bad,
        f"{len(bad)} değer desene uymuyor: {pattern}",
    )


def check_allowed(
    rows: Sequence[Row], column: str, values: Sequence[Any], name: str = ""
) -> CheckResult:
    allowed = {_text(v) for v in values}
    bad = [
        n
        for n, row in enumerate(rows, start=1)
        if not is_missing(row.get(column)) and _text(row[column]) not in allowed
    ]
    return _result(
        name or f"izinli({column})", "izinli", [column], bad, f"{len(bad)} değer izinli listede yok"
    )


def check_valid(rows: Sequence[Row], column: str, validator: str, name: str = "") -> CheckResult:
    """Sağlama/biçim geçerliliği: ``validator`` ∈ tckn, vkn, iban, iban_tr, kart_no, eposta…"""
    bad = [
        n
        for n, row in enumerate(rows, start=1)
        if not is_missing(row.get(column)) and not validate(validator, _text(row[column]))
    ]
    return _result(
        name or f"gecerli({column}:{validator})",
        "gecerli",
        [column],
        bad,
        f"{len(bad)} değer geçerli {validator} değil",
    )


def check_foreign_key(
    rows: Sequence[Row], column: str, parent_rows: Sequence[Row], parent_column: str, name: str = ""
) -> CheckResult:
    """İlişkisel bütünlük: her değer üst tablonun ``parent_column`` sütununda var mı?"""
    parents = {_text(row.get(parent_column)) for row in parent_rows}
    bad = [
        n
        for n, row in enumerate(rows, start=1)
        if not is_missing(row.get(column)) and _text(row[column]) not in parents
    ]
    return _result(
        name or f"yabanci_anahtar({column}→{parent_column})",
        "yabanci_anahtar",
        [column],
        bad,
        f"{len(bad)} değerin üst tabloda karşılığı yok",
    )


def check_rule(rows: Sequence[Row], name: str, predicate: Callable[[Row], bool]) -> CheckResult:
    """Serbest satır kuralı (yalnız Python'dan): ``predicate`` False dönen satırlar hatalıdır."""
    bad = [n for n, row in enumerate(rows, start=1) if not predicate(row)]
    return _result(name, "kural", [], bad, f"{len(bad)} satır kurala uymuyor")


class CheckSpec(BaseModel):
    """JSON denetim dosyasındaki tek kayıt."""

    model_config = ConfigDict(extra="forbid")
    tur: Literal[
        "benzersiz", "bos_olmayan", "aralik", "desen", "izinli", "gecerli", "yabanci_anahtar"
    ]
    sutun: str | list[str]
    ad: str = ""
    en_az: float | None = None
    en_cok: float | None = None
    desen: str | None = None
    degerler: list[Any] | None = None
    denetim: str | None = None
    hedef_dosya: str | None = None  # yabancı anahtar: üst tablo dosyası (denetim dosyasına göre)
    hedef_sutun: str | None = None


def _need(value: Any, what: str, spec: CheckSpec) -> Any:
    if value is None:
        raise ValueError(f"'{spec.tur}' denetimi için '{what}' alanı gerekli.")
    return value


def _dispatch(rows: Sequence[Row], spec: CheckSpec, base_dir: Path) -> CheckResult:
    columns = [spec.sutun] if isinstance(spec.sutun, str) else spec.sutun
    column = columns[0]
    if spec.tur == "benzersiz":
        return check_unique(rows, columns, spec.ad)
    if spec.tur == "bos_olmayan":
        return check_not_null(rows, column, spec.ad)
    if spec.tur == "aralik":
        return check_range(rows, column, spec.en_az, spec.en_cok, spec.ad)
    if spec.tur == "desen":
        return check_pattern(rows, column, _need(spec.desen, "desen", spec), spec.ad)
    if spec.tur == "izinli":
        return check_allowed(rows, column, _need(spec.degerler, "degerler", spec), spec.ad)
    if spec.tur == "gecerli":
        validator = _need(spec.denetim, "denetim", spec)
        if validator not in VALIDATORS:
            raise ValueError(
                f"Bilinmeyen denetim: {validator}. Seçenekler: {', '.join(VALIDATORS)}"
            )
        return check_valid(rows, column, validator, spec.ad)
    parent = read_table(base_dir / _need(spec.hedef_dosya, "hedef_dosya", spec))
    return check_foreign_key(
        rows, column, parent, _need(spec.hedef_sutun, "hedef_sutun", spec), spec.ad
    )


def load_checks(path: Path) -> list[CheckSpec]:
    data = read_json(path)
    items = data.get("denetimler") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise ValueError(f"{path}: 'denetimler' listesi bekleniyordu.")
    return [CheckSpec.model_validate(item) for item in items]


def run_checks(
    rows: Sequence[Row], specs: Sequence[CheckSpec], base_dir: Path
) -> list[CheckResult]:
    """Denetim listesini sırayla çalıştırır."""
    return [_dispatch(rows, spec, base_dir) for spec in specs]
