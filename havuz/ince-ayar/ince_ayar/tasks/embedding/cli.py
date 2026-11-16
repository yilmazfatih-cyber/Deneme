"""`gomme` görevinin eylemleri: dogrula, egit, degerlendir, disa-aktar, tahmin, uret.

Kim kullanır: `ince_ayar/registry.py`. `uret` eylemi belgelerden arama sorgusu ürettirir
(sentetik veri hattı, `sorgu` tarifi).

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
from ince_ayar.synth.cli import add_synth_arguments, run_synth
from ince_ayar.tasks.embedding.config import EmbeddingConfig

NAME = "gomme"


def _config(args: argparse.Namespace) -> EmbeddingConfig:
    return load_task_config(args, NAME, EmbeddingConfig)


def _validate(args: argparse.Namespace) -> int:
    from ince_ayar import console
    from ince_ayar.tasks.embedding.data import extra_documents, prepare_pairs, retrieval_set

    config = _config(args)
    splits = prepare_pairs(config.veri)
    for note in splits.notes:
        console.warn(note)
    data = retrieval_set(splits.validation, extra_documents(config.veri.ek_belgeler))
    console.result(
        t(
            "gomme.dogrula_ozet",
            egitim=len(splits.train),
            dogrulama=len(splits.validation),
            belge=len(data.documents),
            olumsuz=sum(1 for p in splits.train if p.negatives),
        )
    )
    console.result(t("dogrula.tamam"))
    return 0


def _add_train(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    parser.add_argument("--kuru", action="store_true", help=t("yardim.secenek.kuru"))


def _train(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.embedding.train import run_training

    run_training(_config(args), dry_run=args.kuru)
    return 0


def _add_evaluate(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    add_model_argument(parser)
    parser.add_argument("--veri", metavar="DOSYA", help=t("yardim.secenek.veri"))
    parser.add_argument("--onnx", action="store_true", help=t("yardim.secenek.onnx"))


def _evaluate(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.embedding.evaluate import evaluate_embedder

    evaluate_embedder(_config(args), args.model, args.veri, args.onnx)
    return 0


def _add_export(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    add_model_argument(parser)
    parser.add_argument("--cikti", metavar="KLASOR", help=t("yardim.secenek.onnx_cikti"))


def _export(args: argparse.Namespace) -> int:
    from ince_ayar.export.onnx import ONNX_DIR
    from ince_ayar.tasks.embedding.export import export_embedder

    config = _config(args)
    out = Path(args.cikti) if args.cikti else Path(config.egitim.cikti) / ONNX_DIR
    export_embedder(
        Path(args.model or config.egitim.cikti),
        out,
        config.disa_aktarim.int8,
        config.model.sorgu_oneki,
        config.model.belge_oneki,
    )
    return 0


def _add_predict(parser: argparse.ArgumentParser) -> None:
    add_model_argument(parser, required=True)
    parser.add_argument("--sorgu", action="append", default=[], help=t("yardim.secenek.sorgu"))
    parser.add_argument(
        "--belgeler", required=True, metavar="DOSYA", help=t("yardim.secenek.belgeler")
    )
    parser.add_argument("--k", type=int, default=5, help=t("yardim.secenek.k"))
    parser.add_argument("--onnx", action="store_true", help=t("yardim.secenek.onnx"))
    parser.add_argument("--sorgu-oneki", default="", help=t("yardim.secenek.sorgu_oneki"))
    parser.add_argument("--belge-oneki", default="", help=t("yardim.secenek.belge_oneki"))


def _predict(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.embedding.predict import search

    search(
        args.model, args.sorgu, args.belgeler, args.k, args.onnx, args.sorgu_oneki, args.belge_oneki
    )
    return 0


TASK = TaskSpec(
    name=NAME,
    help_key="yardim.gorev.gomme",
    description_key="yardim.gorev.gomme_aciklama",
    actions={
        "dogrula": Action("yardim.eylem.dogrula", add_config_arguments, _validate),
        "egit": Action("yardim.eylem.egit", _add_train, _train),
        "degerlendir": Action("yardim.eylem.degerlendir", _add_evaluate, _evaluate),
        "disa-aktar": Action("yardim.eylem.disa_aktar_onnx", _add_export, _export),
        "tahmin": Action("yardim.eylem.tahmin_gomme", _add_predict, _predict),
        "uret": Action("yardim.eylem.uret_sorgu", add_synth_arguments, run_synth),
    },
)
