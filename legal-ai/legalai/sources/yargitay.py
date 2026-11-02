"""Yargıtay Karar Arama (karararama.yargitay.gov.tr) adaptörü.

Arama gövdesi `yargi-mcp` projesinin belgelediği alanları taşır: kurul/hukuk/ceza daire filtreleri,
esas/karar yıl ve sıra no aralıkları, tarih aralığı ve sıralama. Yalnızca serbest metin aramasını
kullanıyoruz; diğer alanlar boş gönderilir.

# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı.
"""

from __future__ import annotations

from typing import Any, ClassVar

from legalai.models import SourceId
from legalai.sources._karararama import KararAramaSource


class YargitaySource(KararAramaSource):
    source_id: ClassVar[SourceId] = SourceId.YARGITAY
    display_name: ClassVar[str] = "Yargıtay Karar Arama"
    base_url: ClassVar[str] = "https://karararama.yargitay.gov.tr"
    min_interval: ClassVar[float] = 1.5
    court_prefix: ClassVar[str] = "Yargıtay"
    extra_search_fields: ClassVar[dict[str, Any]] = {
        "birimYrgKurulDaire": "",
        "birimYrgHukukDaire": "",
        "birimYrgCezaDaire": "",
        "esasYil": "",
        "esasIlkSiraNo": "",
        "esasSonSiraNo": "",
        "kararYil": "",
        "kararIlkSiraNo": "",
        "kararSonSiraNo": "",
        "siralama": "1",  # 1: karar tarihine göre
        "siralamaDirection": "desc",
    }
