"""Uçtan uca iş akışı: init → add → commit → branch → checkout → merge (ileri, temiz, çakışmalı) →
log."""

from __future__ import annotations

from pathlib import Path

import pytest

from mini_git import (
    RepoError,
    Repository,
    Signature,
    add,
    branch,
    checkout,
    commit,
    diff,
    log,
    merge,
    status,
    tag,
)
from mini_git.__main__ import main as cli_main

_clock = [1_700_000_000]


def sig() -> Signature:
    _clock[0] += 60  # her kayıt bir dakika sonra: log sırası belirlenimci
    return Signature("Deneme", "deneme@ornek.tr", _clock[0])


def write(repo: Repository, path: str, text: str) -> None:
    target = repo.worktree / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


@pytest.fixture
def repo(tmp_path: Path) -> Repository:
    created = Repository.init(tmp_path)
    write(created, "liste.txt", "elma\narmut\nkiraz\nmuz\nerik\n")
    write(created, "belge/not.md", "# Not\n")
    add(created, ["."])
    commit(created, "İlk kayıt", sig())
    return created


def test_status_add_commit_and_diff(repo: Repository) -> None:
    assert status(repo).clean
    write(repo, "liste.txt", "elma\nARMUT\nkiraz\nmuz\nerik\n")
    write(repo, "yeni.txt", "merhaba\n")
    (repo.worktree / "belge/not.md").unlink()
    state = status(repo)
    assert state.unstaged == {"belge/not.md": "silindi", "liste.txt": "değişti"}
    assert state.untracked == ["yeni.txt"]
    assert "-armut" in diff(repo) and "+ARMUT" in diff(repo)
    add(repo, ["."])
    state = status(repo)
    assert state.staged == {"belge/not.md": "silindi", "liste.txt": "değişti", "yeni.txt": "yeni"}
    assert not state.unstaged and not state.untracked
    assert "+merhaba" in diff(repo, staged=True)
    sha = commit(repo, "Değişiklikler", sig())
    assert status(repo).clean  # boş "belge/" klasörü kalır (git de klasör izlemez)
    with pytest.raises(RepoError, match="Değişiklik yok"):
        commit(repo, "boş", sig())
    assert repo.resolve("HEAD") == sha and repo.resolve(sha[:7]) == sha
    assert "-# Not" in diff(repo, revisions=("HEAD~1", "HEAD"))


def test_branch_checkout_and_fast_forward(repo: Repository) -> None:
    first = repo.resolve("HEAD")
    checkout(repo, "ozellik", create=True)
    write(repo, "ozellik.txt", "yeni özellik\n")
    add(repo, ["ozellik.txt"])
    feature = commit(repo, "Özellik", sig())
    checkout(repo, "main")
    assert not (repo.worktree / "ozellik.txt").exists()  # dal değişince dosya gitti
    result = merge(repo, "ozellik")
    assert (result.kind, result.commit) == ("ileri", feature)
    assert (repo.worktree / "ozellik.txt").read_text(encoding="utf-8") == "yeni özellik\n"
    assert merge(repo, "ozellik").kind == "guncel"
    assert branch(repo) == ["* main", "  ozellik"]
    tag(repo, "v1.0", first)
    checkout(repo, "v1.0")  # etikete geçince HEAD kopuk
    assert repo.head_ref() is None and repo.head_commit() == first


def test_three_way_merge_clean_and_conflicting(repo: Repository) -> None:
    checkout(repo, "dal", create=True)
    write(repo, "liste.txt", "elma\narmut\nkiraz\nmuz\nERİK\n")  # son satır
    add(repo, ["."])
    theirs = commit(repo, "Dalda erik", sig())
    checkout(repo, "main")
    write(repo, "liste.txt", "ELMA\narmut\nkiraz\nmuz\nerik\n")  # ilk satır
    add(repo, ["."])
    ours = commit(repo, "Ana dalda elma", sig())
    result = merge(repo, "dal", sig())
    assert result.kind == "birlesik" and result.commit is not None
    merged = repo.objects.read_commit(result.commit)
    assert merged.parents == (ours, theirs)
    assert (repo.worktree / "liste.txt").read_text(encoding="utf-8") == (
        "ELMA\narmut\nkiraz\nmuz\nERİK\n"
    )
    assert {sha for sha, _ in log(repo)} >= {ours, theirs, result.commit}

    checkout(repo, "dal")
    write(repo, "liste.txt", "elma\nARMUT (dal)\nkiraz\nmuz\nERİK\n")
    add(repo, ["."])
    commit(repo, "Dalda armut", sig())
    checkout(repo, "main")
    write(repo, "liste.txt", "ELMA\nARMUT (ana)\nkiraz\nmuz\nERİK\n")
    add(repo, ["."])
    commit(repo, "Ana dalda armut", sig())
    conflicted = merge(repo, "dal", sig())
    assert conflicted.kind == "cakisma" and conflicted.conflicts == ["liste.txt"]
    text = (repo.worktree / "liste.txt").read_text(encoding="utf-8")
    # Bizim taraf 1-2. satırları birlikte değiştirdi, onlar 2. satırı: bölgeler örtüşür, çakışma
    # ikisini de kapsar (git'in diff3'ü de aynı bloğu verir).
    assert text == (
        "<<<<<<< HEAD\nELMA\nARMUT (ana)\n=======\nelma\nARMUT (dal)\n>>>>>>> dal\n"
        "kiraz\nmuz\nERİK\n"
    )
    with pytest.raises(RepoError, match="Çözülmemiş çakışmalar"):
        commit(repo, "erken", sig())
    with pytest.raises(RepoError, match="Süren bir birleştirme"):
        checkout(repo, "dal")
    write(repo, "liste.txt", "ELMA\nARMUT (ikisi)\nkiraz\nmuz\nERİK\n")
    add(repo, ["liste.txt"])
    resolved = commit(repo, "Çakışma çözüldü", sig())
    assert len(repo.objects.read_commit(resolved).parents) == 2
    assert status(repo).clean


def test_safety_refusals(repo: Repository) -> None:
    checkout(repo, "dal", create=True)
    write(repo, "baska.txt", "dalda\n")
    add(repo, ["."])
    commit(repo, "Dal", sig())
    checkout(repo, "main")
    write(repo, "liste.txt", "kaydedilmemiş\n")
    with pytest.raises(RepoError, match="Kaydedilmemiş"):
        checkout(repo, "dal")
    write(repo, "liste.txt", "elma\narmut\nkiraz\nmuz\nerik\n")  # geri al
    write(repo, "baska.txt", "izlenmeyen farklı içerik\n")
    with pytest.raises(RepoError, match=r"İzlenmeyen 'baska\.txt'"):
        checkout(repo, "dal")
    (repo.worktree / "baska.txt").unlink()
    with pytest.raises(RepoError, match="birleştirilmemiş"):
        branch(repo, "dal", delete=True)
    with pytest.raises(RepoError, match="geçerli bir dal adı"):
        branch(repo, "kötü ad")
    with pytest.raises(RepoError, match="bulunamadı"):
        repo.resolve("yok")
    with pytest.raises(RepoError, match="zaten var"):
        Repository.init(repo.worktree)


def test_executable_bit_survives_checkout(repo: Repository) -> None:
    script = repo.worktree / "calistir.sh"
    script.write_text("#!/bin/sh\n", encoding="utf-8")
    script.chmod(0o755)
    add(repo, ["calistir.sh"])
    commit(repo, "Betik", sig())
    checkout(repo, "HEAD~1")
    assert not script.exists()
    checkout(repo, "main")
    assert script.stat().st_mode & 0o111


def test_cli(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("MINIGIT_AUTHOR", "Ayşe <ayse@ornek.tr>")
    monkeypatch.setenv("MINIGIT_DATE", "1700000000 +0000")
    assert cli_main(["init"]) == 0
    (tmp_path / "a.txt").write_text("bir\n", encoding="utf-8")
    assert cli_main(["add", "a.txt"]) == 0
    assert cli_main(["commit", "-m", "İlk"]) == 0
    assert cli_main(["log", "--oneline"]) == 0
    assert "İlk" in capsys.readouterr().out
    assert cli_main(["cat-file", "HEAD"]) == 0
    assert "author Ayşe <ayse@ornek.tr> 1700000000 +0000" in capsys.readouterr().out
    assert cli_main(["checkout", "yok"]) == 1
    assert "Hata:" in capsys.readouterr().err
    assert cli_main(["status"]) == 0
    assert "temiz" in capsys.readouterr().out
