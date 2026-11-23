"""Sınıflandırma komutları: `egit`, `degerlendir`, `tahmin`, `disa-aktar`.

Kim kullanır: `goruntu/commands.py`. Ağır içe aktarmalar işlevlerin içindedir (yardım anında açılsın).

Genişletme: yeni bir sınıflandırma komutu için `_add_<ad>` + `_<ad>` yazıp dosya sonuna
`Command(...)` ekleyin, sonra `commands.py` sözlüğüne kaydedin.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from goruntu import console
from goruntu.errors import UserError
from goruntu.io_utils import read_json, write_json
from goruntu.komutlar.base import (
    Command,
    add_config_arguments,
    add_json_argument,
    add_limit_arguments,
    limits_from,
)
from goruntu.messages import t


def _add_egit(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    parser.add_argument("--kuru", action="store_true", help=t("yardim.secenek.kuru"))


def _egit(args: argparse.Namespace) -> int:
    from goruntu.config import load_config, resolve_config_path
    from goruntu.siniflandirma.config import ClassifierConfig
    from goruntu.siniflandirma.train import run_training

    path = resolve_config_path(args.ayar, args.hazir)
    run_training(load_config(path, ClassifierConfig, args.degistir), dry_run=args.kuru)
    return 0


def _add_model_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, metavar="KLASOR", help=t("yardim.secenek.model"))
    parser.add_argument("--onnx", action="store_true", help=t("yardim.secenek.onnx"))
    parser.add_argument("--int8", action="store_true", help=t("yardim.secenek.int8"))
    add_limit_arguments(parser)


def _add_degerlendir(parser: argparse.ArgumentParser) -> None:
    _add_model_arguments(parser)
    parser.add_argument("--veri", metavar="KLASOR", help=t("yardim.secenek.veri"))
    add_json_argument(parser)


def _evaluation_files(args: argparse.Namespace, labels: list[str]) -> tuple[list[Path], list[int]]:
    from goruntu.siniflandirma.dataset import discover
    from goruntu.siniflandirma.predict import training_dir_of

    if args.veri:
        discovery = discover(Path(args.veri))
        samples = discovery.all_samples
        if discovery.predefined is not None:  # hazır ayrımda eğitim görüntüleri ölçülmez
            parts = discovery.predefined
            samples = parts.get("test") or parts.get("dogrulama") or samples
        unknown = sorted({s.label for s in samples} - set(labels))
        if unknown:
            raise UserError(t("degerlendirme.bilinmeyen_sinif", siniflar=", ".join(unknown)))
        return [s.path for s in samples], [labels.index(s.label) for s in samples]
    folder = training_dir_of(Path(args.model))
    if folder is None:
        raise UserError(t("degerlendirme.veri_gerekli", yol=args.model))
    parts = read_json(folder / "ayrim.json")["parcalar"]
    rows = parts.get("test") or parts.get("dogrulama") or []
    return [Path(row["dosya"]) for row in rows], [labels.index(row["etiket"]) for row in rows]


def _degerlendir(args: argparse.Namespace) -> int:
    import numpy as np

    from goruntu.siniflandirma.evaluate import evaluate_logits, render_text
    from goruntu.siniflandirma.predict import iterate_logits, load_classifier

    classifier = load_classifier(Path(args.model), args.onnx, args.int8)
    paths, truth = _evaluation_files(args, classifier.labels)
    label_of = dict(zip(paths, truth, strict=True))
    names, chunks, labels = [], [], []
    for opened, logits, failed in iterate_logits(classifier, paths, limits_from(args)):
        names += [str(p) for p in opened]
        labels += [label_of[p] for p in opened]
        chunks.append(logits)
        for path, message in failed:
            console.warn(t("degerlendirme.atlandi", yol=path, ayrinti=message))
    logits_all = np.concatenate(chunks) if chunks else np.zeros((0, len(classifier.labels)))
    result = evaluate_logits(logits_all, labels, names, classifier.decision)
    console.result(render_text(result))
    if args.json:
        write_json(Path(args.json), result)
    return 0


def _add_tahmin(parser: argparse.ArgumentParser) -> None:
    _add_model_arguments(parser)
    parser.add_argument(
        "goruntuler", nargs="+", metavar="GORUNTU", help=t("yardim.secenek.goruntuler")
    )
    parser.add_argument("--ilk", type=int, default=3, metavar="K", help=t("yardim.secenek.ilk"))
    add_json_argument(parser)


def _tahmin(args: argparse.Namespace) -> int:
    from goruntu.disa_aktar.runtime import predictions_from
    from goruntu.kopya.scan import list_images
    from goruntu.siniflandirma.predict import iterate_logits, load_classifier

    classifier = load_classifier(Path(args.model), args.onnx, args.int8)
    paths = [p for item in args.goruntuler for p in list_images(Path(item))]
    rows = []
    for opened, logits, failed in iterate_logits(classifier, paths, limits_from(args)):
        probabilities = classifier.decision.probabilities(logits)
        predictions = predictions_from(probabilities, classifier.decision, args.ilk)
        for path, prediction in zip(opened, predictions, strict=True):
            rows.append({"dosya": str(path), **prediction.to_dict()})
            label = prediction.etiket or t("tahmin.emin_degil")
            console.result(f"{path}\t{label}\t{prediction.guven:.3f}")
        for path, message in failed:
            console.warn(message)
            rows.append({"dosya": str(path), "hata": message})
    if args.json:
        write_json(Path(args.json), rows)
    return 0


def _add_disa_aktar(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, metavar="KLASOR", help=t("yardim.secenek.model"))
    parser.add_argument("--cikti", metavar="KLASOR", help=t("yardim.secenek.paket_cikti"))
    parser.add_argument("--int8-yok", action="store_true", help=t("yardim.secenek.int8_yok"))


def _disa_aktar(args: argparse.Namespace) -> int:
    from goruntu.disa_aktar.onnx_export import export_classifier
    from goruntu.errors import ImageRejectedError
    from goruntu.hazirlik.loader import load_rgb
    from goruntu.siniflandirma.predict import training_dir_of

    folder = training_dir_of(Path(args.model))
    samples = []
    if folder is not None:
        parts = read_json(folder / "ayrim.json")["parcalar"]
        for row in (parts.get("test") or parts.get("dogrulama") or [])[:16]:
            try:
                samples.append(load_rgb(Path(row["dosya"])))
            except ImageRejectedError:
                continue
    out = Path(args.cikti) if args.cikti else None
    info = export_classifier(Path(args.model), out, not args.int8_yok, samples)
    checks = info["dogrulama"]
    console.result(
        t("onnx.bitti", klasor=info["klasor"], fark=f"{checks['fp32_en_buyuk_fark']:.2e}")
    )
    if "int8_karar_uyumu" in checks:
        console.result(t("onnx.int8_ozet", uyum=f"{checks['int8_karar_uyumu']:.1%}"))
    return 0


EGIT = Command("yardim.komut.egit", _add_egit, _egit)
DEGERLENDIR = Command("yardim.komut.degerlendir", _add_degerlendir, _degerlendir)
TAHMIN = Command("yardim.komut.tahmin", _add_tahmin, _tahmin)
DISA_AKTAR = Command("yardim.komut.disa_aktar", _add_disa_aktar, _disa_aktar)
