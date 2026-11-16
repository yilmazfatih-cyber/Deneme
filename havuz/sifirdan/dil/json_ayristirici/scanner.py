"""Ortak sözcük taraması: dizgi, sayı, sabit (true/false/null) ve ortak hata iletileri.

Hem özyinelemeli ayrıştırıcı (parser.py) hem akış ayrıştırıcısı (stream.py) bu işlevleri kullanır;
böylece iki ayrıştırıcı aynı girdide AYNI hatayı aynı konumda verir (testle korunur).
`final=False` iken tampon sonuna gelinirse `Incomplete` fırlatılır: akış ayrıştırıcısı bir sonraki
parçayı bekler. Hatalar tampona göre konumlu `ScanError` olarak fırlatılır; çağıran onu
satır/sütuna çevirir.
Genişletme: yeni bir ipucu için `unexpected_value` içine bir dal ekleyin.
"""

from __future__ import annotations

WHITESPACE = " \t\n\r"
SIMPLE_ESCAPES = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
}
HEX = "0123456789abcdefABCDEF"
LITERALS: tuple[tuple[str, object], ...] = (("true", True), ("false", False), ("null", None))


class Incomplete(Exception):
    """Belirteç tamponun sonunda yarım kaldı; daha fazla veri gerekiyor."""


class ScanError(Exception):
    def __init__(self, index: int, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.index = index
        self.message = message
        self.hint = hint


def shown(c: str) -> str:
    if c == "":
        return "metin sonu"
    if ord(c) < 0x20:
        return f"denetim karakteri U+{ord(c):04X}"
    return f"'{c}'"


def scan_string(text: str, start: int, final: bool, allow_lone_surrogates: bool) -> tuple[str, int]:
    """`text[start]` açılış tırnağıdır; (değer, kapanıştan sonraki konum) döndürür."""
    out: list[str] = []
    i = start + 1
    n = len(text)
    while True:
        if i >= n:
            if not final:
                raise Incomplete
            raise ScanError(start, "dizgi kapanmadı", 'Dizginin sonuna `"` ekleyin.')
        c = text[i]
        if c == '"':
            return "".join(out), i + 1
        if c == "\\":
            if i + 1 >= n:
                if not final:
                    raise Incomplete
                raise ScanError(i, "dizgi kapanmadı", 'Dizginin sonuna `"` ekleyin.')
            e = text[i + 1]
            if e in SIMPLE_ESCAPES:
                out.append(SIMPLE_ESCAPES[e])
                i += 2
            elif e == "u":
                ch, i = scan_unicode(text, i, final, allow_lone_surrogates)
                out.append(ch)
            else:
                raise ScanError(
                    i,
                    f"geçersiz kaçış '\\{e}'",
                    'Geçerli kaçışlar: \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX.',
                )
        elif ord(c) < 0x20:
            raise ScanError(
                i,
                f"dizgide kaçışsız denetim karakteri (U+{ord(c):04X})",
                "Satır sonu için \\n, sekme için \\t yazın.",
            )
        else:
            out.append(c)
            i += 1


def read_hex4(text: str, at: int, final: bool) -> int:
    """`text[at]` ters bölü, `text[at+1]` 'u' olmalı; dört onaltılık basamağı okur."""
    digits = text[at + 2 : at + 6]
    if len(digits) < 4 and all(d in HEX for d in digits):
        if not final:
            raise Incomplete
        raise ScanError(at, "eksik \\u kaçışı", "Biçim: \\u00e7 (dört onaltılık basamak).")
    if len(digits) < 4 or any(d not in HEX for d in digits):
        raise ScanError(at, "geçersiz \\u kaçışı", "Biçim: \\u00e7 (dört onaltılık basamak).")
    return int(digits, 16)


def scan_unicode(text: str, at: int, final: bool, allow_lone: bool) -> tuple[str, int]:
    """`\\uXXXX` (gerekirse vekil çifti `\\uD83D\\uDE00`) çözer; (karakter, sonraki konum)."""
    code = read_hex4(text, at, final)
    after = at + 6
    if 0xD800 <= code <= 0xDBFF:
        nxt = text[after : after + 2]
        if nxt == "\\u" or (not final and len(nxt) < 2 and "\\u".startswith(nxt)):
            low = read_hex4(text, after, final)
            if 0xDC00 <= low <= 0xDFFF:
                return chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)), after + 6
    if 0xD800 <= code <= 0xDFFF:
        if not allow_lone:
            raise ScanError(
                at,
                f"eşi olmayan vekil karakter (\\u{code:04x})",
                "UTF-16 vekilleri çift olarak yazılır: \\ud83d\\ude00.",
            )
    return chr(code), after


def scan_number(text: str, start: int, final: bool, max_length: int) -> tuple[int | float, int]:
    """RFC 8259 sayısı: -?(0|[1-9]\\d*)(\\.\\d+)?([eE][+-]?\\d+)?"""
    i = start
    n = len(text)

    def need_digit(where: str) -> None:
        if i >= n:
            if not final:
                raise Incomplete
            raise ScanError(i, f"{where} rakam bekleniyordu, metin bitti")
        if not ("0" <= text[i] <= "9"):
            raise ScanError(i, f"{where} rakam bekleniyordu, {shown(text[i])} bulundu")

    def digits() -> None:
        nonlocal i
        while i < n and "0" <= text[i] <= "9":
            i += 1

    if text[i] == "-":
        i += 1
    need_digit("eksi işaretinden sonra")
    if text[i] == "0":
        i += 1
        if i < n and "0" <= text[i] <= "9":
            raise ScanError(
                start, "sayı 0 ile başlayıp sürüyor", "Baştaki sıfırları silin: 07 → 7."
            )
    else:
        digits()
    is_float = False
    if i < n and text[i] == ".":
        i += 1
        need_digit("ondalık noktadan sonra")
        digits()
        is_float = True
    if i < n and text[i] in "eE":
        i += 1
        if i < n and text[i] in "+-":
            i += 1
        need_digit("üsten sonra")
        digits()
        is_float = True
    if i - start > max_length:
        raise ScanError(start, f"sayı çok uzun (en fazla {max_length} karakter)")
    if i >= n and not final:
        raise Incomplete  # sayı bir sonraki parçada sürebilir
    literal = text[start:i]
    if not is_float:
        return int(literal), i
    value = float(literal)
    if value in (float("inf"), float("-inf")):
        raise ScanError(start, f"sayı ondalık aralığın dışında: {literal}")
    return value, i


def scan_literal(text: str, start: int, final: bool) -> tuple[object, int]:
    for word, value in LITERALS:
        piece = text[start : start + len(word)]
        if piece == word:
            return value, start + len(word)
        if not final and len(piece) < len(word) and word.startswith(piece):
            raise Incomplete
    raise unexpected_value(text, start)


def unexpected_value(text: str, at: int) -> ScanError:
    """Değer beklenirken gelen karakter için yol gösteren hata."""
    if at >= len(text):
        return ScanError(at, "değer bekleniyordu, metin bitti", "Boş metin geçerli JSON değildir.")
    c = text[at]
    hint = (
        None  # ipucu yalnız ilk karaktere bakar: akışta sonraki karakterler henüz gelmemiş olabilir
    )
    if c == "N":
        hint = "JSON'da NaN ve None yoktur; boş değer için null yazın."
    elif c == "I":
        hint = "JSON'da Infinity yoktur; çok büyük sayıyı dizgi olarak yazın."
    elif c in ("T", "F"):
        hint = "JSON'da sabitler küçük harfle yazılır: true, false, null."
    elif c == "'":
        hint = 'JSON dizgileri çift tırnakla yazılır: "metin".'
    elif c == "/":
        hint = "JSON yorum (// ya da /* */) desteklemez."
    elif c in "+.":
        hint = "Sayı + ya da . ile başlayamaz: 0.5, 1 gibi yazın."
    elif c.isalpha():
        hint = 'Metin değerleri çift tırnak içinde yazılır: "metin".'
    return ScanError(at, f"değer bekleniyordu, {shown(c)} bulundu", hint)


def after_item(kind: str, c: str, at: int) -> ScanError:
    """Dizi/nesne öğesinden sonra ',' ya da kapanış beklenirken başka bir şey geldi."""
    closer = "]" if kind == "dizi" else "}"
    hint = "Öğeler arasına virgül koyun." if c and (c in '"[{-' or c.isalnum()) else None
    return ScanError(at, f"',' ya da '{closer}' bekleniyordu, {shown(c)} bulundu", hint)


def expected_key(c: str, at: int) -> ScanError:
    hint = None
    if c == "'":
        hint = 'Anahtarlar çift tırnakla yazılır: {"ad": 1}.'
    elif c.isalpha() or c == "_":
        hint = 'Anahtarı çift tırnağa alın: {"ad": 1}.'
    return ScanError(
        at, f"nesne anahtarı (çift tırnaklı dizgi) bekleniyordu, {shown(c)} bulundu", hint
    )


def expected_colon(c: str, at: int) -> ScanError:
    return ScanError(at, f"anahtardan sonra ':' bekleniyordu, {shown(c)} bulundu")


def duplicate_key(key: str, at: int) -> ScanError:
    return ScanError(
        at, f"{key!r} anahtarı iki kez geçiyor", "Her anahtar nesnede bir kez yazılmalı."
    )


def trailing_comma(closer: str, at: int) -> ScanError:
    return ScanError(
        at, f"'{closer}' öncesinde sondaki virgül", "Son öğeden sonraki virgülü silin."
    )


def unclosed(kind: str, at: int, opened: tuple[int, int]) -> ScanError:
    closer = "]" if kind == "dizi" else "}"
    where = f"satır {opened[0]}, sütun {opened[1]}"
    return ScanError(
        at, f"{kind} kapanmadı", f"{where} konumunda açılan yapı için '{closer}' ekleyin."
    )


def too_deep(max_depth: int, at: int) -> ScanError:
    return ScanError(at, f"çok derin iç içe yapı (en fazla {max_depth} düzey)")


def extra_data(at: int) -> ScanError:
    return ScanError(
        at, "değerden sonra fazladan veri", "Birden çok değer için bir dizi kullanın: [1, 2]."
    )


def bom_error() -> ScanError:
    return ScanError(
        0, "metin bir UTF-8 BOM ile başlıyor", "Baştaki BOM'u silin ya da bayt olarak okuyun."
    )


def advance_position(line: int, col: int, text: str) -> tuple[int, int]:
    """`text` okunduktan sonraki (satır, sütun); ikisi de 1'den başlar."""
    newlines = text.count("\n")
    if newlines:
        return line + newlines, len(text) - text.rfind("\n")
    return line, col + len(text)
