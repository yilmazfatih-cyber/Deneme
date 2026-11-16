"""Sohbet verisini hazırlar: okur, doğrular, sızıntısız ayırır, belirteçler ve kayıp maskesini kurar.

Kim kullanır: `tasks/chat/train.py` (eğitim + kuru çalıştırma), `tasks/chat/evaluate.py`,
`tasks/chat/cli.py` (`dogrula`).

Akış: dosya → `load_chat` (satır doğrulama) → ayrı doğrulama dosyası yoksa `leak_free_split` →
`encode_chat` (şablon + maske) → azami uzunluğu aşanları ayıkla → istatistik ve uyarılar.

Azami uzunluğu aşan örnek **kırpılmaz**: kırpma yanıtın sonunu ve bitiş belirtecini keser, model
durmayı öğrenemez. Varsayılan davranış örneği uyarıyla çıkarmaktır (`uzun_ornek = "at"`).

Genişletme: örnekleri eğitimden önce dönüştürmek (ör. sistem iletisi eklemek) isterseniz
`load_examples` sonucunu işleyen küçük bir işlev ekleyin; maskeye dokunmayın.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ince_ayar.data.records import ChatExample
from ince_ayar.data.split import TRAIN, VALIDATION, SplitReport, count_leaks, leak_free_split
from ince_ayar.data.stats import LengthStats, length_stats
from ince_ayar.data.validate import load_chat
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.tasks.chat.config import ChatDataSection
from ince_ayar.tasks.chat.masking import EncodedChat, encode_chat


@dataclass
class ChatData:
    """Ayrılmış ama henüz belirteçlenmemiş örnekler."""

    train: list[ChatExample]
    validation: list[ChatExample]
    notes: list[str] = field(default_factory=list)
    split_report: SplitReport | None = None


@dataclass
class EncodedSet:
    """Belirteçlenmiş örnekler; `examples[i]` ile `encoded[i]` aynı örnektir."""

    examples: list[ChatExample]
    encoded: list[EncodedChat]
    stats: LengthStats
    dropped: int
    notes: list[str] = field(default_factory=list)

    @property
    def stop_ids(self) -> list[int]:
        found: list[int] = []
        for item in self.encoded:
            found.extend(i for i in item.stop_ids if i not in found)
        return found


def load_examples(settings: ChatDataSection) -> ChatData:
    """Veriyi okur ve eğitim / doğrulama olarak ayırır (dosyadan ya da sızıntısız bölerek)."""
    loaded = load_chat(Path(settings.egitim), settings.kodlama, settings.grup_alani)
    loaded.raise_if_errors()
    notes = [issue.render() for issue in loaded.warnings]
    if settings.dogrulama:
        held_out = load_chat(Path(settings.dogrulama), settings.kodlama, settings.grup_alani)
        held_out.raise_if_errors()
        notes.extend(issue.render() for issue in held_out.warnings)
        leaks = count_leaks(
            [row.prompt_text for row in loaded.rows],
            [row.prompt_text for row in held_out.rows],
            settings.benzerlik_esigi,
        )
        if leaks:
            notes.append(t("ayrim.sizinti", sayi=leaks, toplam=len(held_out.rows)))
        return ChatData(loaded.rows, held_out.rows, notes)
    result = leak_free_split(
        [row.prompt_text for row in loaded.rows],
        {TRAIN: 1.0 - settings.dogrulama_orani, VALIDATION: settings.dogrulama_orani},
        seed=settings.tohum,
        groups=[row.group for row in loaded.rows],
        similarity=settings.benzerlik_esigi,
    )
    notes.extend(result.report.notes)
    train = [loaded.rows[index] for index in result.indices[TRAIN]]
    validation = [loaded.rows[index] for index in result.indices.get(VALIDATION, [])]
    return ChatData(train, validation, notes, result.report)


def _special_token_texts(tokenizer: Any) -> list[str]:
    return [token for token in tokenizer.get_added_vocab() if len(token) > 2]


def encode_examples(
    tokenizer: Any, examples: list[ChatExample], settings: ChatDataSection, name: str
) -> EncodedSet:
    """Örnekleri belirteçler; azami uzunluğu aşanları `uzun_ornek` kuralına göre ele alır."""
    kept: list[ChatExample] = []
    encoded: list[EncodedChat] = []
    lengths: list[int] = []
    long_lines: list[int] = []
    injected = 0
    specials = _special_token_texts(tokenizer)
    for example in examples:
        try:
            item = encode_chat(tokenizer, example.messages)
        except UserError as exc:
            raise UserError(f"{example.line}. satır: {exc}") from exc
        lengths.append(len(item.input_ids))
        if any(token in message["content"] for message in example.messages for token in specials):
            injected += 1
        if len(item.input_ids) > settings.azami_uzunluk:
            long_lines.append(example.line)
            continue
        kept.append(example)
        encoded.append(item)
    stats = length_stats(lengths, settings.azami_uzunluk)
    notes: list[str] = []
    if long_lines and settings.uzun_ornek == "hata":
        raise UserError(
            t(
                "sohbet.uzun_hata",
                ad=name,
                sayi=len(long_lines),
                sinir=settings.azami_uzunluk,
                satirlar=", ".join(str(line) for line in long_lines[:10]),
                oneri=stats.suggested_limit,
            )
        )
    if long_lines:
        notes.append(
            t(
                "sohbet.uzun_atildi",
                ad=name,
                sayi=len(long_lines),
                sinir=settings.azami_uzunluk,
                oneri=stats.suggested_limit,
            )
        )
    if not encoded:
        raise UserError(t("sohbet.hepsi_uzun", ad=name, sinir=settings.azami_uzunluk))
    if any(not item.closed for item in encoded):
        notes.append(t("sohbet.kapanis_yok"))
    if any(item.merged_start for item in encoded):
        notes.append(t("sohbet.birlesen_baslangic"))
    if injected:
        notes.append(t("sohbet.ozel_belirtec_metni", sayi=injected))
    return EncodedSet(kept, encoded, stats, len(long_lines), notes)


def to_rows(encoded: list[EncodedChat]) -> list[dict[str, list[int]]]:
    """Eğiticinin beklediği sütunlar: `input_ids` ve `labels` (maskelenen yerler -100)."""
    return [{"input_ids": item.input_ids, "labels": item.labels} for item in encoded]
