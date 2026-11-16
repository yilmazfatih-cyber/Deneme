"""Komutlar (1/2): add, commit, status, log, diff, branch, tag. Her işlev bir `Repository` alır;
çıktıyı yazdırmaz, veri döndürür (komut satırı `__main__.py` biçimlendirir; testler doğrudan
çağırır).

Yazar ve tarih: `Signature` parametresi; verilmezse MINIGIT_AUTHOR ("Ad <eposta>") ve MINIGIT_DATE
("1700000000 +0000") ortam değişkenleri, o da yoksa "mini_git <mini_git@localhost>" ve şimdiki
zaman.

Genişletme: yeni komut → burada (ya da switch.py'de) bir işlev + `__main__.py`'de bir alt komut +
test.
"""

from __future__ import annotations

import heapq
import os
import re
import time
from dataclasses import dataclass, field

from .diff import unified_diff
from .merge import ancestors
from .objects import Commit, encode_commit, hash_object
from .repo import FlatTree, RepoError, Repository

_BRANCH_NAME = re.compile(r"^(?!-)(?!.*\.\.)[\w./-]+(?<![/.])$")


@dataclass(frozen=True)
class Signature:
    name: str
    email: str
    when: int
    tz: str = "+0000"

    def format(self) -> str:
        return f"{self.name} <{self.email}> {self.when} {self.tz}"


def default_signature() -> Signature:
    author = os.environ.get("MINIGIT_AUTHOR", "mini_git <mini_git@localhost>")
    match = re.fullmatch(r"\s*(.+?)\s*<([^>]*)>\s*", author)
    if match is None:
        raise RepoError("MINIGIT_AUTHOR 'Ad Soyad <eposta>' biçiminde olmalı.")
    date = os.environ.get("MINIGIT_DATE")
    if date:
        seconds, _, tz = date.partition(" ")
        return Signature(match.group(1), match.group(2), int(seconds), tz or "+0000")
    return Signature(match.group(1), match.group(2), int(time.time()))


def merge_state(repo: Repository) -> tuple[str | None, list[str]]:
    """(MERGE_HEAD, çözülmemiş çakışmalar)."""
    head_file, conflict_file = repo.gitdir / "MERGE_HEAD", repo.gitdir / "MERGE_CONFLICTS"
    merge_head = head_file.read_text(encoding="utf-8").strip() if head_file.exists() else None
    conflicts = (
        conflict_file.read_text(encoding="utf-8").split("\n") if conflict_file.exists() else []
    )
    return merge_head, [c for c in conflicts if c]


def clear_merge_state(repo: Repository) -> None:
    for name in ("MERGE_HEAD", "MERGE_CONFLICTS", "MERGE_MSG"):
        (repo.gitdir / name).unlink(missing_ok=True)


def add(repo: Repository, paths: list[str]) -> list[str]:
    """Yolları (dosya ya da klasör; "." = hepsi) hazırlık alanına alır; silinenleri index'ten
    çıkarır."""
    index, work = repo.read_index(), repo.working_files()
    touched: list[str] = []
    matched: set[str] = set()
    for given in paths:
        prefix = "" if given in (".", "") else given.strip("/")
        matching = [
            p
            for p in set(work) | set(index)
            if not prefix or p == prefix or p.startswith(prefix + "/")
        ]
        if not matching:
            raise RepoError(f"'{given}' hiçbir dosyaya uymadı.")
        matched.update(matching)
        for path in matching:
            if path in work:
                body = work[path].read_bytes()
                entry = (repo.file_mode(work[path]), repo.objects.write("blob", body))
                if index.get(path) != entry:
                    index[path] = entry
                    touched.append(path)
            elif path in index:
                del index[path]
                touched.append(path)
    repo.write_index(index)
    conflicts = merge_state(repo)[1]
    if conflicts:  # hazırlanan çakışma "çözüldü" sayılır
        remaining = [c for c in conflicts if c not in matched]
        (repo.gitdir / "MERGE_CONFLICTS").write_text("\n".join(remaining), encoding="utf-8")
    return sorted(touched)


def commit(repo: Repository, message: str, signature: Signature | None = None) -> str:
    merge_head, conflicts = merge_state(repo)
    if conflicts:
        raise RepoError(f"Çözülmemiş çakışmalar var: {', '.join(conflicts)}. Düzeltip `add` edin.")
    if not message.strip():
        raise RepoError('Kayıt iletisi boş olamaz: -m "ne değişti" yazın.')
    index = repo.read_index()
    parent = repo.head_commit()
    if parent is None and not index:
        raise RepoError("Kaydedilecek dosya yok: önce `add` çalıştırın.")
    tree = repo.write_tree(index)
    if parent is not None and merge_head is None and repo.objects.read_commit(parent).tree == tree:
        raise RepoError("Değişiklik yok: önce `add` ile değişiklikleri hazırlayın.")
    parents = tuple(p for p in (parent, merge_head) if p is not None)
    stamp = (signature or default_signature()).format()
    sha = repo.objects.write("commit", encode_commit(Commit(tree, parents, stamp, stamp, message)))
    repo.update_head(sha)
    clear_merge_state(repo)
    return sha


@dataclass
class Status:
    branch: str | None
    staged: dict[str, str] = field(default_factory=dict)  # yol → "yeni" | "değişti" | "silindi"
    unstaged: dict[str, str] = field(default_factory=dict)
    untracked: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not (self.staged or self.unstaged or self.conflicts)


def _compare(old: FlatTree, new: FlatTree) -> dict[str, str]:
    changes: dict[str, str] = {}
    for path in sorted(set(old) | set(new)):
        if path not in old:
            changes[path] = "yeni"
        elif path not in new:
            changes[path] = "silindi"
        elif old[path] != new[path]:
            changes[path] = "değişti"
    return changes


def working_tree(repo: Repository) -> FlatTree:
    """Çalışma ağacının (yazmadan hesaplanmış) düz ağacı."""
    return {
        path: (repo.file_mode(full), hash_object("blob", full.read_bytes()))
        for path, full in repo.working_files().items()
    }


def status(repo: Repository) -> Status:
    index = repo.read_index()
    work = working_tree(repo)
    ref = repo.head_ref()
    result = Status(ref.removeprefix("refs/heads/") if ref else None)
    result.staged = _compare(repo.commit_files(repo.head_commit()), index)
    result.unstaged = {p: k for p, k in _compare(index, work).items() if k != "yeni"}
    result.untracked = sorted(p for p in work if p not in index)
    result.conflicts = merge_state(repo)[1]
    return result


def log(
    repo: Repository, start: str = "HEAD", limit: int | None = None
) -> list[tuple[str, Commit]]:
    """Ulaşılabilen bütün commit'ler, yeniden eskiye (git log gibi; birleştirmede iki dal da)."""
    if start == "HEAD" and repo.head_commit() is None:
        return []
    first = repo.resolve(start)
    heap = [(-repo.objects.read_commit(first).timestamp, first)]
    seen = {first}
    result: list[tuple[str, Commit]] = []
    while heap and (limit is None or len(result) < limit):
        _, sha = heapq.heappop(heap)
        current = repo.objects.read_commit(sha)
        result.append((sha, current))
        for parent in current.parents:
            if parent not in seen:
                seen.add(parent)
                heapq.heappush(heap, (-repo.objects.read_commit(parent).timestamp, parent))
    return result


def diff(repo: Repository, staged: bool = False, revisions: tuple[str, ...] = ()) -> list[str]:
    """Varsayılan: index → çalışma ağacı; staged: HEAD → index; 1 sürüm: sürüm → çalışma ağacı;
    2 sürüm: birinci → ikinci."""
    if len(revisions) == 2:
        old = repo.commit_files(repo.resolve(revisions[0]))
        new = repo.commit_files(repo.resolve(revisions[1]))
    elif revisions:
        old, new = repo.commit_files(repo.resolve(revisions[0])), working_tree(repo)
    elif staged:
        old, new = repo.commit_files(repo.head_commit()), repo.read_index()
    else:
        old, new = repo.read_index(), working_tree(repo)
    files = repo.working_files()
    lines: list[str] = []
    for path, _ in _compare(old, new).items():
        before = repo.objects.read(old[path][1])[1] if path in old else b""
        if path in new:
            sha = new[path][1]
            after = (
                repo.objects.read(sha)[1] if repo.objects.exists(sha) else files[path].read_bytes()
            )
        else:
            after = b""
        lines.append(f"diff --minigit a/{path} b/{path}")
        if b"\0" in before or b"\0" in after:
            lines.append(f"İkili dosyalar farklı: {path}")
            continue
        a_name = f"a/{path}" if path in old else "/dev/null"
        b_name = f"b/{path}" if path in new else "/dev/null"
        lines += unified_diff(
            before.splitlines(keepends=True), after.splitlines(keepends=True), a_name, b_name
        )
    return lines


def branch(
    repo: Repository, name: str | None = None, delete: bool = False, force: bool = False
) -> list[str]:
    """Ad yoksa dalları listeler ("* " şimdiki); varsa oluşturur ya da (delete) siler."""
    current = repo.head_ref()
    if name is None:
        return [("* " if current == f"refs/heads/{b}" else "  ") + b for b in repo.names("heads")]
    if not _BRANCH_NAME.match(name):
        raise RepoError(f"'{name}' geçerli bir dal adı değil (boşluk, '..' ve baştaki '-' olmaz).")
    ref = f"refs/heads/{name}"
    if delete:
        sha = repo.read_ref(ref)
        if sha is None:
            raise RepoError(f"'{name}' diye bir dal yok.")
        if ref == current:
            raise RepoError("Üzerinde bulunduğunuz dalı silemezsiniz; önce başka dala geçin.")
        head = repo.head_commit()
        if not force and (head is None or sha not in ancestors(repo, head)):
            raise RepoError(
                f"'{name}' birleştirilmemiş değişiklikler içeriyor; yine de silmek için -D."
            )
        (repo.gitdir / ref).unlink()
        return []
    if repo.read_ref(ref) is not None:
        raise RepoError(f"'{name}' dalı zaten var.")
    head = repo.head_commit()
    if head is None:
        raise RepoError("Henüz commit yok: dal açmadan önce bir kayıt yapın.")
    repo.write_ref(ref, head)
    return []


def tag(repo: Repository, name: str, revision: str = "HEAD") -> str:
    if not _BRANCH_NAME.match(name) or repo.read_ref(f"refs/tags/{name}") is not None:
        raise RepoError(f"'{name}' etiketi geçersiz ya da zaten var.")
    sha = repo.resolve(revision)
    repo.write_ref(f"refs/tags/{name}", sha)
    return sha
