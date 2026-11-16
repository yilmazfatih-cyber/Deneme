"""raft: Raft uzlaşması + belirlenimci benzetim + üstünde çoğaltılmış anahtar-değer servisi.

Kullanım:
    from raft import Cluster
    cluster = Cluster(size=5, seed=1)
    cluster.run(1000)                                   # 1 saniye sanal zaman
    cluster.submit(("set", "şehir", "İzmir", "istemci-1", 1))
    cluster.run(500)
    cluster.machines[0].data                            # {'şehir': 'İzmir'}

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .kv import KVStateMachine
from .messages import Entry, Storage
from .node import CANDIDATE, FOLLOWER, LEADER, RaftNode, Timing
from .sim import Cluster, Network, SafetyViolationError

__all__ = [
    "CANDIDATE",
    "FOLLOWER",
    "LEADER",
    "Cluster",
    "Entry",
    "KVStateMachine",
    "Network",
    "RaftNode",
    "SafetyViolationError",
    "Storage",
    "Timing",
]
