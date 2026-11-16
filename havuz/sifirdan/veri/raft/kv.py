"""Raft üstünde çoğaltılmış anahtar-değer servisi: durum makinesi + yinelenen istemci isteğini
ayıklama.

Komut: ("set", anahtar, değer, istemci, sıra) · ("delete", anahtar, None, istemci, sıra).
İstemci yanıt alamayınca AYNI (istemci, sıra) ile yeniden dener; durum makinesi her istemcinin son
uyguladığı sırayı tutar ve eskileri atlar → komut günlükte iki kez olsa da BİR kez uygulanır.

Genişletme: doğrusallaştırılabilir okuma için ("get", ...) komutunu günlükten geçirin ya da liderin
"read index" yöntemini (çoğunluktan kalp atışı onayı) uygulayın.
"""

from __future__ import annotations

from .messages import Entry


class KVStateMachine:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.last_seq: dict[str, int] = {}  # istemci → uygulanan son sıra no
        self.applied: list[tuple[int, Entry]] = []  # (dizin, girdi): denetim için

    def apply(self, index: int, entry: Entry) -> None:
        self.applied.append((index, entry))
        command = entry.command
        if command is None:  # liderin boş girdisi
            return
        if not isinstance(command, tuple) or len(command) != 5:
            raise ValueError(f"Bilinmeyen komut: {command!r}")
        kind, key, value, client, seq = command
        if not isinstance(client, str) or not isinstance(seq, int) or not isinstance(key, str):
            raise ValueError(f"Bozuk komut: {command!r}")
        if seq <= self.last_seq.get(client, 0):
            return  # yinelenen istek: zaten uygulandı
        self.last_seq[client] = seq
        if kind == "set":
            self.data[key] = str(value)
        elif kind == "delete":
            self.data.pop(key, None)
        else:
            raise ValueError(f"Bilinmeyen komut türü: {kind!r}")

    def done(self, client: str, seq: int) -> bool:
        return self.last_seq.get(client, 0) >= seq
