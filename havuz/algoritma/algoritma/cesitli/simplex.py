"""Simplex (küçük doğrusal programlar, KESİN): A·x ≤ b, x ≥ 0 altında c·x'i en büyükler.

Fikir:
    Uygun bölge bir çokyüzlüdür; doğrusal amacın en iyisi bir köşededir. Simplex köşeden komşu
    köşeye, amacı artıran yönde yürür. Gevşek biçimde (Σ a_ij x_j + s_i = b_i) temel değişkenler
    temel olmayanlar cinsinden yazılır; pivot, amaç katsayısı pozitif bir değişkeni (giren)
    artırır, en küçük oran testindeki kısıtın temel değişkeni (çıkan) sıfıra iner.
    Bland kuralı (hep en küçük dizin) döngüye girmeyi önler. b'de negatif varsa yardımcı x0 ile
    "1. evre" çözülür: en iyi değer 0 değilse UYGUNSUZ; giren değişkeni hiçbir kısıt
    durdurmuyorsa SINIRSIZ. Aritmetik `fractions.Fraction` ile kesindir.

Karmaşıklık: en kötü üstel (Klee-Minty), pratikte pivot sayısı ~ O(m + n); her pivot O(m · n)
    kesirli işlem; yer O(m · n)
Ne zaman: küçük doğrusal programlar (karışım, üretim planı, diyet problemi), kesin sonuç ve
    açıklanabilir adımlar gerektiğinde; başka dile taşınacak başvuru gerçeklemesi.
Ne zaman değil: yüzlerce değişkenden büyük problemler için `scipy.optimize.linprog` (HiGHS) ya da
    bir LP çözücü; tam sayı değişkenler gerekiyorsa (ILP) dal-sınır + LP.
Bağımlılık: yok
Genişletme: "≥" kısıtını −1 ile çarpıp "≤" yapın; eşitlik = iki eşitsizlik; en küçükleme =
    −c'yi en büyükleme.

Örnek:
    >>> # masa: 3 saat marangoz + 1 saat boya, kâr 50; sandalye: 1 + 2 saat, kâr 40
    >>> # marangozun 12, boyacının 10 saati var (kesirli adet: LP gevşetmesi)
    >>> status, value, x = simplex([[3, 1], [1, 2]], [12, 10], [50, 40])
    >>> status, value, x
    ('optimal', Fraction(284, 1), [Fraction(14, 5), Fraction(18, 5)])
"""

from __future__ import annotations

from collections.abc import Sequence
from fractions import Fraction

Number = int | Fraction


class _SlackForm:
    """x_i = b_i − Σ_j A[i][j]·x_j (i ∈ B, j ∈ N); amaç z = v + Σ_j c[j]·x_j."""

    def __init__(self) -> None:
        self.nonbasic: set[int] = set()
        self.basic: set[int] = set()
        self.a: dict[int, dict[int, Fraction]] = {}
        self.b: dict[int, Fraction] = {}
        self.c: dict[int, Fraction] = {}
        self.v = Fraction(0)

    def pivot(self, leave: int, enter: int) -> None:
        a, b, c = self.a, self.b, self.c
        row = a[leave]
        factor = row[enter]
        zero = Fraction(0)
        new_row = {j: row.get(j, zero) / factor for j in self.nonbasic if j != enter}
        new_row[leave] = 1 / factor
        b[enter] = b.pop(leave) / factor
        for i in self.basic - {leave}:
            coefficient = a[i].pop(enter, zero)
            b[i] -= coefficient * b[enter]
            for j, value in new_row.items():
                a[i][j] = a[i].get(j, Fraction(0)) - coefficient * value
            a[i][leave] = -coefficient * new_row[leave]
        del a[leave]
        a[enter] = new_row
        gain = c.pop(enter, zero)
        self.v += gain * b[enter]
        for j, value in new_row.items():
            c[j] = c.get(j, Fraction(0)) - gain * value
        self.nonbasic = self.nonbasic - {enter} | {leave}
        self.basic = self.basic - {leave} | {enter}

    def optimize(self) -> bool:
        """Bland kuralıyla en iyiye kadar pivotla; sınırsızsa False."""
        while True:
            entering = [j for j in sorted(self.nonbasic) if self.c.get(j, 0) > 0]
            if not entering:
                return True
            enter = entering[0]
            best: tuple[Fraction, int] | None = None
            for i in sorted(self.basic):
                coefficient = self.a[i].get(enter, Fraction(0))
                if coefficient > 0:
                    ratio = self.b[i] / coefficient
                    if best is None or ratio < best[0]:
                        best = (ratio, i)
            if best is None:
                return False  # giren değişkeni hiçbir kısıt durdurmuyor
            self.pivot(best[1], enter)


def simplex(
    a: Sequence[Sequence[Number]], b: Sequence[Number], c: Sequence[Number]
) -> tuple[str, Fraction | None, list[Fraction] | None]:
    """(durum, en iyi değer, x). Durum: 'optimal', 'unbounded' ya da 'infeasible'."""
    m, n = len(a), len(c)
    if len(b) != m or any(len(row) != n for row in a):
        raise ValueError("A m×n, b m, c n uzunlukta olmalı")
    form = _SlackForm()
    artificial = n + m  # yardımcı değişken x0'ın dizini
    form.nonbasic = set(range(n))
    form.basic = set(range(n, n + m))
    for i in range(m):
        form.a[n + i] = {j: Fraction(a[i][j]) for j in range(n)}
        form.b[n + i] = Fraction(b[i])
    if m and min(b) < 0:  # 1. evre: en büyük −x0, A·x − x0 ≤ b
        form.nonbasic.add(artificial)
        for i in range(m):
            form.a[n + i][artificial] = Fraction(-1)
        form.c = {artificial: Fraction(-1)}
        worst = min(range(m), key=lambda i: (b[i], i))
        form.pivot(n + worst, artificial)
        form.optimize()
        if form.v != 0:
            return "infeasible", None, None
        if artificial in form.basic:  # dejenere: x0 = 0 ama temelde; dışarı pivotla
            row = form.a[artificial]
            candidates = [j for j in sorted(form.nonbasic) if row.get(j, 0) != 0]
            if candidates:
                form.pivot(artificial, candidates[0])
            else:  # satır "x0 = 0": hiçbir bilgi taşımıyor, kaldır
                form.basic.discard(artificial)
                del form.a[artificial], form.b[artificial]
        form.nonbasic.discard(artificial)
        for row in form.a.values():
            row.pop(artificial, None)
    form.c, form.v = {}, Fraction(0)  # özgün amacı temel olmayanlar cinsinden yaz
    for j in range(n):
        coefficient = Fraction(c[j])
        if j in form.nonbasic:
            form.c[j] = form.c.get(j, Fraction(0)) + coefficient
        else:
            form.v += coefficient * form.b[j]
            for k, value in form.a[j].items():
                form.c[k] = form.c.get(k, Fraction(0)) - coefficient * value
    if not form.optimize():
        return "unbounded", None, None
    x = [form.b[j] if j in form.basic else Fraction(0) for j in range(n)]
    return "optimal", form.v, x
