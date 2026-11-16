"""`varlik` (varlık tanıma) görevinin eylemleri: dogrula, egit, degerlendir, tahmin.

Kim kullanır: `ince_ayar/registry.py`. ONNX'e aktarım bu görevde yoktur (README "Sınırlar").

Genişletme: yeni eylem için `_add_<ad>` ve `_<ad>` işlevlerini yazıp `TASK.actions` içine ekleyin.
"""

from __future__ import annotations

import argparse

from ince_ayar.actions import (
    Action,
    TaskSpec,
    add_config_arguments,
    add_model_argument,
    load_task_config,
)
from ince_ayar.messages import t
from ince_ayar.tasks.ner.config import NerConfig

NAME = "varlik"


def _config(args: argparse.Namespace) -> NerConfig:
    return load_task_config(args, NAME, NerConfig)


def _validate(args: argparse.Namespace) -> int:
    from collections import Counter

    from ince_ayar import console
    from ince_ayar.tasks.ner.data import prepare_tagged

    splits = prepare_tagged(_config(args).veri)
    for note in splits.notes:
        console.warn(note)
    kinds = Counter(tag[2:] for row in splits.train for tag in row.tags if tag.startswith("B-"))
    console.result(
        t(
            "varlik.dogrula_ozet",
            egitim=len(splits.train),
            dogrulama=len(splits.validation),
            turler=dict(sorted(kinds.items())),
        )
    )
    console.result(t("dogrula.tamam"))
    return 0


def _add_train(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    parser.add_argument("--kuru", action="store_true", help=t("yardim.secenek.kuru"))
    parser.add_argument("--surdur", action="store_true", help=t("yardim.secenek.surdur"))


def _train(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.ner.train import run_training

    run_training(_config(args), dry_run=args.kuru, resume=args.surdur)
    return 0


def _add_evaluate(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    add_model_argument(parser)
    parser.add_argument("--veri", metavar="DOSYA", help=t("yardim.secenek.veri"))


def _evaluate(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.ner.predict import evaluate_ner

    evaluate_ner(_config(args), args.model, args.veri)
    return 0


def _add_predict(parser: argparse.ArgumentParser) -> None:
    add_model_argument(parser, required=True)
    parser.add_argument("--metin", action="append", default=[], help=t("yardim.secenek.metin"))
    parser.add_argument(
        "--azami-uzunluk", type=int, default=128, help=t("yardim.secenek.azami_uzunluk")
    )


def _predict(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.ner.predict import predict_entities

    predict_entities(args.model, args.metin, args.azami_uzunluk)
    return 0


TASK = TaskSpec(
    name=NAME,
    help_key="yardim.gorev.varlik",
    description_key="yardim.gorev.varlik_aciklama",
    actions={
        "dogrula": Action("yardim.eylem.dogrula", add_config_arguments, _validate),
        "egit": Action("yardim.eylem.egit", _add_train, _train),
        "degerlendir": Action("yardim.eylem.degerlendir", _add_evaluate, _evaluate),
        "tahmin": Action("yardim.eylem.tahmin_varlik", _add_predict, _predict),
    },
)
