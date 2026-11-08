"""CTC kod çözme: açgözlü ve ön-ek ışın araması (top-k farklı metin)."""

from __future__ import annotations

import math
from collections import defaultdict

import numpy as np


def acgozlu(logp: np.ndarray, blank: int = 0) -> list[int]:
    """logp: (T, C). Tekrarları ve boşlukları at."""
    yol = logp.argmax(-1)
    out, onceki = [], -1
    for s in yol:
        if s != onceki and s != blank:
            out.append(int(s))
        onceki = s
    return out


def isin_arama(logp: np.ndarray, isin: int = 8, blank: int = 0, en_fazla: int = 4) -> list[tuple[list[int], float]]:
    """CTC ön-ek ışın araması. Her ön-ek için (boşlukla biten, boşluksuz biten) log-olasılık tutulur.

    Döndürür: [(indeks dizisi, log-olasılık)] — en olasıdan en aza, en fazla `en_fazla` farklı metin.
    """
    T, C = logp.shape
    NEG = -math.inf

    def lse(*xs):
        xs = [x for x in xs if x != NEG]
        if not xs:
            return NEG
        m = max(xs)
        return m + math.log(sum(math.exp(x - m) for x in xs))

    isinlar: dict[tuple[int, ...], tuple[float, float]] = {(): (0.0, NEG)}  # (p_blank, p_nonblank)
    for t in range(T):
        adim = logp[t]
        # Yalnızca makul sembolleri genişlet (hız için)
        adaylar = np.argsort(adim)[::-1][: max(isin, 6)]
        yeni: dict[tuple[int, ...], list[float]] = defaultdict(lambda: [NEG, NEG])
        for onek, (pb, pnb) in isinlar.items():
            ptop = lse(pb, pnb)
            # boşluk
            yeni[onek][0] = lse(yeni[onek][0], ptop + adim[blank])
            for c in adaylar:
                c = int(c)
                if c == blank:
                    continue
                pc = adim[c]
                if onek and onek[-1] == c:
                    # Aynı sembol tekrarı: yalnızca boşlukla ayrılmışsa yeni harf
                    yeni[onek][1] = lse(yeni[onek][1], pnb + pc)
                    yeni[onek + (c,)][1] = lse(yeni[onek + (c,)][1], pb + pc)
                else:
                    yeni[onek + (c,)][1] = lse(yeni[onek + (c,)][1], ptop + pc)
        sirali = sorted(yeni.items(), key=lambda kv: lse(*kv[1]), reverse=True)[:isin]
        isinlar = {k: (v[0], v[1]) for k, v in sirali}
    sonuc = sorted(((list(k), lse(*v)) for k, v in isinlar.items()), key=lambda x: x[1], reverse=True)
    return sonuc[:en_fazla]


def secenekler(logp: np.ndarray, alfabe, adet: int = 3, isin: int = 10) -> list[tuple[str, float]]:
    """Birbirinden farklı `adet` metin önerisi ve güven (0–1) döndürür."""
    sonuc = isin_arama(logp, isin=isin, blank=alfabe.blank, en_fazla=isin)
    gorulen, out = set(), []
    for idx, lp in sonuc:
        m = alfabe.coz(idx).strip()
        if not m or m in gorulen:
            continue
        gorulen.add(m)
        out.append((m, math.exp(lp)))
        if len(out) >= adet:
            break
    if not out:
        out.append((alfabe.coz(acgozlu(logp, alfabe.blank)), 0.0))
    toplam = sum(p for _, p in out) or 1.0
    return [(m, p / toplam) for m, p in out]
