"""Sıralı dizgi tablosu (SSTable): değişmez, sıralı, diskteki anahtar-değer dosyası.

Dosya düzeni (README'de bayt bayt çizim var):

    [veri bloğu 0][veri bloğu 1]...[Bloom bloğu][dizin bloğu][alt bilgi: 44 bayt]

- Veri bloğu: girdiler [bayrak(1) anahtar_uz(4) anahtar değer_uz(4) değer] + crc32(4). bayrak 1 =
  silme.
- Dizin (seyrek): blok başına bir satır [anahtar_uz(4) ilk_anahtar konum(8) boyut(4)].
- Alt bilgi: dizin_konumu(8) dizin_boyu(4) bloom_konumu(8) bloom_boyu(4) girdi_sayısı(8) crc32(4)
  sihir(8).

Okuyucu açılışta yalnız alt bilgi, dizin ve Bloom süzgecini belleğe alır; bloklar istendikçe okunur.

Genişletme: blok önbelleği (LRU) eklemek için `_read_block`'u sarın; blok sıkıştırma için bayrak
ekleyin.
"""

from __future__ import annotations

import bisect
import struct
import zlib
from collections.abc import Iterable, Iterator

from .bloom import BloomFilter
from .fs import FileSystem

MAGIC = b"SFRSST01"
_FOOTER = struct.Struct("<QIQIQI8s")  # 44 bayt
_U32 = struct.Struct("<I")
_INDEX_TAIL = struct.Struct("<QI")
FLAG_PUT = 0
FLAG_DELETE = 1

Entry = tuple[bytes, bytes | None]


class CorruptionError(Exception):
    """SSTable dosyası beklenen biçimde değil (sağlama toplamı ya da sihirli sayı tutmadı)."""


def _encode_entry(key: bytes, value: bytes | None) -> bytes:
    flag = FLAG_DELETE if value is None else FLAG_PUT
    raw = value or b""
    return bytes([flag]) + _U32.pack(len(key)) + key + _U32.pack(len(raw)) + raw


def write_sstable(
    fs: FileSystem,
    name: str,
    entries: Iterable[Entry],
    *,
    block_size: int = 4096,
    bits_per_key: int = 10,
) -> int:
    """Sıralı ve tekil girdileri `name` dosyasına yazar; girdi sayısını döndürür.

    Önce `name + ".tmp"` yazılır, fsync edilir, sonra atomik olarak yeniden adlandırılır.
    Klasörün fsync'i (yeni adın kalıcılığı) ÇAĞIRANIN işidir.
    """
    tmp = name + ".tmp"
    handle = fs.create(tmp)
    index: list[tuple[bytes, int, int]] = []
    keys: list[bytes] = []
    block = bytearray()
    block_first = b""
    offset = 0

    def finish_block() -> None:
        nonlocal block, offset
        data = bytes(block) + _U32.pack(zlib.crc32(block))
        handle.write(data)
        index.append((block_first, offset, len(data)))
        offset += len(data)
        block = bytearray()

    for key, value in entries:
        if keys and key <= keys[-1]:
            raise ValueError("SSTable girdileri artan sırada ve tekil olmalı")
        if not block:
            block_first = key
        block += _encode_entry(key, value)
        keys.append(key)
        if len(block) >= block_size:
            finish_block()
    if block:
        finish_block()

    bloom_data = BloomFilter.for_keys(keys, bits_per_key).to_bytes()
    bloom_offset = offset
    index_data = b"".join(
        _U32.pack(len(first)) + first + _INDEX_TAIL.pack(pos, size) for first, pos, size in index
    )
    index_offset = bloom_offset + len(bloom_data)
    fields = (index_offset, len(index_data), bloom_offset, len(bloom_data), len(keys))
    head = struct.pack("<QIQIQ", *fields)
    footer = _FOOTER.pack(*fields, zlib.crc32(head), MAGIC)
    handle.write(bloom_data + index_data + footer)
    handle.sync()
    handle.close()
    fs.rename(tmp, name)
    return len(keys)


def _decode_block(data: bytes) -> list[Entry]:
    body, (crc,) = data[:-4], _U32.unpack(data[-4:])
    if zlib.crc32(body) != crc:
        raise CorruptionError("veri bloğunun sağlama toplamı tutmadı")
    entries: list[Entry] = []
    pos = 0
    while pos < len(body):
        flag = body[pos]
        (key_len,) = _U32.unpack_from(body, pos + 1)
        key = body[pos + 5 : pos + 5 + key_len]
        pos += 5 + key_len
        (value_len,) = _U32.unpack_from(body, pos)
        value = body[pos + 4 : pos + 4 + value_len]
        pos += 4 + value_len
        entries.append((key, None if flag == FLAG_DELETE else value))
    return entries


class SSTableReader:
    """Bir SSTable dosyasını okur: nokta arama ve aralık taraması."""

    def __init__(self, fs: FileSystem, name: str) -> None:
        self.fs = fs
        self.name = name
        self.obsolete = False  # birleştirmeden sonra dosya silinince True olur
        self.block_reads = 0  # Bloom süzgecinin işe yaradığını ölçmek için sayaç
        size = fs.size(name)
        if size < _FOOTER.size:
            raise CorruptionError(f"{name}: dosya alt bilgiden kısa")
        footer = fs.read(name, size - _FOOTER.size, _FOOTER.size)
        *fields, crc, magic = _FOOTER.unpack(footer)
        if magic != MAGIC or zlib.crc32(struct.pack("<QIQIQ", *fields)) != crc:
            raise CorruptionError(f"{name}: alt bilgi bozuk ya da bu bir SSTable değil")
        index_offset, index_size, bloom_offset, bloom_size, self.entry_count = fields
        self._bloom = BloomFilter.from_bytes(fs.read(name, bloom_offset, bloom_size))
        self._index = self._parse_index(fs.read(name, index_offset, index_size))
        self._first_keys = [first for first, _, _ in self._index]

    @staticmethod
    def _parse_index(data: bytes) -> list[tuple[bytes, int, int]]:
        index: list[tuple[bytes, int, int]] = []
        pos = 0
        while pos < len(data):
            (key_len,) = _U32.unpack_from(data, pos)
            first = data[pos + 4 : pos + 4 + key_len]
            offset, size = _INDEX_TAIL.unpack_from(data, pos + 4 + key_len)
            index.append((first, offset, size))
            pos += 4 + key_len + _INDEX_TAIL.size
        return index

    def _read_block(self, number: int) -> list[Entry]:
        if self.obsolete:
            raise RuntimeError(
                "Tarama sürerken birleştirme (compaction) bu tabloyu sildi; "
                "taramayı yeniden başlatın."
            )
        _, offset, size = self._index[number]
        self.block_reads += 1
        return _decode_block(self.fs.read(self.name, offset, size))

    def get(self, key: bytes) -> tuple[bool, bytes | None]:
        """(bulundu_mu, değer); silme işareti (True, None) döner."""
        if not self._bloom.might_contain(key):
            return False, None
        number = bisect.bisect_right(self._first_keys, key) - 1
        if number < 0:
            return False, None
        for entry_key, value in self._read_block(number):
            if entry_key == key:
                return True, value
            if entry_key > key:
                break
        return False, None

    def scan(self, start: bytes = b"", end: bytes | None = None) -> Iterator[Entry]:
        """[start, end) aralığındaki girdiler (silme işaretleri dahil), sıralı."""
        number = max(0, bisect.bisect_right(self._first_keys, start) - 1)
        for block_number in range(number, len(self._index)):
            if end is not None and self._first_keys[block_number] >= end:
                return
            for key, value in self._read_block(block_number):
                if key < start:
                    continue
                if end is not None and key >= end:
                    return
                yield key, value
