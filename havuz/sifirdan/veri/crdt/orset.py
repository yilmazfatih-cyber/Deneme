"""OR-Set (gözlenen-kaldır küme, "ekleme kazanır"): eşzamanlı ekleme ve silmede öğe KALIR.

Her ekleme benzersiz bir etiket (kopya, sayaç) üretir. Silme, o anda GÖRDÜĞÜ etiketleri öldürür;
görmediği (eşzamanlı) bir eklemenin etiketi canlı kalır → öğe kümede kalır. Öğe, en az bir canlı
etiketi varsa kümededir.

Durum: eklenen etiketler + ölü etiketler (ikisi de yalnız büyür; birleşim = birleşim kümesi).
İşlem: ("add", öğe, etiket) ve ("remove", öğe, [görülen etiketler]); silme, gördüğü eklemelerden
sonra teslim edilmelidir (nedensel teslim: causal.Replica).

Genişletme: ölü etiketler sonsuza dek birikir. Sürüm vektörlü "nedensel bağlam" ile (Almeida ve
ark., delta-CRDT) ölü etiket tutmadan silme yapılabilir.
"""

from __future__ import annotations

from .clock import Json, as_json

Op = tuple[object, ...]
Tag = tuple[str, int]


def _as_tag(value: object) -> Tag:
    if isinstance(value, tuple | list) and len(value) == 2:
        replica, counter = value
        if isinstance(replica, str) and isinstance(counter, int):
            return (replica, counter)
    raise ValueError(f"Geçersiz etiket: {value!r}")


class ORSet:
    def __init__(self, replica: str) -> None:
        self.replica = replica
        self.counter = 0
        self.adds: dict[Json, set[Tag]] = {}
        self.removed: set[Tag] = set()

    def add(self, element: Json) -> Op:
        self.counter += 1
        op: Op = ("add", element, (self.replica, self.counter))
        self.apply(op)
        return op

    def remove(self, element: Json) -> Op:
        """Yalnız bu kopyanın şu an GÖRDÜĞÜ eklemeleri öldürür."""
        seen = sorted(self.adds.get(element, set()) - self.removed)
        op: Op = ("remove", element, seen)
        self.apply(op)
        return op

    def apply(self, op: Op) -> None:
        kind, element, payload = op
        element = as_json(element)
        if kind == "add":
            self.adds.setdefault(element, set()).add(_as_tag(payload))
        elif kind == "remove" and isinstance(payload, list | tuple):
            self.removed |= {_as_tag(tag) for tag in payload}
        else:
            raise ValueError(f"Geçersiz OR-Set işlemi: {op!r}")

    def merge(self, other: ORSet) -> None:
        for element, tags in other.adds.items():
            self.adds.setdefault(element, set()).update(tags)
        self.removed |= other.removed
        own = [counter for replica, counter in self._all_tags() if replica == self.replica]
        self.counter = max([self.counter, *own])

    def _all_tags(self) -> set[Tag]:
        return {tag for tags in self.adds.values() for tag in tags}

    def __contains__(self, element: Json) -> bool:
        return bool(self.adds.get(element, set()) - self.removed)

    def value(self) -> set[Json]:
        return {element for element in self.adds if element in self}

    def state(self) -> object:
        adds = sorted((repr(e), sorted(tags)) for e, tags in self.adds.items())
        return (adds, sorted(self.removed))
