"""`veri` araçları: dogrula (yalnız biçim), ayir (sızıntısız), sizinti, kart, donustur.

Kim kullanır: `ince_ayar/registry.py`. Bu araçlar model istemez; anında çalışır.

Örnekler:
    python -m ince_ayar veri dogrula --bicim sohbet --girdi ornekler/sohbet.jsonl
    python -m ince_ayar veri ayir --bicim siniflandirma --girdi veri.csv --cikti veri/bolunmus
    python -m ince_ayar veri sizinti --bicim sohbet --egitim egitim.jsonl --test test.jsonl
    python -m ince_ayar veri kart --bicim sohbet --girdi veri.jsonl --cikti VERI_KARTI.md
    python -m ince_ayar veri donustur --kaynak-bicim alpaca --girdi alpaca.json --cikti sohbet.jsonl

Genişletme: yeni araç için `_add_<ad>` ve `_<ad>` işlevleri yazıp `TASK.actions` içine ekleyin.
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from ince_ayar import console
from ince_ayar.actions import Action, TaskSpec
from ince_ayar.data.formats import FORMATS
from ince_ayar.messages import t


def _add_common(parser: argparse.ArgumentParser, input_required: bool = True) -> None:
    parser.add_argument(
        "--bicim", required=True, choices=sorted(FORMATS), help=t("yardim.secenek.bicim")
    )
    if input_required:
        parser.add_argument(
            "--girdi", required=True, metavar="DOSYA", help=t("yardim.secenek.girdi")
        )
    parser.add_argument("--kodlama", default="utf-8", help=t("yardim.secenek.kodlama"))
    parser.add_argument("--grup-alani", default="", help=t("yardim.secenek.grup_alani"))


def _validate(args: argparse.Namespace) -> int:
    loaded = FORMATS[args.bicim].load(Path(args.girdi), args.kodlama, args.grup_alani)
    for issue in loaded.warnings:
        console.warn(issue.render())
    loaded.raise_if_errors()
    console.result(t("veri.gecerli", yol=args.girdi, sayi=len(loaded.rows)))
    return 0


def _add_split(parser: argparse.ArgumentParser) -> None:
    _add_common(parser)
    parser.add_argument("--cikti", required=True, metavar="KLASOR", help=t("yardim.secenek.cikti"))
    parser.add_argument("--oranlar", default="0.8,0.1,0.1", help=t("yardim.secenek.oranlar"))
    parser.add_argument("--benzerlik", type=float, default=0.85, help=t("yardim.secenek.benzerlik"))
    parser.add_argument("--tohum", type=int, default=42, help=t("yardim.secenek.tohum"))


def _split(args: argparse.Namespace) -> int:
    from ince_ayar.data.split import SPLIT_ORDER, leak_free_split
    from ince_ayar.io_utils import write_json, write_jsonl

    spec = FORMATS[args.bicim]
    loaded = spec.load(Path(args.girdi), args.kodlama, args.grup_alani)
    loaded.raise_if_errors()
    rows = loaded.rows
    ratios = dict(zip(SPLIT_ORDER, (float(x) for x in args.oranlar.split(",")), strict=False))
    result = leak_free_split(
        [spec.text(row) for row in rows],
        ratios,
        seed=args.tohum,
        labels=[spec.label(row) for row in rows] if spec.label else None,
        groups=[row.group for row in rows],
        similarity=args.benzerlik,
    )
    out = Path(args.cikti)
    for name, indices in result.indices.items():
        write_jsonl(out / f"{name}.jsonl", [spec.to_dict(rows[i]) for i in indices])
    report = result.report
    write_json(
        out / "ayrim_raporu.json",
        {
            "girdi": args.girdi,
            "tohum": args.tohum,
            "oranlar": ratios,
            "boyutlar": report.sizes,
            "etiketler": report.label_counts,
            "grup_sayisi": report.group_count,
            "tam_yineleme": report.exact_duplicates,
            "yakin_yineleme": report.near_duplicates,
            "en_buyuk_grup": report.largest_group,
            "notlar": report.notes,
        },
    )
    console.result(t("veri.ayrildi", boyutlar=report.sizes, grup=report.group_count, yol=out))
    for note in report.notes:
        console.warn(note)
    return 0


def _add_leak(parser: argparse.ArgumentParser) -> None:
    _add_common(parser, input_required=False)
    parser.add_argument(
        "--egitim", required=True, metavar="DOSYA", help=t("yardim.secenek.egitim_dosyasi")
    )
    parser.add_argument(
        "--test", required=True, metavar="DOSYA", help=t("yardim.secenek.test_dosyasi")
    )
    parser.add_argument("--benzerlik", type=float, default=0.85, help=t("yardim.secenek.benzerlik"))


def _leak(args: argparse.Namespace) -> int:
    from ince_ayar.data.split import count_leaks

    spec = FORMATS[args.bicim]
    train = spec.load(Path(args.egitim), args.kodlama, "")
    test = spec.load(Path(args.test), args.kodlama, "")
    train.raise_if_errors()
    test.raise_if_errors()
    leaks = count_leaks(
        [spec.text(r) for r in train.rows], [spec.text(r) for r in test.rows], args.benzerlik
    )
    console.result(t("veri.sizinti_sonuc", sayi=leaks, toplam=len(test.rows)))
    return 1 if leaks else 0


def _add_card(parser: argparse.ArgumentParser) -> None:
    _add_common(parser)
    parser.add_argument(
        "--cikti", required=True, metavar="DOSYA.md", help=t("yardim.secenek.cikti_dosya")
    )
    parser.add_argument("--ad", default="", help=t("yardim.secenek.ad"))
    parser.add_argument("--lisans", default="", help=t("yardim.secenek.lisans"))
    parser.add_argument("--kaynak", default="", help=t("yardim.secenek.kaynak"))
    parser.add_argument("--dil", default="Türkçe", help=t("yardim.secenek.dil"))


def _card(args: argparse.Namespace) -> int:
    from ince_ayar.data.card import (
        UNKNOWN,
        CardInput,
        describe_provenance,
        describe_warnings,
        render_card,
    )
    from ince_ayar.io_utils import sha256_file

    spec = FORMATS[args.bicim]
    path = Path(args.girdi)
    loaded = spec.load(path, args.kodlama, args.grup_alani)
    loaded.raise_if_errors()
    extras = [getattr(row, "extra", {}) for row in loaded.rows]
    data = CardInput(
        ad=args.ad or path.stem,
        gorev=args.bicim,
        dosya=str(path),
        ozet=sha256_file(path),
        sayi=len(loaded.rows),
        dil=args.dil,
        lisans=args.lisans or UNKNOWN,
        kaynak=args.kaynak or UNKNOWN,
        uretim=describe_provenance(extras),
        dagilim=spec.describe(loaded.rows),
        uzunluk=t("veri.kart_uzunluk"),
        uyarilar=describe_warnings(loaded.warnings),
    )
    Path(args.cikti).write_text(render_card(data, date.today()), encoding="utf-8")
    console.result(t("veri.kart_yazildi", yol=args.cikti))
    return 0


def _add_convert(parser: argparse.ArgumentParser) -> None:
    from ince_ayar.data.convert import CONVERTERS

    parser.add_argument(
        "--kaynak-bicim",
        required=True,
        choices=sorted(CONVERTERS),
        help=t("yardim.secenek.kaynak_bicim"),
    )
    parser.add_argument("--girdi", required=True, metavar="DOSYA", help=t("yardim.secenek.girdi"))
    parser.add_argument(
        "--cikti", required=True, metavar="DOSYA.jsonl", help=t("yardim.secenek.cikti_dosya")
    )


def _convert(args: argparse.Namespace) -> int:
    from ince_ayar.data.convert import CONVERTERS
    from ince_ayar.io_utils import read_json, read_rows, write_jsonl

    path = Path(args.girdi)
    rows = (
        read_json(path) if path.suffix == ".json" else [r.data for r in read_rows(path) if r.data]
    )
    converter = CONVERTERS[args.kaynak_bicim]
    count = write_jsonl(Path(args.cikti), ({"messages": converter(row)} for row in rows))
    console.result(t("veri.donusturuldu", sayi=count, yol=args.cikti))
    return 0


TASK = TaskSpec(
    name="veri",
    help_key="yardim.gorev.veri",
    description_key="yardim.gorev.veri_aciklama",
    actions={
        "dogrula": Action("yardim.eylem.veri_dogrula", _add_common, _validate),
        "ayir": Action("yardim.eylem.ayir", _add_split, _split),
        "sizinti": Action("yardim.eylem.sizinti", _add_leak, _leak),
        "kart": Action("yardim.eylem.kart", _add_card, _card),
        "donustur": Action("yardim.eylem.donustur", _add_convert, _convert),
    },
)
