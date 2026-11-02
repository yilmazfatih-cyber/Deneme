"""Danıştay Karar Arama (karararama.danistay.gov.tr) adaptörü.

Danıştay'ın `aramalist` ucu bazı sürümlerde ``arananKelime`` yerine ``andKelimeler`` /
``orKelimeler`` listeleri bekler; her iki biçimi de gönderiyoruz, sunucu tanımadığını yok sayar.
Daire filtresi (``daire``) boş bırakılır.

# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı.
"""

from __future__ import annotations

from datetime import date
from typing import Any, ClassVar

from legalai.models import SourceId
from legalai.sources._karararama import KararAramaSource


class DanistaySource(KararAramaSource):
    source_id: ClassVar[SourceId] = SourceId.DANISTAY
    display_name: ClassVar[str] = "Danıştay Karar Arama"
    base_url: ClassVar[str] = "https://karararama.danistay.gov.tr"
    min_interval: ClassVar[float] = 1.5
    court_prefix: ClassVar[str] = "Danıştay"
    extra_search_fields: ClassVar[dict[str, Any]] = {
        "daire": "",
        "esasYil": "",
        "esasIlkSiraNo": "",
        "esasSonSiraNo": "",
        "kararYil": "",
        "kararIlkSiraNo": "",
        "kararSonSiraNo": "",
        "siralama": "1",
        "siralamaDirection": "desc",
    }

    def build_search_body(
        self, query: str, page: int, since: date | None, until: date | None
    ) -> dict[str, Any]:
        body = super().build_search_body(query, page, since, until)
        # Anahtar kelime tabanlı sürüm için eş anlamlı alanlar.
        body["data"].update(
            {
                "andKelimeler": [query],
                "orKelimeler": [],
                "notAndKelimeler": [],
                "notOrKelimeler": [],
            }
        )
        return body
