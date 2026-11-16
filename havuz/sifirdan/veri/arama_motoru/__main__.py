"""Komut satırı: dizin kur, ara, tamamla.

    python -m arama_motoru dizinle <klasör|dosya.jsonl> <dizin.json.gz>
    python -m arama_motoru ara <dizin.json.gz> "sorgu" [--sayi 10]
    python -m arama_motoru tamamla <dizin.json.gz> <önek>

Klasörde her `.txt` bir belgedir (başlık = dosya adı). JSONL'de her satır
{"id": "...", "baslik": "...", "govde": "..."}.

Genişletme: yeni alt komut → `_parser`'a ekleyin, `main`'de bir dal açın.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .index import InvertedIndex
from .search import complete, did_you_mean, search


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m arama_motoru", description="Tam metin arama")
    sub = parser.add_subparsers(dest="komut", required=True)
    build = sub.add_parser("dizinle", help="belgelerden dizin kur")
    build.add_argument("kaynak", type=Path)
    build.add_argument("dizin", type=Path)
    find = sub.add_parser("ara", help="dizinde ara")
    find.add_argument("dizin", type=Path)
    find.add_argument("sorgu")
    find.add_argument("--sayi", type=int, default=10)
    finish = sub.add_parser("tamamla", help="ön eki tamamla")
    finish.add_argument("dizin", type=Path)
    finish.add_argument("onek")
    return parser


def _documents(source: Path) -> list[tuple[str, dict[str, str]]]:
    if source.is_dir():
        return [
            (path.stem, {"baslik": path.stem, "govde": path.read_text(encoding="utf-8")})
            for path in sorted(source.glob("*.txt"))
        ]
    documents = []
    for number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), start=1):
        if line.strip():
            record = json.loads(line)
            if not isinstance(record, dict) or "id" not in record:
                raise ValueError(
                    f"{source}:{number}: her satır 'id' alanı olan bir JSON nesnesi olmalı"
                )
            fields = {k: str(v) for k, v in record.items() if k in ("baslik", "govde")}
            documents.append((str(record["id"]), fields))
    return documents


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.komut == "dizinle":
        index = InvertedIndex()
        for doc_id, fields in _documents(args.kaynak):
            index.add(doc_id, fields)
        index.save(args.dizin)
        print(f"{len(index)} belge dizinlendi → {args.dizin}")
        return 0
    index = InvertedIndex.load(args.dizin)
    if args.komut == "tamamla":
        print("\n".join(complete(index, args.onek)))
        return 0
    hits = search(index, args.sorgu, limit=args.sayi)
    if not hits:
        suggestion = did_you_mean(index, args.sorgu)
        hint = f" Bunu mu demek istediniz: {suggestion}" if suggestion else ""
        print(f"Sonuç yok.{hint}", file=sys.stderr)
        return 1
    for hit in hits:
        print(f"{hit.score:7.3f}  {hit.doc_id}  {hit.snippet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
