"""RFC 8259 JSON ayrıştırıcı ve yazıcı (+ akışla, olay tabanlı ayrıştırma); yalnız stdlib.

Hızlı kullanım:
    >>> from json_ayristirici import loads, dumps
    >>> loads('{"ad": "Ayşe", "yaş": 40}')
    {'ad': 'Ayşe', 'yaş': 40}
    >>> dumps({"ç": [1, 2.5, None]}, ensure_ascii=False)
    '{"ç": [1, 2.5, null]}'

Dosyalar: scanner.py (ortak tarama + hata iletileri), parser.py (özyinelemeli iniş), writer.py
(yazıcı), stream.py (akış/olaylar). Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from .parser import JsonError, Options, loads, loads_bytes
from .stream import Event, EventKind, EventParser, build, iter_events
from .writer import dumps

__all__ = [
    "Event",
    "EventKind",
    "EventParser",
    "JsonError",
    "Options",
    "build",
    "dumps",
    "iter_events",
    "loads",
    "loads_bytes",
]
