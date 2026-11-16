"""Komut satırı: `python -m mini_git <komut>` (git'in alışılmış komut adları; açıklamalar Türkçe).

    init · add <yol...> · commit -m "ileti" · status · log [--oneline] [-n N] · diff [--staged]
    [sürüm...] branch [ad] [-d|-D ad] · tag <ad> [sürüm] · checkout [-b] <dal|commit> · merge <dal>
    · cat-file <sha>

Genişletme: yeni alt komut → `_parser`'a ekleyin, `_run`'da bir dal açın; iş mantığı commands.py'de.
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import commands, switch
from .objects import MODE_TREE, Commit, ObjectError, decode_tree
from .repo import RepoError, Repository


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m mini_git", description="Küçük sürüm denetimi")
    sub = parser.add_subparsers(dest="komut", required=True)
    sub.add_parser("init", help="bu klasörde depo kur")
    sub.add_parser("add", help="değişiklikleri hazırla").add_argument("yollar", nargs="+")
    commit = sub.add_parser("commit", help="hazırlananları kaydet")
    commit.add_argument("-m", "--message", required=True)
    sub.add_parser("status", help="durum")
    log = sub.add_parser("log", help="geçmiş")
    log.add_argument("--oneline", action="store_true")
    log.add_argument("-n", type=int, default=None)
    diff = sub.add_parser("diff", help="fark")
    diff.add_argument("--staged", action="store_true")
    diff.add_argument("surumler", nargs="*")
    branch = sub.add_parser("branch", help="dalları listele / aç / sil")
    branch.add_argument("ad", nargs="?")
    branch.add_argument("-d", dest="sil", action="store_true")
    branch.add_argument("-D", dest="zorla", action="store_true")
    tag = sub.add_parser("tag", help="etiket koy")
    tag.add_argument("ad")
    tag.add_argument("surum", nargs="?", default="HEAD")
    checkout = sub.add_parser("checkout", help="dala ya da commit'e geç")
    checkout.add_argument("-b", dest="yeni", action="store_true")
    checkout.add_argument("hedef")
    sub.add_parser("merge", help="dalı birleştir").add_argument("dal")
    sub.add_parser("cat-file", help="nesneyi göster").add_argument("sha")
    return parser


def _relative(repo: Repository, given: str) -> str:
    full = (Path.cwd() / given).resolve()
    try:
        return full.relative_to(repo.worktree).as_posix().removeprefix(".")
    except ValueError:
        raise RepoError(f"'{given}' deponun dışında.") from None


def _run(args: argparse.Namespace) -> list[str]:
    if args.komut == "init":
        repo = Repository.init(Path.cwd())
        return [f"Boş depo kuruldu: {repo.gitdir}"]
    repo = Repository.discover(Path.cwd())
    if args.komut == "add":
        commands.add(repo, [_relative(repo, p) or "." for p in args.yollar])
        return []
    if args.komut == "commit":
        sha = commands.commit(repo, args.message)
        return [f"[{repo.head_ref() or 'kopuk HEAD'} {sha[:7]}] {args.message}"]
    if args.komut == "status":
        return _format_status(commands.status(repo))
    if args.komut == "log":
        return _format_log(commands.log(repo, limit=args.n), args.oneline)
    if args.komut == "diff":
        return commands.diff(repo, args.staged, tuple(args.surumler))
    if args.komut == "branch":
        return commands.branch(repo, args.ad, delete=args.sil or args.zorla, force=args.zorla)
    if args.komut == "tag":
        return [commands.tag(repo, args.ad, args.surum)]
    if args.komut == "checkout":
        sha = switch.checkout(repo, args.hedef, create=args.yeni)
        return [f"'{args.hedef}' → {sha[:7]}"]
    if args.komut == "merge":
        result = switch.merge(repo, args.dal)
        texts = {
            "guncel": "Zaten güncel.",
            "ileri": "Hızlı ileri sarıldı.",
            "birlesik": "Birleştirildi.",
        }
        if result.kind == "cakisma":
            return [
                "ÇAKIŞMA: " + ", ".join(result.conflicts),
                "Düzeltin, `add` edin, `commit` edin.",
            ]
        return [f"{texts[result.kind]} ({(result.commit or '')[:7]})"]
    return _cat_file(repo, args.sha)


def _format_status(state: commands.Status) -> list[str]:
    lines = [f"Dal: {state.branch}" if state.branch else "HEAD kopuk"]
    for title, items in (("Kayda hazır:", state.staged), ("Hazırlanmamış:", state.unstaged)):
        if items:
            lines += [title] + [f"    {kind}: {path}" for path, kind in items.items()]
    if state.untracked:
        lines += ["İzlenmeyen:"] + [f"    {path}" for path in state.untracked]
    if state.conflicts:
        lines += ["Çakışan:"] + [f"    {path}" for path in state.conflicts]
    if state.clean and not state.untracked:
        lines.append("Çalışma ağacı temiz.")
    return lines


def _format_log(entries: list[tuple[str, Commit]], oneline: bool) -> list[str]:
    lines: list[str] = []
    for sha, item in entries:
        title = item.message.splitlines()[0] if item.message else ""
        if oneline:
            lines.append(f"{sha[:7]} {title}")
            continue
        name, _, rest = item.author.rpartition(">")
        when = datetime.fromtimestamp(int(rest.split()[0]), tz=UTC).strftime("%Y-%m-%d %H:%M UTC")
        lines += [f"commit {sha}", f"Yazar: {name}>", f"Tarih: {when}", ""]
        lines += ["    " + line for line in item.message.rstrip("\n").splitlines()] + [""]
    return lines


def _cat_file(repo: Repository, sha: str) -> list[str]:
    kind, body = repo.objects.read(repo.resolve(sha))
    if kind == "tree":
        return [
            f"{e.mode.zfill(6)} {'tree' if e.mode == MODE_TREE else 'blob'} {e.sha}\t{e.name}"
            for e in decode_tree(body)
        ]
    return body.decode("utf-8", errors="replace").splitlines()


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        for line in _run(args):
            print(line)
    except (RepoError, ObjectError) as error:
        print(f"Hata: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
