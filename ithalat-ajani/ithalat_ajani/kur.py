"""Döviz kuru: TCMB günlük bülteni (today.xml), döviz satış kuru.

Gümrük de vergileri TCMB döviz satış kuruyla hesaplar. Sıra: bugünün önbelleği → TCMB → 7 günlük önbellek →
ayarlardaki yedek değer. Kaynak her zaman raporda yazılır.
"""

from __future__ import annotations

import json
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path

TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"
ONBELLEK_GECERLILIK_GUN = 7


class KurHatasi(RuntimeError):
    pass


@dataclass(frozen=True)
class Kur:
    usd_tl: float
    eur_tl: float | None
    bulten_tarihi: str  # TCMB bülten tarihi, GG.AA.YYYY (elle/yedekte boş)
    kaynak: str  # "tcmb" | "onbellek" | "yedek" | "elle"
    alinma: str = ""  # ISO tarih: önbelleğe yazıldığı gün

    def aciklama(self) -> str:
        if self.kaynak == "tcmb":
            return f"TCMB döviz satış, {self.bulten_tarihi}"
        if self.kaynak == "onbellek":
            return f"TCMB döviz satış, {self.bulten_tarihi} (önbellek)"
        if self.kaynak == "elle":
            return "elle girildi"
        return "ayarlardaki yedek değer (TCMB'ye ulaşılamadı)"


def tcmb_ayristir(xml_metni: str) -> Kur:
    try:
        kok = ET.fromstring(xml_metni)
    except ET.ParseError as hata:
        raise KurHatasi(f"TCMB XML okunamadı: {hata}") from None
    degerler: dict[str, float] = {}
    for doviz in kok.findall("Currency"):
        kod = doviz.get("Kod") or doviz.get("CurrencyCode")
        satis = (doviz.findtext("ForexSelling") or "").strip()
        birim = (doviz.findtext("Unit") or "1").strip() or "1"
        if kod in ("USD", "EUR") and satis:
            degerler[kod] = float(satis) / float(birim)
    if "USD" not in degerler:
        raise KurHatasi("TCMB bülteninde USD döviz satış kuru yok")
    return Kur(
        usd_tl=degerler["USD"],
        eur_tl=degerler.get("EUR"),
        bulten_tarihi=kok.get("Tarih", ""),
        kaynak="tcmb",
        alinma=date.today().isoformat(),
    )


def tcmb_cek(zaman_asimi: float = 15.0) -> Kur:
    istek = urllib.request.Request(TCMB_URL, headers={"User-Agent": "ithalat-ajani/0.1"})
    try:
        with urllib.request.urlopen(istek, timeout=zaman_asimi) as yanit:
            return tcmb_ayristir(yanit.read().decode("utf-8"))
    except (OSError, ValueError) as hata:
        raise KurHatasi(f"TCMB'ye ulaşılamadı: {hata}") from None


def _onbellek_oku(yol: Path) -> Kur | None:
    try:
        ham = json.loads(yol.read_text(encoding="utf-8"))
        return Kur(**ham)
    except (OSError, ValueError, TypeError):
        return None


def kur_getir(onbellek: str | Path, yedek_usd_tl: float, yenile: bool = False, bugun: date | None = None) -> Kur:
    bugun = bugun or date.today()
    yol = Path(onbellek)
    eski = _onbellek_oku(yol)
    if eski and not yenile and eski.alinma == bugun.isoformat():
        return Kur(**{**asdict(eski), "kaynak": "onbellek"})
    try:
        kur = tcmb_cek()
    except KurHatasi:
        if eski and eski.alinma:
            yas = (bugun - datetime.fromisoformat(eski.alinma).date()).days
            if yas <= ONBELLEK_GECERLILIK_GUN:
                return Kur(**{**asdict(eski), "kaynak": "onbellek"})
        return Kur(usd_tl=yedek_usd_tl, eur_tl=None, bulten_tarihi="", kaynak="yedek")
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(json.dumps(asdict(kur), ensure_ascii=False), encoding="utf-8")
    return kur


def elle_kur(usd_tl: float) -> Kur:
    if usd_tl <= 0:
        raise KurHatasi("Kur pozitif olmalı")
    return Kur(usd_tl=usd_tl, eur_tl=None, bulten_tarihi="", kaynak="elle")
