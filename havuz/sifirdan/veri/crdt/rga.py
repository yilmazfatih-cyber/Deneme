"""RGA (Replicated Growable Array): ortak metin düzenleme için sıra CRDT'si.

Her karakter benzersiz bir kimlik (Lamport sayacı, kopya) ve "kimden SONRA eklendim" bilgisi (ref)
taşır. Silinen karakter yerinde kalır (mezar taşı): başka karakterler ona başvurabilir.
Sıra, karakterleri ağaç gibi dizerek bulunur: her düğümün çocukları (aynı ref'ten sonra eklenenler)
kimliğe göre BÜYÜKTEN küçüğe sıralanır, ağaç önce-kök (pre-order) gezilir:

    ref=BAŞ: "H"(1,a)  ── sonra "i"(2,a)                    metin: "Hi"
    eşzamanlı: a, "H"den sonra "!"(3,a); b, "H"den sonra "?"(3,b)
    "H"nin çocukları: (3,b) > (3,a) > (2,a)  →  "H?!i"     (her kopyada aynı)

Birleşim = düğüm kümelerinin birleşimi + mezar taşlarının birleşimi; sıra her kopyada aynı kuralla
hesaplandığı için durum ve işlem tabanlı yollar aynı metne varır. Ekleme işlemi, ref'i bilinen
kopyaya teslim edilmelidir (nedensel teslim: causal.Replica).

Genişletme: büyük belgelerde her işlemde ağacı yeniden dizmek pahalıdır; sırayı bir dizi olarak
tutup yalnız ekleme noktasını bulun ("ref'ten sonra, kimliği benden büyükleri atla" kuralı) ve
dizin için bir ağaç (rope) kullanın. Karakter yerine sözcük/parça saklamak da belleği azaltır.
"""

from __future__ import annotations

from .clock import LamportClock, Timestamp, as_timestamp

Op = tuple[object, ...]
HEAD: Timestamp = (0, "")


class RGA:
    def __init__(self, replica: str) -> None:
        self.clock = LamportClock(replica)
        self.nodes: dict[Timestamp, tuple[Timestamp, str]] = {}  # kimlik → (ref, karakter)
        self.deleted: set[Timestamp] = set()

    # ── Sıra ────────────────────────────────────────────────────────────────────────────────────

    def _ordered_ids(self) -> list[Timestamp]:
        children: dict[Timestamp, list[Timestamp]] = {}
        for node_id, (ref, _) in self.nodes.items():
            children.setdefault(ref, []).append(node_id)
        order: list[Timestamp] = []
        stack = sorted(children.get(HEAD, []))  # küçük en altta: büyük kimlik önce çıkar
        while stack:
            node_id = stack.pop()
            order.append(node_id)
            stack.extend(sorted(children.get(node_id, [])))
        return order

    def _visible_ids(self) -> list[Timestamp]:
        return [node_id for node_id in self._ordered_ids() if node_id not in self.deleted]

    def text(self) -> str:
        return "".join(self.nodes[node_id][1] for node_id in self._visible_ids())

    def value(self) -> str:
        return self.text()

    # ── Yerel düzenleme ─────────────────────────────────────────────────────────────────────────

    def insert(self, index: int, char: str) -> Op:
        """Görünen metinde `index` konumuna tek karakter ekler (0 = başa)."""
        if len(char) != 1:
            raise ValueError("RGA karakter karakter ekler; metin için insert_text kullanın.")
        visible = self._visible_ids()
        if not 0 <= index <= len(visible):
            raise IndexError(f"Konum 0 ile {len(visible)} arasında olmalı.")
        ref = HEAD if index == 0 else visible[index - 1]
        op: Op = ("ins", self.clock.tick(), ref, char)
        self.apply(op)
        return op

    def insert_text(self, index: int, text: str) -> list[Op]:
        return [self.insert(index + offset, char) for offset, char in enumerate(text)]

    def delete(self, index: int) -> Op:
        visible = self._visible_ids()
        if not 0 <= index < len(visible):
            raise IndexError(f"Konum 0 ile {len(visible) - 1} arasında olmalı.")
        op: Op = ("del", visible[index])
        self.apply(op)
        return op

    # ── İşlem ve durum birleşimi ────────────────────────────────────────────────────────────────

    def apply(self, op: Op) -> None:
        """Yinelemesiz: aynı işlemi iki kez uygulamak bir kez uygulamakla aynıdır."""
        if op[0] == "ins":
            _, node_id, ref, char = op
            node, parent = as_timestamp(node_id), as_timestamp(ref)
            if parent != HEAD and parent not in self.nodes:
                raise ValueError(
                    "Ekleme, başvurduğu karakterden önce geldi: nedensel teslim gerekir."
                )
            if not isinstance(char, str) or len(char) != 1:
                raise ValueError(f"Geçersiz karakter: {char!r}")
            self.nodes.setdefault(node, (parent, char))
            self.clock.observe(node)
        elif op[0] == "del":
            self.deleted.add(as_timestamp(op[1]))
        else:
            raise ValueError(f"Bilinmeyen RGA işlemi: {op[0]!r}")

    def merge(self, other: RGA) -> None:
        for node_id, entry in other.nodes.items():
            self.nodes.setdefault(node_id, entry)
            self.clock.observe(node_id)
        self.deleted |= other.deleted

    def state(self) -> object:
        return (sorted(self.nodes.items()), sorted(self.deleted))
