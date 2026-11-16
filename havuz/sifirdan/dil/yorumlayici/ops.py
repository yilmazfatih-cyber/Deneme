"""İşleçlerin anlamı: aritmetik, karşılaştırma, dizinleme, dolaşma (yorumlayıcı + sanal makine).

Kurallar: `+` sayıları toplar, dizgileri ve listeleri birleştirir; `/` tam bölünen iki tamsayıda
tamsayı, aksi hâlde ondalık verir; sıfıra bölme hatadır; sonuçlar sonlu kalır (taşma = hata);
tamsayılar en fazla ~3900 basamak olabilir (dev sayılarla bellek/zaman saldırısı olmasın).
Hata iletisinde işlecin konumu (`pos`) gösterilir.
Genişletme: yeni işleç için `binary` içine bir dal, pratt.py `INFIX` tablosuna bir satır ekleyin.
"""

from __future__ import annotations

import math
import operator

from .errors import Pos, limit_error, runtime_error
from .values import is_number, type_name, values_equal

MAX_INT_BITS = 13_000  # ≈ 3900 ondalık basamak
MAX_SEQUENCE = 1_000_000  # bir dizgi/listenin en fazla öğe sayısı
ORDERING = {"<": operator.lt, "<=": operator.le, ">": operator.gt, ">=": operator.ge}


def check_size(n: int, pos: Pos | None) -> None:
    if n > MAX_SEQUENCE:
        raise limit_error(f"dizgi/liste çok büyük ({n} öğe; en fazla {MAX_SEQUENCE})", pos)


def number_result(v: int | float, pos: Pos | None) -> int | float:
    """Sonucu denetler: tamsayı boyu sınırı ve sonlu ondalık."""
    if isinstance(v, int):
        if v.bit_length() > MAX_INT_BITS:
            raise limit_error("sayı çok büyük (en fazla ~3900 basamak)", pos)
        return v
    if math.isinf(v) or math.isnan(v):
        raise runtime_error("sayı taşması: sonuç sonlu bir sayı değil", pos)
    return v


def type_error(op: str, a: object, b: object, pos: Pos | None) -> Exception:
    hint = None
    if op == "+" and {type_name(a), type_name(b)} == {"sayı", "dizgi"}:
        hint = "Sayıyı dizgiye çevirmek için `metin(x)`, tersi için `sayı(x)` kullanın."
    return runtime_error(
        f"'{op}' işleci {type_name(a)} ile {type_name(b)} için tanımlı değil", pos, hint
    )


def binary(op: str, a: object, b: object, pos: Pos | None) -> object:
    """İkili işlecin sonucunu döndürür (ve/veya hariç; onlar kısa devre olduğu için ayrıdır)."""
    if op == "==":
        return values_equal(a, b, pos)
    if op == "!=":
        return not values_equal(a, b, pos)
    if op in ("<", "<=", ">", ">="):
        return compare(op, a, b, pos)
    if op == "+":
        if isinstance(a, str) and isinstance(b, str):
            check_size(len(a) + len(b), pos)
            return a + b
        if isinstance(a, list) and isinstance(b, list):
            check_size(len(a) + len(b), pos)
            return a + b
    if not (is_number(a) and is_number(b)):
        raise type_error(op, a, b, pos)
    try:
        return number_result(arithmetic(op, a, b, pos), pos)
    except OverflowError:
        raise runtime_error("sayı taşması: sonuç çok büyük", pos) from None


def arithmetic(op: str, a: int | float, b: int | float, pos: Pos | None) -> int | float:
    match op:
        case "+":
            return a + b
        case "-":
            return a - b
        case "*":
            return a * b
        case "/":
            if b == 0:
                raise runtime_error("sıfıra bölme", pos, "Bölmeden önce böleni denetleyin.")
            if isinstance(a, int) and isinstance(b, int) and a % b == 0:
                return a // b
            return a / b
        case "%":
            if b == 0:
                raise runtime_error("sıfıra göre kalan alınamaz", pos)
            return a % b
        case "**":
            return power(a, b, pos)
    raise runtime_error(f"bilinmeyen işleç '{op}'", pos)


def power(a: int | float, b: int | float, pos: Pos | None) -> int | float:
    if isinstance(a, int) and isinstance(b, int) and b >= 0:
        if abs(a) > 1 and a.bit_length() * b > MAX_INT_BITS:
            raise limit_error("sayı çok büyük (en fazla ~3900 basamak)", pos)
        return int(a**b)
    if a == 0 and b < 0:
        raise runtime_error("sıfırın negatif kuvveti tanımsız", pos)
    result: object = float(a) ** float(b)
    if not isinstance(result, float):  # (-8) ** 0.5 Python'da karmaşık sayı verir
        raise runtime_error("negatif sayının kesirli kuvveti gerçel sayı değil", pos)
    return result


def compare(op: str, a: object, b: object, pos: Pos | None) -> bool:
    if (is_number(a) and is_number(b)) or (isinstance(a, str) and isinstance(b, str)):
        return bool(ORDERING[op](a, b))
    raise runtime_error(
        f"'{op}' karşılaştırması {type_name(a)} ile {type_name(b)} arasında yapılamaz",
        pos,
        "Sıralama karşılaştırması sayı–sayı ya da dizgi–dizgi arasında yapılır.",
    )


def unary(op: str, v: object, pos: Pos | None) -> object:
    if op == "değil":
        return v is None or v is False
    if not is_number(v):
        raise runtime_error(f"'-' işleci {type_name(v)} için tanımlı değil", pos)
    return number_result(-v, pos)


def check_key(key: object, pos: Pos | None) -> None:
    if isinstance(key, bool) or not (isinstance(key, str) or is_number(key)):
        raise runtime_error(
            f"sözlük anahtarı dizgi ya da sayı olmalı, {type_name(key)} verildi", pos
        )


def list_index(seq: list[object] | str, index: object, pos: Pos | None) -> int:
    if isinstance(index, bool) or not isinstance(index, int):
        raise runtime_error(f"dizin tamsayı olmalı, {type_name(index)} verildi", pos)
    real = index + len(seq) if index < 0 else index
    if not 0 <= real < len(seq):
        raise runtime_error(
            f"dizin sınır dışı: {index} (uzunluk {len(seq)})",
            pos,
            "Dizinler 0'dan başlar; son öğe için -1 kullanabilirsiniz.",
        )
    return real


def index_get(target: object, index: object, pos: Pos | None) -> object:
    if isinstance(target, (list, str)):
        return target[list_index(target, index, pos)]
    if isinstance(target, dict):
        check_key(index, pos)
        if index not in target:
            shown = repr(index) if isinstance(index, str) else str(index)
            raise runtime_error(
                f"sözlükte {shown} anahtarı yok",
                pos,
                "Önce `içerir(sözlük, anahtar)` ile denetleyin.",
            )
        return target[index]
    raise runtime_error(f"{type_name(target)} türü dizinlenemez", pos)


def index_set(target: object, index: object, value: object, pos: Pos | None) -> None:
    if isinstance(target, list):
        target[list_index(target, index, pos)] = value
        return
    if isinstance(target, dict):
        check_key(index, pos)
        if index not in target:
            check_size(len(target) + 1, pos)
        target[index] = value
        return
    if isinstance(target, str):
        raise runtime_error("dizgiler değiştirilemez", pos, 'Yeni bir dizgi kurun: s = s + "x"')
    raise runtime_error(f"{type_name(target)} türüne dizinle atama yapılamaz", pos)


def iterate(v: object, pos: Pos | None) -> list[object]:
    """`için` döngüsünün dolaşacağı öğeler; döngü başında alınmış bir kopyadır."""
    if isinstance(v, list):
        return list(v)
    if isinstance(v, str):
        return list(v)
    if isinstance(v, dict):
        return list(v.keys())
    raise runtime_error(
        f"{type_name(v)} üzerinde dolaşılamaz",
        pos,
        "Sayı aralığı için `aralık(n)` kullanın: için i içinde aralık(10) { … }",
    )


# --- iki arka ucun ortak hata iletileri (yorumlayıcı ve sanal makine aynı metni üretsin) ---


def not_callable(fn: object, pos: Pos | None) -> Exception:
    return runtime_error(f"{type_name(fn)} türü çağrılamaz", pos, "Yalnız işlevler çağrılır.")


def arity_error(name: str, expected: int, got: int, pos: Pos | None) -> Exception:
    return runtime_error(
        f"'{name}' işlevi {expected} bağımsız değişken bekliyor, {got} verildi", pos
    )


def depth_error(max_depth: int, pos: Pos | None) -> Exception:
    return limit_error(
        f"özyineleme çok derin (en fazla {max_depth} iç içe çağrı)",
        pos,
        "Özyinelemenin bir durma koşulu olduğundan emin olun.",
    )


def steps_error(max_steps: int, pos: Pos | None) -> Exception:
    return limit_error(
        f"adım sınırı aşıldı ({max_steps} adım)",
        pos,
        "Sonsuz bir döngü olabilir; döngü koşulunu denetleyin.",
    )


def undefined_global(name: str, pos: Pos | None) -> Exception:
    return runtime_error(
        f"'{name}' tanımlanmadan önce kullanıldı",
        pos,
        "Tanımı (`değişken …` ya da `işlev …`) kullanımından önceye taşıyın.",
    )
