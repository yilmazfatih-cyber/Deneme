"""Gömme eğitiminin kuru çalıştırma planı: veri, adım, belirteç uzunluğu ve bellek tahmini.

Kim kullanır: `tasks/embedding/train.py`.

Bellek hesabında aynı anda bellekte duran dizi sayısı = yığın × sütun (sorgu, olumlu[, olumsuz]).
`onbellekli-mnrl` kaybı yığını `mini_yigin` parçalarla işlediğinden orada `mini_yigin` kullanılır.
Uzunluk olarak verideki en uzun metin (azami uzunlukla sınırlı) alınır.

Genişletme: plana satır eklemek için `embedding_plan` içindeki `rows` listesine ekleyin.
"""

from __future__ import annotations

from ince_ayar.data.stats import length_stats, render_stats
from ince_ayar.hardware import Hardware, Precision
from ince_ayar.messages import t
from ince_ayar.plan import encoder_memory_rows, training_steps
from ince_ayar.tasks.embedding.config import EmbeddingConfig
from ince_ayar.tasks.embedding.data import PairSplits
from ince_ayar.tasks.encoder_base import load_encoder_tokenizer


def embedding_plan(
    config: EmbeddingConfig,
    base: str,
    splits: PairSplits,
    hardware: Hardware,
    precision: Precision,
    notes: list[str],
) -> tuple[list[tuple[str, str]], str]:
    """(plan satırları, uzunluk tablosu) döndürür."""
    train = config.egitim
    steps = training_steps(
        len(splits.train), train.yigin, train.biriktirme, train.donem, train.azami_adim
    )
    rows = [
        (t("plan.satir.gorev"), "gomme"),
        (t("plan.satir.taban"), base),
        (t("plan.satir.aygit"), f"{hardware.name} · {precision.label}"),
        (
            t("plan.satir.ornek"),
            t(
                "plan.ornek_sayilari",
                egitim=len(splits.train),
                dogrulama=len(splits.validation),
                atilan=0,
            ),
        ),
        (
            t("plan.satir.adim"),
            t("plan.adim_ayrinti", adim=steps, yigin=train.yigin, oran=train.ogrenme_orani),
        ),
        (t("plan.satir.cikti"), train.cikti),
    ]
    tokenizer = load_encoder_tokenizer(base, config.model)
    texts = [config.model.sorgu_oneki + p.query for p in splits.train]
    texts += [
        config.model.belge_oneki + d for p in splits.train for d in (p.positive, *p.negatives)
    ]
    stats = length_stats(
        [len(ids) for ids in tokenizer(texts)["input_ids"]], config.veri.azami_uzunluk
    )
    columns = 3 if any(p.negatives for p in splits.train) or train.zor_olumsuz_kaz else 2
    per_pass = train.mini_yigin if train.kayip == "onbellekli-mnrl" else train.yigin
    rows += encoder_memory_rows(
        base,
        hardware,
        precision,
        config.model.duyarlik,
        train.hedef_bellek_gb,
        min(per_pass, train.yigin) * columns,
        min(stats.maximum, config.veri.azami_uzunluk),
        notes,
    )
    return rows, render_stats(stats, t("istatistik.baslik", ad="eğitim"))
