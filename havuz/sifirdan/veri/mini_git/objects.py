"""İçerik adresli nesne deposu: blob, tree, commit — bayt bayt gerçek git'le aynı (SHA-1 + zlib).

Nesne = "<tür> <uzunluk>\\0<gövde>"; adı bu baytların SHA-1'idir; diskte zlib ile sıkıştırılmış
olarak `.minigit/objects/ab/cdef...` yolunda durur (ilk 2 onaltılık hane klasör).

- tree gövdesi: her girdi "<kip> <ad>\\0<20 baytlık ikili sha>"; girdiler ada göre sıralı, ama
  klasör adları sonlarında "/" varmış gibi karşılaştırılır ("a.txt" < "a/"). Klasör kipi "40000"
  (başta 0 yok).
- commit gövdesi: "tree <sha>\\n" + "parent <sha>\\n"* + "author ...\\n" + "committer ...\\n" +
  "\\n" + ileti.

Genişletme: SHA-256 depoları için `hashlib.sha1` yerine `sha256` ve 32 baytlık ikili ad (tree'de);
paket dosyaları (packfile) için `read`'e ikinci bir arama yolu.
"""

from __future__ import annotations

import hashlib
import os
import zlib
from dataclasses import dataclass
from pathlib import Path

MODE_FILE = "100644"
MODE_EXECUTABLE = "100755"
MODE_TREE = "40000"


class ObjectError(Exception):
    """Nesne bulunamadı ya da bozuk."""


@dataclass(frozen=True)
class TreeEntry:
    mode: str
    name: str
    sha: str


@dataclass(frozen=True)
class Commit:
    tree: str
    parents: tuple[str, ...]
    author: str  # "Ad <eposta> 1700000000 +0000"
    committer: str
    message: str

    @property
    def timestamp(self) -> int:
        return int(self.committer.rsplit(" ", 2)[1])


def frame(kind: str, body: bytes) -> bytes:
    return f"{kind} {len(body)}".encode() + b"\0" + body


def hash_object(kind: str, body: bytes) -> str:
    return hashlib.sha1(frame(kind, body), usedforsecurity=False).hexdigest()


def _sort_key(entry: TreeEntry) -> bytes:
    name = entry.name.encode()
    return name + b"/" if entry.mode == MODE_TREE else name


def encode_tree(entries: list[TreeEntry]) -> bytes:
    return b"".join(
        f"{e.mode} {e.name}".encode() + b"\0" + bytes.fromhex(e.sha)
        for e in sorted(entries, key=_sort_key)
    )


def decode_tree(body: bytes) -> list[TreeEntry]:
    entries: list[TreeEntry] = []
    position = 0
    while position < len(body):
        space = body.index(b" ", position)
        nul = body.index(b"\0", space)
        mode, name = body[position:space].decode(), body[space + 1 : nul].decode()
        entries.append(TreeEntry(mode, name, body[nul + 1 : nul + 21].hex()))
        position = nul + 21
    return entries


def encode_commit(commit: Commit) -> bytes:
    lines = [f"tree {commit.tree}"] + [f"parent {parent}" for parent in commit.parents]
    lines += [f"author {commit.author}", f"committer {commit.committer}", ""]
    message = commit.message if commit.message.endswith("\n") else commit.message + "\n"
    return ("\n".join(lines) + "\n" + message).encode()


def decode_commit(body: bytes) -> Commit:
    head, _, message = body.decode().partition("\n\n")
    tree, parents, author, committer = "", [], "", ""
    for line in head.split("\n"):
        key, _, value = line.partition(" ")
        if key == "tree":
            tree = value
        elif key == "parent":
            parents.append(value)
        elif key == "author":
            author = value
        elif key == "committer":
            committer = value
    return Commit(tree, tuple(parents), author, committer, message)


class ObjectStore:
    def __init__(self, gitdir: Path) -> None:
        self.root = gitdir / "objects"

    def _path(self, sha: str) -> Path:
        return self.root / sha[:2] / sha[2:]

    def write(self, kind: str, body: bytes) -> str:
        sha = hash_object(kind, body)
        path = self._path(sha)
        if not path.exists():  # içerik adresli: aynı içerik bir kez yazılır
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(zlib.compress(frame(kind, body)))
            os.replace(temporary, path)
        return sha

    def read(self, sha: str) -> tuple[str, bytes]:
        try:
            raw = zlib.decompress(self._path(sha).read_bytes())
        except (FileNotFoundError, zlib.error) as error:
            raise ObjectError(f"{sha[:12]} nesnesi yok ya da bozuk: {error}") from error
        header, _, body = raw.partition(b"\0")
        kind, _, length = header.decode().partition(" ")
        if int(length) != len(body) or hash_object(kind, body) != sha:
            raise ObjectError(f"{sha[:12]} nesnesinin içeriği adıyla uyuşmuyor (bozulma)")
        return kind, body

    def exists(self, sha: str) -> bool:
        return self._path(sha).exists()

    def expand(self, prefix: str) -> list[str]:
        """Kısa sha'yı tam sha'lara açar (en az 4 hane)."""
        if len(prefix) < 4 or not all(c in "0123456789abcdef" for c in prefix):
            return []
        folder = self.root / prefix[:2]
        if not folder.is_dir():
            return []
        return sorted(
            prefix[:2] + p.name for p in folder.iterdir() if p.name.startswith(prefix[2:])
        )

    def read_commit(self, sha: str) -> Commit:
        kind, body = self.read(sha)
        if kind != "commit":
            raise ObjectError(f"{sha[:12]} bir commit değil ({kind})")
        return decode_commit(body)

    def read_tree(self, sha: str) -> list[TreeEntry]:
        kind, body = self.read(sha)
        if kind != "tree":
            raise ObjectError(f"{sha[:12]} bir tree değil ({kind})")
        return decode_tree(body)
