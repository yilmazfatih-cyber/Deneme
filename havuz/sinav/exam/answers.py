"""Okuma görevlerinin yanıt denetimi: YANIT.txt'deki numaralı yanıtları ayıklar, her birini kurallarla sınar.

Yanıt biçimi (görev metninde istenir): her soru için "1." / "2." … ile başlayan satır(lar). Karşılaştırma büyük/küçük
harfe ve Türkçe harf farkına duyarsızdır ("İ"/"i", "I"/"ı" aynı sayılır). Kural: `hepsi` (hepsi geçmeli), `biri`
(gruplardan her birinden en az biri geçmeli), `hicbiri` (hiçbiri geçmemeli). Kim kullanır: gorevler/*/gizli/
yanit_denetle.py (sınavın Python'uyla, temelin ortamı olmadan koşar).
Genişletme: yeni bir kural türü gerekiyorsa `Rule`'a alan ve `check_answer`'a dal ekleyin + tests/test_answers.py.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

_NUMBERED = re.compile(
    r"^\s*(?:[#>*_-]\s*)*\**\s*(?:soru\s*)?(\d{1,2})\s*[.):](?!\d)\**", re.MULTILINE | re.IGNORECASE
)


def fold_tr(text: str) -> str:
    """Karşılaştırma anahtarı: Türkçe küçük harf + ASCII'ye indirgeme ("İSTANBUL" → "istanbul")."""
    lowered = text.replace("I", "ı").replace("İ", "i").lower()  # harf: Türkçe eşleme önce uygulandı
    table = str.maketrans("çğıöşüâîû", "cgiosuaiu")
    return unicodedata.normalize("NFC", lowered).translate(table)


def split_answers(text: str) -> dict[int, str]:
    """Numaralı yanıtları ayıklar: {1: "…", 2: "…"}. Aynı numara iki kez geçerse ilki alınır."""
    matches = list(_NUMBERED.finditer(text))
    answers: dict[int, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        answers.setdefault(int(match.group(1)), text[match.end() : end].strip())
    return answers


@dataclass(frozen=True)
class Rule:
    """Bir sorunun yanıt kuralı (sözcükler `fold_tr` ile karşılaştırılır; düzenli ifade de olabilir)."""

    number: int
    topic: str
    all_of: tuple[str, ...] = ()
    any_of: tuple[tuple[str, ...], ...] = ()
    none_of: tuple[str, ...] = ()
    unless: tuple[str, ...] = field(default=())

    def problems(self, answer: str) -> list[str]:
        text = fold_tr(answer)

        def has(pattern: str) -> bool:
            return re.search(fold_tr(pattern), text) is not None

        found = [
            f"{self.number}. soru ({self.topic}): '{p}' yok" for p in self.all_of if not has(p)
        ]
        found += [
            f"{self.number}. soru ({self.topic}): şunlardan biri yok: {', '.join(group)}"
            for group in self.any_of
            if not any(has(p) for p in group)
        ]
        if not any(has(p) for p in self.unless):
            found += [
                f"{self.number}. soru ({self.topic}): yanlış bilgi '{p}'"
                for p in self.none_of
                if has(p)
            ]
        return found


def check_file(path: Path, rules: Sequence[Rule]) -> dict[int, list[str]]:
    """Her soru için sorunlar: {numara: [ileti, …]} (boş liste: doğru)."""
    if not path.is_file():
        missing = f"{path.name} bulunamadı (görev metni yanıtların bu dosyaya yazılmasını istiyor)."
        return {rule.number: [missing] for rule in rules}
    answers = split_answers(path.read_text(encoding="utf-8", errors="replace"))
    result: dict[int, list[str]] = {}
    for rule in rules:
        answer = answers.get(rule.number)
        if answer is None:
            result[rule.number] = [
                f"{rule.number}. soru yanıtlanmamış (satır '{rule.number}.' ile başlamalı)."
            ]
        else:
            result[rule.number] = rule.problems(answer)
    return result


def main(rules: Sequence[Rule], argv: Sequence[str] | None = None) -> int:
    """Gizli denetim betiklerinin girişi: `python yanit_denetle.py YANIT.txt`."""
    args = list(sys.argv[1:] if argv is None else argv)
    result = check_file(Path(args[0] if args else "YANIT.txt"), rules)
    for messages in result.values():
        for message in messages:
            print(f"✗ {message}")
    correct = sum(1 for messages in result.values() if not messages)
    print(f"{correct}/{len(rules)} soru doğru.")
    return 0 if correct == len(rules) else 1
