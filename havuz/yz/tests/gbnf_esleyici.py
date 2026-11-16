"""Test yardımcısı: GBNF dilbilgisi için küçük bir eşleyici (bağımsız ikinci gerçekleme).

`yz.yapili.gbnf` ürettiği dilbilgisini llama.cpp olmadan sınayabilmek için yazılmıştır.
Desteklediği alt küme: "sabit", [sınıf], [^sınıf], kural adı, ( ), |, ve ? * + ekleri.
Yöntem: her ifade için "bu konumdan başlayıp hangi konumlarda bitebilir" kümesi hesaplanır.
"""

from __future__ import annotations

import re
from functools import lru_cache

_BELIRTEC = re.compile(
    r'\s*(?:(?P<sabit>"(?:[^"\\]|\\.)*")|(?P<sinif>\[(?:[^\]\\]|\\.)*\])|(?P<ad>[a-z][a-z0-9-]*)'
    r"|(?P<isaret>::=|[()|?*+]))"
)
_KACIS = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    '"': '"',
    "\\": "\\",
    "]": "]",
    "[": "[",
    "-": "-",
    "^": "^",
}


def _coz(ham: str) -> str:
    def degistir(m: re.Match[str]) -> str:
        if m.group(1):
            return chr(int(m.group(1), 16))
        return _KACIS.get(m.group(2), m.group(2))

    return re.sub(r"\\(?:x([0-9A-Fa-f]{2})|(.))", degistir, ham)


def _sinif_derle(ham: str) -> tuple[bool, tuple[tuple[str, str], ...]]:
    ic = ham[1:-1]
    olumsuz = ic.startswith("^")
    if olumsuz:
        ic = ic[1:]
    harfler = re.findall(r"\\x[0-9A-Fa-f]{2}|\\.|.", ic, flags=re.DOTALL)
    araliklar: list[tuple[str, str]] = []
    i = 0
    while i < len(harfler):
        bas = _coz(harfler[i])
        if i + 2 < len(harfler) and harfler[i + 1] == "-":
            araliklar.append((bas, _coz(harfler[i + 2])))
            i += 3
        else:
            araliklar.append((bas, bas))
            i += 1
    return olumsuz, tuple(araliklar)


class Dilbilgisi:
    """GBNF metnini ayrıştırır; `eslesir(metin)` tam eşleşmeyi sınar."""

    def __init__(self, gbnf: str) -> None:
        self.kurallar: dict[str, object] = {}
        for satir in gbnf.strip().splitlines():
            if not satir.strip() or satir.lstrip().startswith("#"):
                continue
            ad, _, govde = satir.partition("::=")
            belirtecler = [
                f"{m.lastgroup}:{m.group(m.lastgroup or 0)}" for m in _BELIRTEC.finditer(govde)
            ]
            self._b, self._i = belirtecler, 0
            self.kurallar[ad.strip()] = self._secenekler()
            assert self._i == len(self._b), f"ayrıştırılamayan kural: {satir}"
        self._bitisler = lru_cache(maxsize=None)(self._bitisler_hesapla)

    # --- dilbilgisi ifadesini ağaca çevir
    def _bak(self) -> str | None:
        return self._b[self._i] if self._i < len(self._b) else None

    def _secenekler(self) -> object:
        secenekler = [self._dizi()]
        while self._bak() == "isaret:|":
            self._i += 1
            secenekler.append(self._dizi())
        return ("secenek", tuple(secenekler))

    def _dizi(self) -> object:
        ogeler = []
        while self._bak() is not None and self._bak() not in ("isaret:|", "isaret:)"):
            ogeler.append(self._ekli())
        return ("dizi", tuple(ogeler))

    def _ekli(self) -> object:
        b = self._b[self._i]
        self._i += 1
        tur, _, deger = b.partition(":")
        if b == "isaret:(":
            dugum = self._secenekler()
            assert self._bak() == "isaret:)"
            self._i += 1
        elif tur == "sabit":
            dugum = ("sabit", _coz(deger[1:-1]))
        elif tur == "sinif":
            dugum = ("sinif", *_sinif_derle(deger))
        else:
            dugum = ("kural", deger)
        while self._bak() in ("isaret:?", "isaret:*", "isaret:+"):
            dugum = ("ek", self._b[self._i][-1], dugum)
            self._i += 1
        return dugum

    # --- eşleştirme
    def eslesir(self, metin: str) -> bool:
        self._metin = metin
        self._bitisler.cache_clear()
        return len(metin) in self._bitisler(self.kurallar["root"], 0)

    def _bitisler_hesapla(self, dugum: tuple, konum: int) -> frozenset[int]:  # type: ignore[type-arg]
        tur = dugum[0]
        m = self._metin
        if tur == "sabit":
            return (
                frozenset({konum + len(dugum[1])}) if m.startswith(dugum[1], konum) else frozenset()
            )
        if tur == "sinif":
            if konum >= len(m):
                return frozenset()
            icinde = any(a <= m[konum] <= b for a, b in dugum[2])
            return frozenset({konum + 1}) if icinde != dugum[1] else frozenset()
        if tur == "kural":
            return self._bitisler(self.kurallar[dugum[1]], konum)
        if tur == "secenek":
            return frozenset().union(*(self._bitisler(s, konum) for s in dugum[1]))
        if tur == "dizi":
            konumlar = frozenset({konum})
            for oge in dugum[1]:
                konumlar = frozenset().union(*(self._bitisler(oge, k) for k in konumlar))
                if not konumlar:
                    break
            return konumlar
        ek, ic = dugum[1], dugum[2]
        if ek == "?":
            return frozenset({konum}) | self._bitisler(ic, konum)
        ulasilan: set[int] = set() if ek == "+" else {konum}
        sinir = set(self._bitisler(ic, konum))
        while sinir:
            k = sinir.pop()
            if k not in ulasilan:
                ulasilan.add(k)
                sinir |= {s for s in self._bitisler(ic, k) if s > k}
        return frozenset(ulasilan)
