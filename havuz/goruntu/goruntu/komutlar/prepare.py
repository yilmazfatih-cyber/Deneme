"""Hazırlık komutları: `hazirla` (yön + boyut + biçim + üst veri temizliği) ve `temizle` (yalnız üst veri).

Kim kullanır: `goruntu/commands.py`. İş `hazirlik/batch.py` içindedir.

Güvenlik: kaynak klasörün içine çıktı yazılmaz (yanlışlıkla üzerine yazma olmasın); `temizle --yerinde`
açıkça istenirse dosyalar yerinde (atomik) yenilenir, biçimi değişecek dosyalar (BMP, TIFF, GIF) atlanır.

Genişletme: yeni bir seçenek için `_add_hazirla` içine argüman, `PrepareOptions`'a alan ekleyin.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from goruntu import console
from goruntu.errors import UserError
from goruntu.hazirlik.batch import (
    Outcome,
    PrepareOptions,
    clean_one,
    prepare_one,
    summarize,
    target_path,
)
from goruntu.hazirlik.metadata import EXTENSION, keeps_format
from goruntu.hazirlik.resize import FIT_MODES
from goruntu.io_utils import write_json
from goruntu.komutlar.base import Command, add_limit_arguments, limits_from
from goruntu.messages import t

FORMATS = ("webp", "jpeg", "png", "avif", "ayni")


def _sources(text: str) -> tuple[list[Path], Path]:
    from goruntu.kopya.scan import list_images

    root = Path(text)
    files = list_images(root)
    return files, root if root.is_dir() else root.parent


def _guard(root: Path, out_dir: Path) -> None:
    resolved_root, resolved_out = root.resolve(), out_dir.resolve()
    if resolved_out == resolved_root or resolved_out.is_relative_to(resolved_root):
        raise UserError(t("hazirla.cikti_kaynak_icinde", kaynak=root, cikti=out_dir))


def _report(outcomes: list[Outcome], path: Path | None) -> None:
    for outcome in outcomes:
        if outcome.status != "tamam":
            console.warn(outcome.message)
    summary = summarize(outcomes)
    console.result(t("hazirla.ozet", **{k: str(v) for k, v in summary.items()}))
    if path is not None:
        write_json(path, {"ozet": summary, "dosyalar": [o.to_dict() for o in outcomes]})
        console.result(t("hazirla.rapor", yol=path))


def _add_hazirla(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("girdi", metavar="GIRDI", help=t("yardim.secenek.girdi"))
    parser.add_argument("cikti", metavar="CIKTI", help=t("yardim.secenek.cikti_klasor"))
    parser.add_argument(
        "--boyut", type=int, default=1024, metavar="PIKSEL", help=t("yardim.secenek.boyut")
    )
    parser.add_argument(
        "--yukseklik", type=int, default=0, metavar="PIKSEL", help=t("yardim.secenek.yukseklik")
    )
    parser.add_argument("--kip", choices=FIT_MODES, default="sigdir", help=t("yardim.secenek.kip"))
    parser.add_argument("--bicim", choices=FORMATS, default="webp", help=t("yardim.secenek.bicim"))
    parser.add_argument(
        "--kalite", type=int, default=88, metavar="1-100", help=t("yardim.secenek.kalite")
    )
    parser.add_argument(
        "--kucuk-resim", type=int, default=0, metavar="PIKSEL", help=t("yardim.secenek.kucuk_resim")
    )
    parser.add_argument("--buyut", action="store_true", help=t("yardim.secenek.buyut"))
    parser.add_argument("--icc-sil", action="store_true", help=t("yardim.secenek.icc_sil"))
    add_limit_arguments(parser)


def _hazirla(args: argparse.Namespace) -> int:
    from goruntu.errors import ImageRejectedError
    from goruntu.hazirlik.loader import open_checked

    if not 1 <= args.kalite <= 100 or args.boyut < 1:
        raise UserError(t("hazirla.gecersiz_secenek"))
    files, root = _sources(args.girdi)
    out_dir = Path(args.cikti)
    _guard(root, out_dir)
    options = PrepareOptions(
        box=(args.boyut, args.yukseklik or args.boyut),
        mode=args.kip,
        fmt=None if args.bicim == "ayni" else args.bicim,
        quality=args.kalite,
        thumbnail_edge=args.kucuk_resim,
        upscale=args.buyut,
        keep_icc=not args.icc_sil,
    )
    limits = limits_from(args)
    outcomes, used = [], set()
    progress = console.Progress(t("hazirla.isleniyor"), len(files))
    for number, source in enumerate(files, start=1):
        fmt = options.fmt
        if fmt is None:
            try:
                fmt = keeps_format(open_checked(source, limits).format)
            except ImageRejectedError:
                fmt = "png"
        target = target_path(source, root, out_dir, fmt)
        if target in used:  # a.jpg ve a.png → aynı a.webp olmasın
            target = target.with_name(f"{source.stem}_{source.suffix.lstrip('.')}{EXTENSION[fmt]}")
        used.add(target)
        outcomes.append(prepare_one(source, target, options, limits, fmt))
        progress.step(number)
    _report(outcomes, out_dir / "hazirla_raporu.json")
    return 0


def _add_temizle(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("girdi", metavar="GIRDI", help=t("yardim.secenek.girdi"))
    parser.add_argument("--cikti", metavar="KLASOR", help=t("yardim.secenek.cikti_klasor"))
    parser.add_argument("--yerinde", action="store_true", help=t("yardim.secenek.yerinde"))
    parser.add_argument("--icc-sil", action="store_true", help=t("yardim.secenek.icc_sil"))
    parser.add_argument("--rapor", metavar="DOSYA", help=t("yardim.secenek.rapor"))
    add_limit_arguments(parser)


def _temizle(args: argparse.Namespace) -> int:
    if bool(args.cikti) == bool(args.yerinde):
        raise UserError(t("temizle.hedef_secin"))
    files, root = _sources(args.girdi)
    limits = limits_from(args)
    out_dir = Path(args.cikti) if args.cikti else None
    if out_dir is not None:
        _guard(root, out_dir)
    outcomes: list[Outcome] = []
    for source in files:
        base = target_path(source, root, out_dir, "png") if out_dir else source
        outcomes.append(clean_one(source, base, limits, not args.icc_sil, out_dir is None))
    default_report = out_dir / "temizlik_raporu.json" if out_dir else None
    _report(outcomes, Path(args.rapor) if args.rapor else default_report)
    return 0


HAZIRLA = Command("yardim.komut.hazirla", _add_hazirla, _hazirla)
TEMIZLE = Command("yardim.komut.temizle", _add_temizle, _temizle)
