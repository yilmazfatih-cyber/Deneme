"""Komut satırı: `python -m ml_temel egit | tahmin | degerlendir | rapor`.

  egit         CSV → model.npz + rapor.md + model_karti.md + metrikler.json (+ rapor.html)
  tahmin       model.npz + yeni CSV → tahmin sütunları eklenmiş CSV (girdiyle aynı biçimde)
  degerlendir  model.npz + etiketli CSV → ölçütler ve güven aralıkları (Markdown)
  rapor        model.npz → raporu yeniden yazar (dosyada saklanan sonuçlardan)
Hatalar Türkçe ve yol gösterici yazılır; çıkış kodu: 0 başarı, 2 kullanıcı/veri hatası.
Genişletme: yeni komut = `build_parser`'a alt komut + `_cmd_<ad>` fonksiyonu + `COMMANDS` kaydı.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from ml_temel.persistence import ModelFileError, load_model, save_model
from ml_temel.tablo.csv_reader import CsvFormat, read_csv, write_csv
from ml_temel.tablo.evaluation import TargetInfo, bootstrap_metrics, model_output
from ml_temel.tablo.html_report import render_html
from ml_temel.tablo.messages import t
from ml_temel.tablo.model import TabularModel
from ml_temel.tablo.model_card import render_model_card
from ml_temel.tablo.report import num, render_report
from ml_temel.tablo.schema import label_text
from ml_temel.tablo.training import TrainingConfig, train


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m ml_temel", description=t("cli_aciklama"))
    commands = parser.add_subparsers(dest="komut", required=True)
    egit = commands.add_parser("egit", help=t("cli_egit"))
    egit.add_argument("--veri", required=True, help=t("arg_veri"))
    egit.add_argument("--hedef", required=True, help=t("arg_hedef"))
    egit.add_argument("--zaman", help=t("arg_zaman"))
    egit.add_argument("--grup", help=t("arg_grup"))
    egit.add_argument("--gorev", choices=["siniflandirma", "regresyon"], help=t("arg_gorev"))
    egit.add_argument("--pozitif", help=t("arg_pozitif"))
    egit.add_argument("--cikti", help=t("arg_cikti_klasor"))
    egit.add_argument("--modeller", default="dogrusal,orman,artirma", help=t("arg_modeller"))
    egit.add_argument("--hizli", action="store_true", help=t("arg_hizli"))
    egit.add_argument("--html", action="store_true", help=t("arg_html"))
    egit.add_argument("--tohum", type=int, default=0, help=t("arg_tohum"))
    egit.add_argument("--ayirici", help=t("arg_ayirici"))
    egit.add_argument("--ondalik", choices=[",", "."], help=t("arg_ondalik"))
    tahmin = commands.add_parser("tahmin", help=t("cli_tahmin"))
    tahmin.add_argument("--model", required=True, help=t("arg_model"))
    tahmin.add_argument("--veri", required=True, help=t("arg_veri"))
    tahmin.add_argument("--cikti", help=t("arg_cikti_dosya"))
    tahmin.add_argument("--esik", type=float, help=t("arg_esik"))
    degerlendir = commands.add_parser("degerlendir", help=t("cli_degerlendir"))
    degerlendir.add_argument("--model", required=True, help=t("arg_model"))
    degerlendir.add_argument("--veri", required=True, help=t("arg_veri"))
    degerlendir.add_argument("--cikti", help=t("arg_cikti_dosya"))
    rapor = commands.add_parser("rapor", help=t("cli_rapor"))
    rapor.add_argument("--model", required=True, help=t("arg_model"))
    rapor.add_argument("--cikti", help=t("arg_cikti_dosya"))
    rapor.add_argument("--html", action="store_true", help=t("arg_html"))
    return parser


def _json_ready(value: Any) -> Any:
    """NaN/∞ değerlerini JSON'un kabul ettiği `null`a çevirir."""
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print(t("yazildi", yol=path))


def _progress(message: str) -> None:
    print(message, file=sys.stderr)


def _cmd_egit(args: argparse.Namespace) -> int:
    started = time.perf_counter()
    table, fmt = read_csv(args.veri, delimiter=args.ayirici, decimal=args.ondalik)
    print(t("ilerleme_okundu", satir=len(table), sutun=len(table.names), bicim=fmt.describe()))
    if fmt.encoding == "cp1254":
        print(t("csv_kodlama"))
    config = TrainingConfig(
        target=args.hedef,
        time_column=args.zaman,
        group_column=args.grup,
        task=args.gorev,
        positive=args.pozitif,
        models=tuple(name.strip() for name in args.modeller.split(",") if name.strip()),
        fast=args.hizli,
        random_state=args.tohum,
        source_name=Path(args.veri).name,
        csv_format=fmt.describe(),
    )
    model, results = train(table, config, datetime.now().astimezone(), _progress)
    folder = Path(args.cikti) if args.cikti else Path("ciktilar") / Path(args.veri).stem
    model_path = folder / "model.npz"
    csv_info = {"encoding": fmt.encoding, "delimiter": fmt.delimiter, "decimal": fmt.decimal}
    save_model(model, model_path, metadata={"sonuclar": results, "csv": csv_info})
    print(t("yazildi", yol=model_path))
    markdown = render_report(results, str(model_path))
    _write(folder / "rapor.md", markdown)
    _write(folder / "model_karti.md", render_model_card(results))
    _write(
        folder / "metrikler.json", json.dumps(_json_ready(results), ensure_ascii=False, indent=2)
    )
    if args.html:
        _write(folder / "rapor.html", render_html(results, markdown))
    elapsed = time.perf_counter() - started
    print(t("ilerleme_bitti", sure=num(elapsed, 1), model=t(f"model_{results['en_iyi']}")))
    return 0


def _load(path: str) -> tuple[TabularModel, dict[str, Any]]:
    model, extra = load_model(path)
    if not isinstance(model, TabularModel):
        raise ModelFileError(f"{path} bir tablo modeli değil.")
    return model, extra


def _cmd_tahmin(args: argparse.Namespace) -> int:
    model, _ = _load(args.model)
    if args.esik is not None:
        model.threshold = args.esik
    table, fmt = read_csv(args.veri)
    if model.task == "regresyon":
        output = table.with_column("tahmin", model.predict(table))
    else:
        assert model.classes is not None
        labels = [label_text(value) for value in model.predict(table).tolist()]
        output = table.with_column("tahmin", np.array(labels, dtype=object))
        probabilities = np.round(model.predict_proba(table), 6)
        for column, label in enumerate(model.classes.tolist()):
            output = output.with_column(f"olasilik_{label_text(label)}", probabilities[:, column])
    source = Path(args.veri)
    target = Path(args.cikti) if args.cikti else source.with_name(source.stem + "_tahmin.csv")
    write_csv(output, target, CsvFormat(fmt.encoding, fmt.delimiter, fmt.decimal))
    print(t("tahmin_yazildi", satir=len(table), yol=target))
    return 0


def _target_values(model: TabularModel, column: Any) -> Any:
    if column.dtype.kind == "f":
        present = ~np.isnan(column)
    else:
        present = np.array([value is not None for value in column.tolist()], dtype=bool)
    if model.task == "regresyon":
        return present, column[present].astype(np.float64)
    values = column[present]
    assert model.classes is not None
    if model.classes.dtype.kind != "f":
        values = np.array([str(v) for v in values.tolist()], dtype=object)
    known_labels = [label_text(c) for c in model.classes.tolist()]
    unknown = sorted({label_text(v) for v in values.tolist()} - set(known_labels))
    if unknown:
        known = ", ".join(known_labels)
        raise ValueError(t("bilinmeyen_sinif", siniflar=", ".join(unknown), bilinen=known))
    return present, values


def _cmd_degerlendir(args: argparse.Namespace) -> int:
    model, _ = _load(args.model)
    table, _ = read_csv(args.veri)
    if model.target not in table:
        raise ValueError(t("hedef_yok_degerlendir", hedef=model.target))
    present, y = _target_values(model, table[model.target])
    if not present.any():
        raise ValueError(t("hedef_yok_degerlendir", hedef=model.target))
    rows = table.take_rows(np.flatnonzero(present))
    info = TargetInfo(model.task, model.classes, model.positive_class, model.threshold)
    results = bootstrap_metrics(y, model_output(model, rows, info), info, 1000, 0)
    lines = [
        t("degerlendirme_baslik", dosya=Path(args.veri).name, satir=len(rows)),
        "",
        t("degerlendirme_tablo"),
        "|---|---|---|",
    ]
    for metric, result in results.items():
        interval = f"{num(result.low)} – {num(result.high)}"
        lines.append(f"| {t(f'olcut_{metric}')} | {num(result.estimate)} | {interval} |")
    text = "\n".join(lines) + "\n"
    print(text)
    if args.cikti:
        _write(Path(args.cikti), text)
    return 0


def _cmd_rapor(args: argparse.Namespace) -> int:
    _, extra = _load(args.model)
    results = extra["sonuclar"]
    markdown = render_report(results, args.model)
    target = Path(args.cikti) if args.cikti else Path(args.model).with_name("rapor.md")
    _write(target, markdown)
    if args.html:
        _write(target.with_suffix(".html"), render_html(results, markdown))
    return 0


COMMANDS: dict[str, Callable[[argparse.Namespace], int]] = {
    "egit": _cmd_egit,
    "tahmin": _cmd_tahmin,
    "degerlendir": _cmd_degerlendir,
    "rapor": _cmd_rapor,
    # YENİ KOMUT BURAYA
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return COMMANDS[args.komut](args)
    except (ValueError, KeyError, OSError, MemoryError) as error:  # ModelFileError ⊂ ValueError
        print(t("hata_genel", ileti=error), file=sys.stderr)
        print(t("hata_ipucu"), file=sys.stderr)
        return 2
