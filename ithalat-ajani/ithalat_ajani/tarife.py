"""Vergi tablosu: kategori → GTİP, gümrük vergisi, ilave gümrük vergisi, KDV, örnek ağırlık.

Oranlar `tarife.toml` dosyasındadır (veri, kod değil). Her kategori "kaynakli" ya da "tahmini"
işaretlidir; tahmini oranlar değerlendirmede ayrıca kötü senaryoyla sınanır.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

VARSAYILAN_YOL = Path(__file__).with_name("tarife.toml")
GRUPLAR = ("hazir-giyim", "aksesuar", "ayakkabi")
MEVSIMLER = ("hepsi", "kis", "yaz")
GUVENLER = ("kaynakli", "tahmini")


class TarifeHatasi(ValueError):
    pass


@dataclass(frozen=True)
class Kategori:
    anahtar: str
    ad: str
    grup: str
    gtip: tuple[str, ...]
    gv: float  # gümrük vergisi oranı
    igv: float  # ilave gümrük vergisi oranı (Çin, STA yok)
    kdv: float  # ithalat ve satış KDV oranı
    ornek_agirlik_kg: float  # ilan ağırlık vermezse kullanılan ortalama birim ağırlık
    mevsim: str
    guven: str
    kaynak: str
    notlar: str = ""

    @property
    def tahmini(self) -> bool:
        return self.guven == "tahmini"


@dataclass(frozen=True)
class Tarife:
    surum: str
    kategoriler: dict[str, Kategori]
    kaynaklar: dict[str, str]

    def bul(self, anahtar: str) -> Kategori:
        try:
            return self.kategoriler[anahtar]
        except KeyError:
            gecerli = ", ".join(self.kategoriler)
            raise TarifeHatasi(f"Bilinmeyen kategori: {anahtar!r}. Geçerli: {gecerli}") from None

    def gtip_ile_bul(self, gtip: str) -> Kategori | None:
        """GTİP'in en uzun eşleşen önekine sahip kategori (noktalar yok sayılır)."""
        aranan = gtip.replace(".", "").replace(" ", "")
        en_iyi: tuple[int, Kategori] | None = None
        for k in self.kategoriler.values():
            for onek in k.gtip:
                temiz = onek.replace(".", "")
                if aranan.startswith(temiz) and (en_iyi is None or len(temiz) > en_iyi[0]):
                    en_iyi = (len(temiz), k)
        return en_iyi[1] if en_iyi else None


def _oran(deger: object, alan: str, anahtar: str) -> float:
    if not isinstance(deger, (int, float)) or not 0 <= deger < 1:
        raise TarifeHatasi(f"{anahtar}.{alan} 0 ile 1 arasında bir oran olmalı, {deger!r} verildi")
    return float(deger)


def _kategori(anahtar: str, ham: dict) -> Kategori:
    try:
        k = Kategori(
            anahtar=anahtar,
            ad=str(ham["ad"]),
            grup=str(ham["grup"]),
            gtip=tuple(str(g) for g in ham["gtip"]),
            gv=_oran(ham["gv"], "gv", anahtar),
            igv=_oran(ham["igv"], "igv", anahtar),
            kdv=_oran(ham["kdv"], "kdv", anahtar),
            ornek_agirlik_kg=float(ham["ornek_agirlik_kg"]),
            mevsim=str(ham.get("mevsim", "hepsi")),
            guven=str(ham["guven"]),
            kaynak=str(ham["kaynak"]),
            notlar=str(ham.get("notlar", "")),
        )
    except KeyError as eksik:
        raise TarifeHatasi(f"{anahtar}: eksik alan {eksik}") from None
    if k.grup not in GRUPLAR:
        raise TarifeHatasi(f"{anahtar}: grup {k.grup!r} geçersiz ({', '.join(GRUPLAR)})")
    if k.mevsim not in MEVSIMLER:
        raise TarifeHatasi(f"{anahtar}: mevsim {k.mevsim!r} geçersiz ({', '.join(MEVSIMLER)})")
    if k.guven not in GUVENLER:
        raise TarifeHatasi(f"{anahtar}: guven {k.guven!r} geçersiz ({', '.join(GUVENLER)})")
    if not k.gtip:
        raise TarifeHatasi(f"{anahtar}: en az bir GTİP gerekli")
    if not 0 < k.ornek_agirlik_kg < 30:
        raise TarifeHatasi(f"{anahtar}: ornek_agirlik_kg 0 ile 30 arasında olmalı")
    return k


def tarife_oku(yol: str | Path | None = None) -> Tarife:
    with open(yol or VARSAYILAN_YOL, "rb") as f:
        ham = tomllib.load(f)
    kategoriler = {anahtar: _kategori(anahtar, deger) for anahtar, deger in ham.get("kategori", {}).items()}
    if not kategoriler:
        raise TarifeHatasi("Tarife dosyasında hiç kategori yok")
    return Tarife(surum=str(ham.get("surum", "")), kategoriler=kategoriler, kaynaklar=dict(ham.get("kaynaklar", {})))


@lru_cache(maxsize=1)
def varsayilan_tarife() -> Tarife:
    return tarife_oku()
