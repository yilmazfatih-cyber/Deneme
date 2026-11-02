"""UYAP Emsal Karar Arama (emsal.uyap.gov.tr) adaptörü.

Bölge Adliye Mahkemesi ve ilk derece mahkemesi kararlarını içerir. Arama gövdesinde BAM/ilk derece
hukuk ve ceza mahkemesi filtreleri boş gönderilir. Mahkeme adı sonuçta tam olarak gelir
("İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi"), bu yüzden başına kurum adı eklenmez.

# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı.
"""

from __future__ import annotations

from typing import Any, ClassVar

from legalai.models import SourceId
from legalai.sources._karararama import KararAramaSource
from legalai.text import clean_text


class UyapEmsalSource(KararAramaSource):
    source_id: ClassVar[SourceId] = SourceId.UYAP_EMSAL
    display_name: ClassVar[str] = "UYAP Emsal Karar Arama"
    base_url: ClassVar[str] = "https://emsal.uyap.gov.tr"
    min_interval: ClassVar[float] = 1.5
    court_prefix: ClassVar[str] = ""
    extra_search_fields: ClassVar[dict[str, Any]] = {
        "Bam Hukuk Mahkemeleri": "",
        "Hukuk Mahkemeleri": "",
        "birimBamHukukMah": "",
        "birimHukukMah": "",
        "birimBamCezaMah": "",
        "birimCezaMah": "",
        "esasYil": "",
        "esasIlkSiraNo": "",
        "esasSonSiraNo": "",
        "kararYil": "",
        "kararIlkSiraNo": "",
        "kararSonSiraNo": "",
        "siralama": "1",
        "siralamaDirection": "desc",
    }

    def format_court(self, raw: str | None) -> str | None:
        """Mahkeme adı olduğu gibi kullanılır; boşsa genel ad verilir."""
        if not raw or not raw.strip():
            return "UYAP Emsal"
        return clean_text(raw)
