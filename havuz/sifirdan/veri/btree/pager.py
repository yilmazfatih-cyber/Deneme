"""Sayfalayıcı (pager): dosyayı sabit boyutlu sayfalara böler; LRU sayfa önbelleği ve boş sayfa
listesi.

0. sayfa dosya başlığıdır:
    sihir "SFRBTREE"(8) | sayfa_boyu(4) | kök(4) | sayfa_sayısı(4) | boş_baş(4) | anahtar_sayısı(8)
    | crc32(önceki 32 bayt)(4) | sıfırlar
Boş (serbest) sayfa: tür=0 (1) | sonraki_boş (4). Silinen düğümlerin sayfaları bu zincirle yeniden
kullanılır.

Önbellek kirli sayfaları ancak çıkarılırken ya da `flush()`'ta diske yazar. Yerinde yazma yapıldığı
için `flush()` yarıda kesilirse dosya tutarsız kalabilir (bkz. README "Sağlamadıkları").

Genişletme: çökme güvenliği için kirli sayfaları önce bir günlüğe (WAL) yazın ya da gölge sayfalama
yapın.
"""

from __future__ import annotations

import io
import os
import struct
import zlib
from collections import OrderedDict
from typing import BinaryIO

MAGIC = b"SFRBTREE"
_HEADER = struct.Struct("<8sIIIIQ")  # 32 bayt + crc32
_U32 = struct.Struct("<I")
MIN_PAGE_SIZE = 64


class PagerError(Exception):
    """Dosya bir B+ ağacı dosyası değil ya da başlığı bozuk."""


class Pager:
    """Sayfa okuma/yazma, ayırma/serbest bırakma ve LRU önbellek."""

    def __init__(self, file: BinaryIO, page_size: int, cache_pages: int) -> None:
        if page_size < MIN_PAGE_SIZE or cache_pages < 1:
            raise ValueError(f"page_size >= {MIN_PAGE_SIZE} ve cache_pages >= 1 olmalı")
        self._file = file
        self.page_size = page_size
        self.cache_pages = cache_pages
        self._cache: OrderedDict[int, bytes] = OrderedDict()
        self._dirty: set[int] = set()
        self.root = 0
        self.page_count = 1
        self.free_head = 0
        self.key_count = 0
        self.stats = {"hits": 0, "misses": 0, "evictions": 0, "disk_writes": 0}

    # ── Başlık ──────────────────────────────────────────────────────────────────────────────────

    def load_header(self) -> None:
        self._file.seek(0)
        raw = self._file.read(_HEADER.size + 4)
        if len(raw) < _HEADER.size + 4:
            raise PagerError("dosya çok kısa: B+ ağacı başlığı yok")
        magic, page_size, root, count, free_head, keys = _HEADER.unpack_from(raw, 0)
        (crc,) = _U32.unpack_from(raw, _HEADER.size)
        if magic != MAGIC or zlib.crc32(raw[: _HEADER.size]) != crc:
            raise PagerError("bu bir B+ ağacı dosyası değil ya da başlık bozuk")
        if page_size != self.page_size:
            raise PagerError(
                f"dosyanın sayfa boyu {page_size}; açarken page_size={page_size} verin"
            )
        self.root, self.page_count, self.free_head, self.key_count = root, count, free_head, keys

    def _header_bytes(self) -> bytes:
        head = _HEADER.pack(
            MAGIC, self.page_size, self.root, self.page_count, self.free_head, self.key_count
        )
        data = head + _U32.pack(zlib.crc32(head))
        return data + bytes(self.page_size - len(data))

    # ── Sayfalar ────────────────────────────────────────────────────────────────────────────────

    def read(self, page_id: int) -> bytes:
        if not 0 < page_id < self.page_count:
            raise ValueError(f"geçersiz sayfa numarası {page_id}")
        if page_id in self._cache:
            self.stats["hits"] += 1
            self._cache.move_to_end(page_id)
            return self._cache[page_id]
        self.stats["misses"] += 1
        self._file.seek(page_id * self.page_size)
        data = self._file.read(self.page_size)
        if len(data) != self.page_size:
            raise PagerError(f"{page_id}. sayfa okunamadı (dosya kısa)")
        self._put_in_cache(page_id, data)
        return data

    def write(self, page_id: int, data: bytes) -> None:
        if len(data) != self.page_size:
            raise ValueError("sayfa verisi tam sayfa boyunda olmalı")
        self._put_in_cache(page_id, data)
        self._dirty.add(page_id)

    def _put_in_cache(self, page_id: int, data: bytes) -> None:
        self._cache[page_id] = data
        self._cache.move_to_end(page_id)
        while len(self._cache) > self.cache_pages:
            victim, victim_data = self._cache.popitem(last=False)
            self.stats["evictions"] += 1
            if victim in self._dirty:
                self._write_to_disk(victim, victim_data)
                self._dirty.discard(victim)

    def _write_to_disk(self, page_id: int, data: bytes) -> None:
        self._file.seek(page_id * self.page_size)
        self._file.write(data)
        self.stats["disk_writes"] += 1

    def allocate(self) -> int:
        """Boş listeden ya da dosyanın sonundan bir sayfa numarası verir."""
        if self.free_head:
            page_id = self.free_head
            (self.free_head,) = _U32.unpack_from(self.read(page_id), 1)
            return page_id
        self.page_count += 1
        return self.page_count - 1

    def free(self, page_id: int) -> None:
        """Sayfayı boş listenin başına ekler."""
        page = bytes([0]) + _U32.pack(self.free_head)
        self.write(page_id, page + bytes(self.page_size - len(page)))
        self.free_head = page_id

    def free_pages(self) -> list[int]:
        """Boş listedeki sayfalar (doğrulayıcı kullanır)."""
        pages: list[int] = []
        current = self.free_head
        while current:
            if current in pages:
                raise PagerError("boş sayfa listesinde döngü var")
            pages.append(current)
            (current,) = _U32.unpack_from(self.read(current), 1)
        return pages

    def flush(self) -> None:
        """Kirli sayfaları ve başlığı yazar, sonra fsync çağırır."""
        for page_id in sorted(self._dirty):
            self._write_to_disk(page_id, self._cache[page_id])
        self._dirty.clear()
        self._write_to_disk(0, self._header_bytes())
        self._file.flush()
        if not isinstance(self._file, io.BytesIO):
            os.fsync(self._file.fileno())

    def close(self) -> None:
        self.flush()
        self._file.close()
