"""Yollar ve tarif kaydı: havuz kökü, tarif klasörleri, `tarif.json` okuma ve doğrulama.

Her tarif `tarifler/<kisa-ad>/` klasörüdür ve içinde `tarif.json` bulunur:
    {"ad": "...", "baslik": "...", "ozet": "...", "temeller": ["uygulama", "yz"],
     "ekKlasorler": ["belgeler"], "sure": "~10 dk", "zorluk": "orta"}
`temeller`: hedefe kopyalanan havuz temelleri (hedefte aynı adlı alt klasör olur).
`ekKlasorler`: temel olmayan, tarifin hedefe eklediği klasörler (ör. `yayin/`).
Havuz kökü varsayılan olarak bu klasörün üstüdür; `TARIF_HAVUZ` ortam değişkeniyle değiştirilir.
Genişletme: tarif.json'a yeni alan → `Tarif`'e alan, `tarif_oku`'ya okuma + denetim, tests/test_bicim.py.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

TARIFLER = Path(__file__).resolve().parent.parent
ZORLUKLAR = ("kolay", "orta", "zor")
ZORUNLU_DOSYALAR = ("README.md", "tarif.json", "uygula.py", "dogrula.py")
AD_DESENI = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class TarifHatasi(Exception):
    """Tarif kaydı ya da uygulaması sırasında kullanıcıya gösterilecek, yol gösteren hata."""


def havuz_koku() -> Path:
    """Temellerin durduğu klasör (içinde uygulama/, yz/… vardır)."""
    ortamdan = os.environ.get("TARIF_HAVUZ")
    return Path(ortamdan).resolve() if ortamdan else TARIFLER.parent


def temel_klasoru(ad: str) -> Path:
    """Havuzdaki bir temelin klasörü; yoksa yol gösteren hata."""
    klasor = havuz_koku() / ad
    if not (klasor / "havuz.json").is_file():
        raise TarifHatasi(
            f"'{ad}' adında bir havuz temeli bulunamadı ({klasor}). Temel adları havuz/ altındaki "
            "klasör adlarıdır (ör. uygulama, yz, site)."
        )
    return klasor


@dataclass(frozen=True)
class Tarif:
    """Bir tarifin kaydı (tarif.json + klasörü)."""

    ad: str
    klasor: Path
    baslik: str
    ozet: str
    temeller: tuple[str, ...]
    ek_klasorler: tuple[str, ...]
    sure: str
    zorluk: str

    @property
    def dosyalar(self) -> Path:
        return self.klasor / "dosyalar"

    @property
    def koklar(self) -> tuple[str, ...]:
        """dosyalar/ altında izin verilen ilk klasör adları."""
        return self.temeller + self.ek_klasorler


def _metin(veri: dict[str, object], alan: str, yol: Path) -> str:
    deger = veri.get(alan)
    if not isinstance(deger, str) or not deger.strip():
        raise TarifHatasi(f"{yol}: `{alan}` alanı boş olmayan bir metin olmalı.")
    return deger


def _liste(veri: dict[str, object], alan: str, yol: Path) -> tuple[str, ...]:
    deger = veri.get(alan, [])
    if not isinstance(deger, list) or not all(isinstance(oge, str) and oge for oge in deger):
        raise TarifHatasi(f'{yol}: `{alan}` metin listesi olmalı (ör. ["uygulama", "yz"]).')
    return tuple(str(oge) for oge in deger)


def tarif_oku(klasor: Path) -> Tarif:
    """`klasor/tarif.json`'u okur ve alanlarını denetler."""
    yol = klasor / "tarif.json"
    try:
        veri = json.loads(yol.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as hata:
        raise TarifHatasi(f"{yol} okunamadı: {hata}") from hata
    if not isinstance(veri, dict):
        raise TarifHatasi(f"{yol}: en üstte bir nesne ({{...}}) olmalı.")
    ad = _metin(veri, "ad", yol)
    if ad != klasor.name or not AD_DESENI.match(ad):
        raise TarifHatasi(
            f"{yol}: `ad` klasör adıyla aynı olmalı ve yalnız küçük harf, rakam, tire içermeli."
        )
    temeller = _liste(veri, "temeller", yol)
    if not temeller:
        raise TarifHatasi(f"{yol}: `temeller` en az bir temel içermeli.")
    zorluk = _metin(veri, "zorluk", yol)
    if zorluk not in ZORLUKLAR:
        raise TarifHatasi(f"{yol}: `zorluk` şunlardan biri olmalı: {', '.join(ZORLUKLAR)}.")
    ek = _liste(veri, "ekKlasorler", yol)
    if set(ek) & set(temeller):
        raise TarifHatasi(f"{yol}: `ekKlasorler` bir temel adıyla aynı olamaz.")
    return Tarif(
        ad=ad,
        klasor=klasor,
        baslik=_metin(veri, "baslik", yol),
        ozet=_metin(veri, "ozet", yol),
        temeller=temeller,
        ek_klasorler=ek,
        sure=_metin(veri, "sure", yol),
        zorluk=zorluk,
    )


def tarifleri_bul() -> list[Tarif]:
    """`tarifler/` altındaki bütün tarifler (ada göre sıralı)."""
    return [tarif_oku(yol.parent) for yol in sorted(TARIFLER.glob("*/tarif.json"))]


def tarif_sec(ad: str) -> Tarif:
    """Ada göre tarif; bilinmiyorsa bilinenleri sayan hata."""
    for tarif in tarifleri_bul():
        if tarif.ad == ad.strip("/"):
            return tarif
    bilinen = ", ".join(t.ad for t in tarifleri_bul())
    raise TarifHatasi(f"'{ad}' adında bir tarif yok. Bilinenler: {bilinen}")
