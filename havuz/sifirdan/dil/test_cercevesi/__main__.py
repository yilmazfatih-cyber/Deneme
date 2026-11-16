"""Komut satırı: `python -m test_cercevesi [yol ...] [-k süzgeç] [-x] [-v] [--zaman-asimi sn]`.

Yol verilmezse bulunulan klasör taranır. Çıkış kodu: 0 hepsi geçti (ya da atlandı), 1 kalan ya da
hatalı test var, 2 hiç test bulunamadı.
Genişletme: yeni seçenek için `build_parser`'a argüman ekleyip `main`'de `run_all`'a geçirin.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from .discovery import collect, matches_keyword
from .report import failures, progress, summary
from .runner import ERROR, FAILED, run_all


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m test_cercevesi", description="Mini test çerçevesi"
    )
    parser.add_argument("yollar", nargs="*", type=Path, help="test dosyaları ya da klasörleri")
    parser.add_argument("-k", dest="suzgec", help="yalnız kimliğinde bu metin geçen testler")
    parser.add_argument(
        "-x", dest="ilk_hatada_dur", action="store_true", help="ilk kalan testte dur"
    )
    parser.add_argument(
        "-v", dest="ayrintili", action="store_true", help="her testi satır satır yaz"
    )
    parser.add_argument("--zaman-asimi", type=float, default=None, help="test başına süre (sn)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = args.yollar or [Path.cwd()]
    for path in paths:
        if not path.exists():
            print(f"Yol bulunamadı: {path}", file=sys.stderr)
            return 2
    started = time.perf_counter()
    cases, errors = collect(paths, base=Path.cwd())
    if args.suzgec:
        cases = [c for c in cases if matches_keyword(c.id, args.suzgec)]
    if not cases and not errors:
        print("Hiç test bulunamadı (test_*.py dosyalarında test_ ile başlayan işlevler aranır).")
        return 2
    print(f"test_cercevesi: {len(cases)} test toplandı")
    write = sys.stdout.write
    results = run_all(
        cases,
        errors,
        stop_first=args.ilk_hatada_dur,
        default_timeout=args.zaman_asimi,
        on_result=progress(args.ayrintili, write),
    )
    if not args.ayrintili:
        write("\n")
    write(failures(results))
    print(summary(results, time.perf_counter() - started))
    return 1 if any(r.outcome in (FAILED, ERROR) for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
