"""Anlık görüntüyle kalıcılık: deponun tamamı tek bir dosyaya, atomik olarak yazılır.

Biçim (tamsayılar küçük sonlu):
    "SFRCACHE1\\n" | kayıt* | "SON" + kayıt_sayısı(8) + crc32(önceki bütün baytlar)(4)
    kayıt = anahtar_uz(4) anahtar değer_uz(4) değer bitiş_ms(8, 0 = süresiz)
Kayıtlar LRU sırasıyladır (en eski önce); yüklemede sıra korunur. Süresi geçmiş kayıt yüklenmez.

Yazma: geçici dosya → fsync → yeniden adlandırma (atomik) → klasör fsync. Yarım kalan yazma eski
görüntüyü bozmaz. Son görüntüden sonraki yazmalar çökmede KAYBOLUR (bu bir önbellektir; README'de).

Genişletme: her yazmayı da kalıcı kılmak için AOF (komut günlüğü) ekleyin: her değiştiren komutu
RESP olarak sona ekleyip açılışta yeniden oynatın (bkz. anahtar_deger/wal.py).
"""

from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path

from .store import Store

MAGIC = b"SFRCACHE1\n"
_U32 = struct.Struct("<I")
_U64 = struct.Struct("<Q")


class SnapshotError(Exception):
    """Anlık görüntü dosyası bozuk ya da tanınmıyor."""


def encode(store: Store) -> bytes:
    parts = [MAGIC]
    for key, value in store.data.items():
        expire = store.expires.get(key, 0)
        parts += [_U32.pack(len(key)), key, _U32.pack(len(value)), value, _U64.pack(expire)]
    body = b"".join(parts) + b"SON" + _U64.pack(len(store.data))
    return body + _U32.pack(zlib.crc32(body))


def save(store: Store, path: str | Path) -> None:
    target = Path(path)
    temporary = target.with_name(target.name + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(encode(store))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, target)
    if os.name != "nt":
        folder = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(folder)
        finally:
            os.close(folder)


def load(store: Store, path: str | Path) -> int:
    """Dosyadaki görüntüyü depoya yükler; yüklenen anahtar sayısını döndürür."""
    data = Path(path).read_bytes()
    if not data.startswith(MAGIC) or len(data) < len(MAGIC) + 15:
        raise SnapshotError(f"{path}: anlık görüntü dosyası değil")
    body, (crc,) = data[:-4], _U32.unpack(data[-4:])
    if zlib.crc32(body) != crc:
        raise SnapshotError(
            f"{path}: sağlama toplamı tutmadı (dosya bozuk); dosyayı silip yeniden başlatın"
        )
    position, now, loaded = len(MAGIC), store.clock(), 0
    while body[position : position + 3] != b"SON":
        (key_len,) = _U32.unpack_from(body, position)
        key = body[position + 4 : position + 4 + key_len]
        position += 4 + key_len
        (value_len,) = _U32.unpack_from(body, position)
        value = body[position + 4 : position + 4 + value_len]
        position += 4 + value_len
        (expire,) = _U64.unpack_from(body, position)
        position += 8
        if expire and expire <= now:
            continue
        store._put(key, value)
        if expire:
            store.expires[key] = expire
        loaded += 1
    return loaded
