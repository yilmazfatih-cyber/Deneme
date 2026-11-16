"""Kalite süzgeçleri: her üretilen aday sırayla denetlenir; ilk takıldığı süzgeç "ret nedeni" olur.

Kim kullanır: `synth/pipeline.py`.

Sıra: uzunluk → dil → ret yanıtı → yineleme (kabul edilenlerle ve `mevcut_veri` ile).
Yineleme en sonda çünkü dizine yalnız **kabul edilen** adaylar eklenir.

Ret nedenleri (kayıt dosyasında sayılır): `uzunluk`, `dil`, `ret_yaniti`, `yineleme`,
`mevcut_veriyle_ayni`; ayrıştırma hataları pipeline'da `bicim` olarak sayılır.

Genişletme: yeni süzgeç için `Candidate -> neden | None` döndüren bir yöntem yazıp `check`
içindeki sıraya ekleyin; `FilterSection` içine ayarını koyun.
"""

from __future__ import annotations

import re

from ince_ayar.data.neardup import NearDuplicateIndex
from ince_ayar.synth.config import FilterSection
from ince_ayar.synth.langid import looks_turkish
from ince_ayar.synth.recipes import Candidate
from ince_ayar.text_tr import lower_tr

REFUSAL_PATTERNS = [
    r"\byardımcı olamam\b",
    r"\bbu konuda yardım(cı)? ?edemem\b",
    r"\bbir yapay zeka (dil )?modeli olarak\b",
    r"\bas an ai\b",
    r"\bi('m| am) sorry\b",
    r"\bi can(no|')t (help|assist)\b",
]
_REFUSAL = re.compile("|".join(REFUSAL_PATTERNS))


class QualityFilter:
    def __init__(self, settings: FilterSection, dedup_field: str) -> None:
        self.settings = settings
        self.dedup_field = dedup_field
        self.accepted = NearDuplicateIndex(settings.yineleme_esigi)
        self.existing = NearDuplicateIndex(settings.yineleme_esigi)

    def add_existing(self, texts: list[str]) -> None:
        """Karşılaştırılacak var olan verileri (ör. test kümesi) dizine ekler."""
        for text in texts:
            self.existing.add(text)

    def remember(self, candidate: Candidate) -> None:
        """Kabul edilen (ya da önceki koşudan gelen) adayı yineleme dizinine ekler."""
        self.accepted.add(candidate[self.dedup_field])

    def check(self, candidate: Candidate) -> str | None:
        """Ret nedenini döndürür; aday geçerse None (ve aday dizine eklenir)."""
        for reason in (
            self._length(candidate),
            self._language(candidate),
            self._refusal(candidate),
        ):
            if reason:
                return reason
        key = candidate[self.dedup_field]
        if self.existing.find(key) is not None:
            return "mevcut_veriyle_ayni"
        if self.accepted.find(key) is not None:
            return "yineleme"
        self.remember(candidate)
        return None

    def _length(self, candidate: Candidate) -> str | None:
        for value in candidate.values():
            if not self.settings.en_kisa_alan <= len(value.strip()) <= self.settings.en_uzun_alan:
                return "uzunluk"
        return None

    def _language(self, candidate: Candidate) -> str | None:
        if self.settings.dil == "herhangi":
            return None
        if all(looks_turkish(value, self.settings.turkce_esik) for value in candidate.values()):
            return None
        return "dil"

    def _refusal(self, candidate: Candidate) -> str | None:
        if not self.settings.ret_suzgeci:
            return None
        if any(_REFUSAL.search(lower_tr(value)) for value in candidate.values()):
            return "ret_yaniti"
        return None
