"""Komutlar (2/2): checkout (dal/commit değiştirme) ve merge (hızlı ileri sarma ya da üç yollu).

Güvenlik kuralı: kaydedilmemiş değişiklik varken çalışma ağacını değiştiren komut REDDEDİLİR (veri
kaybı olmasın); izlenmeyen bir dosyanın üzerine yazılacaksa da reddedilir.

Genişletme: `merge --abort` için birleştirme öncesi index'i `ORIG_INDEX` olarak saklayıp geri
yükleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .commands import Signature, branch, commit, merge_state, status, working_tree
from .merge import merge_base, merge_trees
from .repo import FlatTree, RepoError, Repository


def _require_clean(repo: Repository) -> None:
    if merge_state(repo)[0] is not None:
        raise RepoError("Süren bir birleştirme var: çakışmaları çözüp `commit` edin.")
    state = status(repo)
    if not state.clean:
        changed = sorted({*state.staged, *state.unstaged})
        raise RepoError(
            f"Kaydedilmemiş değişiklikler var ({', '.join(changed)}). Önce commit edin."
        )


def _apply_tree(repo: Repository, old: FlatTree, new: FlatTree, extra: dict[str, bytes]) -> None:
    """Çalışma ağacını `old`'dan `new`'e taşır; `extra` (çakışma içerikleri) üstüne yazılır."""
    work = working_tree(repo)
    for path, entry in new.items():
        if path not in old and path in work and work[path] != entry and path not in extra:
            raise RepoError(
                f"İzlenmeyen '{path}' dosyasının üzerine yazılacaktı; taşıyın ya da silin."
            )
    for path in old:
        if path not in new and path not in extra:
            repo.remove_working_file(path)
    for path, (mode, sha) in new.items():
        if old.get(path) != (mode, sha) or path not in work:
            repo.write_working_file(path, mode, sha)
    for path, body in extra.items():
        target = repo.worktree / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
    repo.write_index(new)


def checkout(repo: Repository, target: str, create: bool = False) -> str:
    """Dala ya da commit'e geçer (commit'e geçince HEAD kopuk olur); geçilen commit'i döndürür."""
    if create:
        branch(repo, target)
        repo.set_head(target)
        head = repo.head_commit()
        assert head is not None
        return head
    _require_clean(repo)
    sha = repo.resolve(target)
    is_branch = repo.read_ref(f"refs/heads/{target}") is not None
    _apply_tree(repo, repo.commit_files(repo.head_commit()), repo.commit_files(sha), {})
    repo.set_head(target if is_branch else None, sha)
    return sha


@dataclass
class MergeResult:
    kind: str  # "guncel" (zaten güncel), "ileri" (hızlı ileri), "birlesik" (commit), "cakisma"
    commit: str | None = None
    conflicts: list[str] = field(default_factory=list)


def merge(repo: Repository, name: str, signature: Signature | None = None) -> MergeResult:
    _require_clean(repo)
    theirs = repo.resolve(name)
    ours = repo.head_commit()
    current = repo.commit_files(ours)
    base = merge_base(repo, ours, theirs) if ours is not None else None
    if ours is not None and base == theirs:
        return MergeResult("guncel", ours)
    if ours is None or base == ours:  # hızlı ileri sarma: yalnız işaretçi ilerler
        _apply_tree(repo, current, repo.commit_files(theirs), {})
        repo.update_head(theirs)
        return MergeResult("ileri", theirs)
    merged, conflicted, conflicts = merge_trees(
        repo, repo.commit_files(base), current, repo.commit_files(theirs), ("HEAD", name)
    )
    _apply_tree(repo, current, merged, conflicted)
    message = f"Merge branch '{name}'"
    if conflicts:
        (repo.gitdir / "MERGE_HEAD").write_text(theirs + "\n", encoding="utf-8")
        (repo.gitdir / "MERGE_CONFLICTS").write_text("\n".join(conflicts), encoding="utf-8")
        (repo.gitdir / "MERGE_MSG").write_text(message + "\n", encoding="utf-8")
        return MergeResult("cakisma", None, conflicts)
    (repo.gitdir / "MERGE_HEAD").write_text(theirs + "\n", encoding="utf-8")
    return MergeResult("birlesik", commit(repo, message, signature))
