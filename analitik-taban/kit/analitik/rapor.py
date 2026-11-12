"""Rapor dosyası (yerel/raporlar/) ve olay günlüğü (yerel/notlar.md) yardımcıları.

Betik tabloyu dosyaya kendisi yazar; model yalnız `## Yorum` bölümünü doldurur — tablo iki kez üretilmez.
"""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path
from typing import List

from .ayarlar import Ayarlar, goreli

YORUM_YERI = "<!-- Claude: en fazla 5 madde; sayıyla, olası neden ve bir sonraki adım. -->"


def _kisa_ad(metin: str) -> str:
    tablo = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    metin = metin.translate(tablo).lower()
    return re.sub(r"[^a-z0-9]+", "-", metin).strip("-")[:50] or "rapor"


def yaz(ayar: Ayarlar, konu: str, baslik: str, govde: str) -> Path:
    klasor = ayar.alt_dizin("raporlar")
    tarih = ayar.bugun().isoformat()
    yol = klasor / f"{tarih}-{_kisa_ad(konu)}.md"
    sira = 1
    while yol.exists():
        sira += 1
        yol = klasor / f"{tarih}-{_kisa_ad(konu)}-{sira}.md"
    yol.write_text(f"# {baslik}\n\n{govde.strip()}\n\n## Yorum\n\n{YORUM_YERI}\n", encoding="utf-8")
    return yol


_SATIR = re.compile(r"^\s*[-*]?\s*(\d{4}-\d{2}-\d{2})\s*[:–-]\s*(.+?)\s*$")


def gunluk_notlari(ayar: Ayarlar, bas: dt.date, bit: dt.date) -> List[str]:
    """yerel/notlar.md içinden [bas, bit] aralığındaki 'YYYY-AA-GG: açıklama' satırları."""
    dosya: Path = ayar.dizin / "notlar.md"
    if not dosya.exists():
        return []
    sonuc = []
    for satir in dosya.read_text(encoding="utf-8").splitlines():
        eslesme = _SATIR.match(satir)
        if not eslesme:
            continue
        try:
            gun = dt.date.fromisoformat(eslesme.group(1))
        except ValueError:
            continue
        if bas <= gun <= bit:
            sonuc.append(f"{gun.isoformat()}: {eslesme.group(2)}")
    return sonuc


def alt_bilgi(ham: Path = None, rapor_yolu: Path = None) -> str:
    parcalar = []
    if ham:
        parcalar.append(f"Ham: {goreli(ham)}")
    if rapor_yolu:
        parcalar.append(f"Rapor: {goreli(rapor_yolu)} (yalnız ## Yorum bölümünü doldurun)")
    return " · ".join(parcalar)
