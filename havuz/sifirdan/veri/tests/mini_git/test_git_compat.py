"""Gerçek git'le uyum: aynı dosyalar ve aynı yazar/tarihle blob, tree ve commit sha'ları AYNI
olmalı; gerçek git bizim nesne depomuzu okuyabilmeli. git kurulu değilse bu testler atlanır.

Bu makinede genel git ayarı commit'leri imzalıyor olabilir; testler git'i genel ve sistem ayarından
yalıtarak (GIT_CONFIG_GLOBAL/SYSTEM=/dev/null) koşar.
"""

from __future__ import annotations

import os
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from mini_git import Repository, Signature, add, commit, hash_object, log, merge3
from tests.yardimci import seed_count

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git kurulu değil")

FILES = {
    "a.txt": b"x\n",
    "a/b.txt": b"y\n",
    "a.b/c": b"z",  # satır sonu yok; ağaç sıralaması: a.b < a.txt < a (klasörler "a/" sayılır)
    "türkçe ağaç/şiir.md": "Işık, İzmir, ılık\n".encode(),
    "bos": b"",
}
NAME, EMAIL, WHEN = "Ayşe Yılmaz", "ayse@ornek.tr", 1_700_000_000


def _git(cwd: Path, *args: str) -> str:
    env = {
        **os.environ,
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_AUTHOR_DATE": f"{WHEN} +0000",
        "GIT_COMMITTER_DATE": f"{WHEN} +0000",
    }
    base = ["git", "-c", f"user.name={NAME}", "-c", f"user.email={EMAIL}"]
    base += ["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false"]
    result = subprocess.run([*base, *args], cwd=cwd, env=env, capture_output=True, check=True)
    return result.stdout.decode().strip()


def _write_files(root: Path) -> None:
    for relative, body in FILES.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    script = root / "calistir.sh"
    script.write_bytes(b"#!/bin/sh\necho merhaba\n")
    script.chmod(0o755)


def test_blob_tree_and_commit_hashes_match_real_git(tmp_path: Path) -> None:
    ours_dir, git_dir = tmp_path / "bizim", tmp_path / "gercek"
    for folder in (ours_dir, git_dir):
        folder.mkdir()
        _write_files(folder)
    repo = Repository.init(ours_dir)
    add(repo, ["."])
    signature = Signature(NAME, EMAIL, WHEN)
    first = commit(repo, "İlk kayıt", signature)
    (ours_dir / "a.txt").write_bytes(b"x\nikinci satir\n")
    add(repo, ["a.txt"])
    second = commit(repo, "İkinci kayıt\n\nAyrıntılı açıklama.", signature)

    _git(git_dir, "init", "-q", "-b", "main")
    _git(git_dir, "add", ".")
    _git(git_dir, "commit", "-q", "-m", "İlk kayıt")
    (git_dir / "a.txt").write_bytes(b"x\nikinci satir\n")
    _git(git_dir, "add", "a.txt")
    _git(git_dir, "commit", "-q", "-m", "İkinci kayıt\n\nAyrıntılı açıklama.")

    for relative, body in FILES.items():  # ilk commit'teki blob'lar
        assert hash_object("blob", body) == _git(git_dir, "rev-parse", f"HEAD~1:{relative}")
    assert repo.objects.read_commit(first).tree == _git(git_dir, "rev-parse", "HEAD~1^{tree}")
    assert first == _git(git_dir, "rev-parse", "HEAD~1")
    assert second == _git(git_dir, "rev-parse", "HEAD")
    assert [sha for sha, _ in log(repo)] == [second, first]


def test_real_git_reads_our_object_store(tmp_path: Path) -> None:
    _write_files(tmp_path)
    repo = Repository.init(tmp_path)
    add(repo, ["."])
    sha = commit(repo, "Kayıt", Signature(NAME, EMAIL, WHEN))
    gitdir = str(repo.gitdir)
    assert _git(tmp_path, "--git-dir", gitdir, "rev-parse", "HEAD") == sha
    assert _git(tmp_path, "--git-dir", gitdir, "cat-file", "-p", "HEAD:a/b.txt") == "y"
    assert "100755 blob" in _git(tmp_path, "--git-dir", gitdir, "ls-tree", "HEAD")
    # index biçimimiz git'inkinden farklıdır (bilerek metin); fsck yalnız NESNELERİ denetlesin diye
    # nesneleri boş bir çıplak git deposuna kopyalayıp orada denetliyoruz.
    bare = tmp_path.parent / f"{tmp_path.name}-ciplak.git"
    _git(tmp_path.parent, "init", "-q", "--bare", str(bare))
    shutil.copytree(repo.objects.root, bare / "objects", dirs_exist_ok=True)
    (bare / "refs" / "heads" / "main").write_text(sha + "\n", encoding="utf-8")
    _git(bare, "--git-dir", str(bare), "fsck", "--strict", "--no-dangling")


def _edit(rng: random.Random, base: list[bytes], side: str) -> list[bytes]:
    """Tabanı rastgele değiştirir; yeni satırlar benzersizdir (hizalama belirsizliği olmasın)."""
    result: list[bytes] = []
    for number, line in enumerate(base):
        roll = rng.random()
        if roll < 0.15:
            continue  # sil
        if roll < 0.3:
            result.append(f"{side}-degisti-{number}\n".encode())
        else:
            result.append(line)
        if rng.random() < 0.1:
            result.append(f"{side}-eklendi-{number}\n".encode())
    return result


def test_three_way_merge_matches_git_merge_file(tmp_path: Path) -> None:
    rng = random.Random(7)
    agreed_clean = 0
    for case in range(seed_count(40, 400)):
        base = [f"satir {n}\n".encode() for n in range(rng.randint(3, 12))]
        ours, theirs = _edit(rng, base, "bizim"), _edit(rng, base, "onlarin")
        paths = []
        for name, lines in (("bizim", ours), ("taban", base), ("onlarin", theirs)):
            path = tmp_path / f"{case}-{name}"
            path.write_bytes(b"".join(lines))
            paths.append(str(path))
        env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull}
        reference = subprocess.run(
            ["git", "merge-file", "-p", "-L", "HEAD", "-L", "taban", "-L", "dal", *paths],
            capture_output=True,
            env=env,
            check=False,
        )
        merged, conflict = merge3(base, ours, theirs, "HEAD", "dal")
        assert conflict == (reference.returncode > 0), f"durum {case}"
        if not conflict:
            assert b"".join(merged) == reference.stdout, f"durum {case}"
            agreed_clean += 1
    assert agreed_clean > 5
