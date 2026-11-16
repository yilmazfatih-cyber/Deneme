"""Önceden yazma günlüğü (WAL): kayıt biçimi, sona ekleme ve yeniden oynatma.

Her kayıt atomik bir toplu yazmadır (bir ya da daha çok put/delete). Bayt düzeni (README'de çizim
var):

    crc32(4) | uzunluk(4) | yük: sayı(4) + [tür(1) anahtar_uz(4) anahtar değer_uz(4) değer] × sayı

crc32 = zlib.crc32(uzunluk + yük); tamsayılar küçük sonlu (little-endian), işaretsiz. tür: 0 = put,
1 = sil. Yeniden oynatma ilk bozuk ya da yarım kayıtta durur ve dosyayı son sağlam kaydın sonuna
kısaltır.

Genişletme: kayda sıra numarası eklemek (çoğaltma/anlık görüntü için) → yükün başına 8 baytlık `seq`
ekleyin ve README'deki biçim çizimini güncelleyin.
"""

from __future__ import annotations

import struct
import zlib
from collections.abc import Sequence

from .fs import FileSystem, WritableFile

# (anahtar, değer); değer None ise bu bir silmedir (silme işareti, "tombstone").
Op = tuple[bytes, bytes | None]

_U32 = struct.Struct("<I")
_HEADER = struct.Struct("<II")  # crc32, uzunluk
TYPE_PUT = 0
TYPE_DELETE = 1
MAX_RECORD_BYTES = 64 * 1024 * 1024


def encode_record(ops: Sequence[Op]) -> bytes:
    """Bir toplu yazmayı tek WAL kaydına çevirir."""
    parts = [_U32.pack(len(ops))]
    for key, value in ops:
        if value is None:
            parts += [bytes([TYPE_DELETE]), _U32.pack(len(key)), key, _U32.pack(0)]
        else:
            parts += [bytes([TYPE_PUT]), _U32.pack(len(key)), key, _U32.pack(len(value)), value]
    payload = b"".join(parts)
    if len(payload) > MAX_RECORD_BYTES:
        raise ValueError("Toplu yazma çok büyük (64 MiB sınırı). Daha küçük parçalara bölün.")
    length = _U32.pack(len(payload))
    return _U32.pack(zlib.crc32(length + payload)) + length + payload


def decode_payload(payload: bytes) -> list[Op]:
    """Bir kaydın yükünü işlemlere çözer; biçim tutarsızsa ValueError fırlatır."""
    try:
        (count,) = _U32.unpack_from(payload, 0)
        pos = 4
        ops: list[Op] = []
        for _ in range(count):
            kind = payload[pos]
            (key_len,) = _U32.unpack_from(payload, pos + 1)
            key = payload[pos + 5 : pos + 5 + key_len]
            pos += 5 + key_len
            (value_len,) = _U32.unpack_from(payload, pos)
            value = payload[pos + 4 : pos + 4 + value_len]
            pos += 4 + value_len
            if kind not in (TYPE_PUT, TYPE_DELETE) or len(key) != key_len:
                raise ValueError("bilinmeyen kayıt türü ya da kısa anahtar")
            ops.append((key, None if kind == TYPE_DELETE else value))
    except (struct.error, IndexError) as error:
        raise ValueError(f"bozuk yük: {error}") from error
    if pos != len(payload):
        raise ValueError("yükün sonunda fazladan bayt var")
    return ops


def read_records(data: bytes) -> tuple[list[list[Op]], int]:
    """Baştan itibaren sağlam kayıtları ve son sağlam kaydın bittiği bayt konumunu döndürür."""
    records: list[list[Op]] = []
    pos = 0
    while pos + _HEADER.size <= len(data):
        crc, length = _HEADER.unpack_from(data, pos)
        end = pos + _HEADER.size + length
        if length > MAX_RECORD_BYTES or end > len(data):
            break  # yarım kalmış kayıt (güç kesintisi ya da yazarken ölüm)
        if zlib.crc32(data[pos + 4 : end]) != crc:
            break  # bozuk kayıt: buradan sonrasına güvenilmez
        try:
            records.append(decode_payload(data[pos + _HEADER.size : end]))
        except ValueError:
            break
        pos = end
    return records, pos


def replay(fs: FileSystem, name: str) -> list[list[Op]]:
    """WAL dosyasını okur; bozuk kuyruğu keser (kesme kalıcıdır) ve kayıtları döndürür."""
    data = fs.read(name)
    records, good_end = read_records(data)
    if good_end < len(data):
        fs.truncate(name, good_end)
    return records


class WalWriter:
    """Tek bir WAL dosyasının sonuna kayıt ekler. `sync=True` ise her kayıttan sonra fsync
    çağırır."""

    def __init__(self, fs: FileSystem, name: str, *, sync: bool) -> None:
        self.name = name
        self._sync = sync
        self._file: WritableFile = fs.open_append(name)

    def append(self, ops: Sequence[Op]) -> None:
        self._file.write(encode_record(ops))
        if self._sync:
            self._file.sync()

    def sync(self) -> None:
        self._file.sync()

    def close(self) -> None:
        self._file.close()
