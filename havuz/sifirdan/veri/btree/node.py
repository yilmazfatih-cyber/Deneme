"""B+ ağacı düğümü: bellekteki biçimi ve sabit boyutlu sayfaya kodlanması.

Sayfa düzeni (tamsayılar küçük sonlu; README'de çizim var):

    yaprak:  tür=1 (1) | sayı (2) | sonraki_yaprak (4) | [anahtar_uz(2) anahtar değer_uz(2) değer]*
    iç:      tür=2 (1) | sayı (2) | ilk_çocuk (4)      | [anahtar_uz(2) anahtar çocuk(4)]*

Sayfanın geri kalanı sıfırdır. Sayfa numarası 0 "yok" demektir (0. sayfa dosya başlığıdır).

Genişletme: anahtar ön ek sıkıştırması için `encode`/`decode`'u değiştirin; `entries_size` gerçek
kodlanmış boyutu döndürmeye devam etmelidir (bölünme kararları ona bakar).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

LEAF = 1
INTERNAL = 2
NODE_HEADER = 7  # tür(1) + sayı(2) + işaretçi(4)
_HEAD = struct.Struct("<BHI")
_U16 = struct.Struct("<H")
_U32 = struct.Struct("<I")


def leaf_entry_size(key: bytes, value: bytes) -> int:
    return 4 + len(key) + len(value)


def internal_entry_size(key: bytes) -> int:
    return 6 + len(key)


@dataclass
class Node:
    """Çözülmüş düğüm. Yaprakta `values`, iç düğümde `children` (len = len(keys) + 1) doludur."""

    page_id: int
    is_leaf: bool
    keys: list[bytes] = field(default_factory=list)
    values: list[bytes] = field(default_factory=list)
    children: list[int] = field(default_factory=list)
    next_leaf: int = 0

    def entries_size(self) -> int:
        """Girdilerin sayfada kapladığı bayt (başlık hariç)."""
        if self.is_leaf:
            return sum(leaf_entry_size(k, v) for k, v in zip(self.keys, self.values, strict=True))
        return sum(internal_entry_size(k) for k in self.keys)


def encode(node: Node, page_size: int) -> bytes:
    """Düğümü tam `page_size` baytlık bir sayfaya kodlar."""
    if node.is_leaf:
        parts = [_HEAD.pack(LEAF, len(node.keys), node.next_leaf)]
        for key, value in zip(node.keys, node.values, strict=True):
            parts += [_U16.pack(len(key)), key, _U16.pack(len(value)), value]
    else:
        if len(node.children) != len(node.keys) + 1:
            raise ValueError("iç düğümde çocuk sayısı anahtar sayısından bir fazla olmalı")
        parts = [_HEAD.pack(INTERNAL, len(node.keys), node.children[0])]
        for key, child in zip(node.keys, node.children[1:], strict=True):
            parts += [_U16.pack(len(key)), key, _U32.pack(child)]
    data = b"".join(parts)
    if len(data) > page_size:
        raise ValueError(f"düğüm sayfaya sığmıyor ({len(data)} > {page_size}); bölünmeliydi")
    return data + bytes(page_size - len(data))


def decode(page_id: int, data: bytes) -> Node:
    kind, count, pointer = _HEAD.unpack_from(data, 0)
    pos = NODE_HEADER
    node = Node(page_id, is_leaf=kind == LEAF)
    if kind == LEAF:
        node.next_leaf = pointer
        for _ in range(count):
            (key_len,) = _U16.unpack_from(data, pos)
            node.keys.append(bytes(data[pos + 2 : pos + 2 + key_len]))
            pos += 2 + key_len
            (value_len,) = _U16.unpack_from(data, pos)
            node.values.append(bytes(data[pos + 2 : pos + 2 + value_len]))
            pos += 2 + value_len
    elif kind == INTERNAL:
        node.children.append(pointer)
        for _ in range(count):
            (key_len,) = _U16.unpack_from(data, pos)
            node.keys.append(bytes(data[pos + 2 : pos + 2 + key_len]))
            pos += 2 + key_len
            (child,) = _U32.unpack_from(data, pos)
            node.children.append(child)
            pos += 4
    else:
        raise ValueError(f"{page_id}. sayfa bir düğüm değil (tür={kind}); dosya bozuk olabilir")
    return node
