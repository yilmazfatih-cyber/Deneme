"""Etkileşimli kabuk ya da tek komut/betik çalıştırma.

    python -m kabuk                      # istem: "kabuk:/yol$ "; çıkmak için exit ya da Ctrl+D
    python -m kabuk -c "ls | sort"       # tek satır; çıkış kodu kabuğun çıkış kodu olur
    python -m kabuk betik.sh             # dosyadaki satırları sırayla
Genişletme: satır düzenleme/geçmiş için `readline` modülünü içe aktarmak yeterlidir (Unix'te).
"""

from __future__ import annotations

import argparse
import contextlib
from pathlib import Path

from kabuk.executor import Shell, run_lines


def repl(shell: Shell) -> int:
    with contextlib.suppress(ImportError):
        import readline  # noqa: F401 - yalnız içe aktarılması geçmiş ve ok tuşlarını açar
    while shell.exit_code is None:
        try:
            line = input(f"kabuk:{shell.cwd}$ ")
        except EOFError:
            print()
            break
        except KeyboardInterrupt:
            print()
            continue
        shell.run(line)
        for number, job in list(shell.jobs.items()):
            status = job.status()
            if status is not None:
                print(f"[{number}] Bitti ({status})  {job.text}")
                del shell.jobs[number]
    return shell.exit_code if shell.exit_code is not None else shell.last_status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m kabuk", description="Sıfırdan mini kabuk")
    parser.add_argument("-c", dest="komut", help="tek bir komut satırı çalıştır")
    parser.add_argument("betik", nargs="?", help="satır satır çalıştırılacak dosya")
    args = parser.parse_args(argv)
    shell = Shell()
    try:
        if args.komut is not None:
            shell.run(args.komut)
            return shell.exit_code if shell.exit_code is not None else shell.last_status
        if args.betik:
            return run_lines(Path(args.betik).read_text(encoding="utf-8").splitlines(), shell)
        return repl(shell)
    finally:
        shell.close()


if __name__ == "__main__":
    raise SystemExit(main())
