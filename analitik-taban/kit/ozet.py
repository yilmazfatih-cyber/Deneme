#!/usr/bin/env python3
"""Herhangi bir CSV/XLSX dışa aktarımının kısa özeti (Mixpanel raporu, Hotjar listesi, başka araçlar).

  python3 kit/ozet.py yerel/girdi/dosya.csv [--limit 8] [--grup SUTUN] [--filtre 'Ülke=TR'] [--rapor]

Tarihlerin sütun olduğu geniş tablolar (Mixpanel "Export CSV"), uzun tablolar, ısı haritası tıklama CSV'leri
otomatik tanınır. Model dosyayı okumaz; yalnız bu özeti görür.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analitik import ayarlar as A  # noqa: E402
from analitik import (  # noqa: E402
    boru_kapandi,
    csvoku,
    ozetle,
    rapor,
    utf8_cikti,
)


def main(argv=None) -> int:
    utf8_cikti()
    ap = argparse.ArgumentParser(
        prog="ozet.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("dosya")
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--grup")
    ap.add_argument("--filtre", action="append", default=[])
    ap.add_argument("--rapor", action="store_true")
    arg = ap.parse_args(argv)
    try:
        yol = Path(arg.dosya)
        if not yol.exists() and (A.yerel_dizin() / "girdi" / arg.dosya).exists():
            yol = A.yerel_dizin() / "girdi" / arg.dosya
        basliklar, satirlar = csvoku.oku(yol)
        satirlar = ozetle.devam_satirlarini_birlestir(basliklar, satirlar)
        toplam = len(satirlar)
        satirlar = ozetle.satir_filtrele(basliklar, satirlar, arg.filtre)
        govde = ozetle.csv_ozet(basliklar, satirlar, yol.name, limit=arg.limit, grup=arg.grup)
        if arg.filtre:
            govde += f"\nFiltre: {' ve '.join(arg.filtre)} ({len(satirlar)}/{toplam} satır)"
        print(govde)
        if arg.rapor:
            yol_r = rapor.yaz(A.yukle(), f"ozet-{yol.stem}", f"Özet: {yol.name}", govde)
            print(rapor.alt_bilgi(rapor_yolu=yol_r))
    except BrokenPipeError:
        return boru_kapandi()
    except (FileNotFoundError, KeyError, ValueError, A.AyarHatasi) as hata:
        print(f"HATA: {hata}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
