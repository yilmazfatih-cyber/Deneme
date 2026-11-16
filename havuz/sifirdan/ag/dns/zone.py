"""Bölge dosyası ayrıştırıcı (RFC 1035 §5'in bir alt kümesi) ve bellek içi bölge.

    $ORIGIN ornek.test.
    $TTL 3600
    @     IN SOA ns1 yonetici 2026111601 7200 3600 1209600 300
    @     IN NS  ns1
    www   300 IN A 192.0.2.10        ; noktayla bitmeyen ad bölgeye göreli ("www.ornek.test")
    blog  IN CNAME www
          IN TXT "boşluklu metin" "ikinci parça"   ; satır boşlukla başlarsa sahip öncekidir
Desteklenmeyen: parantezle çok satıra bölme, $INCLUDE, $GENERATE (açık hata iletisiyle reddedilir).
Türkçe alan adları IDNA ile xn--… biçimine çevrilir. Her hata satır numarasıyla bildirilir.
Genişletme: yeni bir kayıt türü için `_parse_rdata`'ya bir dal ekleyin (önce `message.py`'de türü
tanımlayın).
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field

from dns.message import TYPES, Record, Soa

MAX_RECORDS = 10_000


class ZoneError(ValueError):
    """Bölge dosyası okunamadı; ileti satır numarasını içerir."""


def _tokens(line: str) -> list[str]:
    """Boşlukla ayrılmış sözcükler; çift tırnak içi tek sözcük; ';' sonrası yorum."""
    tokens: list[str] = []
    current, quoted, in_quotes = "", False, False
    for char in line:
        if in_quotes:
            if char == '"':
                in_quotes = False
            else:
                current += char
        elif char == '"':
            in_quotes, quoted = True, True
        elif char == ";":
            break
        elif char.isspace():
            if current or quoted:
                tokens.append(('"' if quoted else "") + current)
            current, quoted = "", False
        else:
            current += char
    if in_quotes:
        raise ZoneError("kapanmamış tırnak")
    if current or quoted:
        tokens.append(('"' if quoted else "") + current)
    return tokens


def absolute(name: str, origin: str) -> str:
    """Göreli adı bölge kökenine bağlar; Türkçe etiketleri IDNA'ya çevirir; küçük harfe indirir."""
    if name == "@":
        return origin
    full = name[:-1] if name.endswith(".") else (f"{name}.{origin}" if origin else name)
    try:
        return full.encode("idna").decode("ascii").lower() if not full.isascii() else full.lower()
    except UnicodeError as exc:
        raise ZoneError(f"ad IDNA'ya çevrilemedi: {name}") from exc


def _parse_rdata(kind: str, args: list[str], origin: str) -> object:
    if kind == "A":
        return str(ipaddress.IPv4Address(args[0]))
    if kind == "AAAA":
        return str(ipaddress.IPv6Address(args[0]))
    if kind in ("NS", "CNAME", "PTR"):
        return absolute(args[0], origin)
    if kind == "MX":
        return (int(args[0]), absolute(args[1], origin))
    if kind == "TXT":
        return tuple(arg.removeprefix('"').encode("utf-8") for arg in args)
    if kind == "SOA":
        numbers = [int(value) for value in args[2:7]]
        if len(numbers) != 5:
            raise ZoneError("SOA: ad, posta, seri, yenile, yeniden dene, süre, en düşük gerekir")
        return Soa(absolute(args[0], origin), absolute(args[1], origin), *numbers)
    raise ZoneError(f"desteklenmeyen kayıt türü: {kind}")


@dataclass
class Zone:
    origin: str
    records: list[Record] = field(default_factory=list)

    @property
    def soa(self) -> Record | None:
        return next((r for r in self.records if r.type == TYPES["SOA"]), None)

    def lookup(self, name: str, kind: int) -> list[Record]:
        return [
            r for r in self.records if r.name == name and (r.type == kind or kind == TYPES["ANY"])
        ]

    def has_name(self, name: str) -> bool:
        return any(r.name == name or r.name.endswith("." + name) for r in self.records)

    def contains(self, name: str) -> bool:
        return name == self.origin or name.endswith("." + self.origin)


def parse_zone(text: str, origin: str = "") -> Zone:
    origin = origin.rstrip(".").lower()
    ttl, owner = 3600, ""
    zone = Zone(origin)
    for number, line in enumerate(text.splitlines(), 1):
        try:
            tokens = _tokens(line)
            if not tokens:
                continue
            if tokens[0].upper() in ("$INCLUDE", "$GENERATE") or "(" in tokens:
                raise ZoneError(f"{tokens[0]} desteklenmiyor (kayıtları tek satıra yazın)")
            if tokens[0].upper() == "$ORIGIN":
                origin = zone.origin = tokens[1].rstrip(".").lower()
                continue
            if tokens[0].upper() == "$TTL":
                ttl = int(tokens[1])
                continue
            if not line[0].isspace():
                owner = absolute(tokens.pop(0), origin)
            if not owner:
                raise ZoneError("ilk kaydın sahibi (ad) yazılmalı")
            record_ttl = int(tokens.pop(0)) if tokens and tokens[0].isdigit() else ttl
            if tokens and tokens[0].upper() == "IN":
                tokens.pop(0)
            kind = tokens.pop(0).upper()
            if kind not in TYPES or kind == "ANY":
                raise ZoneError(f"desteklenmeyen kayıt türü: {kind}")
            zone.records.append(
                Record(owner, TYPES[kind], record_ttl, _parse_rdata(kind, tokens, origin))
            )
        except (ZoneError, ValueError, IndexError) as exc:
            raise ZoneError(f"{number}. satır: {exc or 'eksik alan'}") from exc
        if len(zone.records) > MAX_RECORDS:
            raise ZoneError(f"en çok {MAX_RECORDS} kayıt desteklenir")
    if zone.soa is None:
        raise ZoneError("bölgede SOA kaydı yok (yetkili sunucu olumsuz yanıtlarda onu kullanır)")
    return zone
