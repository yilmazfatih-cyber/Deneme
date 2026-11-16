"""crdt: çakışmasız çoğaltılan veri türleri (durum ve işlem tabanlı) + nedensel teslim katmanı.

Kullanım:
    from crdt import PNCounter, ORSet, RGA, Replica
    a, b = RGA("a"), RGA("b")
    a.insert_text(0, "Selam")
    b.merge(a)                       # durum tabanlı: tüm durumu birleştir
    # işlem tabanlı: mesaj = Replica("a", a).record(a.insert(5, "!")); öteki kopya .receive(mesaj)

Genişletme: yeni tür → `merge`, `apply`, `value`, `state` yöntemli bir sınıf + tests/crdt/'de
yasalar ve yakınsama testine bir satır (bkz. tests/crdt/kinds.py).
"""

from .causal import Message, Replica
from .clock import LamportClock
from .counters import GCounter, PNCounter
from .orset import ORSet
from .registers import LWWMap, LWWRegister
from .rga import RGA

__all__ = [
    "RGA",
    "GCounter",
    "LWWMap",
    "LWWRegister",
    "LamportClock",
    "Message",
    "ORSet",
    "PNCounter",
    "Replica",
]
