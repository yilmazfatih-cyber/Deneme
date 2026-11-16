"""akis: olay zamanlı akış işleme — atlayan/kayan pencere, filigran, izin verilen gecikme, geç
olaylar.

Kullanım:
    from akis import Event, StreamProcessor, Tumbling, AGGREGATES
    p = StreamProcessor(Tumbling(60_000), AGGREGATES["toplam"], out_of_orderness=5_000)
    p.process(Event("satış", 120.0, time=1_000))     # sonuçlar filigran pencere sonunu geçince
    gelir p.flush()                                         # akış bitince kalan pencereler

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .aggregates import AGGREGATES, Aggregate
from .engine import Event, Result, StreamProcessor
from .windows import Sliding, Tumbling, Window

__all__ = [
    "AGGREGATES",
    "Aggregate",
    "Event",
    "Result",
    "Sliding",
    "StreamProcessor",
    "Tumbling",
    "Window",
]
