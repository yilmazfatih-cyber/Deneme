"""Küçük, katı bir YAML okuyucu ve yazıcı (yalnız katalog biçimi için; PyYAML bağımlılığı
gerekmesin).

Desteklenen biçim (bunun dışı açık bir hatayla reddedilir):
    # yorum
    anahtar: değer
    liste_anahtari:
      - alan: değer
        diger_alan: [a, b, "c d"]
Değerler: düz metin, "çift tırnaklı" (\\" ve \\\\ kaçışlarıyla), 'tek tırnaklı' ('' kaçışıyla),
tam sayı, true/false, null ve tek satırlık akış listesi [a, b]. İçinde ": " ya da " #" geçen
metni tırnak içine alın. Testler bu okuyucuyu gerçek katalog üzerinde PyYAML ile karşılaştırır.
Genişletme: yeni bir YAML özelliği gerekirse önce kataloğun gerçekten ona ihtiyacı olduğundan
emin olun; eklerseniz ``tests/test_katalog.py``ye PyYAML karşılaştırmalı örnek yazın.
"""

from __future__ import annotations

import re
from typing import Any

from verihavuzu.text import lower_tr

_KEY = re.compile(r"([a-z_][a-z0-9_]*):(?:\s+(.*))?$")
_INT = re.compile(r"-?\d+")
# Tırnaksız yazılabilen değer: harf ya da _ ile başlar; harf, rakam, _ - . / < > + içerir.
_PLAIN_SAFE = re.compile(r"[^\W\d][\w\-./<>+]*")
# YAML 1.1 okuyucularının (PyYAML) mantıksal ya da boş sandığı sözcükler: tırnak gerekir.
_RESERVED = {"y", "n", "yes", "no", "on", "off", "true", "false", "null", "~"}


class YamlError(ValueError):
    def __init__(self, line: int, message: str) -> None:
        super().__init__(f"YAML {line}. satır: {message}")


def _strip_comment(text: str) -> str:
    quote: str | None = None
    escaped = False
    for index, ch in enumerate(text):
        if quote:
            if escaped:
                escaped = False
            elif ch == "\\" and quote == '"':
                escaped = True
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (index == 0 or text[index - 1] == " "):
            return text[:index].rstrip()
    return text.rstrip()


def _split_flow(body: str, line: int) -> list[str]:
    items, current, quote, escaped = [], "", None, False
    for ch in body:
        if quote:
            current += ch
            if escaped:
                escaped = False
            elif ch == "\\" and quote == '"':
                escaped = True
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            current += ch
        elif ch == ",":
            items.append(current.strip())
            current = ""
        else:
            current += ch
    if quote:
        raise YamlError(line, "kapanmamış tırnak")
    if current.strip():
        items.append(current.strip())
    return items


def parse_scalar(text: str, line: int = 0) -> Any:
    value = text.strip()
    if value.startswith("["):
        if not value.endswith("]"):
            raise YamlError(line, "akış listesi ']' ile bitmeli")
        return [parse_scalar(item, line) for item in _split_flow(value[1:-1], line)]
    if value.startswith('"'):
        if len(value) < 2 or not value.endswith('"'):
            raise YamlError(line, "çift tırnak kapanmamış")
        inner = value[1:-1]
        return re.sub(r'\\(["\\])', r"\1", inner)
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            raise YamlError(line, "tek tırnak kapanmamış")
        return value[1:-1].replace("''", "'")
    if value in ("", "null", "~"):
        return None
    if value in ("true", "false"):
        return value == "true"
    if _INT.fullmatch(value):
        return int(value)
    if not _PLAIN_SAFE.fullmatch(value) or lower_tr(value) in _RESERVED:
        # Başka okuyucular bu değeri sayı, tarih ya da mantıksal sanabilir: belirsizlik olmasın.
        raise YamlError(line, f"bu değeri tırnak içine alın: {value!r}")
    return value


def loads(text: str) -> dict[str, Any]:
    """Metni sözlüğe çevirir."""
    result: dict[str, Any] = {}
    current_list: list[dict[str, Any]] | None = None
    item: dict[str, Any] | None = None
    item_indent = -1
    for number, raw in enumerate(text.splitlines(), start=1):
        if "\t" in raw[: len(raw) - len(raw.lstrip())]:
            raise YamlError(number, "girintide sekme (tab) kullanmayın; boşluk kullanın")
        line = _strip_comment(raw)
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        content = line.strip()
        if indent == 0:
            match = _KEY.fullmatch(content)
            if not match:
                raise YamlError(number, f"üst düzeyde 'anahtar: değer' bekleniyordu: {content!r}")
            key, value = match.group(1), match.group(2)
            if value is None:
                current_list, item = [], None
                result[key] = current_list
            else:
                current_list, item = None, None
                result[key] = parse_scalar(value, number)
            continue
        if current_list is None:
            raise YamlError(number, "girintili satır bir liste anahtarının altında olmalı")
        if content.startswith("- "):
            item, item_indent = {}, indent + 2
            current_list.append(item)
            content, indent = content[2:].strip(), item_indent
        if item is None or indent != item_indent:
            raise YamlError(
                number, "girinti hizası tutarsız (liste öğesinin alanları hizalı olmalı)"
            )
        match = _KEY.fullmatch(content)
        if not match:
            raise YamlError(number, f"'alan: değer' bekleniyordu: {content!r}")
        if match.group(1) in item:
            raise YamlError(number, f"aynı alan iki kez yazılmış: {match.group(1)}")
        item[match.group(1)] = parse_scalar(match.group(2) or "", number)
    return result


def _dump_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(_dump_scalar(item) for item in value) + "]"
    text = str(value)
    if any(ord(ch) < 32 or ch in "\x7f\x85\u2028\u2029" for ch in text):
        raise ValueError(
            f"Katalog metni tek satır olmalı ve denetim karakteri içermemeli: {text!r}"
        )
    if _PLAIN_SAFE.fullmatch(text) and lower_tr(text) not in _RESERVED:
        return text
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def dumps_list(key: str, items: list[dict[str, Any]], header: str = "") -> str:
    """Tek bir liste anahtarlı belgeyi bu okuyucunun okuyabileceği biçimde yazar."""
    lines = [f"# {line}" if line else "#" for line in header.splitlines()]
    lines.append(f"{key}:")
    for item in items:
        for index, (field, value) in enumerate(item.items()):
            prefix = "  - " if index == 0 else "    "
            lines.append(f"{prefix}{field}: {_dump_scalar(value)}")
    return "\n".join(lines) + "\n"
