"""KVKK Kalkanı: kişisel veri tanıma, maskeleme / geri açma ve denetim günlüğü.

from aiplatform.kvkk import mask, unmask, scan
r = mask(metin)               # MaskResult(masked_text, mapping_id, findings, meta)
unmask(cevap, r.mapping_id)
"""

from .mask import Masker, MaskResult, StreamUnmasker, mask, purge_expired, scan, unmask
from .tckn import is_valid_tckn, is_valid_tr_iban, is_valid_vkn

__all__ = [
    "MaskResult",
    "Masker",
    "StreamUnmasker",
    "is_valid_tckn",
    "is_valid_tr_iban",
    "is_valid_vkn",
    "mask",
    "purge_expired",
    "scan",
    "unmask",
]
