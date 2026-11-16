"""Bilgi damıtma örneği (logit eşleme): açık bir öğretmen modelin olasılık dağılımını küçük bir
öğrenci modele öğretir. Komut satırı eylemi değildir; kopyalanıp uyarlanacak çalışan bir örnektir.

Kim kullanır: `tests/test_distill.py` (minik modellerle) ve `AGENTS.md` § "Damıtma" tarifi.

Yöntem: her asistan belirtecinde öğrencinin dağılımı öğretmeninkine yaklaştırılır:
    kayıp = T² · KL(öğretmen_T ‖ öğrenci_T)        (T: sıcaklık; Hinton vd. 2015)
Yalnız kayıp maskesinin açık olduğu (asistan yanıtı) konumlar sayılır; maske `masking.py`
ile kurulur. İsteğe bağlı olarak normal çapraz entropi `alpha` ağırlığıyla eklenir.

Koşul: öğretmen ve öğrenci **aynı tokenizer'ı** kullanmalıdır (ör. Qwen3-1.7B → Qwen3-0.6B;
katalogda `damitma` görevi). Sözlükler farklıysa logitler eşlenemez; `check_same_vocabulary`
bunu yakalar. Öğretmenin lisansı ticari kullanıma izin vermelidir (katalog `ticari` alanı).

Genişletme: TRL'nin `DistillationTrainer` sınıfı (kurulu trl sürümünde var; bu temelde denenmedi)
üretimli (on-policy) damıtma sunar; bu dosya en yalın, denetlenebilir biçimdir.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from ince_ayar.errors import UserError
from ince_ayar.messages import t

IGNORE_INDEX = -100


def check_same_vocabulary(teacher_tokenizer: Any, student_tokenizer: Any) -> None:
    """Öğretmen ve öğrencinin belirteç sözlükleri aynı değilse yol gösteren hata verir."""
    if teacher_tokenizer.get_vocab() != student_tokenizer.get_vocab():
        raise UserError(t("damitma.sozluk_farkli"))


def distillation_loss(
    student_logits: Any, teacher_logits: Any, labels: Any, temperature: float = 2.0
) -> Any:
    """Maskeli konumlarda T² · KL(öğretmen ‖ öğrenci). Girdiler (yığın, uzunluk, sözlük) boyutludur.

    Etiketler, nedensel modelin kuralına göre bir sola kaydırılarak eşlenir: t. konumun logitleri
    t+1. belirteci tahmin eder.
    """
    import torch
    from torch.nn import functional

    mask = labels[:, 1:] != IGNORE_INDEX
    student = student_logits[:, :-1][mask].float() / temperature
    teacher = teacher_logits[:, :-1][mask].float() / temperature
    if student.numel() == 0:
        return torch.zeros((), device=student_logits.device, requires_grad=True)
    divergence = functional.kl_div(
        functional.log_softmax(student, dim=-1),
        functional.log_softmax(teacher, dim=-1),
        log_target=True,
        reduction="batchmean",
    )
    return divergence * temperature**2


def distill(
    student: Any,
    teacher: Any,
    batches: Iterable[dict[str, Any]],
    learning_rate: float = 1e-4,
    temperature: float = 2.0,
    alpha: float = 0.0,
) -> list[float]:
    """Basit damıtma döngüsü: her yığın için bir güncelleme; kayıp listesini döndürür.

    `batches`: `input_ids`, `attention_mask`, `labels` tensörleri (labels: maskeli yerler -100).
    `alpha`: normal çapraz entropi kaybının ağırlığı (0: yalnız damıtma).
    """
    import torch

    teacher.eval()
    student.train()
    optimizer = torch.optim.AdamW(
        [p for p in student.parameters() if p.requires_grad], lr=learning_rate
    )
    history: list[float] = []
    for batch in batches:
        with torch.no_grad():
            teacher_logits = teacher(
                input_ids=batch["input_ids"], attention_mask=batch["attention_mask"]
            ).logits
        outputs = student(**batch)
        loss = distillation_loss(outputs.logits, teacher_logits, batch["labels"], temperature)
        if alpha > 0:
            loss = (1 - alpha) * loss + alpha * outputs.loss
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        history.append(float(loss.detach()))
    return history
