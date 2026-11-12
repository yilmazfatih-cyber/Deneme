"""archive.org öğesinden dosya indirir: metadata API'den sunucu+dizin alınır, dosya doğrudan veri düğümünden çekilir.

Kullanım: python scripts/archive_indir.py <identifier> "<dosya adı>" <hedef klasör>
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "OsmanlicaHTR/0.1 (acik kaynak arastirma)"


def meta(identifier: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(f"https://archive.org/metadata/{identifier}", headers={"User-Agent": UA}), timeout=60) as r:
        return json.loads(r.read())


def indir(identifier: str, dosya: str, hedef_klasor: Path) -> Path:
    m = meta(identifier)
    hedef_klasor.mkdir(parents=True, exist_ok=True)
    hedef = hedef_klasor / dosya
    if hedef.exists() and hedef.stat().st_size > 0:
        return hedef
    son_hata = None
    for sunucu in [m.get("server"), m.get("d1"), m.get("d2")]:
        if not sunucu:
            continue
        url = f"https://{sunucu}{m['dir']}/{urllib.parse.quote(dosya)}"
        for deneme in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=300) as r, open(str(hedef) + ".parca", "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                Path(str(hedef) + ".parca").rename(hedef)
                return hedef
            except Exception as e:  # noqa: BLE001
                son_hata = e
                time.sleep(3 * (deneme + 1))
    raise RuntimeError(f"indirilemedi: {identifier}/{dosya}: {son_hata}")


if __name__ == "__main__":
    print(indir(sys.argv[1], sys.argv[2], Path(sys.argv[3])))
