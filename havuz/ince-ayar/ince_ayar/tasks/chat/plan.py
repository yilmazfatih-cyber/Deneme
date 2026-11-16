"""Sohbet eğitiminin kuru çalıştırma planı: veri, adım sayısı, LoRA ayarı ve bellek tahmini.

Kim kullanır: `tasks/chat/train.py` (plan her eğitimde yazılır; `--kuru` verilmişse orada durulur).

Genişletme: plana satır eklemek için `plan_rows` listesine `(başlık, değer)` ekleyin.
"""

from __future__ import annotations

from ince_ayar.data.stats import render_stats
from ince_ayar.hardware import Hardware, Precision
from ince_ayar.memory import estimate_full, estimate_lora, read_shape
from ince_ayar.messages import t
from ince_ayar.plan import memory_rows, plan_target, training_steps
from ince_ayar.tasks.chat.config import ChatConfig
from ince_ayar.tasks.chat.data import EncodedSet
from ince_ayar.tasks.chat.modeling import lora_config


def plan_rows(
    config: ChatConfig,
    base: str,
    hardware: Hardware,
    precision: Precision,
    train_set: EncodedSet,
    eval_set: EncodedSet | None,
    notes: list[str],
) -> list[tuple[str, str]]:
    """Planın satırlarını üretir; bellek tahmini yapılamazsa nedenini `notes` listesine ekler."""
    train = config.egitim
    steps = training_steps(
        len(train_set.encoded), train.yigin, train.biriktirme, train.donem, train.azami_adim
    )
    lora = config.lora
    method = (
        t("plan.lora", r=lora.r, alpha=lora.alpha, hedef=lora.hedef_moduller)
        if lora.etkin
        else t("plan.tam_ince_ayar")
    )
    if config.model.dort_bit:
        method += " + 4-bit (QLoRA)"
    rows = [
        (t("plan.satir.gorev"), "sohbet"),
        (t("plan.satir.taban"), base),
        (t("plan.satir.yontem"), method),
        (t("plan.satir.aygit"), f"{hardware.name} · {precision.label}"),
        (
            t("plan.satir.ornek"),
            t(
                "plan.ornek_sayilari",
                egitim=len(train_set.encoded),
                dogrulama=len(eval_set.encoded) if eval_set else 0,
                atilan=train_set.dropped,
            ),
        ),
        (
            t("plan.satir.adim"),
            t(
                "plan.adim_ayrinti",
                adim=steps,
                yigin=train.yigin * train.biriktirme,
                oran=train.ogrenme_orani,
            ),
        ),
        (t("plan.satir.cikti"), train.cikti),
    ]
    target = plan_target(hardware, precision, config.model.duyarlik, train.hedef_bellek_gb)
    try:
        shape = read_shape(base, "causal", lora_config(lora) if lora.etkin else None)
    except Exception as exc:  # çevrimdışı Hub kimliği, bozuk yapılandırma…
        notes.append(t("plan.bellek_yok", ayrinti=str(exc).splitlines()[0]))
        return rows
    length = min(train_set.stats.maximum, config.veri.azami_uzunluk)
    if lora.etkin:
        estimate = estimate_lora(
            shape,
            rank=lora.r,
            targets=lora.hedef_moduller,
            batch=train.yigin,
            length=length,
            mixed_precision=target.mixed_precision,
            weight_bytes=2 if target.mixed_precision else 4,
            four_bit=config.model.dort_bit,
            checkpointing=train.gradyan_denetimi,
        )
    else:
        estimate = estimate_full(shape, train.yigin, length, target.mixed_precision)
    return rows + memory_rows(estimate, target)


def length_report(train_set: EncodedSet, eval_set: EncodedSet | None) -> str:
    """Eğitim ve doğrulama kümelerinin belirteç uzunluğu tabloları."""
    parts = [render_stats(train_set.stats, t("istatistik.baslik", ad="eğitim"))]
    if eval_set is not None:
        parts.append(render_stats(eval_set.stats, t("istatistik.baslik", ad="doğrulama")))
    return "\n\n".join(parts)
