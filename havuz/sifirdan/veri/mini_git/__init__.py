"""mini_git: sürüm denetimi — içerik adresli nesneler (gerçek git'le aynı sha), index, dallar,
Myers farkı, üç yollu birleştirme.

Kullanım:
    from pathlib import Path
    from mini_git import Repository, add, commit, log
    repo = Repository.init(Path("proje"))
    add(repo, ["."])
    commit(repo, "İlk kayıt")
    [sha for sha, _ in log(repo)]

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .commands import Signature, Status, add, branch, commit, diff, log, status, tag
from .diff import edit_script, unified_diff
from .merge import merge3, merge_base
from .objects import Commit, ObjectError, TreeEntry, hash_object
from .repo import RepoError, Repository
from .switch import MergeResult, checkout, merge

__all__ = [
    "Commit",
    "MergeResult",
    "ObjectError",
    "RepoError",
    "Repository",
    "Signature",
    "Status",
    "TreeEntry",
    "add",
    "branch",
    "checkout",
    "commit",
    "diff",
    "edit_script",
    "hash_object",
    "log",
    "merge",
    "merge3",
    "merge_base",
    "status",
    "tag",
    "unified_diff",
]
