"""Sayaçlar: G-Counter (yalnız artan) ve PN-Counter (artan + azalan).

Durum tabanlı: her kopya YALNIZ kendi hücresini artırır; birleşim hücre başına en büyüğü alır
(değişmeli, birleşmeli, yinelemesiz). Değer = hücrelerin toplamı.
İşlem tabanlı: ("inc", kopya, miktar) işlemi hücreye eklenir; tam bir kez teslim gerektirir
(causal.Replica bunu sağlar). Aynı nesne iki yolu da destekler.

Genişletme: sınırlı sayaç (bounded counter; "stok sıfırın altına inmesin") için kopyalar arası
"izin" aktarımı ekleyin; bu, saf CRDT'nin ötesinde eşgüdüm ister.
"""

from __future__ import annotations

Op = tuple[object, ...]


class GCounter:
    def __init__(self, replica: str) -> None:
        self.replica = replica
        self.counts: dict[str, int] = {}

    def increment(self, amount: int = 1) -> Op:
        if amount < 0:
            raise ValueError("G-Counter yalnız artar; azaltmak için PNCounter kullanın.")
        op: Op = ("inc", self.replica, amount)
        self.apply(op)
        return op

    def apply(self, op: Op) -> None:
        _, replica, amount = op
        if not isinstance(replica, str) or not isinstance(amount, int) or amount < 0:
            raise ValueError(f"Geçersiz sayaç işlemi: {op!r}")
        self.counts[replica] = self.counts.get(replica, 0) + amount

    def merge(self, other: GCounter) -> None:
        for replica, count in other.counts.items():
            self.counts[replica] = max(self.counts.get(replica, 0), count)

    def value(self) -> int:
        return sum(self.counts.values())

    def state(self) -> object:
        return sorted(self.counts.items())


class PNCounter:
    """İki G-Counter: artışlar (P) ve azalışlar (N). Değer = P - N."""

    def __init__(self, replica: str) -> None:
        self.replica = replica
        self.positive = GCounter(replica)
        self.negative = GCounter(replica)

    def increment(self, amount: int = 1) -> Op:
        op: Op = ("inc" if amount >= 0 else "dec", self.replica, abs(amount))
        self.apply(op)
        return op

    def decrement(self, amount: int = 1) -> Op:
        return self.increment(-amount)

    def apply(self, op: Op) -> None:
        target = self.positive if op[0] == "inc" else self.negative
        target.apply(("inc", op[1], op[2]))

    def merge(self, other: PNCounter) -> None:
        self.positive.merge(other.positive)
        self.negative.merge(other.negative)

    def value(self) -> int:
        return self.positive.value() - self.negative.value()

    def state(self) -> object:
        return (self.positive.state(), self.negative.state())
