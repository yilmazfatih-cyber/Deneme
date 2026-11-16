"""Ön-bölme için Unicode sınıf tablolarını üretir (harf, sayı, boşluk).

Kaynak, Hugging Face `tokenizers` kütüphanesinin ByteLevel ön-bölücüsüdür: her kod noktası
denenerek hangi sınıfa girdiği bulunur. Böylece Python (`dil_modeli/unicode_classes.py`) ve
tarayıcı (`tarayici/unicode_classes.js`) tarafı, çalıştıkları ortamın Unicode sürümünden
bağımsız olarak HF ile aynı bölmeyi yapar.

Çalıştırma (yalnız `tokenizers` güncellenip tablolar değişirse gerekir):
    python scripts/unicode_tablolari.py
Sonra: python scripts/check.py ve node --test tarayici/

Genişletme: Tablo biçimini değiştirirseniz `dil_modeli/bytelevel.py` ve
`tarayici/tokenizer.js` içindeki okuyucuları da değiştirin.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY_OUT = ROOT / "dil_modeli" / "unicode_classes.py"
JS_OUT = ROOT / "tarayici" / "unicode_classes.js"


def classify_all() -> dict[str, list[int]]:
    """Her kod noktasını `tokenizers` ile sınıflandırır: L (harf), N (sayı), S (boşluk)."""
    from tokenizers import pre_tokenizers

    split = pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=True).pre_tokenize_str
    classes: dict[str, list[int]] = {"L": [], "N": [], "S": []}
    for code in range(0x110000):
        if 0xD800 <= code <= 0xDFFF:
            continue  # vekil kod noktaları metinde tek başına bulunamaz
        char = chr(code)
        if len(split("a" + char)) == 1:  # "a" ile aynı \p{L}+ parçasında
            classes["L"].append(code)
        elif len(split("1" + char)) == 1:  # "1" ile aynı \p{N}+ parçasında
            classes["N"].append(code)
        elif len(split("!" + char)) != 1:  # ne harf, ne sayı, ne "öteki": boşluk (\s)
            classes["S"].append(code)
    return classes


def to_ranges(codes: list[int]) -> str:
    """[65, 66, 67, 97] -> "0041-0043 0061" biçiminde aralık metni."""
    parts: list[str] = []
    start = previous = codes[0]
    for code in [*codes[1:], -1]:
        if code == previous + 1:
            previous = code
            continue
        parts.append(f"{start:04X}" if start == previous else f"{start:04X}-{previous:04X}")
        start = previous = code
    return " ".join(parts)


def main() -> None:
    import tokenizers

    tables = {name: to_ranges(codes) for name, codes in classify_all().items()}
    names = {"L": "LETTER", "N": "NUMBER", "S": "WHITESPACE"}
    source = f"Hugging Face tokenizers {tokenizers.__version__}"

    py_lines = [
        '"""Ön-bölme için Unicode sınıf tabloları — OTOMATİK ÜRETİLDİ, elle değiştirmeyin.',
        "",
        f"Üreten: scripts/unicode_tablolari.py (kaynak: {source}).",
        "Aynı tablolar tarayici/unicode_classes.js içindedir; test_unicode_classes.py denetler.",
        "Biçim: boşlukla ayrılmış onaltılık kod noktası ya da aralık (ör. '0041-005A 00AA').",
        '"""',
        "",
        f'SOURCE = "{source}"',
    ]
    js_lines = [
        "// Ön-bölme için Unicode sınıf tabloları — OTOMATİK ÜRETİLDİ, elle değiştirmeyin.",
        f"// Üreten: scripts/unicode_tablolari.py (kaynak: {source}).",
        "// Python karşılığı: dil_modeli/unicode_classes.py (test_unicode_classes.py denetler).",
        "",
        f"export const SOURCE = '{source}'",
    ]
    for key, name in names.items():
        chunks = textwrap.wrap(tables[key], width=88)
        py_lines += ["", f"{name} = (", *[f'    "{chunk} "' for chunk in chunks], ")"]
        one_line = f"export const {name} = ['{chunks[0]}'].join(' ')"
        if len(chunks) == 1 and len(one_line) <= 120:  # Prettier'ın yazacağı biçim
            js_lines += ["", one_line]
        else:
            js_lines += [
                "",
                f"export const {name} = [",
                *[f"  '{chunk}'," for chunk in chunks],
                "].join(' ')",
            ]
    PY_OUT.write_text("\n".join(py_lines) + "\n", encoding="utf-8")
    JS_OUT.parent.mkdir(parents=True, exist_ok=True)
    JS_OUT.write_text("\n".join(js_lines) + "\n", encoding="utf-8")
    counts = ", ".join(f"{names[k]}: {len(v.split())} aralık" for k, v in tables.items())
    print(f"Yazıldı: {PY_OUT.name}, {JS_OUT.name} ({counts})")


if __name__ == "__main__":
    main()
