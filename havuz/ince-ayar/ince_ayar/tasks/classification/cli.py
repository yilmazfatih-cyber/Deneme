"""`siniflandirma` görevinin eylemleri: dogrula, egit, degerlendir, disa-aktar, tahmin.

Kim kullanır: `ince_ayar/registry.py`. Ağır içe aktarmalar eylemlerin içindedir.

Genişletme: yeni eylem için `_add_<ad>` ve `_<ad>` işlevlerini yazıp `TASK.actions` içine ekleyin.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ince_ayar.actions import (
    Action,
    TaskSpec,
    add_config_arguments,
    add_model_argument,
    load_task_config,
)
from ince_ayar.messages import t
from ince_ayar.tasks.classification.config import ClassificationConfig

NAME = "siniflandirma"


def _config(args: argparse.Namespace) -> ClassificationConfig:
    return load_task_config(args, NAME, ClassificationConfig)


def _validate(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.classification.check import check_classification_data

    return check_classification_data(_config(args))


def _add_train(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    parser.add_argument("--kuru", action="store_true", help=t("yardim.secenek.kuru"))
    parser.add_argument("--surdur", action="store_true", help=t("yardim.secenek.surdur"))


def _train(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.classification.train import run_training

    run_training(_config(args), dry_run=args.kuru, resume=args.surdur)
    return 0


def _add_evaluate(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    add_model_argument(parser)
    parser.add_argument("--veri", metavar="DOSYA", help=t("yardim.secenek.veri"))
    parser.add_argument("--onnx", action="store_true", help=t("yardim.secenek.onnx"))


def _evaluate(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.classification.evaluate import evaluate_classifier

    evaluate_classifier(_config(args), args.model, args.veri, args.onnx)
    return 0


def _add_export(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    add_model_argument(parser)
    parser.add_argument("--cikti", metavar="KLASOR", help=t("yardim.secenek.onnx_cikti"))


def _export(args: argparse.Namespace) -> int:
    from ince_ayar.export.onnx import ONNX_DIR
    from ince_ayar.tasks.classification.data import prepare_splits
    from ince_ayar.tasks.classification.export import export_classifier

    config = _config(args)
    model_path = Path(args.model or config.egitim.cikti)
    splits = prepare_splits(config.veri)
    samples = [row.text for row in (splits.test or splits.validation)][:16]
    out = Path(args.cikti) if args.cikti else Path(config.egitim.cikti) / ONNX_DIR
    export_classifier(model_path, out, config.disa_aktarim.int8, config.veri.azami_uzunluk, samples)
    return 0


def _add_predict(parser: argparse.ArgumentParser) -> None:
    add_model_argument(parser, required=True)
    parser.add_argument("--metin", action="append", default=[], help=t("yardim.secenek.metin"))
    parser.add_argument("--girdi", metavar="DOSYA", help=t("yardim.secenek.girdi"))
    parser.add_argument("--cikti", metavar="DOSYA.jsonl", help=t("yardim.secenek.cikti_dosya"))
    parser.add_argument("--onnx", action="store_true", help=t("yardim.secenek.onnx"))
    parser.add_argument(
        "--azami-uzunluk", type=int, default=128, help=t("yardim.secenek.azami_uzunluk")
    )


def _predict(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.classification.predict import predict_texts

    predict_texts(args.model, args.metin, args.girdi, args.cikti, args.onnx, args.azami_uzunluk)
    return 0


TASK = TaskSpec(
    name=NAME,
    help_key="yardim.gorev.siniflandirma",
    description_key="yardim.gorev.siniflandirma_aciklama",
    actions={
        "dogrula": Action("yardim.eylem.dogrula", add_config_arguments, _validate),
        "egit": Action("yardim.eylem.egit", _add_train, _train),
        "degerlendir": Action("yardim.eylem.degerlendir", _add_evaluate, _evaluate),
        "disa-aktar": Action("yardim.eylem.disa_aktar_onnx", _add_export, _export),
        "tahmin": Action("yardim.eylem.tahmin", _add_predict, _predict),
    },
)
