"""`uret` eylemi: `sohbet uret` (talimat tarifi) ve `gomme uret` (sorgu tarifi).

Kim kullanır: `tasks/chat/cli.py` ve `tasks/embedding/cli.py` bu dosyadaki işlevleri eylem olarak
bağlar. Yapılandırma donanımdan bağımsızdır; hazır ayar yoktur, `--ayar` zorunludur.

Örnek (Ollama'da `qwen3:8b` çalışırken):
    python -m ince_ayar sohbet uret --ayar yapilandirma/uret/talimat.toml --sinir 2 --kuru
    python -m ince_ayar sohbet uret --ayar yapilandirma/uret/talimat.toml

Genişletme: yeni görev için `RECIPE_OF_TASK` sözlüğüne `görev: tarif` ekleyin.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from ince_ayar import console
from ince_ayar.config import load_config
from ince_ayar.errors import UserError
from ince_ayar.messages import t

RECIPE_OF_TASK = {"sohbet": "talimat", "gomme": "sorgu"}


def add_synth_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--ayar", required=True, metavar="DOSYA.toml", help=t("yardim.secenek.uret_ayar")
    )
    parser.add_argument(
        "-D",
        "--degistir",
        action="append",
        default=[],
        metavar="BOLUM.ANAHTAR=DEGER",
        help=t("yardim.secenek.degistir"),
    )
    parser.add_argument("--sinir", type=int, metavar="N", help=t("yardim.secenek.sinir"))
    parser.add_argument("--devam", action="store_true", help=t("yardim.secenek.devam"))
    parser.add_argument("--kuru", action="store_true", help=t("yardim.secenek.uret_kuru"))


def run_synth(args: argparse.Namespace) -> int:
    from ince_ayar.synth.client import TeacherClient
    from ince_ayar.synth.config import SynthConfig
    from ince_ayar.synth.license import check_teacher_license
    from ince_ayar.synth.pipeline import load_seeds, run_pipeline, side_paths
    from ince_ayar.synth.recipes import RECIPES, load_prompt

    config = load_config(Path(args.ayar), SynthConfig, list(args.degistir))
    expected = RECIPE_OF_TASK[args.gorev]
    if config.tarif != expected:
        raise UserError(
            t("uret.tarif_uyusmaz", gorev=args.gorev, beklenen=expected, bulunan=config.tarif)
        )
    for warning in check_teacher_license(config.ogretmen):
        console.warn(warning)
    if args.kuru:
        seeds = load_seeds(Path(config.girdi), RECIPES[config.tarif].needs_document)
        prompt = load_prompt(config.tarif, config.istem)
        console.result(t("uret.kuru", tohum=len(seeds), surum=prompt.version, ozet=prompt.digest))
        console.result(prompt.render(seeds[0], config.ornek_sayisi))
        return 0
    api_key = (
        os.environ.get(config.ogretmen.api_anahtari_ortam)
        if config.ogretmen.api_anahtari_ortam
        else None
    )
    teacher = config.ogretmen
    with TeacherClient(
        teacher.uc_nokta, teacher.model, api_key, teacher.zaman_asimi, teacher.yeniden_deneme
    ) as client:
        stats = run_pipeline(config, client, args.sinir, args.devam)
    rejected_path, record_path = side_paths(Path(config.cikti))
    console.result(
        t(
            "uret.bitti",
            kabul=stats.accepted,
            aday=stats.candidates,
            istek=stats.requests,
            ret=stats.to_dict()["ret"],
            cikti=config.cikti,
            reddedilen=rejected_path,
            kayit=record_path,
        )
    )
    return 0
