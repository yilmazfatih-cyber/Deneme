"""tutarli_karma: tutarlı karma halkası, rendezvous ve jump hash; parçalama + yeniden dengeleme
benzetimi.

Kullanım:
    from tutarli_karma import HashRing, ShardedStore
    ring = HashRing(["a", "b", "c"])
    ring.owner("kullanici:42")             # 'b' gibi
    store = ShardedStore(ring, replicas=2)
    store.put("kullanici:42", "Ayşe")
    store.join("d")                         # yalnız gereken anahtarlar taşınır

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .alternatives import jump_hash, modulo_owner, rendezvous_owner
from .rebalance import Move, ShardedStore
from .ring import HashRing, stable_hash

__all__ = [
    "HashRing",
    "Move",
    "ShardedStore",
    "jump_hash",
    "modulo_owner",
    "rendezvous_owner",
    "stable_hash",
]
