"""onbellek_sunucu: Redis uyumlu (RESP2) bellek içi önbellek sunucusu — süre dolumu, LRU, anlık
görüntü.

Kullanım:
    python -m onbellek_sunucu sun --kapi 8450 --bellek 64m --anlik onbellek.snap
    python -m onbellek_sunucu komut --kapi 8450 SET şehir İzmir EX 60
    redis-cli -p 8450 GET şehir          # gerçek redis-cli de konuşabilir

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .client import CacheClient, CacheError
from .resp import Error, SimpleString
from .server import DEFAULT_PORT, CacheServer
from .snapshot import SnapshotError
from .store import Store

__all__ = [
    "DEFAULT_PORT",
    "CacheClient",
    "CacheError",
    "CacheServer",
    "Error",
    "SimpleString",
    "SnapshotError",
    "Store",
]
