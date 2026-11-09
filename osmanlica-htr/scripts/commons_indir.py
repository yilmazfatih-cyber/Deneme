"""secim.jsonl'deki Commons sayfalarını (en fazla 1920 px genişlikte) indirir, kuyruk_hazirla için liste yazar.

Kullanım: python scripts/commons_indir.py --secim veri/ham/commons/secim/secim.jsonl --cikti veri/ham/commons/sayfalar --adet 130
Çıktı: <cikti>/<n>_<ad>.jpg + <cikti>/liste.jsonl ({"yol","ad","kaynak","lisans","sayfa_url","aciklama"})
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

UA = "OsmanlicaHTR/0.1 (acik kaynak arastirma; github.com/yilmazfatih-cyber/Deneme)"


def indir(url: str, deneme: int = 6) -> bytes:
    for i in range(deneme):
        time.sleep(4.0)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(float(e.headers.get("Retry-After") or 0) or 45 * (i + 1))
                continue
            raise
    raise RuntimeError("indirilemedi: " + url)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secim", required=True)
    ap.add_argument("--cikti", default="veri/ham/commons/sayfalar")
    ap.add_argument("--adet", type=int, default=130)
    a = ap.parse_args()
    cikti = Path(a.cikti)
    cikti.mkdir(parents=True, exist_ok=True)
    liste = cikti / "liste.jsonl"
    mevcut = {json.loads(s)["sayfa_url"] for s in liste.read_text(encoding="utf-8").splitlines() if s.strip()} if liste.exists() else set()
    n = len(mevcut)
    with liste.open("a", encoding="utf-8") as f:
        for satir in Path(a.secim).read_text(encoding="utf-8").splitlines():
            if n >= a.adet:
                break
            k = json.loads(satir)
            if k["sayfa_url"] in mevcut:
                continue
            url = k["url"]
            # 1920 px standart önizleme (orijinal 1920'den genişse) — Wikimedia'nın izin verdiği boyut
            url = re.sub(r"/(\d+)px-", "/1920px-", url) if "px-" in url else url
            uz = ".png" if url.lower().endswith(".png") else ".jpg"
            ad = re.sub(r"[^\w\-]+", "_", k["ad"].rsplit(".", 1)[0])[:70]
            hedef = cikti / f"{k['n']:03d}_{ad}{uz}"
            try:
                if not hedef.exists():
                    hedef.write_bytes(indir(url))
            except Exception as e:  # noqa: BLE001
                print(f"  atlandı {k['n']}: {e}", file=sys.stderr)
                continue
            f.write(json.dumps({"yol": str(hedef), "ad": k["ad"], "kaynak": "commons", "lisans": k.get("lisans", ""), "sayfa_url": k["sayfa_url"], "aciklama": k.get("aciklama", "")}, ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            print(f"{n:3d}. {hedef.name[:60]} ({hedef.stat().st_size // 1024} KB)")
    print(f"{n} sayfa → {liste}")


if __name__ == "__main__":
    main()
