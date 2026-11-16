"""dns — DNS iletisi kodlayıcı/çözücü, yetkili sunucu (UDP+TCP) ve uç çözümleyici.

Genişletme: yeni bir dışa açık ad eklerseniz `__all__` listesine de yazın.
"""

from dns.message import TYPES, DnsFormatError, Message, Question, Record, Soa
from dns.resolver import NameNotFoundError, ResolveError, Resolver
from dns.server import DnsServer, answer
from dns.zone import Zone, ZoneError, parse_zone

__all__ = [
    "TYPES",
    "DnsFormatError",
    "DnsServer",
    "Message",
    "NameNotFoundError",
    "Question",
    "Record",
    "ResolveError",
    "Resolver",
    "Soa",
    "Zone",
    "ZoneError",
    "answer",
    "parse_zone",
]
