"""Depo: `.minigit/` klasörü, başvurular (HEAD, dallar, etiketler), hazırlık alanı (index) ve
çalışma ağacı.

    .minigit/
    ├─ HEAD              "ref: refs/heads/main" ya da (kopuk) bir commit sha'sı
    ├─ objects/ab/cd...  zlib'li nesneler (gerçek git de okuyabilir)
    ├─ refs/heads/main   dalın gösterdiği commit
    ├─ refs/tags/v1      etiketin gösterdiği commit
    ├─ index             "MINIGIT-INDEX 1" + her satır "<kip> <sha>\\t<yol>" (yola göre sıralı)
    └─ MERGE_HEAD        yalnız çakışmalı birleştirme sürerken (+ MERGE_CONFLICTS, MERGE_MSG)

Genişletme: `.gitignore` desteği için `working_files`'a bir süzgeç ekleyin; büyük depolarda her
`status`'ta dosya özetini yeniden hesaplamamak için index'e boyut + değişme zamanı yazın.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

from .objects import (
    MODE_EXECUTABLE,
    MODE_FILE,
    MODE_TREE,
    ObjectError,
    ObjectStore,
    TreeEntry,
    encode_tree,
)

GITDIR = ".minigit"
INDEX_HEADER = "MINIGIT-INDEX 1"
FlatTree = dict[str, tuple[str, str]]  # yol → (kip, sha)


class RepoError(Exception):
    """Kullanıcıya gösterilecek, ne yapılacağını söyleyen hata."""


class Repository:
    def __init__(self, worktree: Path) -> None:
        self.worktree = worktree.resolve()
        self.gitdir = self.worktree / GITDIR
        self.objects = ObjectStore(self.gitdir)

    @classmethod
    def init(cls, path: Path, branch: str = "main") -> Repository:
        repo = cls(path)
        if repo.gitdir.exists():
            raise RepoError(f"{repo.gitdir} zaten var: burada bir depo kurulu.")
        for folder in ("objects", "refs/heads", "refs/tags"):
            (repo.gitdir / folder).mkdir(parents=True)
        (repo.gitdir / "HEAD").write_text(f"ref: refs/heads/{branch}\n", encoding="utf-8")
        repo.write_index({})
        return repo

    @classmethod
    def discover(cls, start: Path) -> Repository:
        for folder in [start.resolve(), *start.resolve().parents]:
            if (folder / GITDIR).is_dir():
                return cls(folder)
        raise RepoError("Burada mini_git deposu yok. Önce `python -m mini_git init` çalıştırın.")

    # ── Başvurular ──────────────────────────────────────────────────────────────────────────────

    def head_ref(self) -> str | None:
        """HEAD bir dalı gösteriyorsa "refs/heads/<ad>", kopuksa None."""
        content = (self.gitdir / "HEAD").read_text(encoding="utf-8").strip()
        return content[5:] if content.startswith("ref: ") else None

    def head_commit(self) -> str | None:
        ref = self.head_ref()
        if ref is None:
            return (self.gitdir / "HEAD").read_text(encoding="utf-8").strip()
        return self.read_ref(ref)

    def read_ref(self, name: str) -> str | None:
        path = self.gitdir / name
        return path.read_text(encoding="utf-8").strip() if path.is_file() else None

    def write_ref(self, name: str, sha: str) -> None:
        path = self.gitdir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(sha + "\n", encoding="utf-8")
        os.replace(temporary, path)

    def set_head(self, branch: str | None, sha: str | None = None) -> None:
        content = f"ref: refs/heads/{branch}" if branch is not None else str(sha)
        (self.gitdir / "HEAD").write_text(content + "\n", encoding="utf-8")

    def update_head(self, sha: str) -> None:
        """HEAD'in gösterdiği dalı (kopuksa HEAD'in kendisini) `sha`ya ilerletir."""
        ref = self.head_ref()
        if ref is None:
            self.set_head(None, sha)
        else:
            self.write_ref(ref, sha)

    def names(self, kind: str) -> list[str]:
        folder = self.gitdir / "refs" / kind
        return sorted(str(p.relative_to(folder)) for p in folder.rglob("*") if p.is_file())

    def resolve(self, revision: str) -> str:
        """HEAD, dal, etiket, (kısa) sha ve `~N` (N. ilk ebeveyn) çözer."""
        base, tilde, back = revision.partition("~")
        if tilde and back and not back.isdigit():
            raise RepoError(f"'{revision}': ~ işaretinden sonra sayı bekleniyordu (ör. HEAD~2).")
        steps = (int(back) if back else 1) if tilde else 0
        sha: str | None
        if base == "HEAD":
            sha = self.head_commit()
        else:
            sha = self.read_ref(f"refs/heads/{base}") or self.read_ref(f"refs/tags/{base}")
            if sha is None:
                matches = self.objects.expand(base.lower())
                if len(matches) > 1:
                    raise RepoError(f"'{base}' birden çok nesneye uyuyor; daha uzun yazın.")
                sha = matches[0] if matches else None
        if sha is None:
            raise RepoError(f"'{revision}' bulunamadı (dal, etiket ya da commit değil).")
        for _ in range(steps):
            parents = self.objects.read_commit(sha).parents
            if not parents:
                raise RepoError(f"'{revision}': bu kadar geriye ebeveyn yok.")
            sha = parents[0]
        return sha

    # ── Hazırlık alanı (index) ─────────────────────────────────────────────────────────────────

    def read_index(self) -> FlatTree:
        lines = (self.gitdir / "index").read_text(encoding="utf-8").splitlines()
        if not lines or lines[0] != INDEX_HEADER:
            raise RepoError("index dosyası tanınmadı; .minigit/index bozuk olabilir.")
        entries: FlatTree = {}
        for line in lines[1:]:
            meta, _, path = line.partition("\t")
            mode, sha = meta.split(" ")
            entries[path] = (mode, sha)
        return entries

    def write_index(self, entries: FlatTree) -> None:
        lines = [INDEX_HEADER] + [f"{m} {s}\t{p}" for p, (m, s) in sorted(entries.items())]
        temporary = self.gitdir / "index.tmp"
        temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.replace(temporary, self.gitdir / "index")

    # ── Çalışma ağacı ───────────────────────────────────────────────────────────────────────────

    def working_files(self) -> dict[str, Path]:
        """Çalışma ağacındaki dosyalar: "/" ayraçlı göreli yol → mutlak yol (.minigit hariç)."""
        found: dict[str, Path] = {}
        for folder, subfolders, files in os.walk(self.worktree):
            subfolders[:] = sorted(d for d in subfolders if d != GITDIR)
            for name in files:
                path = Path(folder) / name
                if path.is_file() and not path.is_symlink():
                    found[path.relative_to(self.worktree).as_posix()] = path
        return found

    @staticmethod
    def file_mode(path: Path) -> str:
        return MODE_EXECUTABLE if path.stat().st_mode & stat.S_IXUSR else MODE_FILE

    def write_working_file(self, relative: str, mode: str, sha: str) -> None:
        kind, body = self.objects.read(sha)
        if kind != "blob":
            raise ObjectError(f"{relative} için blob bekleniyordu")
        target = self.worktree / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        target.chmod(0o755 if mode == MODE_EXECUTABLE else 0o644)

    def remove_working_file(self, relative: str) -> None:
        target = self.worktree / relative
        target.unlink(missing_ok=True)
        parent = target.parent
        while parent != self.worktree and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()  # boşalan klasörleri de kaldır
            parent = parent.parent

    # ── Ağaçlar ─────────────────────────────────────────────────────────────────────────────────

    def write_tree(self, entries: FlatTree) -> str:
        """Düz yol listesinden iç içe tree nesneleri yazar; kök tree'nin sha'sını döndürür."""
        children: dict[str, FlatTree] = {}
        here: list[TreeEntry] = []
        for path, (mode, sha) in entries.items():
            head, slash, rest = path.partition("/")
            if slash:
                children.setdefault(head, {})[rest] = (mode, sha)
            else:
                here.append(TreeEntry(mode, head, sha))
        for name, sub in children.items():
            here.append(TreeEntry(MODE_TREE, name, self.write_tree(sub)))
        return self.objects.write("tree", encode_tree(here))

    def flatten_tree(self, tree_sha: str, prefix: str = "") -> FlatTree:
        flat: FlatTree = {}
        for entry in self.objects.read_tree(tree_sha):
            path = prefix + entry.name
            if entry.mode == MODE_TREE:
                flat.update(self.flatten_tree(entry.sha, path + "/"))
            else:
                flat[path] = (entry.mode, entry.sha)
        return flat

    def commit_files(self, sha: str | None) -> FlatTree:
        """Bir commit'in dosyaları (sha None ise boş: henüz commit yok)."""
        return {} if sha is None else self.flatten_tree(self.objects.read_commit(sha).tree)
