"""`siniflandirma dogrula`: veri hatalarını, sınıf dağılımını, ayrımı ve belirteç uzunluğunu gösterir.

Kim kullanır: `tasks/classification/cli.py`.

Genişletme: yeni bir denetim için `check_classification_data` sonuna bir bölüm ekleyin.
"""

from __future__ import annotations

from collections import Counter

from ince_ayar import console
from ince_ayar.config import TINY_MODEL
from ince_ayar.console import format_table
from ince_ayar.data.stats import length_stats, render_stats
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.tasks.classification.config import ClassificationConfig
from ince_ayar.tasks.classification.data import prepare_splits, token_lengths
from ince_ayar.tasks.encoder_base import load_encoder_tokenizer
from ince_ayar.tiny import train_encoder_tokenizer


def check_classification_data(config: ClassificationConfig) -> int:
    splits = prepare_splits(config.veri)
    rows = []
    for label in splits.labels:
        counts = [
            Counter(r.label for r in part)[label]
            for part in (splits.train, splits.validation, splits.test)
        ]
        rows.append([label, *counts])
    console.result(format_table(["etiket", "eğitim", "doğrulama", "test"], rows))
    for note in splits.notes:
        console.warn(note)
    if config.model.taban == TINY_MODEL:
        tokenizer = train_encoder_tokenizer([r.text for r in splits.train])
    else:
        try:
            tokenizer = load_encoder_tokenizer(config.model.taban, config.model)
        except UserError as exc:
            console.warn(t("dogrula.tokenizer_yok", ayrinti=str(exc)))
            return 0
    stats = length_stats(token_lengths(tokenizer, splits.train), config.veri.azami_uzunluk)
    console.result("\n" + render_stats(stats, t("istatistik.baslik", ad="eğitim")))
    console.result("\n" + t("dogrula.tamam"))
    return 0
