"""Yayımlanmış defile raporlarından elle/araştırmacı ajanla derlenen sinyaller: `content/sinyaller/*.json`.

Dosya biçimi (bir dosya = bir sezon):

    {
      "sezon": "SS27",
      "ornek": false,                      # true ise yukle() varsayılan olarak atlar
      "derleyen": "arastirmaci",           # isteğe bağlı
      "sinyaller": [
        {"nitelik_ekseni": "renk", "nitelik_degeri": "17-1564 TCX", "podyum_payi": 0.06, "marka_sayisi": 9,
         "kaynak_turu": "rapor", "kaynak_url": "https://...", "kaynak_tarihi": "2026-10-07", "guven": 0.4,
         "not": "..."}
      ]
    }

Her sinyal SinyalKaydi alanlarını taşır; `sezon` yazılmazsa dosyanın sezonu kullanılır, yazılırsa aynı olmalıdır.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

from pydantic import ValidationError

from moda_radar.sema import SEZON_DESENI, SinyalKaydi

VARSAYILAN_KLASOR = Path("content/sinyaller")


class SinyalDosyasiHatasi(ValueError):
    pass


def dosya_oku(yol: Path) -> tuple[list[SinyalKaydi], bool]:
    """Tek dosyayı okur ve doğrular. (kayıtlar, örnek mi) döner."""
    try:
        veri = json.loads(yol.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise SinyalDosyasiHatasi(f"{yol.name}: okunamadı: {e}") from e
    if not isinstance(veri, dict) or not isinstance(veri.get("sinyaller"), list):
        raise SinyalDosyasiHatasi(f"{yol.name}: 'sezon' ve 'sinyaller' listesi gerekli")
    sezon = veri.get("sezon", "")
    if not SEZON_DESENI.match(str(sezon)):
        raise SinyalDosyasiHatasi(f"{yol.name}: sezon SS27/FW27 biçiminde olmalı, bulunan {sezon!r}")
    kayitlar = []
    for i, ham in enumerate(veri["sinyaller"]):
        ham = {"sezon": sezon, **ham}
        if ham["sezon"] != sezon:
            raise SinyalDosyasiHatasi(f"{yol.name}[{i}]: sezon {ham['sezon']} dosya sezonu {sezon} ile uyuşmuyor")
        try:
            kayitlar.append(SinyalKaydi.model_validate(ham))
        except ValidationError as e:
            raise SinyalDosyasiHatasi(f"{yol.name}[{i}]: {e}") from e
    return kayitlar, bool(veri.get("ornek", False))


def yukle(klasor: Path = VARSAYILAN_KLASOR, *, ornekleri_dahil_et: bool = False) -> list[SinyalKaydi]:
    """Klasördeki bütün `*.json` dosyalarını okur; `"ornek": true` dosyalar varsayılan olarak atlanır."""
    sonuc: list[SinyalKaydi] = []
    for yol in sorted(Path(klasor).glob("*.json")):
        kayitlar, ornek = dosya_oku(yol)
        if ornek and not ornekleri_dahil_et:
            continue
        sonuc.extend(kayitlar)
    return sonuc


def depoya_yaz(depo, kayitlar: Iterable[SinyalKaydi]) -> int:
    """Kayıtları `sinyal` tablosuna yazar (tek transaction; aynı anahtar güncellenir)."""
    return depo.ekle_sinyaller(list(kayitlar))
