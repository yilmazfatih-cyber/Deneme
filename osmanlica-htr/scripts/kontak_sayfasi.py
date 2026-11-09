"""İndirilmiş sayfa görüntülerinden numaralı kontak sayfaları üretir (göz kontrolü için).

Kullanım: python scripts/kontak_sayfasi.py --liste veri/ham/commons/sayfalar/liste.jsonl --cikti veri/ham/commons/kontak
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--liste", required=True)
    ap.add_argument("--cikti", required=True)
    ap.add_argument("--hucre", type=int, default=260)
    ap.add_argument("--sutun", type=int, default=6)
    ap.add_argument("--satir", type=int, default=4)
    a = ap.parse_args()
    cikti = Path(a.cikti)
    cikti.mkdir(parents=True, exist_ok=True)
    kayitlar = [json.loads(s) for s in Path(a.liste).read_text(encoding="utf-8").splitlines() if s.strip()]
    font = ImageFont.load_default()
    per = a.sutun * a.satir
    for k in range(0, len(kayitlar), per):
        grup = kayitlar[k : k + per]
        sayfa = Image.new("RGB", (a.sutun * a.hucre, a.satir * (a.hucre + 16)), "white")
        d = ImageDraw.Draw(sayfa)
        for j, r in enumerate(grup):
            try:
                im = Image.open(r["yol"]).convert("RGB")
            except Exception:  # noqa: BLE001
                continue
            im.thumbnail((a.hucre - 6, a.hucre - 6))
            x, y = (j % a.sutun) * a.hucre + 3, (j // a.sutun) * (a.hucre + 16) + 3
            sayfa.paste(im, (x, y))
            d.rectangle((x, y + a.hucre - 6, x + 34, y + a.hucre + 8), fill="black")
            d.text((x + 3, y + a.hucre - 4), str(k + j), fill="white", font=font)
        sayfa.save(cikti / f"kontak_{k // per + 1:02d}.jpg", quality=82)
    print(f"{len(kayitlar)} sayfa, {(len(kayitlar) + per - 1) // per} kontak → {cikti}")


if __name__ == "__main__":
    main()
