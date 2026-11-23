"""Kopya komutları: `kopya-bul` (bir klasördeki yakın kopya grupları) ve `sizinti` (iki küme arası).

Kim kullanır: `goruntu/commands.py`. İş `kopya/` paketindedir.

`kopya-bul --tasi KLASOR`: her gruptan EN İYİSİ (en çok piksel, sonra en büyük dosya) yerinde kalır,
ötekiler aynı göreli yolla KLASOR'e TAŞINIR (silinmez); `tasima_kaydi.json` geri almak için yazılır.
`sizinti`: eğitimdeki bir görüntünün yakın kopyası sınama kümesinde varsa listeler; varsa çıkış kodu 1
(CI'da "sızıntı yok" denetimi olarak kullanılabilir).

Genişletme: "en iyisi" kuralını değiştirmek için `_keeper_key` işlevini düzenleyin ve
`tests/test_cli.py` içindeki kopya-bul testini güncelleyin.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Any

from goruntu import console
from goruntu.io_utils import write_json
from goruntu.komutlar.base import Command, add_json_argument, add_limit_arguments, limits_from
from goruntu.messages import t


def _add_method_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--yontem",
        choices=("phash", "dhash", "ahash"),
        default="phash",
        help=t("yardim.secenek.yontem"),
    )
    parser.add_argument(
        "--esik", type=int, default=None, metavar="BIT", help=t("yardim.secenek.esik")
    )
    add_limit_arguments(parser)
    add_json_argument(parser)


def _threshold(args: argparse.Namespace) -> int:
    from goruntu.kopya.scan import DEFAULT_THRESHOLDS

    return int(args.esik) if args.esik is not None else DEFAULT_THRESHOLDS[args.yontem]


def _keeper_key(image: Any) -> tuple[int, int, str]:
    """Büyük olan iyidir: piksel sayısı, dosya boyutu; eşitlikte kısa/alfabetik yol."""
    return (-image.width * image.height, -image.size_bytes, str(image.path))


def _add_kopya_bul(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("klasor", metavar="KLASOR", help=t("yardim.secenek.klasor"))
    _add_method_arguments(parser)
    parser.add_argument("--tasi", metavar="KLASOR", help=t("yardim.secenek.tasi"))


def _kopya_bul(args: argparse.Namespace) -> int:
    from goruntu.kopya.groups import distances, duplicate_groups, group_members
    from goruntu.kopya.scan import list_images, scan_files

    root = Path(args.klasor)
    scan = scan_files(list_images(root), args.yontem, limits_from(args))
    matrix = scan.matrix()
    labels, _ = duplicate_groups(matrix, _threshold(args))
    groups: list[list[dict[str, Any]]] = []
    for members in group_members(labels):
        ordered = sorted(members, key=lambda i: _keeper_key(scan.images[i]))
        keeper = matrix[ordered[0] : ordered[0] + 1]
        rows = []
        for member in ordered:
            image = scan.images[member]
            gap = int(distances(keeper, matrix[member : member + 1])[0, 0])
            rows.append(
                {
                    "yol": str(image.path),
                    "genislik": image.width,
                    "yukseklik": image.height,
                    "bayt": image.size_bytes,
                    "uzaklik": gap,
                }
            )
        groups.append(rows)
    for number, rows in enumerate(groups, start=1):
        console.result(t("kopya.grup", sira=number, sayi=len(rows)))
        for position, row in enumerate(rows):
            tag = t("kopya.tut") if position == 0 else t("kopya.kopya", uzaklik=row["uzaklik"])
            console.result(f"  {tag:<20} {row['genislik']}×{row['yukseklik']}  {row['yol']}")
    for _path, _reason, message in scan.rejected:
        console.warn(message)
    console.result(
        t(
            "kopya.ozet",
            grup=len(groups),
            fazla=sum(len(g) - 1 for g in groups),
            toplam=len(scan.images),
        )
    )
    if args.json:
        write_json(
            Path(args.json), {"esik": _threshold(args), "yontem": args.yontem, "gruplar": groups}
        )
    if args.tasi:
        _move(groups, root, Path(args.tasi))
    return 0


def _move(groups: list[list[dict[str, Any]]], root: Path, target_dir: Path) -> None:
    moves = []
    for rows in groups:
        for row in rows[1:]:
            source = Path(row["yol"])
            relative = (
                source.relative_to(root) if source.is_relative_to(root) else Path(source.name)
            )
            target = target_dir / relative
            if target.exists():
                console.warn(t("kopya.hedef_var", yol=target))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
            moves.append({"nereden": str(source), "nereye": str(target)})
    write_json(target_dir / "tasima_kaydi.json", moves)
    console.result(t("kopya.tasindi", sayi=len(moves), yol=target_dir))


def _add_sizinti(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--egitim", required=True, metavar="KLASOR", help=t("yardim.secenek.egitim")
    )
    parser.add_argument(
        "--sinama", required=True, metavar="KLASOR", help=t("yardim.secenek.sinama")
    )
    _add_method_arguments(parser)


def _sizinti(args: argparse.Namespace) -> int:
    from goruntu.kopya.groups import cross_pairs
    from goruntu.kopya.scan import list_images, scan_files

    limits = limits_from(args)
    train = scan_files(
        list_images(Path(args.egitim)), args.yontem, limits, t("kopya.egitim_taraniyor")
    )
    test = scan_files(
        list_images(Path(args.sinama)), args.yontem, limits, t("kopya.sinama_taraniyor")
    )
    pairs = cross_pairs(train.matrix(), test.matrix(), _threshold(args))
    rows = [
        {
            "egitim": str(train.images[p.left].path),
            "sinama": str(test.images[p.right].path),
            "uzaklik": p.distance,
        }
        for p in pairs
    ]
    for row in rows:
        console.result(f"{row['uzaklik']:>3}  {row['egitim']}  ↔  {row['sinama']}")
    leaked = len({row["sinama"] for row in rows})
    console.result(t("kopya.sizinti_ozeti", sayi=leaked, toplam=len(test.images)))
    if args.json:
        write_json(Path(args.json), {"esik": _threshold(args), "ciftler": rows})
    return 1 if rows else 0


KOPYA_BUL = Command("yardim.komut.kopya_bul", _add_kopya_bul, _kopya_bul)
SIZINTI = Command("yardim.komut.sizinti", _add_sizinti, _sizinti)
