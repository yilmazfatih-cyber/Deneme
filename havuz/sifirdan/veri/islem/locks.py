"""Kilit yöneticisi: çok ayrıntı düzeyli kilitler (IS, IX, S, SIX, X) ve bekleme çizgesiyle
kilitlenme algılama.

Kaynaklar: bütün depo (`ROOT`) ve tek tek anahtarlar. Okuma: ROOT'ta IS + anahtarda S. Yazma:
ROOT'ta IX + anahtarda X. Aralık taraması: ROOT'ta S (yazıcıların IX'iyle çatışır → hayalet satır
olmaz).

`acquire` BEKLEMEZ: kilit uygunsa verir; değilse "kim kimi bekliyor" çizgesine kenar ekler, döngü
varsa `DeadlockError` (isteyen kurban), yoksa `WouldBlock` fırlatır. Bekleme ve yeniden deneme
çağıranın işidir (bkz. scheduler.py).

Genişletme: adil sıra (FIFO) için bekleyenleri kaynak başına bir kuyrukta tutun ve yeni isteği,
önündeki uyumsuz bekleyenler varken vermeyin; şimdiki sürüm yazıcıyı aç bırakabilir.
"""

from __future__ import annotations

from .errors import DeadlockError, WouldBlock

ROOT = "*"  # bütün depo
MODES = ("IS", "IX", "S", "SIX", "X")
_COMPATIBLE = {
    "IS": {"IS", "IX", "S", "SIX"},
    "IX": {"IS", "IX"},
    "S": {"IS", "S"},
    "SIX": {"IS"},
    "X": set(),
}
# İki kipin "en küçük üst sınırı": zaten IS tutan IX isterse IX, S tutan IX isterse SIX...
_SUPREMUM = {
    frozenset({"IS", "IX"}): "IX",
    frozenset({"IS", "S"}): "S",
    frozenset({"IS", "SIX"}): "SIX",
    frozenset({"IX", "S"}): "SIX",
    frozenset({"IX", "SIX"}): "SIX",
    frozenset({"S", "SIX"}): "SIX",
}


def supremum(held: str, wanted: str) -> str:
    if held == wanted:
        return held
    if "X" in (held, wanted):
        return "X"
    return _SUPREMUM[frozenset({held, wanted})]


def compatible(held: str, wanted: str) -> bool:
    return wanted in _COMPATIBLE[held]


class LockManager:
    def __init__(self) -> None:
        self.holders: dict[str, dict[int, str]] = {}  # kaynak → {işlem: kip}
        self.waits_for: dict[int, set[int]] = {}  # işlem → beklediği işlemler

    def acquire(self, tx: int, resource: str, mode: str) -> None:
        """Kilidi verir ya da WouldBlock / DeadlockError fırlatır."""
        holders = self.holders.setdefault(resource, {})
        current = holders.get(tx)
        wanted = mode if current is None else supremum(current, mode)
        if current == wanted:
            return
        blockers = {
            other for other, held in holders.items() if other != tx and not compatible(held, wanted)
        }
        if not blockers:
            holders[tx] = wanted
            self.waits_for.pop(tx, None)
            return
        self.waits_for[tx] = blockers
        cycle = self._cycle_from(tx)
        if cycle:
            self.waits_for.pop(tx, None)
            path = " → ".join(f"T{node}" for node in cycle)
            raise DeadlockError(f"Kilitlenme: {path}. T{tx} kurban seçildi; yeniden deneyin.")
        raise WouldBlock(f"T{tx}, '{resource}' için {sorted(blockers)} işlemlerini bekliyor.")

    def _cycle_from(self, start: int) -> list[int]:
        """`start`tan çıkıp yine ona dönen bir bekleme yolu (yoksa boş liste)."""
        stack: list[tuple[int, list[int]]] = [(start, [start])]
        seen: set[int] = set()
        while stack:
            node, path = stack.pop()
            for nxt in self.waits_for.get(node, ()):
                if nxt == start:
                    return [*path, start]
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append((nxt, [*path, nxt]))
        return []

    def release_all(self, tx: int) -> None:
        for holders in self.holders.values():
            holders.pop(tx, None)
        self.waits_for.pop(tx, None)
        for waiting in self.waits_for.values():
            waiting.discard(tx)

    def held_by(self, tx: int) -> dict[str, str]:
        return {r: h[tx] for r, h in self.holders.items() if tx in h}
