"""`sohbet` görevinin komut satırı eylemleri: dogrula, egit, degerlendir, birlestir, disa-aktar,
tahmin, uret.

Kim kullanır: `ince_ayar/registry.py`. Her eylem ağır içe aktarmaları kendi içinde yapar.

Genişletme: yeni eylem için bir `_add_<ad>` (seçenekler) ve `_<ad>` (çalıştırma) işlevi yazıp
`TASK.actions` sözlüğüne ekleyin; yardım metnini `messages.py` içine `yardim.eylem.<ad>` diye koyun.
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
from ince_ayar.tasks.chat.config import ChatConfig

NAME = "sohbet"


def _config(args: argparse.Namespace) -> ChatConfig:
    return load_task_config(args, NAME, ChatConfig)


def _validate(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.chat.check import check_chat_data

    return check_chat_data(_config(args))


def _add_train(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    parser.add_argument("--kuru", action="store_true", help=t("yardim.secenek.kuru"))
    parser.add_argument("--surdur", action="store_true", help=t("yardim.secenek.surdur"))


def _train(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.chat.train import run_training

    run_training(_config(args), dry_run=args.kuru, resume=args.surdur)
    return 0


def _add_evaluate(parser: argparse.ArgumentParser) -> None:
    add_config_arguments(parser)
    add_model_argument(parser)
    parser.add_argument("--veri", metavar="DOSYA", help=t("yardim.secenek.veri"))
    parser.add_argument("--karsilastir", action="store_true", help=t("yardim.secenek.karsilastir"))


def _evaluate(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.chat.evaluate import evaluate_chat

    evaluate_chat(_config(args), args.model, args.veri, args.karsilastir)
    return 0


def _add_merge(parser: argparse.ArgumentParser) -> None:
    add_model_argument(parser, required=True)
    parser.add_argument("--cikti", required=True, metavar="KLASOR", help=t("yardim.secenek.cikti"))
    parser.add_argument("--taban", help=t("yardim.secenek.taban"))
    parser.add_argument(
        "--duyarlik",
        default="oto",
        choices=["oto", "fp32", "fp16", "bf16"],
        help=t("yardim.secenek.duyarlik"),
    )
    parser.add_argument(
        "--dogrula", action="store_true", help=t("yardim.secenek.birlestir_dogrula")
    )


def _merge(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.chat.merge import merge_adapter

    merge_adapter(Path(args.model), Path(args.cikti), args.taban, args.duyarlik, args.dogrula)
    return 0


def _add_export(parser: argparse.ArgumentParser) -> None:
    add_model_argument(parser, required=True)
    parser.add_argument("--cikti", required=True, metavar="KLASOR", help=t("yardim.secenek.cikti"))
    parser.add_argument("--llama-cpp", metavar="KLASOR", help=t("yardim.secenek.llama_cpp"))
    parser.add_argument("--tur", default="q8_0", help=t("yardim.secenek.gguf_tur"))
    parser.add_argument("--nicem", metavar="Q4_K_M", help=t("yardim.secenek.nicem"))
    parser.add_argument("--ad", default="model", help=t("yardim.secenek.ad"))
    parser.add_argument("--sistem", help=t("yardim.secenek.sistem"))
    parser.add_argument("--baglam", type=int, default=4096, help=t("yardim.secenek.baglam"))


def _export(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.chat.export import export_for_ollama

    export_for_ollama(
        Path(args.model),
        Path(args.cikti),
        args.llama_cpp,
        args.tur,
        args.nicem,
        args.ad,
        args.sistem,
        args.baglam,
    )
    return 0


def _add_predict(parser: argparse.ArgumentParser) -> None:
    add_model_argument(parser, required=True)
    parser.add_argument("--mesaj", help=t("yardim.secenek.mesaj"))
    parser.add_argument("--sistem", help=t("yardim.secenek.sistem"))
    parser.add_argument("--girdi", metavar="DOSYA.jsonl", help=t("yardim.secenek.girdi"))
    parser.add_argument("--cikti", metavar="DOSYA.jsonl", help=t("yardim.secenek.cikti_dosya"))
    parser.add_argument("--azami-yeni", type=int, default=256, help=t("yardim.secenek.azami_yeni"))


def _predict(args: argparse.Namespace) -> int:
    from ince_ayar.tasks.chat.predict import predict_chat

    predict_chat(args.model, args.mesaj, args.girdi, args.cikti, args.sistem, args.azami_yeni)
    return 0


TASK = TaskSpec(
    name=NAME,
    help_key="yardim.gorev.sohbet",
    description_key="yardim.gorev.sohbet_aciklama",
    actions={
        "dogrula": Action("yardim.eylem.dogrula", add_config_arguments, _validate),
        "egit": Action("yardim.eylem.egit", _add_train, _train),
        "degerlendir": Action("yardim.eylem.degerlendir", _add_evaluate, _evaluate),
        "birlestir": Action("yardim.eylem.birlestir", _add_merge, _merge),
        "disa-aktar": Action("yardim.eylem.disa_aktar_sohbet", _add_export, _export),
        "tahmin": Action("yardim.eylem.tahmin", _add_predict, _predict),
        "uret": Action("yardim.eylem.uret_talimat", add_synth_arguments, run_synth),
    },
)
