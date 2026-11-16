"""Güvenli hesap makinesi aracı: ifade AST ile çözülür; `eval` YOKTUR.

İzin verilenler: sayılar, + - * / // % **, parantez, pi ve e, şu işlevler: sqrt/karekok, abs,
round/yuvarla, min, max, log/ln, log10, exp, sin, cos, tan, floor, ceil.
Türkçe yazım: "2,5 * 4" ve "1.250,50 + 10" (harf içermeyen ifadede virgül ondalıktır), "%18"
(yüzde 18 = 0.18), "×" ve "÷" işaretleri. Sınırlar: ifade ≤ 300 karakter, ≤ 200 düğüm,
üs ≤ 100, sonuç büyüklüğü ≤ 1e100 (aşırı büyük sayıyla bellek doldurma saldırısına karşı).
Kim kullanır: ajan (hazır araç), mcp sunucusu, degerlendirme (araç kullanımı görevi).
Genişletme: yeni işlev → `_ISLEVLER` sözlüğüne ekleyin ve tests/test_arac_hazir.py'ye örnek yazın.
"""

from __future__ import annotations

import ast
import math
import operator
import re
from collections.abc import Callable
from typing import Any

from yz.arac.tanim import Arac
from yz.hatalar import GuvenlikHatasi

AZAMI_UZUNLUK = 300
AZAMI_DUGUM = 200
AZAMI_US = 100
AZAMI_BUYUKLUK = 1e100


def _us(taban: float, us: float) -> float:
    if abs(us) > AZAMI_US:
        raise GuvenlikHatasi(f"Üs çok büyük (en çok {AZAMI_US}).")
    return float(operator.pow(taban, us))


_IKILI: dict[type[ast.operator], Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: _us,
}
_TEKLI: dict[type[ast.unaryop], Callable[[Any], Any]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}
_ISLEVLER: dict[str, Callable[..., Any]] = {
    "sqrt": math.sqrt, "karekok": math.sqrt, "abs": abs, "mutlak": abs, "round": round,
    "yuvarla": round, "min": min, "max": max, "log": math.log, "ln": math.log,
    "log10": math.log10, "exp": math.exp, "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "floor": math.floor, "ceil": math.ceil,
}  # fmt: skip
_SABITLER = {"pi": math.pi, "e": math.e}
_TR_SAYI = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+")
_YUZDE = re.compile(r"%\s*(\d+(?:[.,]\d+)?)")


def _yuzde_cevir(eslesme: re.Match[str]) -> str:
    """Önünde bir sayı/kapanan parantez yoksa "%18" Türkçe yüzdedir; varsa mod işlemidir."""
    once = eslesme.string[: eslesme.start()].rstrip()
    if once and (once[-1].isalnum() or once[-1] in ")."):
        return eslesme.group()
    return f"({eslesme.group(1)}/100)"


def _turkce_yazimi_cevir(ifade: str) -> str:
    ifade = ifade.replace("×", "*").replace("÷", "/").replace("^", "**").replace("−", "-")
    ifade = _YUZDE.sub(_yuzde_cevir, ifade)  # "%18" → (18/100); "7 % 3" mod olarak kalır
    if not re.search(r"[A-Za-zÇĞİÖŞÜçğıöşü]", ifade):  # işlev yoksa virgül yalnız ondalıktır
        ifade = _TR_SAYI.sub(lambda m: m.group().replace(".", "").replace(",", "."), ifade)
    return ifade


def _coz(dugum: ast.AST) -> Any:
    if isinstance(dugum, ast.Expression):
        return _coz(dugum.body)
    if isinstance(dugum, ast.Constant) and type(dugum.value) in (int, float):
        return dugum.value
    if isinstance(dugum, ast.BinOp) and type(dugum.op) in _IKILI:
        sonuc = _IKILI[type(dugum.op)](_coz(dugum.left), _coz(dugum.right))
    elif isinstance(dugum, ast.UnaryOp) and type(dugum.op) in _TEKLI:
        sonuc = _TEKLI[type(dugum.op)](_coz(dugum.operand))
    elif isinstance(dugum, ast.Name) and dugum.id in _SABITLER:
        return _SABITLER[dugum.id]
    elif (
        isinstance(dugum, ast.Call)
        and isinstance(dugum.func, ast.Name)
        and dugum.func.id in _ISLEVLER
        and not dugum.keywords
    ):
        sonuc = _ISLEVLER[dugum.func.id](*[_coz(a) for a in dugum.args])
    else:
        raise GuvenlikHatasi(f"İzin verilmeyen ifade öğesi: {_ogeyi_adlandir(dugum)}")
    if isinstance(sonuc, int | float) and abs(sonuc) > AZAMI_BUYUKLUK:
        raise GuvenlikHatasi("Sonuç çok büyük.")
    return sonuc


def _ogeyi_adlandir(dugum: ast.AST) -> str:
    if isinstance(dugum, ast.Call) and isinstance(dugum.func, ast.Name):
        return f"{dugum.func.id}() işlevi (izinliler: {', '.join(sorted(_ISLEVLER))})"
    if isinstance(dugum, ast.Name):
        return f"`{dugum.id}` adı (yalnız pi ve e kullanılabilir)"
    if isinstance(dugum, ast.Constant):
        return f"{type(dugum.value).__name__} değeri (yalnız sayı)"
    return type(dugum).__name__


def guvenli_hesapla(ifade: str) -> float | int:
    """İfadeyi güvenle hesaplar; izin verilmeyen her şeyde `GuvenlikHatasi` ya da `ValueError`."""
    if len(ifade) > AZAMI_UZUNLUK:
        raise GuvenlikHatasi(f"İfade çok uzun (en çok {AZAMI_UZUNLUK} karakter).")
    agac = ast.parse(_turkce_yazimi_cevir(ifade).strip(), mode="eval")
    if sum(1 for _ in ast.walk(agac)) > AZAMI_DUGUM:
        raise GuvenlikHatasi("İfade çok karmaşık.")
    sonuc = _coz(agac)
    if isinstance(sonuc, bool) or not isinstance(sonuc, int | float):
        raise ValueError("İfade bir sayı vermedi.")
    return sonuc


def sayi_yaz(deger: float | int) -> str:
    """Sonucu okunur yazar: tam sayıysa ondalıksız, değilse en çok 10 anlamlı basamak."""
    if isinstance(deger, float) and deger.is_integer() and abs(deger) < 1e15:
        return str(int(deger))
    return f"{deger:.10g}"


def hesapla(ifade: str) -> str:
    """Aritmetik ifadeyi hesaplar ve sonucu verir. Hesap gerektiğinde tahmin etme, bunu kullan.

    Args:
        ifade: Hesaplanacak ifade, ör. "(1250 * 18) / 100" ya da "sqrt(2) + 3".
    """
    try:
        return sayi_yaz(guvenli_hesapla(ifade))
    except ZeroDivisionError:
        raise ValueError("sıfıra bölme") from None
    except SyntaxError:
        raise ValueError(
            f"ifade anlaşılamadı: {ifade!r}. Yalnız sayı ve + - * / ( ) kullan."
        ) from None


hesap_araci = Arac(hesapla)
