"""Sayı okuma/yazma: uluslararası (`1234.5`) ve Türkçe (`1.234,5`) biçimler.

Türkçe kipte nokta BİNLİK ayırıcıdır ve yalnız üçlü gruplar arasında geçerlidir (`1.234.567`);
virgül ondalık ayırıcıdır; işlev bağımsız değişkenleri `;` ile ayrılır (Excel'in Türkçe kuralı).
"1.5" Türkçe kipte belirsiz olduğu için hata verir ve doğru yazımı önerir.
Yazarken 12 anlamlı basamak kullanılır: `0.1 + 0.2` → `0.3` (ikili kayan nokta gürültüsü gizlenir).
Genişletme: başka bir yerel biçim için `parse_number`/`format_number`'a bir `locale` dalı ekleyin.
"""

from __future__ import annotations

from .errors import CalcError


def scan_number(text: str, i: int, turkish: bool) -> tuple[float, int]:
    """`text[i]` bir rakamla (ya da ondalık ayırıcıyla) başlar; (değer, bitiş) döndürür."""
    start = i
    decimal_mark, group_mark = (",", ".") if turkish else (".", "")
    digits: list[str] = []
    while i < len(text) and ((text[i].isdigit() and text[i].isascii()) or text[i] == "_"):
        if text[i] != "_":
            digits.append(text[i])
        i += 1
    while group_mark and text[i : i + 1] == group_mark:
        group = text[i + 1 : i + 4]
        if len(group) == 3 and group.isdigit() and not text[i + 4 : i + 5].isdigit():
            digits.append(group)
            i += 4
            continue
        raise CalcError(
            "Türkçe biçimde nokta binlik ayırıcıdır (üçlü gruplar)",
            i,
            "Ondalık için virgül yazın: 1,5 — binlik için: 1.234",
        )
    if text[i : i + 1] == decimal_mark and text[i + 1 : i + 2].isdigit():
        digits.append(".")
        i += 1
        while i < len(text) and text[i].isdigit() and text[i].isascii():
            digits.append(text[i])
            i += 1
    if text[i : i + 1] in ("e", "E") and (
        text[i + 1 : i + 2].isdigit()
        or (text[i + 1 : i + 2] in "+-" and text[i + 2 : i + 3].isdigit())
    ):
        j = i + 1
        exponent = text[j] if text[j] in "+-" else ""
        j += len(exponent)
        while j < len(text) and text[j].isdigit():
            exponent += text[j]
            j += 1
        digits.append("e" + exponent)
        i = j
    literal = "".join(digits)
    if not literal or literal == ".":
        raise CalcError("sayı bekleniyordu", start)
    if len(literal) > 400:
        raise CalcError("sayı çok uzun", start)
    return float(literal), i


def format_number(value: float, turkish: bool = False) -> str:
    """12 anlamlı basamakla yazar; tam sayıları ondalıksız gösterir."""
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) < 1e15:
        text = str(int(value))
        if turkish:
            sign, body = ("-", text[1:]) if text.startswith("-") else ("", text)
            groups: list[str] = []
            while body:
                groups.insert(0, body[-3:])
                body = body[:-3]
            text = sign + ".".join(groups)
        return text
    text = f"{value:.12g}"
    if turkish:
        mantissa, _, exponent = text.partition("e")
        whole, _, frac = mantissa.partition(".")
        grouped = format_number(float(whole), True) if whole not in ("", "-0") else whole
        if whole.startswith("-") and not grouped.startswith("-"):
            grouped = "-" + grouped
        text = grouped + ("," + frac if frac else "") + ("e" + exponent if exponent else "")
    return text
